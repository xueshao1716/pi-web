import { useEffect, useMemo, useState } from 'react'
import { StoryApi, withFileToken } from '../../api'
import type { StoryFilmPlan, StoryProject } from '../../types'

// 合成成片时的**挑片段**：同一段常常生成过好几版镜头，只让"按分镜顺序自动拼"等于把选片子的权利拿走。
//
// 这一块要做对三件事：
// - 默认值就是原来的行为（每段取最新可用的一版、按分镜顺序），不改也能一键合成；
// - 每一段能换版本、能整段不要、能调顺序——顺序就是成片里的先后；
// - 挑不出来的（文件不在了、这一版被删了）**如实说明**，并把它排除掉，不能静默少一段。
const statusLabel: Record<string, string> = { succeeded: '已生成', degraded: '已生成 · 有降级项' }

export default function StoryFilm({ project, busy, onDone, onNotice, onError }: {
  project: StoryProject
  busy: boolean
  onDone: (project: StoryProject) => void
  onNotice: (text: string) => void
  onError: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<StoryFilmPlan | null>(null)
  const [loading, setLoading] = useState(false)
  // picks：有序数组，顺序 = 成片里的顺序。value 是 runId，'' 表示这一段用默认（最新可用）
  const [picks, setPicks] = useState<{ beatId: string; runId: string }[]>([])
  const [dropped, setDropped] = useState<string[]>([])
  const [msg, setMsg] = useState('')

  const load = async () => {
    setLoading(true); setMsg('')
    try {
      const p = await StoryApi.filmPlan(project.id)
      setPlan(p)
      // 默认挑：每段推荐的那一版，按分镜顺序，只保留真有可用版本的段
      setPicks(p.beats.filter(b => b.recommendedRunId).map(b => ({ beatId: b.beatId, runId: b.recommendedRunId })))
      setDropped([])
    } catch (e: any) { setMsg(e?.message || '拿不到片段清单') } finally { setLoading(false) }
  }
  useEffect(() => { if (!open) return; void load() }, [open, project.id])

  const beatsById = useMemo(() => new Map((plan?.beats || []).map(b => [b.beatId, b])), [plan])
  const move = (i: number, delta: number) => setPicks(prev => {
    const next = [...prev]
    const j = i + delta
    if (j < 0 || j >= next.length) return prev
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })

  const assemble = async () => {
    if (!picks.length) { setMsg('一段都没选，先至少留一段。'); return }
    setLoading(true); setMsg('')
    try {
      const r = await StoryApi.film(project.id, { clips: picks })
      if (r.project) onDone(r.project)
      const skipped = r.skipped || []
      const localized = r.localized || []
      onNotice(`成片已生成：${r.clipCount} 段拼接完成${r.method === 'copy' ? '（只有一段，直接落盘）' : ''}，按你挑的版本与顺序。${localized.length ? ` 其中 ${localized.length} 段原本是外站临时链接，已先下载到本地再拼（并写回项目）。` : ''}${skipped.length ? ` 有 ${skipped.length} 段没拼进去：${skipped.map(s => s.reason).join('；')}` : ''}`)
      await load()
    } catch (e: any) { onError(e?.message || '合成失败') } finally { setLoading(false) }
  }

  return <div className="story-film">
    <div className="story-head">
      <span>合成成片{(plan?.usable && open) ? ` · 可拼 ${plan.usable}/${plan.total} 段` : ''}</span>
      <button className="btn-ghost" disabled={busy} onClick={() => setOpen(o => !o)}>{open ? '收起' : '挑片段合成'}</button>
    </div>
    {open && <div className="story-film-body">
      <p className="story-hint">
        同一段生成过好几版镜头时，在这里挑。<strong>默认就是原来那套</strong>（每段用最新可用的一版、按分镜顺序）——
        改了才按你的来。列表顺序就是成片里的先后。
        外站临时链接的片段会<strong>先下载到本地再拼</strong>（并写回项目），不用你手动处理。
      </p>
      {loading && !plan && <p className="story-hint">正在读可用的片段…</p>}
      {msg && <p role="status" className="story-notice">{msg}</p>}
      {plan && <ul className="story-film-picks">
        {plan.beats.map(b => {
          const idx = picks.findIndex(p => p.beatId === b.beatId)
          const picked = idx >= 0 ? picks[idx] : null
          const isDropped = dropped.includes(b.beatId)
          const none = b.usableCount === 0
          return <li key={b.beatId} className={`story-film-pick${none ? ' is-empty' : ''}${isDropped ? ' is-dropped' : ''}`}>
            <div className="story-film-pick-head">
              <strong>第 {b.beatNo} 段</strong>
              <span>{b.title || '（没写内容）'}</span>
            </div>
            {none
              ? <div className="story-film-pick-none">
                {b.candidates.length ? `这一段有 ${b.candidates.length} 版，但都不是可用的片子（文件已被移走，也不是能下载的链接）` : '这一段还没有成功的视频；先给它生成一段视频再合成'}
              </div>
              : <>
                <select aria-label={`第 ${b.beatNo} 段用哪一版`} disabled={busy || isDropped} value={picked?.runId || ''}
                  onChange={e => setPicks(prev => {
                    const rest = prev.filter(p => p.beatId !== b.beatId)
                    if (!e.target.value) return [...rest, { beatId: b.beatId, runId: '' }]
                    return [...rest, { beatId: b.beatId, runId: e.target.value }]
                  })}>
                  <option value="">（不选，这一段不进成片）</option>
                  {b.candidates.filter(c => c.localable).map((c, i) => <option key={c.runId} value={c.runId}>
                    第 {i + 1} 版 · {statusLabel[c.status] || c.status}{c.seed != null ? ` · seed ${c.seed}` : ''}{c.runId === b.recommendedRunId ? ' ·（最新）' : ''}{c.exists ? '' : ' · 外链（合成时先下载到本地）'}
                  </option>)}
                </select>
                <div className="story-film-pick-actions">
                  {!isDropped && picked && <>
                    <button className="btn-ghost" disabled={busy || idx <= 0} onClick={() => move(idx, -1)}>上移</button>
                    <button className="btn-ghost" disabled={busy || idx >= picks.length - 1} onClick={() => move(idx, 1)}>下移</button>
                  </>}
                  {!isDropped && <button className="btn-ghost" disabled={busy} onClick={() => {
                    setDropped(prev => [...prev, b.beatId])
                    setPicks(prev => prev.filter(p => p.beatId !== b.beatId))
                  }}>整段不要</button>}
                  {isDropped && <button className="btn-ghost" disabled={busy} onClick={() => {
                    setDropped(prev => prev.filter(id => id !== b.beatId))
                    setPicks(prev => [...prev, { beatId: b.beatId, runId: b.recommendedRunId }])
                  }}>加回来</button>}
                </div>
              </>}
            {b.candidates.length > 1 && <div className="story-film-pick-cands">这一段有 {b.candidates.length} 版可用，上面下拉里换</div>}
          </li>
        })}
      </ul>}
      {plan && <div className="story-actions">
        <button className="btn-primary" disabled={busy || loading || !picks.length} onClick={assemble}>
          {loading ? '合成中…' : `按这个顺序合成（${picks.length} 段）`}
        </button>
        <button className="btn-ghost" disabled={busy || loading} onClick={() => void load()}>重置成默认</button>
        <button className="btn-ghost" disabled={busy || loading} onClick={() => setPicks(prev => [...prev].reverse())}>整体倒序</button>
      </div>}
      {project.films?.length ? <p className="story-hint">成片历史里有 {project.films.length} 版；这一版会记下用了哪几段的哪一版，可以在「作品」里对着看。</p> : null}
    </div>}
  </div>
}
