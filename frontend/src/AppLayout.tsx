import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react'
import { MessagesSquare, BrainCircuit, Images, Clock4, LayoutGrid, Settings2, FolderClosed, PanelLeftOpen, Sparkles, Factory, MonitorCog, Cpu, Palette, Database, LogOut, Ellipsis } from 'lucide-react'
import TuiTerminal from './components/TuiTerminal'
import { useApp } from './store'
import { useIsMobile } from './hooks/useIsMobile'
import { useHashRoute, PageErrorBoundary, type Route } from './hooks/useHashRoute'
import Login from './components/Login'
import TitleBar from './components/TitleBar'
import SetupWizard from './components/SetupWizard'
import { KeysApi } from './api'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import ActivityFeed from './components/ActivityFeed'
import WorkSpace from './components/Workspace'
import Deliveries from './components/Deliveries'
import TerminalPanel from './components/TerminalPanel'
import ModelManager from './components/ModelManager'
import ThemeSwitcher from './components/ThemeSwitcher'
import CommandPalette from './components/CommandPalette'
import MobileMoreMenu, { type UtilityPanelKey } from './components/MobileMoreMenu'
import UtilityPanel from './components/UtilityPanel'
import * as T from '@radix-ui/react-tooltip'
import { installVisualViewportHeight } from './lib/viewport'

