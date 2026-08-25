import { useState } from 'react'
import { Trash2, Play, Pause, RotateCcw, Archive, ChevronDown, ChevronRight, Loader2, Square } from 'lucide-react'
import useSWR from 'swr'
import { TasksApi } from '../api'
import type { TimeTask } from '../api'

// ── 任务中心 v2（08-25，MyAgents 路线）：状态机 / 手动执行 / 运行历史 ──

const DAY_LABEL = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
const TYPE_LABEL: Record<string, string> = { daily: '每天', weekly: '每周', once: '单次' }

function describe(t: TimeTask): string {
  if (t.type === 'weekly') return `${DAY_LABEL[t.day || 1]} ${t.at}`
  if (t.type === 'once') return `${t.date} ${t.at}`
  return `每天 ${t.at}`
}

const STATE_BADGE: Record<string, { label: string; color: string; icon: typeof Play }> = {
  active:   { label: '调度中', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: Play },
  paused:   { label: '已暂停', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: Pause },
  done:     { label: '已完成', color: 'bg-pi-bg3 text-pi-dim border-pi-border', icon: RotateCcw },
  archived: { label: '已归档', color: 'bg-pi-bg3 text-pi-dim2 border-pi-border-soft', icon: Archive },
}

function StateBadge({ state }: { state: string }) {
  const b = STATE_BADGE[state] || STATE_BADGE.active
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pi-pill text-[10px] font-medium border ${b.color}`}>
      <b.icon className="w-3 h-3" strokeWidth={2} />{b.label}
    </span>
  )
}

function RunHistory({ id }: { id: string }) {
  const { data, isLoading } = useSWR(`task-history-${id}`, () => TasksApi.history(id), { dedupingInterval: 5000 })
  if (isLoading) return <div className="text-[11px] text-pi-dim2 py-2">加载历史…</div>
  const hist = data?.history || []
  if (!hist.length) return <div className="text-[11px] text-pi-dim2 py-2">暂无运行记录</div>
  return (
    <div className="space-y-1.5 pt-2">
      {hist.slice(0, 10).map(h => (
        <div key={h.queueId} className="flex items-start gap-2 text-[11px]">
          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${h.status === 'ok' ? 'bg-emerald-400' : h.status === 'error' ? 'bg-pi-red' : 'bg-amber-400'}`} />
          <div className="flex-1 min-w-0">
            <span className="text-pi-dim">{new Date(h.startedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
            <span className="ml-2 text-pi-dim2">({h.durationMs}ms · {h.status === 'ok' ? '成功' : h.status === 'error' ? '失败' : '停止'})</span>
            {h.result && <div className="text-pi-dim2 truncate mt-0.5 max-h-20 overflow-hidden">{h.result.slice(0, 200)}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Tasks() {
  const { data, mutate, isLoading } = useSWR('time-tasks', () => TasksApi.list(), { refreshInterval: 15000 })
  const tasks = data?.tasks || []
  const [form, setForm] = useState({ type: 'daily', at: '09:00', day: 1, date: '', prompt: '', label: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleHistory = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const doAction = async (id: string, fn: () => Promise<any>) => {
    setActionBusy(id)
    try { await fn(); await mutate() } catch {} finally { setActionBusy(null) }
  }

  const submit = async () => {
    setErr('')
    if (!form.prompt.trim()) { setErr('请填写要执行的指令（prompt）'); return }
    setBusy(true)
    try {
      const body: any = { type: form.type, at: form.at, prompt: form.prompt.trim(), label: form.label.trim() || form.prompt.trim().slice(0, 20) }
      if (form.type === 'weekly') body.day = form.day
      if (form.type === 'once') body.date = form.date
      const r = await TasksApi.create(body)
      if (r.error) setErr(r.error)
      else { await mutate(); setForm(f => ({ ...f, prompt: '', label: '' })) }
    } catch (e: any) { setErr(e?.message || String(e)) } finally { setBusy(false) }
  }

  const activeCount = tasks.filter(t => t.state === 'active').length
  const runningCount = tasks.filter(t => t.running).length

  return (
    <div className="flex-1 overflow-y-auto relative z-10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <div className="mb-5">
          <div className="page-eyebrow mb-1">Task Center</div>
          <h1 className="page-title">任务中心</h1>
          <p className="text-xs text-pi-dim2 mt-1.5">
            想法 → 任务 → 调度 → 复盘 · 到点自动执行，运行历史可追溯
            {activeCount > 0 && <span className="ml-2 text-pi-accent">· {activeCount} 个调度中</span>}
            {runningCount > 0 && <span className="ml-2 text-emerald-400">· {runningCount} 个执行中</span>}
          </p>
        </div>

        {/* 任务列表 */}
        <div className="space-y-2.5 mb-8">
          {isLoading && <div className="text-center text-pi-dim2 text-sm py-8">加载中…</div>}
          {!isLoading && !tasks.length && (
            <div className="empty-state py-12 text-center">
              <div className="text-3xl mb-2 opacity-60">⏰</div>
              <div className="text-sm text-pi-dim">还没有任务</div>
              <div className="text-[11px] text-pi-dim2 mt-1">用下面的表单建第一个，比如每天早上让小语整理工作空间</div>
            </div>
          )}
          {tasks.map(t => {
            const isExpanded = expanded.has(t.id)
            const b = STATE_BADGE[t.state || 'active'] || STATE_BADGE.active
            const canRun = t.state === 'active' && !t.running
            const canPause = t.state === 'active'
            const canResume = t.state === 'paused'
            const canArchive = t.state !== 'archived'

            return (
              <div key={t.id} className={`panel !p-3.5 card-hover group/task group ${t.running ? 'ring-1 ring-pi-accent/30' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-pi-md bg-pi-accent/12 border border-pi-accent/25 flex flex-col items-center justify-center flex-shrink-0"
                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)' }}>
                    <span className="text-[10px] text-pi-accent leading-none font-semibold tracking-wide">{TYPE_LABEL[t.type]}</span>
                    <span className="text-[12px] font-bold text-pi-text leading-tight tabular-nums">{t.at}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] text-pi-text font-medium truncate">{t.label || t.prompt.slice(0, 30)}</span>
                      <StateBadge state={t.state || 'active'} />
                      {t.running && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-pi-accent animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" />执行中
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-pi-dim2 mt-0.5 line-clamp-2">{t.prompt}</div>
                    <div className="text-[11px] text-pi-dim2 mt-1.5 flex gap-3 flex-wrap items-center">
                      <span className="px-1.5 py-0.5 rounded-pi-pill bg-pi-bg3">⏰ {describe(t)}</span>
                      <span className="px-1.5 py-0.5 rounded-pi-pill bg-pi-bg3">已跑 {t.runs || 0} 次</span>
                      {t.lastRun && <span className="px-1.5 py-0.5 rounded-pi-pill bg-pi-bg3">上次 {new Date(t.lastRun).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>}
                      {t.history?.length > 0 && (
                        <button onClick={() => toggleHistory(t.id)} className="text-pi-dim2 hover:text-pi-text transition-colors inline-flex items-center gap-0.5">
                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          历史
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="hov-reveal touch-hit flex items-center gap-1 flex-shrink-0">
                    {/* 立即执行 */}
                    {canRun && (
                      <button title="立即执行" aria-label="立即执行" disabled={actionBusy === t.id}
                        className="btn-tool !px-2 text-pi-dim2 hover:text-emerald-400 disabled:opacity-50"
                        onClick={() => doAction(t.id, () => TasksApi.runNow(t.id))}>
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {t.running && (
                      <button title="停止" aria-label="停止执行" disabled={actionBusy === t.id}
                        className="btn-tool !px-2 text-pi-dim2 hover:text-amber-400 disabled:opacity-50"
                        onClick={() => doAction(t.id, () => TasksApi.stopRun(t.id))}>
                        <Square className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* 暂停/恢复 */}
                    {canPause && (
                      <button title="暂停" aria-label="暂停任务" disabled={actionBusy === t.id}
                        className="btn-tool !px-2 text-pi-dim2 hover:text-amber-400 disabled:opacity-50"
                        onClick={() => doAction(t.id, () => TasksApi.setState(t.id, 'pause'))}>
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canResume && (
                      <button title="恢复" aria-label="恢复任务" disabled={actionBusy === t.id}
                        className="btn-tool !px-2 text-pi-dim2 hover:text-emerald-400 disabled:opacity-50"
                        onClick={() => doAction(t.id, () => TasksApi.setState(t.id, 'resume'))}>
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canArchive && (
                      <button title="归档" aria-label="归档任务" disabled={actionBusy === t.id}
                        className="btn-tool !px-2 text-pi-dim2 hover:text-pi-dim disabled:opacity-50"
                        onClick={() => doAction(t.id, () => TasksApi.setState(t.id, 'archive'))}>
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button title="删除任务" aria-label={`删除任务 ${t.label || t.prompt.slice(0, 20)}`}
                      className="btn-tool !px-2 text-pi-dim2 hover:text-pi-red"
                      onClick={() => doAction(t.id, () => TasksApi.remove(t.id))}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {/* 运行历史（展开时加载） */}
                {isExpanded && t.history?.length > 0 && (
                  <div className="ml-14 mt-2 pl-3 border-l border-pi-border-soft">
                    <RunHistory id={t.id} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 新建表单 */}
        <h2 className="text-sm font-semibold text-pi-text mb-2">新建任务</h2>
        <div className="panel !p-4 space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex rounded-pi-md overflow-hidden border border-pi-border">
              {(['daily', 'weekly', 'once'] as const).map(tp => (
                <button key={tp} onClick={() => setForm(f => ({ ...f, type: tp }))}
                  className={`text-xs px-3 py-1.5 transition-colors ${form.type === tp ? 'bg-pi-accent text-white' : 'bg-pi-bg2 text-pi-dim hover:text-pi-text'}`}>
                  {TYPE_LABEL[tp]}
                </button>
              ))}
            </div>
            <input type="time" className="input-pi !py-1.5 text-xs w-28" value={form.at}
              onChange={e => setForm(f => ({ ...f, at: e.target.value }))} />
            {form.type === 'weekly' && (
              <select className="input-pi !py-1.5 text-xs w-24" value={form.day}
                onChange={e => setForm(f => ({ ...f, day: +e.target.value }))}>
                {DAY_LABEL.slice(1).map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
              </select>
            )}
            {form.type === 'once' && (
              <input type="date" className="input-pi !py-1.5 text-xs w-40" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            )}
          </div>
          <textarea className="input-pi text-[13px] resize-none" rows={3} placeholder="到点让小语做什么？如：整理今天工作空间的生成图片，发一份清单到会话"
            value={form.prompt} onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))} />
          <div className="flex items-center gap-2">
            <input className="input-pi !py-1.5 text-xs flex-1" placeholder="任务名（可选）" value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
            <button className="btn-primary text-xs px-4 py-1.5 disabled:opacity-60" onClick={submit} disabled={busy}>
              {busy ? '创建中…' : '+ 创建'}
            </button>
          </div>
          {err && <div className="text-xs text-pi-red">⚠ {err}</div>}
        </div>
      </div>
    </div>
  )
}
