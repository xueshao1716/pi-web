import { useApp } from '../store'
import { KeysApi } from '../api'
import type { Model } from '../types'

// 能力图标：兼容对象/数组两种 capabilities 形态
function capIcon(m: Model): string {
  const cap = m.capabilities as any
  const keys: string[] = Array.isArray(cap) ? cap : Object.entries(cap || {}).filter(([, v]) => v).map(([k]) => k as string)
  if (keys.includes('image')) return '🎨'
  if (keys.includes('video')) return '🎬'
  if (keys.includes('tts')) return '🎤'
  if (keys.includes('asr')) return '🎧'
  return '💬'
}

export function modelLabel(m: Model): string {
  const free = m.free || (m.note || '').includes('免费')
  return `${capIcon(m)} ${m.name}（${m.provider}）${free ? ' · 免费' : ''}`
}

export default function ModelSelect() {
  const { models, currentModel, setCurrentModel } = useApp()
  const isAuto = currentModel === 'auto/auto'

  const select = async (mk: string) => {
    setCurrentModel(mk)
    if (mk === 'auto/auto') return // Auto：不显式切换，服务端按会话路由
    const idx = mk.indexOf('/')
    try { await KeysApi.switchModel({ provider: mk.slice(0, idx), modelId: mk.slice(idx + 1) }) } catch {}
  }

  return (
    <select
      className="text-xs px-2 py-1 rounded-pi-md border border-pi-border bg-pi-bg2/70 text-pi-dim hover:text-pi-text hover:border-pi-accent/40 outline-none cursor-pointer max-w-[280px] transition-colors"
      value={currentModel}
      onChange={e => select(e.target.value)}
      title="选择模型（⚡Auto = 按任务复杂度自动路由）"
    >
      <option value="auto/auto">⚡ Auto 智能路由</option>
      {models.map(m => {
        const mk = `${m.provider}/${m.id}`
        return <option key={mk} value={mk}>{modelLabel(m)}</option>
      })}
    </select>
  )
}
