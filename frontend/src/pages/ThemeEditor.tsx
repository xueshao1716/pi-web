// ══════════════════════════════════════════════════════════
// 设计令牌工作台（08-27 P2）：可视化主题编辑器 + 壁纸
// ══════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { SEEDS, generateTheme } from '../theme/generate.mjs'
import { THEME_PRESETS, ACCENT_PRESETS } from '../theme/palettes'
import { ThemeApi } from '../api'
import { toast } from '../components/Toast'

function hexToOklch(hex: string) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const lin = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)]
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  return { L, C: Math.hypot(A, B), H: Math.atan2(B, A) }
}

const WALL_PRESETS = [
  { label: '无', value: '' },
  { label: '深空', value: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0a0a1a 100%)' },
  { label: '极光', value: 'linear-gradient(135deg, #0d1117 0%, #161b22 30%, #1a3a4a 60%, #0d1117 100%)' },
  { label: '暮光', value: 'linear-gradient(180deg, #1a0a2e 0%, #2d1b4e 40%, #4a1942 70%, #1a0a2e 100%)' },
  { label: '暖纸', value: 'linear-gradient(135deg, #f5e6d3 0%, #e8d5b7 50%, #f0e0c8 100%)' },
]

function App({ accent, setAccent, theme, setTheme, wallpaper, setWallpaper }: {
  accent: string; setAccent: (s: string) => void
  theme: string; setTheme: (s: string) => void
  wallpaper: string; setWallpaper: (s: string) => void
}) {
  const [density, setDensity] = useState(0.043)
  const [saving, setSaving] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const seed = SEEDS[theme as keyof typeof SEEDS] || SEEDS.deep
  const currentSeed = { ...seed, accent, step: density }
  const tokens = generateTheme(currentSeed)

  useEffect(() => {
    const el = document.documentElement
    for (const [k, val] of Object.entries(tokens)) el.style.setProperty(k, val)
  }, [tokens])

  useEffect(() => {
    const wp = document.getElementById('pi-wallpaper') as HTMLElement | null
    if (!wp) return
    if (wallpaper) {
      wp.style.backgroundImage = `url(${wallpaper})`
      wp.style.backgroundSize = 'cover'
      wp.style.backgroundPosition = 'center'
      wp.style.backgroundRepeat = 'no-repeat'
    } else {
      wp.style.backgroundImage = ''
      wp.style.backgroundSize = ''
      wp.style.backgroundPosition = ''
      wp.style.backgroundRepeat = ''
    }
  }, [wallpaper])

  const handleSave = async () => {
    setSaving(true)
    try {
      await ThemeApi.save(theme, accent, wallpaper)
      window.dispatchEvent(new CustomEvent('pi-wallpaper-changed')) // 通知全局应用壁纸
      toast('主题已保存到服务端', 'ok')
    } catch { toast('保存失败', 'error') }
    setSaving(false)
  }

  const handleReset = () => {
    setAccent(seed.accent)
    setDensity(seed.step ?? 0.043)
    setWallpaper('')
    const el = document.documentElement
    const preset = generateTheme(seed)
    for (const [k, val] of Object.entries(preset)) el.style.setProperty(k, val)
    toast('已恢复当前主题默认值')
  }

  const handleExport = () => {
    const css = `:root {\n${Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`
    const blob = new Blob([css], { type: 'text/css' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `pi-theme-${theme}-${accent.replace('#', '')}.css`
    a.click(); URL.revokeObjectURL(url)
    toast('CSS 变量已导出')
  }

  return (
    <div className="flex h-full overflow-hidden flex-col md:flex-row">
      {/* 左：控制面板（移动端全宽顶部条）；桌面 w-72 侧栏 */}
      <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-pi-border-soft overflow-y-auto p-4 flex flex-col gap-4 md:flex-shrink-0 max-h-[45%] md:max-h-none">
        <div className="text-sm font-semibold text-pi-text">主题工作台</div>

        {/* 基底主题 */}
        <div>
          <div className="text-[11px] text-pi-dim2 font-semibold mb-1.5">基底主题</div>
          <div className="grid grid-cols-3 gap-1.5">
            {THEME_PRESETS.map(t => (
              <button key={t.id} onClick={() => setTheme(t.id)}
                className={`flex flex-col items-center gap-1 p-2 rounded-pi-sm text-[10px] transition-colors
                  ${theme === t.id ? 'bg-pi-accent-soft text-pi-accent' : 'hover:bg-pi-bg3 text-pi-dim'}`}>
                <span className="w-6 h-6 rounded-full border border-pi-border" style={{ background: t.swatch }} />
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* 主色 */}
        <div>
          <div className="text-[11px] text-pi-dim2 font-semibold mb-1.5">主色</div>
          <div className="flex gap-1.5 mb-2">
            {ACCENT_PRESETS.map(a => (
              <button key={a.color} title={a.name}
                className={`w-7 h-7 rounded-full transition-transform hover:scale-110
                  ${accent === a.color ? 'ring-2 ring-offset-1 ring-pi-text ring-offset-pi-bg' : ''}`}
                style={{ background: a.color }} onClick={() => setAccent(a.color)} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={accent} onChange={e => setAccent(e.target.value)}
              className="w-8 h-7 rounded-pi-sm border border-pi-border-soft bg-transparent cursor-pointer p-0" />
            <input value={accent} onChange={e => setAccent(e.target.value)}
              className="flex-1 text-[11px] font-mono bg-pi-field border border-pi-border-soft rounded-pi-sm px-2 py-1 text-pi-text outline-none focus:border-pi-accent" />
          </div>
          <div className="text-[10px] text-pi-dim mt-1">
            L={hexToOklch(accent).L.toFixed(3)} C={hexToOklch(accent).C.toFixed(3)}
          </div>
        </div>

        {/* 密度 */}
        <div>
          <div className="text-[11px] text-pi-dim2 font-semibold mb-1.5">
            层级密度 <span className="text-pi-dim font-normal">step={density.toFixed(3)}</span>
          </div>
          <input type="range" min="0.02" max="0.08" step="0.001" value={density}
            onChange={e => setDensity(parseFloat(e.target.value))}
            className="w-full accent-pi-accent" />
          <div className="flex justify-between text-[9px] text-pi-dim mt-0.5">
            <span>平坦</span><span>立体</span>
          </div>
        </div>

        {/* 壁纸 */}
        <div>
          <div className="text-[11px] text-pi-dim2 font-semibold mb-1.5">壁纸</div>
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {WALL_PRESETS.map(p => (
              <button key={p.label} onClick={() => setWallpaper(p.value)}
                className={`px-2 py-1 rounded-pi-sm text-[10px] transition-colors
                  ${wallpaper === p.value ? 'bg-pi-accent-soft text-pi-accent' : 'hover:bg-pi-bg3 text-pi-dim'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <input type="text"
            value={wallpaper.startsWith('http') || wallpaper.startsWith('data:') || wallpaper.startsWith('linear') ? wallpaper : ''}
            placeholder="图片 URL 或渐变 CSS…"
            onChange={e => setWallpaper(e.target.value)}
            className="w-full text-[10px] bg-pi-field border border-pi-border-soft rounded-pi-sm px-2 py-1 text-pi-text outline-none focus:border-pi-accent mb-2" />
          <div className="flex gap-2">
            <button onClick={() => fileRef.current?.click()}
              className="flex-1 px-2 py-1.5 text-[10px] rounded-pi-sm border border-pi-border text-pi-dim hover:bg-pi-bg3">
              上传图片
            </button>
            {wallpaper && (
              <button onClick={() => setWallpaper('')}
                className="px-2 py-1.5 text-[10px] rounded-pi-sm border border-pi-border text-pi-red hover:bg-pi-bg3">
                清除
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]; if (!f) return
              const reader = new FileReader()
              reader.onload = () => setWallpaper(reader.result as string)
              reader.readAsDataURL(f)
              e.target.value = ''
            }} />
          {wallpaper && (
            <div className="mt-2 h-12 rounded-pi-sm border border-pi-border overflow-hidden"
              style={{ backgroundImage: `url(${wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
          )}
        </div>

        {/* 操作 */}
        <div className="flex gap-2 mt-auto">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 btn-primary py-2 text-xs rounded-pi-md">
            {saving ? '保存中…' : '保存到服务端'}
          </button>
          <button onClick={handleReset}
            className="px-3 py-2 text-xs rounded-pi-md border border-pi-border text-pi-dim hover:bg-pi-bg3">
            重置
          </button>
        </div>
        <button onClick={handleExport}
          className="w-full py-2 text-xs rounded-pi-md border border-pi-border text-pi-dim hover:bg-pi-bg3">
          导出 CSS 变量
        </button>
      </div>

      {/* 右：实时预览 */}
      <div ref={previewRef} className="flex-1 overflow-y-auto p-4 sm:p-8" style={{
        background: tokens['--pi-bg'],
        color: tokens['--pi-text'],
      }}>
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="text-[17px] font-bold" style={{ color: tokens['--pi-text'] }}>实时预览</div>
          <div className="text-[13px]" style={{ color: tokens['--pi-dim'] }}>
            调整左侧面板，这里即时反映所有 token 变化
          </div>

          {/* 卡片 */}
          <div className="rounded-pi-lg p-4" style={{
            background: tokens['--pi-card-bg'],
            border: `1px solid ${tokens['--pi-card-border']}`,
          }}>
            <div className="text-[13px] font-semibold mb-1.5" style={{ color: tokens['--pi-text'] }}>卡片组件</div>
            <div className="text-[12px]" style={{ color: tokens['--pi-dim'] }}>
              背景 --pi-card-bg，边框 --pi-card-border
            </div>
          </div>

          {/* 按钮组 */}
          <div className="flex gap-2 flex-wrap">
            <button className="px-4 py-2 rounded-pi-md text-[12px] font-medium text-white"
              style={{ background: tokens['--pi-accent'] }}>主按钮</button>
            <button className="px-4 py-2 rounded-pi-md text-[12px] font-medium"
              style={{ background: tokens['--pi-btn-bg'], border: `1px solid ${tokens['--pi-btn-border']}`, color: tokens['--pi-text'] }}>
              次按钮
            </button>
            <button className="px-4 py-2 rounded-pi-md text-[12px] font-medium text-white"
              style={{ background: tokens['--pi-danger'] }}>危险</button>
            <button className="px-4 py-2 rounded-pi-md text-[12px] font-medium text-white"
              style={{ background: tokens['--pi-success'] }}>成功</button>
          </div>

          {/* Badge */}
          <div className="flex gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-pi-pill text-[10px] font-medium"
              style={{ background: tokens['--pi-badge-bg'], color: tokens['--pi-badge-fg'] }}>信息</span>
            <span className="px-2.5 py-0.5 rounded-pi-pill text-[10px] font-medium"
              style={{ background: tokens['--pi-accent-soft'], color: tokens['--pi-accent'] }}>强调</span>
            <span className="px-2.5 py-0.5 rounded-pi-pill text-[10px] font-medium"
              style={{ background: 'rgba(59,130,246,0.15)', color: tokens['--pi-info'] }}>提示</span>
          </div>

          {/* 输入框 */}
          <div>
            <div className="text-[11px] mb-1" style={{ color: tokens['--pi-dim2'] }}>输入框</div>
            <input className="w-full px-3 py-2 rounded-pi-md text-[13px] outline-none"
              style={{ background: tokens['--pi-input-bg'], border: `1px solid ${tokens['--pi-input-border']}`, color: tokens['--pi-text'] }}
              placeholder="输入内容…" />
          </div>

          {/* 文字层级 */}
          <div className="space-y-1">
            <div className="text-[17px] font-bold" style={{ color: tokens['--pi-text'] }}>标题 --pi-text</div>
            <div className="text-[13px]" style={{ color: tokens['--pi-dim'] }}>辅助 --pi-dim</div>
            <div className="text-[12px]" style={{ color: tokens['--pi-dim2'] }}>次要 --pi-dim2</div>
            <div className="text-[11px]" style={{ color: tokens['--pi-muted'] }}>弱化 --pi-muted</div>
          </div>

          {/* 图表色 */}
          <div>
            <div className="text-[11px] mb-2" style={{ color: tokens['--pi-dim2'] }}>图表色板</div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="w-8 h-8 rounded-pi-sm"
                  style={{ background: tokens[`--pi-chart-${i}` as keyof typeof tokens] }} />
              ))}
            </div>
          </div>

          {/* Glass */}
          <div>
            <div className="text-[11px] mb-2" style={{ color: tokens['--pi-dim2'] }}>Glass</div>
            <div className="rounded-pi-lg p-4 backdrop-blur-sm"
              style={{ background: tokens['--pi-glass-bg'], border: `1px solid ${tokens['--pi-glass-border']}` }}>
              <div className="text-[12px]" style={{ color: tokens['--pi-text'] }}>Glass 面板</div>
            </div>
          </div>

          {/* 阴影 */}
          <div className="flex gap-4">
            {[['sm', 'sm'], ['md', 'md'], ['lg', 'lg']].map(([k, label]) => (
              <div key={k} className="w-24 h-16 rounded-pi-md flex items-center justify-center text-[10px]"
                style={{ background: tokens['--pi-card-bg'], boxShadow: tokens[`--pi-shadow-${k}` as keyof typeof tokens], color: tokens['--pi-dim2'] }}>
                shadow-{label}
              </div>
            ))}
          </div>

          {/* 圆角 */}
          <div>
            <div className="text-[11px] mb-2" style={{ color: tokens['--pi-dim2'] }}>圆角</div>
            <div className="flex gap-3">
              {['sm', 'md', 'lg', 'xl'].map(k => (
                <div key={k} className="w-12 h-12 flex items-center justify-center text-[10px]"
                  style={{ background: tokens['--pi-card-bg'], border: `1px solid ${tokens['--pi-border']}`, borderRadius: tokens[`--pi-r-${k}` as keyof typeof tokens], color: tokens['--pi-dim2'] }}>
                  r-{k}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ThemeEditorPage() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('pi_theme') || 'mist' } catch { return 'mist' }
  })
  const [accent, setAccent] = useState(() => {
    try { return localStorage.getItem('pi_accent') || '' } catch { return '' }
  })
  const [wallpaper, setWallpaper] = useState(() => {
    try { return localStorage.getItem('pi_wallpaper') || '' } catch { return '' }
  })

  useEffect(() => {
    // 从 localStorage 读最近一次用户选择(ThemeSwitcher 切主题已写 localStorage)
    const lt = (() => { try { return localStorage.getItem('pi_theme') || '' } catch { return '' } })()
    const la = (() => { try { return localStorage.getItem('pi_accent') || '' } catch { return '' } })()
    const lw = (() => { try { return localStorage.getItem('pi_wallpaper') || '' } catch { return '' } })()
    if (lt) setTheme(lt)
    if (la) setAccent(la)
    if (lw) setWallpaper(lw)
    // 服务端 theme-prefs 作为后备(仅当 localStorage 无值时); 不覆盖 localStorage 的权威值
    ThemeApi.get().then(d => {
      if (d?.theme && !lt) setTheme(d.theme)
      if (d?.accent && !la) setAccent(d.accent)
      if (d?.wallpaper && !lw) setWallpaper(d.wallpaper)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    try { localStorage.setItem('pi_theme', theme) } catch {}
    try { localStorage.setItem('pi_accent', accent) } catch {}
    try { localStorage.setItem('pi_wallpaper', wallpaper) } catch {}
  }, [theme, accent, wallpaper])

  return <App accent={accent} setAccent={setAccent} theme={theme} setTheme={setTheme} wallpaper={wallpaper} setWallpaper={setWallpaper} />
}
