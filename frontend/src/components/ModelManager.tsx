import { useEffect, useState } from 'react'
import * as AL from '@radix-ui/react-alert-dialog'
import { Settings2, X, Plus, Trash2, CheckCircle2, KeyRound, Cpu } from 'lucide-react'
import { KeysApi } from '../api'
import { useApp } from '../store'
import ModelSelect from './ModelSelect'

interface ProviderInfo { provider: string; hasKey: boolean; baseUrl: string; modelCount: number; models: string[] }

export default function ModelManager({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addProvider, setAddProvider] = useState('deepseek')
  const [addKey, setAddKey] = useState('')
  const [addBaseUrl, setAddBaseUrl] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)

  const load = () => { setLoading(true); KeysApi.manage().then(d => setProviders(d.providers || [])).catch(() => {}).finally(() => setLoading(false)) }
  useEffect(() => { if (visible) load() }, [visible])

  const add = async () => {
    if (!addKey.trim()) return
    try { await KeysApi.add({ provider: addProvider, key: addKey.trim(), baseUrl: addBaseUrl.trim() }); setAddOpen(false); setAddKey(''); setAddBaseUrl(''); load() }
    catch {}
  }
  const del = async (p: string) => { try { await KeysApi.remove(p); setConfirming(null); load() } catch {} }

  if (!visible) return null
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[var(--pi-z-modal)]" onClick={onClose}>
      <div className="glass-hi panel-glass w-[600px] max-h-[80vh] flex flex-col rounded-pi-xl anim-enter" onClick={e => e.stopPropagation()}>
        {/* 头部：图标+标题+关闭 */}
        <div className="flex items-center gap-2.5 px-5 h-13 py-3 border-b border-pi-border-soft flex-shrink-0">
          <div className="w-8 h-8 rounded-pi-md bg-pi-accent/12 text-pi-accent flex items-center justify-center flex-shrink-0">
            <Cpu className="w-[18px] h-[18px]" strokeWidth={1.8} />
          </div>
          <div>
            <div className="font-semibold text-pi-text leading-tight">模型与通道</div>
            <div className="text-[11px] text-pi-dim2">管理服务商密钥、切换默认模型</div>
          </div>
          <span className="ml-auto" />
          <button className="btn-tool touch-hit !p-2" aria-label="关闭" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        {/* 服务商列表 */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="py-14 text-center text-pi-dim2 text-sm">加载中…</div>
          ) : providers.length === 0 ? (
            <div className="py-14 text-center text-pi-dim2 text-sm">
              还没有配置任何服务商<br /><span className="text-xs">点击下方「添加 API」接入第一个模型通道</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {providers.map(p => (
                <div key={p.provider} className="group flex items-center gap-3 p-3 rounded-pi-lg border border-pi-border bg-pi-bg2 hover:border-pi-accent/40 transition-colors">
                  <div className={`w-8 h-8 rounded-pi-md flex items-center justify-center flex-shrink-0 ${p.hasKey ? 'bg-emerald-500/12 text-emerald-300' : 'bg-pi-bg3 text-pi-dim2'}`}>
                    <KeyRound className="w-4 h-4" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-pi-text text-sm truncate">{p.provider}</span>
                      {p.hasKey
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-pi-green flex-shrink-0" strokeWidth={2.2} />
                        : <span className="text-[10px] px-1 py-px rounded-pi-pill bg-pi-red/15 text-pi-red flex-shrink-0">无Key</span>}
                    </div>
                    <div className="text-[11px] text-pi-dim2 truncate mt-0.5">{p.modelCount} 个模型 · {p.baseUrl || '官方地址'}</div>
                  </div>
                  <button className="btn-tool touch-hit opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:!text-pi-red"
                    aria-label={`删除 ${p.provider}`} onClick={() => setConfirming(p.provider)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底栏：当前模型切换（复用聊天头部的 ModelSelect）+ 添加 API */}
        <div className="border-t border-pi-border-soft p-4 flex items-center gap-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-pi-dim2 mb-1.5">当前模型</div>
            <ModelSelect zClass="z-[var(--pi-z-modal-inner)]" />
          </div>
          <button className="btn-primary flex items-center gap-1.5 px-4 py-2 self-end mb-0.5" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" strokeWidth={2} />添加 API
          </button>
        </div>
      </div>

      {/* 添加 API（轻弹窗）*/}
      {addOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[var(--pi-z-modal-inner)]" onClick={() => setAddOpen(false)}>
          <div className="panel p-4 w-96 glass-hi anim-enter" style={{ animationDuration: '.18s' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Settings2 className="w-4 h-4 text-pi-dim2" />
              <div className="text-sm font-semibold">添加 API</div>
            </div>
            <input className="input-pi mb-2" placeholder="服务商（如 openrouter / deepseek）" value={addProvider} onChange={e => setAddProvider(e.target.value)} autoFocus />
            <input className="input-pi mb-2" type="password" placeholder="API Key (sk-…)" value={addKey} onChange={e => setAddKey(e.target.value)} />
            <input className="input-pi mb-3" placeholder="Base URL（可选，留空用官方）" value={addBaseUrl} onChange={e => setAddBaseUrl(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setAddOpen(false)}>取消</button>
              <button className="btn-primary" onClick={add}>测试并添加</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认（AlertDialog，替代 window.confirm）*/}
      <AL.Root open={!!confirming} onOpenChange={o => !o && setConfirming(null)}>
        <AL.Portal>
          <AL.Overlay className="fixed inset-0 bg-black/40 z-[var(--pi-z-dialog)]" />
          <AL.Content data-slot="provider-delete-dialog" className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 panel p-4 w-72 z-[var(--pi-z-dialog-top)] anim-enter" style={{ animationDuration: '.18s' }}>
            <AL.Title className="text-sm font-semibold mb-1.5">删除服务商配置</AL.Title>
            <AL.Description className="text-xs text-pi-dim mb-3">
              「{confirming}」的密钥配置将被移除。该服务商的模型将无法继续使用。
            </AL.Description>
            <div className="flex justify-end gap-2">
              <AL.Cancel className="btn-ghost">取消</AL.Cancel>
              <AL.Action className="btn bg-pi-red/90 text-white hover:bg-pi-red" onClick={() => confirming && del(confirming)}>删除</AL.Action>
            </div>
          </AL.Content>
        </AL.Portal>
      </AL.Root>
    </div>
  )
}
