// ══════════════════════════════════════════════════════════
// pi-web Design Tokens（nomifun 式设计系统地基）
// 继承 pi-web vanilla 的深色语义色，系统化为完整 token 体系
// ══════════════════════════════════════════════════════════

// ── 语义色板（深色系，继承 vanilla)──
export const colors = {
  // 背景分层
  bg: '#0b0c0f',          // 最底
  bg1: '#0f1116',         // 侧边栏
  bg2: '#14161d',         // 面板
  bg3: '#171a22',         // 面板深
  // 边框
  border: '#262b38',
  borderSoft: '#1e202a',
  // 文字
  text: '#e6e8ee',
  dim: '#8a91a5',
  dim2: '#5c6375',
  // 强调色
  accent: '#4a58fa',      // nomifun PrimaryColor
  accent2: '#6b7dff',
  accentDeep: '#3a46d0',
  // 语义
  green: '#3ecf8e',
  red: '#f47067',
  yellow: '#f5b759',
  // 工具图标色
  toolBash: '#34d399',
  toolRead: '#38bdf8',
  toolWrite: '#f59e0b',
  toolEdit: '#f59e0b',
  toolTodo: '#f472b6',
  toolThink: '#c084fc',
}

// ── 间距体系（4px 基数，nomifun 精致节奏）──
export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
}

// ── 圆角（nomifun 克制）──
export const radius = {
  sm: 6, md: 8, lg: 12, xl: 16, pill: 999, full: '50%',
}

// ── 字体（继承 vanilla mono/sans）──
export const fonts = {
  mono: '"Cascadia Code", "JetBrains Mono", Consolas, "SF Mono", monospace',
  sans: '-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
}

// ── 字号节奏──
export const fontSize = {
  xs: 11, sm: 12.5, md: 13.5, lg: 15.5, xl: 17, xxl: 22, xxxl: 26,
}

// ── 阴影（分层）──
export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.14)',
  md: '0 4px 14px rgba(0,0,0,.22), 0 1px 3px rgba(0,0,0,.18)',
  lg: '0 10px 34px rgba(0,0,0,.34), 0 2px 8px rgba(0,0,0,.22)',
}

// ── 动效（nomifun cubic-bezier）──
export const motion = {
  fast: '0.14s cubic-bezier(0.33, 1, 0.68, 1)',
  base: '0.2s cubic-bezier(0.33, 1, 0.68, 1)',
  slow: '0.3s cubic-bezier(0.33, 1, 0.68, 1)',
}

// ── 全部 CSS 变量（注入到 :root，供 UnoCSS/组件引用）──
export const cssVars: Record<string, string> = {
  '--pi-bg': colors.bg,
  '--pi-bg1': colors.bg1,
  '--pi-bg2': colors.bg2,
  '--pi-bg3': colors.bg3,
  '--pi-border': colors.border,
  '--pi-border-soft': colors.borderSoft,
  '--pi-text': colors.text,
  '--pi-dim': colors.dim,
  '--pi-dim2': colors.dim2,
  '--pi-accent': colors.accent,
  '--pi-accent2': colors.accent2,
  '--pi-accent-deep': colors.accentDeep,
  '--pi-green': colors.green,
  '--pi-red': colors.red,
  '--pi-yellow': colors.yellow,
  '--pi-font-mono': fonts.mono,
  '--pi-font-sans': fonts.sans,
  '--pi-r-sm': `${radius.sm}px`,
  '--pi-r-md': `${radius.md}px`,
  '--pi-r-lg': `${radius.lg}px`,
  '--pi-r-xl': `${radius.xl}px`,
}
