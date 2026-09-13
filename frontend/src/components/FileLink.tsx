import { useState } from 'react'
import type { ReactNode } from 'react'
import { downloadApiFile, withFileToken } from '../api'

/** Links in the answer and video attachment buttons share the same authenticated download path. */
export default function FileLink({ href, children }: { href?: string; children: ReactNode }) {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const workspace = Boolean(href?.includes('/api/ws/file'))
  const save = workspace && /下载|保存|download/i.test(String(children))
  const url = href ? withFileToken(href) : undefined
  return <span><a href={url} target="_blank" rel="noopener noreferrer" className="text-pi-accent hover:underline" aria-busy={saving || undefined} onClick={save ? async e => {
    e.preventDefault()
    if (saving || !href) return
    setSaving(true)
    try { setMessage(await downloadApiFile(href, undefined, setMessage)) }
    catch (error: any) { setMessage(error?.message || '下载失败，请重试') }
    finally { setSaving(false) }
  } : undefined}>{children}</a>{message && <span role="status" className="block text-xs text-pi-dim leading-relaxed">{message}{!saving && <a className="ml-2 text-pi-accent underline" href={url} target="_blank" rel="noopener noreferrer">打开原文件保存</a>}</span>}</span>
}
