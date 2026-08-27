import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { useApp } from '../store'
import { MessagesSquare, BrainCircuit, Wrench, FolderClosed, Plus, SquareTerminal, LayoutGrid, Command, ChevronDown, PanelRight, ShieldAlert } from 'lucide-react'
import { RefreshCw } from 'lucide-react'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { ChatApi, SessionsApi, AsrApi, EmotionApi, AgentStatusApi, streamSession, LingXiApi, ConfirmApi } from '../api'
import Message from './Message'
import SendBox from './SendBox'
import TurnList from './TurnList'
import { useAutoScroll } from '../hooks/useAutoScroll'
import { toast } from './Toast'
import { emoMeta, emoTooltip, type EmoMeta } from '../lib/emotion'
import type { FileAttachment } from './SendBox'
import type { ChatMessage, RunningTool } from '../types'
import WebglBackdrop from './WebglBackdrop'

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

export default function ChatArea({ compactHeader, rightPanel, onRightPanel }: {
  compactHeader?: boolean
  /** 右栏状态由 AppLayout 持有；传入则顶栏显示"右栏"开关（与状态胶囊并排，不再悬浮遮挡） */
  rightPanel?: string
  onRightPanel?: (p: any) => void
} = {}) {
  const { currentSessionId, currentModel, refreshSessions, selectSession } = useApp()
  const [stream, setStream] = useState<StreamState | null>(null)
  const [confirm, setConfirm] = useState<any>(null) // 危险操作待确认：{ id, toolName, reason, args, sessionId }
  const [idleSeconds, setIdleSeconds] = useState(0)
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

  // 移动端下拉刷新：重验证当前会话消息 + 会话列表（触屏才触发，桌面无 touch 事件）
  const pull = usePullToRefresh(async () => {
    await mutateMsgs()
    await refreshSessions()
  })
  const loading = !!msgKey && isLoading && !msgData

  // 本地乐观更新（发送/收尾/系统提示），不触发重验证
  const updateMessages = (fn: (prev: ChatMessage[]) => ChatMessage[]) => {
    if (!currentSessionId) return
    mutateMsgs(prev => ({ ...(prev || { messages: [] as ChatMessage[] }), messages: fn(prev?.messages || []) }), { revalidate: false })
  }

  const reload = () => { if (currentSessionId) mutateMsgs() }

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

  // 切会话：清空流式状态 + 拉取该会话的情绪快照（滚动状态由 useAutoScroll 按 sessionKey 自行重置）
  useEffect(() => { streamRef.current = null; setStream(null) }, [currentSessionId])
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

  const finalize = (model?: { provider: string; id: string }) => {
    // 本轮 SSE 结束（done/finish/error 均走到这）：用户消息已由引擎写入会话文件，清除前端防丢暂存
    try { localStorage.removeItem('pi_pending_msg') } catch {}
    const s = streamRef.current
    if (!s) return
    if (s.text || s.think || s.tools.length || s.files.length || s.images.length || s.audios.length || s.error) {
      updateMessages(prev => [...prev, {
        id: 'a' + Date.now(), role: 'assistant',
        text: s.text + (s.error ? `\n\n⚠️ ${s.error}` : ''),
        think: s.think, tools: s.tools, notes: s.notes,
        files: s.files, images: s.images, audios: s.audios,
        ts: new Date().toISOString(),
        ...(model ? { model } : {}),
      }])
    }
    streamRef.current = null
    setStream(null)
  }

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
      try { const d = await SessionsApi.create(); await refreshSessions(); selectSession(d.id); sid = d.id } catch { return }
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
    // 防 network error 丢消息改由前端 localStorage 暂存：发送前暂存，SSE done/error 收尾成功后清除；失败保留。
    let userMsgId = 'u' + Date.now();
    try { localStorage.setItem('pi_pending_msg', JSON.stringify({ sid, content, at: Date.now() })) } catch {}
    updateMessages(prev => [...prev, { id: userMsgId, role: 'user', text: content, ts: new Date().toISOString() }])
    streamRef.current = emptyStream()
    setStream({ ...streamRef.current })
    // 模型参数（ParamsPanel 存 localStorage，随请求带给 server）
    let params: { temperature?: number; top_p?: number } | undefined
    try { params = JSON.parse(localStorage.getItem('pi_params') || 'null') || undefined } catch {}
    abortRef.current = ChatApi.send({
      sessionId: sid, message: content,
      model: currentModel === 'auto/auto' ? undefined : currentModel,
      files: attachFiles.length ? attachFiles : undefined,
      params,
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
            return { ...p, tools: [...p.tools, { id: d.id || 't' + Date.now(), name: d.name || 'tool', argsText, output: '', running: true, status: 'running' }] }
          })
          break
        case 'tool_output':
          updStream(p => ({ ...p, tools: p.tools.map(t => t.id === d.id ? { ...t, output: t.output + (d.text || '') } : t) }))
          break
        case 'tool_end':
          updStream(p => ({ ...p, tools: p.tools.map(t => t.id === d.id ? { ...t, running: false, isError: !!d.isError, status: d.isError ? 'error' : 'completed', output: d.output || t.output } : t) }))
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
          // 服务端每轮结束推送真实情绪快照（VAD）——镜像展示，不可点改
          if (d.state && typeof d.state.valence !== 'undefined') setEmo({ state: d.state, meta: emoMeta(d.state) })
          break
        case 'confirm':
          // 危险操作待确认：弹确认框（dsh user-approval seam）
          setConfirm({ id: d.id, toolName: d.toolName, reason: d.reason, args: d.args || {}, sessionId: d.sessionId || '' })
          break
        case 'done':
        case 'finish':
          finalize(d.model)
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
    updStream(p => ({ ...p, error: p.error || '已手动停止', tools: p.tools.map(t => t.status === 'running' ? { ...t, status: 'canceled' } : t) }))
    finalize()
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
      <WebglBackdrop className="absolute inset-0" dim={0.12} />
      <div className="relative z-10 text-center max-w-lg anim-enter">
        <div className="w-16 h-16 mx-auto rounded-pi-xl bg-gradient-to-br from-pi-accent via-pi-accent2 to-purple-400 flex items-center justify-center text-3xl font-bold text-white mb-5 anim-enter" style={{ boxShadow: '0 8px 28px color-mix(in oklab, var(--pi-accent) 22%, transparent)' }}>语</div>
        <div className="text-[22px] font-extrabold text-pi-text mb-1.5 tracking-tight anim-enter anim-enter-delay-1">小语 · AI 工作台</div>
        <div className="text-pi-dim mb-7 text-[13px] anim-enter anim-enter-delay-2">基于 pi 引擎的 AI 工作伙伴 · 从一个动作开始</div>
        <div className="grid grid-cols-2 gap-2.5 max-w-md mx-auto text-left anim-enter anim-enter-delay-3">
          {[
            { Icon: Plus, label: '新建会话', desc: '开一段新对话', act: newSession, chip: 'chip-blue', c: 'text-pi-accent2' },
            { Icon: SquareTerminal, label: '终端 REPL', desc: '写代码调工具', act: () => openPanel('terminal'), chip: 'chip-green', c: 'text-emerald-300' },
            { Icon: LayoutGrid, label: '模型中心', desc: '浏览与切换模型', act: () => { location.hash = '#/models' }, chip: 'chip-violet', c: 'text-purple-300' },
            { Icon: Command, label: '命令面板', desc: 'Ctrl / ⌘ + K', act: () => window.dispatchEvent(new CustomEvent('pi-open-palette')), chip: 'chip-amber', c: 'text-amber-300' },
          ].map((f) => (
            <button key={f.label} onClick={f.act}
              className={`rounded-pi-lg border px-4 py-3 transition-colors duration-200 cursor-pointer press anim-enter text-left accent-soft ${f.chip}`} style={{ animationDelay: '0.12s' }}>
              <f.Icon className={`w-[18px] h-[18px] mb-1.5 ${f.c}`} strokeWidth={1.8} />
              <div className="text-[13px] font-semibold text-pi-text">{f.label}</div>
              <div className="text-[11px] text-pi-dim2">{f.desc}</div>
            </button>
          ))}
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
  const busyFromBackground = !stream && remoteBusy === 'other'
  // 四色语义：绿=就绪 红=本页执行 橙=后台执行 品红闪=异常（看颜色一眼明白）
  const dotCls = agentStatus === 'busy' ? (busyFromBackground ? 'status-dot-bg' : 'status-dot-busy') : `status-dot-${agentStatus}`
  const liveCls = agentStatus === 'busy' ? (busyFromBackground ? 'status-pill-live-bg' : 'status-pill-live-busy') : agentStatus === 'error' ? 'status-pill-live-error' : ''

  return (
    <div className="relative flex-1 flex flex-col min-w-0 min-h-0"
      style={{ background: 'color-mix(in oklab, var(--pi-bg) 45%, transparent)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
      {/* 下拉刷新指示器（移动端触屏；锚定头部下方，平时 opacity:0 不占位） */}
      <div aria-hidden
        className="pointer-events-none absolute z-[var(--pi-z-toast)] left-1/2 -translate-x-1/2 top-[52px] w-9 h-9 rounded-full border border-pi-border bg-pi-bg1/90 backdrop-blur-xl shadow-xl grid place-items-center"
        style={pull.indicatorStyle}>
        <RefreshCw className={`w-4 h-4 text-pi-dim ${pull.spin ? 'animate-spin' : ''}`} strokeWidth={2} />
      </div>
      {/* 顶栏 */}
      <div className="flex items-center px-5 h-12 border-b border-pi-border-soft glass flex-shrink-0 gap-2">
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
        ) : messages.length === 0 && !stream ? welcome
          : (
            <div className="max-w-3xl w-full">
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
      {/* 危险操作确认浮层（dsh user-approval seam）：后端弹 confirm 事件时出现 */}
      {confirm && (
        <div className="absolute inset-0 z-[var(--pi-z-toast)] flex items-center justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto max-w-sm w-full rounded-pi-xl bg-pi-bg1/95 backdrop-blur-xl border border-pi-red/30 shadow-2xl p-5 anim-enter">
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
          className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-pi-border bg-pi-bg1/90 backdrop-blur-xl text-[12px] text-pi-dim hover:text-pi-text glow-hover shadow-xl transition-colors duration-200 anim-fade touch-hit"
        >
          <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />
          回到底部
        </button>
      )}
      <div className="border-t border-pi-border-soft glass px-4 sm:px-6 py-2.5 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <SendBox key={currentSessionId ?? 'none'} streaming={!!stream} onStop={stop} onSend={send} onCommand={runCommand}
            voiceBusy={voiceBusy} onVoice={handleVoice} onVoiceTextReady={fn => { voiceTextRef.current = fn }} />
        </div>
      </div>
    </div>
  )
}
