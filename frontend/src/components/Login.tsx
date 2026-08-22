import { useState } from 'react'
import { useApp } from '../store'

export default function Login() {
  const { login } = useApp()
  const [apiBase, setApiBase] = useState('')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    const tk = token.trim(); if (!tk) return
    setLoading(true); setErr('')
    try { await login(tk, apiBase.trim()) }
    catch (e: any) { setErr(e?.status === 401 ? '令牌无效' : '连接失败：' + (e?.message || e)) }
    finally { setLoading(false) }
  }

  return (
    <div className="h-screen flex items-center justify-center" style={{ background: 'radial-gradient(1100px 550px at 50% -10%, #171b2e 0%, var(--pi-bg) 60%)' }}>
      <div className="panel w-88 p-10">
        <div className="text-center mb-6">
          <div className="text-4xl font-black text-pi-accent tracking-tight mb-1">◈ 小语</div>
          <div className="text-pi-dim text-sm">· AI 工作台</div>
        </div>
        <input className="input-pi mb-3" placeholder="服务器地址（留空=本机）" value={apiBase} onChange={e => setApiBase(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        <input className="input-pi mb-4" type="password" placeholder="访问令牌" value={token} onChange={e => setToken(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        <button className="btn-primary w-full py-2.5" disabled={loading} onClick={submit}>{loading ? '连接中…' : '连接'}</button>
        {err && <div className="text-pi-red text-xs mt-3">{err}</div>}
      </div>
    </div>
  )
}
