// MoodOrb 情绪灵珠（2026-09-03）
// 一颗柔光玻璃球，内在随服务端 VAD 情绪连续变化，替代旧的 emoji 八桶。
// 设计语言借鉴 murmur-web（krispuckett/murmur-web）：
//   · 状态即运动——情绪不靠图标文字，靠节奏/色相/明度被读到；
//   · 一个身体，内在无限——永远是同一颗球，变的只是内在；
//   · 参数指数缓动追赶目标（≈0.6s 走完主要过渡），情绪变化读作「换了念头」而非「换了图标」；
//   · 积分相位驱动呼吸——tempo 变速时相位连续，材质不跳帧（murmur 的 clock 思想）。
// 30px 级小球用 2D canvas 足够，不引 WebGPU/WebGL，零运行时依赖。

import { useEffect, useRef } from 'react'
import { vadVisual, type MoodVisual } from '../lib/emotion'

// 缓动速率（每秒）：时间常数约 0.31s，主要过渡 ≈0.6s 走完，同 murmur TRANSITION_DURATION 量级
const EASE_K = 3.2
const DT_MAX = 0.1 // 页签切回时的大 dt 必须截断，防止缓动瞬跳

export function MoodOrb({ state, size = 20, label, fps = 0 }: { state?: any; size?: number; label?: string; fps?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // target 只在情绪快照变化时更新；渲染循环从 ref 读，避免每帧重建 effect
  const targetRef = useRef<MoodVisual>(vadVisual(state))
  useEffect(() => {
    targetRef.current = vadVisual(state)
  }, [state])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(size * dpr))
    canvas.height = Math.max(1, Math.round(size * dpr))
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let cur: MoodVisual = { ...targetRef.current }
    let phase = Math.random() * Math.PI * 2 // 起始相位随机，多颗球不同步
    let raf = 0
    let last = performance.now()
    let lastDraw = 0
    let alive = true

    const draw = (now: number) => {
      const dt = Math.min(DT_MAX, Math.max(0, (now - last) / 1000))
      last = now
      // 指数缓动追赶目标（帧率无关）
      const k = 1 - Math.exp(-EASE_K * dt)
      cur = {
        hue: cur.hue + (targetRef.current.hue - cur.hue) * k,
        sat: cur.sat + (targetRef.current.sat - cur.sat) * k,
        light: cur.light + (targetRef.current.light - cur.light) * k,
        tempo: cur.tempo + (targetRef.current.tempo - cur.tempo) * k,
        glow: cur.glow + (targetRef.current.glow - cur.glow) * k,
        depth: cur.depth + (targetRef.current.depth - cur.depth) * k,
        drift: cur.drift + (targetRef.current.drift - cur.drift) * k,
      }
      // 积分相位：tempo 变速时 sin 输入连续，呼吸不跳帧
      phase += dt * Math.PI * 2 * cur.tempo

      const c = Math.round(size * dpr) / 2
      const R = c - dpr
      const breathe = 1 + 0.05 * Math.sin(phase)
      const r = R * breathe
      const h = cur.hue, s = cur.sat, l = cur.light

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 外辉光（glow 驱动的一圈柔光）
      if (cur.glow > 0.02) {
        const g = ctx.createRadialGradient(c, c, r * 0.6, c, c, r * 1.5)
        g.addColorStop(0, `hsla(${h}, ${s}%, ${l + 10}%, ${0.28 * cur.glow})`)
        g.addColorStop(1, `hsla(${h}, ${s}%, ${l + 10}%, 0)`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      // 身体：径向渐变玻璃球（中心偏上的高光 → 基色 → 边缘更深）
      const body = ctx.createRadialGradient(c - r * 0.25, c - r * 0.3, r * 0.1, c, c, r)
      body.addColorStop(0, `hsla(${h}, ${s * 0.8}%, ${Math.min(96, l + 16)}%, 0.95)`)
      body.addColorStop(0.55, `hsl(${h}, ${s}%, ${l}%)`)
      body.addColorStop(1, `hsl(${h}, ${s}%, ${l - 16}%)`)
      ctx.beginPath()
      ctx.arc(c, c, r, 0, Math.PI * 2)
      ctx.fillStyle = body
      ctx.fill()

      // 内在：两枚光斑沿各自轨道漂移，drift 决定游速与游幅（情绪的「活动」就住在这里）
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 2; i++) {
        const a = phase * (0.6 + i * 0.35) + i * 2.6
        const orbit = r * (0.18 + 0.3 * cur.drift)
        const bx = c + Math.cos(a) * orbit
        const by = c + Math.sin(a * 0.85 + i) * orbit * 0.8
        const br = r * (0.34 - i * 0.08)
        const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br)
        bg.addColorStop(0, `hsla(${h + 18}, ${s}%, ${Math.min(92, l + 20)}%, ${0.5 - i * 0.14})`)
        bg.addColorStop(1, `hsla(${h + 18}, ${s}%, ${l + 20}%, 0)`)
        ctx.fillStyle = bg
        ctx.beginPath()
        ctx.arc(bx, by, br, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'

      // 暗核：低落/压力时内在更沉（吸收感）
      if (cur.depth > 0.02) {
        const dk = ctx.createRadialGradient(c, c + r * 0.15, 0, c, c + r * 0.15, r * 0.9)
        dk.addColorStop(0, `rgba(12, 10, 24, ${0.42 * cur.depth})`)
        dk.addColorStop(1, 'rgba(12, 10, 24, 0)')
        ctx.fillStyle = dk
        ctx.beginPath()
        ctx.arc(c, c, r, 0, Math.PI * 2)
        ctx.fill()
      }

      // fresnel 细环：一条干净的边界，不是一圈粗环
      ctx.beginPath()
      ctx.arc(c, c, r, 0, Math.PI * 2)
      ctx.strokeStyle = `hsla(${h}, ${s}%, 88%, ${0.3 + 0.25 * cur.glow})`
      ctx.lineWidth = Math.max(1, dpr * 0.75)
      ctx.stroke()
    }

    const frame = (now: number) => {
      if (!alive) return
      if (document.hidden) { raf = 0; return } // 隐藏页签暂停，恢复由 visibilitychange 接管
      // fps 节流：背景大球用 30fps 足够（缓动 dt 按真实间隔算，节奏不失真）
      const step = fps > 0 ? 1000 / fps : 0
      if (step && now - lastDraw < step - 1) { raf = requestAnimationFrame(frame); return }
      lastDraw = now
      draw(now)
      raf = requestAnimationFrame(frame)
    }
    const onVis = () => {
      if (!alive || reduced) return
      if (!document.hidden && raf === 0) { last = performance.now(); raf = requestAnimationFrame(frame) }
    }
    document.addEventListener('visibilitychange', onVis)

    if (reduced) {
      draw(performance.now()) // 静态化：只画一帧（色相/明度仍忠实反映当下情绪）
    } else {
      raf = requestAnimationFrame(frame)
    }
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [size])

  const ariaProps = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const } // 装饰用途（背景氛围层）不带语义角色
  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: 'block', borderRadius: '50%' }}
      {...ariaProps}
    />
  )
}
