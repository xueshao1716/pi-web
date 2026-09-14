import { useState } from 'react'
import type { ReactNode } from 'react'
import { downloadApiFile, withFileToken } from '../api'
import { artifactName, fileNameFromUrl, artifactExtension } from '../lib/artifact-name'

/** 从扩展名反推产物类型，用于命名契约的「类型」段（docs/NAMING.md）。 */
function kindFromName(name: string): string {
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
  const hit = Object.entries({ image: ['png', 'jpg', 'jpeg', 'webp', 'gif'], video: ['mp4', 'webm', 'mov'], audio: ['wav', 'mp3', 'm4a', 'ogg'], document: ['md', 'pdf', 'pptx', 'docx'], text: ['txt', 'json', 'csv'], html: ['html', 'htm'] })
    .find(([, exts]) => exts.includes(ext))
  return hit ? hit[0] : 'document'
}

/** Links in the answer and video attachment buttons share the same authenticated download path. */
export default function FileLink({ href, children }: { href?: string; children: ReactNode }) {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const workspace = Boolean(href?.includes('/api/ws/file'))
  const save = workspace && /下载|保存|download/i.test(String(children))
  const url = href ? withFileToken(href) : undefined
  // 以前这里传 undefined，api.ts 兜底成字面量 “download”——下载下来连扩展名都没有，多个文件全叫 download。
  const downloadName = (link: string): string => {
    const real = fileNameFromUrl(link)
    if (real) return real
    const kind = kindFromName(link)
    return artifactName({ slug: String(children || ''), kind, ext: artifactExtension(kind) })
  }
  return <span><a href={url} target="_blank" rel="noopener noreferrer" className="text-pi-accent hover:underline" aria-busy={saving || undefined} onClick={save ? async e => {
    e.preventDefault()
    if (saving || !href) return
    setSaving(true)
    try { setMessage(await downloadApiFile(href, downloadName(href), setMessage)) }
    catch (error: any) { setMessage(error?.message || '下载失败，请重试') }
    finally { setSaving(false) }
  } : undefined}>{children}</a>{message && <span role="status" className="block text-xs text-pi-dim leading-relaxed">{message}{!saving && <a className="ml-2 text-pi-accent underline" href={url} target="_blank" rel="noopener noreferrer">打开原文件保存</a>}</span>}</span>
}
