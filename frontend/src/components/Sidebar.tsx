import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { SessionsApi } from '../api'
import type { Session } from '../types'

const GROUP_LABEL: Record<string, string> = {
  workspace: '工作空间会话',
  terminal: '小语会话（终端）',
}
// 分组排序：终端会话置顶（外部可随时打开终端会话找小语，双向同步）
const GROUP_ORDER = ['terminal', 'workspace']

export default function Sidebar({ onNavigated }: { onNavigated?: () => void } = {}) {
  const { sessions, currentSessionId, selectSession, refreshSessions } = useApp()
  const [renaming, setRenaming] = useState<{ sid: string; name: string } | null>(null)
  const [confirming, setConfirming] = useState<Session | null>(null)
  const [search, setSearch] = useState('')

  const handleNew = async () => {
    try { const d = await SessionsApi.create(); await refreshSessions(); selectSession(d.id) }
    catch {}
  }
  const handleRename = async () => {
    if (renaming?.name.trim()) { try { await SessionsApi.rename(renaming.sid, renaming.name.trim()); await refreshSessions() } catch {} }
    setRenaming(null)
  }
  const handleDelete = async (s: Session) => {
    try { await SessionsApi.remove(s.id); await refreshSessions() } catch {}
    setConfirming(null)
  }

  const kw = search.trim().toLowerCase()
  const filtered = kw
    ? sessions.filter(s => (s.name || '').toLowerCase().includes(kw) || (s.preview || '').toLowerCase().includes(kw))
    : sessions
  const groups: Record<string, Session[]> = {}
  for (const s of filtered) { const g = s.group || 'workspace'; (groups[g] = groups[g] || []).push(s) }
  const groupKeys = Object.keys(groups).sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col col-sidebar glass-strong border-r border-pi-border min-h-0 relative z-10 glow-edge shimmer-hover">
      {/* 品牌头 */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-pi-border-soft flex-shrink-0">
        <div className="w-7 h-7 rounded-pi-md avatar-grad flex items-center justify-center text-white font-bold">语</div>
        <div className="font-semibold text-[15px]">小语</div>
        <div className="text-pi-dim2 text-xs">·工作台</div>
      </div>

      {/* 新建 */}
      <div className="p-3 pb-2 flex-shrink-0">
        <button className="btn-primary w-full py-2" onClick={handleNew}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新建会话
        </button>
        <input
          className="input-pi mt-2 !py-1.5 text-xs"
          placeholder="搜索会话…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {groupKeys.map(g => groups[g].length > 0 && (
          <div key={g} className="mb-3">
            <div className="px-2 py-1.5 text-[11px] text-pi-dim2 font-semibold uppercase tracking-wider">{GROUP_LABEL[g] || g}</div>
            {groups[g].map(s => (
              <div key={s.id}
                className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-pi-md cursor-pointer mb-0.5 transition-colors duration-fast ${
                  s.id === currentSessionId ? 'bg-pi-accent/12 border border-pi-accent/25' : 'hover:bg-pi-bg2'
                }`}
                onClick={() => { selectSession(s.id); onNavigated?.() }}>
                <div className={`w-6 h-6 rounded-pi-sm flex items-center justify-center text-xs font-bold flex-shrink-0 ${s.id === currentSessionId ? 'bg-pi-accent text-white' : 'bg-pi-bg3 text-pi-dim'}`}>
                  {s.name?.charAt(0) || '会'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] truncate text-pi-text">{s.name || '新会话'}</div>
                  <div className="text-[11px] text-pi-dim2 truncate">{s.preview || ''}</div>
                </div>
                {/* 08-25 评审 P1：hover 门控 → 触屏常显（hov-reveal）*/}
                <div className="hov-reveal flex gap-1 flex-shrink-0">
                  <button className="p-0.5 text-pi-dim2 hover:text-pi-text" onClick={(e) => { e.stopPropagation(); setRenaming({ sid: s.id, name: s.name }) }}>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                  </button>
                  <button className="p-0.5 text-pi-dim2 hover:text-pi-red" aria-label={`删除会话 ${s.name || '新会话'}`} onClick={(e) => { e.stopPropagation(); setConfirming(s) }}>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 删除确认弹窗（08-25：替换 window.confirm，与重命名弹窗同腔调）*/}
      {confirming && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={() => setConfirming(null)}>
          <div className="panel p-4 w-72" onClick={e => e.stopPropagation()} role="alertdialog" aria-label="确认删除会话">
            <div className="text-sm font-semibold mb-1.5">删除会话</div>
            <div className="text-xs text-pi-dim mb-3">「{confirming.name || '新会话'}」将被永久删除，不可恢复。</div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setConfirming(null)}>取消</button>
              <button className="btn bg-pi-red/90 text-white hover:bg-pi-red" onClick={() => handleDelete(confirming)}>删除</button>
            </div>
          </div>
        </div>
      )}

      {/* 重命名弹窗 */}
      {renaming && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={() => setRenaming(null)}>
          <div className="panel p-4 w-72" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-3">重命名会话</div>
            <input className="input-pi mb-3" autoFocus value={renaming.name} onChange={e => setRenaming({ ...renaming, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleRename()} />
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setRenaming(null)}>取消</button>
              <button className="btn-primary" onClick={handleRename}>确定</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
