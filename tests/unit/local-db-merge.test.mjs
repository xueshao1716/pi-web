import test from 'node:test'
import assert from 'node:assert/strict'

import { mergeMessages } from '../../frontend/src/lib/local-db.ts'

const localMessage = (overrides = {}) => ({
  id: 'local-message',
  sessionId: 'session-1',
  role: 'assistant',
  text: '',
  ts: '2026-08-31T10:00:00.000Z',
  synced: false,
  draft: true,
  ...overrides,
})

const serverMessage = (overrides = {}) => ({
  id: 'server-message',
  sessionId: 'session-1',
  role: 'assistant',
  text: '',
  ts: '2026-08-31T10:00:01.000Z',
  ...overrides,
})

const toolIds = messages => messages.flatMap(message => (message.tools || []).map(tool => tool.id))

test('本地空文本工具消息与不同 message id 的服务端消息按 toolCallId 合并', () => {
  const merged = mergeMessages(
    [localMessage({ tools: [{ id: 'call-a', name: 'bash', argsText: 'pwd', output: '', running: true }] })],
    [serverMessage({ tools: [{ id: 'call-a', name: 'bash', args: { command: 'pwd' }, output: '/workspace', isError: false }] })],
  )

  assert.equal(merged.length, 1)
  assert.deepEqual(toolIds(merged), ['call-a'])
  assert.equal(merged[0].tools[0].output, '/workspace')
  assert.equal(merged[0].draft, true)
})

test('本地聚合工具与服务端分段消息归并后每个 toolCallId 仅一份且最终结果不丢', () => {
  const merged = mergeMessages(
    [localMessage({
      tools: [
        { id: 'call-a', name: 'bash', argsText: 'echo same', output: '', running: true },
        { id: 'call-b', name: 'bash', argsText: 'echo same', output: '', running: true },
      ],
    })],
    [
      serverMessage({ id: 'server-a', tools: [{ id: 'call-a', name: 'bash', args: { command: 'echo same' }, output: 'A done', isError: false }] }),
      serverMessage({ id: 'server-b', ts: '2026-08-31T10:00:02.000Z', tools: [{ id: 'call-b', name: 'bash', args: { command: 'echo same' }, output: 'B failed', isError: true }] }),
    ],
  )

  assert.equal(merged.length, 1)
  assert.deepEqual(toolIds(merged).sort(), ['call-a', 'call-b'])
  assert.equal(merged[0].tools.find(tool => tool.id === 'call-a').output, 'A done')
  assert.equal(merged[0].tools.find(tool => tool.id === 'call-b').output, 'B failed')
  assert.equal(merged[0].tools.find(tool => tool.id === 'call-b').isError, true)
  assert.equal(merged[0].draft, true)
})
