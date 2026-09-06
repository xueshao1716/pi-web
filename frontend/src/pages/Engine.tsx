import { useState } from 'react'
import { Cpu, Plug, Wrench, FolderClosed, Brain, RefreshCw, ChevronDown, ArrowLeftRight } from 'lucide-react'
import useSWR from 'swr'
import { EngineApi } from '../api'
import TerminalPanel from '../components/TerminalPanel'

// ── 引擎（独立大模块）：运行底盘 / 工具注册表 / 可插拔能力清单 ──

type CompCard = { key: string; name: string; note: string; desc: string; icon: any }

const COMP_META: CompCard[] = [
  { key: 'modelAdapter', name: '模型适配器', note: 'ModelAdapter', desc: '模型调用入口，当前走 HTTP/OpenAI 兼容', icon: <Brain className="w-4 h-4 text-pi-accent" /> },
  { key: 'toolRegistry', name: '工具注册表', note: 'ToolRegistry', desc: '暴露给模型的可调用工具集', icon: <Wrench className="w-4 h-4 text-pi-accent" /> },
  { key: 'sessionStore', name: '会话存储', note: 'SessionStore', desc: '会话历史持久化方式', icon: <FolderClosed className="w-4 h-4 text-pi-accent" /> },
  { key: 'agentLoop', name: 'Agent 循环', note: 'AgentLoop', desc: '一次对话的执行编排', icon: <RefreshCw className="w-4 h-4 text-pi-accent" /> },
]