// 页面 lazy（路线图：每路由 lazy + ErrorBoundary）
const ModelHub = lazy(() => import('./pages/ModelHub'))
const Assets = lazy(() => import('./pages/Assets'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Apps = lazy(() => import('./pages/Apps'))
const EnginePage = lazy(() => import('./pages/Engine'))
const LingXiPage = lazy(() => import('./pages/LingXi'))
const SystemPage = lazy(() => import('./pages/System'))
const ThemesPage = lazy(() => import('./pages/Themes'))
const SessionDbPage = lazy(() => import('./pages/SessionDb'))
const WorkshopPage = lazy(() => import('./pages/Workshop'))

type PageRoute = {
  route: Exclude<Route, 'chat'>
  icon: typeof MessagesSquare
  label: string
  Page: LazyExoticComponent<ComponentType<any>>
  nav?: boolean
}

// 页面注册表是路由、页面渲染和桌面导航的单一来源；移动端导航是刻意不同的信息架构。
const PAGE_ROUTES: PageRoute[] = [
  { route: 'lingxi', icon: Sparkles, label: '灵犀', Page: LingXiPage },
  { route: 'workshop', icon: Factory, label: '专项', Page: WorkshopPage },
  { route: 'models', icon: BrainCircuit, label: '模型', Page: ModelHub, nav: false },
  { route: 'assets', icon: Images, label: '资产', Page: Assets },
  { route: 'tasks', icon: Clock4, label: '任务', Page: Tasks },
  { route: 'apps', icon: LayoutGrid, label: '应用', Page: Apps },
  { route: 'engine', icon: Cpu, label: '引擎', Page: EnginePage },
  { route: 'themes', icon: Palette, label: '主题', Page: ThemesPage, nav: false },
  { route: 'sessiondb', icon: Database, label: '会话库', Page: SessionDbPage },
  { route: 'system', icon: MonitorCog, label: '系统', Page: SystemPage },
]
const APP_ROUTES: Route[] = ['chat', ...PAGE_ROUTES.map(p => p.route)]
const NAV: { route: Route; icon: typeof MessagesSquare; label: string }[] = [
  { route: 'chat', icon: MessagesSquare, label: '对话' },
  ...PAGE_ROUTES.filter(p => p.nav !== false).map(({ route, icon, label }) => ({ route, icon, label })),
]

function PageLoader() {
  return <div className="flex-1 flex items-center justify-center text-pi-dim2 text-sm">加载中…</div>
}

// 元枢壳框架：顶部自绘标题栏（浏览器里渲染为 null 不占位）+ 内容区占满剩余高度
function ShellFrame({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col relative overflow-hidden">
      <TitleBar />
      <div className="flex-1 flex min-h-0">{children}</div>
    </div>
  )
}

function PageBody({ route }: { route: Route }) {
  const page = PAGE_ROUTES.find(p => p.route === route)
  if (page) {
    const Page = page.Page
    return <Page />
  }
  return null
}

export default function AppLayout() {
  const { authed, logout } = useApp()
  // 首启向导（M1）：登录后零密钥 → 引导初始化；?setup=1 强制唤出
  const [needsSetup, setNeedsSetup] = useState(false)
  useEffect(() => {
    if (!authed) return
    try { if (new URLSearchParams(location.search).get('setup') === '1') { setNeedsSetup(true); return } } catch {}
    KeysApi.status().then((s: any) => { if (s && Array.isArray(s.pi) && s.pi.length === 0) setNeedsSetup(true) }).catch(() => {})
  }, [authed])
  const isMobile = useIsMobile()
  const [route, nav] = useHashRoute(APP_ROUTES)
  // 桌面会话栏折叠（08-26）：持久化到 localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('pi_sidebar_collapsed') === '1' } catch { return false }
  })
  const toggleSidebar = () => setSidebarCollapsed(v => {
    try { localStorage.setItem('pi_sidebar_collapsed', v ? '0' : '1') } catch {}
    return !v
  })
  const [rightPanel, setRightPanel] = useState<'chat' | UtilityPanelKey>('chat')
  const [panelExpanded, setPanelExpanded] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  // 移动端：sessions 抽屉与统一“更多”菜单
  const [mobileDrawer, setMobileDrawer] = useState<'none' | 'sessions'>('none')
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const mobileMoreTriggerRef = useRef<HTMLButtonElement>(null)
  const closeMobileMore = useCallback(() => {
    setMobileMoreOpen(false)
    requestAnimationFrame(() => mobileMoreTriggerRef.current?.focus())
  }, [])
  // ⌘K 命令面板（08-25 评审 P1：全局快捷键）
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => installVisualViewportHeight(), [])

  // ── 全局壁纸应用：读 localStorage/theme-prefs 应用到 #pi-wallpaper，任何页面都生效 ──
  useEffect(() => {
    const apply = () => {
      const wp = document.getElementById('pi-wallpaper') as HTMLElement | null
      if (!wp) return
      try {
        const w = localStorage.getItem('pi_wallpaper') || ''
        if (w) {
          wp.style.backgroundImage = `url(${w})`
          wp.style.backgroundSize = 'cover'
          wp.style.backgroundPosition = 'center'
          wp.style.backgroundRepeat = 'no-repeat'
        } else {
          wp.style.backgroundImage = ''; wp.style.backgroundSize = ''; wp.style.backgroundPosition = ''; wp.style.backgroundRepeat = ''
        }
      } catch {}
    }
    apply()
    // ThemeEditor 保存壁纸后派发，全局同步；挂载后 DOM 就绪也应用一次
    window.addEventListener('pi-wallpaper-changed', apply)
    const t = setTimeout(apply, 300)
    return () => { window.removeEventListener('pi-wallpaper-changed', apply); clearTimeout(t) }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
    }
    // 欢迎页快捷入口 → 面板联动
    const onOpenPalette = () => setPaletteOpen(true)
    const onOpenPanel = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail === 'terminal' || detail === 'workspace' || detail === 'deliveries') {
        nav('chat'); setRightPanel(detail)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pi-open-palette', onOpenPalette)
    window.addEventListener('pi-open-panel', onOpenPanel)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pi-open-palette', onOpenPalette)
      window.removeEventListener('pi-open-panel', onOpenPanel)
    }
  }, [nav])
  const palette = (
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} nav={nav}
      onRightPanel={p => setRightPanel(p)} onModelManager={() => setModelOpen(true)} />
  )
  const panelContents = rightPanel === 'workspace' ? <WorkSpace />
    : rightPanel === 'deliveries' ? <Deliveries />
      : rightPanel === 'activity' ? <ActivityFeed />
        : rightPanel === 'tui' ? <div className="flex-1 min-h-0 flex flex-col"><TuiTerminal /></div>
          : <TerminalPanel />

  if (!authed) return <ShellFrame><Login /></ShellFrame>
  if (needsSetup) return <ShellFrame><SetupWizard onDone={() => setNeedsSetup(false)} /></ShellFrame>

  /* ── 页面容器（非 chat 路由共用）── */
  // min-w-0：flex 子项默认 min-width:auto，内部宽表格会把整页撑出横向滚动（M3 手机审计修复）
  const pageArea = (route !== 'chat') && (
    <div key={route} className="flex-1 flex flex-col min-h-0 min-w-0 overflow-x-hidden page-enter">
      <Suspense fallback={<PageLoader />}>
        <PageErrorBoundary page={NAV.find(n => n.route === route)?.label || route}>
          <PageBody route={route} />
        </PageErrorBoundary>
      </Suspense>
    </div>
  )

  /* ── 移动端布局：TabBar 五入口（对话/会话/资产/任务/设置；模型在对话页下拉） ── */
  if (isMobile) {
    return (
      <div className="mobile-app-root flex flex-col text-pi-text relative"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div id="pi-wallpaper" className="fixed inset-0 z-0 pointer-events-none" />
        {/* 删除装饰性径向渐变背景 */}
        {/* 主内容层 */}
        <div className="flex-1 flex min-h-0 relative z-10">
          {mobileDrawer === 'sessions' ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <Sidebar onNavigated={() => { setMobileDrawer('none'); nav('chat') }} onCollapse={() => setMobileDrawer('none')} />
            </div>
          ) : route === 'chat' ? (
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <ChatArea compactHeader />
              {rightPanel !== 'chat' && (
                <UtilityPanel
                  active={rightPanel}
                  onChange={setRightPanel}
                  onClose={() => { setPanelExpanded(false); setRightPanel('chat') }}
                  expanded={panelExpanded}
                  onToggleExpanded={() => setPanelExpanded(value => !value)}
                >
                  {panelContents}
                </UtilityPanel>
              )}
            </div>
          ) : pageArea}
        </div>

        {/* 底部 TabBar：实底，不用玻璃 */}
        <nav className="mobile-tab-bar flex flex-shrink-0 relative z-20 border-t border-pi-border bg-pi-bg1" aria-label="主要导航">
          {([
            { key: 'chat', icon: MessagesSquare, label: '对话', active: !mobileMoreOpen && route === 'chat' && mobileDrawer === 'none', onClick: () => { setMobileMoreOpen(false); setMobileDrawer('none'); nav('chat') } },
            { key: 'sessions', icon: FolderClosed, label: '会话', active: !mobileMoreOpen && mobileDrawer === 'sessions', onClick: () => { setMobileMoreOpen(false); setMobileDrawer('sessions') } },
            { key: 'assets', icon: Images, label: '资产', active: !mobileMoreOpen && route === 'assets' && mobileDrawer === 'none', onClick: () => { setMobileMoreOpen(false); setMobileDrawer('none'); nav('assets') } },
            { key: 'tasks', icon: Clock4, label: '任务', active: !mobileMoreOpen && route === 'tasks' && mobileDrawer === 'none', onClick: () => { setMobileMoreOpen(false); setMobileDrawer('none'); nav('tasks') } },
            { key: 'more', icon: Ellipsis, label: '更多', active: mobileMoreOpen || (mobileDrawer === 'none' && !['chat', 'assets', 'tasks'].includes(route)), onClick: () => { setMobileDrawer('none'); setMobileMoreOpen(open => !open) } },
          ] as const).map(item => (
            <button
              key={item.key}
              ref={item.key === 'more' ? mobileMoreTriggerRef : undefined}
              aria-label={item.label}
              aria-current={item.active ? 'page' : undefined}
              aria-expanded={item.key === 'more' ? mobileMoreOpen : undefined}
              className={`mobile-tab-button flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${item.active ? 'text-pi-accent' : 'text-pi-dim2'}`}
              onClick={item.onClick}
            >
              <item.icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
              <span className="text-[11px] leading-none">{item.label}</span>
            </button>
          ))}
        </nav>

        <MobileMoreMenu
          open={mobileMoreOpen}
          onClose={closeMobileMore}
          route={route}
          nav={(nextRoute) => { setMobileDrawer('none'); nav(nextRoute) }}
          onOpenPanel={(panel) => { setMobileDrawer('none'); nav('chat'); setRightPanel(panel) }}
          onOpenTheme={() => { setMobileDrawer('none'); nav('themes') }}
        />

        <ModelManager visible={modelOpen} onClose={() => setModelOpen(false)} />
        {palette}
      </div>
    )
  }

  /* ── 桌面布局：图标 rail + 会话列表 + 主区 + 动态右栏 ── */
  return (
    <ShellFrame>
    <div className="flex-1 flex min-w-0 text-pi-text relative">
      <div id="pi-wallpaper" className="fixed inset-0 z-0 pointer-events-none" />
      {/* 图标导航 rail：实底 Logo，不用渐变 */}
      <nav className="w-[60px] flex-shrink-0 flex flex-col items-center py-4 gap-2 col-sidebar border-r border-pi-border relative z-20">
        <div className="w-9 h-9 rounded-xl bg-pi-accent flex items-center justify-center text-white font-bold text-sm mb-3"
          style={{ boxShadow: 'var(--pi-shadow-sm)' }}>语</div>
        {sidebarCollapsed && (
          <button className="w-9 h-9 rounded-pi-md flex items-center justify-center text-pi-dim2 hover:text-pi-text hover:bg-pi-bg3 transition-colors"
            aria-label="展开会话栏" title="展开会话栏" onClick={toggleSidebar}>
            <PanelLeftOpen className="w-[18px] h-[18px]" strokeWidth={1.8} />
          </button>
        )}
        {NAV.map(n => (
          <T.Root key={n.route}>
            <T.Trigger asChild>
              <button aria-label={n.label} aria-current={route === n.route ? 'page' : undefined}
                className={`w-10 h-10 rounded-xl flex items-center justify-center relative transition-[background-color,color,border-color,box-shadow,transform] duration-200 ${
                  route === n.route ? 'bg-pi-accent text-white shadow-md shadow-pi-accent/25' : 'text-pi-dim2 hover:text-pi-text hover:bg-pi-bg3'}`}
                onClick={() => nav(n.route)}>
                <n.icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
              </button>
            </T.Trigger>
            <T.Portal>
              <T.Content side="right" sideOffset={8}
                className="px-2 py-1 rounded-pi-sm bg-pi-bg3 border border-pi-border text-[11px] text-pi-text whitespace-nowrap shadow-lg z-50" style={{ animationDuration: '.12s' }}>
                {n.label}
              </T.Content>
            </T.Portal>
          </T.Root>
        ))}
        <div className="mt-auto mb-2 flex flex-col gap-1.5">
          <ThemeSwitcher />
          <button className="w-9 h-9 rounded-pi-md flex items-center justify-center text-pi-dim2 hover:text-pi-text hover:bg-pi-bg3 transition-colors" title="模型与通道" aria-label="模型与通道" onClick={() => nav('models')}><Settings2 className="w-[18px] h-[18px]" strokeWidth={1.8} /></button>
          <button className="w-9 h-9 rounded-pi-md flex items-center justify-center text-pi-dim2 hover:text-pi-red hover:bg-pi-bg3 transition-colors" title="退出登录" aria-label="退出登录" onClick={logout}><LogOut className="w-[18px] h-[18px]" strokeWidth={1.8} /></button>
        </div>
      </nav>

      {/* 会话列表：仅对话路由显示 */}
      {route === 'chat' && !sidebarCollapsed && <Sidebar onCollapse={toggleSidebar} />}

      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative z-10 col-canvas">
        {route === 'chat' ? <ChatArea rightPanel={rightPanel} onRightPanel={setRightPanel} /> : pageArea}
      </div>

      {/* 默认是真右栏；仅终端与 TUI 可由用户显式展开。 */}
      {route === 'chat' && rightPanel !== 'chat' && (
        <UtilityPanel
          active={rightPanel}
          onChange={setRightPanel}
          onClose={() => { setPanelExpanded(false); setRightPanel('chat') }}
          expanded={panelExpanded}
          onToggleExpanded={() => setPanelExpanded(value => !value)}
        >
          {panelContents}
        </UtilityPanel>
      )}

      {/* 右栏开关已入 ChatArea 顶栏（与状态胶囊并排，不再悬浮遮挡） */}

      <ModelManager visible={modelOpen} onClose={() => setModelOpen(false)} />
      {palette}
    </div>
    </ShellFrame>
  )
}
