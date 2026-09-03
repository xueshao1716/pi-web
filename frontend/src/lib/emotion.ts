// 情绪指示器：服务端 VAD 三维情绪 → 可见表情（自老版 chat.js emoMeta 移植，2026-08-25）
// 心情是服务端情绪引擎的镜像展示，不是本地可点的玩具。
// 2026-09-03 增 vadVisual：VAD → 灵珠连续视觉参数（MoodOrb 用）。
// 设计语言借鉴 murmur-web（状态即运动/一个身体多个内在/缓动过渡）：
// 连续参数替代 emoji 八桶——VAD 每一点微小变化都可见，不再只有跨阈值才跳一格。

export interface EmoMeta { emoji: string; label: string; cls: string }

export interface MoodVisual {
  hue: number    // 0..360 色相：低落冷紫 290 → 专注紫罗兰 262 → 兴奋暖金 38（沿 valence 单调）
  sat: number    // 0..100 饱和度：低落褪色，兴奋浓郁
  light: number  // 0..100 明度：低落沉暗，兴奋明亮
  tempo: number  // Hz 呼吸节奏：arousal 驱动，0.2 深呼吸 → 1.2 快脉动
  glow: number   // 0..1 辉光强度
  depth: number  // 0..1 暗核深度：低落/压力时内在更沉
  drift: number  // 0..1 内在光斑漂移幅度与速度
}

// -1..1 → 0..1；缺字段回落引擎默认值（engine/emotion.mjs DEFAULT_STATE）
const unit = (x: any, dflt: number): number => {
  const v = Number(x)
  return Number.isFinite(v) ? Math.max(0, Math.min(1, (v + 1) / 2)) : (dflt + 1) / 2
}

export function vadVisual(s: any): MoodVisual {
  const vn = unit(s?.valence, 0.2)
  const an = unit(s?.arousal, 0.3)
  const dn = unit(s?.dominance, 0.55)
  const en = unit(s?.intensity, 0.3)
  // 色相沿 valence 单调下行：冷紫 290 →(v≈0.2) 紫罗兰 262 → 暖金 38。锚点插值保证任何 VAD 都有位置。
  const BASE_VN = 0.6 // 引擎默认 valence 0.2 的归一化位置
  const hue = vn <= BASE_VN ? 290 - (290 - 262) * (vn / BASE_VN) : 262 - (262 - 38) * ((vn - BASE_VN) / (1 - BASE_VN))
  const sat = 45 + 25 * Math.min(1, an * 1.4) + 15 * Math.max(0, vn - BASE_VN) / (1 - BASE_VN)
  const light = 50 + 14 * vn + 6 * Math.max(0, an - 0.5) + 4 * dn
  const tempo = (0.2 + 0.85 * an) * (0.78 + 0.44 * en)
  const glow = Math.max(0, Math.min(1, 0.3 + 0.35 * en + 0.2 * an))
  const depth = Math.max(0, Math.min(1, 0.12 + Math.max(0, BASE_VN - 0.12 - vn) * 0.9 + (an > 0.75 && vn < 0.45 ? 0.12 : 0)))
  const drift = Math.max(0, Math.min(1, 0.22 + 0.55 * an))
  return { hue, sat, light, tempo, glow, depth, drift }
}

export function emoMeta(s: any): EmoMeta {
  const v = s.valence || 0, a = s.arousal || 0
  const tags: string[] = s.tags || []
  if (tags.includes("alert_risk")) return { emoji: "🛡", label: "安全警觉", cls: "risk" }
  if (tags.includes("user_frustrated")) return { emoji: "🤝", label: "安抚模式", cls: "calm" }
  if (tags.includes("user_urgent")) return { emoji: "⚡", label: "快速响应", cls: "high" }
  if (tags.includes("user_anxious")) return { emoji: "🤗", label: "稳住局面", cls: "calm" }
  if (tags.includes("task_accomplish")) return { emoji: "🎉", label: "交付达成", cls: "high" }
  if (a >= 0.6 && v >= 0.4) return { emoji: "🔥", label: "兴奋", cls: "high" }
  if (a >= 0.6) return { emoji: "⚠", label: "警觉", cls: "risk" }
  if (v >= 0.4 && a <= 0.45) return { emoji: "😌", label: "平和", cls: "calm" }
  if (v <= 0.1) return { emoji: "🌧", label: "低落", cls: "low" }
  if (a >= 0.45 && v < 0.3) return { emoji: "🤨", label: "有压力", cls: "low" }
  return { emoji: "🧘", label: "专注", cls: "focus" }
}

// 性格基因名（tooltip 用）
export const GENE_NAMES: Record<string, string> = {
  gentleness: '温柔', initiative: '主动', curiosity: '好奇', attachment: '依恋',
  learning: '好学', creativity: '创造', caution: '谨慎', humor: '幽默',
  loyalty: '忠诚', autonomy_bias: '自主', adaptability: '适应',
}

export function emoTooltip(s: any, meta: EmoMeta): string {
  let title = `小语情绪：${meta.label}`
  if (s?.genome) {
    const top = Object.entries(s.genome as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 4)
    if (top.length) title += '\n性格：' + top.map(([k, v]) => `${GENE_NAMES[k] || k} ${Math.round(v * 100)}%`).join(' · ')
  }
  return title
}
