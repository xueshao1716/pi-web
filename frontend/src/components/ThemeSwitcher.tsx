import { useEffect, useState } from 'react'
import { Palette } from 'lucide-react'
import { THEME_PRESETS as THEMES, ACCENT_PRESETS as ACCENTS, COLOR_ERROR, ACCENT_LIGHT } from '../theme/palettes'
// 主题预设：data-theme 属性驱动（styles.css [data-theme] 变量覆盖）；色板定义在 theme/palettes.ts

// 默认主题「晨雾」(mist)：08-26 用户拍板白色主色。一次性迁移：老默认 'deep' 自动切到 mist（打标记后不再覆盖显式选择）
const DEFAULT_THEME = 'mist'
function initialTheme(): string {
  try {
    const stored = localStorage.getItem('pi_theme')
    if (stored == null) return DEFAULT_THEME
    if (stored === 'deep' && !localStorage.getItem('pi_theme_migrated')) {
      localStorage.setItem('pi_theme_migrated', '1')
      return DEFAULT_THEME
    }
    return stored
  } catch { return DEFAULT_THEME }
}
export default function ThemeSwitcher() {
  const [theme, setTheme] = useState(initialTheme)
  const [accent, setAccent] = useState(() => { try { return localStorage.getItem('pi_accent') || '' } catch { return '' } })
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const el = document.documentElement as any
    if (theme === 'mist') el.dataset.theme = 'mist'
    else if (theme === 'ink') el.dataset.theme = 'ink'
    else if (theme === 'violet') el.dataset.theme = 'violet'
    else if (theme === 'kraft') el.dataset.theme = 'kraft'
    else delete el.dataset.theme
    try { localStorage.setItem('pi_theme', theme) } catch {}
  }, [theme])

  useEffect(() => {
    const c = accent || ACCENTS[0].color
    ;(document.documentElement as any).style.setProperty('--pi-accent', c)
    // 浅色主题下 accent-deep 用原色，避免过暗
    ;(document.documentElement as any).style.setProperty('--pi-accent2', c === ACCENTS[0].color ? ACCENT_LIGHT : c)
    ;(document.documentElement as any).style.setProperty('--pi-accent-deep', c)
    try { localStorage.setItem('pi_accent', accent) } catch {}
  }, [accent, theme])

  return (
    <div className="relative">
      {/* rail 风格触发器：与导航按钮同尺寸同交互；色板圆点显示当前主题色（08-26 原 w-6 白底渐变小圆在浅色主题下不可见） */}
      <button aria-label="切换主题" title="主题"
        className="w-9 h-9 rounded-pi-md flex items-center justify-center relative text-pi-dim2 hover:text-pi-text hover:bg-pi-bg3 transition-colors"
        onClick={() => setMenuOpen(!menuOpen)}>
        <Palette className="w-[18px] h-[18px]" strokeWidth={1.8} />
        <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full border border-pi-bg2"
          style={{ background: THEMES.find(t => t.id === theme)?.swatch }} />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 bottom-11 z-20 panel p-2 flex flex-col gap-1 w-40 anim-enter">
            <div className="text-[10px] text-pi-dim2 px-2 pt-0.5 pb-1 font-semibold">主题</div>
            {THEMES.map(t => (
              <button key={t.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-pi-sm hover:bg-pi-bg3 text-xs ${theme === t.id ? 'text-pi-text' : 'text-pi-dim'}`} onClick={() => setTheme(t.id)}>
                <span className="w-4 h-4 rounded-full border border-pi-border" style={{ background: t.swatch }} />
                {t.name} {theme === t.id && <span className="ml-auto text-pi-accent">✓</span>}
              </button>
            ))}
            <div className="h-px bg-pi-border-soft my-1" />
            <div className="text-[10px] text-pi-dim2 px-2 pb-1 font-semibold">主色</div>
            <div className="flex gap-1.5 px-2 pb-1">
              {ACCENTS.map(a => (
                <button key={a.color} title={a.name}
                  className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${accent === a.color ? 'ring-2 ring-offset-1 ring-pi-text ring-offset-transparent' : ''}`}
                  style={{ background: a.color }} onClick={() => setAccent(a.color)} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
