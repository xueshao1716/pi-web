import { useState } from 'react'
import { TOOL_COLORS, COLOR_ERROR, COLOR_TOOL_FALLBACK } from '../theme/palettes'
import { Brain, FileText, Check, X, Pencil, ChevronRight, Square, Info } from 'lucide-react'
import Markdown from './Markdown'
import { withFileToken } from '../api'
import type { ChatMessage, RunningTool, ToolStatus } from '../types'

// 兼容两种来源：流式 RunningTool / 历史消息里的 ToolCall（无 running 态）
function ToolCard({ tool }: { tool: Partial<RunningTool> & { name: string } }) {
  const [open, setOpen] = useState(false)
  const status: ToolStatus = (tool as any).status || (tool.running ? 'running' : tool.isError ? 'error' : 'completed')
  const running = status === 'running'
  const isError = status === 'error'
  const icon = tool.name === 'bash' ? '$' : tool.name === 'read' ? 'R' : tool.name === 'write' ? 'W' : tool.name === 'edit' ? 'E' : '⚙'
  const tc = isError ? COLOR_ERROR : (TOOL_COLORS[tool.name] || COLOR_TOOL_FALLBACK)
  let argsText = tool.argsText || ''
  try {
    const a = typeof tool.argsText === 'string' ? JSON.parse(tool.argsText) : tool.argsText
    if (a && typeof a === 'object') argsText = a.command || a.path || a.content?.slice?.(0, 80) || JSON.stringify(a).slice(0, 80)
  } catch { /* 保持原文本 */ }

  return (
    <div className={`my-2.5 rounded-xl border overflow-hidden text-[13px] bg-pi-bg1/60 transition-[background-color,border-color,box-shadow] duration-200 ${isError ? 'border-pi-danger/40' : 'border-pi-border-soft/60 hover:border-pi-border hover:shadow-md hover:shadow-black/10'}`}>
      <div
        className="press w-full flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-pi-bg-hover/60 active:bg-pi-bg-active/50 transition-colors text-left"
        style={{ boxShadow: `inset 3px 0 0 ${tc}` }}
        onClick={() => setOpen(!open)}
      >
        <span className="w-5 h-5 rounded-pi-sm flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0 font-mono" style={{ background: `linear-gradient(135deg, ${tc}, ${tc}b3)`, boxShadow: `0 0 10px ${tc}40` }}>{icon}</span>
        <span className="font-mono font-semibold text-[11px] px-1.5 py-0.5 rounded-pi-sm flex-shrink-0" style={{ color: tc, background: `${tc}14` }}>{tool.name}</span>
        <span className="text-pi-dim truncate flex-1 font-mono text-[12px]">{argsText}</span>
        {status === 'running' ? (
          <span className="flex items-center gap-1.5 text-pi-accent text-[11px] flex-shrink-0">
            <span className="w-3 h-3 rounded-full border-[1.5px] border-pi-accent/25 border-t-pi-accent animate-spin" />
            运行中
          </span>
        ) : status === 'canceled' ? (
          <span className="flex items-center gap-1.5 text-pi-dim2 text-[11px] flex-shrink-0">
            <Square className="w-3 h-3" /> 已停止
          </span>
        ) : (
          <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${isError ? 'bg-pi-danger/15 text-pi-danger' : 'bg-pi-success/15 text-pi-success'}`}>
            {isError ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
          </span>
        )}
        <ChevronRight className={`w-3 h-3 text-pi-dim2 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </div>
      {running && <div className="h-[2px] w-full overflow-hidden"><div className="tool-progress" /></div>}
      {open && (
        <div className="border-t border-pi-border-soft bg-black/20">
          <div className="font-mono text-[12px] text-pi-dim whitespace-pre-wrap max-h-56 overflow-auto px-3 py-2 leading-relaxed">
            {tool.output || (status === 'running' ? '(运行中…)' : status === 'canceled' ? '(已停止)' : '(无输出)')}
          </div>
        </div>
      )}
    </div>
  )
}

function Thinking({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <div className="my-2">
      <div className="inline-flex items-center gap-1.5 text-pi-accent text-[11px] font-medium cursor-pointer transition-colors rounded-full px-2.5 py-1 -ml-1 bg-pi-accent/12 border border-pi-accent/25 hover:bg-pi-accent/20"
        onClick={() => setOpen(!open)}>
        <Brain className="w-3 h-3 text-pi-accent" />
        {live && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pi-accent opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-pi-accent" />
          </span>
        )}
        <span>{live && !open ? '思考中…' : '思考过程'}</span>
        <ChevronRight className={`w-2.5 h-2.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </div>
      {open && <div className="pl-4 border-l border-pi-accent/25 my-1 text-pi-dim text-[13px] opacity-80"><Markdown text={text} /></div>}
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
        <div key={'file' + i} className="my-1.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-pi-md border border-pi-border bg-pi-bg3/70 text-[13px] max-w-full">
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
        <div className="text-[12px] text-pi-info bg-pi-info/8 border border-pi-info/20 rounded-pi-pill px-3 py-1 inline-flex items-center gap-1.5"><Info className="w-3.5 h-3.5" aria-hidden="true" />{msg.text}</div>
      </div>
    )
  }

  if (isUser) {
    // 用户：右侧玻璃气泡 + 小头像
    return (
      <div className="group/msg flex justify-end gap-2.5 py-3">
        <div className="max-w-[82%] min-w-0 flex flex-col items-end">
          {editing ? (
            <div className="w-full min-w-[280px]">
              <textarea autoFocus rows={3} value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditing(false); if (draft.trim()) onEdit?.(draft.trim()) } if (e.key === 'Escape') setEditing(false) }}
                className="input-pi text-[13px] resize-none" />
              <div className="flex justify-end gap-2 mt-1.5">
                <button className="btn-tool text-xs" onClick={() => setEditing(false)}>取消</button>
                <button className="btn-primary text-xs px-3 py-1" onClick={() => { setEditing(false); if (draft.trim()) onEdit?.(draft.trim()) }}>重新发送</button>
              </div>
            </div>
          ) : (
            <>
              <Attachments msg={msg} />
              {(msg.text || !msg.files?.length) && (
                <div className="relative msg-bubble msg-bubble-user rounded-[20px] rounded-br-lg px-4 py-2.5 mt-0.5">
                  <span className="whitespace-pre-wrap text-[13px] text-pi-text leading-relaxed">{msg.text}</span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-0.5 px-1">
                {canEdit && (
                  <button className="hov-reveal inline-flex items-center gap-1 text-[11px] text-pi-dim2 hover:text-pi-text transition-colors" title="编辑并重新发送" aria-label="编辑并重新发送"
                    onClick={() => { setDraft(msg.text); setEditing(true) }}><Pencil className="w-3 h-3" /> 编辑</button>
                )}
                {msg.ts && <span className="hov-reveal text-[11px] text-pi-dim2 transition-opacity">{new Date(msg.ts).toLocaleTimeString('zh-CN', { hour12: false })}</span>}
              </div>
            </>
          )}
        </div>
        <div className="w-6 h-6 rounded-lg bg-pi-accent text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">我</div>
      </div>
    )
  }

  // 助手：无气泡，内容全宽铺开（现代 AI 聊天惯例），左侧小标识 + accent 渐变竖条
  return (
    <div className="group/msg flex gap-2.5 py-3 msg-assistant anim-enter">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pi-accent to-pi-accent2 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 mt-0.5"
        style={{ boxShadow: '0 2px 8px color-mix(in oklab, var(--pi-accent) 20%, transparent)' }}>语</div>
      <div className="min-w-0 flex-1">
        {msg.notes?.length ? (
          <div className="mb-2 space-y-1">
            {msg.notes.map((n, i) => (
              <div key={i} className="text-[12px] text-pi-info bg-pi-info/8 border border-pi-info/20 rounded-pi-sm px-2.5 py-1 w-fit inline-flex items-center gap-1.5"><Info className="w-3.5 h-3.5" aria-hidden="true" />{n}</div>
            ))}
          </div>
        ) : null}
        {!streaming && <Thinking text={msg.think} live={streaming} />}
        {streaming && msg.think && <Thinking text={msg.think} live={!msg.text} />}
        <Attachments msg={msg} />
        {msg.tools?.length ? (
          <div className="mb-2">{msg.tools.map((t, i) => <ToolCard key={t.id || i} tool={t} />)}</div>
        ) : null}
        <div className={"markdown-body-wrapper" + (streaming ? " streaming-caret" : "")}>
          <Markdown text={msg.text} />
        </div>
        {msg.ts && !streaming && (
          <div className="hov-reveal text-[11px] text-pi-dim2 mt-1 transition-opacity flex items-center gap-2">
            <span>{new Date(msg.ts).toLocaleTimeString('zh-CN', { hour12: false })}</span>
            {msg.model && <span className="px-1.5 py-0.5 rounded-pi-pill bg-pi-bg3 text-pi-dim2 text-[10px]" title={`${msg.model.provider}/${msg.model.id}`}>{msg.model.id}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
