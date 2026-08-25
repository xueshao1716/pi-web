import { useRef, useState } from 'react'
import { BarChart3, BookOpen, Zap, Package } from 'lucide-react'
import { WorkshopApi, withFileToken } from '../api'

// ── 专项工作台：PPT / 小说生成（SSE 长任务，收编自 vanilla）──

type Kind = 'ppt' | 'novel'
interface Artifact { name: string; path: string; size?: number }

export default function WorkshopView() {
  const [kind, setKind] = useState<Kind>('ppt')
  // PPT 表单
  const [theme, setTheme] = useState('')
  const [pages, setPages] = useState(10)
  const [style, setStyle] = useState('专业商务')
  const [audience, setAudience] = useState('')
  // 小说表单
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState('xianxia')
  const [protagonist, setProtagonist] = useState('')
  const [setting, setSetting] = useState('')
  const [chapters, setChapters] = useState(1)
  // 运行态
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const abortRef = useRef<(() => void) | null>(null)

  const append = (s: string) => setLog(prev => [...prev.slice(-200), s])

  const run = () => {
    if (running) return
    if (kind === 'ppt' && !theme.trim()) return
    if (kind === 'novel' && !title.trim()) return
    setRunning(true); setLog([]); setArtifacts([])
    const body = kind === 'ppt'
      ? { theme: theme.trim(), pages, style, audience }
      : { title: title.trim(), genre, protagonist, setting, chapters }
    let sawDone = false
    abortRef.current = WorkshopApi.run(kind, body, ev => {
      const d = ev.data || {}
      switch (ev.type) {
        case 'note': append('· ' + (d.text || '')); break
        case 'delta': break // delta 是模型全文流，量太大不进日志（产物为准）
        case 'file':
          if (d.path) { setArtifacts(prev => [...prev, d]); append(`[产物] ${d.name}`) }
          break
        case 'error': append('[错误] ' + (d.message || d.error || '未知错误')); break
        case 'done':
          sawDone = true
          if (!d.file && !artifacts.length) append(d.ok ? '[完成]' : '[警告] 流程结束，未检测到产物')
          else append('[完成]')
          setRunning(false)
          break
      }
      if (ev.type === 'done') { if (!sawDone) setRunning(false) }
    })
  }

  const stop = () => { abortRef.current?.(); setRunning(false); append('[已手动停止]') }

  return (
    <div className="space-y-4">
      {/* 类型切换 */}
      <div className="flex rounded-pi-md overflow-hidden border border-pi-border w-fit">
        {([['ppt', BarChart3, 'PPT 生成'], ['novel', BookOpen, '小说工坊']] as const).map(([k, Icon, label]) => (
          <button key={k} onClick={() => !running && setKind(k)}
            className={`text-xs px-4 py-2 inline-flex items-center gap-1.5 transition-colors ${kind === k ? 'bg-pi-accent text-white' : 'bg-pi-bg2 text-pi-dim hover:text-pi-text disabled:opacity-60'}`}
            disabled={running}><Icon className="w-3.5 h-3.5" strokeWidth={1.8} />{label}</button>
        ))}
      </div>

      {/* 表单 */}
      {kind === 'ppt' ? (
        <div className="panel !p-4 space-y-3">
          <input className="input-pi text-[13px]" placeholder="PPT 主题，如：Q3 产品复盘汇报" value={theme} onChange={e => setTheme(e.target.value)} />
          <div className="flex gap-2 flex-wrap">
            <label className="text-xs text-pi-dim flex items-center gap-1.5">页数
              <input type="number" min={3} max={25} className="input-pi !py-1.5 text-xs w-20" value={pages} onChange={e => setPages(+e.target.value)} />
            </label>
            <label className="text-xs text-pi-dim flex items-center gap-1.5">风格
              <input className="input-pi !py-1.5 text-xs w-32" placeholder="专业商务" value={style} onChange={e => setStyle(e.target.value)} />
            </label>
            <label className="text-xs text-pi-dim flex items-center gap-1.5">受众
              <input className="input-pi !py-1.5 text-xs w-40" placeholder="可选" value={audience} onChange={e => setAudience(e.target.value)} />
            </label>
          </div>
        </div>
      ) : (
        <div className="panel !p-4 space-y-3">
          <input className="input-pi text-[13px]" placeholder="书名" value={title} onChange={e => setTitle(e.target.value)} />
          <div className="flex gap-2 flex-wrap">
            <label className="text-xs text-pi-dim flex items-center gap-1.5">题材
              <select className="input-pi !py-1.5 text-xs w-28" value={genre} onChange={e => setGenre(e.target.value)}>
                <option value="xianxia">仙侠</option><option value="urban">都市</option>
                <option value="scifi">科幻</option><option value="history">历史</option>
                <option value="mystery">悬疑</option>
              </select>
            </label>
            <label className="text-xs text-pi-dim flex items-center gap-1.5">章节数
              <input type="number" min={1} max={10} className="input-pi !py-1.5 text-xs w-20" value={chapters} onChange={e => setChapters(+e.target.value)} />
            </label>
          </div>
          <input className="input-pi text-[13px]" placeholder="主角设定（可选）" value={protagonist} onChange={e => setProtagonist(e.target.value)} />
          <input className="input-pi text-[13px]" placeholder="世界观/金手指设定（可选）" value={setting} onChange={e => setSetting(e.target.value)} />
        </div>
      )}

      {/* 运行条 */}
      <div className="flex items-center gap-2">
        {running
          ? <button className="h-8 px-4 rounded-full bg-red-500/90 text-white text-xs font-medium animate-pulse" onClick={stop}>⏹ 停止</button>
          : <button className="btn-primary text-xs px-4 py-2" onClick={run}>开始{kind === 'ppt' ? '生成 PPT' : '创作小说'}</button>}
        <span className="text-[11px] text-pi-dim2">{kind === 'ppt' ? '走 ppt-generator 技能全流程，通常需要几分钟' : '走 novel-forge v10 全流程，单章可能较久'}</span>
      </div>

      {/* 过程日志 */}
      {log.length > 0 && (
        <div className="panel !p-3 max-h-56 overflow-y-auto font-mono text-[12px] leading-relaxed">
          {log.map((l, i) => (
            <div key={i} className={l.startsWith('[错误]') ? 'text-red-400' : l.startsWith('[完成]') || l.startsWith('[产物]') ? 'text-emerald-300' : l.startsWith('[警告]') ? 'text-amber-300' : 'text-pi-dim'}>{l}</div>
          ))}
        </div>
      )}

      {/* 产物 */}
      {artifacts.length > 0 && (
        <div className="space-y-1.5">
          {artifacts.map(a => (
            <a key={a.path} href={withFileToken(`/api/ws/file?path=${encodeURIComponent(a.path)}`)} target="_blank" rel="noreferrer"
              className="panel !p-3 flex items-center gap-2.5 hover:border-pi-accent/40 transition-colors">
              <Package className="w-4 h-4 flex-shrink-0" />
              <span className="text-[13px] text-pi-text flex-1 truncate">{a.name}</span>
              {a.size ? <span className="text-[10px] text-pi-dim2">{(a.size / 1024).toFixed(0)} KB</span> : null}
              <span className="text-xs text-pi-accent">下载 ↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
