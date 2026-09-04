// ── 智能时间格式化（2026-09-04，修"聊天只显示几点没有几日"的坑）──
// 数据层 JSONL 一直是完整 ISO 时间戳，展示层此前只 toLocaleTimeString 截成裸时刻，
// 跨天会话无法分辨时间点。约定：
//   当天   → 20:58
//   昨天   → 昨天 20:58
//   今年内 → 9月3日 20:58
//   跨年   → 2025年12月31日 20:58
// 日期分组条用 dayLabel：今天 / 昨天 / 9月3日 周四 / 2025年12月31日 周三

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function yday(d: Date): Date {
  const c = new Date(d)
  c.setDate(c.getDate() - 1)
  return c
}

function hhmm(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

function md(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function full(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/** 消息行内时间：当天只显时刻，跨天自动补日期 */
export function fmtMsgTime(ts: string | number | Date, now: Date = new Date()): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  if (sameDay(d, now)) return hhmm(d)
  if (sameDay(d, yday(now))) return `昨天 ${hhmm(d)}`
  if (d.getFullYear() === now.getFullYear()) return `${md(d)} ${hhmm(d)}`
  return `${full(d)} ${hhmm(d)}`
}

/** 日期分组条文案 */
export function dayLabel(ts: string | number | Date, now: Date = new Date()): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const w = WEEK[d.getDay()]
  if (sameDay(d, now)) return '今天'
  if (sameDay(d, yday(now))) return '昨天'
  if (d.getFullYear() === now.getFullYear()) return `${md(d)} ${w}`
  return `${full(d)} ${w}`
}

/** 两个时间戳是否同一自然日（本地时区），用于消息流插分隔条 */
export function sameDayStr(a: string | number | Date | undefined, b: string | number | Date | undefined): boolean {
  if (a == null || b == null) return true
  const da = new Date(a); const db = new Date(b)
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return true
  return sameDay(da, db)
}
