import { RotateCcw, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { RunApi, type RunSummary } from '../api'
import RunTimeline from './RunTimeline'
import RunContextSummary from './RunContextSummary'

export default function ChatRunStatus({ sessionId, onStop, onRetry, onResume }: { sessionId: string | null; onStop?: () => void; onRetry?: (run: RunSummary) => void; onResume?: (run: RunSummary) => void }) {
  const { data } = useSWR(sessionId ? 'chat-run-overview' : null, () => RunApi.overview(), { refreshInterval: 5000, revalidateOnFocus: false })
  const active = data?.active?.find(run => run.sessionId === sessionId)
  const recent = !active ? data?.recent?.find(run => run.sessionId === sessionId) : undefined
  const [lastRun, setLastRun] = useState<RunSummary | undefined>()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detail, setDetail] = useState<(RunSummary & { lastSeq?: number }) | null>(null)
  useEffect(() => {
    if (active) { setLastRun(active); return }
    if (!recent) return
    setLastRun(recent)
    // 中断任务需要一直保留恢复入口，避免用户错过短暂的最近任务提示。
    if (recent.resumeAvailable) return
    const timer = window.setTimeout(() => setLastRun(undefined), 8000)
    return () => window.clearTimeout(timer)
  }, [active, recent])
  const run = active || lastRun
  if (!run) return null
  const failed = ['failed', 'stopped', 'interrupted'].includes(run.phase) || run.status === 'failed'
  const loadDetails = async () => {
    setDetailsOpen(value => !value)
    if (!detail || detail.id !== run.id) {
      try { setDetail(await RunApi.get(run.id)) } catch { setDetail(null) }
    }
  }
  return <section className="mx-auto mb-3 w-full max-w-3xl rounded-pi-lg border border-pi-border-soft bg-pi-bg1/80 px-3 py-2.5 shadow-sm" aria-label="当前运行状态">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <RunTimeline phase={run.phase} compact />
        <span className="truncate text-[11px] text-pi-dim" title={run.messagePreview}>{run.messagePreview || (failed ? '运行未完成' : '正在处理…')}</span>
      </div>
      {active && onStop && <button type="button" onClick={onStop} className="inline-flex items-center gap-1 rounded-pi-md border border-pi-border-soft px-2 py-1 text-[11px] text-pi-dim hover:text-pi-text" aria-label="停止运行"><Square className="h-3 w-3" />停止</button>}
      {!active && run.resumeAvailable && onResume && <button type="button" onClick={() => onResume(run)} className="inline-flex items-center gap-1 rounded-pi-md border border-pi-accent/40 px-2 py-1 text-[11px] text-pi-accent hover:text-pi-text" aria-label="继续运行"><RotateCcw className="h-3 w-3" />继续任务</button>}
      {failed && onRetry && <button type="button" onClick={() => onRetry(run)} className="inline-flex items-center gap-1 rounded-pi-md border border-pi-border-soft px-2 py-1 text-[11px] text-pi-dim hover:text-pi-text" aria-label="重试运行"><RotateCcw className="h-3 w-3" />重试</button>}
      {!active && <button type="button" onClick={loadDetails} className="rounded-pi-md border border-pi-border-soft px-2 py-1 text-[11px] text-pi-dim hover:text-pi-text">{detailsOpen ? '收起详情' : '查看详情'}</button>}
    </div>
    <div className="mt-2"><RunContextSummary run={run} sessionId={sessionId!} /></div>
    {failed && run.error && <div className="mt-2 text-[11px] text-pi-error">失败：{run.error}</div>}
    {detailsOpen && detail && <div className="mt-2 rounded-pi-md bg-pi-bg2/60 px-2.5 py-2 text-[11px] text-pi-dim">运行 ID：{detail.id}<span className="mx-2 text-pi-border">·</span>事件序号：{detail.lastSeq ?? 0}</div>}
  </section>
}
