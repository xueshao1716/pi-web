import type { RunOverview } from '../api'
import WorkExplanation from './WorkExplanation'

export default function WorkExplanationList({ data, error, onOpenSession }: { data?: RunOverview; error?: unknown; onOpenSession: (id: string) => void }) {
  const runs = data ? [...new Map([...data.active, ...data.recent].map(run => [run.id, run])).values()].slice(0, 4) : []
  return <section aria-label="近期工作说明" className="space-y-3 min-w-0">
    <h2 className="text-sm font-semibold text-pi-text">近期工作说明</h2>
    {error ? <p role="alert" className="text-sm text-pi-danger">工作记录暂时无法读取{data ? '，以下为上次读取的记录。' : '，请稍后刷新。'}</p> : !data ? <p role="status" className="text-sm text-pi-dim">正在整理工作记录…</p> : !runs.length ? <p className="text-sm text-pi-dim">尚无运行记录，开始任务后会在这里说明进展和结果。</p> : null}
    {runs.map(run => <div key={run.id} className="min-w-0"><WorkExplanation run={run} /><button type="button" disabled={!run.sessionId} className="btn-ghost min-h-11 mt-1 text-xs" onClick={() => onOpenSession(run.sessionId)}>打开对应会话</button></div>)}
  </section>
}
