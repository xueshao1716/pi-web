import { Download, ExternalLink, Pencil, Play, Trash2, X } from 'lucide-react'
import type { AssetItem } from '../../types'
import { assetContextLabel, assetKindLabel } from '../../lib/assets'

export type AssetDetailsProps = { item: AssetItem | null; onRename: (item: AssetItem, name: string) => void; onDelete: (item: AssetItem) => void; onDownload: (item: AssetItem) => void; onOpen: (item: AssetItem) => void; onPreview: (item: AssetItem) => void; onClose?: () => void }

export default function AssetDetails({ item, onRename, onDelete, onDownload, onOpen, onPreview, onClose }: AssetDetailsProps) {
  if (!item) return <aside className="asset-details asset-details--empty">选择一个资产查看详情</aside>
  const beginRename = () => { const next = window.prompt('重命名资产', item.name); if (next?.trim() && next.trim() !== item.name) onRename(item, next.trim()) }
  const canOpen = Boolean(item.url && (!item.isDirectory || item.openPath))
  return (
    <aside className="asset-details" aria-label="资产详情">
      <div className="asset-details__heading"><div><span className="text-xs text-pi-dim2">{item.source === 'delivery' ? '交付物' : '生成物'}</span><h2 title={item.name}>{item.name}</h2></div><div className="asset-details__heading-actions"><button type="button" className="asset-icon-button" aria-label="重命名" onClick={beginRename}><Pencil /></button>{onClose && <button type="button" className="asset-icon-button asset-details__close" aria-label="关闭资产详情" onClick={onClose}><X /></button>}</div></div>
      <dl className="asset-details__list"><div><dt>{item.source === 'delivery' ? '来源' : '项目'}</dt><dd>{assetContextLabel(item)}</dd></div><div><dt>路径</dt><dd title={item.path}>{item.path}</dd></div><div><dt>类型</dt><dd>{assetKindLabel(item.kind)}</dd></div><div><dt>大小</dt><dd>{item.size.toLocaleString()} B</dd></div></dl>
      <div className="asset-details__actions asset-mobile-action-bar">{!item.isDirectory && <button type="button" onClick={() => onPreview(item)}><Play />预览</button>}{!item.isDirectory && <button type="button" onClick={() => onDownload(item)}><Download />下载</button>}{canOpen && <button type="button" onClick={() => onOpen(item)}><ExternalLink />打开</button>}<button type="button" className="is-danger" onClick={() => onDelete(item)}><Trash2 />删除</button></div>
    </aside>
  )
}
