import { Images } from 'lucide-react'
import EmptyState from '../EmptyState'
import type { AssetItem } from '../../types'
import AssetCard from './AssetCard'

export type AssetCollectionProps = { items: AssetItem[]; selectedId: string | null; onSelect: (item: AssetItem) => void; loading: boolean; hasFilters: boolean; onClearFilters: () => void }

export default function AssetCollection({ items, selectedId, onSelect, loading, hasFilters, onClearFilters }: AssetCollectionProps) {
  if (loading) return <div className="asset-loading" role="status">加载中…</div>
  if (!items.length) return <EmptyState icon={Images} title={hasFilters ? '这个筛选下没有资产' : '还没有资产'} hint={hasFilters ? '调整筛选条件后再试' : '生成的图片、文件和交付物会显示在这里'} action={hasFilters ? { label: '清除筛选', onClick: onClearFilters } : undefined} className="py-16" />
  return <div className="asset-collection">{items.map(item => <AssetCard key={item.id} item={item} selected={selectedId === item.id} onSelect={onSelect} />)}</div>
}
