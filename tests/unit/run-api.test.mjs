import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { createRunApi } from '../../engine/run-api.mjs'

class FakeResponse extends EventEmitter {
  constructor() { super(); this.statusCode = 0; this.headers = {}; this.chunks = []; this.writableEnded = false }
  setHeader(name, value) { this.headers[name.toLowerCase()] = value }
  writeHead(code, headers = {}) { this.statusCode = code; for (const [name, value] of Object.entries(headers)) this.setHeader(name, value) }
  write(chunk) { this.chunks.push(String(chunk)); return true }
  end(chunk) { if (chunk) this.write(chunk); this.writableEnded = true; this.emit('finish') }
  text() { return this.chunks.join('') }
}

function fakeJson(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(value))
}

test('create 返回 202；session_busy 返回 409 与 activeRunId', async () => {
  const manager = {
    create(body) {
      if (body.message === 'busy') throw Object.assign(new Error('busy'), { code: 'session_busy', activeRunId: 'run-active' })
      return { id: 'run-1', sessionId: body.sessionId, status: 'queued' }
    },
  }
  const api = createRunApi({ manager, json: fakeJson })
  const ok = new FakeResponse()
  await api.create(ok, { sessionId: 'session-1', message: 'hello', clientRequestId: 'request-1' })
  assert.equal(ok.statusCode, 202)
  assert.deepEqual(JSON.parse(ok.text()), { runId: 'run-1', sessionId: 'session-1', status: 'queued', lastSeq: 0 })

  const busy = new FakeResponse()
  await api.create(busy, { sessionId: 'session-1', message: 'busy', clientRequestId: 'request-2' })
  assert.equal(busy.statusCode, 409)
  assert.equal(JSON.parse(busy.text()).activeRunId, 'run-active')
})

test('events 取 after 与 Last-Event-ID 较大值，写标准 SSE 并先重放后推送', async () => {
  let listener
  let unsubscribed = false
  const manager = {
    get: id => id === 'run-1' ? { id, status: 'running' } : null,
    readAfter: (_id, after) => {
      assert.equal(after, 2)
      return [{ v: 1, runId: 'run-1', sessionId: 'session-1', seq: 3, type: 'delta', ts: 'now', data: { text: 'A' } }]
    },
    subscribe: (_id, fn) => { listener = fn; return () => { unsubscribed = true } },
  }
  const api = createRunApi({ manager, json: fakeJson })
  const req = new EventEmitter()
  req.headers = { 'last-event-id': '2' }
  const res = new FakeResponse()
  const url = new URL('http://localhost/api/runs/run-1/events?after=1')

  api.events(res, req, url, 'run-1')
  listener({ v: 1, runId: 'run-1', sessionId: 'session-1', seq: 4, type: 'done', ts: 'now', data: {} })

  const text = res.text()
  assert.match(text, /id: 3\nevent: delta\ndata: /)
  assert.match(text, /id: 4\nevent: done\ndata: /)
  assert.ok(text.indexOf('id: 3') < text.indexOf('id: 4'))
  req.emit('close')
  assert.equal(unsubscribed, true)
})

test('stop API 只委托 manager.stop，不与 SSE 连接生命周期耦合', async () => {
  let stopped = 0
  const manager = { stop: id => { stopped++; return { id, status: 'stopping' } } }
  const api = createRunApi({ manager, json: fakeJson })
  const res = new FakeResponse()
  await api.stop(res, 'run-1')
  assert.equal(stopped, 1)
  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.text()).status, 'stopping')
})
