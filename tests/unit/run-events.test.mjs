import test from 'node:test'
import assert from 'node:assert/strict'

import { advanceRunCursor, parseSseBlocks } from '../../frontend/src/lib/run-events.ts'

test('同一 run 的重复 seq 只接受一次，跳号按到达顺序推进', () => {
  let cursor = { runId: 'run-1', lastSeq: 0, status: 'running' }
  const accepted = []
  for (const event of [
    { runId: 'run-1', seq: 1, type: 'delta', data: { text: 'A' } },
    { runId: 'run-1', seq: 1, type: 'delta', data: { text: 'A' } },
    { runId: 'run-1', seq: 3, type: 'tool', data: { id: 'call-a' } },
    { runId: 'run-1', seq: 2, type: 'tool', data: { id: 'call-a' } },
  ]) {
    const result = advanceRunCursor(cursor, event)
    cursor = result.cursor
    if (result.accepted) accepted.push(event.type)
  }

  assert.deepEqual(accepted, ['delta', 'tool'])
  assert.equal(cursor.lastSeq, 3)
})

test('completed stopped failed interrupted 归一为终态', () => {
  for (const status of ['completed', 'stopped', 'failed', 'interrupted']) {
    const result = advanceRunCursor(
      { runId: 'run-1', lastSeq: 4, status: 'running' },
      { runId: 'run-1', seq: 5, type: status, data: {} },
    )
    assert.equal(result.accepted, true)
    assert.equal(result.cursor.status, status)
    assert.equal(result.terminal, true)
  }
})

test('SSE parser 解析 id/event/data envelope 并保留不完整尾块', () => {
  const first = parseSseBlocks('id: 1\nevent: delta\ndata: {"runId":"run-1","seq":1,"type":"delta","data":{"text":"A"}}\n\nid: 2\nevent: tool\ndata: {"runId":"run-1"')
  assert.equal(first.events.length, 1)
  assert.equal(first.events[0].seq, 1)
  assert.match(first.rest, /^id: 2/)

  const second = parseSseBlocks(first.rest + ',"seq":2,"type":"tool","data":{"id":"call-a"}}\n\n')
  assert.equal(second.events.length, 1)
  assert.equal(second.events[0].type, 'tool')
  assert.equal(second.rest, '')
})
