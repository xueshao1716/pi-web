import { useState } from 'react'
import useSWR from 'swr'
import { TasksApi } from '../api'
import type { TimeTask } from '../api'

// ── 定时任务：时间引擎可视化管理（Phase 3）──
// daily（每天 HH:MM）/ weekly（周几 HH:MM）/ once（某日期 HH:MM），到点把 prompt 派给小语执行

const DAY_LABEL = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
const TYPE_LABEL: Record<string, string> = { daily: '每天', weekly: '每周', once: '单次' }

function describe(t: TimeTask): string {
  if (t.type === 'weekly') return `${DAY_LABEL[t.day || 1]} ${t.at}`
  if (t.type === 'once') return `${t.date} ${t.at}`
  return `每天 ${t.at}`
}

export default function Tasks() {
  // swr：30s 轮询任务列表（看 lastRun/runs 变化）
  const { data, mutate, isLoading } = useSWR('time-tasks', () => TasksApi.list(), { refreshInterval: 30000 })
  const tasks = data?.tasks || []
  const [form, setForm] = useState({ type: 'daily', at: '09:00', day: 1, date: '', prompt: '', label: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

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
      else {
        await mutate()
        setForm(f => ({ ...f, prompt: '', label: '' }))
      }
    } catch (e: any) { setErr(e?.message || String(e)) } finally { setBusy(false) }
  }

  return (
    <div className="flex-1 overflow-y-auto relative z-10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <h1 className="text-xl font-bold text-pi-text mb-1">定时任务</h1>
        <p className="text-xs text-pi-dim2 mb-5">到点自动把指令派给小语执行 · 服务端每分钟检查，重启后自动补跑</p>

        {/* 任务列表 */}
        <div className="space-y-2.5 mb-8">
          {isLoading && <div className="text-center text-pi-dim2 text-sm py-8">加载中…</div>}
          {!isLoading && !tasks.length && <div className="text-center text-pi-dim2 text-sm py-10 panel">还没有定时任务——用下面的表单建第一个</div>}
          {tasks.map(t => (
            <div key={t.id} className="panel !p-3.5 flex items-start gap-3">
              <div className="w-11 h-11 rounded-pi-md bg-pi-accent/12 border border-pi-accent/25 flex flex-col items-center justify-center flex-shrink-0">
                <span className="text-[9px] text-pi-accent leading-none">{TYPE_LABEL[t.type]}</span>
                <span className="text-[11px] font-bold text-pi-text leading-tight">{t.at}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-pi-text font-medium truncate">{t.label || t.prompt.slice(0, 30)}</div>
                <div className="text-[11px] text-pi-dim2 mt-0.5 line-clamp-2">{t.prompt}</div>
                <div className="text-[10px] text-pi-dim2 mt-1 flex gap-3">
                  <span>⏰ {describe(t)}</span>
                  <span>已跑 {t.runs || 0} 次{t.lastRun ? ` · 上次 ${new Date(t.lastRun).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}</span>
                </div>
              </div>
              <button title="删除任务" className="btn-tool !px-2 text-pi-dim2 hover:text-pi-red flex-shrink-0"
                onClick={async () => { try { await TasksApi.remove(t.id); mutate() } catch {} }}>🗑</button>
            </div>
          ))}
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
          {err && <div className="text-xs text-pi-red">⚠️ {err}</div>}
        </div>
      </div>
    </div>
  )
}
