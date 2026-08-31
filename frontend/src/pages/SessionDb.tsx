import { useEffect, useMemo, useState } from 'react'
import { Database, RefreshCw, Search, Trash2, Pin, CheckSquare, Square } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { toast } from '../components/Toast'

// ── 会话数据库（08-29 真落地）：编号/健康度/大小/批量清理 ──
// 后端 /api/sessions/db/*；健康 ok<1MB / large 1-5MB / oversized>5MB

type Row = {
  id: string; name: string; cwd: string; sizeBytes: number
  health: 'ok' | 'large' | 'oversized'; messageCount: number | null
  mtime: string | null; seq: number | null; pinned: boolean; tags: string[]
}
type Stats = { total: number; totalMB: number; health: Record<string, number>; lastRebuild: string | null }

const api = (p: string, opts?: any) => fetch(`/api/sessions/db${p}`, { headers: { Authorization: `Bearer ${localStorage.getItem('pi_web_token') || ''}`, 'Content-Type': 'application/json' }, ...opts }).then(r => r.json())

const HEALTH: Record<string, { label: string; cls: string }> = {
  ok: { label: '正常', cls: 'bg-pi-success/15 text-pi-success' },
  large: { label: '偏大', cls: 'bg-pi-warning/15 text-pi-warning' },
  oversized: { label: '超限', cls: 'bg-pi-danger/15 text-pi-danger' },
}

