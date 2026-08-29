import { useRef, useState, useEffect } from 'react'
import { MessagesSquare, BrainCircuit, Images, Clock4, LayoutGrid, Sparkles, Factory, MonitorCog, Cpu, Settings2, X, Grip, FolderClosed, PanelRight, Palette, Database } from 'lucide-react'
import type { Route } from '../hooks/useHashRoute'

// ── 移动端悬浮功能按钮（FAB）：全部主功能收纳进可拖动浮动入口 ──
// 收：灵犀/专项/模型/资产/任务/应用/引擎/系统 + 会话/右栏/主题/设置
// 支持拖动(存 localStorage)；弹出菜单按 FAB 位置智能展开到空间大的方向。

const FAB_NAV: { route: Route; icon: typeof MessagesSquare; label: string; color?: string }[] = [
  { route: 'lingxi', icon: Sparkles, label: '灵犀', color: 'text-purple-300' },
  { route: 'workshop', icon: Factory, label: '专项', color: 'text-pi-accent2' },
  { route: 'models', icon: BrainCircuit, label: '模型', color: 'text-pi-accent' },
  { route: 'assets', icon: Images, label: '资产', color: 'text-emerald-300' },
  { route: 'tasks', icon: Clock4, label: '任务', color: 'text-amber-300' },
  { route: 'apps', icon: LayoutGrid, label: '应用', color: 'text-pi-accent' },
  { route: 'engine', icon: Cpu, label: '引擎', color: 'text-sky-300' },
  { route: 'themes', icon: Palette, label: '主题', color: 'text-fuchsia-300' },
  { route: 'sessiondb', icon: Database, label: '会话库', color: 'text-cyan-300' },
  { route: 'system', icon: MonitorCog, label: '系统', color: 'text-pi-accent2' },
]

const BTN = 52
const MARGIN = 12

export default function MobileFab({ nav, route, onSettings, onOpenSessions, onOpenPanel, onOpenTheme }: {
  nav: (r: Route) => void
  route: Route
  onSettings: () => void
  onOpenSessions: () => void
  onOpenPanel: (k: 'workspace' | 'deliveries' | 'terminal' | 'activity' | 'tui') => void
  onOpenTheme: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moving: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const w = window.innerWidth, h = window.innerHeight
    let saved: { x: number; y: number } | null = null
    try { const s = localStorage.getItem('pi_fab_pos'); if (s) saved = JSON.parse(s) } catch {}
    const inRange = saved && saved.x >= MARGIN && saved.x <= w - BTN - MARGIN && saved.y >= MARGIN && saved.y <= h - BTN - MARGIN
    setPos(inRange ? saved : { x: w - BTN - MARGIN, y: h - BTN - MARGIN - 88 })
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
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
      setDragging(false); setOpen(false)
      try { if (pos) localStorage.setItem('pi_fab_pos', JSON.stringify(pos)) } catch {}
      e.preventDefault()
      return
    }
    setOpen(o => !o)
  }

  const posStyle = pos ? { left: pos.x, top: pos.y } : { right: MARGIN, bottom: MARGIN + 88 }
  const btnStyle = {
    ...posStyle,
    width: BTN, height: BTN,
    touchAction: 'none',
    transition: dragging ? 'none' : 'box-shadow .2s, transform .2s',
    transform: dragging ? 'scale(1.06) rotate(0deg)' : 'scale(1)',
    background: 'linear-gradient(135deg, var(--pi-accent), var(--pi-accent2))',
    boxShadow: dragging ? '0 8px 24px color-mix(in oklab, var(--pi-accent) 55%, transparent)' : '0 6px 20px color-mix(in oklab, var(--pi-accent) 45%, transparent)',
  }

  // ── 智能展开：根据 FAB 在屏幕的相对位置，挑空间大的方向弹菜单 ──
  // 菜单尺寸估算：宽 264 (w-64) + 高约 340（8功能+3快捷 + 头部）
  const MENU_W = 264, MENU_H = 360
  const fabX = pos?.x ?? (window.innerWidth - BTN - MARGIN)
  const fabY = pos?.y ?? (window.innerHeight - BTN - MARGIN - 88)
  const w = window.innerWidth, h = window.innerHeight
  // 右侧空间是否够放整个菜单（留 gap），不够就放左侧
  const toLeft = (fabX + BTN + 10 + MENU_W) > w
  // 下方空间是否够，不够就放上方
  const toUp = (fabY + BTN + 10 + MENU_H) > h
  const menuX = toLeft ? fabX - MENU_W - 8 : fabX + BTN + 8
  const menuY = toUp ? fabY - MENU_H - 8 : fabY + BTN + 8
  // clamp 进屏幕
  const menuStyle = {
    left: Math.max(8, Math.min(w - MENU_W - 8, menuX)),
    top: Math.max(8, Math.min(h - MENU_H - 8, menuY)),
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-[var(--pi-z-toast)] bg-black/30 backdrop-blur-sm touch-hit" onClick={() => setOpen(false)} />}

      {open && (
        <div className="fixed z-[var(--pi-z-toast)] rounded-pi-xl bg-pi-bg1/95 backdrop-blur-xl border border-pi-border-soft shadow-2xl overflow-hidden anim-enter"
          style={{ ...menuStyle, width: MENU_W }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-pi-border-soft">
            <span className="text-[13px] font-medium text-pi-text">全部功能</span>
            <button className="btn-tool !px-1.5 touch-hit" aria-label="关闭" onClick={() => setOpen(false)}><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-4 gap-1.5 p-3">
            {FAB_NAV.map(n => (
              <button key={n.route} aria-label={n.label}
                className={`touch-hit flex flex-col items-center gap-1.5 rounded-pi-md px-1 py-2.5 transition-colors ${route === n.route ? 'bg-pi-accent/15' : 'hover:bg-pi-bg-hover/50'}`}
                onClick={() => { setOpen(false); nav(n.route) }}>
                <n.icon className={`w-5 h-5 ${n.color || 'text-pi-text'}`} strokeWidth={1.8} />
                <span className="text-[11px] text-pi-text leading-none">{n.label}</span>
              </button>
            ))}
            {/* 动作项：会话抽屉 / 右栏（08-29 伙伴拍板：并入网格，取消底部第二排） */}
            <button aria-label="会话"
              className="touch-hit flex flex-col items-center gap-1.5 rounded-pi-md px-1 py-2.5 transition-colors hover:bg-pi-bg-hover/50"
              onClick={() => { setOpen(false); onOpenSessions() }}>
              <FolderClosed className="w-5 h-5 text-pi-accent" strokeWidth={1.8} />
              <span className="text-[11px] text-pi-text leading-none">会话</span>
            </button>
            <button aria-label="右栏"
              className="touch-hit flex flex-col items-center gap-1.5 rounded-pi-md px-1 py-2.5 transition-colors hover:bg-pi-bg-hover/50"
              onClick={() => { setOpen(false); onOpenPanel('terminal') }}>
              <PanelRight className="w-5 h-5 text-sky-300" strokeWidth={1.8} />
              <span className="text-[11px] text-pi-text leading-none">右栏</span>
            </button>
          </div>
        </div>
      )}

      <button aria-label="全部功能"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        className={`fixed z-[var(--pi-z-toast)] rounded-full flex items-center justify-center text-white select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={btnStyle}>
        {dragging ? <Grip className="w-6 h-6" strokeWidth={2} /> : open ? <X className="w-5 h-5" strokeWidth={2.2} /> : <LayoutGrid className="w-6 h-6" strokeWidth={2} />}
      </button>
    </>
  )
}
