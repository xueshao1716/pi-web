import { useEffect } from 'react'
import {
  Activity, BrainCircuit, Cpu, Database, Factory, FolderKanban,
  LayoutGrid, MonitorCog, PackageCheck, Palette, PanelRight, Sparkles,
  TerminalSquare, X,
} from 'lucide-react'
import type { Route } from '../hooks/useHashRoute'

export type UtilityPanelKey = 'workspace' | 'deliveries' | 'terminal' | 'activity' | 'tui'

const MORE_ROUTES: { route: Route; icon: typeof Sparkles; label: string }[] = [
  { route: 'lingxi', icon: Sparkles, label: '灵犀' },
  { route: 'workshop', icon: Factory, label: '专项' },
  { route: 'models', icon: BrainCircuit, label: '模型' },
  { route: 'apps', icon: LayoutGrid, label: '应用' },
  { route: 'engine', icon: Cpu, label: '引擎' },
  { route: 'themes', icon: Palette, label: '主题' },
  { route: 'sessiondb', icon: Database, label: '会话库' },
  { route: 'system', icon: MonitorCog, label: '系统' },
]

const PANEL_ACTIONS: { panel: UtilityPanelKey; icon: typeof Sparkles; label: string }[] = [
  { panel: 'workspace', icon: FolderKanban, label: '工作空间' },
  { panel: 'deliveries', icon: PackageCheck, label: '交付物' },
  { panel: 'terminal', icon: TerminalSquare, label: '终端' },
  { panel: 'activity', icon: Activity, label: '活动' },
  { panel: 'tui', icon: PanelRight, label: 'TUI' },
]

export default function MobileMoreMenu({ open, onClose, route, nav, onOpenPanel, onOpenTheme }: {
  open: boolean
  onClose: () => void
  route: Route
  nav: (route: Route) => void
  onOpenPanel: (panel: UtilityPanelKey) => void
  onOpenTheme: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const openRoute = (nextRoute: Route) => {
    onClose()
    if (nextRoute === 'themes') onOpenTheme()
    else nav(nextRoute)
  }

  return (
    <div className="fixed inset-0 z-[var(--pi-z-dialog)] flex items-end" role="presentation">
      <button className="absolute inset-0 bg-black/45 backdrop-blur-sm" aria-label="关闭更多菜单" onClick={onClose} />
      <section
        className="mobile-more-sheet relative w-full rounded-t-pi-xl border-t border-pi-border bg-pi-bg1 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-more-title"
      >
        <header className="flex min-h-12 items-center gap-3 border-b border-pi-border-soft px-4">
          <div>
            <h2 id="mobile-more-title" className="text-[15px] font-semibold text-pi-text">更多功能</h2>
            <p className="text-xs text-pi-dim">功能页面与辅助工具</p>
          </div>
          <button className="mobile-more-action ml-auto !min-w-11 rounded-pi-md text-pi-dim hover:bg-pi-bg3 hover:text-pi-text" aria-label="关闭更多菜单" onClick={onClose}>
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>

        <div className="max-h-[min(68vh,560px)] overflow-y-auto px-4 py-3">
          <p className="mb-2 text-[11px] font-medium text-pi-dim">功能页面</p>
          <div className="grid grid-cols-4 gap-2">
            {MORE_ROUTES.map(item => (
              <button
                key={item.route}
                className={`mobile-more-action flex-col gap-1 rounded-pi-md px-1 text-xs ${route === item.route ? 'bg-pi-accent/15 text-pi-accent' : 'text-pi-dim hover:bg-pi-bg3 hover:text-pi-text'}`}
                aria-current={route === item.route ? 'page' : undefined}
                onClick={() => openRoute(item.route)}
              >
                <item.icon className="h-5 w-5" strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="my-3 border-t border-pi-border-soft" />
          <p className="mb-2 text-[11px] font-medium text-pi-dim">辅助面板</p>
          <div className="grid grid-cols-2 gap-2">
            {PANEL_ACTIONS.map(item => (
              <button
                key={item.panel}
                className="mobile-more-action justify-start gap-2 rounded-pi-md bg-pi-bg2 px-3 text-xs text-pi-text hover:bg-pi-bg3"
                onClick={() => { onClose(); onOpenPanel(item.panel) }}
              >
                <item.icon className="h-[18px] w-[18px] text-pi-accent" strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
