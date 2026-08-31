// ══════════════════════════════════════════════════════════
// pi-web Design Tokens（高亮低饱和精密工具风格）
// 设计依据：RuiRui Agent UI 研究报告 + AgentCore OKLCH 体系
// 核心原则：
//   - 高亮低饱和（平均明度 0.88+、饱和度 0.03-）
//   - 近白/银灰/冷灰为主体，不依赖黑底霓虹
//   - 层级靠 OKLCH 亮度递增，不靠渐变和玻璃
//   - 动画高度集中，只在状态转换关键节点出现
// ⚠️ 单一真源：运行时 token 以 src/theme/generate.mjs 产生为准
// ══════════════════════════════════════════════════════════

// ── 语义色板（高亮低饱和，OKLCH 体系）──
export const colors = {
  // 背景分层（亮度递增，饱和度极低）
  // 基于 OKLCH：L(明度) 0.96→0.98，C(彩度) 0.003-0.008，H(色相) 240°冷灰
  bg: '#f5f6f8',      // oklch(0.96 0.005 240) 近白背景
  bg1: '#f9fafb',     // oklch(0.98 0.003 240) 卡片更亮
  bg2: '#fcfcfd',     // oklch(0.99 0.002 240) 弹层最亮
  bg3: '#ffffff',     // 纯白（极少用，仅特殊强调）
  bg4: '#ffffff',     // 保留占位
  // 边框（银灰，低对比）
  border: '#dfe1e6',     // oklch(0.88 0.008 240)
  borderSoft: '#e8eaed', // oklch(0.91 0.006 240)
  borderHi: 'rgba(0,0,0,0.04)', // 极浅描边
  // 文字（深灰到中灰，避免纯黑）
  text: '#2f3542',       // oklch(0.25 0.015 240) 主文字
  dim: '#6b7280',        // oklch(0.50 0.012 240) 次要
  dim2: '#9ca3af',       // oklch(0.65 0.010 240) 辅助
  // 强调色（低饱和蓝，不是荧光）
  accent: '#5b7fb8',     // oklch(0.58 0.08 240) 克制的蓝
  accent2: '#7a9acc',    // oklch(0.65 0.08 240) 稍亮
  accentDeep: '#4a6a9a', // oklch(0.48 0.08 240) 深蓝
  accentGlow: 'rgba(91,127,184,0.12)', // 极淡光晕
  // 语义色（OKLCH 统一彩度）
  green: '#5a9a7a',   // oklch(0.60 0.08 150)
  red: '#c25d5d',     // oklch(0.55 0.12 25)
  yellow: '#b8935a',  // oklch(0.62 0.08 70)

  // 删除装饰光斑色（不再需要）
  // 工具图标色（降低饱和度，统一调性）
  toolBash: '#5a9a7a',
  toolRead: '#5b8bb8',
  toolWrite: '#b8935a',
  toolEdit: '#b8935a',
  toolTodo: '#9a7a9a',
  toolThink: '#8a7ab8',
}

// ── 间距体系（4px 基数）──
export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
}

// ── 圆角（08-26 对齐生成器：4/6/8/12，收敛工具感）──
export const radius = {
  sm: 4, md: 6, lg: 8, xl: 12, pill: 999, full: '50%',
}

// ── 字体 ──
export const fonts = {
  mono: '"Cascadia Code", "JetBrains Mono", Consolas, "SF Mono", monospace',
  sans: '-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
}

// ── 字号阶梯（08-25 typeset：全站只允许 7 级，与契约测试同步）──
export const fontSize = {
  badge: 10,  // 徽章/胶囊专用
  xs: 11,     // 元信息/时间戳/标签
  sm: 12,     // 辅助文本
  md: 13,     // 正文
  lg: 15,     // 标题
  xl: 17,     // 区块标题
  xxl: 22,    // 展示级（页题/欢迎语）
}

// ── 阴影（极简，靠层级而非阴影表达深度）──
export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,.04), 0 1px 4px rgba(0,0,0,.04)',
  md: '0 2px 8px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.04)',
  lg: '0 4px 16px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.04)',
  glow: '0 0 12px var(--pi-accent-glow)', // 极淡焦点光晕
}

// ── 动效（高度集中，只在关键节点）──
// RuiRui 原则：静态远多于运动，不靠持续漂浮产生高级感
export const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'  // 通用退出
export const EASE_SHEET = 'cubic-bezier(0.32, 0.72, 0, 1)' // 大型面板
export const motion = {
  fast: `0.15s ${EASE}`,    // 快速响应（100-200ms）
  base: `0.25s ${EASE}`,    // 页面转场（200-300ms）
  slow: `0.4s ${EASE_SHEET}`, // 品牌级序列（400-500ms）
}

// ── 全部 CSS 变量 ──
export const cssVars: Record<string, string> = {
  '--pi-bg': colors.bg,
  '--pi-bg1': colors.bg1,
  '--pi-bg2': colors.bg2,
  '--pi-bg3': colors.bg3,
  '--pi-bg4': colors.bg4,
  '--pi-border': colors.border,
  '--pi-border-soft': colors.borderSoft,
  '--pi-border-hi': colors.borderHi,
  '--pi-text': colors.text,
  '--pi-dim': colors.dim,
  '--pi-dim2': colors.dim2,
  '--pi-accent': colors.accent,
  '--pi-accent2': colors.accent2,
  '--pi-accent-deep': colors.accentDeep,
  '--pi-accent-glow': colors.accentGlow,
  '--pi-green': colors.green,
  '--pi-red': colors.red,
  '--pi-yellow': colors.yellow,
  '--pi-glow-purple': colors.glowPurple,
  '--pi-glow-cyan': colors.glowCyan,
  // 语义层级 token（HeroUI surface/overlay/field 体系，Phase1）
  '--pi-surface': colors.bg1,
  '--pi-surface-fg': colors.text,
  '--pi-overlay': colors.bg2,
  '--pi-overlay-fg': colors.dim,
  '--pi-field': colors.bg1,
  '--pi-field-border': colors.borderSoft,
  '--pi-default': colors.bg3,
  '--pi-success': colors.green,
  '--pi-warning': colors.yellow,
  '--pi-danger': colors.red,
  '--pi-accent-soft': 'rgba(84,104,255,0.12)',
  '--pi-accent-soft-fg': colors.accent,
  '--pi-font-mono': fonts.mono,
  '--pi-font-sans': fonts.sans,
  '--pi-r-sm': `${radius.sm}px`,
  '--pi-r-md': `${radius.md}px`,
  '--pi-r-lg': `${radius.lg}px`,
  '--pi-r-xl': `${radius.xl}px`,
}
