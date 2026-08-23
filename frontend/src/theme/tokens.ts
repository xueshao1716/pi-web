// ══════════════════════════════════════════════════════════
// pi-web Design Tokens（nomifun 式设计系统地基）
// Phase3：层次重做 — 拉开背景阶梯 + 强调色覆盖 5%+
// ══════════════════════════════════════════════════════════

// ── 语义色板（深色系，层次拉开）──
export const colors = {
  // 背景分层（5 级阶梯，每级亮度差 >=8）
  bg: '#070a10',
  bg1: '#0c1018',
  bg2: '#12192a',
  bg3: '#1a2240',
  bg4: '#222e50',
  // 边框
  border: '#283352',
  borderSoft: '#1c2640',
  borderHi: 'rgba(255,255,255,0.08)',
  // 文字
  text: '#e8eef8',
  dim: '#8c98b4',
  dim2: '#586580',
  // 强调色（主色）
  accent: '#5468ff',
  accent2: '#7b96ff',
  accentDeep: '#3c4be0',
  accentGlow: 'rgba(84,104,255,0.35)',
  // 语义
  green: '#3ecf8e',
  red: '#f47067',
  yellow: '#f5b759',
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

// ── 字号节奏 ──
export const fontSize = {
  xs: 11, sm: 12.5, md: 13.5, lg: 15.5, xl: 17, xxl: 22, xxxl: 26,
}

// ── 阴影（分层）──
export const shadows = {
  sm: '0 1px 3px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.16)',
  md: '0 4px 16px rgba(0,0,0,.28), 0 1px 4px rgba(0,0,0,.20)',
  lg: '0 10px 40px rgba(0,0,0,.38), 0 2px 10px rgba(0,0,0,.24)',
  glow: '0 0 20px var(--pi-accent-glow)',
}

// ── 动效 ──
export const motion = {
  fast: '0.14s cubic-bezier(0.33, 1, 0.68, 1)',
  base: '0.2s cubic-bezier(0.33, 1, 0.68, 1)',
  slow: '0.3s cubic-bezier(0.22, 1, 0.36, 1)',
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
