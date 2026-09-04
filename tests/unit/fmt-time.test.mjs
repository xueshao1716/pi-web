import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtMsgTime, dayLabel, sameDayStr } from '../../frontend/src/lib/fmt-time.ts'

// 固定"现在"：2026-09-04 20:58 本地时间
const NOW = new Date(2026, 8, 4, 20, 58, 0) // 月份 0 基：8 = 9 月

const at = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi).getTime()

test('fmtMsgTime：当天只显时刻', () => {
  assert.equal(fmtMsgTime(at(2026, 8, 4, 20, 58), NOW), '20:58')
  assert.equal(fmtMsgTime(at(2026, 8, 4, 8, 5), NOW), '08:05')
})

test('fmtMsgTime：昨天补"昨天"前缀', () => {
  assert.equal(fmtMsgTime(at(2026, 8, 3, 14, 32), NOW), '昨天 14:32')
})

test('fmtMsgTime：今年内补月日', () => {
  assert.equal(fmtMsgTime(at(2026, 0, 15, 9, 1), NOW), '1月15日 09:01')
  assert.equal(fmtMsgTime(at(2026, 7, 31, 23, 59), NOW), '8月31日 23:59')
})

test('fmtMsgTime：跨年补全年', () => {
  assert.equal(fmtMsgTime(at(2025, 11, 31, 12, 0), NOW), '2025年12月31日 12:00')
})

test('dayLabel：今天/昨天/今年/跨年/星期', () => {
  assert.equal(dayLabel(at(2026, 8, 4, 9, 0), NOW), '今天')
  assert.equal(dayLabel(at(2026, 8, 3, 9, 0), NOW), '昨天')
  assert.equal(dayLabel(at(2026, 0, 15, 9, 0), NOW), '1月15日 周四')
  assert.equal(dayLabel(at(2025, 11, 31, 9, 0), NOW), '2025年12月31日 周三')
})

test('sameDayStr：同日 true / 跨日 false / 缺失容忍', () => {
  assert.equal(sameDayStr(at(2026, 8, 4, 1, 0), at(2026, 8, 4, 23, 0)), true)
  assert.equal(sameDayStr(at(2026, 8, 3, 10, 0), at(2026, 8, 4, 10, 0)), false)
  assert.equal(sameDayStr(undefined, at(2026, 8, 4, 10, 0)), true)
})
