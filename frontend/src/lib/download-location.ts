/** True only for the desktop Tauri shell; browser and mobile shells use their own download UI. */
export function isDesktopShellEnvironment(
  _origin = typeof location !== 'undefined' ? location.origin : '',
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  hasNativeBridge = typeof (globalThis as any).__TAURI__?.core?.invoke === 'function',
): boolean {
  return hasNativeBridge && !/android|iphone|ipad|ipod/i.test(String(userAgent || ''))
}

/** Ask the native shell to reveal the system Downloads directory. */
export async function openDownloadFolder(): Promise<boolean> {
  const t = (globalThis as any).__TAURI__
  const invoke = t?.core?.invoke
  if (!isDesktopShellEnvironment() || typeof invoke !== 'function') return false
  await invoke('open_download_folder')
  return true
}
