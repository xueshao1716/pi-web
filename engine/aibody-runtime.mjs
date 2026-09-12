import { randomUUID } from 'node:crypto'
import { createAIBodyStore } from './aibody-runtime-store.mjs'
import { EVIDENCE, ROLES, text, chooseMode, directiveFor, eventData, providerState } from './aibody-runtime-policy.mjs'

const clone = value => JSON.parse(JSON.stringify(value))
const bounds = (value, fallback, ceiling) => Number.isFinite(Number(value)) ? Math.max(1, Math.min(ceiling, Math.floor(Number(value)))) : fallback
const counts = () => ({ tools: 0, subagents: 0, memoryWrites: 0, artifacts: 0, verifications: 0 })
const publicRun = run => { if (!run) return null; const { _seen, ...value } = run; return clone(value) }

/** Host independent coordination: it observes work, never executes tools or approves evolution. */
export function createAIBodyRuntime({ rootDir, readState, now = () => new Date().toISOString(), maxRuns = 100, maxEvents = 40 } = {}) {
  const clock = () => new Date(now()).toISOString()
  maxRuns = bounds(maxRuns, 100, 100); maxEvents = bounds(maxEvents, 40, 40)
  const store = createAIBodyStore({ rootDir, now: clock, maxRuns, maxEvents })
  function beginTurn(input = {}) {
    const runId = text(input.runId || randomUUID(), 96), sessionId = text(input.sessionId, 96)
    if (!sessionId) throw new Error('aibody_sessionId_required')
    const existing = store.get(runId)
    if (existing) {
      if (existing.sessionId !== sessionId) throw new Error('aibody_runId_conflict')
      return { ...publicRun(existing), directive: directiveFor(existing, null, providerState(readState, { sessionId, runId })) }
    }
    const previous = store.list().filter(run => run.sessionId === sessionId).at(-1)
    const message = text(input.message, 2048)
    const choice = chooseMode(message, input.signals, previous)
    const startedAt = clock()
    const run = { runId, sessionId, engine: text(input.engine, 80), source: text(input.source || 'chat', 40),
      mode: choice.mode, status: 'running', phase: 'planning', topic: choice.inherited ? previous.topic : text(message, 180),
      startedAt, updatedAt: startedAt, finishedAt: null, summary: '', error: null,
      continuity: { inheritedFrom: choice.inherited ? previous.runId : null, recentRunId: previous?.runId || null },
      evidence: counts(), events: [], _seen: [],
    }
    store.save(run)
    return { ...publicRun(run), directive: directiveFor(run, previous, providerState(readState, { sessionId, runId }), input.signals) }
  }
  function observe(runId, type, data = {}) {
    const run = store.get(text(runId, 96))
    if (!run || run.status !== 'running') return null
    const clean = eventData(type, data)
    if (!clean) return null
    const key = `${type}:${clean.id || clean.path || `${run.events.at(-1)?.seq || 0}`}`
    const seen = run._seen || (run._seen = [])
    if (EVIDENCE[type] && !seen.includes(key)) {
      run.evidence[EVIDENCE[type]]++
      seen.push(key)
      if (seen.length > 256) seen.shift()
    }
    run.phase = type === 'plan' ? 'planning' : type === 'verification' ? 'checking' : 'executing'
    run.updatedAt = clock()
    run.events.push({ seq: (run.events.at(-1)?.seq || 0) + 1, type, ts: run.updatedAt, data: clean })
    run.events = run.events.slice(-maxEvents)
    store.save(run)
    return publicRun(run)
  }
  function finishTurn(runId, { status = 'completed', summary = '', error = null } = {}) {
    const run = store.get(text(runId, 96))
    if (!run) return null
    if (run.status !== 'running') return publicRun(run)
    if (!['completed', 'failed', 'cancelled', 'interrupted'].includes(status)) throw new Error('aibody_invalid_status')
    Object.assign(run, { status, phase: status === 'completed' ? 'reporting' : status, summary: text(summary, 600), error: error ? text(error, 300) : null, finishedAt: clock() })
    run.updatedAt = run.finishedAt
    store.save(run)
    return publicRun(run)
  }
  function overview({ sessionId, runId, limit = 20 } = {}) {
    const selected = store.list().filter(run => (!sessionId || run.sessionId === text(sessionId, 96)) && (!runId || run.runId === text(runId, 96))).slice().reverse()
    const runs = selected.slice(0, bounds(limit, 20, 100)).map(publicRun)
    const currentRun = publicRun(selected.find(run => run.status === 'running') || selected[0])
    const context = { sessionId: sessionId || currentRun?.sessionId, runId: runId || currentRun?.runId }
    const totals = { scope: 'retained_runs', runs: selected.length, running: 0, completed: 0, failed: 0, cancelled: 0, interrupted: 0, ...counts() }
    for (const run of selected) { totals[run.status]++; for (const key of Object.values(EVIDENCE)) totals[key] += run.evidence[key] || 0 }
    const roles = ROLES.map(role => {
      const observedRun = selected.find(run => ['mother', 'sovereign'].includes(role.id) || run.events.some(event => event.type === 'subagent' && event.data.role === role.id))
      return { ...role, presence: observedRun ? 'observed' : 'not_observed', lastRunId: observedRun?.runId || null, lastObservedAt: observedRun?.updatedAt || null }
    })
    const engines = [...new Set(selected.map(run => run.engine).filter(Boolean))].map(id => {
      const engineRuns = selected.filter(run => run.engine === id)
      return { id, name: id, presence: 'observed', runs: engineRuns.length, lastRunId: engineRuns[0].runId, lastObservedAt: engineRuns[0].updatedAt }
    })
    const state = providerState(readState, context)
    const layers = [
      { id: 'host', label: '宿主 / 运行层', summary: '模型、工具与运行时提供行动边界。', modules: engines.map(engine => ({ label: engine.name, path: engine.id, available: true })) },
      { id: 'organism', label: '母体 / 进化层', summary: '身份、基因、记忆、情绪与治理形成连续性。', modules: Object.entries(state).map(([id, value]) => ({ label: id, path: `aibody:${id}`, available: value.status === 'observed' })) },
      { id: 'expression', label: '表现 / 具身层', summary: '对话、任务与交付把系统状态呈现出来。', modules: [{ label: '主任务协调', path: 'aibody-runtime', available: runs.length > 0 }] },
    ]
    return { version: 1, observedAt: clock(), continuity: store.continuity(), state, currentRun, runs, roles, engines, totals,
      principle: 'AIBody 贯穿人格、任务、记忆、角色协作与治理；验收页只是观察入口。',
      companionship: {
        continuity: '同一会话承接已记录主题与状态',
        memory: '记忆可查看、可纠正、可由用户控制',
        boundary: '不模拟情感依赖，不替用户做价值判断',
      },
      evolution: {
        mode: '提案制迭代', humanApproval: true, rollback: true,
        scope: ['技能', '经验', '记忆', '工作方式'], protected: ['人格', '身份', '高风险权限'],
      },
      theory: [
        { id: 'continuity', label: '连续性', detail: '每轮承接同会话状态，重启后恢复未完成记录。', evidence: ['aibody-runtime', 'memory', 'emotion'] },
        { id: 'orchestration', label: '母体统筹', detail: '主角色负责规划与交付，子角色按需协作并受边界约束。', evidence: ['aibody-runtime', 'subagent-traces'] },
        { id: 'governance', label: '可治理', detail: '真实事件可追踪；人格与提案仍需原有人工审批。', evidence: ['gene', 'approval'] },
      ], layers }
  }
  return { beginTurn, observe, finishTurn, overview, getRun: runId => publicRun(store.get(text(runId, 96))) }
}
