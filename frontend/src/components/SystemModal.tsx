import { useEffect, useState } from 'react'
import { MonitorCog, Info, RefreshCw, Globe, X, CheckCircle2, AlertTriangle, Copy, ExternalLink } from 'lucide-react'
import { SystemApi } from '../api'

// ── 系统面板（08-26）：系统说明 / 检测更新 / 外网配置 ──

function Section({ icon: Icon, title, children }: any) {
  return (
    <div className="panel !p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-pi-accent" strokeWidth={1.8} />
        <h3 className="text-[13px] font-semibold text-pi-text">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function KV({ k, v, mono = true }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 py-1 border-b border-pi-border-soft last:border-none">
      <span className="text-[11px] text-pi-dim2 w-24 flex-shrink-0">{k}</span>
      <span className={`text-xs text-pi-text break-all ${mono ? 'font-mono' : ''}`}>{v || '—'}</span>
    </div>
  )
}

function fmtUptime(s: number) {
  if (s >= 86400) return `${Math.floor(s / 86400)} 天 ${Math.floor((s % 86400) / 3600)} 小时`
  if (s >= 3600) return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`
  if (s >= 60) return `${Math.floor(s / 60)} 分钟`
  return `${s} 秒`
}

export default function SystemModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<any>(null)
  const [update, setUpdate] = useState<any>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [netResult, setNetResult] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState('')

  const loadInfo = async () => {
    try { setInfo(await SystemApi.info()) } catch {}
  }

  // 打开时拉一次信息
  useState(() => {})
  useEffect(() => { if (visible && !info) loadInfo() }, [visible])
  if (!visible) return null

  const checkUpdate = async () => {
    setCheckingUpdate(true); setUpdate(null)
    try { setUpdate(await SystemApi.checkUpdate()) } catch (e: any) { setUpdate({ ok: false, error: e?.message || String(e) }) } finally { setCheckingUpdate(false) }
  }

  const testDomain = async (domain: string) => {
    setNetResult(p => ({ ...p, [domain]: '检测中…' }))
    const started = Date.now()
    try {
      await fetch(`https://${domain}/?_t=${Date.now()}`, { mode: 'no-cors', signal: AbortSignal.timeout(8000) })
      setNetResult(p => ({ ...p, [domain]: `✓ 通达（${Date.now() - started}ms）` }))
    } catch {
      setNetResult(p => ({ ...p, [domain]: '✗ 不通或超时' }))
    }
  }

  const copyLan = (ip: string) => {
    const url = `http://${ip}:8787`
    navigator.clipboard?.writeText(url).then(() => { setCopied(ip); setTimeout(() => setCopied(''), 1500) }).catch(() => {})
  }

  const up = info?.uptimeSec ? fmtUptime(info.uptimeSec) : ''

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[var(--pi-z-modal)]" onClick={onClose}>
      <div className="glass-hi panel-glass w-[560px] max-h-[82vh] flex flex-col rounded-pi-xl anim-enter" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-pi-border-soft flex-shrink-0">
          <div className="w-8 h-8 rounded-pi-md bg-pi-accent/12 text-pi-accent flex items-center justify-center flex-shrink-0">
            <MonitorCog className="w-[18px] h-[18px]" strokeWidth={1.8} />
          </div>
          <div>
            <div className="font-semibold text-pi-text leading-tight">系统</div>
            <div className="text-[11px] text-pi-dim2">版本信息 · 更新检测 · 外网配置</div>
          </div>
          <span className="ml-auto" />
          <button className="btn-tool touch-hit !p-2" aria-label="关闭" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* ── 系统说明 ── */}
          <Section icon={Info} title="系统说明">
            <KV k="产品" v={<span>pi-web 小语工作台 <span className="text-pi-dim2 text-[11px] ml-1">个人 AI 工作台：多会话对话 · 任务调度 · 资产库 · 灵感池</span></span>} mono={false} />
            <KV k="版本" v={info?.version ? `v${info.version}` : '—'} />
            <KV k="运行环境" v={info ? `Node ${info.node} · ${info.platform}` : ''} />
            <KV k="已运行" v={up} />
            <KV k="数据目录" v={info?.wsRoot} />
          </Section>

          {/* ── 检测更新 ── */}
          <Section icon={RefreshCw} title="检测更新">
            {!update ? (
              <div className="flex items-center gap-3">
                <button className="btn-primary text-xs px-3.5 py-1.5 inline-flex items-center gap-1.5" disabled={checkingUpdate} onClick={checkUpdate}>
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />{checkingUpdate ? '检测中…' : '检测更新'}
                </button>
                <span className="text-[11px] text-pi-dim2">对比本地与远端仓库最新提交</span>
              </div>
            ) : !update.ok ? (
              <div className="flex items-center gap-2 text-xs text-pi-warning">
                <AlertTriangle className="w-4 h-4" />{update.error}
                <button className="btn-tool text-[11px] !px-2 !py-1 ml-auto" onClick={checkUpdate}>重试</button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pi-md text-xs font-medium ${update.upToDate ? 'bg-pi-green/15 text-pi-green' : 'bg-pi-yellow/15 text-pi-yellow'}`}>
                  {update.upToDate
                    ? <><CheckCircle2 className="w-3.5 h-3.5" />已是最新版本（{update.source} · {update.localSha}）</>
                    : <><AlertTriangle className="w-3.5 h-3.5" />有可用更新：{update.localSha} → {update.remote?.sha}</>}
                </div>
                {!update.upToDate && update.remote?.message && (
                  <div className="text-[11px] text-pi-dim break-all">远端最新：{update.remote.message}{update.remote.date ? ` · ${update.remote.date.slice(0, 10)}` : ''}</div>
                )}
                {!update.upToDate && (
                  <div className="text-[11px] text-pi-dim2 bg-pi-bg2 rounded-pi-sm p-2 font-mono break-all">
                    git pull && cd frontend && pnpm install --frozen-lockfile && npm run build
                  </div>
                )}
                <div className="text-right">
                  <button className="btn-tool text-[11px] !px-2 !py-1" onClick={checkUpdate}>重新检测</button>
                </div>
              </div>
            )}
          </Section>

          {/* ── 外网配置 ── */}
          <Section icon={Globe} title="外网配置">
            <div className="space-y-2">
              {(info?.domains || []).map((d: any) => (
                <div key={d.domain} className="flex items-center gap-2 text-xs">
                  <a href={`https://${d.domain}`} target="_blank" rel="noreferrer"
                    className="font-mono text-pi-accent hover:underline inline-flex items-center gap-1">
                    https://{d.domain}<ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="text-[11px] text-pi-dim2">{d.desc}</span>
                  <span className="ml-auto text-[11px] font-mono">{netResult[d.domain] || ''}
                    {netResult[d.domain] !== '检测中…' && (
                      <button className="btn-tool text-[10px] !px-1.5 !py-0.5 ml-1" onClick={() => testDomain(d.domain)}>检测</button>
                    )}
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-pi-border-soft">
                <div className="text-[11px] text-pi-dim2 mb-1.5">局域网访问（同一 WiFi 下直接打开）：</div>
                <div className="space-y-1">
                  {(info?.lanIPs || []).map((ip: string) => (
                    <div key={ip} className="flex items-center gap-2 text-xs">
                      <code className="font-mono text-pi-text bg-pi-bg2 px-2 py-0.5 rounded-pi-sm">http://{ip}:8787</code>
                      <button className="btn-tool text-[10px] !px-1.5 !py-0.5 inline-flex items-center gap-1" onClick={() => copyLan(ip)}>
                        <Copy className="w-3 h-3" />{copied === ip ? '已复制' : '复制'}
                      </button>
                    </div>
                  ))}
                  {!(info?.lanIPs || []).length && <span className="text-[11px] text-pi-dim2">未检测到局域网地址</span>}
                </div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
