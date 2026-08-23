import { useState } from 'react'
import { TOOL_COLORS, COLOR_ERROR, COLOR_TOOL_FALLBACK } from '../theme/palettes'
import { Brain, FileText, Check, X, Pencil } from 'lucide-react'
import Markdown from './Markdown'
import { withFileToken } from '../api'
import type { ChatMessage, RunningTool } from '../types'

// 兼容两种来源：流式 RunningTool / 历史消息里的 ToolCall（无 running 态）
function ToolCard({ tool }: { tool: Partial<RunningTool> & { name: string } }) {
  const [open, setOpen] = useState(false)
  const running = !!(tool as any).running
  const isError = !!tool.isError
  const icon = tool.name === 'bash' ? '$' : tool.name === 'read' ? 'R' : tool.name === 'write' ? 'W' : tool.name === 'edit' ? 'E' : '⚙'
  const tc = isError ? COLOR_ERROR : (TOOL_COLORS[tool.name] || COLOR_TOOL_FALLBACK)
  let argsText = tool.argsText || ''
  try {
    const a = typeof tool.argsText === 'string' ? JSON.parse(tool.argsText) : tool.argsText
    if (a && typeof a === 'object') argsText = a.command || a.path || a.content?.slice?.(0, 80) || JSON.stringify(a).slice(0, 80)
  } catch { /* 保持原文本 */ }

  return (
    <div className={`my-2 rounded-pi-md border overflow-hidden text-[12.5px] tool-card ${tool.isError ? 'border-pi-red/40' : 'border-pi-border'}`}>
      <div className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-pi-bg3" style={{ borderLeft: `3px solid ${tc}` }} onClick={() => setOpen(!open)}>
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 font-mono" style={{ background: tc }}>{icon}</span>
        <span className="font-semibold text-pi-dim">{tool.name}</span>
        <span className="text-pi-dim2 truncate flex-1">{argsText}</span>
        {running
          ? <span className="text-pi-accent text-[10px] animate-pulse flex-shrink-0">运行中…</span>
          : <span className={`${isError ? 'text-pi-red' : 'text-emerald-400'} flex-shrink-0`}>
              {isError ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            </span>}
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
      <div className="inline-flex items-center gap-1.5 text-pi-dim text-[11px] cursor-pointer hover:text-pi-text transition-colors rounded-pi-pill px-2 py-0.5 -ml-2 bg-purple-500/8 border border-purple-500/15"
        onClick={() => setOpen(!open)}>
        <Brain className="w-3 h-3 text-purple-300" />
        <span>{live && !open ? '思考中…' : '思考过程'}</span>
        <span className="text-[9px]">{open ? '▾' : '▸'}</span>
      </div>
      {open && <div className="pl-4 border-l border-purple-500/25 my-1 text-pi-dim text-[12.5px] opacity-80"><Markdown text={text} /></div>}
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
        <div key={'file' + i} className="my-1.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-pi-md border border-pi-border bg-pi-bg3/70 text-[12.5px] max-w-full">
          <FileText className="w-3.5 h-3.5 text-pi-accent flex-shrink-0" />
          <span className="text-pi-text truncate">{f.name || f.path}</span>
        </div>
      ))}
    </>
  )
}

export default function Message({ msg, onEdit }: { msg: ChatMessage & { streaming?: boolean }; onEdit?: (text: string) => void } & { [k: string]: any }) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'
  const streaming = !!(msg as any).streaming
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const canEdit = isUser && !!onEdit && !streaming && msg.id !== '__streaming__' && !msg.id.startsWith('sys')

  // 系统提示条：独立窄条，不进气泡流
  if (isSystem) {
    return (
      <div className="flex justify-center py-1.5">
        <div className="text-[11.5px] text-sky-300/90 bg-sky-500/8 border border-sky-500/20 rounded-pi-pill px-3 py-1">ℹ️ {msg.text}</div>
      </div>
    )
  }

  if (isUser) {
    // 用户：右侧玻璃气泡 + 小头像
    return (
      <div className="group/msg flex justify-end gap-3 py-2">
        <div className="max-w-[82%] min-w-0 flex flex-col items-end">
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
              <Attachments msg={msg} />
              {(msg.text || !msg.files?.length) && (
                <div className="relative msg-bubble msg-bubble-user rounded-2xl rounded-br-md px-4 py-2.5 mt-0.5">
                  <span className="whitespace-pre-wrap text-[13.5px] text-pi-text leading-relaxed">{msg.text}</span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-0.5 px-1">
                {canEdit && (
                  <button className="hidden group-hover/msg:inline-flex items-center gap-1 text-[10px] text-pi-dim2 hover:text-pi-text transition-colors" title="编辑并重新发送"
                    onClick={() => { setDraft(msg.text); setEditing(true) }}><Pencil className="w-3 h-3" /> 编辑</button>
                )}
                {msg.ts && <span className="text-[10px] text-pi-dim2 opacity-0 group-hover/msg:opacity-100 transition-opacity">{new Date(msg.ts).toLocaleTimeString('zh-CN', { hour12: false })}</span>}
              </div>
            </>
          )}
        </div>
        <div className="w-7 h-7 rounded-lg bg-pi-bg3 border border-pi-border flex items-center justify-center text-pi-dim text-xs font-bold flex-shrink-0 mt-0.5">我</div>
      </div>
    )
  }

  // 助手：无气泡，内容全宽铺开（现代 AI 聊天惯例），左侧小标识
  return (
    <div className="group/msg flex gap-3 py-2.5">
      <div className="w-7 h-7 rounded-lg avatar-grad flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">语</div>
      <div className="min-w-0 flex-1">
        {msg.notes?.length ? (
          <div className="mb-2 space-y-1">
            {msg.notes.map((n, i) => (
              <div key={i} className="text-[11.5px] text-sky-300/90 bg-sky-500/8 border border-sky-500/20 rounded-pi-sm px-2.5 py-1 w-fit">ℹ️ {n}</div>
            ))}
          </div>
        ) : null}
        {!streaming && <Thinking text={msg.think} live={streaming} />}
        {streaming && msg.think && <Thinking text={msg.think} live />}
        <Attachments msg={msg} />
        <div className="markdown-body-wrapper">
          <Markdown text={msg.text} />
        </div>
        {msg.tools?.map((t, i) => <ToolCard key={t.id || i} tool={t} />)}
        {streaming && <span className="inline-block w-2 h-4 bg-pi-accent rounded-[1px] animate-pulse align-middle ml-0.5" />}
        {msg.ts && !streaming && (
          <div className="text-[10px] text-pi-dim2 mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">{new Date(msg.ts).toLocaleTimeString('zh-CN', { hour12: false })}</div>
        )}
      </div>
    </div>
  )
}
