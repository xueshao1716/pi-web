import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [token, setT] = useState(getToken())
  const [authed, setAuthed] = useState(!!getToken())
  const [models, setModels] = useState<Model[]>([])
  const [currentModel, setCurModel] = useState('auto/auto')
  const [cwd, setCwd] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurSid] = useState<string | null>(null)

  const refreshModels = useCallback(async () => {
    try {
      const d = await ModelsApi.list()
      setModels(d.models || [])
      setCwd(d.cwd || '')
      if (d.current) setCurModel(`${d.current.provider}/${d.current.id}`)
    } catch {}
  }, [])

  const refreshSessions = useCallback(async () => {
    try {
      const d = await SessionsApi.list()
      setSessions(d.sessions || [])
    } catch {}
  }, [])

  const login = useCallback(async (tk: string, apiBase?: string) => {
    setToken(tk); if (apiBase) { try { localStorage.setItem('pi_api_base', apiBase) } catch {} }
    setT(tk); setAuthed(true)
    await refreshModels(); await refreshSessions()
  }, [refreshModels, refreshSessions])

  const logout = useCallback(() => {
    try { localStorage.removeItem('pi_web_token') } catch {}
    setT(''); setAuthed(false); setSessions([]); setCurSid(null)
  }, [])

  // 首次登录后自动恢复上次会话
  useEffect(() => {
    if (!authed) return
    setToken(token)
    ;(async () => {
      await refreshModels(); await refreshSessions()
      const last = (() => { try { return localStorage.getItem('pi_last_session') } catch { return null } })()
      if (last && sessions.some(s => s.id === last)) setCurSid(last)
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
