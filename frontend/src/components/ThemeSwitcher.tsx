import { useEffect, useState } from 'react'

const ACCENTS = [
  { name: '靛蓝', color: '#4a58fa' },
  { name: '紫罗兰', color: '#8b7cf6' },
  { name: '天蓝', color: '#38bdf8' },
  { name: '翡翠', color: '#34d399' },
  { name: '琥珀', color: '#f59e0b' },
]

export default function ThemeSwitcher() {
  const [accent, setAccent] = useState(() => { try { return localStorage.getItem('pi_accent') || ACCENTS[0].color } catch { return ACCENTS[0].color } })
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    ;(document.documentElement as any).style.setProperty('--pi-accent', accent)
    ;(document.documentElement as any).style.setProperty('--pi-accent2', accent === '#4a58fa' ? '#6b7dff' : accent)
    try { localStorage.setItem('pi_accent', accent) } catch {}
  }, [accent])

  return (
    <div className="relative">
      <button className="w-6 h-6 rounded-pi-pill border-2 border-pi-border hover:border-pi-accent transition-colors" style={{ background: accent }} onClick={() => setMenuOpen(!menuOpen)} title="主题色" />
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-7 z-20 panel p-2 flex flex-col gap-1 w-32">
            {ACCENTS.map(a => (
              <button key={a.color} className="flex items-center gap-2 px-2 py-1.5 rounded-pi-sm hover:bg-pi-bg3 text-pi-dim text-xs" onClick={() => { setAccent(a.color); setMenuOpen(false) }}>
                <span className="w-3 h-3 rounded-full" style={{ background: a.color }} /> {a.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
