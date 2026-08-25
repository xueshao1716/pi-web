import { useState, useRef, useEffect } from 'react'
import { useApp } from '../store'
import { KeysApi } from '../api'
import { ChevronDown, Zap, Paintbrush, Video, Mic2, Cpu } from 'lucide-react'
import type { Model } from '../types'

function capIcon(m: Model) {
  const cap = m.capabilities as any
  const keys: string[] = Array.isArray(cap) ? cap : Object.entries(cap || {}).filter(([, v]) => v).map(([k]) => k as string)
  if (keys.includes('image')) return <Paintbrush className="w-3.5 h-3.5 text-pink-400" strokeWidth={1.8} />
  if (keys.includes('video')) return <Video className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.8} />
  if (keys.includes('tts') || keys.includes('asr')) return <Mic2 className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.8} />
  return <Cpu className="w-3.5 h-3.5 text-pi-accent2" strokeWidth={1.8} />
}

export function modelLabel(m: Model): string {
  const cap = m.capabilities as any
  const keys: string[] = Array.isArray(cap) ? cap : Object.entries(cap || {}).filter(([, v]) => v).map(([k]) => k as string)
  const tag = keys.includes('image') ? '[绘图] ' : keys.includes('video') ? '[视频] ' : (keys.includes('tts') || keys.includes('asr')) ? '[语音] ' : ''
  const free = m.free || (m.note || '').includes('免费')
  return `${tag}${m.name}（${m.provider}）${free ? ' · 免费' : ''}`
}

export default function ModelSelect({ compact = false }: { compact?: boolean }) {
  const { models, currentModel, setCurrentModel } = useApp()
  const [open, setOpen] = useState(false)
  // roving focus：hi 为当前键盘高亮项（0=Auto，1..n=模型列表）
  const [hi, setHi] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLDivElement | null)[]>([])

  const isAuto = currentModel === 'auto/auto'
  const currentLabel = isAuto ? 'Auto' : (() => {
    const idx = currentModel.indexOf('/')
    const m = models.find(x => x.provider === currentModel.slice(0, idx) && x.id === currentModel.slice(idx + 1))
    return m ? m.name : currentModel
  })()

  // 选项扁平表：[auto, ...models]
  const options: { mk: string }[] = [{ mk: 'auto/auto' }, ...models.map(m => ({ mk: `${m.provider}/${m.id}` }))]

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // 打开时高亮定位到当前选中项，并把焦点交给高亮 option（屏幕阅读器可读）
  useEffect(() => {
    if (!open) return
    const idx = Math.max(0, options.findIndex(o => o.mk === currentModel))
    setHi(idx)
    setTimeout(() => optionRefs.current[idx]?.focus(), 0)
  }, [open]) // eslint-disable-line

  // 高亮项滚入视野
  useEffect(() => {
    if (!open) return
    optionRefs.current[hi]?.scrollIntoView({ block: 'nearest' })
    optionRefs.current[hi]?.focus()
  }, [hi, open])

  const select = async (mk: string) => {
    setCurrentModel(mk); setOpen(false)
    if (mk === 'auto/auto') return
    const idx = mk.indexOf('/')
    try { await KeysApi.switchModel({ provider: mk.slice(0, idx), modelId: mk.slice(idx + 1) }) } catch {}
  }

  const onOptionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Home') { e.preventDefault(); setHi(0) }
    else if (e.key === 'End') { e.preventDefault(); setHi(options.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(options[hi].mk) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  const triggerKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') && !open) {
      e.preventDefault(); setOpen(true)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        onKeyDown={triggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="选择模型"
        className={`flex items-center gap-1.5 px-2 py-1 rounded-pi-md border border-pi-border-soft bg-pi-bg2/50 text-[11.5px] text-pi-dim hover:text-pi-text hover:border-pi-accent/40 transition-all duration-200 ${compact ? 'max-w-[110px]' : 'max-w-[160px]'}`}
      >
        <Zap className="w-3 h-3 text-pi-accent flex-shrink-0" strokeWidth={2} />
        <span className="truncate font-medium">{currentLabel}</span>
        <ChevronDown className={`w-3 h-3 text-pi-dim2 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
      </button>

      {open && (
        <div id="pi-model-listbox" role="listbox" aria-label="模型列表"
          className="absolute bottom-full left-0 mb-1.5 w-72 max-h-80 overflow-y-auto rounded-pi-lg border border-pi-border bg-pi-bg1/95 backdrop-blur-xl shadow-2xl shadow-black/40 z-50 anim-enter" style={{ animationDuration: '0.15s' }}>
          {/* Auto */}
          <div
            ref={el => { optionRefs.current[0] = el }}
            role="option" aria-selected={isAuto} tabIndex={-1}
            data-mk="auto/auto"
            className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer outline-none transition-colors ${isAuto ? 'bg-pi-accent/12 text-pi-accent' : hi === 0 ? 'bg-pi-bg-hover text-pi-text' : 'text-pi-dim hover:bg-pi-bg-hover hover:text-pi-text'}`}
            onMouseEnter={() => setHi(0)}
            onFocus={() => setHi(0)}
            onKeyDown={onOptionKeyDown}
            onClick={() => select('auto/auto')}
          >
            <Zap className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold">Auto 智能路由</div>
              <div className="text-[10.5px] opacity-60">按任务复杂度自动选模型</div>
            </div>
            {isAuto && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pi-accent/20 text-pi-accent font-medium">当前</span>}
          </div>
          <div className="mx-3 border-t border-pi-border-soft" />
          {models.map((m, i) => {
            const mk = `${m.provider}/${m.id}`
            const active = currentModel === mk
            const free = m.free || (m.note || '').includes('免费')
            const idx = i + 1
            return (
              <div
                key={mk}
                ref={el => { optionRefs.current[idx] = el }}
                role="option" aria-selected={active} tabIndex={-1}
                data-mk={mk}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer outline-none transition-colors ${active ? 'bg-pi-accent/12' : hi === idx ? 'bg-pi-bg-hover' : 'hover:bg-pi-bg-hover'}`}
                onMouseEnter={() => setHi(idx)}
                onFocus={() => setHi(idx)}
                onKeyDown={onOptionKeyDown}
                onClick={() => select(mk)}
              >
                <div className="flex-shrink-0">{capIcon(m)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[12.5px] font-medium truncate ${active ? 'text-pi-accent' : 'text-pi-text'}`}>{m.name}</span>
                    {free && <span className="text-[9.5px] px-1 py-px rounded-full bg-emerald-500/15 text-emerald-400 font-medium flex-shrink-0">免费</span>}
                  </div>
                  <div className="text-[10.5px] text-pi-dim2 truncate">{m.provider}</div>
                </div>
                {active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pi-accent/20 text-pi-accent font-medium flex-shrink-0">当前</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
