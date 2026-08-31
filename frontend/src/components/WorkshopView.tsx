import { useRef, useState } from 'react'
import { Package } from 'lucide-react'
import { WorkshopApi, withFileToken } from '../api'

// ── 专项长文生成器（SSE 长任务，收编自 vanilla）：08-27 起仅承载 PPT（小说已迁 NovelStudioView 书架式）──

export type Kind = 'ppt'
interface Artifact { name: string; path: string; size?: number }

export default function WorkshopView({ kind }: { kind: Kind }) {
  // PPT 表单
  const [theme, setTheme] = useState('')
  const [pages, setPages] = useState(10)
  const [style, setStyle] = useState('专业商务')
  const [audience, setAudience] = useState('')
  // 运行态
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  // 工具进度卡片（A：实时展示 agent 执行到哪步）
  const [steps, setSteps] = useState<{ id: string; name: string; args: string; status: 'running' | 'done' | 'error'; output?: string }[]>([])
  const abortRef = useRef<(() => void) | null>(null)

  const append = (s: string) => setLog(prev => [...prev.slice(-200), s])

  const run = () => {
    if (running) return
    if (!theme.trim()) return
    setRunning(true); setLog([]); setArtifacts([]); setSteps([])
    const body = { theme: theme.trim(), pages, style, audience }
    let sawDone = false
    abortRef.current = WorkshopApi.run(kind, body, ev => {
      const d = ev.data || {}
      switch (ev.type) {
        case 'note': append('· ' + (d.text || '')); break
        case 'tool': {
          // 工具开始：加一张 running 卡片（A 实时进度）
          const argsText = typeof d.args === 'object' && d.args !== null
            ? (d.args.command || d.args.path || d.args.prompt || JSON.stringify(d.args).slice(0, 100))
            : String(d.args || '')
          setSteps(prev => [...prev, { id: d.id || 't' + Date.now(), name: d.name || 'tool', args: argsText, status: 'running' }])
          break
        }
        case 'tool_end': {
          setSteps(prev => prev.map(s => s.id === d.id ? { ...s, status: (d.isError ? 'error' : 'done'), output: (d.output || '').slice(0, 120) } : s))
          break
        }
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
      {/* 表单 */}
      <div className="panel !p-3 space-y-3">
          <input className="input-pi text-[13px]" placeholder="PPT 主题，如：Q3 产品复盘汇报" value={theme} onChange={e => setTheme(e.target.value)} />
          <div className="flex gap-2 flex-wrap">
            <label className="text-xs text-pi-dim flex items-center gap-1.5">页数
              <input type="number" min={3} max={25} className="input-pi !py-1.5 text-xs w-20" value={pages} onChange={e => setPages(+e.target.value)} />
            </label>
            <label className="text-xs text-pi-dim flex items-center gap-1.5">风格
              <select className="input-pi !py-1.5 text-xs w-28" value={style} onChange={e => setStyle(e.target.value)}>
                <option>专业商务</option><option>学术汇报</option><option>简约科技</option><option>创意活泼</option><option>国风典雅</option>
              </select>
            </label>
            <label className="text-xs text-pi-dim flex items-center gap-1.5">受众
              <input className="input-pi !py-1.5 text-xs w-32" placeholder="可选" value={audience} onChange={e => setAudience(e.target.value)} />
            </label>
          </div>
      </div>

      {/* 运行条 */}
      <div className="flex items-center gap-2">
        {running
          ? <button className="h-8 px-4 rounded-pi-md bg-red-500/90 text-white text-xs font-medium animate-pulse" onClick={stop}>⏹ 停止</button>
          : <button className="btn-primary text-xs px-4 py-2" onClick={run}>开始生成 PPT</button>}
        <span className="text-[11px] text-pi-dim2">走 ppt-generator 技能全流程，通常需要几分钟；小说请去「小说工坊」Tab</span>
      </div>

      {/* 执行进度（A：agent 步骤卡片，实时看到执行到哪步）*/}
      {steps.length > 0 && (
        <div className="space-y-1.5">
          {steps.map((s, i) => (
            <div key={s.id || i} className="panel !p-2.5 flex items-start gap-2.5">
              <span className={`mt-0.5 w-5 h-5 rounded-pi-sm flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${s.status === 'running' ? 'bg-pi-accent/20 text-pi-accent' : s.status === 'error' ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-300'}`}>
                {s.status === 'running' ? <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-pi-accent/25 border-t-pi-accent animate-spin"/> : s.status === 'error' ? '✕' : '✓'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="font-mono font-semibold text-pi-text">{s.name}</span>
                  <span className={`text-[10px] ${s.status === 'running' ? 'text-pi-accent' : s.status === 'error' ? 'text-red-400' : 'text-pi-dim2'}`}>{s.status === 'running' ? '执行中' : s.status === 'error' ? '出错' : '完成'}</span>
                </div>
                {s.args && <div className="text-[11px] text-pi-dim font-mono truncate mt-0.5">{s.args}</div>}
                {s.output && <div className="text-[11px] text-pi-dim2 mt-0.5 line-clamp-2">{s.output}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

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
              className="panel !p-3 flex items-center gap-2.5 glow-hover">
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
