export interface NativeSaveResult { savedUri: string; location: string }
interface DownloadBridge {
  begin(id: string, name: string, mime: string, size: number): string
  append(id: string, base64: string): string
  finish(id: string): string
  cancel(id: string): void
  openSaved?(uri: string): string
}
type NativeWindow = typeof globalThis & { YuanshuDownloads?: DownloadBridge; YuanshuBridge?: unknown }
const nativeBridge = () => (globalThis as NativeWindow).YuanshuDownloads || null

export function canOpenNativeDownload(): boolean { return typeof nativeBridge()?.openSaved === 'function' }
export function openNativeDownload(uri: string): void {
  const bridge = nativeBridge()
  if (!bridge?.openSaved) throw new Error('请使用新版元枢手机客户端打开文件')
  const error = bridge.openSaved(uri)
  if (error) throw new Error(error)
}

/** Android WebView does not save blob links. Transfer in chunks, then await the system save picker. */
export async function saveNativeDownload(
  blob: Blob, filename: string, bridge: DownloadBridge | null = nativeBridge(),
  events: EventTarget = window,
): Promise<NativeSaveResult | null> {
  if (!bridge) {
    if ((globalThis as NativeWindow).YuanshuBridge) throw new Error('请先安装元枢 0.2.4 手机客户端，才能保存文件')
    return null
  }
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const beginError = bridge.begin(id, filename, blob.type || 'application/octet-stream', blob.size)
  if (beginError) throw new Error(beginError)
  let aborted = false
  let rejectSave: ((error: Error) => void) | undefined
  let cleanupResult: (() => void) | undefined
  const onPageHide = () => {
    aborted = true
    try { bridge.cancel(id) } catch { /* Native expiry also clears abandoned transfers. */ }
    rejectSave?.(new Error('保存已中断，请重新下载'))
  }
  events.addEventListener('pagehide', onPageHide)
  try {
    for (let offset = 0; offset < blob.size; offset += 65536) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + 65536).arrayBuffer())
      if (aborted) throw new Error('保存已中断，请重新下载')
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      const error = bridge.append(id, btoa(binary))
      if (error) throw new Error(error)
    }
    return await new Promise<NativeSaveResult>((resolve, reject) => {
      rejectSave = reject
      const onResult = (event: Event) => {
        const result = (event as CustomEvent).detail
        if (result?.id !== id) return
        events.removeEventListener('yuanshu-download-result', onResult)
        if (result.status === 'saved' && typeof result.uri === 'string' && result.uri.startsWith('content://')) {
          resolve({ savedUri: result.uri, location: result.location || '系统所选位置' })
        } else reject(new Error(result.status === 'cancelled' ? '已取消保存' : result.error || '文件保存失败'))
      }
      events.addEventListener('yuanshu-download-result', onResult)
      cleanupResult = () => events.removeEventListener('yuanshu-download-result', onResult)
      try {
        const error = bridge.finish(id)
        if (error) throw new Error(error)
      } catch (error) {
        events.removeEventListener('yuanshu-download-result', onResult)
        reject(error)
      }
    })
  } catch (error) {
    if (!aborted) { try { bridge.cancel(id) } catch { /* Keep the original save error. */ } }
    throw error
  } finally {
    cleanupResult?.()
    events.removeEventListener('pagehide', onPageHide)
  }
}
