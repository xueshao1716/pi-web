import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { ModelsApi, SessionsApi, setToken, getToken } from './api'
import type { Model, Session } from './types'

interface AppState {
  authed: boolean
  token: string
  models: Model[]
  currentModel: string // "provider/id" or "auto/auto"
  cwd: string
  sessions: Session[]
  currentSessionId: string | null
  login: (token: string, apiBase?: string) => Promise<void>
  logout: () => void
  refreshModels: () => Promise<void>
  refreshSessions: () => Promise<void>
  selectSession: (sid: string | null) => void
  setCurrentModel: (mk: string) => void
}

const Ctx = createContext<AppState>(null as any)

// swr fetcher：key 即 API 路径别名（'models' / 'sessions'）
const fetchers = {
  models: () => ModelsApi.list(),
  sessions: () => SessionsApi.list(),
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [token, setT] = useState(getToken())
  const [authed, setAuthed] = useState(!!getToken())
  const [currentModel, setCurModel] = useState(() => { try { return localStorage.getItem('pi_model') || 'auto/auto' } catch { return 'auto/auto' } })
  const [currentSessionId, setCurSid] = useState<string | null>(null)

  // ── SWR 数据层：初次加载后保持稳定，避免手机回到前台时整页闪屏。
  // 模型和会话的变更由明确动作（新建/删除/结束任务）调用 refresh* 同步。
  const { data: modelsData } = useSWR(authed ? 'models' : null, fetchers.models, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 5000,
    onErrorRetry: (retry) => setTimeout(retry, 8000),
  })
  const { data: sessionsData } = useSWR(authed ? 'sessions' : null, fetchers.sessions, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 3000,
    onErrorRetry: (retry) => setTimeout(retry, 8000),
  })
  const models: Model[] = modelsData?.models || []
  const cwd: string = modelsData?.cwd || ''
  const sessions: Session[] = sessionsData?.sessions || []

  const refreshModels = useCallback(async () => { await globalMutate('models') }, [])
  const refreshSessions = useCallback(async () => { await globalMutate('sessions') }, [])

  // 服务端当前模型 → 本地选择（仅在无本地偏好时同步，之后以本地为准）
  useEffect(() => {
    if (modelsData?.current && currentModel === 'auto/auto') {
      const mk = `${modelsData.current.provider}/${modelsData.current.id}`
      setCurModel(mk)
      try { localStorage.setItem('pi_model', mk) } catch {}
    }
  }, [modelsData?.current]) // eslint-disable-line

  // 模型存在性校验：本地选的模型若已下架/被清理(不在当前模型列表) → 回退服务端默认并提示。
  // 否则输入框显示 A、实际静默降级跑 B（显示与实发不一致）
  useEffect(() => {
    const list: Model[] = modelsData?.models || []
    if (!list.length || currentModel === 'auto/auto') return
    const idx = currentModel.indexOf('/')
    const exists = list.some(m => m.provider === currentModel.slice(0, idx) && m.id === currentModel.slice(idx + 1))
    if (!exists && modelsData?.current) {
      const mk = `${modelsData.current.provider}/${modelsData.current.id}`
      setCurModel(mk)
      try { localStorage.setItem('pi_model', mk) } catch {}
      // 惰性 import 避免循环依赖（Toast→store）
      import('./components/Toast').then(({ toast }) => toast(`原模型 ${currentModel} 已不可用，已切换为 ${mk}`, 'error'))
    }
  }, [modelsData, currentModel])

  const login = useCallback(async (tk: string, apiBase?: string) => {
    // 先服务端真验证再放行（修「输错 token 也进主界面」的幽灵登录态）；用原生 fetch 不走 api()，避免触发全局 401 踢出
    const base = (apiBase || (() => { try { return localStorage.getItem('pi_api_base') || '' } catch { return '' } })()).replace(/\/+$/, '')
    const ctrl = new AbortController(); const tmo = setTimeout(() => ctrl.abort(), 8000)
    try {
      const r = await fetch(base + '/api/models', { headers: { Authorization: `Bearer ${tk}` }, signal: ctrl.signal })
      if (r.status === 401) { const e: any = new Error('令牌无效'); e.status = 401; throw e }
      if (!r.ok) { const e: any = new Error('服务无响应 (HTTP ' + r.status + ')'); e.status = r.status; throw e }
    } catch (e: any) {
      if (e?.name === 'AbortError') { const x: any = new Error('连接超时'); x.status = 0; throw x }
      throw e
    } finally { clearTimeout(tmo) }
    setToken(tk); if (apiBase) { try { localStorage.setItem('pi_api_base', apiBase) } catch {} }
    setT(tk); setAuthed(true)
  }, [])


  const logout = useCallback(() => {
    try { localStorage.removeItem('pi_web_token') } catch {}
    setT(''); setAuthed(false); setCurSid(null)
    globalMutate('sessions', undefined, { revalidate: false })
    globalMutate('models', undefined, { revalidate: false })
  }, [])

  // 全局 401 踢出：主界面里任何接口鉴权失败 → 清令牌回登录页（幽灵态不可停留）
  useEffect(() => {
    const onUn = () => { if (getToken()) logout() }
    window.addEventListener('pi-unauthorized', onUn)
    return () => window.removeEventListener('pi-unauthorized', onUn)
  }, [logout])

  // 首次登录后自动恢复上次会话
  useEffect(() => {
    if (!authed) return
    setToken(token)
    ;(async () => {
      const last = (() => { try { return localStorage.getItem('pi_last_session') } catch { return null } })()
      try {
        const d = await fetchers.sessions()
        await globalMutate('sessions', d, { revalidate: false })
        if (last && (d.sessions || []).some((s: Session) => s.id === last)) setCurSid(prev => prev ?? last)
      } catch {}
    })()
  }, [authed]) // eslint-disable-line

  const value: AppState = {
    authed, token, models, currentModel, cwd, sessions, currentSessionId,
    login, logout, refreshModels, refreshSessions,
    selectSession: (sid) => { setCurSid(sid); if (sid) { try { localStorage.setItem('pi_last_session', sid) } catch {} } },
    setCurrentModel: (mk) => { setCurModel(mk); try { localStorage.setItem('pi_model', mk) } catch {} },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useApp = () => useContext(Ctx)
