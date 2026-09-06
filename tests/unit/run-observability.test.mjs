import test from 'node:test'
import assert from 'node:assert/strict'

import { buildRunSnapshot, phaseFromEvent, summarizeRun } from '../../engine/run-observability.mjs'

test('events map to stable user-facing phases', () => {
  assert.equal(phaseFromEvent('run_started'), 'executing')
  assert.equal(phaseFromEvent('tool_started'), 'executing')
  assert.equal(phaseFromEvent('session_updated'), 'delivering')
  assert.equal(phaseFromEvent('completed'), 'completed')
  assert.equal(phaseFromEvent('failed'), 'failed')
})

test('summarizeRun includes current phase and safe error preview', () => {
  const summary = summarizeRun(
    { id: 'r1', status: 'failed', sessionId: 's1', input: { messagePreview: '做个总结' }, error: '模型失败' },
    [{ type: 'run_started' }, { type: 'tool_started', data: { name: 'read' } }, { type: 'failed', data: { message: '模型失败' } }],
  )

  assert.deepEqual(summary, {
    id: 'r1', sessionId: 's1', status: 'failed', phase: 'failed',
    messagePreview: '做个总结', toolCount: 1, memoryCount: 0, memoryPreview: null, error: '模型失败',
  })
})

test('summarizeRun counts memory writes and keeps a safe context preview', () => {
  const summary = summarizeRun(
    { id: 'r2', status: 'completed', sessionId: 's2', input: { messagePreview: '继续' } },
    [
      { type: 'memory_written', data: { count: 2, preview: '用户偏好简洁回答' } },
      { type: 'completed' },
    ],
  )
  assert.equal(summary.memoryCount, 2)
  assert.equal(summary.memoryPreview, '用户偏好简洁回答')
})

test('buildRunSnapshot returns empty overview without active runs', () => {
  assert.deepEqual(buildRunSnapshot([], new Map()), {
    active: [], recent: [], health: { status: 'idle', activeCount: 0, failedCount: 0 },
  })
})
