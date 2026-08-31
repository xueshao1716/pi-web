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

test('更多菜单打开时底栏只能有更多一个 aria-current', () => {
  const layout = read('AppLayout.tsx')
  for (const activeContract of [
    "active: !mobileMoreOpen && route === 'chat' && mobileDrawer === 'none'",
    "active: !mobileMoreOpen && mobileDrawer === 'sessions'",
    "active: !mobileMoreOpen && route === 'assets' && mobileDrawer === 'none'",
    "active: !mobileMoreOpen && route === 'tasks' && mobileDrawer === 'none'",
  ]) {
    assert.ok(layout.includes(activeContract), `底栏活跃态缺少互斥契约：${activeContract}`)
  }
  assert.ok(layout.includes("active: mobileMoreOpen || (mobileDrawer === 'none'"), '更多打开时必须保持更多活跃')
  assert.equal((layout.match(/aria-current=\{item\.active \? 'page' : undefined\}/g) || []).length, 1, '移动底栏 aria-current 必须只由互斥 item.active 单点控制')
})

test('更多菜单打开后圈定焦点，关闭后把焦点还给更多触发按钮', () => {
  const layout = read('AppLayout.tsx')
  const menu = read('components', 'MobileMoreMenu.tsx')
  assert.ok(layout.includes('const mobileMoreTriggerRef = useRef<HTMLButtonElement>(null)'), 'AppLayout 必须持有更多触发按钮 ref')
  assert.ok(layout.includes("ref={item.key === 'more' ? mobileMoreTriggerRef : undefined}"), '更多按钮必须绑定恢复焦点 ref')
  assert.ok(layout.includes('mobileMoreTriggerRef.current?.focus()'), '关闭菜单后必须由 AppLayout 恢复触发按钮焦点')
  assert.ok(menu.includes('const sheetRef = useRef<HTMLElement>(null)'), '更多 sheet 必须持有焦点边界 ref')
  assert.ok(menu.includes('const closeButtonRef = useRef<HTMLButtonElement>(null)'), '更多菜单必须持有初始焦点 ref')
  assert.ok(menu.includes('closeButtonRef.current?.focus()'), '菜单打开后必须主动聚焦关闭按钮')
  assert.ok(menu.includes("e.key !== 'Tab'"), '更多菜单必须处理 Tab 焦点循环')
  assert.ok(menu.includes('e.shiftKey'), '更多菜单必须处理 Shift+Tab 反向循环')
  assert.ok(menu.includes("sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)"), '焦点候选必须限定在 sheet 内')
  assert.ok(menu.includes('focusable[0]?.focus()'), '末项 Tab 必须回到首项')
  assert.ok(menu.includes('focusable[focusable.length - 1]?.focus()'), '首项 Shift+Tab 必须回到末项')
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

test('模型中心拆分为窄职责组件，第一屏按当前模型、筛选、结果网格排列', () => {
  const hub = read('pages', 'ModelHub.tsx')
  for (const component of ['ActiveModelHero', 'ModelFilterBar', 'ModelCard']) {
    const file = join(SRC, 'components', 'models', `${component}.tsx`)
    assert.ok(existsSync(file), `模型中心缺少 ${component} 组件`)
    assert.ok(hub.includes(`<${component}`), `ModelHub 必须使用 ${component}`)
  }
  const order = [
    hub.indexOf('<PageHeader'),
    hub.indexOf('<ActiveModelHero'),
    hub.indexOf('<ModelFilterBar'),
    hub.indexOf('data-slot="model-results"'),
  ]
  assert.ok(order.every(index => index >= 0), 'ModelHub 缺少 PageHeader → hero → 筛选 → 结果网格结构标记')
  assert.deepEqual([...order].sort((a, b) => a - b), order, '模型中心第一屏顺序必须为 PageHeader → 当前模型 → 筛选 → 结果网格')
})

test('模型通道、累计用量和 Provider 明细统一位于默认折叠的通道与用量区', () => {
  const hub = read('pages', 'ModelHub.tsx')
  const detailsStart = hub.indexOf('<details')
  const detailsEnd = hub.indexOf('</details>', detailsStart)
  assert.ok(detailsStart >= 0 && detailsEnd > detailsStart, '模型中心必须提供 details 折叠区')
  const details = hub.slice(detailsStart, detailsEnd)
  assert.ok(!/<details[^>]*\sopen(?:=|\s|>)/.test(details), '通道与用量必须默认折叠')
  for (const content of ['通道与用量', '累计成本', '累计消息', '<ModelChannels', 'Provider 用量']) {
    assert.ok(details.includes(content), `通道与用量折叠区缺少：${content}`)
  }
})

test('模型中心业务组件只使用语义状态色，不含固定 emerald、purple、sky 色类', () => {
  const files = [
    ['pages', 'ModelHub.tsx'],
    ['components', 'ModelChannels.tsx'],
    ['components', 'models', 'ActiveModelHero.tsx'],
    ['components', 'models', 'ModelFilterBar.tsx'],
    ['components', 'models', 'ModelCard.tsx'],
  ]
  const offenders = []
  for (const parts of files) {
    const file = join(SRC, ...parts)
    if (!existsSync(file)) continue
    const source = read(...parts)
    if (/(?:emerald|purple|sky)-/.test(source)) offenders.push(parts.join('/'))
  }
  assert.deepEqual(offenders, [], `固定状态色应改用 pi-success/pi-info/pi-accent：${offenders.join(', ')}`)
})

test('模型中心保留 store、统计刷新、模型切换和通道增删契约，排序不突变 models', () => {
  const hub = read('pages', 'ModelHub.tsx')
  const channels = read('components', 'ModelChannels.tsx')
  for (const storeValue of ['models', 'currentModel', 'cwd']) {
    assert.match(hub, new RegExp(`\\b${storeValue}\\b`), `ModelHub 必须保留 ${storeValue}`)
  }
  assert.ok(hub.includes("useSWR('provider-stats', () => StatsApi.providers(), { refreshInterval: 60000 })"), 'Provider 统计必须继续每 60 秒刷新')
  assert.ok(hub.includes('await KeysApi.switchModel({ provider: model.provider, modelId: model.id })'), '模型切换必须继续调用 KeysApi.switchModel')
  assert.doesNotMatch(hub, /\bmodels\.sort\(/, '不得直接 sort store 的 models 数组')
  assert.match(hub, /\[\.\.\.filteredModels\]\.sort\(/, '免费优先排序必须基于筛选结果的新数组')
  for (const api of ['KeysApi.manage()', 'KeysApi.add(', 'KeysApi.remove(']) {
    assert.ok(channels.includes(api), `ModelChannels 必须保留 ${api}`)
  }
})
