import { useEffect, useState } from 'react'

// 主题预设：data-theme 属性驱动（styles.css [data-theme] 变量覆盖）
const THEMES = [
  { id: 'deep', name: '深空蓝', swatch: 'linear-gradient(135deg,#080d1a,#121d36)' },
  { id: 'ink', name: '墨玉黑', swatch: 'linear-gradient(135deg,#000,#1a1a1f)' },
  { id: 'violet', name: '紫夜', swatch: 'linear-gradient(135deg,#0d0a1a,#251d52)' },
  { id: 'mist', name: '晨雾', swatch: 'linear-gradient(135deg,#f3f5fa,#ffffff)', light: true },
]

const ACCENTS = [
  { name: '靛蓝', color: '#4a58fa' },
  { name: '紫罗兰', color: '#8b7cf6' },
  { name: '天蓝', color: '#38bdf8' },
  { name: '翡翠', color: '#34d399' },
  { name: '琥珀', color: '#f59e0b' },
]

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('pi_theme') || 'deep' } catch { return 'deep' } })
  const [accent, setAccent] = useState(() => { try { return localStorage.getItem('pi_accent') || '' } catch { return '' } })
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const el = document.documentElement as any
    if (theme === 'mist') el.dataset.theme = 'mist'
    else if (theme === 'ink') el.dataset.theme = 'ink'
    else if (theme === 'violet') el.dataset.theme = 'violet'
    else delete el.dataset.theme
    try { localStorage.setItem('pi_theme', theme) } catch {}
  }, [theme])

  useEffect(() => {
    const fallback = theme === 'mist' ? '#4a58fa' : '#4a58fa'
    const c = accent || fallback
    ;(document.documentElement as any).style.setProperty('--pi-accent', c)
    // 浅色主题下 accent-deep 用原色，避免过暗
    ;(document.documentElement as any).style.setProperty('--pi-accent2', c === '#4a58fa' ? '#6b7dff' : c)
    ;(document.documentElement as any).style.setProperty('--pi-accent-deep', c)
    try { localStorage.setItem('pi_accent', accent) } catch {}
  }, [accent, theme])

  return (
    <div className="relative">
      <button
        className="w-6 h-6 rounded-pi-pill border-2 border-pi-border hover:border-pi-accent transition-colors"
        style={{ background: THEMES.find(t => t.id === theme)?.swatch }}
        onClick={() => setMenuOpen(!menuOpen)}
        title="主题"
      />
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-7 z-20 panel p-2 flex flex-col gap-1 w-40">
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
