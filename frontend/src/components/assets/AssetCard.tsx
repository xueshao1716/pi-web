import { AudioLines, FileText, Folder, Image as ImageIcon, PlaySquare, Presentation } from 'lucide-react'
import { withFileToken } from '../../api'
import type { AssetItem } from '../../types'

const size = (value: number) => value >= 1e6 ? `${(value / 1e6).toFixed(1)} MB` : value >= 1e3 ? `${(value / 1e3).toFixed(0)} KB` : `${value} B`
const date = (value: string) => {
  if (!value) return '未知日期'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? '未知日期'
    : parsed.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export type AssetCardProps = { item: AssetItem; selected: boolean; onSelect: (item: AssetItem) => void }

export default function AssetCard({ item, selected, onSelect }: AssetCardProps) {
  const Icon = item.isDirectory ? Folder : item.kind === 'image' ? ImageIcon : item.kind === 'video' ? PlaySquare : item.kind === 'audio' ? AudioLines : item.kind === 'presentation' ? Presentation : FileText
  return (
    <button type="button" aria-pressed={selected} aria-label={`选择 ${item.name}`} onClick={() => onSelect(item)} className={`asset-card ${selected ? 'is-selected' : ''}`}>
      <div className="asset-card__media">
        {item.kind === 'image' && !item.isDirectory && item.url ? <img src={withFileToken(item.url)} alt="" loading="lazy" /> : <Icon className="asset-card__icon" strokeWidth={1.5} />}
        {item.kind === 'video' && !item.isDirectory && item.url && <span className="asset-card__play">播放</span>}
      </div>
      <div className="asset-card__name" title={item.name}>{item.name}</div>
      <div className="asset-card__hint">{item.kind === 'presentation' ? '点击查看大纲' : item.isDirectory ? '打开目录' : '点击预览'}</div>
      <div className="asset-card__meta"><span className={item.source === 'delivery' ? 'asset-source-badge' : undefined}>{item.source === 'delivery' ? '交付' : item.project}</span><span>{size(item.size)}</span></div>
      <div className="asset-card__date">{date(item.date)}</div>
    </button>
  )
}
