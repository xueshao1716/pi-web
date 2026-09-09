import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { WorkshopApi } from '../api'
import WorkshopModelPicker, { useWorkshopModel } from './WorkshopModelPicker'

const SKILL_LABEL: Record<string, string> = {
  'wanxiang-portrait': '万像人物',
  'wanxiang-design': '万像设计',
  'seedance-25': 'Seedance',
  'shortform-genesis': 'SHORTFORM',
}

export default function PromptSmartFill({
  kind,
  idea,
  draft,
  onFilled,
}: {
  kind: 'image' | 'video' | 'html'
  idea: string
  draft?: string
  onFilled: (r: { prompt: string; fields?: Record<string, string> }) => void
}) {
  const fillModel = useWorkshopModel(`pi_workshop_model_expand_${kind}`, { preferFlash: true })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [meta, setMeta] = useState('')
  const run = async () => {
    const seed = String(idea || '').trim()
    if (seed.length < 2) { setErr(kind === 'html' ? '先写一句主题' : '先写一句想画或想拍的'); return }
    setBusy(true); setErr(''); setMeta('')
    try {
      const r = await WorkshopApi.expandPrompt({ kind, idea: seed, draft, model: fillModel.value })
      if (!r.prompt) { setErr(r.error || '填充失败'); return }
      onFilled({ prompt: r.prompt, fields: r.fields || {} })
      if (r.source === 'fallback') {
        setMeta('模型没赶上，用了规则扩写')
        return
      }
      const used = r.modelName || r.model || ''
      const skills = (r.skills || []).map(n => SKILL_LABEL[n] || n)
      const bits = [used && `用了 ${used}`, skills.length && `带了 ${skills.join('、')}`].filter(Boolean)
      setMeta(bits.join(' · '))
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
        <WorkshopModelPicker label="填充模型" value={fillModel.value} onChange={fillModel.set} textModels={fillModel.textModels} />
        <button type="button" className="btn-tool text-xs min-h-11 w-full sm:w-auto disabled:opacity-60 inline-flex items-center justify-center gap-1.5" onClick={run} disabled={busy}>
          <Sparkles className="w-3.5 h-3.5" />{busy ? '填充中…' : '智能填充'}
        </button>
      </div>
      {meta && <span className="text-[11px] text-pi-dim2">{meta}</span>}
      {err && <span className="text-xs text-pi-red truncate">{err}</span>}
    </div>
  )
}
