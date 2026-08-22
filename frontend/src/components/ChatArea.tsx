import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import { SessionsApi, ChatApi } from '../api'
import Message from './Message'
import ModelSelect from './ModelSelect'
import type { ChatMessage, RunningTool } from '../types'

// 流式状态：覆盖服务端全部 SSE 事件（delta/think/think_end/tool/tool_output/
// tool_end/turn_end/file/image/media/note/emotion/done/error）
interface StreamState {
  text: string
  think: string
  thinkDone: boolean
  tools: RunningTool[]
  notes: string[]
  files: { path: string; name?: string }[]
  images: string[]
  audios: string[]
  error?: string
}

const emptyStream = (): StreamState => ({ text: '', think: '', thinkDone: false, tools: [], notes: [], files: [], images: [], audios: [] })

// 90s 无新事件 → 看门狗提示（对齐线上版 chat.js）
const IDLE_WARN_MS = 90_000

function toDataUri(raw: string, mime?: string): string {
  return raw.startsWith('data:') ? raw : `data:${mime || 'image/png'};base64,${raw}`
}

export default function ChatArea() {
  const { currentSessionId, currentModel } = useApp()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [stream, setStream] = useState<StreamState | null>(null)
  const [idleSeconds, setIdleSeconds] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  // ref 是唯一事实源：SSE 事件可能在一个渲染批次内全部到达，useEffect 同步会滞后导致 done 时读到旧值
  const streamRef = useRef<StreamState | null>(null)
  const lastEventAtRef = useRef(0)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // 智能滚动：用户上翻（距底 >120px）时不强制拉回
  const nearBottomRef = useRef(true)
  const scroll = () => {
    if (!nearBottomRef.current) return
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }
  const onScroll = () => {
    const el = scrollRef.current
    if (el) nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  const load = async (sid: string) => {
    setLoading(true); setStream(null); streamRef.current = null; setMessages([])
    try { const d = await SessionsApi.messages(sid); setMessages(d.messages || []) }
    catch {} finally { setLoading(false); nearBottomRef.current = true; scroll() }
  }
  useEffect(() => { currentSessionId ? load(currentSessionId) : (setMessages([]), setStream(null), streamRef.current = null) }, [currentSessionId])

  // 更新流式状态：改 ref → 同步渲染副本
  const updStream = (fn: (p: StreamState) => StreamState | null) => {
    const cur = streamRef.current
    if (!cur) return
    const next = fn(cur)
    streamRef.current = next
    setStream(next ? { ...next } : null)
  }

  // 看门狗：流式期间每秒检查空闲时长（只跟"是否在流式"绑定，不随每个增量重置）
  const streaming = !!stream
  useEffect(() => {
    if (!streaming) { setIdleSeconds(0); return }
    lastEventAtRef.current = Date.now()
    const t = setInterval(() => setIdleSeconds(Math.floor((Date.now() - lastEventAtRef.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [streaming])

  const finalize = () => {
    const s = streamRef.current
    if (!s) return
    if (s.text || s.think || s.tools.length || s.files.length || s.images.length || s.audios.length || s.error) {
      setMessages(prev => [...prev, {
        id: 'a' + Date.now(), role: 'assistant',
        text: s.text + (s.error ? `\n\n⚠️ ${s.error}` : ''),
        think: s.think, tools: s.tools, notes: s.notes,
        files: s.files, images: s.images, audios: s.audios,
        ts: new Date().toISOString(),
      }])
    }
    streamRef.current = null
    setStream(null)
  }

  const send = async (raw: string) => {
    const content = raw.trim(); if (!content || streamRef.current) return
    let sid = currentSessionId
    if (!sid) { try { const d = await SessionsApi.create(); sid = d.id } catch { return } }
    setMessages(prev => [...prev, { id: 'u' + Date.now(), role: 'user', text: content, ts: new Date().toISOString() }])
    streamRef.current = emptyStream()
    setStream({ ...streamRef.current })
    nearBottomRef.current = true
    abortRef.current = ChatApi.send({ sessionId: sid, message: content, model: currentModel === 'auto/auto' ? undefined : currentModel }, (ev) => {
      lastEventAtRef.current = Date.now() // 任意事件都算活跃（含 delta）
      const d = ev.data || {}
      switch (ev.type) {
        case 'delta':
        case 'message': {
          const t = d.text || d.delta?.text || ''
          if (t) updStream(p => ({ ...p, text: p.text + t }))
          break
        }
        case 'think': {
          const t = d.think || d.text || ''
          if (t) updStream(p => ({ ...p, think: p.think + t, thinkDone: false }))
          break
        }
        case 'think_end':
          updStream(p => ({ ...p, thinkDone: true }))
          break
        case 'tool':
          updStream(p => {
            const argsText = typeof d.args === 'object' && d.args !== null
              ? (d.args.command || d.args.path || JSON.stringify(d.args))
              : String(d.args || '')
            return { ...p, tools: [...p.tools, { id: d.id || 't' + Date.now(), name: d.name || 'tool', argsText, output: '', running: true }] }
          })
          break
        case 'tool_output':
          updStream(p => ({ ...p, tools: p.tools.map(t => t.id === d.id ? { ...t, output: t.output + (d.text || '') } : t) }))
          break
        case 'tool_end':
          updStream(p => ({ ...p, tools: p.tools.map(t => t.id === d.id ? { ...t, running: false, isError: !!d.isError, output: d.output || t.output } : t) }))
          break
        case 'turn_end':
          break
        case 'file':
          if (d.path) updStream(p => ({ ...p, files: [...p.files, { path: d.path, name: d.name }] }))
          break
        case 'image':
          if (d.data) updStream(p => ({ ...p, images: [...p.images, toDataUri(d.data || '', d.mimeType)] }))
          break
        case 'media':
          // 媒体路由结果：图片/音频直接进消息区
          if (d.type === 'image' && d.url) updStream(p => ({ ...p, images: [...p.images, d.url] }))
          else if (d.type === 'audio' && d.url) updStream(p => ({ ...p, audios: [...p.audios, d.url] }))
          break
        case 'note':
          updStream(p => ({ ...p, notes: [...p.notes, d.text || d.note || ''].filter(Boolean) }))
          break
        case 'emotion':
          break // Phase 2 接情绪状态
        case 'done':
        case 'finish':
          finalize()
          break
        case 'error':
          // 错误后收尾：已生成内容保留，错误并入消息
          updStream(p => ({ ...p, error: d.message || d.error || '未知错误' }))
          finalize()
          break
      }
      scroll()
    })
    scroll()
  }

  const stop = () => {
    abortRef.current?.()
    abortRef.current = null
    updStream(p => ({ ...p, error: p.error || '已手动停止' }))
    finalize()
  }

  const doSend = () => { const v = taRef.current?.value || ''; if (!v.trim()) return; send(v); if (taRef.current) taRef.current.value = '' }
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() } }

  const welcome = (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto rounded-pi-xl bg-gradient-to-br from-pi-accent to-pi-accent-deep flex items-center justify-center text-3xl font-bold text-white mb-4 shadow-lg">语</div>
        <div className="text-2xl font-bold text-pi-text mb-2">小语 · AI 工作台</div>
        <div className="text-pi-dim mb-6">基于 pi 引擎的 AI 工作伙伴</div>
      </div>
    </div>
  )

  const idleWarned = idleSeconds * 1000 >= IDLE_WARN_MS && streaming

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* 顶栏 */}
      <div className="flex items-center px-5 h-12 border-b border-pi-border-soft glass flex-shrink-0 gap-2">
        <div className="font-medium text-[14px] text-pi-text">会话</div>
        <div className="ml-auto" />
        <ModelSelect />
      </div>

      {/* 看门狗提示条 */}
      {idleWarned && (
        <div className="px-6 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs flex-shrink-0">
          ⏳ 已 {idleSeconds}s 无新消息——模型可能在深度思考或网络不畅，可稍候或点「停止」
        </div>
      )}

      {/* 消息区 */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-6 py-4 scroll-smooth"
        style={{ backgroundImage: 'linear-gradient(to right, rgba(38,43,56,.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(38,43,56,.1) 1px, transparent 1px)', backgroundSize: '48px 48px', backgroundPosition: 'center' }}>
        {loading ? <div className="flex justify-center py-10 text-pi-dim2">加载中…</div>
          : messages.length === 0 && !stream ? welcome
          : (
            <div className="max-w-3xl mx-auto">
              {messages.map(m => <Message key={m.id} msg={m} />)}
              {stream && (
                <Message msg={{
                  id: '__streaming__', role: 'assistant',
                  text: stream.text + (stream.error ? `\n\n⚠️ ${stream.error}` : ''),
                  think: stream.think, tools: stream.tools, notes: stream.notes,
                  files: stream.files, images: stream.images, audios: stream.audios,
                  streaming: true,
                }} />
              )}
            </div>
          )}
      </div>

      {/* 输入栏 */}
      <div className="border-t border-pi-border-soft glass px-6 py-3 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-pi-xl border border-pi-border bg-pi-bg2/50 backdrop-blur-lg focus-within:border-pi-accent focus-within:ring-1 focus-within:ring-pi-accent/30 transition-all">
            <textarea ref={taRef} rows={2} placeholder="给小语发消息…" disabled={!!stream}
              className="w-full bg-transparent border-none outline-none px-4 py-3 text-[13.5px] text-pi-text resize-none placeholder:text-pi-dim2 disabled:opacity-60"
              onKeyDown={onKey} />
            <div className="flex items-center px-3 pb-3 gap-1.5">
              <span className="text-pi-dim2 text-xs flex-1">Enter 发送 · Shift+Enter 换行</span>
              {stream ? (
                <button onClick={stop}
                  className="h-8 px-4 rounded-full bg-red-500/90 text-white text-xs font-medium flex items-center gap-1.5 hover:bg-red-500 transition-colors">
                  <span className="w-2.5 h-2.5 bg-white rounded-[2px]" /> 停止
                </button>
              ) : (
                <button onClick={doSend} title="发送"
                  className="w-8 h-8 rounded-full bg-pi-accent text-white flex items-center justify-center hover:bg-pi-accent2 transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="12 19 12 5"/><polyline points="5 12 12 5 19 12"/></svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
