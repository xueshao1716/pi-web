// 语义色板（08-23 颜色契约：组件内禁止裸 hex，统一从这里取）
export const TOOL_COLORS: Record<string, string> = {
  bash: '#34d399',
  read: '#38bdf8',
  write: '#f59e0b',
  edit: '#f59e0b',
}
export const COLOR_ERROR = '#ef4444'
export const COLOR_TOOL_FALLBACK = '#c084fc'
export const ACCENT_LIGHT = '#6b7dff' // 靛蓝在浅色主题下的提亮变体

// 主题切换器预设（08-23 从 ThemeSwitcher 迁入：色板定义归 theme/ 管辖）
export const THEME_PRESETS = [
  { id: 'highLum', name: '银灰', swatch: 'linear-gradient(135deg,#f5f6f8,#ffffff)', light: true, default: true }, // 新默认：高亮低饱和
  { id: 'deep', name: '深空蓝', swatch: 'linear-gradient(135deg,#080d1a,#121d36)' },
  { id: 'ink', name: '墨玉黑', swatch: 'linear-gradient(135deg,#000,#1a1a1f)' },
  { id: 'violet', name: '紫夜', swatch: 'linear-gradient(135deg,#0d0a1a,#251d52)' },
  { id: 'mist', name: '晨雾', swatch: 'linear-gradient(135deg,#f3f5fa,#ffffff)', light: true },
  { id: 'kraft', name: '牛皮纸', swatch: 'linear-gradient(135deg,#e5d4aa,#c9a66b)', light: true },
  { id: 'shuimo', name: '水墨', swatch: 'linear-gradient(135deg,#f7f4ec,#b54334)', light: true },
  { id: 'bamboo', name: '竹影', swatch: 'linear-gradient(135deg,#f1f5ec,#3f7a50)', light: true },
]
export const ACCENT_PRESETS = [
  { name: '靛蓝', color: '#4a58fa' },
  { name: '紫罗兰', color: '#8b7cf6' },
  { name: '天蓝', color: '#38bdf8' },
  { name: '翡翠', color: '#34d399' },
  { name: '琥珀', color: '#f59e0b' },
]
