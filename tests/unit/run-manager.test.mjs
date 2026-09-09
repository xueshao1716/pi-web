import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'

import { createRunStore } from '../../engine/run-store.mjs'
import { createRunEventLog } from '../../engine/run-event-log.mjs'
import { createRunManager } from '../../engine/run-manager.mjs'

const tick = () => new Promise(resolve => setImmediate(resolve))
async function waitFor(check, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    const value = check()
    if (value) return value
    await tick()
  }
  throw new Error('condition_not_met')
}

function fixture(executeChat, options = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piweb-run-manager-'))
  let id = 0
  const store = createRunStore({ rootDir, idFactory: () => `run-${++id}` })
  const eventLog = createRunEventLog({ rootDir })
  const manager = createRunManager({ store, eventLog, executeChat, instanceId: 'instance-a', ...options })
  return { rootDir, store, eventLog, manager, cleanup: () => { eventLog.close(); fs.rmSync(rootDir, { recursive: true, force: true }) } }
}

test('聊天记录提交后才发布 session_updated，且事件账本保留顺序', async () => {
  const fx = fixture(async (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.end()
  })
  try {
    const run = fx.manager.create({ sessionId: 'session-1', clientRequestId: 'request-1', message: 'hello' })
    await waitFor(() => fx.manager.get(run.id)?.status === 'completed')
    const events = fx.manager.readAfter(run.id, 0)
    const sessionUpdated = events.findIndex(event => event.type === 'session_updated')
    const completed = events.findIndex(event => event.type === 'completed')
    assert.ok(sessionUpdated >= 0)
    assert.ok(sessionUpdated < completed)
  } finally { fx.cleanup() }
})
test('create 立即返回，后台执行完成且全部事件可重放', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const fx = fixture(async (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write('event: delta\ndata: {"text":"A"}\n\n')
    await gate
    res.write('event: done\ndata: {"sessionId":"session-1"}\n\n')
    res.end()
  })
  try {
    const run = fx.manager.create({ sessionId: 'session-1', clientRequestId: 'request-1', message: 'hello' })
    assert.equal(run.status, 'queued')
    await waitFor(() => fx.manager.get(run.id)?.status === 'running')
    release()
    await waitFor(() => fx.manager.get(run.id)?.status === 'completed')

    const events = fx.manager.readAfter(run.id, 0)
    assert.ok(events.some(event => event.type === 'delta' && event.data.text === 'A'))
    assert.ok(events.some(event => event.type === 'done'))
    assert.equal(events.at(-1).type, 'completed')
  } finally { fx.cleanup() }
})


test('取消浏览器订阅不会关闭后台请求或停止 run', async () => {
  let closeCount = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  const fx = fixture(async (req, res) => {
    req.on('close', () => { closeCount++ })
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    await gate
    res.write('event: done\ndata: {}\n\n')
    res.end()
  })
  try {
    const run = fx.manager.create({ sessionId: 'session-1', clientRequestId: 'request-1', message: 'hello' })
    await waitFor(() => fx.manager.get(run.id)?.status === 'running')
    const unsubscribe = fx.manager.subscribe(run.id, () => {})
    unsubscribe()
    await tick()
    assert.equal(closeCount, 0)
    assert.equal(fx.manager.get(run.id).status, 'running')
    release()
    await waitFor(() => fx.manager.get(run.id)?.status === 'completed')
  } finally { fx.cleanup() }
})

test('stop 幂等且只有显式 stop 会关闭一次后台请求', async () => {
  let closeCount = 0
  const fx = fixture(async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    await once(req, 'close')
    closeCount++
    res.end()
  })
  try {
    const run = fx.manager.create({ sessionId: 'session-1', clientRequestId: 'request-1', message: 'hello' })
    await waitFor(() => fx.manager.get(run.id)?.status === 'running')
    fx.manager.stop(run.id)
    fx.manager.stop(run.id)
    await waitFor(() => fx.manager.get(run.id)?.status === 'stopped')
    assert.equal(closeCount, 1)
    assert.equal(fx.manager.stop(run.id).status, 'stopped')
  } finally { fx.cleanup() }
})

