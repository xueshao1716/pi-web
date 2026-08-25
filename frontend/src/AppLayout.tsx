import { Suspense, lazy, useEffect, useState } from 'react'
import { MessagesSquare, BrainCircuit, Images, Clock4, LayoutGrid, Settings2, FolderClosed } from 'lucide-react'
import { useApp } from './store'
import { useIsMobile } from './hooks/useIsMobile'
import { useHashRoute, PageErrorBoundary, type Route } from './hooks/useHashRoute'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import WorkSpace from './components/Workspace'
import Deliveries from './components/Deliveries'
import TerminalPanel from './components/TerminalPanel'
import ModelManager from './components/ModelManager'
import ThemeSwitcher from './components/ThemeSwitcher'
import CommandPalette from './components/CommandPalette'
import * as T from '@radix-ui/react-tooltip'

// 页面 lazy（路线图：每路由 lazy + ErrorBoundary）
const ModelHub = lazy(() => import('./pages/ModelHub'))
const Assets = lazy(() => import('./pages/Assets'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Apps = lazy(() => import('./pages/Apps'))

// 导航项（桌面 rail / 移动 TabBar 共用语义）
const NAV: { route: Route; icon: typeof MessagesSquare; label: string }[] = [
  { route: 'chat', icon: MessagesSquare, label: '对话' },
  { route: 'models', icon: BrainCircuit, label: '模型' },
  { route: 'assets', icon: Images, label: '资产' },
  { route: 'tasks', icon: Clock4, label: '任务' },
  { route: 'apps', icon: LayoutGrid, label: '应用' },
]

function PageLoader() {
  return <div className="flex-1 flex items-center justify-center text-pi-dim2 text-sm">加载中…</div>
}

function PageBody({ route }: { route: Route }) {
  if (route === 'models') return <ModelHub />
  if (route === 'assets') return <Assets />
  if (route === 'tasks') return <Tasks />
  if (route === 'apps') return <Apps />
  return null
}

export default function AppLayout() {
  const { authed } = useApp()
  const isMobile = useIsMobile()
  const [route, nav] = useHashRoute()
  const [rightPanel, setRightPanel] = useState<'chat' | 'workspace' | 'deliveries' | 'terminal'>('chat')
  const [modelOpen, setModelOpen] = useState(false)
  // 移动端：sessions 抽屉
  const [mobileDrawer, setMobileDrawer] = useState<'none' | 'sessions'>('none')
  // ⌘K 命令面板（08-25 评审 P1：全局快捷键）
  const [paletteOpen, setPaletteOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const palette = (
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} nav={nav}
      onRightPanel={p => setRightPanel(p)} onModelManager={() => setModelOpen(true)} />
  )

  if (!authed) return <Login />

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
      <div className="h-screen flex flex-col bg-pi-bg text-pi-text relative">
        <div className="absolute inset-0 pointer-events-none z-0"
          style={{ background: 'radial-gradient(720px 420px at 82% -8%, rgba(84,104,255,0.12), transparent 62%), radial-gradient(560px 380px at 8% 108%, rgba(120,90,255,.07), transparent 60%)' }} />
        {/* 主内容层 */}
        <div className="flex-1 flex min-h-0 relative z-10">
          {mobileDrawer === 'sessions' ? (
            <div className="flex-1 flex flex-col min-h-0">
              <Sidebar onNavigated={() => setMobileDrawer('none')} />
            </div>
          ) : route === 'chat' ? (
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <ChatArea compactHeader />
              {rightPanel !== 'chat' && (
                <div className="fixed inset-0 top-10 z-[80] glass-strong flex flex-col">
                  <div className="flex items-center gap-1 px-3 h-10 border-b border-pi-border-soft flex-shrink-0">
                    {([['workspace', '工作空间'], ['deliveries', '交付物'], ['terminal', '终端']] as const).map(([k, label]) => (
                      <button key={k} onClick={() => setRightPanel(k)}
                        className={`text-xs px-3 py-1.5 rounded-pi-md transition-colors ${rightPanel === k ? 'bg-pi-accent/15 text-pi-accent font-medium' : 'text-pi-dim'}`}>
                        {label}
                      </button>
                    ))}
                    <span className="ml-auto" />
                    <button className="btn-tool !px-2" onClick={() => setRightPanel('chat')}>✕</button>
                  </div>
                  {rightPanel === 'workspace' ? <WorkSpace /> : rightPanel === 'deliveries' ? <Deliveries /> : <TerminalPanel />}
                </div>
              )}
            </div>
          ) : pageArea}
        </div>

        {/* 底部 TabBar */}
        <nav className="flex h-12 border-t border-pi-border-soft glass-strong flex-shrink-0 relative z-20 pb-[env(safe-area-inset-bottom)]">
          {([
            { key: 'chat', icon: MessagesSquare, label: '对话', active: route === 'chat' && mobileDrawer === 'none', onClick: () => { setMobileDrawer('none'); nav('chat') } },
            { key: 'sessions', icon: FolderClosed, label: '会话', active: mobileDrawer === 'sessions', onClick: () => setMobileDrawer(mobileDrawer === 'sessions' ? 'none' : 'sessions') },
            { key: 'assets', icon: Images, label: '资产', active: route === 'assets' && mobileDrawer === 'none', onClick: () => { setMobileDrawer('none'); nav('assets') } },
            { key: 'tasks', icon: Clock4, label: '任务', active: route === 'tasks' && mobileDrawer === 'none', onClick: () => { setMobileDrawer('none'); nav('tasks') } },
            { key: 'settings', icon: Settings2, label: '设置', active: false, onClick: () => setModelOpen(true) },
          ] as const).map(item => (
            <button key={item.key} aria-label={item.label}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${item.active ? 'text-pi-accent' : 'text-pi-dim2'}`}
              onClick={item.onClick}>
              <item.icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
              <span className="text-[11px] leading-none">{item.label}</span>
            </button>
          ))}
        </nav>

        <ModelManager visible={modelOpen} onClose={() => setModelOpen(false)} />
        {palette}
      </div>
    )
  }

  /* ── 桌面布局：图标 rail + 会话列表 + 主区 + 动态右栏 ── */
  return (
    <div className="h-screen flex bg-pi-bg text-pi-text relative">
      {/* 全局光斑背景 */}
      <div className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(720px 420px at 82% -8%, rgba(84,104,255,0.12), transparent 62%), radial-gradient(560px 380px at 8% 108%, rgba(120,90,255,.07), transparent 60%)' }} />

      {/* 图标导航 rail（08-23：col-sidebar 顶部天光，拉开与中栏层次） */}
      <nav className="w-14 flex-shrink-0 flex flex-col items-center py-3 gap-1.5 col-sidebar glass-strong border-r border-pi-border relative z-20">
        <div className="w-8 h-8 rounded-pi-md avatar-grad flex items-center justify-center text-white font-bold mb-2">语</div>
        {NAV.map(n => (
          <T.Root key={n.route}>
            <T.Trigger asChild>
              <button aria-label={n.label} aria-current={route === n.route ? 'page' : undefined}
                className={`w-9 h-9 rounded-pi-md flex items-center justify-center relative transition-all duration-150 ${
                  route === n.route ? 'bg-pi-accent/15 text-pi-accent' : 'text-pi-dim2 hover:text-pi-text hover:bg-pi-bg3'}`}
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
        <div className="mt-auto flex flex-col gap-1.5">
          <ThemeSwitcher />
          <button className="w-9 h-9 rounded-pi-md flex items-center justify-center text-pi-dim2 hover:text-pi-text hover:bg-pi-bg3 transition-all" title="密钥与通道管理" aria-label="密钥与通道管理" onClick={() => setModelOpen(true)}><Settings2 className="w-[18px] h-[18px]" strokeWidth={1.8} /></button>
        </div>
      </nav>

      {/* 会话列表：仅对话路由显示 */}
      {route === 'chat' && <Sidebar />}

      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative z-10 col-canvas">
        {route === 'chat' ? <ChatArea /> : pageArea}
      </div>

      {/* 动态右栏（仅对话路由；08-23：col-right 独立亮度层） */}
      {route === 'chat' && rightPanel !== 'chat' && (
        <div className="w-[44%] min-w-[360px] border-l border-pi-border col-right glass flex flex-col min-h-0 relative z-10">
          <div className="flex items-center gap-1 px-3 h-10 border-b border-pi-border-soft flex-shrink-0">
            {([['workspace', '工作空间'], ['deliveries', '交付物'], ['terminal', '终端']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setRightPanel(k)}
                className={`text-xs px-3 py-1.5 rounded-pi-md transition-colors ${rightPanel === k ? 'bg-pi-accent/15 text-pi-accent font-medium' : 'text-pi-dim hover:text-pi-text hover:bg-pi-bg3'}`}>
                {label}
              </button>
            ))}
            <span className="ml-auto" />
            <button className="btn-tool !px-2" title="收起右栏" onClick={() => setRightPanel('chat')}>✕</button>
          </div>
          {rightPanel === 'workspace' ? <WorkSpace /> : rightPanel === 'deliveries' ? <Deliveries /> : <TerminalPanel />}
        </div>
      )}

      {/* 顶栏右侧工具胶囊（仅对话路由；其他页自带头部） */}
      {route === 'chat' && (
        <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5">
          <div className="flex items-center gap-1 p-1 rounded-pi-md glass-strong border border-pi-border-soft">
            <button className={`btn text-xs px-2 py-1 rounded-pi-sm transition-all duration-150 ${rightPanel !== 'chat' ? 'bg-pi-accent text-white' : 'text-pi-dim hover:text-pi-text hover:bg-pi-bg3'}`} onClick={() => setRightPanel(rightPanel === 'chat' ? 'workspace' : 'chat')}>右栏</button>
            <button className="btn-ghost text-xs" onClick={() => setModelOpen(true)}>模型</button>
          </div>
        </div>
      )}

      <ModelManager visible={modelOpen} onClose={() => setModelOpen(false)} />
      {palette}
    </div>
  )
}
