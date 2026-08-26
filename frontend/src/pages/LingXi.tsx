import { useState } from 'react'
import { Sparkles, User, Bot, Trash2, Archive, CheckCircle2 } from 'lucide-react'
import useSWR from 'swr'
import { LingXiApi } from '../api'
import type { LingXiEntry, LingXiSource } from '../api'
import EmptyState from '../components/EmptyState'

// ── 灵犀（08-26）：双向灵感池 ──
// 伙伴的灵感与小语的灵感分源记录，攒着有空一起过：
// 有用的「采纳」展开工作/辅助进化，没用的归档。状态流转 new → adopted | archived。

const STATUS_LABEL: Record<string, string> = { new: '待过', adopted: '已采纳', archived: '已归档' }
type Filter = 'all' | 'new' | 'adopted' | 'archived'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' }, { key: 'new', label: '待过' },
  { key: 'adopted', label: '已采纳' }, { key: 'archived', label: '已归档' },
]

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return ts }
}

function EntryCard({ e, onChanged }: { e: LingXiEntry; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); onChanged() } catch {} }
  return (
    <div className={`panel !p-3 rounded-pi-md ${e.status !== 'new' ? 'opacity-70' : ''}`}>
      <div className="text-[13px] text-pi-text leading-relaxed break-words whitespace-pre-wrap">{e.text}</div>
      {e.note && <div className="mt-1.5 text-[11px] text-pi-dim border-l-2 border-pi-border pl-2">{e.note}</div>}
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-pi-dim2">
        <span className="font-mono">{fmtTime(e.ts)}</span>
        {e.status === 'adopted' && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-pi-pill bg-pi-green/15 text-pi-green font-medium"><CheckCircle2 className="w-3 h-3" />已采纳</span>
        )}
        {e.status === 'archived' && <span className="px-1.5 py-px rounded-pi-pill bg-pi-bg3">已归档</span>}
        <span className="ml-auto flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
          {e.status === 'new' && (
            <button className="touch-hit p-1 hover:text-pi-green" title="采纳：以此展开工作或辅助进化"
              onClick={() => act(() => LingXiApi.setStatus(e.id, 'adopted'))}><CheckCircle2 className="w-3.5 h-3.5" /></button>
          )}
          {e.status !== 'archived' && (
            <button className="touch-hit p-1 hover:text-pi-dim" title="归档：暂时不用"
              onClick={() => act(() => LingXiApi.setStatus(e.id, 'archived'))}><Archive className="w-3.5 h-3.5" /></button>
          )}
          {confirming ? (
            <span className="flex items-center gap-1">
              <button className="text-pi-red hover:underline" onClick={() => act(() => LingXiApi.remove(e.id)).then(() => setConfirming(false))}>确认删</button>
              <button className="hover:text-pi-text" onClick={() => setConfirming(false)}>算了</button>
            </span>
          ) : (
            <button className="touch-hit p-1 hover:text-pi-red" title="删除" onClick={() => setConfirming(true)}><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </span>
      </div>
    </div>
  )
}

function SourceColumn({ source, icon: Icon, title, hint, entries, filter, onChanged }: {
  source: LingXiSource; icon: typeof User; title: string; hint: string
  entries: LingXiEntry[]; filter: Filter; onChanged: () => void
}) {
  const shown = filter === 'all' ? entries : entries.filter(e => e.status === filter)
  return (
    <section className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <Icon className="w-4 h-4 text-pi-accent" strokeWidth={1.8} />
        <h2 className="text-sm font-semibold text-pi-text">{title}</h2>
        <span className="font-mono text-[10px] text-pi-dim2 bg-pi-bg3 px-1.5 py-px rounded-pi-pill">{entries.length}</span>
        <span className="ml-auto text-[10px] text-pi-dim2 truncate hidden sm:block">{hint}</span>
      </div>
      <div className="space-y-2 overflow-y-auto pr-1">
        {shown.length === 0
          ? <EmptyState emoji="✨" title="这里还空着" hint="灵感来了随手记一条" />
          : shown.map(e => <EntryCard key={e.id} e={e} onChanged={onChanged} />)}
      </div>
    </section>
  )
}

export default function LingXi() {
  const [filter, setFilter] = useState<Filter>('all')
  const [draft, setDraft] = useState('')
  const [draftSource, setDraftSource] = useState<LingXiSource>('user')
  const { data, mutate } = useSWR('lingxi', () => LingXiApi.list(), { dedupingInterval: 4000 })
  const entries: LingXiEntry[] = data?.entries || []
  const refresh = () => mutate()

  const quickAdd = async () => {
    const t = draft.trim(); if (!t) return
    try {
      await LingXiApi.add({ text: t, source: draftSource })
      setDraft(''); refresh()
    } catch {}
  }

  const userEntries = entries.filter(e => e.source === 'user')
  const aiEntries = entries.filter(e => e.source === 'xiaoyu')

  return (
    <div className="flex-1 min-h-0 overflow-y-auto page-enter">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="page-eyebrow mb-1">Ling Xi</div>
        <h1 className="page-title mb-1">灵犀</h1>
        <p className="text-xs text-pi-dim2 mb-5">心有灵犀——灵感分源速记，攒着一起过。有用的采纳展开工作，没用的归档。</p>

        {/* 快速记 */}
        <div className="panel !p-3 mb-5">
          <textarea
            value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') quickAdd() }}
            placeholder="突然有灵感了？写下来，Ctrl+Enter 记入…"
            rows={2}
            className="input-pi w-full resize-none text-[13px]"
          />
          <div className="flex items-center gap-2 mt-2">
            {/* 分源切换：记到谁名下 */}
            <div className="flex rounded-pi-md overflow-hidden border border-pi-border">
              {([['user', '我的', User], ['xiaoyu', '小语的', Bot]] as const).map(([k, label, Icon]) => (
                <button key={k} onClick={() => setDraftSource(k)}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${draftSource === k ? 'bg-pi-accent text-white' : 'text-pi-dim hover:text-pi-text hover:bg-pi-bg3'}`}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>
            <button className="btn-primary px-4 py-1.5 text-xs ml-auto disabled:opacity-40" disabled={!draft.trim()} onClick={quickAdd}>
              <Sparkles className="w-3.5 h-3.5 mr-0.5 inline" />记下这条灵光
            </button>
          </div>
        </div>

        {/* 状态筛选 */}
        <div className="flex items-center gap-1 mb-4">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`text-xs px-3 py-1 rounded-pi-md transition-colors ${filter === f.key ? 'bg-pi-accent/15 text-pi-accent font-medium' : 'text-pi-dim hover:text-pi-text hover:bg-pi-bg3'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* 双栏分源 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SourceColumn source="user" icon={User} title="我的灵感" hint="伙伴口述速记"
            entries={userEntries} filter={filter} onChanged={refresh} />
          <SourceColumn source="xiaoyu" icon={Bot} title="小语的灵感" hint="工作中冒出的意外设计灵感"
            entries={aiEntries} filter={filter} onChanged={refresh} />
        </div>
      </div>
    </div>
  )
}
