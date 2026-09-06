import { useState } from 'react'
import { useApp } from '../store'
import type { Model } from '../types'

function capKeys(m: Model): string[] {
  const cap = m.capabilities as any
  return Array.isArray(cap) ? cap : Object.entries(cap || {}).filter(([, v]) => v).map(([k]) => k as string)
}

export function useWorkshopModel(storageKey: string) {
  const { models, currentModel } = useApp()
  const textModels = models.filter(m => {
    const keys = capKeys(m)
    return !keys.includes('image') && !keys.includes('video')
  })
  const [saved, setSaved] = useState(() => {
    try { return localStorage.getItem(storageKey) || '' } catch { return '' }
  })
  const keys = textModels.map(m => `${m.provider}/${m.id}`)
  const fallback = keys.includes(currentModel) ? currentModel : (keys[0] || '')
  const value = keys.includes(saved) ? saved : fallback
  const set = (next: string) => {
    setSaved(next)
    try { localStorage.setItem(storageKey, next) } catch {}
  }
  return { value, set, textModels }
}

export default function WorkshopModelPicker({ value, onChange, textModels }: {
  value: string
  onChange: (v: string) => void
  textModels: Model[]
}) {
  if (!textModels.length) {
    return <span className="text-[11px] text-pi-dim2">没有可用文本模型——先到模型管理添加</span>
  }
  return (
    <label className="text-xs text-pi-dim flex flex-col sm:flex-row sm:items-center gap-1.5 w-full sm:w-auto">
      模型
      <select className="input-pi min-h-11 !py-2 text-xs w-full sm:max-w-[260px]" value={value} onChange={e => onChange(e.target.value)}>
        {textModels.map(m => (
          <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
            {m.name}（{m.provider}）{m.free ? ' · 免费' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
