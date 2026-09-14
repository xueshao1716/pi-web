// 产物命名契约 · 前端镜像实现
//
// 契约文档见 docs/NAMING.md，后端权威实现在 engine/workspace-api.mjs。
// 这里必须与后端逐项一致（类型标签表、扩展名表、格式顺序），
// 由 tests/unit/naming-contract.test.mjs 读取两份源码比对，防止漂移。
//
// 为什么前端也要有一份：聊天里的媒体很多是**上游远程 URL**，不带本地签名路径，
// 取不到后端生成的文件名。以前这里回退成 `元枢视频-N.mp4`，所有视频下载下来都同名、
// 覆盖、分不清是哪个版本产出的。

// 版本在构建时由 vite define 注入（见 vite.config.ts），运行时同步可用，不需要请求接口。
declare const __PRODUCT_VERSION__: string

export const PRODUCT_VERSION = typeof __PRODUCT_VERSION__ === 'string' && __PRODUCT_VERSION__ ? __PRODUCT_VERSION__ : '0.0.0-unknown'
export const VERSION_TAG = `v${PRODUCT_VERSION}`

export const ARTIFACT_KIND_LABELS: Record<string, string> = {
  image: '图片', video: '视频', audio: '音频', music: '音乐',
  text: '文本', novel: '文本', document: '文档', doc: '文档',
  ppt: '演示', html: '网页', code: '代码',
}

export const ARTIFACT_KIND_EXTENSIONS: Record<string, string> = {
  image: '.png', video: '.mp4', audio: '.wav', music: '.mp3',
  text: '.txt', novel: '.txt', document: '.md', doc: '.md',
  ppt: '.pptx', html: '.html', code: '.txt',
}

export function artifactKindLabel(type = ''): string {
  return ARTIFACT_KIND_LABELS[String(type || '').toLowerCase()] || '产物'
}

export function artifactExtension(type = ''): string {
  return ARTIFACT_KIND_EXTENSIONS[String(type || '').toLowerCase()] || ''
}

/** 与后端 artifactSlug 同样的清理规则：去非法字符、空白折成 -、截断 32 字。 */
export function artifactSlug(prompt = '', fallback = '元枢'): string {
  const p = String(prompt || '')
  const cleaned = p
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/[\s，。！？、,.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.\-\s]+|[.\-\s]+$/g, '')
    .slice(0, 32)
  return cleaned.slice(0, 32) || fallback
}

function stamp(now: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`
    + `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}-${p(now.getMilliseconds(), 3)}`
}

function shortId(): string {
  try {
    const buf = new Uint8Array(4)
    crypto.getRandomValues(buf)
    return [...buf].map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return Math.random().toString(16).slice(2, 10).padEnd(8, '0')
  }
}

export interface ArtifactNameInput {
  /** 提示词 / 标题 / 消息摘要；没有就用「元枢」 */
  slug?: string
  /** 产物类型：video / image / audio / music / text / document … */
  kind: string
  /** 扩展名；给了就以它为准（比如从 URL 里读到的真实后缀） */
  ext?: string
  now?: Date
  id?: string
}

/**
 * 生成产物文件名：`{摘要}_{类型}_{YYYYMMDD-HHmmss-mmm}-{id}_{v版本}{扩展名}`
 * 没有任何一段是可省的——摘要在没提示词时回退「元枢」，时间戳+id 保证永不重名，
 * 版本段保证能看出是哪个版本产出的。
 */
export function artifactName({ slug = '', kind, ext, now = new Date(), id }: ArtifactNameInput): string {
  const extension = ext || artifactExtension(kind)
  return `${artifactSlug(slug)}_${artifactKindLabel(kind)}_${stamp(now)}-${id || shortId()}_${VERSION_TAG}${extension}`
}

/**
 * 从签名 URL 的 ?path= 里取真实文件名（后端已按契约命名过，直接用最准确）。
 * 取不到返回空串，交给 artifactName 兜底。
 */
export function fileNameFromUrl(url: string): string {
  try {
    const raw = decodeURIComponent(String(url).split('?path=')[1]?.split('&')[0] || '')
    const name = raw.split('/').pop() || ''
    return /\.(mp4|webm|mov|mp3|wav|m4a|ogg|png|jpg|jpeg|webp|gif|md|txt|pdf|pptx?|html)$/i.test(name) ? name : ''
  } catch {
    return ''
  }
}
