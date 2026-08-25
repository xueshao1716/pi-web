// ══════════════════════════════════════════════════════════
// pi-web Design Tokens（nomifun 式设计系统地基）
// Phase3：层次重做 — 拉开背景阶梯 + 强调色覆盖 5%+
// ══════════════════════════════════════════════════════════

// ── 语义色板（深色系，层次拉开）──
export const colors = {
  // 背景分层（5 级阶梯，每级亮度差 >=8）
  bg: '#0e1116',
  bg1: '#161a21',
  bg2: '#20242c',
  bg3: '#2a2f38',
  bg4: '#353b45',
  // 边框
  border: '#30363f',
  borderSoft: '#232830',
  borderHi: 'rgba(255,255,255,0.08)',
  // 文字（dim2 08-25 提亮：原 #586580 对深底仅 3.2:1 不达 WCAG）
  text: '#e8eef8',
  dim: '#8c98b4',
  dim2: '#7d88a8',
  // 强调色（主色）
  accent: '#5468ff',
  accent2: '#7b96ff',
  accentDeep: '#3c4be0',
  accentGlow: 'rgba(84,104,255,0.35)',
  // 语义
  green: '#3ecf8e',
  red: '#f47067',
  yellow: '#f5b759',
  // 语义层级 token（HeroUI surface/overlay/field）
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

  // 装饰光斑色
  glowPurple: 'rgba(139,92,246,0.18)',
  glowCyan: 'rgba(56,189,248,0.10)',
  // 工具图标色
  toolBash: '#34d399',
  toolRead: '#38bdf8',
  toolWrite: '#f59e0b',
  toolEdit: '#f59e0b',
  toolTodo: '#f472b6',
  toolThink: '#c084fc',
}

// ── 间距体系（4px 基数）──
export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
}

// ── 圆角 ──
export const radius = {
  sm: 6, md: 8, lg: 12, xl: 16, pill: 999, full: '50%',
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

// ── 阴影（分层）──
export const shadows = {
  sm: '0 1px 3px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.16)',
  md: '0 4px 16px rgba(0,0,0,.28), 0 1px 4px rgba(0,0,0,.20)',
  lg: '0 10px 40px rgba(0,0,0,.38), 0 2px 10px rgba(0,0,0,.24)',
  glow: '0 0 20px var(--pi-accent-glow)',
}

// ── 动效（08-25 词汇表收敛：全站只允许 ease/sheet 两条曲线，与 styles.css --pi-ease* 对齐）──
export const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
export const EASE_SHEET = 'cubic-bezier(0.32, 0.72, 0, 1)'
export const motion = {
  fast: `0.14s ${EASE}`,
  base: `0.2s ${EASE}`,
  slow: `0.3s ${EASE_SHEET}`,
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
  '--pi-font-mono': fonts.mono,
  '--pi-font-sans': fonts.sans,
  '--pi-r-sm': `${radius.sm}px`,
  '--pi-r-md': `${radius.md}px`,
  '--pi-r-lg': `${radius.lg}px`,
  '--pi-r-xl': `${radius.xl}px`,
}
