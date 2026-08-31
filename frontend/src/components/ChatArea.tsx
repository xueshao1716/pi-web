import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { useApp } from '../store'
import { MessagesSquare, BrainCircuit, Wrench, FolderClosed, Plus, SquareTerminal, LayoutGrid, Command, ChevronDown, PanelRight, ShieldAlert } from 'lucide-react'
import { RefreshCw } from 'lucide-react'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { RunsApi, SessionsApi, AsrApi, EmotionApi, AgentStatusApi, streamSession, LingXiApi, ConfirmApi } from '../api'
import Message from './Message'
import SendBox from './SendBox'
import TurnList from './TurnList'
import { useAutoScroll } from '../hooks/useAutoScroll'
import { toast } from './Toast'
import { emoMeta, emoTooltip, type EmoMeta } from '../lib/emotion'
import type { FileAttachment } from './SendBox'
import type { ChatMessage, RunningTool } from '../types'
import WebglBackdrop from './WebglBackdrop'
import { saveMessage, getMessages, deleteMessage, mergeMessages, type LocalMessage } from '../lib/local-db'
import { notifyTaskDone } from '../lib/notify'
import { upsertRunningTool } from '../lib/chat-stream'
import { advanceRunCursor, isTerminalRunStatus, type RunCursor, type RunEvent } from '../lib/run-events'

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

interface ActiveRunRecord extends RunCursor {
  sessionId: string
  assistantMessageId: string
  stream: StreamState
}

const activeRunKey = (sessionId: string) => `pi_active_run:${sessionId}`

function loadActiveRun(sessionId: string): ActiveRunRecord | null {
  try {
    const value = JSON.parse(localStorage.getItem(activeRunKey(sessionId)) || 'null')
    return value?.runId && value.sessionId === sessionId ? value : null
  } catch { return null }
}

function saveActiveRun(record: ActiveRunRecord) {
  try {
    // 大图片/音频不进 localStorage；文本、工具与 seq 必须同一次写入，避免游标领先快照后无法重放。
    localStorage.setItem(activeRunKey(record.sessionId), JSON.stringify({
      ...record,
      stream: { ...record.stream, images: [], audios: [] },
    }))
  } catch {}
}

function clearActiveRun(sessionId: string) {
  try { localStorage.removeItem(activeRunKey(sessionId)) } catch {}
}

function toDataUri(raw: string, mime?: string): string {
  return raw.startsWith('data:') ? raw : `data:${mime || 'image/png'};base64,${raw}`
}

