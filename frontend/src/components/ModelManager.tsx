import { useEffect, useState, ReactNode } from 'react'
import { KeysApi } from '../api'
import { useApp } from '../store'
import { modelLabel } from './ModelSelect'
import { colors } from '../theme/tokens'

interface ProviderInfo { provider: string; hasKey: boolean; baseUrl: string; modelCount: number; models: string[] }

const CAP_ICON: Record<string, string> = { chat: '💬', image: '🖼', video: '🎬', tts: '🎤', asr: '🎧' }

export default function ModelManager({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { models, currentModel, setCurrentModel } = useApp()
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addProvider, setAddProvider] = useState('deepseek')
  const [addKey, setAddKey] = useState('')
  const [addBaseUrl, setAddBaseUrl] = useState('')

  useEffect(() => { if (visible) { setLoading(true); KeysApi.manage().then(d => setProviders(d.providers || [])).catch(() => {}).finally(() => setLoading(false)) } }, [visible])

  const add = async () => {
    if (!addKey.trim()) return
    try { await KeysApi.add({ provider: addProvider, key: addKey.trim(), baseUrl: addBaseUrl.trim() }); setAddOpen(false); setAddKey(''); setAddBaseUrl(''); setLoading(true); KeysApi.manage().then(d => setProviders(d.providers || [])).finally(() => setLoading(false)) }
    catch {}
  }
  const del = async (p: string) => { if (!window.confirm(`删除 ${p} 配置？`)) return; try { await KeysApi.remove(p); setLoading(true); KeysApi.manage().then(d => setProviders(d.providers || [])).finally(() => setLoading(false)) } catch {} }
  const switchModel = async (mk: string) => {
    const idx = mk.indexOf('/'); const provider = mk.slice(0, idx); const id = mk.slice(idx + 1)
    try { await KeysApi.switchModel({ provider, modelId: id }); setCurrentModel(mk) } catch {}
  }

  if (!visible) return null
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200]" onClick={onClose}>
      <div className="panel w-[600px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center px-5 h-12 border-b border-pi-border-soft flex-shrink-0">
          <span className="font-semibold text-pi-text">模型管理</span>
          <span className="ml-auto" />
          <button className="btn-tool" onClick={onClose}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? <div className="py-10 text-center text-pi-dim2">加载中…</div> : (
            <div className="flex flex-col gap-2">
              {providers.map(p => (
                <div key={p.provider} className="flex items-center gap-2 p-3 rounded-pi-md border border-pi-border bg-pi-bg2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-pi-text text-sm">{p.provider}</span>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-pi-pill ${p.hasKey ? 'bg-pi-green/15 text-pi-green' : 'bg-pi-red/15 text-pi-red'}`}>{p.hasKey ? '已配' : '无Key'}</span>
                      <span className="text-xs text-pi-dim2">{p.modelCount} 模型</span>
                    </div>
                    <div className="text-[11px] text-pi-dim2 truncate mt-0.5 font-mono">{p.baseUrl || '官方地址'}</div>
                  </div>
                  <button className="btn-tool hover:!text-pi-red" onClick={() => del(p.provider)}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-pi-border-soft p-4 flex-shrink-0">
          <div className="mb-3">
            <div className="text-xs text-pi-dim2 mb-2">当前模型</div>
            <select className="input-pi" value={currentModel} onChange={e => switchModel(e.target.value)}>
              <option value="auto/auto">⚡ Auto 智能路由</option>
              {models.map(m => <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>{modelLabel(m)}</option>)}
            </select>
          </div>
          <button className="btn-primary w-full py-2" onClick={() => setAddOpen(true)}>添加 API</button>
        </div>
      </div>

      {addOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[201]" onClick={() => setAddOpen(false)}>
          <div className="panel p-4 w-96" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-3">添加 API</div>
            <input className="input-pi mb-2" placeholder="服务商（如 openrouter / deepseek）" value={addProvider} onChange={e => setAddProvider(e.target.value)} />
            <input className="input-pi mb-2" type="password" placeholder="API Key (sk-…)" value={addKey} onChange={e => setAddKey(e.target.value)} />
            <input className="input-pi mb-3" placeholder="Base URL (可选)" value={addBaseUrl} onChange={e => setAddBaseUrl(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setAddOpen(false)}>取消</button>
              <button className="btn-primary" onClick={add}>测试并添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
