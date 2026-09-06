const VIDEO = /\.(mp4|webm|mov)(?:\b|$)/i

function clipMediaPath(s: string): string {
  const m = String(s || '').match(/^(.*?\.(?:mp4|webm|mov|png|jpe?g|gif|webp|mp3|wav|m4a))/i)
  return m ? m[1] : String(s || '')
}

export function workspaceFileUrl(p: string): string {
  const rel = toWorkspaceRel(clipMediaPath(p))
  if (!rel) return ''
  return '/api/ws/file?path=' + encodeURIComponent(rel)
}

export function toWorkspaceRel(p: string): string {
  let s = String(p || '').trim().replace(/^["'`<]+|[>"'`]+$/g, '')
  if (!s) return ''
  if (s.startsWith('/api/ws/file')) {
    const m = s.match(/[?&]path=([^&\s]+)/)
    if (!m) return ''
    try { return decodeURIComponent(m[1]).replace(/\\/g, '/') } catch { return m[1] }
  }
  const unified = s.replace(/\//g, '\\')
  const ws = unified.match(/^[A-Za-z]:\\(?:[^\\]+\\)*pi-workspace\\(.+)$/i)
  if (ws) return ws[1].replace(/\\/g, '/')
  if (/^(生成物|工程|workshop-out)[\\/]/i.test(s)) return s.replace(/\\/g, '/')
  return ''
}

export function scrapeVideos(text: string): string[] {
  const out: string[] = []
  const add = (u: string) => { if (u && !out.includes(u)) out.push(u) }
  const raw = String(text || '')
  const hits = new Set<string>()
  for (const m of raw.matchAll(/\/api\/ws\/file\?path=[^\s)）"'<>]+/g)) hits.add(m[0].replace(/[.,;。，]+$/, ''))
  for (const m of raw.matchAll(/[A-Za-z]:\\[^\s)）"'<>]+/g)) hits.add(m[0].replace(/[.,;。，]+$/, ''))
  for (const m of raw.matchAll(/(?:生成物|工程|workshop-out)[\\/][^\s)）"'<>]+/g)) hits.add(m[0].replace(/[.,;。，]+$/, ''))
  for (const m of raw.matchAll(/📎\s*交付:\s*(\S+)/g)) hits.add(m[1])
  for (const rawHit of hits) {
    const hit = clipMediaPath(rawHit)
    const url = hit.startsWith('/api/ws/file') ? hit.split('&')[0] : workspaceFileUrl(hit)
    if (!url) continue
    const pathPart = url.includes('path=') ? decodeURIComponent(url.split('path=')[1] || '') : hit
    if (VIDEO.test(pathPart) || VIDEO.test(hit)) add(url)
  }
  return out
}
