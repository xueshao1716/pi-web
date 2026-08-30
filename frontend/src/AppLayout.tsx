import { Suspense, lazy, useEffect, useState, type ComponentType, type LazyExoticComponent } from 'react'
import {MessagesSquare, BrainCircuit, Images, Clock4, LayoutGrid, Settings2, FolderClosed, PanelLeftOpen, Sparkles, Factory, MonitorCog, Cpu, Palette, Database } from 'lucide-react'
import TuiTerminal from './components/TuiTerminal'
import { useApp } from './store'
import { useIsMobile } from './hooks/useIsMobile'
import { useHashRoute, PageErrorBoundary, type Route } from './hooks/useHashRoute'
import Login from './components/Login'
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
import MobileFab from './components/MobileFab'
import * as T from '@radix-ui/react-tooltip'

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

function PageBody({ route }: { route: Route }) {
  const page = PAGE_ROUTES.find(p => p.route === route)
  if (page) {
    const Page = page.Page
    return <Page />
  }
  return null
}

export default function AppLayout() {
  const { authed } = useApp()
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
  const [rightPanel, setRightPanel] = useState<'chat' | 'workspace' | 'deliveries' | 'terminal' | 'activity' | 'tui'>('chat')
  const [modelOpen, setModelOpen] = useState(false)
  // 移动端：sessions 抽屉
  const [mobileDrawer, setMobileDrawer] = useState<'none' | 'sessions'>('none')
  // ⌘K 命令面板（08-25 评审 P1：全局快捷键）
  const [paletteOpen, setPaletteOpen] = useState(false)

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

  if (!authed) return <Login />
  if (needsSetup) return <SetupWizard onDone={() => setNeedsSetup(false)} />

  /* ── 页面容器（非 chat 路由共用）── */
  const pageArea = (route !== 'chat') && (
    <div key={route} className="flex-1 flex flex-col min-h-0 page-enter">
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
      <div className="h-screen flex flex-col text-pi-text relative"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div id="pi-wallpaper" className="fixed inset-0 z-0 pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none z-[1]"
          style={{ background: 'radial-gradient(720px 420px at 82% -8%, color-mix(in oklab, var(--pi-accent) 12%, transparent), transparent 62%), radial-gradient(560px 380px at 8% 108%, color-mix(in oklab, var(--pi-accent2) 7%, transparent), transparent 60%)' }} />
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
                <div className="fixed inset-0 z-[var(--pi-z-rightpanel)] glass-strong flex flex-col"
                  style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
                  <div className="flex items-center gap-1 px-3 h-10 border-b border-pi-border-soft flex-shrink-0">
                    {([['workspace', '工作空间'], ['deliveries', '交付物'], ['terminal', '终端'], ['activity', '活动'], ['tui', 'TUI']] as const).map(([k, label]) => (
                      <button key={k} onClick={() => setRightPanel(k)}
                        className={`touch-hit text-xs px-3 py-1.5 rounded-pi-md transition-colors ${rightPanel === k ? 'bg-pi-accent/15 text-pi-accent font-medium' : 'text-pi-dim'}`}>
                        {label}
                      </button>
                    ))}
                    <span className="ml-auto" />
                    <button className="btn-tool !px-2 touch-hit" onClick={() => setRightPanel('chat')}>✕</button>
                  </div>
                  {rightPanel === 'workspace' ? <WorkSpace /> : rightPanel === 'deliveries' ? <Deliveries /> : rightPanel === 'activity' ? <ActivityFeed /> : rightPanel === 'tui' ? <div className='flex-1 min-h-0 flex flex-col'><TuiTerminal /></div> : <TerminalPanel />}
                </div>
              )}
            </div>
          ) : pageArea}
        </div>

        {/* 底部 TabBar（会话抽屉打开时隐藏——避免列表底部误触 TabBar 跳到资产/任务等） */}
        {mobileDrawer !== 'sessions' && (
          <nav className="flex h-12 border-t border-pi-border-soft glass-strong flex-shrink-0 relative z-20 pb-[env(safe-area-inset-bottom)]">
            {([
              { key: 'chat', icon: MessagesSquare, label: '对话', active: route === 'chat', onClick: () => { setMobileDrawer('none'); nav('chat') } },
              { key: 'sessions', icon: FolderClosed, label: '会话', active: false, onClick: () => setMobileDrawer('sessions') },
              { key: 'assets', icon: Images, label: '资产', active: route === 'assets', onClick: () => { setMobileDrawer('none'); nav('assets') } },
              { key: 'tasks', icon: Clock4, label: '任务', active: route === 'tasks', onClick: () => { setMobileDrawer('none'); nav('tasks') } },
              { key: 'settings', icon: Settings2, label: '设置', active: route === 'models', onClick: () => { setMobileDrawer('none'); nav('models') } },
            ] as const).map(item => (
              <button key={item.key} aria-label={item.label}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${item.active ? 'text-pi-accent' : 'text-pi-dim2'}`}
                onClick={item.onClick}>
                <item.icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
                <span className="text-[11px] leading-none">{item.label}</span>
              </button>
            ))}
          </nav>
        )}

        {/* 悬浮功能按钮（FAB）：默认显示；会话抽屉打开时隐藏——避免挡住会话列表点击(真bug) */}
        {mobileDrawer !== 'sessions' && (
          <MobileFab
            nav={nav}
            route={route}
            onSettings={() => { setMobileDrawer('none'); nav('models') }}
            onOpenSessions={() => { setMobileDrawer('sessions') }}
            onOpenPanel={(k) => { setMobileDrawer('none'); nav('chat'); setRightPanel(k) }}
            onOpenTheme={() => { setMobileDrawer('none'); nav('themes') }}
          />
        )}

        <ModelManager visible={modelOpen} onClose={() => setModelOpen(false)} />
        {palette}
      </div>
    )
  }

  /* ── 桌面布局：图标 rail + 会话列表 + 主区 + 动态右栏 ── */
  return (
    <div className="h-screen flex text-pi-text relative">
      <div id="pi-wallpaper" className="fixed inset-0 z-0 pointer-events-none" />
      {/* 图标导航 rail（08-23：col-sidebar 顶部天光，拉开与中栏层次） */}
      <nav className="w-[60px] flex-shrink-0 flex flex-col items-center py-4 gap-2 col-sidebar border-r border-pi-border relative z-20">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pi-accent to-pi-accent2 flex items-center justify-center text-white font-bold text-sm mb-3"
          style={{ boxShadow: '0 4px 14px color-mix(in oklab, var(--pi-accent) 25%, transparent)' }}>语</div>
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
                className={`w-10 h-10 rounded-xl flex items-center justify-center relative transition-all duration-200 ${
                  route === n.route ? 'bg-pi-accent text-white shadow-md shadow-pi-accent/25' : 'text-pi-dim2 hover:text-pi-text hover:bg-pi-bg3'}`}
                onClick={() => nav(n.route)}>
                <n.icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
              </button>
            </T.Trigger>
            <T.Portal>
              <T.Content side="right" sideOffset={8}
                className="px-2 py-1 rounded-pi-sm bg-pi-bg3 border border-pi-border text-[11px] text-pi-text whitespace-nowrap shadow-lg z-50 anim-enter" style={{ animationDuration: '.12s' }}>
                {n.label}
              </T.Content>
            </T.Portal>
          </T.Root>
        ))}
        <div className="mt-auto mb-2 flex flex-col gap-1.5">
          <ThemeSwitcher />
          <button className="w-9 h-9 rounded-pi-md flex items-center justify-center text-pi-dim2 hover:text-pi-text hover:bg-pi-bg3 transition-colors" title="模型与通道" aria-label="模型与通道" onClick={() => nav('models')}><Settings2 className="w-[18px] h-[18px]" strokeWidth={1.8} /></button>
        </div>
      </nav>

      {/* 会话列表：仅对话路由显示 */}
      {route === 'chat' && !sidebarCollapsed && <Sidebar onCollapse={toggleSidebar} />}

      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative z-10 col-canvas">
        {route === 'chat' ? <ChatArea rightPanel={rightPanel} onRightPanel={setRightPanel} /> : pageArea}
      </div>

      {/* 动态右栏（全屏覆盖；08-23 col-right 独立亮度层，08-27 改为全屏） */}
      {route === 'chat' && rightPanel !== 'chat' && (
        <div className="fixed inset-0 z-[var(--pi-z-rightpanel)] col-right glass-strong flex flex-col min-h-0">
          <div className="flex items-center gap-1 px-3 h-10 border-b border-pi-border-soft flex-shrink-0">
            {([['workspace', '工作空间'], ['deliveries', '交付物'], ['terminal', '终端'], ['activity', '活动'], ['tui', 'TUI']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setRightPanel(k)}
                className={`text-xs px-3 py-1.5 rounded-pi-md transition-colors ${rightPanel === k ? 'bg-pi-accent/15 text-pi-accent font-medium' : 'text-pi-dim hover:text-pi-text hover:bg-pi-bg3'}`}>
                {label}
              </button>
            ))}
            <span className="ml-auto" />
            <button className="btn-tool !px-2" title="收起右栏" onClick={() => setRightPanel('chat')}>✕</button>
          </div>
          {rightPanel === 'workspace' ? <WorkSpace /> : rightPanel === 'deliveries' ? <Deliveries /> : rightPanel === 'activity' ? <ActivityFeed /> : rightPanel === 'tui' ? <div className='flex-1 min-h-0 flex flex-col'><TuiTerminal /></div> : <TerminalPanel />}
        </div>
      )}

      {/* 右栏开关已入 ChatArea 顶栏（与状态胶囊并排，不再悬浮遮挡） */}

      <ModelManager visible={modelOpen} onClose={() => setModelOpen(false)} />
      {palette}
    </div>
  )
}
