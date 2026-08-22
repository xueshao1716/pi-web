import { Suspense, lazy, useState } from 'react'
import { useApp } from './store'
import { useIsMobile } from './hooks/useIsMobile'
import { useHashRoute, PageErrorBoundary, type Route } from './hooks/useHashRoute'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import WorkSpace from './components/Workspace'
import Deliveries from './components/Deliveries'
import ModelManager from './components/ModelManager'
import ThemeSwitcher from './components/ThemeSwitcher'

// 页面 lazy（路线图：每路由 lazy + ErrorBoundary）
const ModelHub = lazy(() => import('./pages/ModelHub'))
const Assets = lazy(() => import('./pages/Assets'))
const Tasks = lazy(() => import('./pages/Tasks'))

// 导航项（桌面 rail / 移动 TabBar 共用语义）
const NAV: { route: Route; icon: string; label: string }[] = [
  { route: 'chat', icon: '💬', label: '对话' },
  { route: 'models', icon: '🧠', label: '模型' },
  { route: 'assets', icon: '🖼️', label: '资产' },
  { route: 'tasks', icon: '⏰', label: '任务' },
]

function PageLoader() {
  return <div className="flex-1 flex items-center justify-center text-pi-dim2 text-sm">加载中…</div>
}

function PageBody({ route }: { route: Route }) {
  if (route === 'models') return <ModelHub />
  if (route === 'assets') return <Assets />
  if (route === 'tasks') return <Tasks />
  return null
}

