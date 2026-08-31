/**
 * 客户端消息本地存储（IndexedDB）
 * 解决刷新/切标签页导致流式内容丢失的问题
 */

const DB_NAME = 'pi_web_messages'
const DB_VERSION = 1
const STORE_NAME = 'messages'

export interface LocalMessage {
  id: string                    // 前端生成的唯一ID（如 'u1735632000123' 或 'a1735632001456'）
  sessionId: string             // 会话ID
  role: 'user' | 'assistant' | 'system'
  text: string
  think?: string
  tools?: any[]
  notes?: string[]
  files?: any[]
  images?: string[]
  audios?: string[]
  model?: { provider: string; id: string }
  ts: string                    // ISO 时间戳
  synced: boolean               // 是否已同步到服务端（message_end 后标记 true）
  draft: boolean                // 是否是未完成的草稿（流式中标记 true，完成后改 false）
  streaming?: boolean           // 是否正在流式生成
}

let dbInstance: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('sessionId', 'sessionId', { unique: false })
        store.createIndex('ts', 'ts', { unique: false })
      }
    }
  })
}

/**
 * 保存或更新一条消息
 */
export async function saveMessage(msg: LocalMessage): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put(msg)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * 批量保存消息
 */
export async function saveMessages(msgs: LocalMessage[]): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    
    msgs.forEach(msg => store.put(msg))
    
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * 获取指定会话的所有消息（按时间排序）
 */
export async function getMessages(sessionId: string): Promise<LocalMessage[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('sessionId')
    const request = index.getAll(sessionId)

    request.onsuccess = () => {
      const msgs = request.result || []
      // 按时间排序
      msgs.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
      resolve(msgs)
    }
    request.onerror = () => reject(request.error)
  })
}

/**
 * 获取单条消息
 */
export async function getMessage(id: string): Promise<LocalMessage | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(id)

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 删除一条消息
 */
export async function deleteMessage(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * 删除指定会话的所有消息
 */
export async function deleteSessionMessages(sessionId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('sessionId')
    const request = index.openCursor(sessionId)

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      } else {
        resolve()
      }
    }
    request.onerror = () => reject(request.error)
  })
}

/**
 * 清空所有消息（慎用）
 */
export async function clearAllMessages(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.clear()

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * 合并服务端消息与本地消息
 * - 本地优先（本地有的不覆盖）
 * - 服务端有但本地没有的补充进来
 * - 本地草稿消息（draft: true）保留
 */
export function mergeMessages(localMsgs: LocalMessage[], serverMsgs: any[]): LocalMessage[] {
  const localIds = new Set(localMsgs.map(m => m.id))
  const merged = [...localMsgs]

  // 内容指纹：服务端消息的 id 与前端本地生成的 id 格式完全不同（引擎自己生成 id），
  // 光比对 id 会导致同一句话在本地写一次、服务端落盘后又取回一次而重复显示两遍。
  // 去重改用 role+文本内容+时间窗口（120s）匹配，命中则认为是同一条，保留本地版本、跳过服务端版本。
  const contentKeyOf = (role: string, text: string) => `${role}|${(text || '').trim().slice(0, 300)}`
  const localByContent = new Map<string, number[]>() // contentKey -> [ts_ms,...]
  for (const m of localMsgs) {
    if (!m.text || !m.text.trim()) continue // 空文本（纯工具调用）不参与内容匹配，避免误删
    const key = contentKeyOf(m.role, m.text)
    const arr = localByContent.get(key) || []
    arr.push(new Date(m.ts).getTime())
    localByContent.set(key, arr)
  }

  for (const sMsg of serverMsgs) {
    // 1. id 直接命中（本地记录本身就是从服务端加载的情况）
    const sId = sMsg.id || `${sMsg.role}_${new Date(sMsg.ts).getTime()}`
    if (localIds.has(sId)) continue

    // 2. 内容+时间窗口命中（同一句话本地已写过，服务端落盘后取回的是另一个 id）
    if (sMsg.text && sMsg.text.trim()) {
      const key = contentKeyOf(sMsg.role, sMsg.text)
      const tsList = localByContent.get(key)
      if (tsList) {
        const sTs = new Date(sMsg.ts).getTime()
        if (tsList.some(t => Math.abs(t - sTs) < 120_000)) continue // 命中，跳过
      }
    }

    // 转换成本地格式
    merged.push({
      id: sId,
      sessionId: sMsg.sessionId || '',
      role: sMsg.role,
      text: sMsg.text || '',
      think: sMsg.think,
      tools: sMsg.tools,
      notes: sMsg.notes,
      files: sMsg.files,
      images: sMsg.images,
      audios: sMsg.audios,
      model: sMsg.model,
      ts: sMsg.ts,
      synced: true,  // 服务端来的消息默认已同步
      draft: false,
    })
  }

  // 按时间排序
  merged.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
  return merged
}

