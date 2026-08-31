import { useEffect, type ReactNode } from 'react'
import { Activity, ChevronsLeftRight, FolderKanban, PackageCheck, PanelRightClose, TerminalSquare, X } from 'lucide-react'
import type { UtilityPanelKey } from './MobileMoreMenu'

const PANEL_TABS: { key: UtilityPanelKey; label: string; icon: typeof Activity }[] = [
  { key: 'workspace', label: '工作空间', icon: FolderKanban },
  { key: 'deliveries', label: '交付物', icon: PackageCheck },
  { key: 'terminal', label: '终端', icon: TerminalSquare },
  { key: 'activity', label: '活动', icon: Activity },
  { key: 'tui', label: 'TUI', icon: ChevronsLeftRight },
]

export default function UtilityPanel({ active, onChange, onClose, expanded, onToggleExpanded, children }: {
  active: UtilityPanelKey
  onChange: (active: UtilityPanelKey) => void
  onClose: () => void
  expanded: boolean
  onToggleExpanded: () => void
  children: ReactNode
}) {
  const canExpand = active === 'terminal' || active === 'tui'

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    if (!canExpand && expanded) onToggleExpanded()
  }, [canExpand, expanded, onToggleExpanded])

  return (
    <aside className={`utility-panel col-right flex min-h-0 flex-col ${expanded ? 'utility-panel-expanded' : ''}`} aria-label="辅助工具面板">
      <header className="flex min-h-11 flex-shrink-0 items-center gap-1 border-b border-pi-border-soft px-2">
        <div className="utility-panel-tabs flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {PANEL_TABS.map(tab => (
            <button
              key={tab.key}
              className={`utility-panel-tab flex min-h-9 flex-shrink-0 items-center gap-1.5 rounded-pi-md px-2 text-xs transition-colors ${active === tab.key ? 'bg-pi-accent/15 text-pi-accent font-medium' : 'text-pi-dim hover:bg-pi-bg3 hover:text-pi-text'}`}
              aria-current={active === tab.key ? 'page' : undefined}
              onClick={() => onChange(tab.key)}
            >
              <tab.icon className="h-4 w-4" strokeWidth={1.8} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        {canExpand && (
          <button
            className="utility-panel-expand btn-tool !h-9 !w-9 !p-0"
            aria-label={expanded ? '退出展开视图' : '展开面板'}
            aria-expanded={expanded}
            title={expanded ? '退出展开视图' : '展开面板'}
            onClick={onToggleExpanded}
          >
            <ChevronsLeftRight className="h-4 w-4" />
          </button>
        )}
        <button className="btn-tool !h-9 !w-9 !p-0" aria-label="关闭辅助工具面板" title="关闭辅助工具面板" onClick={onClose}>
          {expanded ? <PanelRightClose className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  )
}
