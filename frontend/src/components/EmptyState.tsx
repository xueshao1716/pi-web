import type { ComponentType, ReactNode } from 'react'

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>

export type EmptyStateProps = {
  /** lucide 图标组件（与 emoji 二选一） */
  icon?: IconType
  /** 或用 emoji */
  emoji?: string
  title: string
  hint?: string
  /** 可选 CTA：空状态引导用户下一步（对标 uView u-empty 插槽心智） */
  action?: { label: string; onClick: () => void }
  className?: string
  children?: ReactNode
}

/**
 * 统一空状态（2026-08-26）：图标徽章 + 标题 + 提示 + 可选 CTA。
 * 全站列表/面板空态一律用它，不再手搓 dashed 盒子。
 */
export default function EmptyState({ icon: Icon, emoji, title, hint, action, className = '', children }: EmptyStateProps) {
  return (
    <div className={`empty-state py-12 text-center ${className}`}>
      {Icon ? (
        <div className="w-14 h-14 mb-3 mx-auto rounded-full bg-pi-accent/10 grid place-items-center">
          <Icon className="w-7 h-7 text-pi-accent/70" strokeWidth={1.5} />
        </div>
      ) : emoji ? (
        <div className="text-3xl mb-2 opacity-60">{emoji}</div>
      ) : null}
      <div className="text-sm font-medium text-pi-text/90">{title}</div>
      {hint && <div className="text-[11px] text-pi-dim2 mt-1.5 max-w-[280px] mx-auto leading-relaxed">{hint}</div>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-1.5 rounded-pi-md text-xs font-medium bg-pi-accent/15 text-pi-accent border border-pi-accent/30 hover:bg-pi-accent/25 transition-colors touch-hit"
        >
          {action.label}
        </button>
      )}
      {children}
    </div>
  )
}
