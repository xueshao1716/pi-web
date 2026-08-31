import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createRunEventLog } from '../../engine/run-event-log.mjs'

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piweb-run-events-'))
  let tick = 0
  const log = createRunEventLog({ rootDir, now: () => `2026-08-31T10:00:0${tick++}.000Z` })
  return { rootDir, log, cleanup: () => fs.rmSync(rootDir, { recursive: true, force: true }) }
}

test('append 为单个 run 生成连续 seq，readAfter 精确重放游标之后事件', () => {
  const { log, cleanup } = fixture()
  try {
    const first = log.append({ runId: 'run-1', sessionId: 'session-1', type: 'delta', data: { text: 'A' } })
    const second = log.append({ runId: 'run-1', sessionId: 'session-1', type: 'delta', data: { text: 'B' } })
    const other = log.append({ runId: 'run-2', sessionId: 'session-2', type: 'done', data: {} })

    assert.equal(first.seq, 1)
    assert.equal(second.seq, 2)
    assert.equal(other.seq, 1)
    assert.deepEqual(log.readAfter('run-1', 1), [second])
    assert.equal(log.getLastSeq('run-1'), 2)
  } finally { log.close(); cleanup() }
})

test('读取忽略 JSONL 尾部半行，后续 append 仍产生合法新事件', () => {
  const { rootDir, log, cleanup } = fixture()
  try {
    log.append({ runId: 'run-1', sessionId: 'session-1', type: 'delta', data: { text: 'A' } })
    const file = path.join(rootDir, 'events', 'run-1.jsonl')
    fs.appendFileSync(file, '{"v":1,"broken"', 'utf8')

    assert.equal(log.getLastSeq('run-1'), 1)
    const second = log.append({ runId: 'run-1', sessionId: 'session-1', type: 'done', data: {} })
    assert.equal(second.seq, 2)
    assert.deepEqual(log.readAfter('run-1', 0).map(event => event.seq), [1, 2])
  } finally { log.close(); cleanup() }
})

test('尾行 JSON 完整但缺少换行时 append 保留该事件', () => {
  const { rootDir, log, cleanup } = fixture()
  try {
    const file = path.join(rootDir, 'events', 'run-1.jsonl')
    const first = { v: 1, runId: 'run-1', sessionId: 'session-1', seq: 1, type: 'delta', ts: '2026-08-31T10:00:00.000Z', data: { text: 'A' } }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(first), 'utf8')

    const second = log.append({ runId: 'run-1', sessionId: 'session-1', type: 'done', data: {} })

    assert.equal(second.seq, 2)
    assert.deepEqual(log.readAfter('run-1', 0).map(event => event.seq), [1, 2])
  } finally { log.close(); cleanup() }
})

test('subscriber 只在事件成功落盘后收到通知，取消订阅后不再收到', () => {
  const { rootDir, log, cleanup } = fixture()
  try {
    const observed = []
    const unsubscribe = log.subscribe('run-1', event => {
      const file = path.join(rootDir, 'events', 'run-1.jsonl')
      const persisted = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).some(line => {
        try { return JSON.parse(line).seq === event.seq } catch { return false }
      })
      observed.push({ event, persisted })
    })

    const first = log.append({ runId: 'run-1', sessionId: 'session-1', type: 'delta', data: { text: 'A' } })
    unsubscribe()
    log.append({ runId: 'run-1', sessionId: 'session-1', type: 'done', data: {} })

    assert.deepEqual(observed, [{ event: first, persisted: true }])
  } finally { log.close(); cleanup() }
})
