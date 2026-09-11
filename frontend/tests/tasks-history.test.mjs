import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/Tasks.tsx', import.meta.url), 'utf8')

test('运行历史采用分组卡片并提供可扫描的摘要', () => {
  for (const marker of [
    'task-history',
    '按日期分组',
    '最近运行',
    '成功',
    '耗时',
    '任务结果',
    'aria-expanded',
  ]) assert.ok(source.includes(marker), `缺少历史视觉契约：${marker}`)
})

test('历史卡片保留失败与停止状态的语义色', () => {
  for (const marker of ["error: { label: '失败'", "stopped: { label: '已停止'", "stop_requested: { label: '停止中'"]) {
    assert.ok(source.includes(marker), `缺少状态语义：${marker}`)
  }
  assert.ok(source.includes('任务结果'))
})
