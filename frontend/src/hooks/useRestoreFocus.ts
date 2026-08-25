import { useEffect, useRef } from 'react'

// Radix Dialog 系关闭时不归还焦点（1.x 已知行为，菜单类才有）——本 hook 补上：
// open=true 时记录当前焦点元素，open=false 时还给它。
export function useRestoreFocus(open: boolean) {
  const prev = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) {
      prev.current = document.activeElement as HTMLElement | null
    } else if (prev.current) {
      try { prev.current.focus() } catch {}
      prev.current = null
    }
  }, [open])
}
