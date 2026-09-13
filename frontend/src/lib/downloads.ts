export interface DownloadRecord {
  id: string
  name: string
  url: string
  size: number
  sourcePath?: string
  createdAt: string
  savedUri?: string
  location?: string
  status?: 'saved' | 'started' | 'failed'
  error?: string
}

const STORAGE_KEY = 'yuanshu_download_history_v1'
const MAX_RECORDS = 80

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStorage(): StorageLike | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

function safeRecords(value: unknown): DownloadRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter(item => item && typeof item === 'object' && typeof (item as any).id === 'string' && typeof (item as any).name === 'string' && typeof (item as any).url === 'string')
    .map(item => ({
      id: String((item as any).id),
      name: String((item as any).name),
      url: String((item as any).url),
      size: Number.isFinite(Number((item as any).size)) ? Math.max(0, Number((item as any).size)) : 0,
      sourcePath: typeof (item as any).sourcePath === 'string' ? String((item as any).sourcePath) : undefined,
      createdAt: typeof (item as any).createdAt === 'string' ? String((item as any).createdAt) : new Date(0).toISOString(),
      savedUri: typeof (item as any).savedUri === 'string' && (item as any).savedUri.startsWith('content://') ? (item as any).savedUri : undefined,
      location: typeof (item as any).location === 'string' ? (item as any).location : undefined,
      status: ['saved', 'started', 'failed'].includes((item as any).status) ? (item as any).status : undefined,
      error: typeof (item as any).error === 'string' ? String((item as any).error) : undefined,
    }))
}

export function readDownloadHistory(storage: StorageLike | null = defaultStorage()): DownloadRecord[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(STORAGE_KEY)
    return raw ? safeRecords(JSON.parse(raw)) : []
  } catch { return [] }
}

export function rememberDownload(input: Omit<DownloadRecord, 'id'> & { id?: string }, storage: StorageLike | null = defaultStorage()): DownloadRecord {
  const createdAt = input.createdAt || new Date().toISOString()
  const record: DownloadRecord = {
    id: input.id || `${createdAt}:${input.name}:${input.url}`,
    name: input.name,
    url: input.url,
    size: Math.max(0, Number(input.size) || 0),
    sourcePath: input.sourcePath,
    createdAt,
    savedUri: input.savedUri,
    location: input.location,
    status: input.status,
    error: input.error,
  }
  if (!storage) return record
  try {
    const next = [record, ...readDownloadHistory(storage).filter(item => item.id !== record.id)].slice(0, MAX_RECORDS)
    storage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {}
  try { window.dispatchEvent(new CustomEvent('yuanshu-download-recorded', { detail: record })) } catch {}
  return record
}

export function removeDownload(id: string, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false
  const current = readDownloadHistory(storage)
  const next = current.filter(item => item.id !== id)
  if (next.length === current.length) return false
  try { storage.setItem(STORAGE_KEY, JSON.stringify(next)); return true } catch { return false }
}

export function clearDownloadHistory(storage: StorageLike | null = defaultStorage()): void {
  try { storage?.removeItem(STORAGE_KEY) } catch {}
}

export const DOWNLOAD_HISTORY_KEY = STORAGE_KEY
