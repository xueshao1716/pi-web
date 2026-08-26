import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Check, EyeOff, Scissors, AlertTriangle, RefreshCw, Sprout } from 'lucide-react'
import useSWR from 'swr'
import { MemoryApi } from '../api'
import EmptyState from '../components/EmptyState'

// ── 记忆园丁视图（08-26 重做）：明细可见 + 人工核对按钮 ──
// 原则不变：园丁只报告；「标记已核对」只记核对结论不动记忆文件；
// 「去重」是显式人工动作——先落 .bak 备份再重写日志（每组保留最新一条）。

type Kind = 'dup' | 'stale'

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="stat-card !p-3.5">
      <div className="text-[11px] text-pi-dim2">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${warn && value > 0 ? 'text-pi-warning' : ''}`}>{value}</div>
    </div>
  )
}

export default function GardenerView() {
  const { data, isLoading, mutate } = useSWR('memory-gardener-report', () => MemoryApi.report(), {
    dedupingInterval: 15000,
  })
  const [showReviewed, setShowReviewed] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  const rep = (data as any)?.report || {}
  const reviewed = new Set<string>((rep.reviewed || []).map((x: any) => `${x.kind}:${x.key}`))
  const dups = rep.duplicates || []
  const staleSections = rep.staleSections?.sections || []
  const dupEntries = dups.reduce((n: number, g: any) => n + g.count, 0)

  const isDismissed = (kind: Kind, key: string) => reviewed.has(`${kind}:${key}`)
  const visibleDups = showReviewed ? dups : dups.filter((g: any) => !isDismissed('dup', g.key))
  const visibleStale = showReviewed ? staleSections : staleSections.filter((s: any) => !isDismissed('stale', s.date))

  const mark = async (kind: Kind, key: string) => {
    try { await MemoryApi.markReviewed(kind, key); await mutate() } catch {}
  }
  const dedupe = async () => {
    if (!confirm(`一键去重：每组重复保留最新一条，其余删除。\n原日志会先备份为 .bak 文件，可手动恢复。\n\n确定执行？`)) return
    setBusy('dedupe'); setMsg('')
    try {
      const r = await MemoryApi.dedupe()
      setMsg(r.removed > 0 ? `已去除 ${r.removed} 条重复，原日志备份：${r.backup?.split(/[\\/]/).pop()}` : '没有需要去除的重复')
      await mutate()
    } catch (e: any) { setMsg('去重失败：' + (e?.message || e)) } finally { setBusy('') }
  }

  if (isLoading) return <div className="py-10 text-center text-pi-dim2 text-sm">扫描记忆中…</div>

  return (
    <div className="space-y-4">
      {/* 统计 */}
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="记忆日志条目" value={rep.totalEntries || 0} />
        <Stat label={`疑似重复（${dups.length} 组）`} value={dupEntries} warn />
        <Stat label="过时「状态」节" value={rep.staleSections?.staleCount || 0} warn />
      </div>

      {msg && <div className="panel !p-3 text-xs text-pi-accent flex items-center gap-2"><Check className="w-4 h-4 flex-shrink-0" />{msg}</div>}

      {/* 疑似重复组：展开看每条内容 */}
      <div>
        <div className="flex items-center mb-2">
          <h3 className="text-[13px] font-semibold text-pi-text">疑似重复 / 流水账</h3>
          <span className="ml-auto flex items-center gap-2">
            <button onClick={() => setShowReviewed(v => !v)}
              className="text-[11px] text-pi-dim2 hover:text-pi-text inline-flex items-center gap-1">
              <EyeOff className="w-3 h-3" />{showReviewed ? '隐藏已核对' : '显示已核对'}
            </button>
          </span>
        </div>
        {visibleDups.length === 0 ? (
          <EmptyState icon={Sprout} title={dups.length ? '本组筛选下无待核对的重复' : '没发现重复/流水账条目'} hint={dups.length ? undefined : '同要点反复出现时园丁会在这里提示'} />
        ) : (
          <div className="space-y-2">
            {visibleDups.map((g: any) => {
              const dismissed = isDismissed('dup', g.key)
              const open = expanded === g.key
              return (
                <div key={g.key} className={`panel !p-3 ${dismissed ? 'opacity-55' : ''}`}>
                  <button className="w-full flex items-center gap-2 cursor-pointer text-left" aria-expanded={open} onClick={() => setExpanded(open ? null : g.key)}>
                    {open ? <ChevronDown className="w-4 h-4 text-pi-dim2" /> : <ChevronRight className="w-4 h-4 text-pi-dim2" />}
                    <AlertTriangle className="w-4 h-4 text-pi-warning flex-shrink-0" strokeWidth={1.8} />
                    <span className="text-[12px] text-pi-text font-medium truncate">{g.key}</span>
                    <span className="text-[10px] px-1.5 py-px rounded-pi-pill bg-pi-warning/15 text-pi-warning flex-shrink-0">{g.count} 条</span>
                    <span className="ml-auto flex gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      {!dismissed && (
                        <button className="btn-tool text-[11px] !px-2 !py-1 inline-flex items-center gap-1" title="核对完毕，从待办中隐藏"
                          onClick={() => mark('dup', g.key)}><EyeOff className="w-3 h-3" />已核对</button>
                      )}
                      <button className="btn-tool text-[11px] !px-2 !py-1 inline-flex items-center gap-1 hover:!text-pi-red" title="删除该组较旧条目，保留最新一条"
                        onClick={() => dedupe()}><Scissors className="w-3 h-3" />去重</button>
                    </span>
                  </button>
                  {open && (
                    <div className="mt-2 space-y-1.5 border-t border-pi-border-soft pt-2">
                      {(g.previews || []).map((pv: string, i: number) => (
                        <div key={i} className="flex gap-2 text-[11px]">
                          <span className="font-mono text-pi-dim2 flex-shrink-0">{(g.dates || [])[i] || '?'}</span>
                          <span className="text-pi-dim break-all">{pv}</span>
                        </div>
                      ))}
                      <div className="text-[10px] text-pi-dim2 pt-1">点「去重」将删除此组中除最新外的 {g.count - 1} 条（先自动备份）</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 过时状态节明细 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[13px] font-semibold text-pi-text">过时的「当前状态」节</h3>
          {rep.staleSections?.latestDate && (
            <button className="text-[11px] text-pi-dim2 hover:text-pi-text inline-flex items-center gap-1" onClick={() => mutate()}>
              <RefreshCw className="w-3 h-3" />重新扫描
            </button>
          )}
        </div>
        {visibleStale.length === 0 ? (
          <p className="text-xs text-pi-dim2 px-1">当前状态节都在 {rep.staleSections?.latestDate ? `最新一版（${rep.staleSections.latestDate}）7 天内` : '新鲜状态'}，无需处理。</p>
        ) : (
          <div className="space-y-2">
            {visibleStale.map((s: any) => {
              const dismissed = isDismissed('stale', s.date)
              return (
                <div key={s.date} className={`panel !p-3 flex items-start gap-2.5 ${dismissed ? 'opacity-55' : ''}`}>
                  <AlertTriangle className="w-4 h-4 text-pi-warning flex-shrink-0 mt-0.5" strokeWidth={1.8} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-pi-text">当前状态（{s.date}）{s.title && <span className="text-pi-dim2 ml-1">{s.title}</span>}</div>
                    <div className="text-[11px] text-pi-dim2 mt-0.5 break-all">{s.preview || '（无正文预览）'}</div>
                  </div>
                  {!dismissed && (
                    <button className="btn-tool text-[11px] !px-2 !py-1 inline-flex items-center gap-1 flex-shrink-0" title="核对完毕，从待办中隐藏"
                      onClick={() => mark('stale', s.date)}><EyeOff className="w-3 h-3" />已核对</button>
                  )}
                </div>
              )
            })}
            <p className="text-[10px] text-pi-dim2 px-1">处理方式建议：把仍有效的信息合并进最新的「当前状态」节后，直接编辑 记忆.md 删除旧节。</p>
          </div>
        )}
      </div>

      {/* 建议 */}
      {(rep.recommendations?.length || 0) > 0 && (
        <div className="panel !p-3">
          <h3 className="text-[13px] font-semibold text-pi-text mb-2">园丁建议</h3>
          <ul className="space-y-1.5">
            {rep.recommendations.map((x: string, i: number) => <li key={i} className="text-[12px] text-pi-dim flex gap-2"><span className="text-pi-accent mt-0.5">•</span><span>{x}</span></li>)}
          </ul>
        </div>
      )}

      {busy === 'dedupe' && <div className="text-xs text-pi-accent animate-pulse">正在去重并写备份…</div>}
    </div>
  )
}