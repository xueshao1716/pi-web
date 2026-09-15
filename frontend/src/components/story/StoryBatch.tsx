import { useRef, useState } from 'react'
import { StoryApi } from '../../api'
import type { StoryProject } from '../../types'

// 跨段批量生成：「这一场全部生成」「这一集全部生成」「把还没出的都补上」。
//
// 对照 LibTV 的「批量脚本 → 分镜图 → 视频片段」与 PINNGOO 的「批量生成分集剧本」：
// 元枢此前只能一段一段点「生成当前画面/视频」，一集十几段就是十几轮点击 + 十几轮等待。
// 这里把"逐段提交 → 统一等上游"做成一次操作，但有三条底线：
// - **逐段串行提交**，不并发轰炸上游（视频任务本来就慢，并发只会一起排队一起超时）；
// - 视频创建成功只算"排上队"，随后统一短轮询；超窗**不算失败**，任务号留着可以「查一次」；
// - 每一段的成败都写进这张表，失败的**如实列出来**，不把整批说成"完成"。
const POLL_MS = 5000
const WINDOW_MS = 10 * 60 * 1000

type Scope = 'scene' | 'episode' | 'pending' | 'all'
interface Target { sceneId: string; beatId: string; kind: 'novel' | 'image' | 'video'; label: string }
interface Row { key: string; label: string; kind: string; status: 'pending' | 'submitted' | 'waiting' | 'done' | 'failed' | 'skipped'; note?: string }

