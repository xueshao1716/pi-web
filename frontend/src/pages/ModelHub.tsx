import { useState } from 'react'
import { Image, Film, Mic, MessagesSquare, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import useSWR from 'swr'
import { useApp } from '../store'
import { StatsApi, KeysApi } from '../api'
import type { ProviderStat } from '../api'
import type { Model } from '../types'

// ── ModelHub：模型全景页（Phase 3）──
// 模型清单（能力/免费标注/一键切换）+ Auto 路由说明 + 各 provider 用量统计

const fmtTokens = (n: number) => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n || 0)
const fmtCost = (n: number) => '$' + (n || 0).toFixed(2)

function capIcon(m: Model): LucideIcon {
  const cap = m.capabilities as any
  const keys: string[] = Array.isArray(cap) ? cap : Object.entries(cap || {}).filter(([, v]) => v).map(([k]) => k as string)
  if (keys.includes('image')) return Image
  if (keys.includes('video')) return Film
  if (keys.includes('tts') || keys.includes('asr')) return Mic
  return MessagesSquare
}

function ModelCard({ m, active, switching, onUse }: { m: Model; active: boolean; switching: boolean; onUse: () => void }) {
  const free = m.free || (m.note || '').includes('免费')
  const ctx = m.contextWindow ? (m.contextWindow >= 1000 ? Math.round(m.contextWindow / 1000) + 'K' : m.contextWindow) : ''
  return (
    <div className={`relative panel !p-3.5 flex flex-col gap-2 card-hover overflow-hidden ${active ? '!border-pi-accent/50 ring-1 ring-pi-accent/30' : ''}`}>
      {active && <div className="absolute inset-x-0 -top-8 h-20 pointer-events-none" style={{ background: 'radial-gradient(60% 100% at 80% 0%, var(--pi-glow), transparent 70%)' }} />}
      <div className="flex items-center gap-2 relative">
        {(() => { const CapIcon = capIcon(m); return <span className={`w-7 h-7 rounded-pi-md flex items-center justify-center flex-shrink-0 ${active ? 'bg-pi-accent/25 text-pi-accent' : 'bg-pi-bg3 text-pi-dim'}`}><CapIcon className="w-4 h-4" strokeWidth={1.8} /></span> })()}
        <span className="font-medium text-[13px] text-pi-text truncate flex-1">{m.name}</span>
        {free && <span className="text-[10px] px-1.5 py-0.5 rounded-pi-pill bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex-shrink-0">免费</span>}
      </div>
      <div className="text-[11px] text-pi-dim2 font-mono truncate relative">{m.provider}/{m.id}</div>
      <div className="flex items-center gap-2 text-[11px] text-pi-dim2 relative">
        {ctx && <span className="px-1.5 py-0.5 rounded-pi-pill bg-pi-bg3">上下文 {ctx}</span>}
        {m.reasoning && <span className="px-1.5 py-0.5 rounded-pi-pill bg-purple-500/12 text-purple-300">推理</span>}
        {(m.capabilities as any)?.vision === true && <span className="px-1.5 py-0.5 rounded-pi-pill bg-sky-500/12 text-sky-300">视觉</span>}
        {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-pi-green animate-pulse" title="使用中" />}
      </div>
      {m.note && <div className="text-[11px] text-pi-dim2 line-clamp-2 relative">{m.note}</div>}
      <button onClick={onUse} disabled={active}
        className={`mt-auto relative text-xs rounded-pi-md py-1.5 transition-all duration-150 ${active ? 'bg-pi-bg3 text-pi-dim2 cursor-default' : 'bg-pi-accent/15 text-pi-accent hover:bg-pi-accent hover:text-white hover:shadow-lg hover:shadow-pi-accent/25'}`}>
        {active ? '● 使用中' : switching ? '切换中…' : '切换使用'}
      </button>
    </div>
  )
}

export default function ModelHub() {
  const { models, currentModel, setCurrentModel, cwd } = useApp()
  const [filter, setFilter] = useState<'all' | 'chat' | 'media'>('all')
  const [query, setQuery] = useState('')
  const [facets, setFacets] = useState<{ free: boolean; reasoning: boolean; vision: boolean }>({ free: false, reasoning: false, vision: false })
  const [freeFirst, setFreeFirst] = useState(true)
  const [switching, setSwitching] = useState('')
  const { data: stats } = useSWR('provider-stats', () => StatsApi.providers(), { refreshInterval: 60000 })

  // 08-25 评审 P2：从库存清单变决策工具——搜索/能力筛选/免费优先
  const capKeys = (m: Model): string[] => {
    const cap = m.capabilities as any
    return Array.isArray(cap) ? cap : Object.entries(cap || {}).filter(([, v]) => v).map(([k]) => k as string)
  }
  const kw = query.trim().toLowerCase()
  const filtered = models.filter(m => {
    if (filter === 'all') {} else {
      const keys = capKeys(m)
      const isChat = !keys.some(k => ['image', 'video', 'tts', 'asr'].includes(k))
      if (filter === 'chat' ? !isChat : isChat) return false
    }
    if (kw && !(`${m.name} ${m.provider} ${m.id} ${m.note || ''}`.toLowerCase().includes(kw))) return false
    if (facets.free && !(m.free || (m.note || '').includes('免费'))) return false
    if (facets.reasoning && !m.reasoning) return false
    if (facets.vision && (m.capabilities as any)?.vision !== true) return false
    return true
  })
  if (freeFirst) {
    filtered.sort((a, b) => Number(!!(b.free || (b.note || '').includes('免费'))) - Number(!!(a.free || (a.note || '').includes('免费'))))
  }
  const freeCount = models.filter(m => m.free || (m.note || '').includes('免费')).length
  const totalCost = (stats?.providers || []).reduce((s, p) => s + (p.cost || 0), 0)
  const totalMsgs = (stats?.providers || []).reduce((s, p) => s + (p.messages || 0), 0)

  const useModel = async (m: Model) => {
    const mk = `${m.provider}/${m.id}`
    setSwitching(mk)
    try {
      await KeysApi.switchModel({ provider: m.provider, modelId: m.id })
      setCurrentModel(mk)
    } catch {} finally { setSwitching('') }
  }

  return (
    <div className="flex-1 overflow-y-auto relative z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        {/* 头部：eyebrow + 渐变标题 */}
        <div className="mb-5">
          <div className="page-eyebrow mb-1">Model Hub</div>
          <h1 className="page-title">模型中心</h1>
          <p className="text-xs text-pi-dim2 mt-1.5">{models.length} 个模型 · {freeCount} 免费 · 工作空间 {cwd ? cwd.split(/[\\/]/).pop() : '—'}</p>
        </div>

        {/* 统计卡 */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="stat-card"><div className="stat-num text-pi-text">{fmtCost(totalCost)}</div><div className="text-[11px] text-pi-dim2 mt-0.5">累计成本</div></div>
          <div className="stat-card"><div className="stat-num text-pi-text">{totalMsgs.toLocaleString()}</div><div className="text-[11px] text-pi-dim2 mt-0.5">累计消息</div></div>
          <div className="stat-card"><div className="stat-num text-pi-green">{freeCount}<span className="text-[13px] text-pi-dim2 font-medium"> / {models.length}</span></div><div className="text-[11px] text-pi-dim2 mt-0.5">免费通道</div></div>
        </div>

        {/* Auto 路由说明条 */}
        <div className="mb-4 rounded-pi-lg border border-pi-accent/20 bg-gradient-to-r from-pi-accent/10 to-transparent px-4 py-3 flex items-start gap-3 text-[12px] text-pi-dim">
          <Zap className="w-4 h-4 text-pi-accent mt-0.5 flex-shrink-0" />
          <div>
            <b className="text-pi-text">Auto 智能路由</b>（默认）：服务端按任务复杂度自动选模型——简单任务走免费 flash，复杂任务升级 pro 并设 token 上限；429/故障自动探测降级。下拉选具体模型则固定不路由。
          </div>
        </div>

        {/* 筛选：类型分段 + 搜索 + 能力 facet + 排序（08-25 评审 P2）*/}
        <div className="flex gap-1.5 mb-3 flex-wrap items-center">
          {([['all', '全部'], ['chat', '对话'], ['media', '媒体']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={`text-xs px-3 py-1.5 rounded-pi-md transition-colors ${filter === k ? 'bg-pi-accent/15 text-pi-accent font-medium' : 'text-pi-dim hover:text-pi-text hover:bg-pi-bg3'}`}>
              {label}
            </button>
          ))}
          <div className="mx-1 w-px h-5 bg-pi-border" />
          {([['free', `免费`], ['reasoning', '推理'], ['vision', '视觉']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFacets(f => ({ ...f, [k]: !f[k] }))} aria-pressed={facets[k]}
              className={`text-xs px-2.5 py-1.5 rounded-pi-pill border transition-colors ${facets[k] ? 'bg-pi-accent/15 border-pi-accent/40 text-pi-accent font-medium' : 'border-pi-border text-pi-dim hover:text-pi-text hover:border-pi-border-hi'}`}>
              {label}
            </button>
          ))}
          <button onClick={() => setFreeFirst(v => !v)} aria-pressed={freeFirst} title="免费模型排前"
            className={`ml-auto text-xs px-2.5 py-1.5 rounded-pi-pill border transition-colors ${freeFirst ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-400 font-medium' : 'border-pi-border text-pi-dim hover:text-pi-text hover:border-pi-border-hi'}`}>
            免费优先 ↓
          </button>
          {switching && <span className="text-[11px] text-pi-accent animate-pulse self-center">切换中…</span>}
        </div>
        <input className="input-pi mb-4 max-w-xs !py-1.5 text-xs" placeholder="搜索模型名 / 提供商 / 备注…"
          value={query} onChange={e => setQuery(e.target.value)} aria-label="搜索模型" />

        {/* 结果计数 */}
        {(kw || facets.free || facets.reasoning || facets.vision || filter !== 'all') && (
          <div className="text-[11px] text-pi-dim2 mb-3">筛出 {filtered.length} / {models.length} 个模型</div>
        )}

        {/* 模型网格 */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3 mb-8">
          {filtered.map(m => {
            const mk = `${m.provider}/${m.id}`
            return <ModelCard key={mk} m={m} active={currentModel === mk} switching={switching === mk} onUse={() => useModel(m)} />
          })}
        </div>
        {!filtered.length && (
          <div className="empty-state py-12 text-center mb-8">
            <div className="text-sm text-pi-dim">没有符合条件的模型</div>
            <div className="text-[11px] text-pi-dim2 mt-1">试试清空搜索词或取消能力筛选</div>
          </div>
        )}

        {/* Provider 用量（默认折叠，08-25 评审 P2）*/}
        <details className="panel !p-0 overflow-hidden mb-6">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-pi-text select-none flex items-center justify-between">
            Provider 用量
            <span className="text-[11px] text-pi-dim2 font-normal">每 60s 刷新 · 点击展开</span>
          </summary>
          <div className="overflow-x-auto border-t border-pi-border-soft">
            <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-pi-dim2 border-b border-pi-border-soft">
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">输入</th>
                <th className="px-4 py-2 font-medium">输出</th>
                <th className="px-4 py-2 font-medium">缓存命中</th>
                <th className="px-4 py-2 font-medium">消息</th>
                <th className="px-4 py-2 font-medium">成本</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.providers || []).map(p => (
                <tr key={p.provider} className="border-b border-pi-border-soft/50 hover:bg-pi-bg3/40 transition-colors">
                  <td className="px-4 py-2 font-medium text-pi-text">{p.provider}</td>
                  <td className="px-4 py-2 text-pi-dim">{fmtTokens(p.input)}</td>
                  <td className="px-4 py-2 text-pi-dim">{fmtTokens(p.output)}</td>
                  <td className="px-4 py-2 text-pi-dim">{fmtTokens(p.cacheRead || 0)}</td>
                  <td className="px-4 py-2 text-pi-dim">{p.messages}</td>
                  <td className="px-4 py-2 text-pi-dim">{fmtCost(p.cost)}</td>
                </tr>
              ))}
              {!stats?.providers?.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-pi-dim2">暂无用量数据</td></tr>}
            </tbody>
            </table>
          </div>
        </details>

        <p className="text-[11px] text-pi-dim2">密钥与通道管理在右上角「模型」面板 · 用量每 60s 自动刷新</p>
      </div>
    </div>
  )
}
