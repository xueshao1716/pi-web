import { useEffect, useState } from 'react'

// 极简全局 toast（2026-08-25）：消灭静默 catch{}——操作失败必须让用户看见。
// 用法：toast('模型切换失败', 'error')；App 挂一次 <Toaster />。
type Tone = 'info' | 'error' | 'ok'
interface Item { id: number; msg: string; tone: Tone }

type Listener = (item: Item) => void
const listeners = new Set<Listener>()
let seq = 0

export function toast(msg: string, tone: Tone = 'info') {
  const item: Item = { id: ++seq, msg, tone }
  listeners.forEach(l => l(item))
}

export function Toaster() {
  const [items, setItems] = useState<Item[]>([])
  useEffect(() => {
    const l: Listener = (item) => {
      setItems(prev => [...prev.slice(-2), item]) // 最多同屏 3 条
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== item.id)), item.tone === 'error' ? 5000 : 3000)
    }
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  if (!items.length) return null
  return (
    <div aria-live="polite" className="toast-stack fixed left-1/2 -translate-x-1/2 z-[var(--pi-z-toast)] flex flex-col gap-2 items-center pointer-events-none">
      {items.map(it => (
        <div key={it.id}
          role="status"
          className={`anim-enter px-4 py-2 rounded-pi-lg border text-[13px] shadow-xl backdrop-blur-xl max-w-[80vw] ${
            it.tone === 'error' ? 'bg-pi-red/15 border-pi-red/40 text-pi-red'
            : it.tone === 'ok' ? 'bg-pi-green/15 border-pi-green/40 text-pi-green'
            : 'bg-pi-bg1/95 border-pi-border text-pi-text'}`}>
          {it.msg}
        </div>
      ))}
    </div>
  )
}
