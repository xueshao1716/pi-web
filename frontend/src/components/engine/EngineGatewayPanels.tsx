import { useRef, useState } from 'react'
import { Plug, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { EngineApi } from '../../api'

export default function EngineGatewayPanels({ data, error, onReload, onProbe, probing }: { data?: any; error?: unknown; onReload: () => Promise<unknown>; onProbe: () => Promise<void>; probing: boolean }) {
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [actionError, setActionError] = useState('')
  const plugins: any[] = data?.plugins || []
  const has = (id: string) => plugins.some(p => p.id === id)
  const change = async (operation: () => Promise<unknown>) => {
    if (pending.current || !data || error) return
    pending.current = true; setBusy(true); setActionError('')
    try { await operation(); await onReload() }
    catch (e) { setActionError(e instanceof Error ? e.message : '插件操作失败，请刷新后重试') }
    finally { pending.current = false; setBusy(false) }
  }
  const registerPlugin = (preset: 'echo' | 'clock') => change(() => EngineApi.registerPlugin({ preset }))
  const unregisterPlugin = (id: string, core: boolean) => { if (!core) void change(() => EngineApi.unregisterPlugin(id)) }
  const disabled = busy || !data || !!error
  return <section className="border-t border-pi-border-soft py-5" aria-labelledby="engine-gateway-title">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <h2 id="engine-gateway-title" className="text-sm font-semibold text-pi-text">Gateway 旁路</h2>
      <button type="button" className="btn-ghost min-h-11" disabled={probing || busy} onClick={() => void onProbe()}><RefreshCw className={`w-4 h-4 ${probing ? 'animate-spin' : ''}`} />探活</button>
    </div>
    <p className="text-sm text-pi-dim mb-3">旁路组件与预置插件，不替换主聊天引擎。</p>
    {error ? <p role="alert" className="text-sm text-pi-danger mb-3">旁路状态暂不可用{data ? '，以下为上次数据' : '，请重新探活'}。</p> : !data ? <p role="status" className="text-sm text-pi-dim">正在读取旁路状态...</p> : null}
    {data?.probedAt && <p className="text-xs text-pi-dim mb-3">上次读取 {new Date(data.probedAt).toLocaleTimeString('zh-CN', { hour12: false })}</p>}
    <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mb-5 text-sm">
      {Object.entries({ modelAdapter: '模型适配器', toolRegistry: '工具注册表', sessionStore: '会话存储', agentLoop: 'Agent 循环' }).map(([key, label]) => <div key={key} className="min-w-0"><dt className="text-pi-dim">{label}</dt><dd className="text-pi-text break-all mt-1">{data?.components?.[key]?.name || '未取得数据'}</dd></div>)}
    </dl>
    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
      <h3 className="text-sm font-medium text-pi-text">旁路插件</h3>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost min-h-11" disabled={disabled || has('echo-demo')} onClick={() => void registerPlugin('echo')}><Plus className="w-4 h-4" />挂回声预置</button>
        <button type="button" className="btn-ghost min-h-11" disabled={disabled || has('clock-demo')} onClick={() => void registerPlugin('clock')}><Plus className="w-4 h-4" />挂时钟预置</button>
      </div>
    </div>
    {actionError && <p role="alert" className="text-sm text-pi-danger break-words mb-3">{actionError}</p>}
    <div className="divide-y divide-pi-border-soft">
      {plugins.map(p => <div key={p.id || p.name} className="flex flex-wrap items-center gap-2 py-3 text-sm">
        <Plug className="w-4 h-4 shrink-0 text-pi-dim" /><span className="min-w-0 flex-1 text-pi-text break-all">{p.name}<span className="text-pi-dim ml-2">v{p.version || '?'}</span></span>
        <span className={p.mounted ? 'text-pi-success' : 'text-pi-dim'}>{p.mounted ? '已挂载' : '未挂载'}</span>
        {p.core ? <span className="text-xs text-pi-dim">核心锁定</span> : <button type="button" title={`卸载 ${p.name}`} aria-label={`卸载 ${p.name}`} className="btn-ghost min-h-11 min-w-11" disabled={disabled} onClick={() => unregisterPlugin(p.id || p.name, p.core)}><Trash2 className="w-4 h-4" /></button>}
        {!!p.deps?.length && <p className="basis-full text-xs text-pi-dim break-all">依赖：{p.deps.join(', ')}</p>}
      </div>)}
      {data && !plugins.length && <p className="text-sm text-pi-dim py-3">暂无旁路插件</p>}
    </div>
    <details className="mt-4">
      <summary className="min-h-11 py-3 cursor-pointer text-sm text-pi-text">能力清单</summary>
      <div className="divide-y divide-pi-border-soft">{(data?.capabilities || []).map((c: any) => <div key={c.id || c.name} className="py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-pi-text">{c.name}<span className={c.have ? 'text-pi-success' : 'text-pi-dim'}>{c.have ? '已具备' : '规划中'}</span></div>
        <p className="text-pi-dim mt-1 break-words">{c.desc}</p>
      </div>)}</div>
    </details>
  </section>
}
