import type { Model, Session, ChatMessage, SessionMessages, Artifact } from './types'

// ── 鉴权 ──
let _token = (() => {
  try { return localStorage.getItem('pi_web_token') || '' } catch { return '' }
})()
let _apiBase = (() => {
  try { return localStorage.getItem('pi_api_base') || '' } catch { return '' }
})()

export function setToken(t: string) { _token = t; try { localStorage.setItem('pi_web_token', t) } catch {} }
export function getToken() { return _token }
export function setApiBase(b: string) { _apiBase = b; try { localStorage.setItem('pi_api_base', b) } catch {} }

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
    const r = await fetch(_apiBase + path, { ...opts, headers, signal: opts.signal || ctrl.signal })
    const ct = r.headers.get('content-type') || ''
    const data = ct.includes('json') ? await r.json() : null
    if (!r.ok) { const err = new Error((data && data.error) || `HTTP ${r.status}`); (err as any).status = r.status; throw err }
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
export const ChatApi = {
  // SSE 流式：返回 { writer, abort } ，onChunk 处理 delta/think/tool/note/finish
  send: (body: any, onEvent: (ev: { type: string; data: any }) => void) => {
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const r = await fetch(_apiBase + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_token}` },
          body: JSON.stringify({ ...body, stream: true }),
          signal: ctrl.signal,
        })
        if (!r.ok || !r.body) { onEvent({ type: 'error', data: { error: `HTTP ${r.status}` } }); return }
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
            // SSE event/data 解析（兼容带/不带空格前缀，与线上版一致）
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
        onEvent({ type: 'finish', data: {} })
      } catch (e: any) {
        if (e?.name !== 'AbortError') onEvent({ type: 'error', data: { error: e.message } })
      }
    })()
    return () => ctrl.abort()
  },
}

// 会话实时订阅（SSE，多端同步）
export function streamSession(sid: string, after = 0, onEvent: (ev: any) => void, onError?: () => void): () => void {
  let es: EventSource | null = null
  let closed = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const connect = () => {
    if (closed) return
    es = new EventSource(`${_apiBase}/api/sessions/${encodeURIComponent(sid)}/stream?after=${after}`)
    es.onmessage = (e: MessageEvent) => { try { onEvent(JSON.parse(e.data)) } catch {} }
    es.addEventListener('subscribed', (e: any) => { try { onEvent(JSON.parse(e.data)) } catch {} })
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

// ── 用量统计（按 provider/模型聚合）──
export interface ProviderStat { provider: string; input: number; output: number; cacheRead?: number; cost: number; messages: number }
export const StatsApi = {
  providers: () => api<{ providers: ProviderStat[] }>('/api/stats/providers'),
  global: () => api<any>('/api/stats/global'),
}

// ── 定时任务（时间引擎）──
export interface TimeTask { id: string; type: 'daily' | 'weekly' | 'once'; at: string; day?: number | null; date?: string | null; prompt: string; label: string; created: string; lastRun?: string | null; runs?: number }
export const TasksApi = {
  list: () => api<{ tasks: TimeTask[] }>('/api/time/tasks'),
  create: (body: { type: string; at: string; day?: number; date?: string; prompt: string; label?: string }) =>
    api<{ id?: string; error?: string }>('/api/time/tasks', { method: 'POST', body }),
  remove: (id: string) => api<{ removed: boolean }>(`/api/time/tasks?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
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
