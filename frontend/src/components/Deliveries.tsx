import { useEffect, useState } from 'react'
import { ExternalLink, Package, RefreshCw } from 'lucide-react'
import { WsApi, withFileToken } from '../api'
import type { AssetDelivery } from '../types'

export default function Deliveries() {
  const [items, setItems] = useState<AssetDelivery[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { const d = await WsApi.deliveries(); setItems(d.deliveries || []) } catch {} finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const openDelivery = (path: string) => {
    const url = withFileToken(`/api/ws/file?path=${encodeURIComponent(path)}`)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center px-4 h-11 border-b border-pi-border-soft flex-shrink-0">
        <span className="text-sm font-semibold text-pi-text">交付物</span>
        <span className="ml-auto text-[10px] text-pi-dim2">交付/ 目录</span>
        <button className="btn-tool !h-8 !w-8 !p-0 ml-2" title="刷新交付物" aria-label="刷新交付物" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? <div className="py-10 text-center text-pi-dim2 text-sm">加载中…</div>
          : items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-pi-dim2 text-sm gap-2">
              <Package className="w-7 h-7 opacity-40" strokeWidth={1.5} />
              <span>还没有交付物</span>
              <span className="text-xs">在工作空间选中文件点「交付」，或让小语交付</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {items.map((d, i) => {
                const canOpen = Boolean(d.openPath || d.type === 'file')
                return <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-pi-md border border-pi-border bg-pi-bg2 glow-hover transition-colors">
                  <Package className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-pi-text truncate">{d.name || d.wsPath}</div>
                    <div className="text-[10px] text-pi-dim2 font-mono truncate">{d.wsPath}{d.date ? ` · ${d.date}` : ''}</div>
                  </div>
                  <button type="button" disabled={!canOpen} className="btn-tool !h-8 !w-8 !p-0 flex-shrink-0" title={canOpen ? '打开交付物' : '这个文件夹里没有可打开的文件'} aria-label={canOpen ? `打开${d.name || d.wsPath}` : `${d.name || d.wsPath}（空文件夹）`} onClick={() => { if (canOpen) openDelivery(d.openPath || d.wsPath) }}>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              })}
            </div>
          )}
      </div>
    </div>
  )
}
