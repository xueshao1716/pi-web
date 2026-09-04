import { generateTheme, SEEDS } from './generate.mjs'
import { ThemeApi } from '../api'

// ── 主题应用单一真源（08-29 从 ThemeSwitcher 抽出，ThemesPage/ThemeSwitcher 共用）──
// 流程：seed(+accent 覆盖) → generateTheme 派生全量变量 → 写 CSS 变量 + data-theme + localStorage
// 广播 pi-theme-changed 事件 → 常驻 ThemeSwitcher 同步 state（避免双组件状态漂移）

export type ThemeSeed = { bg: string; text: string; accent: string; step: number; light?: boolean; overrides?: Record<string, string> }

export function applyThemeVars(theme: string, accent: string) {
  const el = document.documentElement as any
  if (['mist', 'ink', 'violet', 'kraft', 'shuimo', 'bamboo'].includes(theme)) el.dataset.theme = theme
  else delete el.dataset.theme

  const seed: ThemeSeed = (SEEDS as any)[theme] || (SEEDS as any).mist
  const c = accent || seed.accent
  const v = generateTheme({ ...seed, accent: c })
  for (const [k, val] of Object.entries(v)) el.style.setProperty(k, val as string)
}

export function persistTheme(theme: string, accent: string) {
  try {
    localStorage.setItem('pi_theme', theme)
    localStorage.setItem('pi_accent', accent)
  } catch {}
  ThemeApi.save(theme, accent).catch(() => {})
  try { window.dispatchEvent(new CustomEvent('pi-theme-changed', { detail: { theme, accent } })) } catch {}
}

export function applyTheme(theme: string, accent: string) {
  applyThemeVars(theme, accent)
  persistTheme(theme, accent)
}

export function currentTheme(): { theme: string; accent: string } {
  try {
    return {
      theme: localStorage.getItem('pi_theme') || 'mist',
      accent: localStorage.getItem('pi_accent') || '',
    }
  } catch { return { theme: 'mist', accent: '' } }
}
