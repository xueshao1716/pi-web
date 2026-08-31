import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type StatusTileProps = {
  label: string
  value: ReactNode
  detail?: string
  icon: LucideIcon
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}

export default function StatusTile({ label, value, detail, icon: Icon, tone = 'neutral' }: StatusTileProps) {
  return (
    <div className="status-tile" data-tone={tone}>
      <div className="status-tile__icon" aria-hidden="true"><Icon /></div>
      <div className="status-tile__content">
        <span className="status-tile__label">{label}</span>
        <strong className="status-tile__value">{value}</strong>
        {detail && <span className="status-tile__detail">{detail}</span>}
      </div>
    </div>
  )
}
