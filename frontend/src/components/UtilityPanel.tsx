import { useEffect, type ReactNode } from 'react'
import { Activity, ChevronsLeftRight, FolderKanban, GitCompare, PackageCheck, PanelRightClose, TerminalSquare, X } from 'lucide-react'
import type { UtilityPanelKey } from './MobileMoreMenu'

const PANEL_TABS: { key: UtilityPanelKey; label: string; description: string; shortcut: string; icon: typeof Activity }[] = [
  { key: 'workspace', label: '工作区', description: '浏览文件、预览内容并交付', shortcut: 'Alt+1', icon: FolderKanban },
  { key: 'deliveries', label: '交付物', description: '查看最近生成和交付的文件', shortcut: 'Alt+2', icon: PackageCheck },
  { key: 'terminal', label: '终端', description: '在当前工作区执行命令', shortcut: 'Alt+3', icon: TerminalSquare },
  { key: 'activity', label: '活动', description: '查看小语最近的执行轨迹', shortcut: 'Alt+4', icon: Activity },
  { key: 'tui', label: 'TUI', description: '接管完整的终端界面', shortcut: 'Alt+5', icon: ChevronsLeftRight },
]

export default function UtilityPanel({ active, onChange, onClose, expanded, onToggleExpanded, children }: {
  active: UtilityPanelKey
  onChange: (active: UtilityPanelKey) => void
  onClose: () => void
  expanded: boolean
  onToggleExpanded: () => void
  onOpenReview?: () => void
  children: ReactNode
}) {
  const canExpand = active === 'terminal' || active === 'tui'
  const activeTab = PANEL_TABS.find(tab => tab.key === active) || PANEL_TABS[0]

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.altKey && /^[1-5]$/.test(e.key)) {
        e.preventDefault()
        const next = PANEL_TABS[Number(e.key) - 1]
        if (next) onChange(next.key)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onChange, onClose])

  useEffect(() => {
    if (!canExpand && expanded) onToggleExpanded()
  }, [canExpand, expanded, onToggleExpanded])

  return (
    <aside className={`utility-panel col-right flex min-h-0 flex-col ${expanded ? 'utility-panel-expanded' : ''}`} data-panel={active} aria-label="辅助工具面板">
      <header className="utility-panel-header flex flex-shrink-0 flex-col border-b border-pi-border-soft">
        <div className="utility-panel-heading flex min-h-12 items-center gap-3 px-3">
          <div className="utility-panel-heading-copy min-w-0 flex-1">
            <div className="utility-panel-kicker">辅助面板</div>
            <div className="utility-panel-title truncate">{activeTab.label}</div>
            <div className="utility-panel-description truncate">{activeTab.description}</div>
          </div>
          <kbd className="utility-panel-shortcut hidden shrink-0 rounded-pi-sm border border-pi-border-soft bg-pi-bg2 px-1.5 py-1 font-mono text-[10px] text-pi-dim2 lg:inline-flex">{activeTab.shortcut}</kbd>
          {onOpenReview && <button type="button" className="utility-panel-review btn-tool !h-9 !px-2" title="打开改动审查" onClick={onOpenReview}><GitCompare className="h-3.5 w-3.5" /><span className="hidden xl:inline">审查</span></button>}
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
        </div>
        <nav className="utility-panel-tabs flex min-w-0 items-center gap-1 overflow-x-auto px-2 pb-2" role="tablist" aria-label="辅助面板类型">
          {PANEL_TABS.map(tab => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active === tab.key}
              aria-controls={`utility-panel-${tab.key}`}
              title={`${tab.label}（${tab.shortcut}）`}
              className={`utility-panel-tab flex min-h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-pi-md border border-transparent px-2 text-xs transition-colors ${active === tab.key ? 'bg-pi-accent/15 text-pi-accent font-medium' : 'text-pi-dim hover:bg-pi-bg3 hover:text-pi-text'}`}
              onClick={() => onChange(tab.key)}
            >
              <tab.icon className="h-4 w-4" strokeWidth={1.8} />
              <span className="utility-panel-tab-label">{tab.label}</span>
            </button>
          ))}
        </nav>
      </header>
      <div id={`utility-panel-${active}`} className="flex min-h-0 flex-1 flex-col" role="tabpanel" aria-label={activeTab.label}>{children}</div>
    </aside>
  )
}
