import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Code2, Download, RotateCcw, Trash2, Upload } from 'lucide-react'
import { generateTheme, SEEDS } from '../theme/generate.mjs'
import { applyTheme, currentTheme } from '../theme/apply'
import { ThemeApi } from '../api'
import PageHeader from '../components/PageHeader'
import SectionHeader from '../components/SectionHeader'
import { toast } from '../components/Toast'

type Seed = { bg: string; text: string; accent: string; step: number; light?: boolean; overrides?: Record<string, string> }

const THEME_META: Record<string, { label: string; desc: string }> = {
  mist: { label: '晨雾', desc: '浅色 · 冷靛蓝主色' },
  kraft: { label: '牛皮纸', desc: '浅色 · 暖纸质感' },
  ink: { label: '墨黑', desc: '深色 · 极简石墨' },
  violet: { label: '紫晶', desc: '深色 · 紫罗兰光晕' },
  sepia: { label: '褐纱', desc: '深色 · 暖褐护眼' },
  moss: { label: '苔原', desc: '深色 · 苔绿自然系' },
  azure: { label: '远岚', desc: '深色 · 天青蓝调' },
}

const ACCENT_SWATCHES = ['#5468ff', '#8b7cf6', '#38bdf8', '#34d399', '#f59e0b', '#f47067', '#ec4899', '#d97706']

const WALL_PRESETS = [
  { label: '无', value: '' },
  { label: '深空', value: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0a0a1a 100%)' },
  { label: '极光', value: 'linear-gradient(135deg, #0d1117 0%, #161b22 30%, #1a3a4a 60%, #0d1117 100%)' },
  { label: '暮光', value: 'linear-gradient(180deg, #1a0a2e 0%, #2d1b4e 40%, #4a1942 70%, #1a0a2e 100%)' },
  { label: '暖纸', value: 'linear-gradient(135deg, #f5e6d3 0%, #e8d5b7 50%, #f0e0c8 100%)' },
]

function seedVars(theme: string, accentOverride = '', stepOverride = 0): Record<string, string> {
  const seed = (SEEDS as any)[theme] as Seed
  if (!seed) return {}
  const s = { ...seed, accent: accentOverride || seed.accent }
  if (stepOverride > 0) s.step = stepOverride
  return generateTheme(s) as Record<string, string>
}

function applyWallpaperEl(wallpaper: string) {
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
}

function ThemeCard({ id, active, onApply }: { id: string; active: boolean; onApply: () => void }) {
  const vars = useMemo(() => seedVars(id), [id])
  const meta = THEME_META[id] || { label: id, desc: '' }
  const seed = (SEEDS as any)[id] as Seed

  return (
    <button
      type="button"
      onClick={onApply}
      aria-pressed={active}
      className={`relative overflow-hidden rounded-pi-lg border text-left transition-[border-color,box-shadow,transform] ${active ? 'border-pi-accent ring-2 ring-pi-accent/30' : 'border-pi-border hover:border-pi-border-hi'}`}
      style={vars as any}
    >
      <div className="h-24 p-3 flex flex-col gap-1.5" style={{ background: 'var(--pi-bg)' }}>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--pi-green)' }} />
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--pi-yellow)' }} />
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--pi-red)' }} />
          <span className="ml-auto text-[11px]" style={{ color: 'var(--pi-dim)', fontFamily: 'var(--pi-font-mono)' }}>{id}</span>
        </div>
        <div className="self-start max-w-[80%] px-2.5 py-1 text-[11px] rounded-pi-md" style={{ background: 'var(--pi-bg2)', color: 'var(--pi-text)' }}>
          你好，小语在
        </div>
        <div className="self-end max-w-[80%] px-2.5 py-1 text-[11px] rounded-pi-md" style={{ background: 'var(--pi-accent)', color: 'var(--pi-bg)' }}>
          切到这个主题
        </div>
      </div>
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'var(--pi-bg1)', borderTop: '1px solid var(--pi-border)' }}>
        <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: seed?.accent }} />
        <span className="text-[13px] font-medium" style={{ color: 'var(--pi-text)' }}>{meta.label}</span>
        <span className="text-[11px] truncate" style={{ color: 'var(--pi-dim2)' }}>{meta.desc}</span>
        {active && (
          <span className="ml-auto flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-pi-sm flex-shrink-0" style={{ background: 'var(--pi-accent-soft)', color: 'var(--pi-accent-soft-fg)' }}>
            <Check className="w-3 h-3" aria-hidden="true" />当前
          </span>
        )}
      </div>
    </button>
  )
}

