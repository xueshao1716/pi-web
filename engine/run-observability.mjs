const PHASE_BY_EVENT = new Map([
  ['run_started', 'executing'],
  ['reasoning', 'thinking'],
  ['tool_started', 'executing'],
  ['tool_finished', 'executing'],
  ['handoff', 'executing'],
  ['memory_written', 'remembering'],
  ['artifact_created', 'delivering'],
  ['session_updated', 'delivering'],
  ['completed', 'completed'],
  ['failed', 'failed'],
  ['stopped', 'stopped'],
  ['interrupted', 'interrupted'],
])

const ACTIVE = new Set(['queued', 'running', 'stopping'])

export function phaseFromEvent(type) {
  return PHASE_BY_EVENT.get(String(type || '')) || 'executing'
}

function latestPhase(run, events) {
  const lastEvent = events.at(-1)
  if (lastEvent?.type) return phaseFromEvent(lastEvent.type)
  if (run?.status === 'queued') return 'queued'
  if (run?.status === 'running' || run?.status === 'stopping') return 'executing'
  return phaseFromEvent(run?.status)
}

export function summarizeRun(run, events = []) {
  const list = Array.isArray(events) ? events : []
  const toolCount = list.filter(event => event?.type === 'tool_started').length
  const lastError = [...list].reverse().find(event => event?.type === 'error' || event?.type === 'failed')
  const error = run?.error || lastError?.data?.message || lastError?.data?.error || null
  return {
    id: run?.id || '',
    sessionId: run?.sessionId || '',
    status: run?.status || 'unknown',
    phase: latestPhase(run, list),
    messagePreview: run?.input?.messagePreview || '',
    toolCount,
    error: error ? String(error).slice(0, 240) : null,
  }
}

export function buildRunSnapshot(runs = [], eventsByRun = new Map()) {
  const list = Array.isArray(runs) ? runs : []
  const sorted = [...list].sort((a, b) => String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || '')))
  const summaries = sorted.map(run => summarizeRun(run, eventsByRun.get(run.id) || []))
  const active = summaries.filter(run => ACTIVE.has(run.status))
  const failedCount = summaries.filter(run => ['failed', 'interrupted'].includes(run.status)).length
  return {
    active,
    recent: summaries.slice(0, 8),
    health: {
      status: active.length ? 'busy' : failedCount ? 'degraded' : 'idle',
      activeCount: active.length,
      failedCount,
    },
  }
}
