import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'frontend', 'src')
const read = (...parts) => readFileSync(join(SRC, ...parts), 'utf8')

test('移动底栏固定为对话、会话、资产、任务、更多，且删除可拖动 MobileFab', () => {
  const layout = read('AppLayout.tsx')
  const labels = [...layout.matchAll(/label: '([^']+)'/g)].map(match => match[1])
  const mobileTabs = labels.slice(-5)
  assert.deepEqual(mobileTabs, ['对话', '会话', '资产', '任务', '更多'])
  assert.ok(layout.includes('<MobileMoreMenu'), '移动端必须使用统一 MobileMoreMenu')
  assert.ok(!layout.includes('MobileFab'), 'AppLayout 不得继续引用 MobileFab')
  assert.equal(existsSync(join(SRC, 'components', 'MobileFab.tsx')), false, '可拖动 FAB 文件必须删除')
})

test('更多菜单承载设置路由和辅助面板，并提供可访问状态', () => {
  const menu = read('components', 'MobileMoreMenu.tsx')
  for (const route of ['lingxi', 'workshop', 'models', 'apps', 'engine', 'themes', 'sessiondb', 'system']) {
    assert.ok(menu.includes(`route: '${route}'`), `更多菜单缺少 ${route} 路由`)
  }
  for (const panel of ['workspace', 'deliveries', 'terminal', 'activity', 'tui']) {
    assert.ok(menu.includes(`panel: '${panel}'`), `更多菜单缺少 ${panel} 面板入口`)
  }
  assert.ok(menu.includes("e.key === 'Escape'"), '更多菜单必须支持 Esc 关闭')
  assert.ok(menu.includes('aria-current'), '更多菜单当前路由必须暴露 aria-current')
})

test('桌面工具区默认是真右栏，终端与 TUI 才可显式展开', () => {
  const layout = read('AppLayout.tsx')
  const panel = read('components', 'UtilityPanel.tsx')
  const css = read('styles.css')
  assert.ok(layout.includes('<UtilityPanel'), '桌面工具区必须通过 UtilityPanel 渲染')
  assert.ok(!/fixed inset-x-0 bottom-0[^\n]*col-right/.test(layout), '桌面工具区不得默认全屏覆盖')
  assert.match(css, /\.utility-panel\s*\{[\s\S]*?width:\s*clamp\(400px,[^;]+520px\)/, '桌面右栏宽度必须限制在 400–520px')
  assert.ok(panel.includes("active === 'terminal' || active === 'tui'"), '仅终端/TUI 提供显式展开')
  assert.ok(panel.includes("e.key === 'Escape'"), '工具面板必须支持 Esc 关闭')
  assert.ok(panel.includes('aria-expanded={expanded}'), '展开按钮必须暴露 aria-expanded')
})

test('移动导航与面板交互目标至少 44px，并尊重底部安全区', () => {
  const css = read('styles.css')
  assert.match(css, /\.mobile-tab-button\s*\{[\s\S]*?min-height:\s*44px/, '移动 Tab 触控高度不得小于 44px')
  assert.match(css, /\.mobile-more-action\s*\{[\s\S]*?min-height:\s*44px/, '更多菜单操作触控高度不得小于 44px')
  assert.ok(css.includes('env(safe-area-inset-bottom'), '固定移动导航必须尊重底部安全区')
})
