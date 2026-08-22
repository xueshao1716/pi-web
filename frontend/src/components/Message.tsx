import { useState } from 'react'
import Markdown from './Markdown'
import { withFileToken } from '../api'
import type { ChatMessage, RunningTool } from '../types'

// 兼容两种来源：流式 RunningTool / 历史消息里的 ToolCall（无 running 态）
function ToolCard({ tool }: { tool: Partial<RunningTool> & { name: string } }) {
  const [open, setOpen] = useState(false)
  const running = !!(tool as any).running
  const isError = !!tool.isError
  const icon = tool.name === 'bash' ? '$' : tool.name === 'read' ? 'R' : tool.name === 'write' ? 'W' : tool.name === 'edit' ? 'E' : '⚙'
  const color: Record<string, string> = { bash: '#34d399', read: '#38bdf8', write: '#f59e0b', edit: '#f59e0b' }
  const tc = isError ? '#ef4444' : (color[tool.name] || '#c084fc')
  let argsText = tool.argsText || ''
  try {
    const a = typeof tool.argsText === 'string' ? JSON.parse(tool.argsText) : tool.argsText
    if (a && typeof a === 'object') argsText = a.command || a.path || a.content?.slice?.(0, 80) || JSON.stringify(a).slice(0, 80)
  } catch { /* 保持原文本 */ }

  return (
    <div className={`my-2 rounded-pi-md border overflow-hidden text-[12.5px] ${tool.isError ? 'border-pi-red/40' : 'border-pi-border'}`}>
      <div className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-pi-bg3" style={{ borderLeft: `3px solid ${tc}` }} onClick={() => setOpen(!open)}>
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: tc }}>{icon}</span>
        <span className="font-semibold text-pi-dim">{tool.name}</span>
        <span className="text-pi-dim2 truncate flex-1">{argsText}</span>
        {running
          ? <span className="text-pi-accent text-[10px] animate-pulse flex-shrink-0">运行中…</span>
          : <span className={isError ? 'text-pi-red text-[10px] flex-shrink-0' : 'text-emerald-400 text-[10px] flex-shrink-0'}>{isError ? '✗ 失败' : '✓ 完成'}</span>}
        <span className="text-pi-dim2 flex-shrink-0">{open ? '▾' : '▸'}</span>
      </div>
      {open && <div className="px-3 py-2 border-t border-pi-border-soft bg-pi-bg3"><div className="font-mono text-[12px] text-pi-dim whitespace-pre-wrap max-h-48 overflow-auto">{tool.output || (running ? '(运行中…)' : '(无输出)')}</div></div>}
    </div>
  )
}

function Thinking({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <div className="my-1">
      <div className="flex items-center gap-1 text-pi-dim text-[11px] cursor-pointer" onClick={() => setOpen(!open)}>
        <span className="text-purple-400">💭</span>
        <span>{live && !open ? '思考中…' : '思考过程'}</span>
        <span className="text-[9px]">{open ? '▾' : '▸'}</span>
      </div>
      {open && <div className="pl-4 border-l border-pi-border my-1 text-pi-dim text-[12.5px] opacity-80"><Markdown text={text} /></div>}
    </div>
  )
}

function Attachments({ msg }: { msg: ChatMessage }) {
  return (
    <>
      {msg.images?.map((src, i) => (
        <div key={'img' + i} className="my-1.5">
          <img src={withFileToken(src)} alt={`图片${i + 1}`} loading="lazy" className="max-w-[320px] max-h-[280px] rounded-pi-lg border border-pi-border-soft object-cover cursor-zoom-in" onClick={(e) => window.open((e.target as HTMLImageElement).src, '_blank')} />
        </div>
      ))}
      {msg.audios?.map((url, i) => (
        <div key={'aud' + i} className="my-1.5"><audio controls src={withFileToken(url)} className="max-w-full h-9" /></div>
      ))}
      {msg.files?.map((f, i) => (
        <div key={'file' + i} className="my-1.5 flex items-center gap-2 px-3 py-2 rounded-pi-md border border-pi-border bg-pi-bg3 text-[12.5px]">
          <span className="text-pi-accent">📄</span>
          <span className="text-pi-text truncate flex-1">{f.name || f.path}</span>
          <span className="text-pi-dim2 font-mono text-[10px] truncate max-w-[180px]">{f.path}</span>
        </div>
      ))}
    </>
  )
}

export default function Message({ msg, onEdit }: { msg: ChatMessage & { streaming?: boolean }; onEdit?: (text: string) => void } & { [k: string]: any }) {
  const isUser = msg.role === 'user'
  const streaming = !!(msg as any).streaming
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const canEdit = isUser && !!onEdit && !streaming && msg.id !== '__streaming__' && !msg.id.startsWith('sys')
  return (
    <div className={`group/msg flex gap-3 py-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-pi-md flex items-center justify-center text-white text-sm font-bold flex-shrink-0 avatar-grad ${isUser ? 'from-pi-accent to-pi-accent-deep' : ''}`}>{isUser ? '我' : '小'}</div>
      <div className={`max-w-[80%] min-w-0 ${isUser ? 'text-right' : ''}`}>
        <div className={`rounded-pi-lg px-4 py-2.5 msg-bubble ${isUser ? 'msg-bubble-user' : ''}`}>
          {/* 系统提示条（note 事件：路由决策/降级播报等） */}
          {msg.notes?.length ? (
            <div className="mb-2 space-y-1">
              {msg.notes.map((n, i) => (
                <div key={i} className="text-[11.5px] text-sky-300/90 bg-sky-500/10 border border-sky-500/20 rounded-pi-sm px-2.5 py-1">ℹ️ {n}</div>
              ))}
            </div>
          ) : null}
          {!isUser && msg.think && <Thinking text={msg.think} live={streaming} />}
          <Attachments msg={msg} />
          {editing ? (
            <div className="w-full min-w-[280px]">
              <textarea autoFocus rows={3} value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditing(false); if (draft.trim()) onEdit?.(draft.trim()) } if (e.key === 'Escape') setEditing(false) }}
                className="input-pi text-[13.5px] resize-none" />
              <div className="flex justify-end gap-2 mt-1.5">
                <button className="btn-tool text-xs" onClick={() => setEditing(false)}>取消</button>
                <button className="btn-primary text-xs px-3 py-1" onClick={() => { setEditing(false); if (draft.trim()) onEdit?.(draft.trim()) }}>重新发送</button>
              </div>
            </div>
          ) : (
            <>
              <div className={isUser ? 'text-[13.5px] text-pi-text' : ''}>
                {isUser ? <span className="whitespace-pre-wrap">{msg.text}</span> : <Markdown text={msg.text} />}
              </div>
              {/* 编辑重发：hover 显示 */}
              {canEdit && (
                <div className="hidden group-hover/msg:flex justify-end mt-1">
                  <button className="text-[10px] text-pi-dim2 hover:text-pi-text" title="编辑并重新发送"
                    onClick={() => { setDraft(msg.text); setEditing(true) }}>✎ 编辑</button>
                </div>
              )}
            </>
          )}
          {msg.tools?.map((t, i) => <ToolCard key={t.id || i} tool={t} />)}
          {streaming && <span className="animate-pulse text-pi-accent">▌</span>}
        </div>
        {msg.ts && <div className="text-[10px] text-pi-dim2 mt-1">{new Date(msg.ts).toLocaleTimeString('zh-CN', { hour12: false })}</div>}
      </div>
    </div>
  )
}
