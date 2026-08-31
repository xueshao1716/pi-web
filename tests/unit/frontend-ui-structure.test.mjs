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

test('主题页使用公共页头，并按画廊、实时预览与精调、开发者选项组织', () => {
  const themes = read('pages', 'Themes.tsx')
  assert.ok(themes.includes('<PageHeader'), '主题页必须使用 PageHeader')
  assert.doesNotMatch(themes, /<h1\b/, '主题页不得手写 h1 页面头')
  const order = [
    themes.indexOf('<PageHeader'),
    themes.indexOf('data-slot="theme-gallery"'),
    themes.indexOf('data-slot="theme-workbench"'),
    themes.indexOf('<details'),
  ]
  assert.ok(order.every(index => index >= 0), '主题页缺少 PageHeader → 画廊 → 实时预览/精调 → 开发者选项结构')
  assert.deepEqual([...order].sort((a, b) => a - b), order, '主题页层级顺序不正确')
  assert.match(themes, /data-slot="theme-workbench"[^>]*className="[^"]*lg:grid-cols-/, '桌面端实时预览与精调必须形成主辅布局')
})

test('主题 Token 与 CSS 导出只位于默认关闭的开发者选项', () => {
  const themes = read('pages', 'Themes.tsx')
  const detailsStart = themes.indexOf('<details')
  const detailsEnd = themes.indexOf('</details>', detailsStart)
  assert.ok(detailsStart >= 0 && detailsEnd > detailsStart, '主题页必须提供开发者 details')
  const details = themes.slice(detailsStart, detailsEnd)
  assert.ok(!/<details[^>]*\sopen(?:=|\s|>)/.test(details), '开发者选项必须默认关闭')
  for (const content of ['开发者选项', 'Token 速览', 'onClick={exportCss}', '导出 CSS']) {
    assert.ok(details.includes(content), `开发者选项缺少：${content}`)
  }
  const ordinaryUi = themes.slice(themes.indexOf('return ('), detailsStart)
  assert.ok(!ordinaryUi.includes('onClick={exportCss}'), '普通用户主界面不得出现 CSS 导出工具')
})

test('主题页保留即时应用、精调、壁纸、保存与重置行为，且非 badge 不使用 10px', () => {
  const themes = read('pages', 'Themes.tsx')
  for (const behavior of [
    'applyTheme(theme, accent)',
    'seedVars(theme, accent, density)',
    'setWallpaper(reader.result as string)',
    "setWallpaper('')",
    'await ThemeApi.save(theme, accent, wallpaper)',
    'onClick={handleReset}',
  ]) {
    assert.ok(themes.includes(behavior), `主题页必须保留行为：${behavior}`)
  }
  assert.doesNotMatch(themes, /text-\[10px\]/, '主题页不得把 10px 用于非 badge 文本或 WALL_PRESETS 按钮')
})

test('系统页以公共页头和四项真实状态摘要开场，主任务位于能力清单之前', () => {
  const system = read('pages', 'System.tsx')
  assert.ok(system.includes('<PageHeader'), '系统页必须使用 PageHeader')
  assert.doesNotMatch(system, /<h1\b/, '系统页不得手写 h1 页面头')
  const order = [
    system.indexOf('<PageHeader'),
    system.indexOf('data-slot="system-status"'),
    system.indexOf('data-slot="system-primary"'),
    system.indexOf('<details'),
  ]
  assert.ok(order.every(index => index >= 0), '系统页缺少 PageHeader → 状态摘要 → 主任务 → 能力折叠结构')
  assert.deepEqual([...order].sort((a, b) => a - b), order, '系统页必须先显示真实状态和主任务，能力清单置底')
  assert.equal((system.match(/<StatusTile\b/g) || []).length, 4, '系统顶部必须显示服务、版本、运行时长、网络四项摘要')
  for (const label of ['服务状态', '版本', '运行时长', '网络状态']) {
    assert.ok(system.includes(`label="${label}"`), `系统状态摘要缺少：${label}`)
  }
})

test('系统网络摘要只陈述已发现入口，不把配置数据解释为网络可达性', () => {
  const system = read('pages', 'System.tsx')
  const networkTileStart = system.indexOf('label="网络状态"')
  const networkTileEnd = system.indexOf('/>', networkTileStart)
  assert.ok(networkTileStart >= 0 && networkTileEnd > networkTileStart, '系统页必须提供网络状态摘要')
  const networkTile = system.slice(networkTileStart, networkTileEnd)
  assert.ok(system.includes('const networkEntryCount ='), '网络摘要必须基于入口计数描述已知事实')
  assert.match(networkTile, /已发现入口/, '存在 lanIPs 或 domains 时只能表述为已发现入口')
  assert.match(networkTile, /未发现入口/, '系统信息已返回但入口为空时只能表述为未发现入口')
  assert.match(networkTile, /等待系统信息/, '系统信息未返回时必须明确等待系统信息')
  assert.doesNotMatch(networkTile, /可用|未配置|待配置|在线|离线/, '网络摘要不得把入口配置解释为网络可达性')
})

test('系统能力默认折叠，保留更新、网络编辑保存与实际端口 LAN 复制行为', () => {
  const system = read('pages', 'System.tsx')
  const detailsStart = system.indexOf('<details')
  const detailsEnd = system.indexOf('</details>', detailsStart)
  assert.ok(detailsStart >= 0 && detailsEnd > detailsStart, '系统能力必须位于 details')
  const details = system.slice(detailsStart, detailsEnd)
  assert.ok(!/<details[^>]*\sopen(?:=|\s|>)/.test(details), '系统能力必须默认折叠')
  assert.ok(details.includes('系统能力'), '折叠区必须包含系统能力清单')
  for (const behavior of [
    "useSWR('system-info', () => SystemApi.info(), { dedupingInterval: 30000 })",
    'SystemApi.checkUpdate()',
    'setRows([...domains',
    'setRows(domains.filter',
    'SystemApi.saveNetwork({ domains })',
    'copyText(lanUrl)',
    'copiedIp === lanUrl',
  ]) {
    assert.ok(system.includes(behavior), `系统页必须保留行为：${behavior}`)
  }
  assert.doesNotMatch(system, /copiedIp === `http:\/\/\$\{ip\}:8787`/, '复制状态不得硬编码 8787')
})

test('主题与系统页清除固定 emerald、非 badge 10px 与 emoji 式勾号，ModelChannels 删除未使用 X import', () => {
  const targets = [read('pages', 'Themes.tsx'), read('pages', 'System.tsx')]
  for (const source of targets) {
    assert.doesNotMatch(source, /emerald-/, '主题/系统页不得使用固定 emerald 色')
    assert.doesNotMatch(source, /text-\[10px\]/, '主题/系统页不得使用非 badge 10px')
    assert.doesNotMatch(source, /✓/, '主题/系统页不得使用 emoji 式勾号')
  }
  const channels = read('components', 'ModelChannels.tsx')
  assert.doesNotMatch(channels, /\bX\b/, 'ModelChannels 不得保留未使用 X import')
})
