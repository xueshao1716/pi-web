import { Brain, HeartPulse, Wrench } from 'lucide-react'
import useSWR from 'swr'
import { EmotionApi, type RunSummary } from '../api'

export default function RunContextSummary({ run, sessionId }: { run: RunSummary; sessionId: string }) {
  const { data } = useSWR(sessionId ? `emotion:${sessionId}` : null, () => EmotionApi.get(sessionId), { refreshInterval: 8000, revalidateOnFocus: false })
  const emotion = data?.state || data
  const emotionLabel = emotion?.label || emotion?.name || emotion?.mood || emotion?.emotion
  const memoryCount = (run as RunSummary & { memoryCount?: number }).memoryCount
  return <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-pi-dim2">
    {typeof memoryCount === 'number' && <span className="inline-flex items-center gap-1 rounded-full border border-pi-border-soft px-2 py-1"><Brain className="h-3.5 w-3.5 text-pi-accent" />记忆命中 {memoryCount}</span>}
    {emotionLabel && <span className="inline-flex items-center gap-1 rounded-full border border-pi-border-soft px-2 py-1"><HeartPulse className="h-3.5 w-3.5 text-pi-pink" />情绪 {String(emotionLabel)}</span>}
    <span className="inline-flex items-center gap-1 rounded-full border border-pi-border-soft px-2 py-1"><Wrench className="h-3.5 w-3.5 text-pi-warning" />工具 {run.toolCount}</span>
  </div>
}
