import { useState } from 'react'
import { MessagesSquare, BrainCircuit, Images, Clock4, LayoutGrid, Sparkles, Factory, MonitorCog, Cpu, Settings2, Plus, X } from 'lucide-react'
import type { Route } from '../hooks/useHashRoute'

// ── 移动端悬浮功能按钮（FAB）：把桌面侧栏的主功能收纳进一个浮动入口 ──
// 手机端底部 TabBar 只有 5 入口，灵犀/专项/模型/应用/引擎/系统不好找 —— 都收进这个 FAB。

// 收纳的导航项（除"对话"——它已在 TabBar 且是最核心入口）
const FAB_NAV: { route: Route; icon: typeof MessagesSquare; label: string; color?: string }[] = [
  { route: 'lingxi', icon: Sparkles, label: '灵犀', color: 'text-purple-300' },
  { route: 'workshop', icon: Factory, label: '专项', color: 'text-pi-accent2' },
  { route: 'models', icon: BrainCircuit, label: '模型', color: 'text-pi-accent' },
  { route: 'assets', icon: Images, label: '资产', color: 'text-emerald-300' },
  { route: 'tasks', icon: Clock4, label: '任务', color: 'text-amber-300' },
  { route: 'apps', icon: LayoutGrid, label: '应用', color: 'text-pi-accent' },
  { route: 'engine', icon: Cpu, label: '引擎', color: 'text-sky-300' },
  { route: 'system', icon: MonitorCog, label: '系统', color: 'text-pi-accent2' },
]

export default function MobileFab({ nav, route, onSettings }: {
  nav: (r: Route) => void
  route: Route
  onSettings: () => void
}) {
  const [open, setOpen] = useState(false)

  const go = (r: Route) => { setOpen(false); nav(r) }

  return (
    <>
      {/* 遮罩：点外面关闭 */}
      {open && <div className="fixed inset-0 z-[var(--pi-z-toast)] bg-black/30 backdrop-blur-sm touch-hit" onClick={() => setOpen(false)} />}

      {/* 展开的菜单面板：从 FAB 向上弹出 */}
      {open && (
        <div className="fixed right-4 bottom-24 z-[var(--pi-z-toast)] w-64 rounded-pi-xl bg-pi-bg1/95 backdrop-blur-xl border border-pi-border-soft shadow-2xl overflow-hidden anim-enter"
          style={{ transformOrigin: 'bottom right' }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-pi-border-soft">
            <span className="text-[13px] font-medium text-pi-text">全部功能</span>
            <button className="btn-tool !px-1.5 touch-hit" aria-label="关闭" onClick={() => setOpen(false)}><X className="w-4 h-4" /></button>
          </div>
          {/* 网格收纳 */}
          <div className="grid grid-cols-3 gap-1.5 p-3">
            {FAB_NAV.map(n => (
              <button key={n.route} aria-label={n.label}
                className={`touch-hit flex flex-col items-center gap-1.5 rounded-pi-md px-1 py-2.5 transition-colors ${route === n.route ? 'bg-pi-accent/15' : 'hover:bg-pi-bg-hover/50'}`}
                onClick={() => go(n.route)}>
                <n.icon className={`w-5 h-5 ${n.color || 'text-pi-text'}`} strokeWidth={1.8} />
                <span className="text-[11px] text-pi-text leading-none">{n.label}</span>
              </button>
            ))}
            {/* 模型管理/设置 */}
            <button aria-label="设置"
              className={`touch-hit flex flex-col items-center gap-1.5 rounded-pi-md px-1 py-2.5 transition-colors hover:bg-pi-bg-hover/50`}
              onClick={() => { setOpen(false); onSettings() }}>
              <Settings2 className="w-5 h-5 text-pi-dim" strokeWidth={1.8} />
              <span className="text-[11px] text-pi-text leading-none">设置</span>
            </button>
          </div>
        </div>
      )}

      {/* FAB 按钮 */}
      <button aria-label="全部功能"
        onClick={() => setOpen(o => !o)}
        className={`fixed right-4 bottom-20 z-[var(--pi-z-toast)] w-12 h-12 rounded-full flex items-center justify-center text-white shadow-xl transition-all duration-200 touch-hit ${open ? 'rotate-45' : ''}`}
        style={{ background: 'linear-gradient(135deg, var(--pi-accent), var(--pi-accent2))', boxShadow: '0 6px 20px color-mix(in oklab, var(--pi-accent) 45%, transparent)' }}>
        {open ? <X className="w-5 h-5" strokeWidth={2.2} /> : <Plus className="w-6 h-6" strokeWidth={2.2} />}
      </button>
    </>
  )
}
