import { useEffect, useState } from 'react'
import { Plus, Trash2, CheckCircle2, KeyRound, Settings2 } from 'lucide-react'
import { KeysApi } from '../api'

// ── ModelChannels：服务商密钥/通道管理（从 ModelManager 抽出，供 ModelHub 嵌入）──
// 服务商列表(有Key/无Key/模型数) + 添加 API(provider/key/baseUrl 测试并添加) + 删除

interface ProviderInfo { provider: string; hasKey: boolean; baseUrl: string; modelCount: number; models: string[] }

export default function ModelChannels() {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addProvider, setAddProvider] = useState('openrouter')
  const [addKey, setAddKey] = useState('')
  const [addBaseUrl, setAddBaseUrl] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const load = () => { setLoading(true); KeysApi.manage().then(d => setProviders(d.providers || [])).catch(() => {}).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!addKey.trim()) { setErr('请填写 API Key'); return }
    setErr(''); setOk('')
    try {
      const r = await KeysApi.add({ provider: addProvider.trim(), key: addKey.trim(), baseUrl: addBaseUrl.trim() })
      // 成功：探测到的模型数
      const n = (r as any)?.modelCount ?? (r as any)?.models?.length
      setOk(`✓ 已添加 ${addProvider}${n ? ` · 识别 ${n} 个模型` : ''}`)
      setAddOpen(false); setAddKey(''); setAddBaseUrl(''); load()
    } catch (e: any) { setErr(e?.message || '添加失败，请检查 Key/Base URL') }
  }
  const del = async (p: string) => { try { await KeysApi.remove(p); load() } catch {} }

  return (
    <div className="panel !p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-semibold text-pi-text flex items-center gap-2"><KeyRound className="w-4 h-4 text-pi-accent" />服务商通道</div>
        <button className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="w-3.5 h-3.5" />添加 API
        </button>
      </div>

      {/* 添加 API 表单（内联展开）*/}
      {addOpen && (
        <div className="rounded-pi-md bg-pi-bg2/50 border border-pi-border-soft p-3 mb-3 space-y-2">
          <div className="flex items-center gap-2 text-[12px] text-pi-dim"><Settings2 className="w-3.5 h-3.5" />接入新服务商</div>
          <input className="input-pi !py-1.5 text-xs font-mono" placeholder="服务商（如 openrouter / deepseek / bigmodel）" value={addProvider} onChange={e => setAddProvider(e.target.value)} />
          <input className="input-pi !py-1.5 text-xs font-mono" type="password" placeholder="API Key (sk-…)" value={addKey} onChange={e => setAddKey(e.target.value)} />
          <input className="input-pi !py-1.5 text-xs font-mono" placeholder="Base URL（可选，留空用官方）" value={addBaseUrl} onChange={e => setAddBaseUrl(e.target.value)} />
          {err && <div className="text-[11px] text-pi-danger">{err}</div>}
          {ok && <div className="text-[11px] text-pi-success">{ok}</div>}
          <div className="flex gap-2">
            <button className="btn-primary text-[11px] px-2.5 py-1" onClick={add}>测试并添加</button>
            <button className="btn-tool text-[11px]" onClick={() => { setAddOpen(false); setErr('') }}>取消</button>
          </div>
        </div>
      )}

      {/* 服务商列表 */}
      {loading ? (
        <div className="py-6 text-center text-pi-dim2 text-sm">加载中…</div>
      ) : providers.length === 0 ? (
        <div className="py-6 text-center text-pi-dim2 text-sm">还没有配置任何服务商，点「添加 API」接入第一个通道</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {providers.map(p => (
            <div key={p.provider} className="group flex items-center gap-3 p-3 rounded-pi-lg border border-pi-border bg-pi-bg2 hover:border-pi-accent/40 transition-colors">
              <div className={`w-8 h-8 rounded-pi-md flex items-center justify-center flex-shrink-0 ${p.hasKey ? 'bg-pi-success/10 text-pi-success' : 'bg-pi-bg3 text-pi-dim2'}`}>
                <KeyRound className="w-4 h-4" strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-pi-text text-sm truncate">{p.provider}</span>
                  {p.hasKey
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-pi-success flex-shrink-0" strokeWidth={2.2} />
                    : <span className="text-[10px] px-1 py-px rounded-pi-pill bg-pi-danger/15 text-pi-danger flex-shrink-0">无Key</span>}
                </div>
                <div className="text-[11px] text-pi-dim2 truncate mt-0.5">{p.modelCount} 个模型 · {p.baseUrl || '官方地址'}</div>
              </div>
              <button className="btn-tool touch-hit opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:!text-pi-danger"
                aria-label={`删除 ${p.provider}`} onClick={() => del(p.provider)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
