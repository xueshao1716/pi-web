import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nativeImeToCss } from '../../frontend/src/lib/viewport.ts'

test('原生 IME 超过整屏 CSS 高度时按 DPR 折成 CSS 像素（荣耀畅玩 HD+ 物理像素坑）', () => {
  const css = nativeImeToCss(800, 640, 2)
  assert.ok(css < 450, `物理像素 800 不得当 CSS 800 用，实际 ${css}`)
  assert.ok(css > 200, `折算后不能小到看不见键盘，实际 ${css}`)
})

test('已经是 CSS 像素的 IME 高度不得再除一次 DPR', () => {
  assert.equal(nativeImeToCss(280, 640, 3), 280)
  assert.equal(nativeImeToCss(300, 720, 2), 300)
})

test('IME 高度封顶，避免 visble viewport 被扣成 0 把输入框弹到屏幕顶', () => {
  const layout = 640
  const css = nativeImeToCss(2000, layout, 2)
  assert.ok(css <= layout * 0.45 + 1e-6, `封顶后仍过大: ${css}`)
  assert.ok(layout - css >= layout * 0.55 - 1e-6, '至少留出五成半高度给对话和输入框')
})
