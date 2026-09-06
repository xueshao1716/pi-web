import { RotateCcw, Square } from 'lucide-react'
import useSWR from 'swr'
import { RunApi, type RunSummary } from '../api'
import RunTimeline from './RunTimeline'
import RunContextSummary from './RunContextSummary'

export default function ChatRunStatus({ sessionId, onStop, onRetry }: { sessionId: string | null; onStop?: () => void; onRetry?: (run: RunSummary) => void }) {
  const { data } = useSWR(sessionId ? 'chat-run-overview' : null, () => RunApi.overview(), { refreshInterval: 5000, revalidateOnFocus: false })
  const active = data?.active?.find(run => run.sessionId === sessionId)
  const recent = !active ? data?.recent?.find(run => run.sessionId === sessionId) : undefined
  const run = active || recent
  if (!run) return null
  const failed = ['failed', 'stopped', 'interrupted'].includes(run.phase) || run.status === 'failed'
  return <section className="mx-auto mb-3 w-full max-w-3xl rounded-pi-lg border border-pi-border-soft bg-pi-bg1/80 px-3 py-2.5 shadow-sm" aria-label="当前运行状态">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <RunTimeline phase={run.phase} compact />
        <span className="truncate text-[11px] text-pi-dim" title={run.messagePreview}>{run.messagePreview || (failed ? '运行未完成' : '正在处理…')}</span>
      </div>
      {active && onStop && <button type="button" onClick={onStop} className="inline-flex items-center gap-1 rounded-pi-md border border-pi-border-soft px-2 py-1 text-[11px] text-pi-dim hover:text-pi-text" aria-label="停止运行"><Square className="h-3 w-3" />停止</button>}
      {failed && onRetry && <button type="button" onClick={() => onRetry(run)} className="inline-flex items-center gap-1 rounded-pi-md border border-pi-border-soft px-2 py-1 text-[11px] text-pi-dim hover:text-pi-text" aria-label="重试运行"><RotateCcw className="h-3 w-3" />重试</button>}
    </div>
    <div className="mt-2"><RunContextSummary run={run} sessionId={sessionId!} /></div>
    {failed && run.error && <div className="mt-2 text-[11px] text-pi-error">失败：{run.error}</div>}
  </section>
}
