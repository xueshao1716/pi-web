import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, GitBranch, Plus, RefreshCw, Sparkles, X, Save, Play } from 'lucide-react'
import { StoryApi } from '../api'
import type { StoryBeat, StoryProject } from '../types'

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
  const scene = useMemo(() => project?.scenes.find(s => s.id === selected?.sceneId) || project?.scenes[0], [project, selected])
  const beat = scene?.beats.find(b => b.id === selected?.beatId) || scene?.beats[0]

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
  useEffect(() => { load() }, [])

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
    try { const r = await StoryApi.assist(project.id, assistIdea.trim()); setAssistResult(r.assist) }
    catch (e: any) { setError(e?.message || '智能填充失败') } finally { setAssistBusy(false) }
  }

  const applyAssist = () => {
    if (!assistResult) return
    const lines = (items: any[]) => (items || []).map(x => x.name || x.text || '').filter(Boolean).join('\n')
    setBibleDraft({ characters: lines(assistResult.characters), locations: lines(assistResult.locations), props: lines(assistResult.props), wardrobe: lines(assistResult.wardrobe), style: Object.values(assistResult.style || {}).join('，'), rules: lines(assistResult.rules) })
  }

  const preview = async () => {
    if (!project || !scene || !beat || busy) return
    setBusy(true); setError('')
    try {
      const r = await StoryApi.previewRun(project.id, { sceneId: scene.id, beatId: beat.id, kind: beat.kind, model: { provider: 'auto', id: 'auto' } })
      setProject(r.project); setProjects(items => items.map(p => p.id === r.project.id ? r.project : p))
    } catch (e: any) { setError(e?.message || '预览编排失败') } finally { setBusy(false) }
  }

  const run = async () => {
    if (!project || !scene || !beat || busy) return
    setBusy(true); setError('')
    try {
      const r = await StoryApi.run(project.id, { sceneId: scene.id, beatId: beat.id, kind: beat.kind })
      setProject(r.project); setProjects(items => items.map(p => p.id === r.project.id ? r.project : p))
    } catch (e: any) { setError(e?.message || '生成失败') } finally { setBusy(false) }
  }

  return <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div><div className="text-[11px] uppercase tracking-[0.18em] text-pi-accent mb-1">Story Orchestration</div><h1 className="text-xl font-semibold text-pi-text">连续创作</h1><p className="text-xs text-pi-dim mt-1">小说、图片、视频共享同一份故事状态</p></div>
      <button className="btn-ghost text-xs min-h-10 px-3 inline-flex items-center gap-1.5" onClick={load} disabled={busy}><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />刷新项目</button>
    </div>
    {error && <div className="panel !p-3 text-xs text-red-300">{error}</div>}
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_320px] gap-4 items-start">
      <aside className="panel !p-3 space-y-3"><div className="flex items-center justify-between"><span className="text-xs font-medium">故事项目</span><Sparkles className="w-4 h-4 text-pi-accent" /></div><div className="space-y-1.5">{projects.map(p => <button key={p.id} onClick={() => choose(p)} className={`w-full text-left rounded-pi-md px-3 py-2 text-xs transition-colors ${project?.id === p.id ? 'bg-pi-accent/15 text-pi-text border border-pi-accent/40' : 'text-pi-dim hover:bg-pi-bg3'}`}>{p.title}</button>)}</div><div className="pt-2 border-t border-pi-border-soft space-y-2"><input className="input-pi text-xs min-h-10" placeholder="新故事名称" value={title} onChange={e => setTitle(e.target.value)} /><button className="btn-primary w-full min-h-10 text-xs inline-flex items-center justify-center gap-1" onClick={create} disabled={!title.trim() || busy}><Plus className="w-3.5 h-3.5" />新建项目</button></div>{project && <><div className="pt-2 border-t border-pi-border-soft space-y-2"><div className="text-[11px] text-pi-dim2">AI 智能填充 · 人类确认后保存</div><textarea className="input-pi text-xs min-h-16 resize-y" placeholder="描述你想补充的故事，例如：一场发生在雾海列车上的追逐" value={assistIdea} onChange={e => setAssistIdea(e.target.value)} /><button className="btn-ghost w-full min-h-9 text-xs" onClick={assist} disabled={!assistIdea.trim() || assistBusy}>{assistBusy ? 'AI 正在整理…' : '生成设定草稿'}</button>{assistResult && <div className="rounded-pi-md border border-pi-accent/30 bg-pi-accent/5 p-2 space-y-2 text-[11px]"><div className="text-pi-text">AI 草稿已生成，可先修改再保存</div>{assistResult.scene?.title && <div className="text-pi-dim">首场景：{assistResult.scene.title} · {assistResult.scene.summary}</div>}{assistResult.beat?.prompt && <div className="text-pi-dim">首镜头：{assistResult.beat.prompt}</div>}<button className="btn-primary w-full min-h-8 text-[11px]" onClick={applyAssist}>采用到编辑区</button></div>}</div><div className="pt-2 border-t border-pi-border-soft space-y-2"><div className="text-[11px] text-pi-dim2">Story Bible · 可编辑设定</div>{([['characters','角色'],['locations','场景'],['props','道具'],['wardrobe','服装'],['rules','连续性规则']] as const).map(([key, label]) => <textarea key={key} className="input-pi text-xs min-h-12 resize-y" placeholder={`${label}（每行一项）`} value={bibleDraft[key]} onChange={e => setBibleDraft(v => ({ ...v, [key]: e.target.value }))} />)}<textarea className="input-pi text-xs min-h-12 resize-y" placeholder="风格" value={bibleDraft.style} onChange={e => setBibleDraft(v => ({ ...v, style: e.target.value }))} /><button className="btn-ghost w-full min-h-9 text-xs inline-flex items-center justify-center gap-1" onClick={saveBible} disabled={busy}><Save className="w-3.5 h-3.5" />保存设定</button></div></>}</aside>
      <main className="panel !p-4 min-w-0"><div className="flex items-center justify-between mb-3"><div><div className="text-sm font-medium">{project?.title || '选择一个故事项目'}</div><div className="text-[11px] text-pi-dim mt-0.5">分镜时间线</div></div><span className="text-[11px] text-pi-dim2">{project?.scenes.length || 0} 个场景</span></div>{project?.scenes.length ? <div className="flex gap-3 overflow-x-auto pb-2">{project.scenes.flatMap(s => (s.beats.length ? s.beats : [emptyBeat]).map(b => ({ s, b }))).map(({ s, b }, i) => <button key={`${s.id}-${b.id}-${i}`} onClick={() => { setSelected({ sceneId: s.id, beatId: b.id }); setDrawerOpen(true) }} className={`min-w-[180px] text-left rounded-pi-md border p-3 transition-colors ${selected?.beatId === b.id ? 'border-pi-accent bg-pi-accent/10' : 'border-pi-border-soft bg-pi-bg2/40 hover:border-pi-accent/40'}`}><div className="flex items-center justify-between text-[10px] text-pi-dim2"><span>镜头 {s.index}.{i + 1}</span><span>{b.kind}</span></div><div className="text-xs text-pi-text mt-4 line-clamp-2">{b.prompt}</div><div className="mt-4 h-1 rounded-full bg-pi-bg3"><div className="h-full w-1/2 rounded-full bg-pi-accent" /></div></button>)}</div> : <div className="py-12 sm:py-16 text-center"><div className="text-sm font-medium text-pi-text">还没有故事项目</div><p className="mt-2 text-xs text-pi-dim">先命名一个故事，元枢会为你搭好第一幕和第一个镜头。</p><div className="mx-auto mt-4 flex max-w-sm gap-2"><input className="input-pi min-h-11 flex-1 text-xs" placeholder="例如：雾海列车" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void create() }} /><button className="btn-primary min-h-11 shrink-0 px-4 text-xs" onClick={create} disabled={!title.trim() || busy}>开始第一个故事</button></div></div>}</main>
      <aside className={`${drawerOpen ? 'fixed inset-x-3 bottom-20 z-30 shadow-2xl' : 'hidden'} lg:block lg:static panel !p-4 space-y-4`}><div className="flex items-center justify-between"><div><div className="text-sm font-medium">节点侧栏</div><div className="text-[11px] text-pi-dim mt-0.5">当前镜头的继承链与参数</div></div><button className="lg:hidden text-pi-dim" onClick={() => setDrawerOpen(false)} aria-label="关闭"><X className="w-4 h-4" /></button></div>{beat ? <><div className="space-y-2"><div className="text-[11px] text-pi-dim2">继承输入</div><div className="rounded-pi-md border border-pi-border-soft p-3 text-xs flex items-center gap-2"><GitBranch className="w-3.5 h-3.5 text-pi-accent" />{beat.inheritFromBeatId || '本镜头起点'}</div></div><div className="space-y-2"><div className="text-[11px] text-pi-dim2">提示词</div><div className="rounded-pi-md bg-pi-bg2/60 p-3 text-xs text-pi-text leading-relaxed">{beat.prompt}</div></div><div className="space-y-2"><div className="text-[11px] text-pi-dim2">输出与版本</div><div className="text-xs text-pi-dim">{scene?.outputs?.length || 0} 个运行记录</div>{scene?.outputs?.slice(-1).map(o => <div key={o.id} className="rounded-pi-md border border-pi-border-soft p-2 text-[11px]"><span className="text-pi-dim2">{o.status}</span>{o.degradation?.map(d => <div key={d} className="text-amber-300 mt-1">{d}</div>)}{o.outputAssets?.map(a => a.type === 'text' ? <div key={a.id} className="mt-2 text-pi-text whitespace-pre-wrap line-clamp-6">{(a as any).text}</div> : <div key={a.id} className="mt-1 text-pi-dim truncate">{a.type} · {(a as any).url}</div>)}</div>)}</div><div className="grid grid-cols-1 gap-2"><button className="btn-primary min-h-10 text-xs inline-flex items-center justify-center gap-1.5" onClick={run} disabled={busy}><Play className="w-3.5 h-3.5" />生成当前镜头</button><button className="btn-ghost min-h-10 text-xs inline-flex items-center justify-center gap-1.5" onClick={preview} disabled={busy}><ChevronRight className="w-3.5 h-3.5" />预览编排</button><button className="btn-ghost min-h-10 text-xs" disabled>从此处继续</button><button className="btn-ghost min-h-10 text-xs" disabled>重跑当前镜头 · 版本对比</button></div></> : <div className="text-xs text-pi-dim py-10 text-center">选择一个镜头查看节点</div>}</aside>
    </div>
  </div>
}
