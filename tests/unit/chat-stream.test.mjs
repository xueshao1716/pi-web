import test from 'node:test'
import assert from 'node:assert/strict'

import { upsertRunningTool } from '../../frontend/src/lib/chat-stream.ts'

test('同一 toolCallId 的重复 tool start 更新原工具而不新增', () => {
  const started = upsertRunningTool([], { id: 'call-a', name: 'bash', args: { command: 'echo first' } })
  const updated = upsertRunningTool(started, { id: 'call-a', name: 'bash', args: { command: 'echo second' } })

  assert.equal(updated.length, 1)
  assert.equal(updated[0].id, 'call-a')
  assert.equal(updated[0].argsText, 'echo second')
})

test('重复 tool start 不清空已经收到的输出或终态', () => {
  const existing = [{
    id: 'call-a',
    name: 'bash',
    argsText: 'echo first',
    output: 'done',
    running: false,
    status: 'completed',
  }]

  const updated = upsertRunningTool(existing, { id: 'call-a', name: 'bash', args: { command: 'echo first' } })

  assert.equal(updated.length, 1)
  assert.equal(updated[0].output, 'done')
  assert.equal(updated[0].running, false)
  assert.equal(updated[0].status, 'completed')
})

test('不同 toolCallId 即使命令参数相同也分别保留', () => {
  const first = upsertRunningTool([], { id: 'call-a', name: 'bash', args: { command: 'pwd' } })
  const second = upsertRunningTool(first, { id: 'call-b', name: 'bash', args: { command: 'pwd' } })

  assert.deepEqual(second.map(tool => tool.id), ['call-a', 'call-b'])
  assert.equal(second[0].argsText, second[1].argsText)
})
