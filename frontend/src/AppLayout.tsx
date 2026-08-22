import { useState } from 'react'
import { useApp } from './store'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import WorkSpace from './components/Workspace'
import Deliveries from './components/Deliveries'
import ModelManager from './components/ModelManager'
import ThemeSwitcher from './components/ThemeSwitcher'

export default function AppLayout() {
  const { authed } = useApp()
  const [rightPanel, setRightPanel] = useState<'chat' | 'workspace' | 'deliveries'>('chat')
  const [modelOpen, setModelOpen] = useState(false)

  if (!authed) return <Login />
  return (
    <div className="h-screen flex bg-pi-bg text-pi-text relative">
      {/* 全局光斑背景 */}
      <div className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(720px 420px at 82% -8%, var(--pi-glow), transparent 62%), radial-gradient(560px 380px at 8% 108%, rgba(120,90,255,.14), transparent 60%)' }} />

      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <ChatArea />
      </div>
      {rightPanel !== 'chat' && (
        <div className="w-[44%] min-w-[360px] border-l border-pi-border-soft glass flex flex-col min-h-0 relative z-10">
          {/* 右栏 Tab 头 */}
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

      {/* 顶栏右侧工具胶囊 */}
      <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5">
        <div className="flex items-center gap-1 p-1 rounded-pi-md glass-strong border border-pi-border-soft">
          <ThemeSwitcher />
          <button className="btn-ghost text-xs" onClick={() => setModelOpen(true)}>模型</button>
          <button className={`btn text-xs px-2 py-1 rounded-pi-sm transition-all duration-150 ${rightPanel !== 'chat' ? 'bg-pi-accent text-white' : 'text-pi-dim hover:text-pi-text hover:bg-pi-bg3'}`} onClick={() => setRightPanel(rightPanel === 'chat' ? 'workspace' : 'chat')}>右栏</button>
        </div>
      </div>

      <ModelManager visible={modelOpen} onClose={() => setModelOpen(false)} />
    </div>
  )
}
