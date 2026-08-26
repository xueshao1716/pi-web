import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useApp } from '../store'

// ── 后端 TUI 终端（08-26）：xterm.js 直连 /ws/tui PTY 桥，操作后端 pi TUI ──

export default function TuiTerminal() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  // token 从 localStorage 直读，避免依赖 store 初始化时序
  const token = (() => { try { return localStorage.getItem('pi_web_token') || '' } catch { return '' } })()

  useEffect(() => {
    if (!hostRef.current) return
    const term = new Terminal({
      fontSize: 13,
      // xterm 用 canvas 测量字体，不能解析 CSS 变量——必须显式等宽字体栈，否则字距测量错乱
      fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, "JetBrains Mono", monospace',
      letterSpacing: 0,
      cursorBlink: true,
      convertEol: false,
      theme: {
        background: '#0b0e13',
        foreground: '#d8e2f0',
        cursor: '#5468ff',
        selectionBackground: 'rgba(84,104,255,0.30)',
      },
      allowProposedApi: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    try { fit.fit() } catch {}

    // WS 连接（带 token；断线自动重连）
    let ws: WebSocket | null = null
    let closedByUs = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const connect = () => {
      if (closedByUs) return
      try { ws = new WebSocket(`${proto}://${location.host}/ws/tui?token=${encodeURIComponent(token)}`) } catch { retryTimer = setTimeout(connect, 3000); return }
      ws.onopen = () => {
        term.writeln('\x1b[2m── 已连接后端 TUI（输入即操作小语终端）──\x1b[0m')
        sendResize()
      }
      ws.onmessage = ev => term.write(ev.data)
      ws.onclose = () => {
        if (!closedByUs) { term.writeln('\x1b[2m[连接断开，3s 后重连]\x1b[0m'); retryTimer = setTimeout(connect, 3000) }
      }
      ws.onerror = () => {}
    }
    const sendResize = () => {
      try { ws?.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows })) } catch {}
    }
    connect()

    term.onData(d => { try { ws?.send(JSON.stringify({ type: 'input', data: d })) } catch {} })

    // 容器尺寸变化 → fit + 通知后端
    const ro = new ResizeObserver(() => {
      try { fit.fit(); sendResize() } catch {}
    })
    ro.observe(hostRef.current)

    return () => {
      closedByUs = true
      if (retryTimer) clearTimeout(retryTimer)
      ro.disconnect()
      try { ws?.close() } catch {}
      term.dispose()
    }
  }, [])

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div ref={hostRef} className="flex-1 min-h-0 px-2 py-1" style={{ background: 'var(--pi-bg)' }} />
      <div className="px-3 py-1.5 border-t border-pi-border-soft text-[10px] text-pi-dim2 flex items-center gap-1.5">
        后端 TUI 实时操作 · 输入 exit 或关闭面板即结束本次会话进程
      </div>
    </div>
  )
}
