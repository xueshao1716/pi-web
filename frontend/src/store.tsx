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
  const [currentModel, setCurModel] = useState('auto/auto')
  const [currentSessionId, setCurSid] = useState<string | null>(null)

  // ── swr 数据层：缓存 + 窗口聚焦重验证 + 断线重连后自动刷新 ──
  const { data: modelsData } = useSWR(authed ? 'models' : null, fetchers.models, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 5000,
    onErrorRetry: (retry) => setTimeout(retry, 8000),
  })
  const { data: sessionsData } = useSWR(authed ? 'sessions' : null, fetchers.sessions, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 3000,
    onErrorRetry: (retry) => setTimeout(retry, 8000),
  })
  const models: Model[] = modelsData?.models || []
  const cwd: string = modelsData?.cwd || ''
  const sessions: Session[] = sessionsData?.sessions || []

  const refreshModels = useCallback(async () => { await globalMutate('models') }, [])
  const refreshSessions = useCallback(async () => { await globalMutate('sessions') }, [])

  // 服务端当前模型 → 本地选择（仅初始化时同步一次，之后以本地选择为准）
  useEffect(() => {
    if (modelsData?.current && currentModel === 'auto/auto') {
      setCurModel(`${modelsData.current.provider}/${modelsData.current.id}`)
    }
  }, [modelsData?.current]) // eslint-disable-line

  const login = useCallback(async (tk: string, apiBase?: string) => {
    setToken(tk); if (apiBase) { try { localStorage.setItem('pi_api_base', apiBase) } catch {} }
    setT(tk); setAuthed(true)
  }, [])

  const logout = useCallback(() => {
    try { localStorage.removeItem('pi_web_token') } catch {}
    setT(''); setAuthed(false); setCurSid(null)
    globalMutate('sessions', undefined, { revalidate: false })
    globalMutate('models', undefined, { revalidate: false })
  }, [])

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
    setCurrentModel: (mk) => setCurModel(mk),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useApp = () => useContext(Ctx)