export default function AppLayout() {
  const { authed } = useApp()
  const isMobile = useIsMobile()
  const [route, nav] = useHashRoute()
  const [rightPanel, setRightPanel] = useState<'chat' | 'workspace' | 'deliveries'>('chat')
  const [modelOpen, setModelOpen] = useState(false)
  // 移动端：sessions 抽屉
  const [mobileDrawer, setMobileDrawer] = useState<'none' | 'sessions'>('none')

  if (!authed) return <Login />

  /* ── 页面容器（非 chat 路由共用）── */
  const pageArea = (route !== 'chat') && (
    <Suspense fallback={<PageLoader />}>
      <PageErrorBoundary page={NAV.find(n => n.route === route)?.label || route}>
        <PageBody route={route} />
      </PageErrorBoundary>
    </Suspense>
  )

  /* ── 移动端布局：TabBar 五入口（对话/会话/资产/任务/设置；模型在对话页下拉） ── */
  if (isMobile) {
    return (
      <div className="h-screen flex flex-col bg-pi-bg text-pi-text relative">
        <div className="absolute inset-0 pointer-events-none z-0"
          style={{ background: 'radial-gradient(720px 420px at 82% -8%, var(--pi-glow), transparent 62%), radial-gradient(560px 380px at 8% 108%, rgba(120,90,255,.14), transparent 60%)' }} />
        {/* 主内容层 */}
        <div className="flex-1 flex min-h-0 relative z-10">
          {mobileDrawer === 'sessions' ? (
            <div className="flex-1 flex flex-col min-h-0">
              <Sidebar onNavigated={() => setMobileDrawer('none')} />
            </div>
          ) : route === 'chat' ? (
            <div className="flex-1 flex flex-col min-w-0">
              <ChatArea compactHeader />
              {rightPanel !== 'chat' && (
                <div className="fixed inset-0 top-10 z-[80] glass-strong flex flex-col">
                  <div className="flex items-center gap-1 px-3 h-10 border-b border-pi-border-soft flex-shrink-0">
                    {([['workspace', '工作空间'], ['deliveries', '交付物']] as const).map(([k, label]) => (
                      <button key={k} onClick={() => setRightPanel(k)}
                        className={`text-xs px-3 py-1.5 rounded-pi-md transition-colors ${rightPanel === k ? 'bg-pi-accent/15 text-pi-accent font-medium' : 'text-pi-dim'}`}>
                        {label}
                      </button>
                    ))}
                    <span className="ml-auto" />
                    <button className="btn-tool !px-2" onClick={() => setRightPanel('chat')}>✕</button>
                  </div>
                  {rightPanel === 'workspace' ? <WorkSpace /> : <Deliveries />}
                </div>
              )}
            </div>
          ) : pageArea}
        </div>

        {/* 底部 TabBar */}
        <nav className="flex h-14 border-t border-pi-border-soft glass-strong flex-shrink-0 relative z-20 pb-[env(safe-area-inset-bottom)]">
          <button
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${route === 'chat' && mobileDrawer === 'none' ? 'text-pi-accent' : 'text-pi-dim2'}`}
            onClick={() => { setMobileDrawer('none'); nav('chat') }}>
            <span className="text-lg leading-none">💬</span>
            <span className="text-[10px]">对话</span>
          </button>
          <button
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${mobileDrawer === 'sessions' ? 'text-pi-accent' : 'text-pi-dim2'}`}
            onClick={() => setMobileDrawer(mobileDrawer === 'sessions' ? 'none' : 'sessions')}>
            <span className="text-lg leading-none">📂</span>
            <span className="text-[10px]">会话</span>
          </button>
          {[{ route: 'assets' as Route, icon: '🖼️', label: '资产' }, { route: 'tasks' as Route, icon: '⏰', label: '任务' }].map(item => (
            <button key={item.route}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${route === item.route && mobileDrawer === 'none' ? 'text-pi-accent' : 'text-pi-dim2'}`}
              onClick={() => { setMobileDrawer('none'); nav(item.route) }}>
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-[10px]">{item.label}</span>
            </button>
          ))}
          <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-pi-dim2" onClick={() => setModelOpen(true)}>
            <span className="text-lg leading-none">⚙️</span>
            <span className="text-[10px]">设置</span>
          </button>
        </nav>

        <ModelManager visible={modelOpen} onClose={() => setModelOpen(false)} />
      </div>
    )
  }

  /* ── 桌面布局：图标 rail + 会话列表 + 主区 + 动态右栏 ── */
  return (
    <div className="h-screen flex bg-pi-bg text-pi-text relative">
      {/* 全局光斑背景 */}
      <div className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(720px 420px at 82% -8%, var(--pi-glow), transparent 62%), radial-gradient(560px 380px at 8% 108%, rgba(120,90,255,.14), transparent 60%)' }} />

      {/* 图标导航 rail */}
      <nav className="w-14 flex-shrink-0 flex flex-col items-center py-3 gap-1.5 glass-strong border-r border-pi-border-soft relative z-20">
        <div className="w-8 h-8 rounded-pi-md avatar-grad flex items-center justify-center text-white font-bold mb-2">语</div>
        {NAV.map(n => (
          <button key={n.route} title={n.label}
            className={`w-9 h-9 rounded-pi-md flex items-center justify-center text-lg transition-all duration-150 relative group/rail ${
              route === n.route ? 'bg-pi-accent/15 text-pi-accent' : 'text-pi-dim2 hover:text-pi-text hover:bg-pi-bg3'}`}
            onClick={() => nav(n.route)}>
            {n.icon}
            <span className="absolute left-full ml-2 px-2 py-1 rounded-pi-sm bg-pi-bg3 border border-pi-border text-[10px] text-pi-text whitespace-nowrap opacity-0 group-hover/rail:opacity-100 pointer-events-none transition-opacity z-50">{n.label}</span>
          </button>
        ))}
        <div className="mt-auto flex flex-col gap-1.5">
          <ThemeSwitcher />
          <button className="w-9 h-9 rounded-pi-md flex items-center justify-center text-base text-pi-dim2 hover:text-pi-text hover:bg-pi-bg3 transition-all" title="密钥与通道管理" onClick={() => setModelOpen(true)}>⚙️</button>
        </div>
      </nav>

      {/* 会话列表：仅对话路由显示 */}
      {route === 'chat' && <Sidebar />}

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {route === 'chat' ? <ChatArea /> : pageArea}
      </div>

      {/* 动态右栏（仅对话路由） */}
      {route === 'chat' && rightPanel !== 'chat' && (
        <div className="w-[44%] min-w-[360px] border-l border-pi-border-soft glass flex flex-col min-h-0 relative z-10">
          <div className="flex items-center gap-1 px-3 h-10 border-b border-pi-border-soft flex-shrink-0">
            {([['workspace', '工作空间'], ['deliveries', '交付物']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setRightPanel(k)}
                className={`text-xs px-3 py-1.5 rounded-pi-md transition-colors ${rightPanel === k ? 'bg-pi-accent/15 text-pi-accent font-medium' : 'text-pi-dim hover:text-pi-text hover:bg-pi-bg3'}`}>
                {label}
              </button>
            ))}
            <span className="ml-auto" />
            <button className="btn-tool !px-2" title="收起右栏" onClick={() => setRightPanel('chat')}>✕</button>
          </div>
          {rightPanel === 'workspace' ? <WorkSpace /> : <Deliveries />}
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
    </div>
  )
}