export default function Themes() {
  const init = useRef(currentTheme())
  const [theme, setTheme] = useState(init.current.theme)
  const [accent, setAccent] = useState(init.current.accent)
  const [density, setDensity] = useState<number>(() => ((SEEDS as any)[init.current.theme]?.step) || 0.043)
  const [wallpaper, setWallpaper] = useState(() => { try { return localStorage.getItem('pi_wallpaper') || '' } catch { return '' } })
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { applyTheme(theme, accent) }, [theme, accent])
  useEffect(() => {
    const s = (SEEDS as any)[theme] as Seed
    if (s) setDensity(s.step ?? 0.043)
  }, [theme])

  useEffect(() => {
    const vars = seedVars(theme, accent, density)
    const el = document.documentElement as any
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v)
  }, [theme, accent, density])

  useEffect(() => {
    applyWallpaperEl(wallpaper)
    try { localStorage.setItem('pi_wallpaper', wallpaper) } catch {}
  }, [wallpaper])

  const saveAll = async () => {
    try {
      await ThemeApi.save(theme, accent, wallpaper)
      window.dispatchEvent(new CustomEvent('pi-wallpaper-changed'))
      toast('已保存到服务端（所有端同步）', 'ok')
    } catch { toast('保存失败', 'error') }
  }

  const handleReset = () => {
    const s = (SEEDS as any)[theme] as Seed
    setAccent(s.accent)
    setDensity(s.step ?? 0.043)
    toast('已恢复该主题默认值')
  }

  const exportCss = () => {
    const tokens = seedVars(theme, accent, density)
    const css = `:root {\n${Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`
    const blob = new Blob([css], { type: 'text/css' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pi-theme-${theme}.css`
    a.click()
    URL.revokeObjectURL(url)
    toast('CSS 变量已导出')
  }

  const ids = Object.keys(SEEDS).filter(k => THEME_META[k])
  const tokens = seedVars(theme, accent, density)

  return (
    <div className="h-full overflow-y-auto page-enter">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <PageHeader
          title="主题系统"
          description="选择一套外观基底，再精调主色、层级密度与壁纸；修改会即时应用，保存后同步到所有端。"
          meta={<span className="text-[11px] text-pi-dim2">当前：{THEME_META[theme]?.label || theme}</span>}
        />

        <section data-slot="theme-gallery" className="mb-8">
          <SectionHeader title="主题画廊" description="选择基底会立即应用，并将密度恢复为该主题的默认层级。" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ids.map(id => (
              <ThemeCard
                key={id}
                id={id}
                active={theme === id}
                onApply={() => { setTheme(id); toast(`已切换：${THEME_META[id]?.label || id}`, 'ok') }}
              />
            ))}
          </div>
        </section>

        <section data-slot="theme-workbench" className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] gap-5 items-start mb-8">
          <div>
            <SectionHeader title="实时预览" description="预览使用当前主题变量，精调结果会同步反映在整个工作台。" />
            <div className="rounded-pi-lg border border-pi-border overflow-hidden lg:sticky lg:top-6">
              <div className="p-4 sm:p-5 space-y-3" style={{ background: 'var(--pi-bg)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] px-2 py-0.5 rounded-pi-sm" style={{ background: 'var(--pi-accent-soft)', color: 'var(--pi-accent-soft-fg)' }}>{THEME_META[theme]?.label || theme}</span>
                  <span className="text-[11px]" style={{ color: 'var(--pi-dim2)' }}>step {density.toFixed(3)}</span>
                </div>
                <div className="max-w-[82%] px-3 py-2 text-[13px] rounded-pi-md" style={{ background: 'var(--pi-bg2)', color: 'var(--pi-text)' }}>
                  主题不只是换色，底色层级、文字对比和阴影色相会一起派生。
                </div>
                <div className="ml-auto max-w-[82%] px-3 py-2 text-[13px] rounded-pi-md" style={{ background: 'var(--pi-accent)', color: 'var(--pi-bg)' }}>
                  当前精调会在这里实时呈现。
                </div>
                <div className="flex gap-2 pt-1">
                  <span className="flex-1 h-9 rounded-pi-md border px-3 flex items-center text-[12px]" style={{ borderColor: 'var(--pi-border)', background: 'var(--pi-field)', color: 'var(--pi-dim2)' }}>输入消息…</span>
                  <span className="px-3 h-9 rounded-pi-md flex items-center text-[12px] font-medium" style={{ background: 'var(--pi-accent)', color: 'var(--pi-bg)' }}>发送</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <SectionHeader title="精调当前主题" description="调整主色、层级密度和工作台壁纸。" />
            <div className="panel !p-4 space-y-5">
              <div>
                <div className="text-[12px] text-pi-dim2 font-semibold mb-2">主色</div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={`w-8 h-8 rounded-full border-2 text-[11px] flex items-center justify-center ${!accent ? 'border-pi-accent' : 'border-pi-border'}`} style={{ background: (SEEDS as any)[theme]?.accent, color: 'var(--pi-bg)' }} onClick={() => setAccent('')} title="主题默认主色">默认</button>
                  {ACCENT_SWATCHES.map(c => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setAccent(c)}
                      aria-label={`使用主色 ${c}`}
                      aria-pressed={accent === c}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${accent === c ? 'border-pi-accent scale-110' : 'border-transparent'}`}
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                  <label className="flex items-center gap-1.5 text-[12px] text-pi-dim2 cursor-pointer ml-1">
                    自定义
                    <input
                      type="color"
                      value={accent || (SEEDS as any)[theme]?.accent || '#5468ff'}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent border border-pi-border"
                      onChange={e => setAccent(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div>
                <div className="text-[12px] text-pi-dim2 font-semibold mb-2">
                  层级密度 <span className="text-[11px] text-pi-dim font-normal">step={density.toFixed(3)}，数值越大层级越明显</span>
                </div>
                <input
                  type="range"
                  min="0.02"
                  max="0.08"
                  step="0.001"
                  value={density}
                  aria-label="层级密度"
                  onChange={e => setDensity(parseFloat(e.target.value))}
                  className="w-full accent-pi-accent"
                />
              </div>

              <div>
                <div className="text-[12px] text-pi-dim2 font-semibold mb-2">壁纸</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {WALL_PRESETS.map(p => (
                    <button
                      type="button"
                      key={p.label}
                      onClick={() => setWallpaper(p.value)}
                      aria-pressed={wallpaper === p.value}
                      className={`px-2.5 py-1.5 rounded-pi-sm text-[12px] transition-colors ${wallpaper === p.value ? 'bg-pi-accent-soft text-pi-accent' : 'hover:bg-pi-bg3 text-pi-dim'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap sm:flex-nowrap gap-2">
                  <input
                    type="text"
                    value={wallpaper.startsWith('http') || wallpaper.startsWith('data:') || wallpaper.startsWith('linear') ? wallpaper : ''}
                    placeholder="图片 URL 或渐变 CSS…"
                    onChange={e => setWallpaper(e.target.value)}
                    className="flex-1 text-[12px] font-mono bg-pi-field border border-pi-border rounded-pi-sm px-2.5 py-1.5 text-pi-text outline-none focus:border-pi-accent min-w-0"
                  />
                  <button type="button" onClick={() => fileRef.current?.click()} className="px-2.5 py-1.5 text-[12px] rounded-pi-sm border border-pi-border text-pi-dim hover:bg-pi-bg3 inline-flex items-center gap-1.5 flex-shrink-0">
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />上传
                  </button>
                  {wallpaper && (
                    <button type="button" onClick={() => setWallpaper('')} className="px-2.5 py-1.5 text-[12px] rounded-pi-sm border border-pi-border text-pi-danger hover:bg-pi-bg3 inline-flex items-center gap-1.5 flex-shrink-0" title="清除壁纸">
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />清除
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const reader = new FileReader()
                    reader.onload = () => setWallpaper(reader.result as string)
                    reader.readAsDataURL(f)
                    e.target.value = ''
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={saveAll} className="btn-primary text-xs px-3.5 py-1.5 inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />保存到服务端
                </button>
                <button type="button" onClick={handleReset} className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />重置
                </button>
              </div>
            </div>
          </div>
        </section>

        <details className="panel !p-0 overflow-hidden mb-4">
          <summary className="px-4 py-3 cursor-pointer select-none flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-pi-text">
              <Code2 className="w-4 h-4 text-pi-accent" aria-hidden="true" />开发者选项
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-pi-dim2 font-normal">
              Token 与 CSS 工具
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </summary>
          <div className="border-t border-pi-border-soft p-4 space-y-4">
            <div>
              <div className="text-[12px] font-semibold text-pi-text mb-2">Token 速览</div>
              <div className="flex gap-2 flex-wrap">
                {['--pi-bg', '--pi-bg1', '--pi-bg2', '--pi-bg3', '--pi-bg4'].map(k => (
                  <div key={k} className="flex flex-col items-center gap-1">
                    <span className="w-10 h-10 rounded-pi-sm border border-pi-border" style={{ background: tokens[k] }} />
                    <span className="text-[11px] text-pi-dim2 font-mono">{k.replace('--pi-', '')}</span>
                  </div>
                ))}
                <div className="flex flex-col items-center gap-1">
                  <span className="w-10 h-10 rounded-pi-sm border border-pi-border" style={{ background: tokens['--pi-accent'] }} />
                  <span className="text-[11px] text-pi-dim2 font-mono">accent</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="w-10 h-10 rounded-pi-sm border border-pi-border" style={{ background: tokens['--pi-green'] }} />
                  <span className="text-[11px] text-pi-dim2 font-mono">green</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              {['sm', 'md', 'lg'].map(k => (
                <div
                  key={k}
                  className="w-20 h-12 rounded-pi-md flex items-center justify-center text-[11px]"
                  style={{ background: tokens['--pi-bg2'], boxShadow: tokens[`--pi-shadow-${k}` as keyof typeof tokens], color: 'var(--pi-dim2)' }}
                >
                  shadow-{k}
                </div>
              ))}
            </div>
            <button type="button" onClick={exportCss} className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" aria-hidden="true" />导出 CSS
            </button>
          </div>
        </details>
      </div>
    </div>
  )
}
