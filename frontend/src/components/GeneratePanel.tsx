import { useState } from 'react'
import { MediaApi, withFileToken } from '../api'
import { useApp } from '../store'
import type { Model } from '../types'

// ── 出图面板：选模型/尺寸 → 生成 → 服务端自动落盘 生成物/图片/日期 → 资产库刷新 ──

const SIZE_OPTIONS = ['1024x1024', '832x1472', '1472x832']
const SIZE_LABEL: Record<string, string> = { '1024x1024': '方形 1:1', '832x1472': '竖版 9:16', '1472x832': '横版 16:9' }

function capKeys(m: Model): string[] {
  const cap = m.capabilities as any
  return Array.isArray(cap) ? cap : Object.entries(cap || {}).filter(([, v]) => v).map(([k]) => k as string)
}

export default function GeneratePanel({ onClose, onGenerated }: { onClose: () => void; onGenerated: () => void }) {
  const { models } = useApp()
  const imageModels = models.filter(m => capKeys(m).includes('image'))
  const [modelIdx, setModelIdx] = useState(0)
  const [size, setSize] = useState('1024x1024')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const gen = async () => {
    if (!prompt.trim() || !imageModels[modelIdx]) return
    setBusy(true); setErr(''); setResult(null)
    try {
      const m = imageModels[modelIdx]
      const r = await MediaApi.image({ provider: m.provider, modelId: m.id, prompt: prompt.trim(), size })
      if (r.image) { setResult(r.image); onGenerated() }
      else setErr(r.error || '未返回图片')
    } catch (e: any) {
      // api.ts 已把对象型 error 转成可读字符串
      setErr(e?.message || String(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="panel !p-4 mb-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-pi-text">🎨 生成图片</span>
        <span className="text-[10.5px] text-pi-dim2">生成后自动存入「生成物/图片」，出现在下方列表</span>
        <button className="btn-tool !px-2 ml-auto" onClick={onClose}>✕</button>
      </div>
      {imageModels.length === 0 ? (
        <div className="text-xs text-pi-dim2 py-2">没有可用的图像模型——先到模型管理里添加（如 Agnes / 云flare Flux / 豆包 Seedream）</div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            <select className="input-pi !py-1.5 text-xs max-w-[260px]" value={modelIdx}
              onChange={e => setModelIdx(+e.target.value)}>
              {imageModels.map((m, i) => (
                <option key={`${m.provider}/${m.id}`} value={i}>
                  {m.name}（{m.provider}）{m.free ? ' · 免费' : ''}
                </option>
              ))}
            </select>
            <select className="input-pi !py-1.5 text-xs w-36" value={size} onChange={e => setSize(e.target.value)}>
              {SIZE_OPTIONS.map(s => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}
            </select>
          </div>
          <textarea className="input-pi text-[13px] resize-none" rows={3}
            placeholder="描述想要的画面…"
            value={prompt} onChange={e => setPrompt(e.target.value)} />
          <div className="flex items-center gap-3">
            <button className="btn-primary text-xs px-4 py-1.5 disabled:opacity-60" onClick={gen} disabled={busy || !prompt.trim()}>
              {busy ? `生成中…（图像模型较慢，可能 30-120s）` : '⚡ 生成'}
            </button>
            {err && <span className="text-xs text-pi-red truncate">{err}</span>}
          </div>
          {result && (
            <div className="flex items-start gap-3 pt-1">
              <img src={withFileToken(result)} alt="生成结果" className="max-w-[240px] max-h-[240px] rounded-pi-lg border border-pi-border object-cover cursor-zoom-in"
                onClick={() => window.open(withFileToken(result), '_blank')} />
              <a className="text-xs text-pi-accent hover:underline mt-1" href={withFileToken(result)} target="_blank" rel="noreferrer">新窗口查看 ↗</a>
            </div>
          )}
        </>
      )}
    </div>
  )
}
