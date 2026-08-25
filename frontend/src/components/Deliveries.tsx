import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { WsApi } from '../api'

interface Delivery { path: string; name?: string; time?: string }

export default function Deliveries() {
  const [items, setItems] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { const d = await WsApi.deliveries(); setItems(d.deliveries || []) } catch {} finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center px-4 h-11 border-b border-pi-border-soft flex-shrink-0">
        <span className="text-sm font-semibold text-pi-text">交付物</span>
        <span className="ml-auto text-[10px] text-pi-dim2">交付/ 目录</span>
        <button className="btn-tool !px-2 ml-2" title="刷新" onClick={load}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
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
              {items.map((d, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-pi-md border border-pi-border bg-pi-bg2 glow-hover transition-colors">
                  <Package className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-pi-text truncate">{d.name || d.path}</div>
                    <div className="text-[10px] text-pi-dim2 font-mono truncate">{d.path}{d.time ? ` · ${d.time}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}
