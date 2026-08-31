import { Film, Image, MessagesSquare, Mic } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Model } from '../../types'

export type ModelCardProps = {
  model: Model
  active: boolean
  switching: boolean
  onUse: () => void
}

function capabilityKeys(model: Model): string[] {
  const capabilities = model.capabilities as unknown
  return Array.isArray(capabilities)
    ? capabilities
    : Object.entries(capabilities || {}).filter(([, enabled]) => enabled).map(([key]) => key)
}

function capabilityIcon(model: Model): LucideIcon {
  const keys = capabilityKeys(model)
  if (keys.includes('image')) return Image
  if (keys.includes('video')) return Film
  if (keys.includes('tts') || keys.includes('asr')) return Mic
  return MessagesSquare
}

export default function ModelCard({ model, active, switching, onUse }: ModelCardProps) {
  const CapabilityIcon = capabilityIcon(model)
  const free = model.free || (model.note || '').includes('免费')
  const vision = (model.capabilities as any)?.vision === true
  const context = model.contextWindow
    ? model.contextWindow >= 1000 ? `${Math.round(model.contextWindow / 1000)}K` : String(model.contextWindow)
    : ''

  return (
    <article className={`panel !p-3.5 flex flex-col gap-2.5 card-hover overflow-hidden ${active ? '!border-pi-accent/50 ring-1 ring-pi-accent/30' : ''}`}>
      <div className="flex items-start gap-2.5 min-w-0">
        <span className={`w-8 h-8 rounded-pi-md flex items-center justify-center flex-shrink-0 ${active ? 'bg-pi-accent/15 text-pi-accent' : 'bg-pi-default text-pi-dim'}`}>
          <CapabilityIcon className="w-4 h-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-[13px] text-pi-text truncate flex-1">{model.name}</h3>
            {active && <span className="text-[10px] text-pi-success flex-shrink-0">使用中</span>}
          </div>
          <p className="mt-0.5 text-[11px] text-pi-dim2 font-mono truncate">{model.provider}/{model.id}</p>
        </div>
      </div>

      <div className="flex min-h-5 items-center gap-1.5 flex-wrap text-[10px]">
        {free && <span className="px-1.5 py-0.5 rounded-pi-pill border border-pi-success/30 bg-pi-success/10 text-pi-success">免费</span>}
        {model.reasoning && <span className="px-1.5 py-0.5 rounded-pi-pill border border-pi-accent/25 bg-pi-accent/10 text-pi-accent">推理</span>}
        {vision && <span className="px-1.5 py-0.5 rounded-pi-pill border border-pi-accent/25 bg-pi-accent/10 text-pi-accent">视觉</span>}
        {context && <span className="px-1.5 py-0.5 rounded-pi-pill bg-pi-default text-pi-dim2">上下文 {context}</span>}
      </div>

      {model.note && <p className="text-[12px] text-pi-dim2 truncate" title={model.note}>{model.note}</p>}

      <button onClick={onUse} disabled={active}
        className={`mt-auto text-[12px] rounded-pi-md py-1.5 transition-colors duration-150 ${active ? 'bg-pi-default text-pi-dim2 cursor-default' : 'accent-soft text-pi-accent hover:brightness-110'}`}>
        {active ? '当前使用' : switching ? '切换中…' : '切换使用'}
      </button>
    </article>
  )
}
