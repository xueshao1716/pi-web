import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'

// 元枢壳自绘标题栏：仅在 Tauri WebView 内渲染（浏览器里 window.__TAURI__ 不存在 → 返回 null，网页版零影响）
// 窗口控制依赖壳侧 capability（remote: 127.0.0.1:8787）授权的 core:window 权限
export default function TitleBar() {
  const [win, setWin] = useState<any>(null)
  const [maxed, setMaxed] = useState(false)

  useEffect(() => {
    const t = (window as any).__TAURI__
    const w = t?.window?.getCurrentWindow?.()
    if (!w) return
    setWin(w)
    const sync = () => { w.isMaximized?.().then((v: boolean) => setMaxed(!!v)).catch(() => {}) }
    sync()
    let un: any
    try {
      w.onResized?.(() => sync()).then((fn: any) => { un = fn }).catch(() => {})
    } catch {}
    return () => { try { un?.() } catch {} }
  }, [])

  if (!win) return null
  return (
    <div className="h-9 flex items-stretch flex-shrink-0 relative z-[var(--pi-z-topbar)] bg-pi-bg2 border-b border-pi-border select-none">
      <div data-tauri-drag-region className="flex-1 flex items-center pl-3 gap-2 min-w-0">
        <span className="text-pi-accent text-xs font-bold tracking-tight">◈ 元枢</span>
        <span className="text-pi-dim2 text-[11px] hidden sm:inline">个人智能系统</span>
      </div>
      <button aria-label="最小化" title="最小化" onClick={() => win.minimize?.()}
        className="w-11 flex items-center justify-center text-pi-dim hover:text-pi-text hover:bg-pi-bg3 transition-colors">
        <Minus className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      <button aria-label={maxed ? '还原' : '最大化'} title={maxed ? '还原' : '最大化'} onClick={() => win.toggleMaximize?.()}
        className="w-11 flex items-center justify-center text-pi-dim hover:text-pi-text hover:bg-pi-bg3 transition-colors">
        {maxed ? <Copy className="w-3 h-3" strokeWidth={2} /> : <Square className="w-3 h-3" strokeWidth={2} />}
      </button>
      <button aria-label="关闭" title="关闭" onClick={() => win.close?.()}
        className="w-12 flex items-center justify-center text-pi-dim hover:text-white hover:bg-red-500/90 transition-colors">
        <X className="w-4 h-4" strokeWidth={2} />
      </button>
    </div>
  )
}
