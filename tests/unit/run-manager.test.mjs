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

function fixture(executeChat) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piweb-run-manager-'))
  let id = 0
  const store = createRunStore({ rootDir, idFactory: () => `run-${++id}` })
  const eventLog = createRunEventLog({ rootDir })
  const manager = createRunManager({ store, eventLog, executeChat, instanceId: 'instance-a' })
  return { rootDir, store, eventLog, manager, cleanup: () => { eventLog.close(); fs.rmSync(rootDir, { recursive: true, force: true }) } }
}

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
