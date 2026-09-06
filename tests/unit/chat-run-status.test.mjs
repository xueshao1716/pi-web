import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8')

test('chat run status consumes overview and renders timeline with stop action', () => {
  const component = read('frontend/src/components/ChatRunStatus.tsx')
  const chatArea = read('frontend/src/components/ChatArea.tsx')

  assert.match(component, /RunApi\.overview/)
  assert.match(component, /RunTimeline/)
  assert.match(component, /onStop/)
  assert.match(component, /active run|activeRun|active/i)
  assert.match(chatArea, /ChatRunStatus/)
})

test('run context summary exposes memory, emotion, and tool labels safely', () => {
  const summary = read('frontend/src/components/RunContextSummary.tsx')
  const status = read('frontend/src/components/ChatRunStatus.tsx')

  assert.match(summary, /记忆|memory/i)
  assert.match(summary, /情绪|emotion/i)
  assert.match(summary, /工具|tool/i)
  assert.match(status, /RunContextSummary/)
})

test('failed run status exposes a recoverable action', () => {
  const component = read('frontend/src/components/ChatRunStatus.tsx')
  assert.match(component, /失败|failed/i)
  assert.match(component, /重试|恢复|retry|recover/i)
})
