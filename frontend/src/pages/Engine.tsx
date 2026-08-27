import { useState } from 'react'
import { Cpu, Plug, Wrench, FolderClosed, Brain, RefreshCw, Gauge, ShieldAlert, Image, Mic, Globe, Wrench as Tools, Plus, ChevronDown, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import useSWR from 'swr'
import { EngineApi } from '../api'

// ── 引擎（独立大模块）：运行底盘 / 工具注册表 / 可插拔能力清单 ──

type CompCard = { key: string; name: string; note: string; desc: string; icon: any }

const COMP_META: CompCard[] = [
  { key: 'modelAdapter', name: '模型适配器', note: 'ModelAdapter', desc: '模型调用入口，当前走 HTTP/OpenAI 兼容', icon: <Brain className="w-4 h-4 text-pi-accent" /> },
  { key: 'toolRegistry', name: '工具注册表', note: 'ToolRegistry', desc: '暴露给模型的可调用工具集', icon: <Wrench className="w-4 h-4 text-pi-accent" /> },
  { key: 'sessionStore', name: '会话存储', note: 'SessionStore', desc: '会话历史持久化方式', icon: <FolderClosed className="w-4 h-4 text-pi-accent" /> },
  { key: 'agentLoop', name: 'Agent 循环', note: 'AgentLoop', desc: '一次对话的执行编排', icon: <RefreshCw className="w-4 h-4 text-pi-accent" /> },
]

// 能力清单：pi-web 已具备、对标 dsh 插件化思路的"能力"
const CAPABILITIES = [
  { icon: <Gauge className="w-4 h-4 text-pi-accent" />, name: '流式对话+多端同步', desc: 'SSE 流式 / 多端实时订阅 / 断线恢复', have: true },
  { icon: <Plug className="w-4 h-4 text-pi-accent" />, name: '双引擎协作', desc: 'pi 主引擎(规划/验收) + dsh 执行臂(代码/工作流) 派单', have: true },
  { icon: <ShieldAlert className="w-4 h-4 text-pi-accent" />, name: '危险操作策略', desc: 'policies.json 声明式 deny 规则(隧道/密钥/git强推)', have: true },
  { icon: <Brain className="w-4 h-4 text-pi-accent" />, name: '跨会话记忆', desc: '固定记忆/日志/纠正/关系 自动加载 + 记忆园丁', have: true },
  { icon: <Info className="w-4 h-4 text-pi-accent" />, name: '上下文压缩', desc: '/compact 长对话→结构化摘要，支持 focus 定向', have: true },
  { icon: <Cpu className="w-4 h-4 text-pi-accent" />, name: '规划模式', desc: '/plan 只读调研→分步计划→批准执行', have: true },
  { icon: <Image className="w-4 h-4 text-pi-accent" />, name: '媒体生成', desc: '出图/配音/视频，产物自动入库资产库', have: true },
  { icon: <Mic className="w-4 h-4 text-pi-accent" />, name: '技能库', desc: '渐进式披露，activate_skill 加载全文执行', have: true },
  { icon: <Globe className="w-4 h-4 text-pi-accent" />, name: '多端访问', desc: '公网域名 / 局域网直连 / 安卓 APK 壳', have: true },
  { icon: <Tools className="w-4 h-4 text-pi-dim2" />, name: '用户确认(审批)', desc: '危险操作人工确认框 —— 规划中(借鉴 dsh user-approval)', have: false },
  { icon: <Cpu className="w-4 h-4 text-pi-dim2" />, name: '工具可插拔', desc: '运行时注册/替换工具 —— 规划中(对标 dsh Cordis IoC)', have: false },
]

function StatusBadge({ have }: { have: boolean }) {
  return (
    <span className={`px-1.5 py-0.5 rounded-pi-sm text-[10px] font-medium ${have ? 'bg-pi-green/15 text-pi-green' : 'bg-pi-dim2/15 text-pi-dim2'}`}>
      {have ? '已具备' : '规划中'}
    </span>
  )
}

function RunningChassis({ st }: { st: any }) {
  const comp = st.components || {}
  return (
    <div className="panel !p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[13px] font-medium text-pi-text">运行底盘</span>
        <span className="px-1.5 py-0.5 rounded-pi-sm bg-pi-dim2/12 text-pi-dim2 text-[10px]">当前实现</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {COMP_META.map(c => {
          const v = comp[c.key] || {}
          return (
            <div key={c.key} className="rounded-pi-md bg-pi-bg2/60 border border-pi-border-soft p-3.5 flex gap-3 items-start card-hover">
              <div className="w-8 h-8 rounded-pi-md bg-pi-accent/12 text-pi-accent flex items-center justify-center flex-shrink-0">{c.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-pi-text">{c.name}</span>
                  <span className="px-1.5 py-0.5 rounded-pi-sm bg-pi-dim2/12 text-pi-dim2 text-[10px]">可替换</span>
                </div>
                <div className="font-mono text-[11px] text-pi-accent mt-0.5 truncate">{v.name || '—'}</div>
                <div className="text-[11px] text-pi-dim2 mt-1 leading-relaxed">{c.desc}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ToolRegistry({ data }: { data: any }) {
  const tools: any[] = data?.tools || []
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return (
    <div className="panel !p-4">
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

function Capabilities() {
  return (
    <div className="panel !p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[13px] font-medium text-pi-text">可插拔能力清单</span>
        <span className="text-[11px] text-pi-dim2">对标 dsh 插件化思路 · pi-web 已具备 / 规划中</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {CAPABILITIES.map((c, i) => (
          <div key={i} className="rounded-pi-md bg-pi-bg2/50 border border-pi-border-soft p-3 flex gap-3 items-start card-hover">
            <div className={`w-8 h-8 rounded-pi-md flex items-center justify-center flex-shrink-0 ${c.have ? 'bg-pi-accent/12 text-pi-accent' : 'bg-pi-dim2/12 text-pi-dim2'}`}>{c.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 items-start">
                <span className="text-[12px] font-medium text-pi-text">{c.name}</span>
                <StatusBadge have={c.have} />
              </div>
              <div className="text-[11px] text-pi-dim2 mt-0.5 leading-relaxed">{c.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Plugins({ data, onReload }: { data: any; onReload: () => void }) {
  const [busy, setBusy] = useState('')
  const unreg = async (id: string) => {
    setBusy(id); try { await EngineApi.unregisterPlugin(id); onReload() } catch (e: any) { alert('卸载失败：' + (e?.message || e)) } finally { setBusy('') }
  }
  return (
    <div className="panel !p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-medium text-pi-text">已挂载插件</span>
        <span className="text-[11px] text-pi-dim2">{(data?.plugins || []).length} 个</span>
      </div>
      <div className="space-y-1.5">
        {(data?.plugins || []).map((p: any) => (
          <div key={p.id || p.name} className="flex items-center gap-2 py-1.5 border-b border-pi-border-soft last:border-none">
            <Plug className="w-3.5 h-3.5 text-pi-dim flex-shrink-0" />
            <span className="text-xs font-mono text-pi-text">{p.name}<span className="text-pi-dim2 ml-1.5">v{p.version || '?'}</span></span>
            {p.deps?.length ? <span className="text-[10px] text-pi-dim2 truncate">依赖：{p.deps.join(', ')}</span> : null}
            <span className={`ml-auto px-1.5 py-0.5 rounded-pi-sm text-[10px] ${p.mounted ? 'bg-pi-green/15 text-pi-green' : 'bg-pi-dim2/15 text-pi-dim2'}`}>{p.mounted ? '已挂载' : '未挂载'}</span>
            <button className="btn-tool text-[10px] !px-1.5 !py-0.5 hover:!text-pi-red flex-shrink-0" disabled={busy === p.id} onClick={() => unreg(p.id || p.name)}>
              <span className="text-pi-dim2 hover:text-pi-red">卸载</span>
            </button>
          </div>
        ))}
        {!(data?.plugins || []).length && <div className="text-[11px] text-pi-dim2">暂无插件</div>}
      </div>
    </div>
  )
}

export default function Engine() {
  const { data: status, mutate } = useSWR('engine-status', () => EngineApi.status(), { refreshInterval: 60000 })
  const { data: toolsData, mutate: mutateTools } = useSWR('engine-tools', () => EngineApi.tools(), { refreshInterval: 60000 })

  return (
    <div className="flex-1 overflow-y-auto relative z-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-6 overflow-x-hidden">
        {/* 头部 */}
        <div className="mb-6">
          <div className="page-eyebrow mb-1">Engine</div>
          <h1 className="page-title">引擎</h1>
          <p className="text-xs text-pi-dim2 mt-1.5">运行底盘 · 工具注册表 · 可插拔能力清单 · 插件挂载</p>
        </div>

        <div className="space-y-4 page-enter">
          <RunningChassis st={status || {}} />
          <ToolRegistry data={toolsData} />
          <Plugins data={status} onReload={() => mutate()} />
          <Capabilities />
        </div>
      </div>
    </div>
  )
}
