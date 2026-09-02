import type { Model, Session, ChatMessage, SessionMessages, Artifact } from './types'
import { parseSseBlocks, type RunEvent, type RunStatus } from './lib/run-events'

// ── 鉴权 ──
let _token = (() => {
  try { return localStorage.getItem('pi_web_token') || '' } catch { return '' }
})()
let _apiBase = (() => {
  try { return localStorage.getItem('pi_api_base') || '' } catch { return '' }
})()

export function setToken(t: string) { _token = t; try { localStorage.setItem('pi_web_token', t) } catch {} }
export function getToken() { return _token }
export function setApiBase(b: string) { _apiBase = b.replace(/\/+$/, ''); try { localStorage.setItem('pi_api_base', _apiBase) } catch {} }
export function getApiBase() { return _apiBase.replace(/\/+$/, '') }

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const base = getApiBase()
  if (!base) return path
  return `${base}/${path.replace(/^\/+/, '')}`
}

export function webSocketUrl(path: string): string {
  const base = getApiBase()
  if (/^wss?:\/\//i.test(path)) return path
  if (base) {
    const httpBase = base.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')
    return `${httpBase}/${path.replace(/^\/+/, '')}`
  }
  const protocol = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = typeof location !== 'undefined' ? location.host : ''
  return `${protocol}//${host}/${path.replace(/^\/+/, '')}`
}

// 文件 URL 补 token（<img>/<audio>/<video> 标签带不了 Authorization 头，服务端 checkAuth 接受 ?token=）
export function withFileToken(url: string): string {
  if (!url || !url.includes('/api/ws/file') || url.includes('sig=') || url.includes('token=')) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${apiUrl(url)}${sep}token=${encodeURIComponent(_token)}`
}

const TIMEOUT = 30000

export async function api<T = any>(path: string, opts: any = {}): Promise<T> {
  const headers: any = { ...(opts.headers || {}), Authorization: `Bearer ${_token}` }
  if (opts.body && typeof opts.body === 'object') {
    headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(opts.body)
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error('请求超时')), opts.timeoutMs || TIMEOUT)
  try {
    const r = await fetch(apiUrl(path), { ...opts, headers, signal: opts.signal || ctrl.signal })
    const ct = r.headers.get('content-type') || ''
    const data = ct.includes('json') ? await r.json() : null
    if (!r.ok) {
      // 401 = 令牌失效/无效：广播全局事件，store 踢回登录页（消除“幽灵登录态”）
      if (r.status === 401) { try { window.dispatchEvent(new Event('pi-unauthorized')) } catch {} }
      // error 可能是字符串或对象（如 code/run 的 {kind, message}）——统一转成可读字符串
      let emsg: string
      if (data && typeof data.error === 'string') emsg = data.error
      else if (data && data.error && typeof data.error === 'object') emsg = (data.error.message ? `[${data.error.kind || 'error'}] ` : '') + (data.error.message || JSON.stringify(data.error))
      else emsg = `HTTP ${r.status}`
      const err = new Error(emsg); (err as any).status = r.status; throw err
    }
    return data as T
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('请求超时')
    throw e
  } finally { clearTimeout(timer) }
}

// ── 端点封装 ──
export const ModelsApi = {
  list: () => api<{ models: Model[]; current: { provider: string; id: string } | null; autoDefault?: boolean; cwd: string; tools: string[] }>('/api/models'),
}
export const SessionsApi = {
  list: () => api<{ sessions: Session[] }>('/api/sessions'),
  create: (name?: string) => api<{ id: string; name: string }>('/api/sessions', { method: 'POST', body: { name } }),
  messages: (sid: string) => api<SessionMessages>(`/api/sessions/${encodeURIComponent(sid)}/messages`),
  rename: (sid: string, name: string) => api<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(sid)}/rename`, { method: 'POST', body: { name } }),
  remove: (sid: string) => api<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(sid)}`, { method: 'DELETE' }),
  stats: (sid: string) => api<any>(`/api/sessions/${encodeURIComponent(sid)}/stats`),
  export: (sid: string, format = 'html') => api<any>(`/api/sessions/${encodeURIComponent(sid)}/export?format=${format}`),
}
export const MessagesApi = {
  add: (sid: string, text: string) => api<{ ok: boolean; id: string }>(`/api/sessions/${encodeURIComponent(sid)}/messages`, { method: 'POST', body: { text } }),
}
export interface RunInfo {
  id: string
  sessionId: string
  status: RunStatus
  lastSeq: number
  [key: string]: any
}

export const RunsApi = {
  create: (body: any) => api<{ runId: string; sessionId: string; status: RunStatus; lastSeq: number }>('/api/runs', {
    method: 'POST', body: { ...body, stream: true }, timeoutMs: 30_000,
  }),
  get: (runId: string) => api<RunInfo>(`/api/runs/${encodeURIComponent(runId)}`),
  stop: (runId: string) => api<RunInfo>(`/api/runs/${encodeURIComponent(runId)}/stop`, { method: 'POST' }),
  stream: (
    runId: string,
    after: number,
    onEvent: (event: RunEvent) => void,
    onError?: (error: Error) => void,
    onEnd?: () => void,
  ) => {
    let closed = false
    let cursor = after
    let ctrl: AbortController | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const connect = async () => {
      if (closed) return
      ctrl = new AbortController()
      try {
        const response = await fetch(apiUrl(`/api/runs/${encodeURIComponent(runId)}/events?after=${cursor}`), {
          headers: { Authorization: `Bearer ${_token}`, 'Last-Event-ID': String(cursor) },
          signal: ctrl.signal,
        })
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (!closed) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parsed = parseSseBlocks(buffer)
          buffer = parsed.rest
          for (const event of parsed.events) {
            if (event.seq <= cursor) continue
            cursor = event.seq
            onEvent(event)
          }
        }
        if (!closed) onEnd?.()
      } catch (error: any) {
        if (closed || error?.name === 'AbortError') return
        onError?.(error instanceof Error ? error : new Error(String(error)))
      }
      if (!closed && !retryTimer) {
        retryTimer = setTimeout(() => { retryTimer = null; connect() }, 1500)
      }
    }

    connect()
    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      ctrl?.abort()
    }
  },
}

// 会话实时订阅（SSE，多端同步）
export function streamSession(sid: string, after = 0, onEvent: (ev: any) => void, onError?: () => void): () => void {
  let es: EventSource | null = null
  let closed = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const connect = () => {
    if (closed) return
    es = new EventSource(apiUrl(`/api/sessions/${encodeURIComponent(sid)}/stream?after=${after}&token=${encodeURIComponent(_token)}`))
    es.onmessage = (e: MessageEvent) => { try { onEvent(JSON.parse(e.data)) } catch {} }
    const onNamedEvent = (e: Event) => { try { onEvent(JSON.parse((e as MessageEvent).data)) } catch {} }
    es.addEventListener('subscribed', onNamedEvent)
    es.addEventListener('session_updated', onNamedEvent)
    // 断线恢复：EventSource 原生会重连，但连接失败/服务重启时可能终化——监听 error 兜底重连
    es.onerror = () => {
      onError?.()
      es?.close()
      if (!closed && !retryTimer) {
        retryTimer = setTimeout(() => { retryTimer = null; connect() }, 5000)
      }
    }
  }
  connect()
  return () => { closed = true; if (retryTimer) clearTimeout(retryTimer); es?.close() }
}

// ── 语音转文字（录音 → 文本，后端走 mimo-v2.5-asr 免费通道）──
export const AsrApi = {
  transcribe: (data: string, format: string) =>
    api<{ text: string; model: string }>("/api/asr", { method: "POST", body: { data, format }, timeoutMs: 130000 }),
}
// 情绪快照（服务端 VAD 情绪引擎；返回裸快照，SSE emotion 事件则包在 {state} 里）
export const EmotionApi = {
  get: (sid?: string) => api<any>(`/api/emotion${sid ? `?session=${encodeURIComponent(sid)}` : ''}`),
}
// 全局执行状态：哪些会话的 agent 正在跑（状态灯轮询，含后台/他端发起）
export const AgentStatusApi = {
  get: () => api<{ busy: { id: string; since: number | null }[]; anyBusy: boolean }>('/api/agent-status'),
}

// 小语活动事件流（对标 vanilla 活动面板）
export interface AgentEvent { type: string; ts: string | number; data?: { tool?: string; text?: string; [k: string]: unknown } }
export const AgentEventsApi = {
  get: () => api<{ events: AgentEvent[] }>('/api/agent/events'),
}

// ── 危险操作确认（dsh user-approval seam）：后端弹确认事件 → 前端回传结果 ──
export const ConfirmApi = {
  answer: (sessionId: string, id: string, ok: boolean) =>
    api<{ ok: boolean; outcome: string }>('/api/agent/confirm', { method: 'POST', body: { sessionId, id, ok }, timeoutMs: 8000 }),
}

// ── 灵犀：双向灵感池（user/xiaoyu 分源记录）──
export interface LingXiEntry {
  id: string
  source: LingXiSource
  text: string
  status: 'new' | 'adopted' | 'archived'
  note: string
  ts: string
}
export type LingXiSource = 'user' | 'xiaoyu'
export const LingXiApi = {
  list: (filter?: { source?: LingXiSource; status?: string }) => {
    const q = new URLSearchParams()
    if (filter?.source) q.set('source', filter.source)
    if (filter?.status) q.set('status', filter.status)
    const qs = q.toString()
    return api<{ entries: LingXiEntry[] }>('/api/lingxi' + (qs ? '?' + qs : ''))
  },
  add: (body: { text: string; source: LingXiSource }) =>
    api<{ ok: boolean; entry: LingXiEntry }>('/api/lingxi', { method: 'POST', body }),
  setStatus: (id: string, status: 'new' | 'adopted' | 'archived', note?: string) =>
    api<{ ok: boolean; entry: LingXiEntry }>(`/api/lingxi/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status, note } }),
  remove: (id: string) => api<{ ok: boolean }>(`/api/lingxi/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

// ── 主题偏好跨端同步（08-26：一端更新，各端打开拉取一致）──
export const ThemeApi = {
  get: () => api<{ theme: string; accent: string; wallpaper: string }>('/api/theme-prefs'),
  save: (theme: string, accent: string, wallpaper: string = '') =>
    api<{ theme: string; accent: string; wallpaper: string }>('/api/theme-prefs', { method: 'POST', body: { theme, accent, wallpaper } }),
}

// ── 出图（自动落盘生成物/图片/日期，资产库联动）──
export const MediaApi = {
  image: (body: { provider: string; modelId: string; prompt: string; size?: string }) =>
    api<{ image?: string; error?: string }>('/api/image', { method: 'POST', body, timeoutMs: 190000 }),
}

// ── 专项工作台（SSE 长任务：PPT/小说生成，事件 note/delta/file/done/error）──
export const WorkshopApi = {
  run: (kind: 'ppt' | 'novel', body: any, onEvent: (ev: { type: string; data: any }) => void) => {
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const r = await fetch(apiUrl(`/api/workshop/${kind}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_token}` },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        })
        if (!r.ok || !r.body) { onEvent({ type: 'error', data: { message: `HTTP ${r.status}` } }); return }
        const reader = r.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let idx
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const chunk = buffer.slice(0, idx); buffer = buffer.slice(idx + 2)
            let evType = 'message'; const dataLines: string[] = []
            for (const line of chunk.split('\n')) {
              if (line.startsWith('event:')) evType = line.slice(6).trim()
              else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
            }
            const evData = dataLines.join('\n')
            if (!evData) continue
            try { onEvent({ type: evType, data: JSON.parse(evData) }) } catch {}
          }
        }
        onEvent({ type: 'done', data: {} })
      } catch (e: any) {
        if (e?.name !== 'AbortError') onEvent({ type: 'error', data: { message: e.message } })
      }
    })()
    return () => ctrl.abort()
  },
}

// ── 小说工坊（书架式：作品沉淀/真相文件/第N章递进）──
export interface NovelBook { id: string; title: string; genre: string; protagonist?: string; status?: string; narrator?: string; chapters: number; createdAt?: string }
export interface NovelChapter { file: string; no: number; size: number; mtimeMs: number }
export const NovelApi = {
  books: () => api<{ books: NovelBook[] }>('/api/novel/books'),
  create: (body: { title: string; genre: string; protagonist?: string; setting?: string; narrator?: string }) =>
    api<{ ok?: boolean; id?: string; error?: string }>('/api/novel/books', { method: 'POST', body }),
  detail: (id: string) =>
    api<{ id: string; meta?: any; chapters: NovelChapter[]; truth?: any; nextCh: number; error?: string }>(`/api/novel/detail?id=${encodeURIComponent(id)}`),
  chapter: (id: string, file: string) =>
    api<{ ok?: boolean; file: string; content: string; error?: string }>(`/api/novel/chapter?id=${encodeURIComponent(id)}&file=${encodeURIComponent(file)}`),
  write: (body: { id: string; outline?: string }, onEvent: (ev: { type: string; data: any }) => void) => {
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const r = await fetch(apiUrl('/api/novel/write'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_token}` },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        })
        if (!r.ok || !r.body) { onEvent({ type: 'error', data: { message: `HTTP ${r.status}` } }); return }
        const reader = r.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() || ''
          for (const chunk of chunks) {
            let ev = '', data = ''
            for (const line of chunk.split('\n')) {
              if (line.startsWith('event:')) ev = line.slice(6).trim()
              else if (line.startsWith('data:')) data += line.slice(5).trim()
            }
            if (ev && data) { try { onEvent({ type: ev, data: JSON.parse(data) }) } catch {} }
          }
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') onEvent({ type: 'error', data: { message: String(e?.message || e) } })
      }
    })()
    return () => ctrl.abort()
  },
}

