import type {
  Artifact,
  AssetDelivery,
  AssetFilterQuery,
  AssetItem,
  AssetKind,
  AssetTimeRange,
} from '../types'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'm3u8'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'oga'])
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'xml', 'yaml', 'yml',
  'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'py', 'java',
  'c', 'h', 'cpp', 'rs', 'go', 'sql', 'log',
])
const PRESENTATION_EXTENSIONS = new Set(['ppt', 'pptx', 'odp', 'key'])

const IGNORED_PROJECT_SEGMENTS = new Set([
  '生成物', '交付', '工程', '文档', '收发文件', 'workshop-out', '图片', '音频', '视频',
])

const normalizePath = (value: unknown) => String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')

const extensionFor = (name: string) => {
  const clean = String(name || '').split(/[?#]/, 1)[0]
  const base = clean.slice(clean.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function assetKindForName(name: string): AssetKind {
  const extension = extensionFor(name)
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (TEXT_EXTENSIONS.has(extension)) return 'text'
  if (PRESENTATION_EXTENSIONS.has(extension)) return 'presentation'
  return 'other'
}

export function projectForPath(value: string): string {
  const segments = normalizePath(value).split('/').filter(Boolean)
  for (const segment of segments.slice(0, -1)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(segment)) continue
    if (!IGNORED_PROJECT_SEGMENTS.has(segment)) return segment
  }
  return '未分类'
}

export function assetContextLabel(item: Pick<AssetItem, 'source' | 'project'>): string {
  return item.source === 'delivery' ? '交付' : item.project
}

export function assetKindLabel(kind: AssetKind): string {
  return ({
    image: '图片',
    video: '视频',
    audio: '音频',
    text: '文本/文档',
    presentation: '演示文稿',
    other: '其他',
  } satisfies Record<AssetKind, string>)[kind]
}

const timestampFor = (date: unknown, mtimeMs: unknown) => {
  if (typeof mtimeMs === 'number' && Number.isFinite(mtimeMs)) return mtimeMs
  if (typeof mtimeMs === 'string' && mtimeMs.trim() && Number.isFinite(Number(mtimeMs))) return Number(mtimeMs)
  if (typeof date === 'number' && Number.isFinite(date)) return date
  const parsed = Date.parse(String(date || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const dateFor = (date: unknown, mtimeMs: number) => {
  if (typeof date === 'string' && date.trim() && Number.isFinite(Date.parse(date))) return date
  return mtimeMs > 0 ? new Date(mtimeMs).toISOString() : ''
}

const sizeFor = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

export function normalizeArtifacts(artifacts: Artifact[]): AssetItem[] {
  return (Array.isArray(artifacts) ? artifacts : []).map((artifact) => {
    const path = normalizePath(artifact.path || artifact.name)
    const date = artifact.date || ''
    const mtimeMs = timestampFor(date, artifact.mtimeMs)
    return {
      id: `artifact:${path}`,
      name: artifact.name || path.split('/').pop() || '未命名资产',
      path,
      url: artifact.url || '',
      size: sizeFor(artifact.size),
      date: dateFor(date, mtimeMs),
      mtimeMs,
      kind: assetKindForName(artifact.name || path),
      source: 'artifact',
      project: projectForPath(path),
      isDirectory: false,
    }
  })
}

export function normalizeDeliveries(deliveries: AssetDelivery[]): AssetItem[] {
  return (Array.isArray(deliveries) ? deliveries : []).map((delivery) => {
    const path = normalizePath(delivery.wsPath || delivery.name)
    const isDirectory = delivery.type === 'dir'
    const mtimeMs = timestampFor(delivery.date, delivery.mtimeMs)
    return {
      id: `delivery:${path}`,
      name: delivery.name || path.split('/').pop() || '未命名资产',
      path,
      url: delivery.url || '',
      size: sizeFor(delivery.size),
      date: dateFor(delivery.date, mtimeMs),
      mtimeMs,
      kind: isDirectory ? 'other' : assetKindForName(delivery.name || path),
      source: 'delivery',
      project: projectForPath(path),
      ...(delivery.openPath ? { openPath: normalizePath(delivery.openPath) } : {}),
      ...(isDirectory ? { isDirectory: true } : {}),
    }
  })
}

export function mergeAssets(artifacts: Artifact[], deliveries: AssetDelivery[]): AssetItem[] {
  const seen = new Set<string>()
  return [...normalizeArtifacts(artifacts), ...normalizeDeliveries(deliveries)].filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

const startOfDay = (timestamp: number) => {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

const matchesTimeRange = (item: AssetItem, range: AssetTimeRange | undefined, now: number) => {
  if (!range || range === 'all') return true
  const current = Number.isFinite(now) ? now : Date.now()
  const itemTime = item.mtimeMs
  if (!Number.isFinite(itemTime) || itemTime <= 0) return false
  if (range === 'today') return itemTime >= startOfDay(current) && itemTime <= current
  const days = range === '7d' ? 7 : 30
  return itemTime >= current - days * 24 * 60 * 60 * 1000 && itemTime <= current
}

export function filterAssets(items: AssetItem[], query: AssetFilterQuery = {}): AssetItem[] {
  const search = String(query.search || '').trim().toLocaleLowerCase()
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (query.kind && query.kind !== 'all' && item.kind !== query.kind) return false
    if (query.source && query.source !== 'all' && item.source !== query.source) return false
    if (query.project && query.project !== 'all' && item.project !== query.project) return false
    if (!matchesTimeRange(item, query.timeRange, query.now ?? Date.now())) return false
    if (search && !`${item.name} ${item.path}`.toLocaleLowerCase().includes(search)) return false
    return true
  })
}

export function sortAssets(items: AssetItem[], order: 'newest' | 'oldest' = 'newest'): AssetItem[] {
  const direction = order === 'oldest' ? 1 : -1
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const difference = (a.mtimeMs || 0) - (b.mtimeMs || 0)
    return difference === 0 ? a.id.localeCompare(b.id) : difference * direction
  })
}
