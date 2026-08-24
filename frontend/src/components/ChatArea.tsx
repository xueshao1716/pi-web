import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { useApp } from '../store'
import { ChatApi, SessionsApi, AsrApi, streamSession } from '../api'
import Message from './Message'
import ModelSelect from './ModelSelect'
import SendBox from './SendBox'
import TurnList from './TurnList'
import type { FileAttachment } from './SendBox'
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

export default function ChatArea({ compactHeader }: { compactHeader?: boolean } = {}) {
  const { currentSessionId, currentModel, refreshSessions, selectSession } = useApp()
  const [stream, setStream] = useState<StreamState | null>(null)
  const [idleSeconds, setIdleSeconds] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  // ref 是唯一事实源：SSE 事件可能在一个渲染批次内全部到达，useEffect 同步会滞后导致 done 时读到旧值
  const streamRef = useRef<StreamState | null>(null)
  const lastEventAtRef = useRef(0)

  // ── swr 数据层：消息缓存 + 重验证（切会话自动换 key，断线恢复后 revalidate）──
  const msgKey = currentSessionId ? ['messages', currentSessionId] : null
  const { data: msgData, isLoading, mutate: mutateMsgs } = useSWR(msgKey,
    ([, sid]: readonly [string, string]) => SessionsApi.messages(sid),
    { revalidateOnFocus: false, dedupingInterval: 1500 })
  const messages: ChatMessage[] = msgData?.messages || []
  const loading = !!msgKey && isLoading && !msgData

  // 本地乐观更新（发送/收尾/系统提示），不触发重验证
  const updateMessages = (fn: (prev: ChatMessage[]) => ChatMessage[]) => {
    if (!currentSessionId) return
    mutateMsgs(prev => ({ ...(prev || { messages: [] as ChatMessage[] }), messages: fn(prev?.messages || []) }), { revalidate: false })
  }

  const reload = () => { if (currentSessionId) mutateMsgs() }

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

  useEffect(() => { streamRef.current = null; setStream(null); nearBottomRef.current = true }, [currentSessionId])

  // 多端同步：订阅会话事件流，外部（手机/其他端）新消息到达时静默刷新（本地流式中不刷）；
  // 断线由 api 层自动重连（5s），重连成功后靠下一次事件刷新
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!currentSessionId) return
    let alive = true
    const off = streamSession(currentSessionId, 0, () => {
      if (streamRef.current || !alive) return // 本地正在生成，避免自刷新打断
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      syncTimerRef.current = setTimeout(() => { mutateMsgs() }, 800)
    }, () => {
      // 连接出错：若本地也没在流式，延迟兜底重验证一次
      if (streamRef.current || !alive) return
      setTimeout(() => { if (alive && !streamRef.current) mutateMsgs() }, 6000)
    })
    return () => { alive = false; off(); if (syncTimerRef.current) clearTimeout(syncTimerRef.current) }
  }, [currentSessionId]) // eslint-disable-line

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
      updateMessages(prev => [...prev, {
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

  const runCommand = async (cmd: string) => {
    if (cmd === '/new') {
      try { const d = await SessionsApi.create(); await refreshSessions(); selectSession(d.id) } catch {}
      return
    }
    if (cmd === '/legacy') { window.location.href = '/?legacy=1'; return }
    const tips: Record<string, string> = {
      '/help': '可用命令：/new 新建会话 · /legacy 旧版界面 · /compact 压缩上下文（暂未接入） · /stats 统计（暂未接入）',
      '/compact': '/compact 暂未接入 React 版，可到旧版界面使用（/?legacy=1）',
      '/stats': '/stats 暂未接入 React 版，可到旧版界面使用（/?legacy=1）',
    }
    updateMessages(prev => [...prev, { id: 'sys' + Date.now(), role: 'system', text: tips[cmd] || `未知命令 ${cmd}`, ts: new Date().toISOString() }])
  }

  const send = async (raw: string, attachFiles: FileAttachment[] = []) => {
    const content = raw.trim(); if (!content || streamRef.current) return
    let sid = currentSessionId
    if (!sid) {
      // 尚无会话：先建会话并选中，等切会话的 effect 跑完（清流式态）再继续，
      // 否则乐观更新的用户消息会落空、后续 SSE 事件会被 effect 清掉
      try { const d = await SessionsApi.create(); await refreshSessions(); selectSession(d.id); sid = d.id } catch { return }
      await new Promise(r => setTimeout(r, 80))
    }
    updateMessages(prev => [...prev, { id: 'u' + Date.now(), role: 'user', text: content, ts: new Date().toISOString() }])
    streamRef.current = emptyStream()
    setStream({ ...streamRef.current })
    nearBottomRef.current = true
    abortRef.current = ChatApi.send({
      sessionId: sid, message: content,
      model: currentModel === 'auto/auto' ? undefined : currentModel,
      files: attachFiles.length ? attachFiles : undefined,
    }, (ev) => {
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

  // SendBox 把转写文本填进输入框的回调通道；语音输入：录音 → /api/asr 转写 → 填入输入框
  const voiceTextRef = useRef<((t: string) => void) | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const handleVoice = async (dataB64: string, format: string) => {
    setVoiceBusy(true)
    try {
      const d = await AsrApi.transcribe(dataB64, format)
      if (d.text) voiceTextRef.current?.(d.text)
      else throw new Error('未识别到内容')
    } catch (e: any) {
      updateMessages(prev => [...prev, { id: 'sysasr' + Date.now(), role: 'system', text: `语音识别失败：${e?.message || e}`, ts: new Date().toISOString() }])
    } finally { setVoiceBusy(false) }
  }

  const welcome = (
    <div className="flex items-center justify-center h-full px-6">
      <div className="text-center max-w-lg anim-enter">
        <div className="w-20 h-20 mx-auto rounded-pi-xl bg-gradient-to-br from-pi-accent via-pi-accent2 to-purple-400 flex items-center justify-center text-4xl font-bold text-white mb-6 shadow-lg anim-enter" style={{ boxShadow: '0 8px 40px rgba(84,104,255,0.4), 0 0 80px rgba(84,104,255,0.15)' }}>语</div>
        <div className="text-[28px] font-extrabold text-pi-text mb-2 tracking-tight anim-enter anim-enter-delay-1">小语 · AI 工作台</div>
        <div className="text-pi-dim mb-8 text-[15px] anim-enter anim-enter-delay-2">基于 pi 引擎的 AI 工作伙伴</div>
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto text-left anim-enter anim-enter-delay-3">
          {[
            { icon: '💬', label: '智能对话', desc: '多模型自由切换', chip: 'chip-blue' },
            { icon: '🧠', label: '深度思考', desc: '过程可见可控', chip: 'chip-violet' },
            { icon: '🛠️', label: '工具调用', desc: '代码·文件·终端', chip: 'chip-amber' },
            { icon: '📂', label: '工作空间', desc: '文件管理一体化', chip: 'chip-green' },
          ].map((f, i) => (
            <div key={i} className={`rounded-pi-lg border px-4 py-3 transition-all duration-200 cursor-default anim-enter ${f.chip}`} style={{ animationDelay: `${0.2 + i * 0.06}s` }}>
              <div className="text-lg mb-1" style={{ filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.18))' }}>{f.icon}</div>
              <div className="text-[13px] font-semibold text-pi-text">{f.label}</div>
              <div className="text-[11px] text-pi-dim2">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const idleWarned = idleSeconds * 1000 >= IDLE_WARN_MS && streaming

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* 顶栏 */}
      <div className="flex items-center px-5 h-12 border-b border-pi-border-soft glass flex-shrink-0 gap-2">
        {!compactHeader && <div className="font-medium text-[14px] text-pi-text">会话</div>}
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
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
        {loading ? (
          <div className="max-w-3xl w-full mx-auto px-6 py-6 space-y-5" aria-label="加载中">
            {[520, 380, 460].map((w, i) => (
              <div key={i} className="flex gap-3 anim-enter" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="w-7 h-7 rounded-lg skeleton-block flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 rounded-pi-sm skeleton-block" style={{ width: `${w * 0.7}px`, maxWidth: '80%' }} />
                  <div className="h-3 rounded-pi-sm skeleton-block" style={{ width: `${w}px`, maxWidth: '92%' }} />
                  <div className="h-3 rounded-pi-sm skeleton-block" style={{ width: `${w * 0.55}px`, maxWidth: '65%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 && !stream ? welcome
          : (
            <div className="max-w-3xl mx-auto">
              <TurnList
                messages={messages}
                streamingNode={stream ? (
                  <Message msg={{
                    id: '__streaming__', role: 'assistant',
                    text: stream.text + (stream.error ? `\n\n⚠️ ${stream.error}` : ''),
                    think: stream.think, tools: stream.tools, notes: stream.notes,
                    files: stream.files, images: stream.images, audios: stream.audios,
                    streaming: true,
                  }} />
                ) : undefined}
              />
            </div>
          )}
      </div>

      {/* 输入栏 */}
      <div className="border-t border-pi-border-soft glass px-4 sm:px-6 py-3 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <SendBox streaming={!!stream} onStop={stop} onSend={send} onCommand={runCommand}
            voiceBusy={voiceBusy} onVoice={handleVoice} onVoiceTextReady={fn => { voiceTextRef.current = fn }} />
        </div>
      </div>
    </div>
  )
}
