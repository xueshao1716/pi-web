import { useState } from 'react'
import useSWR from 'swr'
import { useApp } from '../store'
import { StatsApi, KeysApi } from '../api'
import type { ProviderStat } from '../api'
import type { Model } from '../types'

// ── ModelHub：模型全景页（Phase 3）──
// 模型清单（能力/免费标注/一键切换）+ Auto 路由说明 + 各 provider 用量统计

const fmtTokens = (n: number) => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n || 0)
const fmtCost = (n: number) => '$' + (n || 0).toFixed(2)

function capIcon(m: Model): string {
  const cap = m.capabilities as any
  const keys: string[] = Array.isArray(cap) ? cap : Object.entries(cap || {}).filter(([, v]) => v).map(([k]) => k as string)
  if (keys.includes('image')) return '🎨'
  if (keys.includes('video')) return '🎬'
  if (keys.includes('tts') || keys.includes('asr')) return '🎤'
  return '💬'
}

function ModelCard({ m, active, onUse }: { m: Model; active: boolean; onUse: () => void }) {
  const free = m.free || (m.note || '').includes('免费')
  const ctx = m.contextWindow ? (m.contextWindow >= 1000 ? Math.round(m.contextWindow / 1000) + 'K' : m.contextWindow) : ''
  return (
    <div className={`panel !p-3.5 flex flex-col gap-2 transition-all ${active ? '!border-pi-accent/50 ring-1 ring-pi-accent/30' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{capIcon(m)}</span>
        <span className="font-medium text-[13px] text-pi-text truncate flex-1">{m.name}</span>
        {free && <span className="text-[10px] px-1.5 py-0.5 rounded-pi-pill bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">免费</span>}
        {active && <span className="text-[10px] px-1.5 py-0.5 rounded-pi-pill bg-pi-accent/20 text-pi-accent border border-pi-accent/30">使用中</span>}
      </div>
      <div className="text-[10.5px] text-pi-dim2 font-mono truncate">{m.provider}/{m.id}</div>
      <div className="flex items-center gap-2 text-[10px] text-pi-dim2">
        {ctx && <span>上下文 {ctx}</span>}
        {m.reasoning && <span className="text-purple-400">推理</span>}
        {(m.capabilities as any)?.vision === true && <span className="text-sky-400">视觉</span>}
      </div>
      {m.note && <div className="text-[10.5px] text-pi-dim2 line-clamp-2">{m.note}</div>}
      <button onClick={onUse} disabled={active}
        className={`mt-auto text-xs rounded-pi-md py-1.5 transition-colors ${active ? 'bg-pi-bg3 text-pi-dim2 cursor-default' : 'bg-pi-accent/15 text-pi-accent hover:bg-pi-accent/25'}`}>
        {active ? '当前模型' : '切换使用'}
      </button>
    </div>
  )
}

export default function ModelHub() {
  const { models, currentModel, setCurrentModel, cwd } = useApp()
  const [filter, setFilter] = useState<'all' | 'chat' | 'media'>('all')
  const [switching, setSwitching] = useState('')
  // provider 用量统计（swr 缓存，60s 轮询）
  const { data: stats } = useSWR('provider-stats', () => StatsApi.providers(), { refreshInterval: 60000 })

  const filtered = models.filter(m => {
    if (filter === 'all') return true
    const cap = m.capabilities as any
    const keys: string[] = Array.isArray(cap) ? cap : Object.entries(cap || {}).filter(([, v]) => v).map(([k]) => k as string)
    const isChat = !keys.some(k => ['image', 'video', 'tts', 'asr'].includes(k))
    return filter === 'chat' ? isChat : !isChat
  })
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
      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* 头部概览 */}
        <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-pi-text">模型中心</h1>
            <p className="text-xs text-pi-dim2 mt-1">{models.length} 个模型 · {freeCount} 免费 · 工作空间 {cwd ? cwd.split(/[\\/]/).pop() : '—'}</p>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div><div className="text-lg font-bold text-pi-text">{fmtCost(totalCost)}</div><div className="text-[10px] text-pi-dim2">累计成本</div></div>
            <div><div className="text-lg font-bold text-pi-text">{totalMsgs.toLocaleString()}</div><div className="text-[10px] text-pi-dim2">累计消息</div></div>
          </div>
        </div>

        {/* Auto 路由说明条 */}
        <div className="panel !p-3 mb-4 flex items-start gap-2.5 text-[12px] text-pi-dim bg-gradient-to-r from-pi-accent/8 to-transparent">
          <span className="text-base leading-none mt-0.5">⚡</span>
          <div>
            <b className="text-pi-text">Auto 智能路由</b>（默认）：服务端按任务复杂度自动选模型——简单任务走免费 flash，复杂任务升级 pro 并设 token 上限；429/故障自动探测降级。下拉选具体模型则固定不路由。
          </div>
        </div>

        {/* 筛选 */}
        <div className="flex gap-1.5 mb-4">
          {([['all', '全部'], ['chat', '💬 对话'], ['media', '🎨 媒体']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`text-xs px-3 py-1.5 rounded-pi-md transition-colors ${filter === k ? 'bg-pi-accent/15 text-pi-accent font-medium' : 'text-pi-dim hover:text-pi-text hover:bg-pi-bg3'}`}>
              {label}
            </button>
          ))}
          {switching && <span className="ml-auto text-[11px] text-pi-accent animate-pulse self-center">切换中…</span>}
        </div>

        {/* 模型网格 */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3 mb-8">
          {filtered.map(m => {
            const mk = `${m.provider}/${m.id}`
            return <ModelCard key={mk} m={m} active={currentModel === mk} onUse={() => useModel(m)} />
          })}
        </div>

        {/* Provider 用量 */}
        <h2 className="text-sm font-semibold text-pi-text mb-2">Provider 用量</h2>
        <div className="panel !p-0 overflow-hidden mb-6">
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

        <p className="text-[11px] text-pi-dim2">密钥与通道管理在右上角「模型」面板 · 用量每 60s 自动刷新</p>
      </div>
    </div>
  )
}
