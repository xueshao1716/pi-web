import { useEffect, useState } from 'react'
import { ModelsApi, StoryApi, withFileToken } from '../api'
import type { Model, StoryBeat, StoryCharacter, StoryProject } from '../types'
import { applyStoryDraft, bibleText, editedBible } from '../lib/story-draft'
import StoryStart from '../components/story/StoryStart'
import StorySettings from '../components/story/StorySettings'
import StoryResults from '../components/story/StoryResults'
import StoryProducts from '../components/story/StoryProducts'
import '../components/story/story.css'

const emptyBeat: StoryBeat = { id: 'beat-1', kind: 'novel', prompt: '', references: [] }
const kindLabel = { novel: '段落', image: '画面', video: '视频' }
const modelKey = (m: Model) => `${m.provider}::${m.id}`
const modelValue = (key: string) => { const [provider, ...rest] = key.split('::'); return provider && rest.length ? { provider, id: rest.join('::') } : undefined }
const capable = (m: Model, kind: StoryBeat['kind']) => Boolean(m.capabilities?.[kind === 'novel' ? 'chat' : kind])

// 连续创作面板：已并入「创作」（pages/Workshop.tsx）作为一个页内视图，
// 因此不再自带 h1（由创作的 PageHeader 承担），也不再自带滚动容器（外层已滚）。
export function StoryPanel() {
  const [projects, setProjects] = useState<StoryProject[]>([])
  const [project, setProject] = useState<StoryProject | null>(null)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [bibleDraft, setBibleDraft] = useState<Record<string,string>>({})
  const [assistResult, setAssistResult] = useState<any>(null)
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [planningModel, setPlanningModel] = useState('')
  const [selectedKind, setSelectedKind] = useState<StoryBeat['kind']>('novel')
  const [promptDraft, setPromptDraft] = useState('')
  const [compiled, setCompiled] = useState('')
  const [timelineOpen, setTimelineOpen] = useState(() => window.innerWidth > 640)
  const [storyboardIdea, setStoryboardIdea] = useState('')
  const [storyboardCount, setStoryboardCount] = useState('6')
  const [filmUrl, setFilmUrl] = useState('')
  const [lint, setLint] = useState<{ issues: { level: string; code: string; message: string }[]; summary: { characters: number; portraits: number; scenes: number; beats: number; level: string } } | null>(null)
  const scene = project?.scenes.find(s => s.beats.some(b => b.id === selected)) || project?.scenes[0]
  const beat = scene?.beats.find(b => b.id === selected) || scene?.beats[0] || (scene ? emptyBeat : undefined)
  const availableModels = models.filter(m => capable(m, selectedKind))
  const selectedModelInfo = modelValue(selectedModel)
  const hydrateBible = (p: StoryProject) => setBibleDraft(bibleText(p.bible))
  const update = (p: StoryProject) => { setProject(p); setProjects(items => [p, ...items.filter(item => item.id !== p.id)]) }
  const choose = (p: StoryProject | null) => { setProject(p); setSelected(p?.scenes[0]?.beats[0]?.id || ''); if (p) hydrateBible(p); setAssistResult(null); setCompiled(''); setError(''); setNotice('') }
  const setGenerationKind = (kind: StoryBeat['kind']) => { setSelectedKind(kind); setSelectedModel(''); setCompiled('') }
  useEffect(() => { if (beat) { setSelectedKind(beat.kind); setPromptDraft(beat.prompt) } setAssistResult(null); setCompiled('') }, [project?.id, beat?.id, beat?.kind, beat?.prompt])
  useEffect(() => { if (selectedModel && !availableModels.some(m => modelKey(m) === selectedModel)) setSelectedModel('') }, [selectedKind, models, selectedModel])
  const load = async () => {
    setBusy('正在加载故事'); setError('')
    try { const r = await StoryApi.listProjects(); setProjects(r.projects); choose(r.projects.find(p => p.id === project?.id) || r.projects[0] || null) }
    catch (e: any) { setError(e.message || '加载失败，请刷新重试') } finally { setBusy('') }
  }
  useEffect(() => { void load(); void ModelsApi.list().then(r => setModels(r.models || [])).catch(() => setError('模型列表加载失败，请刷新页面重试')) }, [])
  const action = async (label: string, fn: () => Promise<void>) => {
    if (busy) return
    setBusy(label); setError(''); setNotice('')
    try { await fn() } catch (e: any) { setError(e?.message || '操作未完成，请重试') } finally { setBusy('') }
  }
  const requestDraft = async (p: StoryProject, idea: string, kind: StoryBeat['kind']) => {
    const r = await StoryApi.assist(p.id, `目标输出：${kindLabel[kind]}。\n${idea}`, modelValue(planningModel))
    setAssistResult({ ...r.assist, beat: { ...r.assist.beat, kind } })
    setNotice('AI 草稿已准备好，查看后点击“采用并保存设定”。')
  }
  const start = (idea: string, kind: StoryBeat['kind']) => action('AI 正在整理人物与开场', async () => {
    const r = await StoryApi.createProject({ title: idea.slice(0, 24), logline: idea })
    const saved = await StoryApi.patchProject(r.project.id, { scenes: [{ id:'scene-1', index:1, title:'开场', summary:idea, beats:[{...emptyBeat,kind,prompt:idea}], outputs:[] }] })
    update(saved.project); hydrateBible(saved.project); setSelected('beat-1'); setSelectedKind(kind); setPromptDraft(idea)
    await requestDraft(saved.project, idea, kind)
  })
  const persist = async () => {
    if (!project) throw new Error('请先开始一个故事')
    const scenes = project.scenes.length ? project.scenes : [{id:'scene-1',index:1,title:'开场',summary:project.logline || '',beats:[],outputs:[]}]
    const target = scene || scenes[0]
    const nextBeat = { ...(beat || emptyBeat), kind:selectedKind, prompt:promptDraft.trim() }
    const r = await StoryApi.patchProject(project.id, { bible: editedBible(project.bible, bibleDraft), scenes: scenes.map(s => s.id !== target.id ? s : {...s,beats:s.beats.some(b => b.id === nextBeat.id) ? s.beats.map(b => b.id === nextBeat.id ? nextBeat : b) : [...s.beats,nextBeat]}) })
    update(r.project); hydrateBible(r.project)
    return { project:r.project, sceneId:target.id, beatId:nextBeat.id }
  }
  const assist = () => action('AI 正在完善本段', async () => {
    const saved = await persist()
    await requestDraft(saved.project, `故事梗概：${saved.project.logline || ''}\n本段方向：${promptDraft}\n已有段落：${JSON.stringify(saved.project.scenes).slice(-10000)}\n只完善当前段落，保留已确定的人物设定。`, selectedKind)
  })
  const applyAssist = () => action('正在保存设定与本段草稿', async () => {
    if (!project || !scene || !beat || !assistResult) return
    const r = await StoryApi.patchProject(project.id, applyStoryDraft(project, assistResult, scene.id, beat.id))
    update(r.project); hydrateBible(r.project); setAssistResult(null); setNotice('人物、服装、风格和本段内容已一起保存，现在可以生成。')
  })
  const run = () => action(`正在生成${kindLabel[selectedKind]}，请稍候`, async () => {
    const saved = await persist()
    try {
      const r = await StoryApi.run(saved.project.id, { sceneId:saved.sceneId, beatId:saved.beatId, kind: selectedKind, ...(selectedModelInfo ? {model:selectedModelInfo} : {}) })
      update(r.project)
      if (r.run.status === 'failed') setError(r.run.degradation?.join('；') || '生成失败，请更换模型重试')
      else setNotice('本段结果已返回，请预览核对，再从此处继续。')
    } catch (e) {
      const latest = await StoryApi.getProject(saved.project.id).catch(() => null)
      if (latest) update(latest.project)
      throw e
    }
  })
  const preview = () => action('正在检查生成输入', async () => {
    const saved = await persist()
    const r = await StoryApi.previewRun(saved.project.id, {sceneId:saved.sceneId,beatId:saved.beatId,kind:selectedKind,model:selectedModelInfo || {provider:'auto',id:'auto'}})
    setCompiled(r.context.prompt); setNotice('以下是实际将使用的设定与要求；尚未调用生成模型。')
  })
  const continueFromBeat = () => action('AI 正在构思下一段', async () => {
    const saved = await persist()
    const currentScene = saved.project.scenes.find(s => s.id === saved.sceneId)!
    const previous = currentScene.beats.find(b => b.id === saved.beatId)!
    const next: StoryBeat = {id:`beat-${Date.now()}`,kind:selectedKind,prompt:'承接上一段的结尾，推进下一件具体事件，保持人物与设定一致，不重复开场。',references:previous.references || [],inheritFromBeatId:previous.id}
    const r = await StoryApi.patchProject(saved.project.id, {scenes:saved.project.scenes.map(s => s.id !== currentScene.id ? s : {...s,beats:[...s.beats,next]})})
    update(r.project); setSelected(next.id)
    await requestDraft(r.project, `为下一段构思具体情节：${next.prompt}\n之前的段落和实际产出：${JSON.stringify(currentScene).slice(-10000)}`, selectedKind)
  })
  const saveBible = () => action('正在保存设定', async () => { if (project) { const r=await StoryApi.patchProject(project.id,{bible:editedBible(project.bible,bibleDraft)});update(r.project);hydrateBible(r.project);setNotice('设定已保存') } })
  // 角色定妆照：生成一张可复用的形象参考图并写回设定；
  // 之后生成画面/视频时编排层会自动把它作为真实参考图注入。
  const portrait = (character: StoryCharacter) => action(`正在生成「${character.name || character.id}」的定妆照`, async () => {
    if (!project) return
    const r = await StoryApi.portrait(project.id, { characterId: character.id })
    update(r.project); hydrateBible(r.project)
    if (r.image) setNotice(`「${r.character?.name || character.name || character.id}」的定妆照已保存；后续画面与视频会带上它作为参考图。`)
    else setError(r.error || '定妆照生成失败，请换一个图像模型再试')
  })
  // 连续性体检：随项目/输出类型变化刷新；做完动作后再刷一次，让「缺定妆照/未继承」这类提示实时消失
  const refreshLint = async (id = project?.id, kind = selectedKind) => {
    if (!id) { setLint(null); return }
    try { setLint(await StoryApi.lint(id, { kind })) } catch { setLint(null) }
  }
  useEffect(() => { void refreshLint(project?.id, selectedKind) }, [project?.id, selectedKind])
  // 一键分镜：一次拿到整场分镜表，继承链由服务端串好，省掉一段一段点「从此处继续」
  const runStoryboard = () => action(`AI 正在排 ${storyboardCount} 段分镜`, async () => {
    if (!project) throw new Error('请先开始一个故事')
    const r = await StoryApi.storyboard(project.id, { idea: storyboardIdea.trim(), count: Number(storyboardCount) || 6 })
    update(r.project); hydrateBible(r.project)
    setStoryboardIdea('')
    const added = r.project.scenes.flatMap(scene => scene.beats).slice(-1)[0]
    if (added) setSelected(added.id)
    // 分镜同时把出场人物登记进设定：说清楚，否则用户不知道角色库是哪来的，
    // 也不知道「生成定妆照」现在有对象了。
    const cast = Array.isArray(r.characterNames) ? r.characterNames.filter(Boolean) : []
    setNotice(`已追加 ${r.beatCount} 段分镜（${r.sceneCount} 场），继承链已自动串好，可以逐段生成。${cast.length ? `同时登记了 ${cast.length} 个角色：${cast.slice(0, 4).join('、')}${cast.length > 4 ? ' 等' : ''}——现在可以给他们生成定妆照锁定长相。` : ''}`)
    await refreshLint(r.project.id)
  })
  // 成片合成：按分镜顺序把成功的视频片段拼成一条长片
  const makeFilm = () => action('正在合成成片（按分镜顺序拼接）', async () => {
    if (!project) throw new Error('请先开始一个故事')
    const r = await StoryApi.film(project.id)
    // 服务端已把这一版成片写回项目；这里用返回值刷新，刷新页面后链接也不会丢
    if (r.project) update(r.project)
    setFilmUrl(r.film?.url || r.url)
    setNotice(`成片已生成：${r.clipCount} 段拼接完成${r.method === 'copy' ? '（只有一段，直接落盘）' : ''}，已归档到工作空间并记入项目，共 ${(r.project?.films || project.films || []).length} 版。`)
  })
  const currentRuns = scene?.outputs.filter(r => r.beatId === beat?.id) || []
  const hasOutput = currentRuns.some(r => r.outputAssets?.length)
  // 成片链接来自**项目里存的成片历史**，不是一次性的本地状态——
  // 之前只 setFilmUrl，刷新页面链接就没了，用户以为合成失败了。
  const films = project?.films || []
  const latestFilm = films.length ? films[films.length - 1] : null
  const filmHref = latestFilm?.url || filmUrl
  const portraitCount = (project?.bible.characters || []).filter(c => c.refImage || (c as any).ref).length
  return <div className="story-workbench story-workbench-embedded">
    <header className="story-header"><div className="story-actions">
      <select aria-label="选择故事项目" disabled={Boolean(busy)} value={project?.id || ''} onChange={e => choose(projects.find(p => p.id === e.target.value) || null)}><option value="">开始新故事</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
      <button className="btn-ghost" disabled={Boolean(busy)} onClick={() => choose(null)}>新故事</button><button className="btn-ghost" disabled={Boolean(busy)} onClick={load}>刷新</button>
    </div></header>
    <div aria-live="polite">{busy && <p role="status" className="story-notice">{busy}…</p>}{notice && <p role="status" className="story-notice">{notice}</p>}</div>
    {error && <p role="alert" className="story-notice story-error">{error}</p>}
    {!project ? <StoryStart busy={Boolean(busy)} onStart={start}><label className="story-model-select">构思模型<select value={planningModel} disabled={Boolean(busy)} onChange={e=>setPlanningModel(e.target.value)}><option value="">自动选择文本模型</option>{models.filter(m=>capable(m,'novel')).map(m=><option key={modelKey(m)} value={modelKey(m)}>{m.name || m.id}</option>)}</select></label></StoryStart> : <div className="story-layout">
      <details open={timelineOpen} onToggle={e=>setTimelineOpen(e.currentTarget.open)} className="story-timeline"><summary>分镜时间线 · {project.scenes.reduce((n,s)=>n+s.beats.length,0)} 段</summary><ol>{project.scenes.flatMap(s=>(s.beats.length?s.beats:[emptyBeat]).map(b=>({s,b}))).map(({s,b},i)=>{
        const latest=s.outputs?.filter(r=>r.beatId===b.id).slice(-1)[0]
        return <li key={b.id}><button disabled={Boolean(busy)} aria-current={beat?.id===b.id?'step':undefined} onClick={()=>setSelected(b.id)}><span>第 {i+1} 段 · {kindLabel[b.kind]}</span><strong>{b.prompt?.slice(0,48) || '等待开场'}</strong><span>{latest?.status==='failed'?'生成失败':latest?.outputAssets?.length?'已有成品':latest?.status==='running'?'正在生成':'待生成'}{b.inheritFromBeatId?' · 承接前文':''}</span></button></li>
      })}</ol></details>
      <main className="story-main">
        <div className="story-steps"><span className="is-ready">1 想法已建立</span><span className={project.bible.characters?.length?'is-ready':''}>2 确定人物与设定</span><span className={hasOutput?'is-ready':''}>3 生成并预览</span></div>
        <section className="story-studio" aria-label="制作台">
          <div className="story-studio-row">
            <label className="story-studio-count">段数<select aria-label="分镜段数" value={storyboardCount} disabled={Boolean(busy)} onChange={e=>setStoryboardCount(e.target.value)}>{['4','6','8','10','12'].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
            <input className="story-studio-idea" aria-label="分镜想法" placeholder="想讲什么（可留空，按梗概排）" value={storyboardIdea} disabled={Boolean(busy)} onChange={e=>setStoryboardIdea(e.target.value)} />
            <button className="btn-ghost" disabled={Boolean(busy)} onClick={runStoryboard}>一键分镜</button>
            <button className="btn-primary" disabled={Boolean(busy)} onClick={makeFilm}>合成成片</button>
            {filmHref && <a className="story-studio-link" href={withFileToken(filmHref)} target="_blank" rel="noreferrer">打开成片{films.length > 1 ? `（第 ${films.length} 版）` : ''}</a>}
          </div>
          {lint && <div className={`story-lint story-lint-${lint.summary.level}`}>
            <span className="story-lint-head">连续性体检 · 角色 {lint.summary.characters}（定妆照 {lint.summary.portraits}）· {lint.summary.scenes} 场 {lint.summary.beats} 段</span>
            {lint.issues.length === 0
              ? <span className="story-lint-ok">条件齐备，可以开始生成。</span>
              : <ul>{lint.issues.slice(0, 6).map(i=><li key={`${i.code}-${i.message}`} className={`story-lint-item story-lint-item-${i.level}`}>{i.message}</li>)}</ul>}
          </div>}
        </section>
        <div className="story-editor-layout"><section className="story-editor">
          <div className="story-section-head"><h2>{scene?.title || '故事开场'}</h2><span>{beat?.inheritFromBeatId?'承接前文':'故事起点'}</span></div>
          <div className="story-form-row"><label>输出类型<select aria-label="选择输出类型" disabled={Boolean(busy)} value={selectedKind} onChange={e=>setGenerationKind(e.target.value as StoryBeat['kind'])}><option value="novel">小说段落</option><option value="image">故事画面</option><option value="video">视频片段</option></select></label><label>生成模型<select aria-label="选择模型" disabled={Boolean(busy)} value={selectedModel} onChange={e=>setSelectedModel(e.target.value)}><option value="">自动选择模型</option>{availableModels.map(m=><option key={modelKey(m)} value={modelKey(m)}>{m.name || m.id}</option>)}</select></label></div>
          <label>本段内容<textarea aria-label="本段内容" disabled={Boolean(busy)} value={promptDraft} onChange={e=>{setPromptDraft(e.target.value);setCompiled('')}} rows={6} placeholder="写下本段想发生的事，或让 AI 帮你完善" /></label>
          <div className="story-form-row"><label>构思模型<select value={planningModel} disabled={Boolean(busy)} onChange={e=>setPlanningModel(e.target.value)}><option value="">自动选择文本模型</option>{models.filter(m=>capable(m,'novel')).map(m=><option key={modelKey(m)} value={modelKey(m)}>{m.name || m.id}</option>)}</select></label><div className="story-actions"><button className="btn-ghost" disabled={Boolean(busy)} onClick={assist}>让 AI 完善本段</button></div></div>
          {assistResult && <div className="story-draft"><h3>AI 草稿 · 确认后一起保存</h3><p>{assistResult.scene?.summary}</p><p>{assistResult.beat?.prompt}</p><p className="story-hint">人物：{assistResult.characters?.map((c:any)=>[c.name,c.appearance].filter(Boolean).join(' · ')).join('；') || '沿用既有设定'}</p><div className="story-actions"><button className="btn-primary" disabled={Boolean(busy)} onClick={applyAssist}>采用并保存设定</button><button className="btn-ghost" disabled={Boolean(busy)} onClick={()=>setAssistResult(null)}>暂不采用</button></div></div>}
          <p className="story-hint">{selectedKind==='novel'?'续写会带上已保存的设定和继承段落的实际正文。':`已生成的定妆照会作为真实参考图注入（画面走图生图、视频走 reference），用来锁住人物外貌；还没有定妆照的角色只能靠文字描述。当前 ${portraitCount}/${(project.bible.characters||[]).length} 个角色有定妆照。`}{selectedKind==='video'?' 每次生成一个视频片段，攒够成功的片段后用左侧「合成成片」拼成长片。':''}</p>
          <div className="story-actions"><button className="btn-primary" disabled={Boolean(busy)||!promptDraft.trim()} onClick={run}>生成当前{kindLabel[selectedKind]}</button><button className="btn-ghost" disabled={Boolean(busy)||!promptDraft.trim()} onClick={preview}>检查生成输入</button><button className="btn-ghost" disabled={Boolean(busy)||!hasOutput} onClick={continueFromBeat}>从此处继续 · AI 构思下一段</button></div>
          {!hasOutput && <p className="story-hint">先生成本段成品，再继续下一段。结果不满意时可以修改内容重新生成，旧版本会保留。</p>}
          {compiled && <details open><summary>本次生成输入</summary><div className="story-prose">{compiled}</div></details>}
        </section>{scene && beat && <StoryResults scene={scene} beat={beat} />}</div>
        <StorySettings values={bibleDraft} busy={Boolean(busy)} characters={project.bible.characters || []} onPortrait={portrait} onChange={setBibleDraft} onSave={saveBible} />
        <StoryProducts project={project} onPick={setSelected} />
      </main>
    </div>}
  </div>
}

export default StoryPanel