// ── 代码模式（终端面板）──
export interface CodeBinding { name: string; args?: any; description: string }
export const CodeApi = {
  tools: () => api<{ bindings: CodeBinding[]; sdk: string }>('/api/code/tools'),
  run: (program: string, timeoutMs?: number) =>
    api<{ value?: any; logs?: string[]; error?: { kind: string; message: string } }>('/api/code/run', { method: 'POST', body: { program, timeoutMs }, timeoutMs: 130000 }),
}

// ── 应用中心 ──
export const RefineApi = {
  list: () => api<{ pending: any[]; applied: any[]; rejected: any[] }>('/api/refine/list'),
  status: () => api<{ counts: { pending: number; applied: number; rejected: number }; lastLog?: string | null }>('/api/refine/status'),
  plan: () => api<any>('/api/refine/plan', { method: 'POST', body: {}, timeoutMs: 190000 }),
  approve: (id: string) => api<any>('/api/refine/approve', { method: 'POST', body: { id }, timeoutMs: 60000 }),
  reject: (id: string) => api<any>('/api/refine/reject', { method: 'POST', body: { id } }),
}
export const SkillsApi = {
  list: () => api<{ skills: { name: string; description: string; location: string }[] }>('/api/skills'),
}
export const PromptsApi = {
  list: () => api<{ prompts: { name: string; description: string; content: string }[] }>('/api/prompts'),
}
export const ImprovementsApi = {
  list: () => api<{ improvements: any[] }>('/api/improvements'),
  analyze: () => api<{ improvements: any[] }>('/api/improvements/analyze', { method: 'POST' }),
  setStatus: (id: string, status: string) => api<any>(`/api/improvements/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status } }),
}
// ── 记忆园丁：只报告记忆健康（重复/过时状态/膨胀），不自动写 ──
export const MemoryApi = {
  gardener: () => api<any>('/api/memory-gardener'),
  report: () => api<any>('/api/memory-gardener'),
  markReviewed: (kind: string, key: string, unmark = false) =>
    api<{ ok: boolean }>('/api/memory-gardener/reviewed', { method: 'POST', body: { kind, key, unmark } }),
  dedupe: () => api<{ ok: boolean; removed: number; backup: string | null }>('/api/memory-gardener/dedupe', { method: 'POST' }),
}

// ── 系统面板：说明 / 检测更新 ──
export const SystemApi = {
  info: () => api<any>('/api/system/info'),
  checkUpdate: () => api<any>('/api/system/check-update'),
  saveNetwork: (body: { domains: { domain: string; desc: string }[] }) =>
    api<{ ok: boolean; domains: { domain: string; desc: string }[] }>('/api/system/network', { method: 'POST', body }),
}

// ── 引擎面板（旧版引入：组件实现 / 插件注册表 / 动态注册 / /api/engine/chat）──
export const EngineApi = {
  status: () => api<any>('/api/engine/status'),
  tools: () => api<{ tools: { name: string; description: string }[]; count: number; dsh: boolean; skill: boolean }>('/api/engine/tools'),
  registerPlugin: (def: any) => api<any>('/api/engine/plugins/register', { method: 'POST', body: def }),
  unregisterPlugin: (id: string) => api<any>('/api/engine/plugins/unregister', { method: 'POST', body: { id } }),
}

// ── 用量统计（按 provider/模型聚合）──
export interface ProviderStat { provider: string; input: number; output: number; cacheRead?: number; cost: number; messages: number }
export const StatsApi = {
  providers: () => api<{ providers: ProviderStat[] }>('/api/stats/providers'),
  global: () => api<any>('/api/stats/global'),
}

// ── 定时任务（时间引擎）──
export interface TimeTask { id: string; type: 'daily' | 'weekly' | 'once'; at: string; day?: number | null; date?: string | null; prompt: string; label: string; created: string; lastRun?: string | null; runs?: number; state?: string; running?: boolean; history?: { queueId: string; startedAt: string; durationMs: number; status: string; result: string }[] }
export const TasksApi = {
  list: () => api<{ tasks: TimeTask[] }>('/api/time/tasks'),
  create: (body: { type: string; at: string; day?: number; date?: string; prompt: string; label?: string }) =>
    api<{ id?: string; error?: string }>('/api/time/tasks', { method: 'POST', body }),
  remove: (id: string) => api<{ removed: boolean }>(`/api/time/tasks?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // 任务中心 v2：状态机 / 手动执行 / 运行历史
  setState: (id: string, action: 'pause' | 'resume' | 'archive') =>
    api<{ ok?: boolean; state?: string; error?: string }>('/api/time/tasks', { method: 'PATCH', body: { id, action } }),
  runNow: (id: string) => api<{ ok?: boolean; queueId?: string; error?: string }>('/api/time/tasks/run', { method: 'POST', body: { id } }),
  stopRun: (id: string) => api<{ stopped?: boolean; error?: string }>('/api/time/tasks/stop', { method: 'POST', body: { id } }),
  history: (id: string) => api<{ history: { queueId: string; startedAt: string; durationMs: number; status: string; result: string }[] }>(`/api/time/tasks/history?id=${encodeURIComponent(id)}`),
}

// ── 工作空间 ──
export const WsApi = {
  tree: (p = '') => api<{ items: { name: string; type: string; path: string }[]; current: string }>(`/api/ws/tree?path=${encodeURIComponent(p)}`),
  read: (p: string) => api<{ content: string; name: string; path: string }>(`/api/ws/read?path=${encodeURIComponent(p)}`),
  write: (path: string, content: string) => api<{ ok: boolean }>('/api/ws/write', { method: 'POST', body: { path, content } }),
  search: (q: string) => api<{ results?: any[] }>(`/api/ws/search?q=${encodeURIComponent(q)}`),
  artifacts: () => api<{ artifacts: Artifact[] }>('/api/ws/artifacts'),
  deliveries: () => api<{ deliveries?: any[] }>('/api/ws/deliveries'),
  // 交付：把工作空间文件复制到 交付/ 目录（版本化）
  deliver: (sourcePath: string, name?: string) => api<{ ok: boolean; path: string; version: number }>('/api/ws/deliver', { method: 'POST', body: { sourcePath, name } }),
  // 上传：base64 写入工作空间并推送到会话（sessionId 可空）
  upload: (name: string, data: string, sessionId?: string) => api<{ ok?: boolean; path?: string }>('/api/files/upload', { method: 'POST', body: { name, data, sessionId: sessionId || '' }, timeoutMs: 120000 }),
}

// ── 模型管理 ──
export const KeysApi = {
  manage: () => api<any>('/api/models/manage'),
  presets: () => api<any>('/api/keys/presets'),
  status: () => api<any>('/api/keys/status'),
  apply: (body: any) => api<any>('/api/keys/apply', { method: 'POST', body }),
  add: (body: any) => api<any>('/api/models/add', { method: 'POST', body }),
  remove: (provider: string) => api<any>('/api/models/remove', { method: 'POST', body: { provider } }),
  switchModel: (body: any) => api<any>('/api/model', { method: 'POST', body }),
}