test('同 session 的第二个 active run 返回 session_busy', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const fx = fixture(async (_req, res) => { res.writeHead(200); await gate; res.end() })
  try {
    const first = fx.manager.create({ sessionId: 'session-1', clientRequestId: 'request-1', message: 'first' })
    assert.throws(
      () => fx.manager.create({ sessionId: 'session-1', clientRequestId: 'request-2', message: 'second' }),
      error => error.code === 'session_busy' && error.activeRunId === first.id,
    )
    assert.equal(fx.manager.create({ sessionId: 'session-1', clientRequestId: 'request-1', message: 'retry' }).id, first.id)
    release()
    await waitFor(() => fx.manager.get(first.id)?.status === 'completed')
  } finally { fx.cleanup() }
})

test('后台执行结束时持久化可序列化运行观测指标', async () => {
  const fx = fixture(async (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write('event: tool\ndata: {"name":"read","id":"tool-1"}\n\n')
    res.write('event: tool_end\ndata: {"name":"read","id":"tool-1","isError":false}\n\n')
    res.write('event: done\ndata: {"model":{"provider":"provider-a","id":"model-a"}}\n\n')
    res.end()
  })
  try {
    const run = fx.manager.create({ sessionId: 'session-metrics', clientRequestId: 'request-1', message: 'metrics' })
    await waitFor(() => fx.manager.get(run.id)?.status === 'completed')
    const current = fx.manager.get(run.id)
    assert.equal(typeof current.observability.durationMs, 'number')
    assert.equal(current.observability.eventCounts.tool, 1)
    assert.equal(current.observability.eventCounts.tool_end, 1)
    assert.deepEqual(current.observability.lastModel, { provider: 'provider-a', id: 'model-a' })
    assert.deepEqual(current.observability.lastTool, { id: 'tool-1', name: 'read', status: 'completed' })
    assert.equal(current.observability.failureCategory, null)
    assert.doesNotThrow(() => JSON.stringify(current.observability))
  } finally { fx.cleanup() }
})

test('recover 标记 resumeAvailable，resume(runId) 发布事件并重新执行', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piweb-run-resume-'))
  let id = 0
  const store = createRunStore({ rootDir, idFactory: () => `run-${++id}` })
  const eventLog = createRunEventLog({ rootDir })
  const calls = []
  const executeChat = async (_req, res, body) => {
    calls.push(body)
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write('event: done\ndata: {"sessionId":"session-1"}\n\n')
    res.end()
  }
  const run = store.create({ sessionId: 'session-1', clientRequestId: 'request-1', message: 'resume me', params: { temperature: 0.2 }, ownerId: 'instance-old' })
  store.update(run.id, { status: 'running', startedAt: new Date().toISOString() })

  const newManager = createRunManager({ store, eventLog, executeChat, instanceId: 'instance-new' })
  const recovered = newManager.recover()
  assert.equal(recovered.length, 1)
  assert.equal(newManager.get(run.id).status, 'interrupted')
  assert.equal(newManager.get(run.id).resumeAvailable, true)

  const resumed = newManager.resume(run.id)
  assert.equal(resumed.status, 'queued')
  assert.equal(resumed.resumeAvailable, false)
  assert.equal(resumed.checkpoint.phase, 'resuming')
  assert.equal(resumed.checkpoint.attempt, 1)
  assert.ok(newManager.readAfter(run.id, 0).some(event => event.type === 'resumed'))

  await waitFor(() => newManager.get(run.id)?.status === 'completed')
  assert.equal(calls.at(-1).message, 'resume me')
  assert.deepEqual(calls.at(-1).params, { temperature: 0.2 })
  assert.equal(newManager.get(run.id).resumeAvailable, false)
  assert.equal(newManager.resume(run.id).status, 'completed')
  eventLog.close()
  fs.rmSync(rootDir, { recursive: true, force: true })
})
