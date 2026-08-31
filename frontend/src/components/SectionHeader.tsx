import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type SectionHeaderProps = {
  title: string
  description?: string
  icon?: LucideIcon
  actions?: ReactNode
}

export default function SectionHeader({ title, description, icon: Icon, actions }: SectionHeaderProps) {
  return (
    <header className="section-header">
      <div className="section-header__content">
        <div className="section-header__title-row">
          {Icon && <Icon className="section-header__icon" aria-hidden="true" />}
          <h2 className="section-header__title">{title}</h2>
        </div>
        {description && <p className="section-header__description">{description}</p>}
      </div>
      {actions && <div className="section-header__actions">{actions}</div>}
    </header>
  )
}