function fmtSize(b: number) { return !b ? '—' : b < 1048576 ? `${(b / 1024).toFixed(0)}KB` : `${(b / 1048576).toFixed(1)}MB` }
function fmtTime(t: string | null) {
  if (!t) return '—'
  try { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` } catch { return '—' }
}

export default function SessionDb() {
  const [rows, setRows] = useState<Row[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const d = await api('/list').catch(() => null)
    if (d?.sessions) setRows(d.sessions)
    setStats(await api('/stats').catch(() => null))
  }
  useEffect(() => { load() }, [])

  const rebuild = async () => {
    setBusy(true)
    const d = await api('/rebuild', { method: 'POST' }).catch(() => null)
    setBusy(false)
    if (d?.ok) { toast(`索引完成：${d.total} 条，新增编号 ${d.added}`, 'ok'); await load() }
    else toast('重建失败', 'error')
  }

  const batchSanitize = async () => {
    if (!sel.size) return
    setBusy(true)
    const d = await api('/sanitize', { method: 'POST', body: JSON.stringify({ ids: [...sel] }) }).catch(() => null)
    setBusy(false)
    if (d?.ok) {
      const saved = d.results.reduce((a: number, r: any) => a + (r.bytesSaved || 0), 0)
      const patched = d.results.reduce((a: number, r: any) => a + (r.linesPatched || 0), 0)
      toast(`清理完成：${patched} 条消息截断，省 ${(saved / 1048576).toFixed(1)}MB`, 'ok')
      setSel(new Set()); await load()
    } else toast('清理失败', 'error')
  }

  const togglePin = async (r: Row) => {
    const d = await api('/meta', { method: 'PATCH', body: JSON.stringify({ id: r.id, pinned: !r.pinned }) }).catch(() => null)
    if (d?.ok) setRows(rows.map(x => x.id === r.id ? { ...x, pinned: d.pinned, seq: d.seq } : x))
  }

  const visible = useMemo(() => rows
    .filter(r => (!filter || r.health === filter) && (!q || r.name.toLowerCase().includes(q.toLowerCase()) || String(r.seq || '').includes(q)))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.seq || 0) - (a.seq || 0)),
    [rows, q, filter])

  const hcls = (h: string) => HEALTH[h]?.cls || HEALTH.ok.cls

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <PageHeader
          title="会话数据库"
          description="按稳定编号查看会话体量与健康状态，并对选中会话执行安全清理。"
          meta={stats ? (
            <div className="text-[11px] text-pi-dim2">
              共 <b className="text-pi-text">{stats.total}</b> 条 · 占用 <b className="text-pi-text">{stats.totalMB}MB</b> · 正常 {stats.health.ok} / 偏大 {stats.health.large} / 超限 {stats.health.oversized}
            </div>
          ) : <span className="text-[11px] text-pi-dim2">加载中…</span>}
        />

        {/* 工具条 */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-pi-dim2" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜名称或编号…" aria-label="搜索会话名称或编号"
              className="w-full input-pi !py-1.5 !pl-8 text-[13px]" />
          </div>
          <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="筛选会话健康状态" className="input-pi !py-1.5 text-[13px] w-24">
            <option value="">全部</option>
            <option value="ok">正常</option>
            <option value="large">偏大</option>
            <option value="oversized">超限</option>
          </select>
          <button onClick={rebuild} disabled={busy} className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />重建索引
          </button>
          {sel.size > 0 && (
            <button onClick={batchSanitize} disabled={busy} className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" />清理所选（{sel.size}）
            </button>
          )}
        </div>

        {!visible.length ? (
          <EmptyState icon={Database} title="没有匹配的会话" hint="调整搜索或健康筛选，也可以重建索引后再试。" />
        ) : (
          <>
            {/* 桌面表格 */}
            <div data-slot="session-db-table" className="hidden md:block panel !p-0 overflow-x-auto rounded-pi-lg border border-pi-border">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-pi-dim2 border-b border-pi-border">
                    <th className="p-2.5 w-8">
                      <button onClick={() => setSel(sel.size ? new Set() : new Set(visible.map(r => r.id)))} title="全选" aria-label="选择全部可见会话">
                        {sel.size && sel.size === visible.length ? <CheckSquare className="w-4 h-4 text-pi-accent" /> : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="p-2.5 w-14">#</th>
                    <th className="p-2.5">名称</th>
                    <th className="p-2.5 w-16">健康</th>
                    <th className="p-2.5 w-20 text-right">大小</th>
                    <th className="p-2.5 w-16 text-right">消息</th>
                    <th className="p-2.5 w-24">更新</th>
                    <th className="p-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(r => (
                    <tr key={r.id} className={`border-b border-pi-border-soft hover:bg-pi-bg-hover ${sel.has(r.id) ? 'bg-pi-accent-soft' : ''} ${r.health === 'oversized' ? 'opacity-90' : ''}`}>
                      <td className="p-2.5">
                        <button aria-label={`选择会话 ${r.name}`} onClick={() => { const n = new Set(sel); n.has(r.id) ? n.delete(r.id) : n.add(r.id); setSel(n) }}>
                          {sel.has(r.id) ? <CheckSquare className="w-4 h-4 text-pi-accent" /> : <Square className="w-4 h-4 text-pi-dim2" />}
                        </button>
                      </td>
                      <td className="p-2.5 font-mono text-pi-dim">#{r.seq ?? '—'}</td>
                      <td className="p-2.5 text-pi-text truncate max-w-[260px]" title={r.name}>
                        <span className="inline-flex items-center gap-1.5">{r.pinned && <Pin className="w-3.5 h-3.5 text-pi-warning fill-pi-warning" aria-label="已置顶" />}{r.name}</span>
                      </td>
                      <td className="p-2.5"><span className={`px-1.5 py-0.5 rounded-pi-sm text-[10px] font-medium ${hcls(r.health)}`}>{HEALTH[r.health]?.label}</span></td>
                      <td className="p-2.5 text-right font-mono text-pi-dim text-[11px]">{fmtSize(r.sizeBytes)}</td>
                      <td className="p-2.5 text-right font-mono text-pi-dim text-[11px]">{r.messageCount ?? '—'}</td>
                      <td className="p-2.5 text-pi-dim2 font-mono text-[11px]">{fmtTime(r.mtime)}</td>
                      <td className="p-2.5">
                        <button onClick={() => togglePin(r)} className={`p-1 rounded-pi-sm hover:bg-pi-bg3 ${r.pinned ? 'text-pi-warning' : 'text-pi-dim2'}`} title={r.pinned ? '取消置顶' : '置顶'} aria-label={`${r.pinned ? '取消置顶' : '置顶'} ${r.name}`}>
                          <Pin className={`w-3.5 h-3.5 ${r.pinned ? 'fill-pi-warning' : ''}`} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 移动卡片 */}
            <div data-slot="session-db-cards" className="md:hidden space-y-2.5">
              {visible.map(r => (
                <article key={r.id} className={`panel !p-3.5 ${sel.has(r.id) ? 'border-pi-accent/50 bg-pi-accent-soft' : ''}`}>
                  <div className="flex items-start gap-3">
                    <button className="min-h-11 min-w-11 -ml-2 -mt-2 inline-flex items-center justify-center flex-shrink-0 rounded-pi-md hover:bg-pi-bg3" aria-label={`选择会话 ${r.name}`} onClick={() => { const n = new Set(sel); n.has(r.id) ? n.delete(r.id) : n.add(r.id); setSel(n) }}>
                      {sel.has(r.id) ? <CheckSquare className="w-5 h-5 text-pi-accent" /> : <Square className="w-5 h-5 text-pi-dim2" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[11px] text-pi-dim2 font-mono">
                            {r.pinned && <Pin className="w-3 h-3 text-pi-warning fill-pi-warning" aria-label="已置顶" />}
                            <span>编号 #{r.seq ?? '—'}</span>
                          </div>
                          <h2 className="mt-1 text-[13px] font-medium text-pi-text break-words">{r.name}</h2>
                        </div>
                        <button onClick={() => togglePin(r)} className={`min-h-11 min-w-11 -mr-2 -mt-2 inline-flex items-center justify-center rounded-pi-md hover:bg-pi-bg3 ${r.pinned ? 'text-pi-warning' : 'text-pi-dim2'}`} aria-label={`${r.pinned ? '取消置顶' : '置顶'} ${r.name}`} title={r.pinned ? '取消置顶' : '置顶'}>
                          <Pin className={`w-4 h-4 ${r.pinned ? 'fill-pi-warning' : ''}`} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-[11px]">
                        <div><span className="text-pi-dim2">健康</span><div className="mt-0.5"><span className={`px-1.5 py-0.5 rounded-pi-sm text-[10px] font-medium ${hcls(r.health)}`}>{HEALTH[r.health]?.label}</span></div></div>
                        <div><span className="text-pi-dim2">大小</span><div className="mt-0.5 font-mono text-pi-dim">{fmtSize(r.sizeBytes)}</div></div>
                        <div><span className="text-pi-dim2">消息</span><div className="mt-0.5 font-mono text-pi-dim">{r.messageCount ?? '—'}</div></div>
                        <div><span className="text-pi-dim2">更新</span><div className="mt-0.5 font-mono text-pi-dim">{fmtTime(r.mtime)}</div></div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        <p className="text-[11px] text-pi-dim2 mt-3">清理 = 截断超大推理签名/工具结果（防上游 400/502），不改会话内容。删除请回对话页操作。</p>
      </div>
    </div>
  )
}
