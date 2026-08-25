import { useCallback, useEffect, useRef } from 'react'

// 智能自动滚动（nomifun useAutoScroll 模式移植，2026-08-25）
// 三阈值 + 三守卫状态机：用户上翻停滚、贴底恢复、仅"真新消息"才强拉底。
// 与消息类型零耦合：只依赖 lastMessageKey / lastFromUser 两个输入。

const FOLLOW_BOTTOM_THRESHOLD_PX = 12 // 贴底判定（4px 在 HiDPI 下会被亚像素舍入骗到）
const PROGRAMMATIC_GUARD_MS = 150 // 程序滚动守卫：守卫期内的 scroll 事件不算用户意图
const LAYOUT_GUARD_MS = 600 // pointerdown 后封锁 resize 自动跟随（用户正在选择/拖动）

interface AutoScrollOptions {
  /** 会话标识：变化时重置全部滚动状态（切会话=新视口） */
  sessionKey?: string | null
  /** 列表长度+末条 id 指纹：变化才视为"真新消息" */
  lastMessageKey?: string | null
  /** 最后一条是否用户自己的发言（是则解除上翻锁定强制回底——用户发消息必然要看回复） */
  lastFromUser: boolean
}

export function useAutoScroll(opts: AutoScrollOptions) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledRef = useRef(false)
  const programmaticUntilRef = useRef(0)
  const layoutGuardUntilRef = useRef(0)
  const optsRef = useRef(opts)
  optsRef.current = opts

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_BOTTOM_THRESHOLD_PX
  }, [])

  const scrollToBottom = useCallback((force = false) => {
    if (!force && userScrolledRef.current) return
    const el = scrollRef.current
    if (!el) return
    programmaticUntilRef.current = Date.now() + PROGRAMMATIC_GUARD_MS
    requestAnimationFrame(() => {
      const el2 = scrollRef.current
      if (el2) el2.scrollTop = el2.scrollHeight
    })
  }, [])

  // 用户意图三通道：wheel 有位移 / pointerdown / scroll 非程序滚动且非贴底
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let lastTop = el.scrollTop

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0 && !isNearBottom()) userScrolledRef.current = true
    }
    const onPointerDown = () => {
      layoutGuardUntilRef.current = Date.now() + LAYOUT_GUARD_MS
      if (!isNearBottom()) userScrolledRef.current = true
    }
    const onScroll = () => {
      const now = Date.now()
      const moved = Math.abs(el.scrollTop - lastTop) > 2 // 防亚像素抖动
      lastTop = el.scrollTop
      if (now >= programmaticUntilRef.current && moved && !isNearBottom()) {
        userScrolledRef.current = true
      }
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('pointerdown', onPointerDown, { passive: true })
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('scroll', onScroll)
    }
  }, [isNearBottom])

  // 内容尺寸变化跟随：ResizeObserver 观察 scroller+首子节点，rAF 合帧，仅 auto-follow 有效时拉底
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let raf = 0
    const ro = new ResizeObserver(() => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (userScrolledRef.current) return
        if (Date.now() < layoutGuardUntilRef.current) return
        if (!isNearBottom()) return
        const gap = el.scrollHeight - el.scrollTop - el.clientHeight
        if (gap > 2) {
          el.scrollTop = el.scrollHeight
          programmaticUntilRef.current = Date.now() + PROGRAMMATIC_GUARD_MS
        }
      })
    })
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [isNearBottom])

  // 真新消息：列表变长且末条指纹变化。用户自己发言 → 强制回底；否则贴底时跟随
  useEffect(() => {
    if (!opts.lastMessageKey) return
    if (opts.lastFromUser) {
      userScrolledRef.current = false
      scrollToBottom(true)
    } else if (!userScrolledRef.current) {
      scrollToBottom(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.lastMessageKey])

  // 会话切换：清空全部滚动状态
  useEffect(() => {
    userScrolledRef.current = false
    requestAnimationFrame(() => scrollToBottom(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.sessionKey])

  return { scrollRef, scrollToBottom, isNearBottom }
}
