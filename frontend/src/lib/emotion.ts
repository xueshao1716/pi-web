// 情绪指示器：服务端 VAD 三维情绪 → 可见表情（自老版 chat.js emoMeta 移植，2026-08-25）
// 心情是服务端情绪引擎的镜像展示，不是本地可点的玩具。

export interface EmoMeta { emoji: string; label: string; cls: string }

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