const kindLabel: Record<string, string> = { novel: '文字', image: '画面', video: '视频' }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export default function StoryBatch({ project, selectedSceneId, busy, onDone }: {
  project: StoryProject
  selectedSceneId?: string
  busy: boolean
  onDone: (project: StoryProject) => void
}) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<Scope>('pending')
  const [running, setRunning] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [msg, setMsg] = useState('')
  const stopRef = useRef(false)

  const scene = (project.scenes || []).find(s => s.id === selectedSceneId)
  const episodeId = scene?.episodeId
  const beatsOf = (list: typeof project.scenes): Target[] => list.flatMap(s => (s.beats || []).map(b => ({
    sceneId: s.id, beatId: b.id, kind: b.kind,
    label: `${s.title || s.id} · ${(b.prompt || b.dialogue || b.id).replace(/\s+/g, ' ').slice(0, 24)}`,
  })))
  const hasOutput = (sceneId: string, beatId: string) => (project.scenes.find(s => s.id === sceneId)?.outputs || [])
    .some(o => o.beatId === beatId && o.status === 'succeeded')
  const targetsFor = (s: Scope): Target[] => {
    const all = beatsOf(project.scenes)
    if (s === 'scene') return scene ? beatsOf([scene]) : []
    if (s === 'episode') return episodeId ? beatsOf(project.scenes.filter(x => x.episodeId === episodeId)) : []
    if (s === 'pending') return all.filter(t => !hasOutput(t.sceneId, t.beatId))
    return all
  }
  const targets = targetsFor(scope)
  const nowDone = targets.filter(t => hasOutput(t.sceneId, t.beatId)).length

  const run = async () => {
    if (!targets.length) { setMsg('这个范围里没有段落'); return }
    stopRef.current = false
    setRunning(true); setMsg('')
    const list = [...targets]
    setRows(list.map(t => ({ key: t.beatId, label: t.label, kind: t.kind, status: 'pending' })))
    const patch = (key: string, next: Partial<Row>) => setRows(prev => prev.map(r => r.key === key ? { ...r, ...next } : r))
    const waiting: { key: string; sceneId: string; runId: string; label: string }[] = []
    let failed = 0, settled = 0
    const total = list.length
    // 阶段一：逐段提交。串行是刻意的——并发提交会让视频任务一起排队一起超窗。
    for (const [i, t] of list.entries()) {
      if (stopRef.current) { patch(t.beatId, { status: 'skipped', note: '已停止，未提交' }); continue }
      setMsg(`正在提交 ${i + 1}/${total}：${kindLabel[t.kind] || t.kind}`)
      patch(t.beatId, { status: 'submitted' })
      try {
        const r = await StoryApi.run(project.id, { sceneId: t.sceneId, beatId: t.beatId, kind: t.kind })
        if (r.project) onDone(r.project)
        const runs = r.runs?.length ? r.runs : [r.run]
        const pending = runs.filter(x => x?.status === 'running' && x?.taskId)
        const bad = runs.filter(x => x?.status === 'failed')
        if (pending.length) {
          for (const p of pending) waiting.push({ key: t.beatId, sceneId: t.sceneId, runId: p.id, label: t.label })
          patch(t.beatId, { status: 'waiting', note: `已排队 ${pending.length} 个任务号` })
        } else if (bad.length) {
          failed += 1
          patch(t.beatId, { status: 'failed', note: bad.map(x => x.degradation?.join('；')).filter(Boolean).join('；') || '生成失败' })
        } else {
          settled += 1
          patch(t.beatId, { status: 'done', note: runs.length > 1 ? `${runs.length} 版已返回` : '已返回' })
        }
      } catch (e: any) {
        failed += 1
        patch(t.beatId, { status: 'failed', note: String(e?.message || e) })
      }
    }
    if (!waiting.length) {
      setRunning(false)
      setMsg(`提交完成：${settled} 段已返回${failed ? `，${failed} 段失败（见下表）` : ''}${stopRef.current ? '（已按停止中断）' : ''}`)
      return
    }
    // 阶段二：统一等上游出片。超窗不是失败：任务号还在，可以逐条「查一次」。
    setMsg(`已提交完毕，正在等上游出片（${waiting.length} 个任务号）……`)
    const deadline = Date.now() + WINDOW_MS
    while (waiting.length && Date.now() < deadline && !stopRef.current) {
      await sleep(POLL_MS)
      for (const item of [...waiting]) {
        let res
        try { res = await StoryApi.checkRun(project.id, { sceneId: item.sceneId, runId: item.runId }) } catch { continue }
        if (res.project) onDone(res.project)
        if (!res.settled) continue
        waiting.splice(waiting.indexOf(item), 1)
        if (res.status === 'failed') { failed += 1; patch(item.key, { status: 'failed', note: res.run?.degradation?.join('；') || '上游返回失败' }) }
        else { settled += 1; patch(item.key, { status: 'done', note: res.status === 'degraded' ? '到了，但有降级项' : '已落盘' }) }
      }
      setMsg(`等待上游：还剩 ${waiting.length} 个任务号（已出 ${settled} 段${failed ? `，失败 ${failed} 段` : ''}）`)
    }
    setRunning(false)
    if (waiting.length) setMsg(`等满 ${Math.round(WINDOW_MS / 60000)} 分钟还有 ${waiting.length} 个没出片。任务号还在，**这不是失败**——在上方对应段落点「查一次」继续问，或再点一次批量。`)
    else setMsg(`这一批结束：${settled} 段出片${failed ? `，${failed} 段失败（见下表）` : ''}${stopRef.current ? '（已按停止中断，未提交的段落保持原样）' : ''}`)
  }

  return <div className="story-batch">
    <div className="story-head">
      <span>批量生成{open && targets.length ? ` · ${scopeLabel(scope)} ${targets.length} 段（已出 ${nowDone}）` : ''}</span>
      <button className="btn-ghost" disabled={busy} onClick={() => setOpen(o => !o)}>{open ? '收起' : '批量'}</button>
    </div>
    {open && <div className="story-batch-body">
      <p className="story-hint">
        逐段串行提交，再统一等上游出片——视频创建成功只算「排上队」，超窗不算失败（任务号留着，可单独「查一次」）。
        批量用<strong>每段自己的类型</strong>与项目默认配方；要调 seed / 尺寸 / 参考图，仍用上面的单段表单。
      </p>
      <div className="story-batch-scopes">
        <label><input type="radio" name="story-batch-scope" disabled={running} checked={scope === 'scene'} onChange={() => setScope('scene')} />当前场{scene ? `（${beatsOf([scene]).length} 段）` : '（未选中）'}</label>
        <label><input type="radio" name="story-batch-scope" disabled={running} checked={scope === 'episode'} onChange={() => setScope('episode')} />当前集{episodeId ? `（${beatsOf(project.scenes.filter(x => x.episodeId === episodeId)).length} 段）` : '（当前场未分集）'}</label>
        <label><input type="radio" name="story-batch-scope" disabled={running} checked={scope === 'pending'} onChange={() => setScope('pending')} />全项目未出片（{beatsOf(project.scenes).filter(t => !hasOutput(t.sceneId, t.beatId)).length} 段）</label>
        <label><input type="radio" name="story-batch-scope" disabled={running} checked={scope === 'all'} onChange={() => setScope('all')} />全项目（{beatsOf(project.scenes).length} 段）</label>
      </div>
      <div className="story-actions">
        <button className="btn-primary" disabled={busy || running || !targets.length} onClick={run}>{running ? '批量进行中…' : `开始批量生成（${targets.length} 段）`}</button>
        {running && <button className="btn-ghost" onClick={() => { stopRef.current = true; setMsg('已请求停止：当前这一段提交完就停，剩下的不会提交。') }}>停止</button>}
      </div>
      {msg && <p role="status" className="story-notice">{msg}</p>}
      {rows.length > 0 && <ul className="story-batch-rows">
        {rows.map(r => <li key={r.key} className={`story-batch-${r.status}`}>
          <span className="story-batch-kind">{kindLabel[r.kind] || r.kind}</span>
          <span className="story-batch-label">{r.label}</span>
          <span className="story-batch-status">{statusLabel(r.status)}</span>
          {r.note && <span className="story-batch-note">{r.note}</span>}
        </li>)}
      </ul>}
    </div>}
  </div>
}

function scopeLabel(s: Scope) { return s === 'scene' ? '当前场' : s === 'episode' ? '当前集' : s === 'pending' ? '全项目未出片' : '全项目' }
function statusLabel(s: Row['status']) {
  return s === 'pending' ? '待提交' : s === 'submitted' ? '提交中' : s === 'waiting' ? '等上游' : s === 'done' ? '已出' : s === 'failed' ? '失败' : '已跳过'
}
