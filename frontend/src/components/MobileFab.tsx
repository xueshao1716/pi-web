import { useRef, useState, useEffect, useCallback } from 'react'
import { MessagesSquare, BrainCircuit, Images, Clock4, LayoutGrid, Sparkles, Factory, MonitorCog, Cpu, Settings2, X, Grip } from 'lucide-react'
import type { Route } from '../hooks/useHashRoute'

// ── 移动端悬浮功能按钮（FAB）：把桌面侧栏的主功能收纳进一个可拖动浮动入口 ──
// 手机端底部 TabBar 只有 5 入口，灵犀/专项/模型/应用/引擎/系统不好找 —— 都收进这个 FAB。
// 支持拖动：默认放右下（避开发送框），用户可拖到任意位置（防止遮挡输入框）。

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

const BTN = 52         // FAB 直径 px
const MARGIN = 12      // 距屏幕边距
// 默认位置：右下，但抬到发送框上方(约 bottom-20 = 80px)，避免遮挡输入栏
const DEFAULT = { x: 0, y: 0 } // 会在 mount 时根据视口算右/下偏移

export default function MobileFab({ nav, route, onSettings }: {
  nav: (r: Route) => void
  route: Route
  onSettings: () => void
}) {
  const [open, setOpen] = useState(false)
  // 拖动：用 left/top 绝对定位（比 right/bottom 更适合拖动）
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null) // null=用默认 right/bottom
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moving: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)

  // 计算默认位置（mount 时）：右侧、发框上方；优先用 localStorage 记忆的位置
  useEffect(() => {
    const w = window.innerWidth, h = window.innerHeight
    let saved: { x: number; y: number } | null = null
    try { const s = localStorage.getItem('pi_fab_pos'); if (s) saved = JSON.parse(s) } catch {}
    // 校验 saved 是否在可视范围内（窗口可能变过）并留边距
    const inRange = saved && saved.x >= MARGIN && saved.x <= w - BTN - MARGIN && saved.y >= MARGIN && saved.y <= h - BTN - MARGIN
    setPos(inRange ? saved : { x: w - BTN - MARGIN, y: h - BTN - MARGIN - 88 })
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    // 只处理主指针
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget as HTMLElement
    try { el.setPointerCapture(e.pointerId) } catch {}
    const startX = e.clientX, startY = e.clientY
    const origX = pos?.x ?? (window.innerWidth - BTN - MARGIN)
    const origY = pos?.y ?? (window.innerHeight - BTN - MARGIN - 88)
    dragRef.current = { startX, startY, origX, origY, moving: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY
    // 移动超过阈值判定为拖动（而非点击）
    if (!d.moving && Math.hypot(dx, dy) > 4) d.moving = true
    if (d.moving) {
      if (!dragging) setDragging(true)
      const w = window.innerWidth, h = window.innerHeight
      const nx = Math.max(MARGIN, Math.min(w - BTN - MARGIN, d.origX + dx))
      const ny = Math.max(MARGIN, Math.min(h - BTN - MARGIN, d.origY + dy))
      setPos({ x: nx, y: ny })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    const wasDragging = !!d?.moving
    dragRef.current = null
    if (wasDragging) {
      setDragging(false)
      setOpen(false)
      // 持久化位置（跨刷新记住）
      try { if (pos) localStorage.setItem('pi_fab_pos', JSON.stringify(pos)) } catch {}
      e.preventDefault()
      return
    }
    // 非拖动：视为点击 → 切换菜单
    setOpen(o => !o)
  }

  // 拖动时的位移量（视觉反馈：轻微放大 + 光标 grabbing）
  const posStyle = pos
    ? { left: pos.x, top: pos.y }
    : { right: MARGIN, bottom: MARGIN + 88 }
  const btnStyle = {
    ...posStyle,
    width: BTN, height: BTN,
    // ⚠️ 移动端触摸拖动必须 touch-action:none，否则浏览器当成滚动/缩放手势，pointerMove 被中断、拖不远
    touchAction: 'none',
    transition: dragging ? 'none' : 'box-shadow .2s, transform .2s',
    transform: dragging ? 'scale(1.06) rotate(0deg)' : (open ? 'scale(1) rotate(0deg)' : 'scale(1)'),
    background: 'linear-gradient(135deg, var(--pi-accent), var(--pi-accent2))',
    boxShadow: dragging ? '0 8px 24px color-mix(in oklab, var(--pi-accent) 55%, transparent)' : '0 6px 20px color-mix(in oklab, var(--pi-accent) 45%, transparent)',
  }

  return (
    <>
      {/* 遮罩：点外面关闭 */}
      {open && <div className="fixed inset-0 z-[var(--pi-z-toast)] bg-black/30 backdrop-blur-sm touch-hit" onClick={() => setOpen(false)} />}

      {/* 展开的菜单面板：从 FAB 位置向上弹出 */}
      {open && (
        <div className="fixed z-[var(--pi-z-toast)] w-64 rounded-pi-xl bg-pi-bg1/95 backdrop-blur-xl border border-pi-border-soft shadow-2xl overflow-hidden anim-enter"
          style={{
            ...posStyle,
            transform: `translate(-100%, -${BTN + 10}px)`, // 左移+上移，贴合 FAB
            transformOrigin: 'bottom right',
          }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-pi-border-soft">
            <span className="text-[13px] font-medium text-pi-text">全部功能</span>
            <button className="btn-tool !px-1.5 touch-hit" aria-label="关闭" onClick={() => setOpen(false)}><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-1.5 p-3">
            {FAB_NAV.map(n => (
              <button key={n.route} aria-label={n.label}
                className={`touch-hit flex flex-col items-center gap-1.5 rounded-pi-md px-1 py-2.5 transition-colors ${route === n.route ? 'bg-pi-accent/15' : 'hover:bg-pi-bg-hover/50'}`}
                onClick={() => { setOpen(false); nav(n.route) }}>
                <n.icon className={`w-5 h-5 ${n.color || 'text-pi-text'}`} strokeWidth={1.8} />
                <span className="text-[11px] text-pi-text leading-none">{n.label}</span>
              </button>
            ))}
            <button aria-label="设置"
              className="touch-hit flex flex-col items-center gap-1.5 rounded-pi-md px-1 py-2.5 transition-colors hover:bg-pi-bg-hover/50"
              onClick={() => { setOpen(false); onSettings() }}>
              <Settings2 className="w-5 h-5 text-pi-dim" strokeWidth={1.8} />
              <span className="text-[11px] text-pi-text leading-none">设置</span>
            </button>
          </div>
        </div>
      )}

      {/* FAB 按钮：可拖动 */}
      <button aria-label="全部功能"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`fixed z-[var(--pi-z-toast)] rounded-full flex items-center justify-center text-white select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={btnStyle}>
        {/* 图标：拖动中显示 Grip，其余显示 LayoutGrid（更贴合"全部功能"语义） */}
        {dragging
          ? <Grip className="w-6 h-6" strokeWidth={2} />
          : open
            ? <X className="w-5 h-5" strokeWidth={2.2} />
            : <LayoutGrid className="w-6 h-6" strokeWidth={2} />}
      </button>
    </>
  )
}