export default function ChatArea({ compactHeader, rightPanel, onRightPanel }: {
  compactHeader?: boolean
  /** 右栏状态由 AppLayout 持有；传入则顶栏显示"右栏"开关（与状态胶囊并排，不再悬浮遮挡） */
  rightPanel?: string
  onRightPanel?: (p: any) => void
} = {}) {
  const { currentSessionId, currentModel, refreshSessions, selectSession } = useApp()
  const sessionIdRef = useRef(currentSessionId)
  sessionIdRef.current = currentSessionId
  const [stream, setStream] = useState<StreamState | null>(null)
  const [confirm, setConfirm] = useState<any>(null) // 危险操作待确认：{ id, toolName, reason, args, sessionId }
  const [idleSeconds, setIdleSeconds] = useState(0)
  const streamCloseRef = useRef<(() => void) | null>(null)
  const activeRunRef = useRef<ActiveRunRecord | null>(null)
  const pendingModelRef = useRef<{ provider: string; id: string } | undefined>(undefined)
  const watchdogStoppingRef = useRef(false)
  // ref 是唯一事实源：SSE 事件可能在一个渲染批次内全部到达，useEffect 同步会滞后导致 done 时读到旧值
  const streamRef = useRef<StreamState | null>(null)
  const lastEventAtRef = useRef(0)
  const assistantMsgIdRef = useRef<string | null>(null) // 本轮 assistant 消息的固定 id，流式期间快照与最终写入用同一 id（避免重复）
  const wasBackgroundRef = useRef(false) // 本轮流式期间是否曾去过后台（哪怕又切回来了），放宽通知触发条件用

  // ── swr 数据层：消息缓存 + 重验证（切会话自动换 key，断线恢复后 revalidate）──
  const msgKey = currentSessionId ? ['messages', currentSessionId] : null
  const { data: msgData, isLoading, mutate: mutateMsgs } = useSWR(msgKey,
    ([, sid]: readonly [string, string]) => SessionsApi.messages(sid),
    { revalidateOnFocus: true, dedupingInterval: 1500 })
  // ── 本地消息存储：从 IndexedDB 加载，与服务端数据合并 ──
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
  const [localLoaded, setLocalLoaded] = useState(false)

  // 切会话时：加载本地消息
  useEffect(() => {
    if (!currentSessionId) { setLocalMessages([]); setLocalLoaded(false); return }
    let alive = true
    setLocalLoaded(false)
    getMessages(currentSessionId).then(localMsgs => {
      if (!alive) return
      // 转换成 ChatMessage 格式
      const msgs = localMsgs.map(lm => ({
        id: lm.id,
        role: lm.role,
        text: lm.text,
        think: lm.think,
        tools: lm.tools,
        notes: lm.notes,
        files: lm.files,
        images: lm.images,
        audios: lm.audios,
        model: lm.model,
        ts: lm.ts,
        streaming: lm.streaming,
        isDraft: lm.draft,
      } as ChatMessage))
      setLocalMessages(msgs)
      setLocalLoaded(true)
    }).catch(() => {
      setLocalMessages([])
      setLocalLoaded(true)
    })
    return () => { alive = false }
  }, [currentSessionId])

  // 合并本地与服务端消息：本地优先，服务端补充
  const messages: ChatMessage[] = localLoaded && msgData
    ? mergeMessages(
        localMessages.map(m => ({
          id: m.id,
          sessionId: currentSessionId || '',
          role: m.role,
          text: m.text || '',
          think: m.think,
          tools: m.tools,
          notes: m.notes,
          files: m.files,
          images: m.images,
          audios: m.audios,
          model: m.model,
          ts: m.ts,
          synced: !m.isDraft,
          draft: !!m.isDraft,
          streaming: m.streaming,
        })),
        msgData.messages || []
      ).map(lm => ({
        id: lm.id,
        role: lm.role,
        text: lm.text,
        think: lm.think,
        tools: lm.tools,
        notes: lm.notes,
        files: lm.files,
        images: lm.images,
        audios: lm.audios,
        model: lm.model,
        ts: lm.ts,
        streaming: lm.streaming,
        isDraft: lm.draft,
      } as ChatMessage))
    : localLoaded
      ? localMessages
      : (msgData?.messages || [])

  // 保存消息到本地 IndexedDB
  const saveToLocal = async (msg: ChatMessage) => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    try {
      await saveMessage({
        id: msg.id,
        sessionId,
        role: msg.role,
        text: msg.text || '',
        think: msg.think,
        tools: msg.tools,
        notes: msg.notes,
        files: msg.files,
        images: msg.images,
        audios: msg.audios,
        model: msg.model,
        ts: msg.ts,
        synced: !msg.streaming && !msg.isDraft,
        draft: !!msg.isDraft || !!msg.streaming,
        streaming: msg.streaming,
      })
      // 更新本地消息列表
      setLocalMessages(prev => {
        const exists = prev.find(m => m.id === msg.id)
        if (exists) return prev.map(m => m.id === msg.id ? msg : m)
        return [...prev, msg]
      })
    } catch (e) {
      console.error('[local-db] 保存消息失败:', e)
    }
  }

  // 移动端下拉刷新：重验证当前会话消息 + 会话列表（触屏才触发，桌面无 touch 事件）
    // 手机息屏恢复：页面从 hidden→visible 超过 10s，强制重拉消息（补 SWR 自动同步）
  // 同时跟踪：只要流式期间曾经 hidden 过一次（哪怕只是瞬间锅屏/切新又切回），就标记 wasBackgroundRef，
  // 因为用户已经离开过一次，很可能没看到完整过程，完成时应该提醒（而不是仅当完成那一刻刚好在后台才提醒）。
  useEffect(() => {
    let hiddenAt = 0
    const onVis = () => {
      if (document.hidden) { hiddenAt = Date.now(); if (streamRef.current) wasBackgroundRef.current = true; return }
      if (hiddenAt && Date.now() - hiddenAt > 10_000 && currentSessionId) {
        mutateMsgs()
        refreshSessions()
      }
      hiddenAt = 0
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [currentSessionId, mutateMsgs, refreshSessions])

  const pull = usePullToRefresh(async () => {
    await mutateMsgs()
    await refreshSessions()
  })
    // 用户消息防丢现已改由 IndexedDB 本地存储承担（send() 里 appendMessage 发送时即写入本地），无需再依赖旧版 localStorage pi_pending_msg + 手动插入 SWR 缓存的方式。

  const loading = !!msgKey && isLoading && !msgData

  // 本地乐观更新（发送/收尾/系统提示），不触发重验证
  const updateMessages = (fn: (prev: ChatMessage[]) => ChatMessage[]) => {
    if (!currentSessionId) return
    mutateMsgs(prev => ({ ...(prev || { messages: [] as ChatMessage[] }), messages: fn(prev?.messages || []) }), { revalidate: false })
  }

  // 追加一条消息：同时写入 SWR 乘机缓存 + IndexedDB 本地持久化。
  // 写本地 IndexedDB 与服务端 JSONL 完全独立，不会产生重复写入问题，因此用户消息也可以安全地立即存本地。
  const appendMessage = (msg: ChatMessage) => {
    updateMessages(prev => [...prev, msg])
    saveToLocal(msg)
  }

  const reload = () => { if (currentSessionId) mutateMsgs() }

  // 未完成的本地草稿（刷新/重启后从 IndexedDB 恢复）：只在当前没有活跃流式时展示
  const draftMsg = !stream ? messages.find(m => m.isDraft) : undefined
  const normalMessages = draftMsg ? messages.filter(m => m.id !== draftMsg.id) : messages

  // 智能滚动（nomifun useAutoScroll 模式）：用户上翻停滚、贴底恢复、仅"真新消息"才强拉底
  const lastMsg = messages[messages.length - 1]
  const streamingLen = stream ? 1 : 0 // 流式中的临时消息也计入指纹，增长由 ResizeObserver 跟随
  const { scrollRef, scrollToBottom: scroll, atBottom } = useAutoScroll({
    sessionKey: currentSessionId,
    lastMessageKey: messages.length
      ? `${messages.length}:${lastMsg?.id ?? ''}:${streamingLen}`
      : (stream ? 'stream' : null),
    lastFromUser: lastMsg?.role === 'user' || (!!stream && !stream.text && !stream.tools.length),
  })

  // 切会话只关闭本端订阅，不停止服务端 Run；该会话再次进入时会按游标恢复。
  useEffect(() => {
    streamCloseRef.current?.()
    streamCloseRef.current = null
    activeRunRef.current = null
    assistantMsgIdRef.current = null
    streamRef.current = null
    setStream(null)
  }, [currentSessionId])
  useEffect(() => {
    if (!currentSessionId) return
    let alive = true
    EmotionApi.get(currentSessionId).then((s: any) => {
      if (alive && s && typeof s.valence !== 'undefined') setEmo({ state: s, meta: emoMeta(s) })
    }).catch(() => {}) // 情绪拉不到就保持默认，不打扰
    return () => { alive = false }
  }, [currentSessionId])

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
    if (next && activeRunRef.current) {
      activeRunRef.current = { ...activeRunRef.current, stream: next }
    }
    setStream(next ? { ...next } : null)
  }

  // 看门狗：流式期间每秒检查空闲时长（只跟"是否在流式"绑定，不随每个增量重置）
  const streaming = !!stream
  useEffect(() => {
    if (!streaming) { setIdleSeconds(0); return }
    lastEventAtRef.current = Date.now()
    const t = setInterval(() => {
      const idle = Math.floor((Date.now() - lastEventAtRef.current) / 1000)
      setIdleSeconds(idle)
      // 看门狗自动停止：超过 90s 无新事件 → 判定为死流，自动中止
      if (idle >= 90 && streamRef.current && activeRunRef.current && !watchdogStoppingRef.current) {
        console.warn('[watchdog] 流式无响应超过90s，请求服务端停止 Run')
        watchdogStoppingRef.current = true
        updStream(p => ({ ...p, error: (p.error || '') + (p.error ? ' · ' : '') + '⏱️ 长时间无响应，正在停止', tools: p.tools.map(t => t.status === 'running' ? { ...t, status: 'canceled' } : t) }))
        RunsApi.stop(activeRunRef.current.runId)
          .then(() => toast('模型长时间无响应，已请求停止', 'error'))
          .catch(e => { watchdogStoppingRef.current = false; console.error('[watchdog] 自动停止失败:', e) })
      }
    }, 1000)
    return () => clearInterval(t)
  }, [streaming])

  // 流式增量持久化：每 3s 快照到 IndexedDB（同 id 覆盖写入，不会重复），刷新后可从本地恢复未完成的回复
  // 注意：只依赖 streaming（true/false）控制定时器启停，不能依赖 stream 对象本身——
  // 否则每个 delta 到达都会重建定时器，3s 永远跡不完，快照永远不会真正触发。
  // 定时回调里直接读 streamRef.current（它是同步的最新值，updStream 里每次都会同步写入），不依赖闭包里的 stream。
  useEffect(() => {
    if (!streaming || !currentSessionId) return
    const t = setInterval(() => {
      const s = streamRef.current
      if (!s || !assistantMsgIdRef.current) return
      if (activeRunRef.current) saveActiveRun({ ...activeRunRef.current, stream: s })
      if (!s.text && !s.tools.length && !s.think) return // 空内容不存
      saveToLocal({
        id: assistantMsgIdRef.current,
        role: 'assistant',
        text: s.text,
        think: s.think,
        tools: s.tools,
        notes: s.notes,
        files: s.files,
        images: s.images,
        audios: s.audios,
        ts: new Date().toISOString(),
        streaming: true,
        isDraft: true,
      })
    }, 3000)
    return () => clearInterval(t)
  }, [streaming, currentSessionId])

  const finalize = (model?: { provider: string; id: string }) => {
    // 只有持久化 Run 进入终态才收尾；普通 SSE 断线/错误事件不会结束后台任务。
    try { localStorage.removeItem('pi_pending_msg') } catch {}
    const active = activeRunRef.current
    const s = streamRef.current
    const finalId = assistantMsgIdRef.current
    streamCloseRef.current?.()
    streamCloseRef.current = null
    assistantMsgIdRef.current = null
    watchdogStoppingRef.current = false
    pendingModelRef.current = undefined
    if (active) clearActiveRun(active.sessionId)
    activeRunRef.current = null
    if (!s) return
    if (s.text || s.think || s.tools.length || s.files.length || s.images.length || s.audios.length || s.error) {
      appendMessage({
        id: finalId || ('a' + Date.now()), role: 'assistant',
        text: s.text + (s.error ? `\n\n⚠️ ${s.error}` : ''),
        think: s.think, tools: s.tools, notes: s.notes,
        files: s.files, images: s.images, audios: s.audios,
        ts: new Date().toISOString(),
        streaming: false, isDraft: false,
        ...(model ? { model } : {}),
      })
      // 完成提示音：双声"叮叮"（800Hz 0.1s + 1000Hz 0.15s）
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        gain.gain.value = 0.25
        osc.frequency.value = 800
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.1)
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        gain2.gain.value = 0.25
        osc2.frequency.value = 1000
        osc2.start(ctx.currentTime + 0.15)
        osc2.stop(ctx.currentTime + 0.3)
      } catch {}
      // 任务完成系统通知（安卓原生桥/Windows Tauri 插件统一入口，见 lib/notify.ts）：
      // 页面不可见（App 在后台/锁屏）或本轮流式期间曾去过后台（哪怕又切回来）都弹，
      // 旧条件只看完成那一瞬间是否在后台，错过了“发送后切到其它 App，回来时刚好生成完成”这种典型场景。
      const shouldNotify = document.visibilityState === 'hidden' || wasBackgroundRef.current
      if (shouldNotify) {
        const preview = (s.text || '').replace(/\s+/g, ' ').trim().slice(0, 60) || (s.error ? `出错：${s.error}` : '有新回复')
        notifyTaskDone('小语 · 任务完成', preview)
      }
      wasBackgroundRef.current = false // 收尾已处理完，重置供下一轮使用
    }
    streamRef.current = null
    setStream(null)
    mutateMsgs()
    refreshSessions()
  }

  const applyRunEvent = (event: RunEvent) => {
    const active = activeRunRef.current
    if (!active) return
    const advanced = advanceRunCursor(active, event)
    if (!advanced.accepted) return
    const nextActive: ActiveRunRecord = { ...active, ...advanced.cursor }
    activeRunRef.current = nextActive
    lastEventAtRef.current = Date.now()
    const d = event.data || {}

    switch (event.type) {
      case 'delta':
      case 'message': {
        const text = d.text || d.delta?.text || ''
        if (text) updStream(p => ({ ...p, text: p.text + text }))
        break
      }
      case 'think': {
        const text = d.think || d.text || ''
        if (text) updStream(p => ({ ...p, think: p.think + text, thinkDone: false }))
        break
      }
      case 'think_end':
        updStream(p => ({ ...p, thinkDone: true }))
        break
      case 'tool': {
        const id = d.id || `t${event.seq}`
        updStream(p => ({ ...p, tools: upsertRunningTool(p.tools, { ...d, id }) }))
        break
      }
      case 'tool_output':
        updStream(p => ({ ...p, tools: p.tools.map(t => t.id === d.id ? { ...t, output: t.output + (d.text || '') } : t) }))
        break
      case 'tool_end':
        updStream(p => ({ ...p, tools: p.tools.map(t => t.id === d.id ? { ...t, running: false, isError: !!d.isError, status: d.isError ? 'error' : 'completed', output: d.output || t.output } : t) }))
        break
      case 'file':
        if (d.path) updStream(p => ({ ...p, files: [...p.files, { path: d.path, name: d.name }] }))
        break
      case 'image':
        if (d.data) updStream(p => ({ ...p, images: [...p.images, toDataUri(d.data, d.mimeType)] }))
        break
      case 'media':
        if (d.type === 'image' && d.url) updStream(p => ({ ...p, images: [...p.images, d.url] }))
        else if (d.type === 'audio' && d.url) updStream(p => ({ ...p, audios: [...p.audios, d.url] }))
        break
      case 'note':
        updStream(p => ({ ...p, notes: [...p.notes, d.text || d.note || ''].filter(Boolean) }))
        break
      case 'emotion':
        if (d.state && typeof d.state.valence !== 'undefined') setEmo({ state: d.state, meta: emoMeta(d.state) })
        break
      case 'confirm':
        setConfirm({ id: d.id, toolName: d.toolName, reason: d.reason, args: d.args || {}, sessionId: d.sessionId || '' })
        break
      case 'done':
      case 'finish':
        if (d.model) pendingModelRef.current = d.model
        break
      case 'error':
        updStream(p => ({ ...p, error: d.message || d.error || '未知错误' }))
        break
      case 'failed':
        updStream(p => ({ ...p, error: p.error || d.message || '任务执行失败' }))
        finalize(pendingModelRef.current)
        break
      case 'stopped':
        updStream(p => ({ ...p, error: p.error || '已手动停止', tools: p.tools.map(t => t.status === 'running' ? { ...t, running: false, status: 'canceled' } : t) }))
        finalize(pendingModelRef.current)
        break
      case 'interrupted':
        updStream(p => ({ ...p, error: p.error || '服务重启，任务已中断', tools: p.tools.map(t => t.status === 'running' ? { ...t, running: false, status: 'canceled' } : t) }))
        finalize(pendingModelRef.current)
        break
      case 'completed':
        finalize(pendingModelRef.current)
        break
    }
    scroll()
  }

  const connectRun = (record: ActiveRunRecord) => {
    streamCloseRef.current?.()
    activeRunRef.current = record
    assistantMsgIdRef.current = record.assistantMessageId
    streamRef.current = record.stream
    setStream({ ...record.stream })
    saveActiveRun(record)
    streamCloseRef.current = RunsApi.stream(
      record.runId,
      record.lastSeq,
      applyRunEvent,
      () => {
        lastEventAtRef.current = Date.now()
        updStream(p => ({ ...p, notes: p.notes.includes('连接中断，正在恢复…') ? p.notes : [...p.notes, '连接中断，正在恢复…'] }))
      },
    )
  }

  useEffect(() => {
    if (!currentSessionId) return
    const record = loadActiveRun(currentSessionId)
    if (!record) return
    let alive = true
    RunsApi.get(record.runId).then(run => {
      if (!alive) return
      if (isTerminalRunStatus(run.status) && run.lastSeq <= record.lastSeq) {
        activeRunRef.current = record
        assistantMsgIdRef.current = record.assistantMessageId
        streamRef.current = record.stream
        setStream({ ...record.stream })
        if (run.status !== 'completed') {
          updStream(p => ({ ...p, error: p.error || (run.status === 'stopped' ? '已停止' : run.status === 'interrupted' ? '服务重启，任务已中断' : '任务执行失败') }))
        }
        finalize()
        return
      }
      connectRun({ ...record, status: run.status })
    }).catch(() => {
      if (alive) clearActiveRun(currentSessionId)
    })
    return () => { alive = false; streamCloseRef.current?.(); streamCloseRef.current = null }
  }, [currentSessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const runCommand = async (cmd: string) => {
    if (cmd === '/new') {
      try { const d = await SessionsApi.create(); await refreshSessions(); selectSession(d.id) } catch { toast('新建会话失败，请重试', 'error') }
      return
    }
    if (cmd === '/legacy') { window.location.href = '/?legacy=1'; return }
    const tips: Record<string, string> = {
      '/help': '可用命令：/new 新建会话 · /lx 记灵犀（如 /lx 加个时间轴视图） · /legacy 旧版界面 · /compact 压缩上下文（暂未接入） · /stats 统计（暂未接入）',
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
      try { const d = await SessionsApi.create(); await refreshSessions(); selectSession(d.id); sid = d.id; sessionIdRef.current = d.id } catch { return }
      await new Promise(r => setTimeout(r, 80))
    }
    // 灵犀速记：/lx 灵感内容 → 记入「我的灵感」，不进对话流、不发给模型
    if (content === '/lx' || content.startsWith('/lx ')) {
      const text = content.slice(3).trim()
      if (!text) { toast('用法：/lx 后面跟上灵感内容', 'error'); return }
      LingXiApi.add({ text, source: 'user' })
        .then(() => toast('✨ 已记入灵犀·我的灵感'))
        .catch(() => toast('灵犀记录失败', 'error'))
      return
    }
    // 用户消息防丢：引擎 agent.prompt 会自动把用户消息写入会话 JSONL（pi 引擎 message_end 时 appendMessage），
    // 这里绝不能再手动预写一份到 JSONL——否则同一条 user 被写两份、parentId 相同，正是「重复+套旧答案」的根因。
    // 但前端自己的 IndexedDB 与服务端 JSONL 完全独立，写本地不会与引擎冲突，因此用 appendMessage 同时存本地。
    let userMsgId = 'u' + Date.now();
    try { localStorage.setItem('pi_pending_msg', JSON.stringify({ sid, content, at: Date.now() })) } catch {}
    appendMessage({ id: userMsgId, role: 'user', text: content, ts: new Date().toISOString() })
    assistantMsgIdRef.current = 'a' + (Date.now() + 1) // 本轮 assistant 消息固定 id，流式快照与最终写入用同一 id
    wasBackgroundRef.current = false // 新一轮开始，重置后台跟踪状态
    streamRef.current = emptyStream()
    setStream({ ...streamRef.current })
    // 模型参数（ParamsPanel 存 localStorage，随请求带给 server）
    let params: { temperature?: number; top_p?: number } | undefined
    try { params = JSON.parse(localStorage.getItem('pi_params') || 'null') || undefined } catch {}
    try {
      const created = await RunsApi.create({
        sessionId: sid,
        clientRequestId: `web-${sid}-${userMsgId}`,
        message: content,
        model: currentModel === 'auto/auto' ? undefined : currentModel,
        files: attachFiles.length ? attachFiles : undefined,
        params,
      })
      const record: ActiveRunRecord = {
        runId: created.runId,
        sessionId: sid,
        lastSeq: created.lastSeq || 0,
        status: created.status,
        assistantMessageId: assistantMsgIdRef.current!,
        stream: streamRef.current || emptyStream(),
      }
      connectRun(record)
    } catch (error: any) {
      updStream(p => ({ ...p, error: error?.status === 409 ? '当前会话已有任务运行中' : (error?.message || '创建任务失败') }))
      finalize()
    }
    scroll()
  }

  const stop = async () => {
    const active = activeRunRef.current
    if (!active || active.status === 'stopping') return
    activeRunRef.current = { ...active, status: 'stopping' }
    saveActiveRun(activeRunRef.current)
    updStream(p => ({ ...p, notes: [...p.notes, '正在停止任务…'] }))
    try { await RunsApi.stop(active.runId) }
    catch (error: any) {
      updStream(p => ({ ...p, error: `停止失败：${error?.message || error}` }))
      activeRunRef.current = active
      saveActiveRun(active)
    }
  }

  // 危险操作确认：后端弹 confirm 事件 → 用户点允许/拒绝 → 回传后端（resolve 审批 allow/reject）
  const answerConfirm = async (ok: boolean) => {
    const c = confirm
    setConfirm(null)
    if (!c || !c.id || !c.sessionId) return
    try { await ConfirmApi.answer(c.sessionId, c.id, ok) } catch { toast('确认回传失败，请重试', 'error') }
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

  // 桌面欢迎页：可操作快捷入口（08-25 layout：静态功能介绍 → 行动引导）
  const newSession = async () => {
    try { const d = await SessionsApi.create(); await refreshSessions(); selectSession(d.id) } catch { toast('新建会话失败，请重试', 'error') }
  }
  const openPanel = (p: string) => window.dispatchEvent(new CustomEvent('pi-open-panel', { detail: p }))
  const welcome = (
    <div className="relative overflow-hidden flex items-center justify-center h-full px-6">
      <div className="relative z-10 text-center max-w-2xl anim-enter">
        {/* 品牌标识：实底圆形，不用渐变 */}
        <div className="w-20 h-20 mx-auto rounded-2xl bg-pi-accent flex items-center justify-center text-4xl font-bold text-white mb-8 anim-enter"
          style={{ boxShadow: 'var(--pi-shadow-sm)' }}>语</div>

        {/* 标题 */}
        <h1 className="text-[22px] font-extrabold text-pi-text mb-2 tracking-tight anim-enter anim-enter-delay-1"
          style={{ fontFamily: 'var(--pi-font-display)' }}>你好，我是小语</h1>
        <p className="text-pi-dim text-[15px] mb-10 anim-enter anim-enter-delay-2 leading-relaxed">
          你的 AI 工作伙伴。写代码、做设计、整理文档——从一句话开始。
        </p>

        {/* 快捷入口：实底卡片，不用渐变和模糊 */}
        <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto anim-enter anim-enter-delay-3">
          {[
            { Icon: Plus, label: '新建对话', desc: '开始一段新的工作', act: newSession },
            { Icon: SquareTerminal, label: '终端', desc: '写代码调工具', act: () => openPanel('terminal') },
            { Icon: LayoutGrid, label: '模型中心', desc: '浏览与切换模型', act: () => { location.hash = '#/models' } },
            { Icon: Command, label: '命令面板', desc: 'Ctrl / ⌘ + K', act: () => window.dispatchEvent(new CustomEvent('pi-open-palette')) },
          ].map((f, i) => (
            <button key={f.label} onClick={f.act}
              className="group rounded-xl border border-pi-border bg-pi-bg1 px-5 py-4 cursor-pointer text-left hover:border-pi-accent/30 hover:bg-pi-bg2 transition-colors"
              style={{ animationDelay: `${0.25 + i * 0.07}s` }}>
              <f.Icon className="w-5 h-5 mb-2.5 text-pi-accent transition-transform group-hover:scale-105" strokeWidth={1.7} />
              <div className="text-[15px] font-semibold text-pi-text mb-0.5">{f.label}</div>
              <div className="text-[12px] text-pi-dim2 leading-relaxed">{f.desc}</div>
            </button>
          ))}
        </div>

        {/* 快捷提示 */}
        <div className="mt-10 flex items-center justify-center gap-4 text-[11px] text-pi-dim2 anim-enter anim-enter-delay-4">
          <span className="px-2 py-0.5 rounded bg-pi-bg2 border border-pi-border font-mono">⌘K</span>
          <span>命令面板</span>
          <span className="w-px h-3 bg-pi-border" />
          <span className="px-2 py-0.5 rounded bg-pi-bg2 border border-pi-border font-mono">/</span>
          <span>斜杠命令</span>
          <span className="w-px h-3 bg-pi-border" />
          <span className="px-2 py-0.5 rounded bg-pi-bg2 border border-pi-border font-mono">@</span>
          <span>引用文件</span>
        </div>
      </div>
    </div>
  )

  const idleWarned = idleSeconds * 1000 >= IDLE_WARN_MS && streaming

  // 情绪指示器：服务端 VAD 情绪引擎的镜像（SSE emotion 事件实时推 + 切会话拉快照），不是本地可点的玩具
  const [emo, setEmo] = useState<{ state: any; meta: EmoMeta }>({ state: null, meta: { emoji: '🧘', label: '专注', cls: 'focus' } })
  const [agentStatus, setAgentStatus] = useState<'idle'|'busy'|'error'>('idle')
  // 后台执行探测：轮询服务端 busy 会话表——本页没在流式但后台/他端在跑也要亮灯（用户靠它判断小语是否在工作）
  const [remoteBusy, setRemoteBusy] = useState<'self' | 'other' | null>(null)
  useEffect(() => {
    let alive = true
    let failCount = 0
    const tick = async () => {
      try {
        const d = await AgentStatusApi.get()
        if (!alive) return
        failCount = 0
        const busy = d.busy || []
        if (!busy.length) setRemoteBusy(null)
        else if (currentSessionId && busy.some(b => b.id === currentSessionId)) setRemoteBusy('self')
        else setRemoteBusy('other')
      } catch {
        if (++failCount > 3 && alive) setRemoteBusy(null) // 连续失败按空闲显示，不误报
      }
    }
    tick()
    const t = setInterval(tick, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [currentSessionId])

  // 派发状态：本地流式 / 后台任一会话在跑 → busy（红点脉动）；stream.error → error；其余 idle
  useEffect(() => {
    if (stream?.error) setAgentStatus('error')
    else if (stream || remoteBusy) setAgentStatus('busy')
    else setAgentStatus('idle')
  }, [stream, remoteBusy])
  // 安卓原生桥接：将全局忙/闲状态同步给桌面小组件（没有 YuanshuBridge 时（桌面/网页版）静默跳过）
  useEffect(() => {
    try { (window as any).YuanshuBridge?.setStatus?.(agentStatus) } catch {}
  }, [agentStatus])
  const busyFromBackground = !stream && remoteBusy === 'other'
  // 四色语义：绿=就绪 红=本页执行 橙=后台执行 品红闪=异常（看颜色一眼明白）
  const dotCls = agentStatus === 'busy' ? (busyFromBackground ? 'status-dot-bg' : 'status-dot-busy') : `status-dot-${agentStatus}`
  const liveCls = agentStatus === 'busy' ? (busyFromBackground ? 'status-pill-live-bg' : 'status-pill-live-busy') : agentStatus === 'error' ? 'status-pill-live-error' : ''

  return (
    <div className="relative flex-1 flex flex-col min-w-0 min-h-0">
      {/* 下拉刷新指示器（移动端触屏；锚定头部下方，平时 opacity:0 不占位） */}
      <div aria-hidden
        className="pointer-events-none absolute z-[var(--pi-z-toast)] left-1/2 -translate-x-1/2 top-[52px] w-9 h-9 rounded-full border border-pi-border bg-pi-bg1 shadow-xl grid place-items-center"
        style={pull.indicatorStyle}>
        <RefreshCw className={`w-4 h-4 text-pi-dim ${pull.spin ? 'animate-spin' : ''}`} strokeWidth={2} />
      </div>
      {/* 顶栏 */}
      <div className="flex items-center px-5 h-14 border-b border-pi-border bg-pi-bg1 flex-shrink-0 gap-2">
        {!compactHeader && <div className="font-medium text-[15px] text-pi-text">会话</div>}
        <div className="ml-auto" />
        {/* 执行状态（对标老版 .status-pill；aria-live 让屏幕阅读器感知流式开始/结束）*/}
        <div role="status" aria-live="polite" className={`status-pill text-[11px] text-pi-dim flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-pi-bg2/50 ${liveCls}`}>
          <span className={`status-dot ${dotCls} w-[7px] h-[7px] rounded-full flex-shrink-0`} />
          <span>{agentStatus === 'busy' ? (busyFromBackground ? '后台执行中' : '执行中') : agentStatus === 'error' ? '异常' : '就绪'}</span>
        </div>
        {/* 右栏开关：紧贴状态胶囊（桌面端；原 fixed 悬浮层会遮挡头部） */}
        {onRightPanel && (
          <button
            aria-label="打开TUI终端" title="TUI 终端"
            onClick={() => { if (rightPanel !== 'chat') onRightPanel('chat'); onRightPanel('tui') }}
            className={`text-[11px] px-2.5 py-1 rounded-pi-sm border flex items-center gap-1 flex-shrink-0 transition-colors duration-150 ${
              rightPanel === 'tui'
                ? 'bg-pi-accent text-white border-pi-accent'
                : 'border-pi-border-soft bg-pi-bg2/60 text-pi-dim hover:text-pi-text'}`}
          >TUI</button>
        )}
        {onRightPanel && (
          <button
            aria-label="切换右栏"
            title={rightPanel !== 'chat' ? '收起右栏' : '打开右栏'}
            onClick={() => onRightPanel(rightPanel === 'chat' ? 'workspace' : 'chat')}
            className={`text-[11px] px-2.5 py-1 rounded-pi-sm border flex items-center gap-1 flex-shrink-0 transition-colors duration-150 ${
              rightPanel && rightPanel !== 'chat'
                ? 'bg-pi-accent text-white border-pi-accent'
                : 'border-pi-border-soft bg-pi-bg2/60 text-pi-dim hover:text-pi-text glow-hover'}`}
          >
            <PanelRight className="w-3 h-3" strokeWidth={2} />
            右栏
          </button>
        )}
        {/* 心情：服务端真实情绪镜像，只展示不可点改 */}
        <div className={`emo-pill w-[30px] h-[30px] rounded-full bg-pi-bg2/60 border border-pi-border-soft flex items-center justify-center text-[15px] cursor-default transition-colors ${emo.meta.cls !== 'focus' ? 'border-pi-accent/30' : ''}`}
          title={emoTooltip(emo.state, emo.meta)}>
          {emo.meta.emoji}
        </div>
      </div>

      {/* 看门狗提示条 */}
      {idleWarned && (
        <div className="px-6 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs flex-shrink-0">
          ⏳ 已 {idleSeconds}s 无新消息——模型可能在深度思考或网络不畅，可稍候或点「停止」
        </div>
      )}

      {/* 消息区 */}
      <div ref={(el) => { scrollRef.current = el; pull.containerRef.current = el }} className="flex-1 min-h-0 overflow-y-auto pl-[14px] pr-[18px] sm:px-6 py-4">
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
        ) : messages.length === 0 && !stream && !draftMsg ? welcome
          : (
            <div className="max-w-3xl w-full sm:mx-auto">
              <TurnList
                messages={normalMessages}
                streamingNode={stream ? (
                  <Message msg={{
                    id: '__streaming__', role: 'assistant',
                    text: stream.text + (stream.error ? `\n\n⚠️ ${stream.error}` : ''),
                    think: stream.think, tools: stream.tools, notes: stream.notes,
                    files: stream.files, images: stream.images, audios: stream.audios,
                    streaming: true,
                  }} />
                ) : draftMsg ? (
                  <div className="relative">
                    <div className="absolute -left-2 top-0 bottom-0 w-1 bg-amber-500/30 rounded-full" />
                    <div className="mb-2 flex items-center gap-2">
                      <div className="text-xs text-amber-400 font-medium">📝 未完成的回复（本地草稿，刷新不丢）</div>
                      <button
                        onClick={() => { deleteMessage(draftMsg!.id).then(() => setLocalMessages(prev => prev.filter(m => m.id !== draftMsg!.id))) }}
                        className="text-xs text-pi-dim hover:text-pi-text px-2 py-0.5 rounded border border-pi-border-soft hover:border-pi-border"
                      >丢弃</button>
                    </div>
                    <Message msg={draftMsg} />
                  </div>
                ) : undefined}
              />
            </div>
          )}
      </div>

      {/* 输入栏 */}
      {/* 危险操作确认浮层（dsh user-approval seam）：后端弹 confirm 事件时出现 */}
      {confirm && (
        <div className="absolute inset-0 z-[var(--pi-z-toast)] flex items-center justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto max-w-sm w-full rounded-pi-xl bg-pi-bg1 border border-pi-red/30 shadow-2xl p-5 anim-enter">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-pi-md bg-pi-red/15 text-pi-red flex items-center justify-center flex-shrink-0"><ShieldAlert className="w-4 h-4" /></div>
              <div>
                <div className="text-[13px] font-semibold text-pi-text">危险操作确认</div>
                <div className="text-[11px] text-pi-dim2 font-mono">{confirm.toolName || '工具'}</div>
              </div>
            </div>
            <div className="text-[12px] text-pi-dim leading-relaxed mb-3">{confirm.reason || '该操作需要你确认后才会执行。'}</div>
            {confirm.args?.command && (
              <pre className="bg-black/25 border border-pi-border-soft rounded-pi-md p-2.5 text-[11px] text-pi-dim font-mono whitespace-pre-wrap break-all max-h-28 overflow-auto mb-3">{confirm.args.command}</pre>
            )}
            <div className="flex gap-2">
              <button className="btn-tool text-xs flex-1" onClick={() => answerConfirm(false)}>拒绝</button>
              <button className="btn-primary text-xs flex-1 bg-pi-red/90 hover:bg-pi-red border-pi-red" onClick={() => answerConfirm(true)}>允许执行一次</button>
            </div>
          </div>
        </div>
      )}

      {/* 回到底部：用户上翻后出现（nomifun 同款交互） */}
      {!atBottom && (
        <button
          aria-label="回到底部"
          onClick={() => scroll(true)}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-pi-border bg-pi-bg1 text-[12px] text-pi-dim hover:text-pi-text glow-hover shadow-xl transition-colors duration-200 anim-fade touch-hit"
        >
          <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />
          回到底部
        </button>
      )}
      <div className="border-t border-pi-border bg-pi-bg1 px-4 sm:px-6 py-3 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <SendBox key={currentSessionId ?? 'none'} streaming={!!stream} onStop={stop} onSend={send} onCommand={runCommand}
            voiceBusy={voiceBusy} onVoice={handleVoice} onVoiceTextReady={fn => { voiceTextRef.current = fn }} />
        </div>
      </div>
    </div>
  )
}