function EnginePairPanel() {
  const { data, mutate } = useSWR('engine-pair', () => EngineApi.pair())
  const [busy, setBusy] = useState('')
  const catalog = data?.catalog || []
  const pick = async (slot: 'primary' | 'secondary', id: string) => {
    if (!data || id === data[slot]) return
    setBusy(slot)
    try {
      const other = slot === 'primary' ? data.secondary : data.primary
      if (id === other) await EngineApi.savePair({ swap: true })
      else await EngineApi.savePair(slot === 'primary' ? { primary: id, secondary: other } : { primary: other, secondary: id })
      await mutate()
    } catch (e: any) { alert(e?.message || e) } finally { setBusy('') }
  }
  const swap = async () => {
    setBusy('swap')
    try { await EngineApi.savePair({ swap: true }); await mutate() } catch (e: any) { alert(e?.message || e) } finally { setBusy('') }
  }
  const Slot = ({ slot, label }: { slot: 'primary' | 'secondary'; label: string }) => (
    <div className="rounded-pi-md bg-pi-bg2/60 border border-pi-border-soft p-3.5 min-w-0 flex-1">
      <div className="text-[11px] text-pi-dim2 mb-1.5">{label}</div>
      <select
        className="w-full bg-pi-bg1 border border-pi-border rounded-pi-sm px-2 py-2 text-[13px] text-pi-text min-h-[44px]"
        value={data?.[slot] || ''}
        disabled={!!busy}
        onChange={(e) => pick(slot, e.target.value)}
      >
        {catalog.map((e) => (
          <option key={e.id} value={e.id}>{e.label}{e.canLead ? '' : '（暂不能主驾）'}</option>
        ))}
      </select>
    </div>
  )
  return (
    <div className="panel !p-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[13px] font-medium text-pi-text">主次引擎</span>
        <span className="text-[11px] text-pi-dim2">接到后台，下一句对话生效</span>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
        <Slot slot="primary" label="主引擎" />
        <button type="button" className="btn-tool min-h-[44px] min-w-[44px] self-center" disabled={!!busy} onClick={swap} aria-label="对调主次引擎">
          <ArrowLeftRight className="w-4 h-4" />
        </button>
        <Slot slot="secondary" label="次引擎" />
      </div>
      {data?.deferred && <div className="text-[11px] text-pi-dim2 mt-2">本轮实际走 {data.lead === 'yuanshu' ? '元枢' : data.lead}（{data.deferred} 被兑底）</div>}
      {data?.eval && (
        <div className="text-[11px] text-pi-dim2 mt-2">
          评测绳 {data.eval.passed}/{data.eval.total} · {Math.round((data.eval.score || 0) * 100)}%
          {data.eval.byTag && Object.entries(data.eval.byTag).map(([k, v]) => (
            <span key={k} className="ml-2">{k} {v.passed}/{v.total}</span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-3">
        {catalog.map((e) => {
          const role = e.id === data?.primary ? '主驾' : e.id === data?.secondary ? '次席' : null
          return (
            <article key={e.id} className="rounded-pi-md bg-pi-bg2/60 border border-pi-border-soft p-3.5 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <h3 className="text-[13px] font-medium text-pi-text">{e.label}</h3>
                {role && <span className="px-1.5 py-0.5 rounded-pi-sm bg-pi-accent/12 text-pi-accent text-[10px]">{role}</span>}
                {!e.canLead && <span className="px-1.5 py-0.5 rounded-pi-sm bg-pi-dim2/12 text-pi-dim2 text-[10px]">暂不能主驾</span>}
              </div>
              <p className="text-[12px] text-pi-text/80 leading-relaxed">{e.intro || e.desc}</p>
              <div className="mt-2.5">
                <div className="text-[11px] text-pi-dim2 mb-1">能做</div>
                <ul className="text-[12px] text-pi-text/80 leading-relaxed space-y-1 pl-3.5 list-disc">
                  {(e.can || []).map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
              <div className="mt-2.5">
                <div className="text-[11px] text-pi-dim2 mb-1">边界</div>
                <ul className="text-[12px] text-pi-text/80 leading-relaxed space-y-1 pl-3.5 list-disc">
                  {(e.cannot || []).map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function StatusBadge({ have }: { have: boolean }) {
  return (
    <span className={`px-1.5 py-0.5 rounded-pi-sm text-[10px] font-medium ${have ? 'bg-emerald-500/15 text-emerald-300' : 'bg-pi-dim2/15 text-pi-dim2'}`}>
      {have ? '已具备' : '规划中'}
    </span>
  )
}

function RunningChassis({ st, onProbe, probing }: { st: any; onProbe: () => void; probing?: boolean }) {
  const comp = st.components || {}
  const sidecarTools: string[] = comp.toolRegistry?.tools || []
  const probed = st.probedAt ? new Date(st.probedAt).toLocaleTimeString('zh-CN', { hour12: false }) : ''
  return (
    <div className="panel !p-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[13px] font-medium text-pi-text">运行底盘</span>
        <span className="px-1.5 py-0.5 rounded-pi-sm bg-pi-accent/12 text-pi-accent text-[10px] whitespace-nowrap">Gateway 旁路 · sidecar</span>
        <button type="button" className="btn-ghost text-[11px] whitespace-nowrap ml-auto min-h-[36px] px-2.5" disabled={probing} onClick={onProbe}>探活</button>
      </div>
      <p className="text-[12px] text-pi-text/80 leading-relaxed mb-3">{st.note || '主聊天走上方主次引擎；这套 Gateway 是旁路演示。'}</p>
      {probed && <div className="text-[11px] text-pi-dim2 mb-3">上次探活 {probed}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {COMP_META.map(c => {
          const v = comp[c.key] || {}
          return (
            <div key={c.key} className="rounded-pi-md bg-pi-bg2/60 border border-pi-border-soft p-3.5 flex gap-3 items-start">
              <div className="w-8 h-8 rounded-pi-md bg-pi-accent/12 text-pi-accent flex items-center justify-center flex-shrink-0">{c.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-pi-text">{c.name}</span>
                  <span className="px-1.5 py-0.5 rounded-pi-sm bg-pi-dim2/12 text-pi-dim2 text-[10px] whitespace-nowrap">核心锁定</span>
                </div>
                <div className="font-mono text-[11px] text-pi-accent mt-0.5 truncate">{v.name || '—'}</div>
                <div className="text-[11px] text-pi-dim2 mt-1 leading-relaxed">{c.desc}</div>
              </div>
            </div>
          )
        })}
      </div>
      {!!sidecarTools.length && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-[11px] text-pi-dim2 self-center">旁路工具</span>
          {sidecarTools.map((n) => <span key={n} className="px-1.5 py-0.5 rounded-pi-sm bg-pi-accent/10 text-pi-accent font-mono text-[10px]">{n}</span>)}
        </div>
      )}
    </div>
  )
}

function ToolRegistry({ data }: { data: any }) {
  const tools: any[] = data?.tools || []
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return (
    <div className="panel !p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-pi-text">工具注册表</span>
          <span className="text-[11px] text-pi-dim2">{data?.count ?? tools.length} 个 · 主聊天实际暴露</span>
        </div>
        {data?.dsh && <span className="px-1.5 py-0.5 rounded-pi-sm bg-pi-violet/12 text-purple-300 text-[10px] font-mono">dsh_task 已注入</span>}
      </div>
      <div className="space-y-1.5">
        {tools.map(t => {
          const isOpen = open[t.name]
          return (
            <div key={t.name} className="border-b border-pi-border-soft last:border-none">
              <button className="w-full flex items-center gap-2 py-2 text-left hover:bg-pi-bg-hover/40 rounded-pi-sm px-1.5 -mx-1.5" onClick={() => setOpen(o => ({ ...o, [t.name]: !o[t.name] }))}>
                <span className={`font-mono text-[12px] ${t.name === 'dsh_task' ? 'text-purple-300 font-semibold' : 'text-pi-accent'}`}>{t.name}</span>
                <ChevronDown className={`w-3 h-3 text-pi-dim2 ml-auto transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && <div className="text-[11px] text-pi-dim2 pb-2 pl-1.5 leading-relaxed">{t.description || '（无描述）'}</div>}
            </div>
          )
        })}
        {!tools.length && <div className="text-[11px] text-pi-dim2">暂无工具数据</div>}
      </div>
    </div>
  )
}

function Capabilities({ list }: { list: any[] }) {
  return (
    <div className="panel !p-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[13px] font-medium text-pi-text">可插拔能力清单</span>
        <span className="text-[11px] text-pi-dim2">来自 /api/engine/status，不再写死展览卡</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {list.map((c) => (
          <div key={c.id || c.name} className="rounded-pi-md bg-pi-bg2/50 border border-pi-border-soft p-3 flex gap-3 items-start">
            <div className={`w-8 h-8 rounded-pi-md flex items-center justify-center flex-shrink-0 ${c.have ? 'bg-pi-accent/12 text-pi-accent' : 'bg-pi-dim2/12 text-pi-dim2'}`}>
              <Cpu className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-pi-text">{c.name}</span>
                <StatusBadge have={!!c.have} />
              </div>
              <div className="text-[11px] text-pi-dim2 mt-0.5 leading-relaxed">{c.desc}</div>
            </div>
          </div>
        ))}
        {!list.length && <div className="text-[11px] text-pi-dim2">重启 8787 后这里会拉到活清单</div>}
      </div>
    </div>
  )
}

function Plugins({ data, onReload }: { data: any; onReload: () => void }) {
  const [busy, setBusy] = useState('')
  const plugins = data?.plugins || []
  const has = (id: string) => plugins.some((p: any) => p.id === id)
  const mountPreset = async (preset: 'echo' | 'clock') => {
    setBusy(preset)
    try { await EngineApi.registerPlugin({ preset }); onReload() } catch (e: any) { alert('挂载失败：' + (e?.message || e)) } finally { setBusy('') }
  }
  const unreg = async (id: string, core?: boolean) => {
    if (core) return
    setBusy(id); try { await EngineApi.unregisterPlugin(id); onReload() } catch (e: any) { alert('卸载失败：' + (e?.message || e)) } finally { setBusy('') }
  }
  return (
    <div className="panel !p-3">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <span className="text-[13px] font-medium text-pi-text">已挂载插件</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button type="button" className="btn-ghost text-[11px] whitespace-nowrap min-h-[36px] px-2.5" disabled={!!busy || has('echo-demo')} onClick={() => mountPreset('echo')}>挂回声预置</button>
          <button type="button" className="btn-ghost text-[11px] whitespace-nowrap min-h-[36px] px-2.5" disabled={!!busy || has('clock-demo')} onClick={() => mountPreset('clock')}>挂时钟预置</button>
          <span className="text-[11px] text-pi-dim2 whitespace-nowrap">{plugins.length} 个</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {plugins.map((p: any) => (
          <div key={p.id || p.name} className="flex items-center gap-2 py-1.5 border-b border-pi-border-soft last:border-none">
            <Plug className="w-3.5 h-3.5 text-pi-dim flex-shrink-0" />
            <span className="text-xs font-mono text-pi-text min-w-0 truncate">{p.name}<span className="text-pi-dim2 ml-1.5">v{p.version || '?'}</span></span>
            {p.core && <span className="px-1.5 py-0.5 rounded-pi-sm bg-pi-dim2/12 text-pi-dim2 text-[10px]">核心</span>}
            {p.deps?.length ? <span className="text-[10px] text-pi-dim2 truncate">依赖：{p.deps.join(', ')}</span> : null}
            <span className={`ml-auto px-1.5 py-0.5 rounded-pi-sm text-[10px] whitespace-nowrap ${p.mounted ? 'bg-emerald-500/15 text-emerald-300' : 'bg-pi-dim2/15 text-pi-dim2'}`}>{p.mounted ? '已挂载' : '未挂载'}</span>
            {!p.core && (
              <button className="btn-ghost text-[10px] whitespace-nowrap px-2 py-0.5 hover:!text-pi-red flex-shrink-0" disabled={busy === p.id} onClick={() => unreg(p.id || p.name, p.core)}>
                卸载
              </button>
            )}
          </div>
        ))}
        {!plugins.length && <div className="text-[11px] text-pi-dim2">暂无插件</div>}
      </div>
    </div>
  )
}

export default function Engine() {
  const { data: status, mutate, isValidating } = useSWR('engine-status', () => EngineApi.status(), { refreshInterval: 60000 })
  const { data: toolsData, mutate: mutateTools } = useSWR('engine-tools', () => EngineApi.tools(), { refreshInterval: 60000 })
  const probe = async () => { await Promise.all([mutate(), mutateTools()]) }

  return (
    <div className="flex-1 overflow-y-auto relative z-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-6 overflow-x-hidden">
        <div className="mb-6">
          <h1 className="page-title">引擎</h1>
          <p className="text-xs text-pi-dim2 mt-1.5">主次引擎接到主聊天；下面是 Gateway 旁路，能探活、能挂预置插件、能跑代码模式</p>
        </div>

        <div className="space-y-4 page-enter">
          <EnginePairPanel />
          <RunningChassis st={status || {}} onProbe={probe} probing={isValidating} />
          <ToolRegistry data={toolsData} />
          <Plugins data={status} onReload={() => mutate()} />
          <div className="panel !p-0 overflow-hidden">
            <div className="px-3 pt-3 pb-2 text-[13px] font-medium text-pi-text">代码模式</div>
            <div className="h-[520px] flex flex-col border-t border-pi-border-soft">
              <TerminalPanel />
            </div>
          </div>
          <Capabilities list={status?.capabilities || []} />
        </div>
      </div>
    </div>
  )
}
