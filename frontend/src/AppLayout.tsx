import { useState } from 'react'
import { useApp } from './store'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import WorkSpace from './components/Workspace'
import ModelManager from './components/ModelManager'
import ThemeSwitcher from './components/ThemeSwitcher'

export default function AppLayout() {
  const { authed } = useApp()
  const [rightPanel, setRightPanel] = useState<'chat' | 'workspace'>('chat')
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
      {rightPanel === 'workspace' && (
        <div className="w-[44%] min-w-[360px] border-l border-pi-border-soft glass flex flex-col min-h-0 relative z-10">
          <WorkSpace />
        </div>
      )}

      {/* 顶栏右侧工具胶囊 */}
      <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5">
        <div className="flex items-center gap-1 p-1 rounded-pi-md glass-strong border border-pi-border-soft">
          <ThemeSwitcher />
          <button className="btn-ghost text-xs" onClick={() => setModelOpen(true)}>模型</button>
          <button className={`btn text-xs px-2 py-1 rounded-pi-sm transition-all duration-150 ${rightPanel === 'workspace' ? 'bg-pi-accent text-white' : 'text-pi-dim hover:text-pi-text hover:bg-pi-bg3'}`} onClick={() => setRightPanel(rightPanel === 'workspace' ? 'chat' : 'workspace')}>工作空间</button>
        </div>
      </div>

      <ModelManager visible={modelOpen} onClose={() => setModelOpen(false)} />
    </div>
  )
}
