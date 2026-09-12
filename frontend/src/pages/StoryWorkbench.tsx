import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, GitBranch, Plus, RefreshCw, Sparkles, X, Save, Play } from 'lucide-react'
import { ModelsApi, StoryApi, withFileToken } from '../api'
import type { Model, StoryBeat, StoryProject } from '../types'

const emptyBeat: StoryBeat = { id: 'beat-1', kind: 'image', prompt: '输入这一镜头的动作与画面', references: [] }

export default function StoryWorkbench() {
  const [projects, setProjects] = useState<StoryProject[]>([])
  const [project, setProject] = useState<StoryProject | null>(null)
  const [selected, setSelected] = useState<{ sceneId: string; beatId: string } | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [bibleDraft, setBibleDraft] = useState({ characters: '', locations: '', props: '', wardrobe: '', style: '', rules: '' })
  const [assistIdea, setAssistIdea] = useState('')
  const [assistBusy, setAssistBusy] = useState(false)
  const [assistResult, setAssistResult] = useState<any>(null)
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedKind, setSelectedKind] = useState<StoryBeat['kind']>('image')
  const [promptDraft, setPromptDraft] = useState('')
  const scene = useMemo(() => project?.scenes.find(s => s.id === selected?.sceneId) || project?.scenes[0], [project, selected])
  // Some early projects were saved with an empty beat list. Keep the editor usable
  // by presenting a real draft beat and materializing it on first save/generation.
  const beat = scene?.beats.find(b => b.id === selected?.beatId) || scene?.beats[0] || (scene ? emptyBeat : undefined)

  const supportsBeat = (model: Model, kind?: StoryBeat['kind']) => {
    if (!kind) return false
    const caps = model.capabilities || {}
    return Boolean(caps[kind] || (kind === 'novel' && (caps.chat || model.provider === 'zhipu-paid')))
  }
  const availableModels = useMemo(() => models.filter(model => supportsBeat(model, selectedKind)), [models, selectedKind])
  const selectedModelInfo = useMemo(() => {
    if (!selectedModel) return undefined
    const [provider, ...idParts] = selectedModel.split('::')
    const id = idParts.join('::')
    return provider && id ? { provider, id } : undefined
  }, [selectedModel])
  const selectedModelLabel = availableModels.find(model => `${model.provider}::${model.id}` === selectedModel)?.name || selectedModelInfo?.id
  const setGenerationKind = (kind: StoryBeat['kind']) => { setSelectedKind(kind); setSelectedModel('') }

  useEffect(() => {
    if (selectedModel && !availableModels.some(model => `${model.provider}::${model.id}` === selectedModel)) setSelectedModel('')
  }, [availableModels, selectedModel])

  useEffect(() => {
    if (beat) {
      setSelectedKind(beat.kind)
      setPromptDraft(beat.prompt || '')
    }
  }, [beat?.id, beat?.kind, beat?.prompt])

  const load = async () => {
    setBusy(true); setError('')
    try {
      const r = await StoryApi.listProjects()
      setProjects(r.projects)
      const first = r.projects[0]
      if (first) { setProject(first); hydrateBible(first); const s = first.scenes[0]; const b = s?.beats[0]; if (s && b) setSelected({ sceneId: s.id, beatId: b.id }) }
    } catch (e: any) { setError(e?.message || '连续创作项目加载失败') } finally { setBusy(false) }
  }

  const hydrateBible = (p: StoryProject) => setBibleDraft({
    characters: (p.bible.characters || []).map(x => x.name || x.text || '').join('\n'),
    locations: (p.bible.locations || []).map(x => x.name || x.text || '').join('\n'),
    props: (p.bible.props || []).map(x => x.name || x.text || '').join('\n'),
    wardrobe: (p.bible.wardrobe || []).map(x => x.name || x.text || '').join('\n'),
    style: Object.values(p.bible.style || {}).join('，'),
    rules: (p.bible.rules || []).map(x => x.text || x.name || '').join('\n'),
  })
  useEffect(() => {
    void load()
    void ModelsApi.list().then(r => setModels(r.models || [])).catch(() => setModels([]))
  }, [])

  const create = async () => {
    if (!title.trim() || busy) return
    setBusy(true); setError('')
    try {
      const r = await StoryApi.createProject({ title: title.trim() })
      const seeded: StoryProject = { ...r.project, scenes: [{ id: 'scene-1', index: 1, title: '第一幕', summary: '', beats: [{ ...emptyBeat }], outputs: [] }] }
      const saved = await StoryApi.patchProject(seeded.id, { scenes: seeded.scenes })
      setProjects([saved.project, ...projects]); setProject(saved.project); setSelected({ sceneId: 'scene-1', beatId: 'beat-1' }); setTitle('')
    } catch (e: any) { setError(e?.message || '创建项目失败') } finally { setBusy(false) }
  }

  const choose = (p: StoryProject) => {
    setProject(p); hydrateBible(p); const s = p.scenes[0]; const b = s?.beats[0]; if (s && b) setSelected({ sceneId: s.id, beatId: b.id })
  }

  const saveBible = async () => {
    if (!project || busy) return
    setBusy(true); setError('')
    try {
      const lineEntries = (value: string, prefix: string) => value.split('\n').map(text => text.trim()).filter(Boolean).map((text, i) => ({ id: `${prefix}-${i + 1}`, name: text, text }))
      const r = await StoryApi.patchProject(project.id, { bible: { characters: lineEntries(bibleDraft.characters, 'character'), locations: lineEntries(bibleDraft.locations, 'location'), props: lineEntries(bibleDraft.props, 'prop'), wardrobe: lineEntries(bibleDraft.wardrobe, 'wardrobe'), style: bibleDraft.style ? { visual: bibleDraft.style } : {}, rules: lineEntries(bibleDraft.rules, 'rule') } })
      setProject(r.project); setProjects(items => items.map(p => p.id === r.project.id ? r.project : p))
    } catch (e: any) { setError(e?.message || '保存故事圣经失败') } finally { setBusy(false) }
  }

  const assist = async () => {
    if (!project || !assistIdea.trim() || assistBusy) return
    setAssistBusy(true); setError('')
    try {
      const assistModel = selectedModelInfo && selectedModelInfo.id && models.find(model => model.provider === selectedModelInfo.provider && model.id === selectedModelInfo.id && model.capabilities?.chat)
        ? selectedModelInfo
        : undefined
      const r = await StoryApi.assist(project.id, assistIdea.trim(), assistModel)
      setAssistResult(r.assist)
    }
    catch (e: any) { setError(e?.message || '智能填充失败') } finally { setAssistBusy(false) }
  }

  const applyAssist = async () => {
    if (!assistResult) return
    const lines = (items: any[]) => (items || []).map(x => x.name || x.text || '').filter(Boolean).join('\n')
    setBibleDraft({ characters: lines(assistResult.characters), locations: lines(assistResult.locations), props: lines(assistResult.props), wardrobe: lines(assistResult.wardrobe), style: Object.values(assistResult.style || {}).join('，'), rules: lines(assistResult.rules) })
    if (!project || !scene || !beat) return
    const nextKind = ['novel', 'image', 'video'].includes(assistResult.beat?.kind) ? assistResult.beat.kind as StoryBeat['kind'] : beat.kind
    const nextPrompt = String(assistResult.beat?.prompt || '').trim() || beat.prompt
    const scenes = project.scenes.map(item => item.id !== scene.id ? item : {
      ...item,
      title: String(assistResult.scene?.title || item.title),
      summary: String(assistResult.scene?.summary || item.summary || ''),
      beats: item.beats.map(itemBeat => itemBeat.id === beat.id ? { ...itemBeat, kind: nextKind, prompt: nextPrompt } : itemBeat)
    })
    try {
      const r = await StoryApi.patchProject(project.id, { scenes })
      setProject(r.project)
      setProjects(items => items.map(item => item.id === r.project.id ? r.project : item))
      setSelectedKind(nextKind)
      setPromptDraft(nextPrompt)
    } catch (e: any) { setError(e?.message || '采用智能填充草稿失败') }
  }

  const persistBeat = async (kind = selectedKind, prompt = promptDraft) => {
    if (!project || !scene || !beat) return project
    const exists = scene.beats.some(itemBeat => itemBeat.id === beat.id)
    if (exists && kind === beat.kind && prompt.trim() === beat.prompt) return project
    const scenes = project.scenes.map(item => item.id !== scene.id ? item : {
      ...item,
      beats: exists
        ? item.beats.map(itemBeat => itemBeat.id === beat.id ? { ...itemBeat, kind, prompt: prompt.trim() || '请输入这一镜头的动作与画面' } : itemBeat)
        : [...item.beats, { ...emptyBeat, kind, prompt: prompt.trim() || '请输入这一镜头的动作与画面' }]
    })
    const r = await StoryApi.patchProject(project.id, { scenes })
    setProject(r.project)
    setProjects(items => items.map(item => item.id === r.project.id ? r.project : item))
    return r.project
  }

  const preview = async () => {
    if (!project || !scene || !beat || busy) return
    setBusy(true); setError('')
    try {
      const current = await persistBeat()
      const r = await StoryApi.previewRun(current.id, { sceneId: scene.id, beatId: beat.id, kind: selectedKind, model: selectedModelInfo || { provider: 'auto', id: 'auto' } })
      setProject(r.project); setProjects(items => items.map(p => p.id === r.project.id ? r.project : p))
    } catch (e: any) { setError(e?.message || '预览编排失败') } finally { setBusy(false) }
  }

  const run = async () => {
    if (!project || !scene || !beat || busy) return
    setBusy(true); setError('')
    try {
      const current = await persistBeat()
      const r = await StoryApi.run(current.id, { sceneId: scene.id, beatId: beat.id, kind: selectedKind, ...(selectedModelInfo ? { model: selectedModelInfo } : {}) })
      setProject(r.project); setProjects(items => items.map(p => p.id === r.project.id ? r.project : p))
    } catch (e: any) { setError(e?.message || '生成失败') } finally { setBusy(false) }
  }

  const continueFromBeat = async () => {
    if (!project || !scene || !beat || busy) return
    setBusy(true); setError('')
    try {
      const current = await persistBeat()
      const currentScene = current?.scenes.find(item => item.id === scene.id) || scene
      const currentBeat = currentScene.beats.find(item => item.id === beat.id) || beat
      const nextBeat: StoryBeat = {
        id: `beat-${Date.now()}`,
        kind: selectedKind,
        prompt: '承接上一镜头，保持角色、服装、场景与光线一致；补充这一镜头的新动作、构图与镜头运动。',
        inheritFromBeatId: currentBeat.id,
        references: currentBeat.references || [],
      }
      const scenes = current.scenes.map(item => item.id === currentScene.id ? { ...item, beats: [...item.beats, nextBeat] } : item)
      const r = await StoryApi.patchProject(current.id, { scenes })
      setProject(r.project); setProjects(items => items.map(item => item.id === r.project.id ? r.project : item))
      setSelected({ sceneId: currentScene.id, beatId: nextBeat.id }); setDrawerOpen(true)
      setPromptDraft(nextBeat.prompt)
    } catch (e: any) { setError(e?.message || '创建继承镜头失败') } finally { setBusy(false) }
  }

  const activeOutputRun = scene?.outputs?.slice().reverse().find(output => output.beatId === beat?.id && output.outputAssets?.length) || scene?.outputs?.slice(-1)[0]
  const outputPreview = activeOutputRun?.outputAssets?.map(asset => {
    const src = withFileToken(String((asset as any).url || ''))
    if (asset.type === 'image' && src) return <img key={asset.id} src={src} alt="生成结果" className="max-h-96 w-full rounded-pi-md object-contain bg-black/20 ring-1 ring-pi-border-soft/50" />
    if (asset.type === 'video' && src) return <video key={asset.id} src={src} controls preload="metadata" className="max-h-96 w-full rounded-pi-md bg-black/30 ring-1 ring-pi-border-soft/50" />
    if (asset.type === 'text') return <pre key={asset.id} className="max-h-96 overflow-auto whitespace-pre-wrap rounded-pi-md bg-pi-bg2/60 p-3 text-xs leading-relaxed text-pi-text">{(asset as any).text || '暂无正文'}</pre>
    return <div key={asset.id} className="rounded-pi-md border border-pi-border-soft p-2 text-[11px] text-pi-dim break-all">{asset.type} · {(asset as any).url || '暂无可预览地址'}</div>
  })

  return <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div><div className="text-[11px] uppercase tracking-[0.18em] text-pi-accent mb-1">Story Orchestration</div><h1 className="text-xl font-semibold text-pi-text">连续创作</h1><p className="text-xs text-pi-dim mt-1">小说、图片、视频共享同一份故事状态</p></div>
      <button className="btn-ghost text-xs min-h-10 px-3 inline-flex items-center gap-1.5" onClick={load} disabled={busy}><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />刷新项目</button>
    </div>
    {error && <div className="panel !p-3 text-xs text-red-300">{error}</div>}
    {beat && <section className="panel !p-4 grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)_220px] gap-3 items-end" aria-label="镜头生成设置"><div><div className="text-[11px] text-pi-dim2 mb-1.5">输出类型</div><select aria-label="选择输出类型" className="input-pi w-full min-h-11 text-xs" value={selectedKind} onChange={e => setGenerationKind(e.target.value as StoryBeat['kind'])}><option value="image">图片</option><option value="video">视频</option><option value="novel">小说</option></select></div><div><div className="text-[11px] text-pi-dim2 mb-1.5">镜头要求</div><textarea aria-label="镜头要求" className="input-pi min-h-11 max-h-28 w-full resize-y text-xs leading-relaxed" value={promptDraft} onChange={e => setPromptDraft(e.target.value)} placeholder="写清楚动作、构图、镜头运动和连续性要求" /></div><div className="text-[11px] text-pi-dim leading-relaxed">生成时会合并故事圣经、继承镜头、参考资产与当前要求。视频请先选择“视频”。</div></section>}
    <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(320px,1fr)_320px] gap-4 items-start">
      <aside className="panel !p-3 space-y-3"><div className="flex items-center justify-between"><span className="text-xs font-medium">故事项目</span><Sparkles className="w-4 h-4 text-pi-accent" /></div><div className="space-y-1.5">{projects.map(p => <button key={p.id} onClick={() => choose(p)} className={`w-full text-left rounded-pi-md px-3 py-2 text-xs transition-colors ${project?.id === p.id ? 'bg-pi-accent/15 text-pi-text border border-pi-accent/40' : 'text-pi-dim hover:bg-pi-bg3'}`}>{p.title}</button>)}</div><div className="pt-2 border-t border-pi-border-soft space-y-2"><input className="input-pi text-xs min-h-10" placeholder="新故事名称" value={title} onChange={e => setTitle(e.target.value)} /><button className="btn-primary w-full min-h-10 text-xs inline-flex items-center justify-center gap-1" onClick={create} disabled={!title.trim() || busy}><Plus className="w-3.5 h-3.5" />新建项目</button></div>{project && <><div className="pt-2 border-t border-pi-border-soft space-y-2"><div className="text-[11px] text-pi-dim2">AI 智能填充 · 人类确认后保存</div><textarea className="input-pi text-xs min-h-16 resize-y" placeholder="描述你想补充的故事，例如：一场发生在雾海列车上的追逐" value={assistIdea} onChange={e => setAssistIdea(e.target.value)} /><button className="btn-ghost w-full min-h-9 text-xs" onClick={assist} disabled={!assistIdea.trim() || assistBusy}>{assistBusy ? 'AI 正在整理…' : '生成设定草稿'}</button>{assistResult && <div className="rounded-pi-md border border-pi-accent/30 bg-pi-accent/5 p-2 space-y-2 text-[11px]"><div className="text-pi-text">AI 草稿已生成，可先修改再保存</div>{assistResult.scene?.title && <div className="text-pi-dim">首场景：{assistResult.scene.title} · {assistResult.scene.summary}</div>}{assistResult.beat?.prompt && <div className="text-pi-dim">首镜头：{assistResult.beat.prompt}</div>}<button className="btn-primary w-full min-h-8 text-[11px]" onClick={applyAssist}>采用到编辑区</button></div>}</div><div className="pt-2 border-t border-pi-border-soft space-y-2"><div className="text-[11px] text-pi-dim2">Story Bible · 可编辑设定</div>{([['characters','角色'],['locations','场景'],['props','道具'],['wardrobe','服装'],['rules','连续性规则']] as const).map(([key, label]) => <textarea key={key} className="input-pi text-xs min-h-12 resize-y" placeholder={`${label}（每行一项）`} value={bibleDraft[key]} onChange={e => setBibleDraft(v => ({ ...v, [key]: e.target.value }))} />)}<textarea className="input-pi text-xs min-h-12 resize-y" placeholder="风格" value={bibleDraft.style} onChange={e => setBibleDraft(v => ({ ...v, style: e.target.value }))} /><button className="btn-ghost w-full min-h-9 text-xs inline-flex items-center justify-center gap-1" onClick={saveBible} disabled={busy}><Save className="w-3.5 h-3.5" />保存设定</button></div></>}</aside>
      <main className="panel !p-5 min-w-0 bg-pi-bg2/20"><div className="flex items-center justify-between mb-4"><div><div className="text-sm font-medium">{project?.title || '选择一个故事项目'}</div><div className="text-[11px] text-pi-dim mt-0.5">分镜时间线 · 点击镜头打开设置</div></div><span className="rounded-full border border-pi-border-soft px-2.5 py-1 text-[10px] text-pi-dim2">{project?.scenes.length || 0} 个场景</span></div>{project?.scenes.length ? <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{project.scenes.flatMap(s => (s.beats.length ? s.beats : [emptyBeat]).map(b => ({ s, b }))).map(({ s, b }, i) => <button key={`${s.id}-${b.id}-${i}`} onClick={() => { setSelected({ sceneId: s.id, beatId: b.id }); setDrawerOpen(true) }} className={`min-h-[158px] text-left rounded-pi-md border p-4 transition-all ${selected?.beatId === b.id ? 'border-pi-accent bg-pi-accent/10 shadow-lg shadow-pi-accent/5' : 'border-pi-border-soft bg-pi-bg2/40 hover:border-pi-accent/40 hover:-translate-y-0.5'}`}><div className="flex items-center justify-between text-[10px] text-pi-dim2"><span>{s.title || `场景 ${s.index}`} · 镜头 {s.index}.{i + 1}</span><span className="rounded-full bg-pi-bg3 px-2 py-1">{b.kind === 'novel' ? '小说' : b.kind === 'image' ? '图片' : '视频'}</span></div><div className="text-sm text-pi-text mt-5 line-clamp-3 leading-relaxed">{b.prompt}</div><div className="mt-4 flex items-center gap-2 text-[10px] text-pi-dim2"><GitBranch className="w-3 h-3 text-pi-accent" />{b.inheritFromBeatId ? '承接上一镜头' : '独立起点'}</div><div className="mt-3 h-1 rounded-full bg-pi-bg3"><div className="h-full w-1/2 rounded-full bg-pi-accent" /></div></button>)}</div> : <div className="py-12 sm:py-16 text-center"><div className="text-sm font-medium text-pi-text">还没有故事项目</div><p className="mt-2 text-xs text-pi-dim">先命名一个故事，元枢会为你搭好第一幕和第一个镜头。</p><div className="mx-auto mt-4 flex max-w-sm gap-2"><input className="input-pi min-h-11 flex-1 text-xs" placeholder="例如：雾海列车" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void create() }} /><button className="btn-primary min-h-11 shrink-0 px-4 text-xs" onClick={create} disabled={!title.trim() || busy}>开始第一个故事</button></div></div>}</main>
      <aside className={`${drawerOpen ? 'fixed inset-x-3 bottom-20 z-30 shadow-2xl' : 'hidden'} md:block md:static panel !p-4 space-y-4`}><div className="flex items-center justify-between"><div><div className="text-sm font-medium">节点侧栏</div><div className="text-[11px] text-pi-dim mt-0.5">当前镜头的继承链与参数</div></div><button className="md:hidden text-pi-dim" onClick={() => setDrawerOpen(false)} aria-label="关闭"><X className="w-4 h-4" /></button></div>{beat ? <><div className="space-y-2"><div className="flex items-center justify-between"><div className="text-[11px] text-pi-dim2">模型</div><span className="text-[10px] text-pi-dim2">{selectedKind === 'novel' ? '文本' : selectedKind === 'image' ? '图片' : '视频'}</span></div><select aria-label="选择模型" className="input-pi w-full min-h-11 text-xs" value={selectedModel} onChange={e => setSelectedModel(e.target.value)}><option value="">自动选择模型</option>{availableModels.map(model => <option key={`${model.provider}::${model.id}`} value={`${model.provider}::${model.id}`}>{model.name || model.id}</option>)}</select><div className="text-[11px] text-pi-dim">{selectedModelLabel ? `已指定：${selectedModelLabel}` : '元枢会按当前镜头能力自动路由'}</div>{availableModels.length === 0 && <div className="text-[11px] text-amber-300">暂未发现匹配模型，将使用自动路由</div>}</div><div className="space-y-2"><div className="text-[11px] text-pi-dim2">继承输入</div><div className="rounded-pi-md border border-pi-border-soft p-3 text-xs flex items-center gap-2"><GitBranch className="w-3.5 h-3.5 text-pi-accent" />{beat.inheritFromBeatId || '本镜头起点'}</div></div><div className="space-y-2"><div className="text-[11px] text-pi-dim2">提示词</div><div className="rounded-pi-md bg-pi-bg2/60 p-3 text-xs text-pi-text leading-relaxed">{beat.prompt}</div></div><div className="space-y-2"><div className="flex items-center justify-between"><div className="text-[11px] text-pi-dim2">生成预览</div><span className="text-[10px] text-pi-dim2">{scene?.outputs?.length || 0} 个运行记录</span></div>{activeOutputRun?.status === 'failed' && <div className="rounded-pi-md border border-red-400/30 bg-red-400/5 p-2 text-[11px] text-red-200">{activeOutputRun.degradation?.join('；') || '本次生成失败'}</div>}{outputPreview?.length ? <div className="space-y-2">{outputPreview}</div> : <div className="rounded-pi-md border border-dashed border-pi-border-soft p-4 text-center text-[11px] text-pi-dim">生成完成后，图片、视频或正文会显示在这里</div>}</div><div className="grid grid-cols-1 gap-2"><button className="btn-primary min-h-10 text-xs inline-flex items-center justify-center gap-1.5" onClick={run} disabled={busy}><Play className="w-3.5 h-3.5" />生成当前镜头</button><button className="btn-ghost min-h-10 text-xs inline-flex items-center justify-center gap-1.5" onClick={preview} disabled={busy}><ChevronRight className="w-3.5 h-3.5" />预览编排</button><button className="btn-ghost min-h-10 text-xs" onClick={continueFromBeat} disabled={busy}>从此处继续</button><button className="btn-ghost min-h-10 text-xs" onClick={run} disabled={busy}>重跑当前镜头 · 版本对比</button></div></> : <div className="text-xs text-pi-dim py-10 text-center">选择一个镜头查看节点</div>}</aside>
    </div>
  </div>
}
