import { useState } from 'react'
import { MonitorCog, RefreshCw, CheckCircle2, AlertTriangle, Plus, Trash2, Save, Copy,
  MessagesSquare, Sparkles, Clock, Factory, Image, Brain, FlaskConical, Sprout, TerminalSquare, Globe,
  Cpu, Plug, Puzzle, Zap, X, ChevronRight } from 'lucide-react'
import useSWR from 'swr'
import { SystemApi, EngineApi } from '../api'

// ── 系统页（08-26，从弹窗改为独立页面）：能力清单 / 运行状态 / 检测更新 / 外网配置（可编辑）──

const CAP_ICONS: Record<string, any> = {
  chat: MessagesSquare, sparkles: Sparkles, clock: Clock, factory: Factory,
  image: Image, brain: Brain, flask: FlaskConical, sprout: Sprout, terminal: TerminalSquare, globe: Globe,
}
const CAP_FALLBACK = MonitorCog

type DomainRow = { domain: string; desc: string }
type Filter = never // 占位无

function KV({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex items-baseline gap-2 py-1 border-b border-pi-border-soft last:border-none">
      <span className="text-[11px] text-pi-dim2 w-20 flex-shrink-0">{k}</span>
      <span className="text-xs text-pi-text break-all font-mono">{v || '—'}</span>
    </div>
  )
}
function fmtUptime(s: number) {
  if (s >= 86400) return `${Math.floor(s / 86400)} 天 ${Math.floor((s % 86400) / 3600)} 小时`
  if (s >= 3600) return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`
  return `${Math.floor(s / 60)} 分钟`
}
function fmtTime(ts: string) {
  try { return new Date(ts).toLocaleString('zh-CN', { hour12: false }) } catch { return ts }
}

// ── 引擎面板（旧版引入：组件实现 / 插件注册表 / 动态注册）──
function EngineSection() {
  const { data, mutate } = useSWR('engine-status', () => EngineApi.status(), { refreshInterval: 60000 })
  const [reg, setReg] = useState<{ open: boolean; id: string; deps: string; mount: string; msg: string }>({ open: false, id: '', deps: '', mount: '', msg: '' })
  const [busy, setBusy] = useState('')
  const st: any = data || {}
  const comp = st.components || {}

  const compMeta = [
    { key: 'modelAdapter', name: '模型适配器', note: 'ModelAdapter' },
    { key: 'toolRegistry', name: '工具注册表', note: 'ToolRegistry' },
    { key: 'sessionStore', name: '会话存储', note: 'SessionStore' },
    { key: 'agentLoop', name: 'Agent 循环', note: 'AgentLoop' },
  ]
  const tools: string[] = comp.toolRegistry?.tools || []

  const unreg = async (id: string) => {
    setBusy(id); try { await EngineApi.unregisterPlugin(id); await mutate() } catch (e: any) { alert('卸载失败：' + (e?.message || e)) } finally { setBusy('') }
  }
  const doReg = async () => {
    if (!reg.id) { setReg(r => ({ ...r, msg: '插件需要 id' })); return }
    setBusy('reg')
    try {
      const def: any = { id: reg.id }
      if (reg.deps.trim()) def.deps = reg.deps.split(',').map(s => s.trim()).filter(Boolean)
      if (reg.mount.trim()) def.mount = reg.mount.trim()
      const r = await EngineApi.registerPlugin(def)
      setReg(r => ({ ...r, open: false, msg: '' }))
      await mutate()
      alert('已注册：' + (r?.id || reg.id))
    } catch (e: any) { setReg(r => ({ ...r, msg: '注册失败：' + (e?.message || e) })) } finally { setBusy('') }
  }

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-pi-text mb-3 flex items-center gap-1.5"><Cpu className="w-4 h-4 text-pi-accent" />引擎</h2>
      {/* 组件实现 */}
      <div className="panel !p-4 mb-3">
        <div className="text-[12px] text-pi-dim mb-2.5">组件实现 · 全部可替换</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {compMeta.map(c => {
            const v = comp[c.key] || {}
            return (
              <div key={c.key} className="rounded-pi-md bg-pi-bg2/60 border border-pi-border-soft p-2.5">
                <div className="text-[11px] text-pi-dim2">{c.name}</div>
                <div className="text-[13px] font-mono text-pi-text mt-0.5 truncate">{v.name || '—'}</div>
                <div className="text-[10px] text-pi-dim2 font-mono">{c.note}</div>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-[11px] text-pi-dim2">可用工具</span>
          {tools.length ? tools.map(t => <span key={t} className="px-1.5 py-0.5 rounded-pi-sm bg-pi-accent/12 text-pi-accent text-[10px] font-mono">{t}</span>) : <span className="text-[11px] text-pi-dim2">—</span>}
        </div>
      </div>
      {/* 插件列表 */}
      <div className="panel !p-4 mb-3">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-[12px] text-pi-dim">已注册插件 · {(st.plugins || []).length} 个</div>
          <button className="btn-tool text-[11px] !px-2 !py-1 inline-flex items-center gap-1" onClick={() => setReg(r => ({ ...r, open: !r.open, msg: '' }))}>
            <Plus className="w-3 h-3" />动态注册
          </button>
        </div>
        {reg.open && (
          <div className="rounded-pi-md bg-pi-bg2/50 border border-pi-border-soft p-3 mb-2 space-y-2">
            <input className="input-pi !py-1.5 text-xs font-mono" placeholder="id（如 my-plugin）" value={reg.id} onChange={e => setReg(r => ({ ...r, id: e.target.value }))} />
            <input className="input-pi !py-1.5 text-xs font-mono" placeholder="依赖（逗号分隔，可选）" value={reg.deps} onChange={e => setReg(r => ({ ...r, deps: e.target.value }))} />
            <textarea rows={2} className="input-pi !py-1.5 text-xs font-mono resize-none" placeholder={'mount 函数体（可选，如 return { hello: () => `world` }'} value={reg.mount} onChange={e => setReg(r => ({ ...r, mount: e.target.value }))} />
            {reg.msg && <div className="text-[11px] text-pi-warning">{reg.msg}</div>}
            <div className="flex gap-2">
              <button className="btn-primary text-[11px] px-2.5 py-1" disabled={busy === 'reg'} onClick={doReg}>{busy === 'reg' ? '注册中…' : '注册'}</button>
              <button className="btn-tool text-[11px]" onClick={() => setReg(r => ({ ...r, open: false }))}>取消</button>
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          {(st.plugins || []).map((p: any) => (
            <div key={p.id || p.name} className="flex items-center gap-2 py-1.5 border-b border-pi-border-soft last:border-none">
              <Plug className="w-3.5 h-3.5 text-pi-dim flex-shrink-0" />
              <span className="text-xs font-mono text-pi-text">{p.name}<span className="text-pi-dim2 ml-1.5">v{p.version || '?'}</span></span>
              {p.deps?.length ? <span className="text-[10px] text-pi-dim2 truncate">依赖：{p.deps.join(', ')}</span> : null}
              <span className={`ml-auto px-1.5 py-0.5 rounded-pi-sm text-[10px] ${p.mounted ? 'bg-pi-green/15 text-pi-green' : 'bg-pi-dim2/15 text-pi-dim2'}`}>
                {p.mounted ? '已挂载' : '未挂载'}
              </span>
              <button className="btn-tool text-[10px] !px-1.5 !py-0.5 hover:!text-pi-red flex-shrink-0" disabled={busy === p.id} onClick={() => unreg(p.id || p.name)}>
                <X className="w-3 h-3" />卸载
              </button>
            </div>
          ))}
          {!(st.plugins || []).length && <div className="text-[11px] text-pi-dim2">暂无插件</div>}
        </div>
      </div>
    </section>
  )
}

export default function System() {
  const { data, mutate } = useSWR('system-info', () => SystemApi.info(), { dedupingInterval: 30000 })
  const info: any = data || {}

  // 更新检测
  const [update, setUpdate] = useState<any>(null)
  const [checking, setChecking] = useState(false)
  const checkUpdate = async () => {
    setChecking(true); setUpdate(null)
    try { setUpdate(await SystemApi.checkUpdate()) } catch (e: any) { setUpdate({ ok: false, error: e?.message || String(e) }) } finally { setChecking(false) }
  }

  // 外网配置（本地编辑态；null=尚未改动，跟随服务端）
  const [rows, setRows] = useState<DomainRow[] | null>(null)
  const [copiedIp, setCopiedIp] = useState('')
  const [netMsg, setNetMsg] = useState('')
  const domains: DomainRow[] = rows ?? info.network?.domains ?? []
  const dirty = rows !== null

  const editRow = (i: number, key: keyof DomainRow, v: string) =>
    setRows(domains.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)))
  const addRow = () => setRows([...domains, { domain: '', desc: '' }])
  const delRow = (i: number) => setRows(domains.filter((_, idx) => idx !== i))
  const saveNet = async () => {
    setNetMsg('')
    try {
      const r = await SystemApi.saveNetwork({ domains })
      if ((r as any).error) { setNetMsg((r as any).error); return }
      setRows(null); setNetMsg('✓ 已保存'); mutate(); setTimeout(() => setNetMsg(''), 2500)
    } catch (e: any) { setNetMsg('保存失败：' + (e?.message || e)) }
  }

  const copyText = (t: string) => {
    navigator.clipboard?.writeText(t).then(() => { setCopiedIp(t); setTimeout(() => setCopiedIp(''), 1500) }).catch(() => {})
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto page-enter">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* 头部 */}
        <div className="mb-6">
          <div className="page-eyebrow mb-1">System</div>
          <h1 className="page-title">系统</h1>
          <p className="text-xs text-pi-dim2 mt-1.5">
            {info.name || 'pi-web 小语工作台'}{info.version ? ` · v${info.version}` : ''}
            {info.node ? ` · ${info.node}` : ''}
            {info.uptimeSec ? ` · 已运行 ${fmtUptime(info.uptimeSec)}` : ''}
            {dirty ? ' · 配置有未保存修改' : ''}
          </p>
        </div>

        {/* 系统能力清单 */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-pi-text mb-3 flex items-center gap-1.5"><MonitorCog className="w-4 h-4 text-pi-accent" />系统能力</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(info.capabilities || []).map(c => {
              const Icon = CAP_ICONS[c.icon] || CAP_FALLBACK
              return (
                <div key={c.name} className="panel !p-3.5 flex gap-3 items-start card-hover">
                  <div className="w-8 h-8 rounded-pi-md bg-pi-accent/12 text-pi-accent flex items-center justify-center flex-shrink-0">
                    <Icon className="w-[17px] h-[17px]" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-pi-text">{c.name}</div>
                    <div className="text-[11px] text-pi-dim2 mt-0.5 leading-relaxed">{c.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* 检测更新 */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-pi-text mb-3 flex items-center gap-1.5"><RefreshCw className="w-4 h-4 text-pi-accent" />检测更新</h2>
          <div className="panel !p-4">
            {!update ? (
              <button className="btn-primary text-xs px-3.5 py-1.5 inline-flex items-center gap-1.5" disabled={checking} onClick={checkUpdate}>
                <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />{checking ? '检测中…' : '对比远端仓库'}
              </button>
            ) : !update.ok ? (
              <div className="flex items-center gap-2 text-xs text-pi-warning">
                <AlertTriangle className="w-4 h-4" />{update.error}
                <button className="btn-tool text-[11px] !px-2 !py-1 ml-auto" onClick={checkUpdate}>重试</button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pi-md text-xs font-medium ${update.upToDate ? 'bg-pi-green/15 text-pi-green' : 'bg-pi-yellow/15 text-pi-yellow'}`}>
                  {update.upToDate
                    ? <><CheckCircle2 className="w-3.5 h-3.5" />已是最新（{update.source} · 本地 {update.localSha}）</>
                    : <><AlertTriangle className="w-3.5 h-3.5" />有更新：本地 {update.localSha} → 远端 {update.remote?.sha}</>}
                </div>
                {!update.upToDate && update.remote?.message && (
                  <>
                    <div className="text-[11px] text-pi-dim break-all">远端最新：{update.remote.message}</div>
                    <div className="text-[11px] text-pi-dim2 bg-pi-bg2 rounded-pi-sm p-2 font-mono break-all">
                      git pull && cd frontend && pnpm install --frozen-lockfile && npm run build
                    </div>
                  </>
                )}
                <div><button className="btn-tool text-[11px] !px-2 !py-1" onClick={checkUpdate}>重新检测</button></div>
              </div>
            )}
          </div>
        </section>

        {/* 引擎面板（旧版引入：组件实现 / 插件注册表 / 动态注册） */}
        <EngineSection />

        {/* 外网配置（可编辑） */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-pi-text mb-3 flex items-center gap-1.5"><Globe className="w-4 h-4 text-pi-accent" />外网配置</h2>
          <div className="panel !p-4">
            <p className="text-[11px] text-pi-dim2 mb-3">公网域名列表（隧道映射到本服务），增删改后保存即生效。</p>
            <div className="space-y-2">
              {domains.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="input-pi !py-1.5 text-xs font-mono flex-1 min-w-0" placeholder="example.com"
                    value={d.domain} onChange={e => editRow(i, 'domain', e.target.value)} />
                  <input className="input-pi !py-1.5 text-xs w-32 sm:w-44 flex-shrink-0" placeholder="说明（可选）"
                    value={d.desc} onChange={e => editRow(i, 'desc', e.target.value)} />
                  <button className="btn-tool touch-hit hover:!text-pi-red flex-shrink-0" title="删除此域名"
                    onClick={() => delRow(i)}><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1.5" onClick={addRow}>
                <Plus className="w-3.5 h-3.5" />添加域名
              </button>
              <button className="btn-primary text-xs px-3.5 py-1.5 ml-auto inline-flex items-center gap-1.5 disabled:opacity-40"
                disabled={!dirty} onClick={saveNet}>
                <Save className="w-3.5 h-3.5" />保存配置
              </button>
              {netMsg && <span className="text-[11px] text-pi-accent">{netMsg}</span>}
            </div>

            {/* 局域网直连 */}
            <div className="mt-4 pt-3 border-t border-pi-border-soft">
              <div className="text-[11px] text-pi-dim2 mb-2">局域网直连（同一 WiFi 下打开）：</div>
              <div className="space-y-1">
                {(info.network?.lanIPs || []).map((ip: string) => (
                  <div key={ip} className="flex items-center gap-2 text-xs">
                    <code className="font-mono text-pi-text bg-pi-bg2 px-2 py-0.5 rounded-pi-sm">http://{ip}:{info.port || 8787}</code>
                    <button className="btn-tool text-[10px] !px-1.5 !py-0.5 inline-flex items-center gap-1" onClick={() => copyText(`http://${ip}:${info.port || 8787}`)}>
                      <Copy className="w-3 h-3" />{copiedIp === `http://${ip}:8787` ? '已复制' : '复制'}
                    </button>
                  </div>
                ))}
                {!(info.network?.lanIPs || []).length && <span className="text-[11px] text-pi-dim2">未检测到局域网地址</span>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
