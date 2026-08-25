// 前端结构测试（nomifun *.structure.test.ts 模式，2026-08-25）
// 断言关键交互契约在源码中存在且顺序正确——比口头约定/review 可靠。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const FE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'frontend', 'src')
const read = (...p) => readFileSync(join(FE, ...p), 'utf8')

test('结构：Markdown 自定义块必须包 SafeBlock 错误隔离（mermaid/dsh-ui/高亮代码）', () => {
  const src = read('components', 'Markdown.tsx')
  const safeCount = (src.match(/<SafeBlock/g) || []).length
  assert.ok(safeCount >= 3, `SafeBlock 应包裹 ≥3 条自定义渲染路径，实际 ${safeCount}`)
  for (const marker of ['MermaidBlock code={content} />', 'GenUIBlock raw={content} />']) {
    assert.ok(src.includes(marker), `自定义渲染 ${marker.split(' ')[0]} 必须仍在 SafeBlock 内`)
  }
  // 降级路径必须是纯文本 pre
  assert.ok(src.includes('PlainFallback'), '必须有统一纯文本降级组件')
})

test('结构：ChatArea 滚动必须走 useAutoScroll hook，禁止内联简易滚动逻辑回归', () => {
  const chat = read('components', 'ChatArea.tsx')
  assert.ok(chat.includes('useAutoScroll({'), 'ChatArea 必须使用 useAutoScroll')
  assert.ok(!chat.includes('nearBottomRef'), '旧的 nearBottomRef 简易滚动逻辑不得回归')
  assert.ok(!chat.includes('onScroll={onScroll}'), '滚动监听归 useAutoScroll，ChatArea 不得自带 onScroll')

  const hook = read('hooks', 'useAutoScroll.ts')
  // 三阈值三守卫的关键常量必须在位
  assert.ok(hook.includes('FOLLOW_BOTTOM_THRESHOLD_PX = 12'), '贴底阈值 12px（HiDPI 防亚像素）')
  assert.ok(hook.includes('PROGRAMMATIC_GUARD_MS = 150'), '程序滚动守卫 150ms')
  assert.ok(hook.includes('LAYOUT_GUARD_MS = 600'), 'pointerdown 封锁守卫 600ms')
  assert.ok(hook.includes('ResizeObserver'), '内容尺寸跟随必须用 ResizeObserver')
})

test('结构：SendBox 必须 key={currentSessionId} remount（切会话清空输入态）', () => {
  const chat = read('components', 'ChatArea.tsx')
  assert.match(chat, /<SendBox key=\{currentSessionId \?\? 'none'\}/, 'SendBox 切会话必须 remount 清空输入态')
})

test('结构：样式缓动必须收敛到 token（styles.css 除 :root 定义外无裸 cubic-bezier）', () => {
  const css = read('styles.css')
  for (const line of css.split('\n')) {
    if (/cubic-bezier/.test(line)) {
      assert.match(line.trim(), /^--pi-(ease|ease-sheet):/, `裸缓动曲线必须收敛到 token：${line.trim().slice(0, 60)}`)
    }
  }
})
