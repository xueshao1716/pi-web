import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { BookOpen, ChevronLeft, Library, Plus, X } from 'lucide-react'
import { NovelApi, type NovelBook, type NovelChapter } from '../api'

// ── 小说工坊·书架式创作系统（收编自 novel-studio）：作品沉淀 / 真相文件一致性 / 第N章递进 ──

const GENRES: [string, string][] = [['xianxia', '仙侠'], ['urban', '都市'], ['scifi', '科幻'], ['history', '历史'], ['mystery', '悬疑']]
const NARRATORS = ['第三人称', '第一人称', '上帝视角']
const genreLabel = (g: string) => GENRES.find(([k]) => k === g)?.[1] || g

type Step = { id: string; name: string; args: string; status: 'running' | 'done' | 'error'; output?: string }

// ══ 书架 ══
function BookShelf({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, mutate, isLoading } = useSWR('novel-books', () => NovelApi.books(), { revalidateOnFocus: false })
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', genre: 'xianxia', narrator: '第三人称', protagonist: '', setting: '' })
  const [busy, setBusy] = useState(false)
  const books: NovelBook[] = data?.books || []

  const submit = async () => {
    if (!form.title.trim() || busy) return
    setBusy(true)
    try {
      const r = await NovelApi.create({
        title: form.title.trim(), genre: form.genre, narrator: form.narrator,
        protagonist: form.protagonist.trim(), setting: form.setting.trim(),
      })
      if (r.id) { await mutate(); onOpen(r.id); setCreating(false); setForm({ title: '', genre: 'xianxia', narrator: '第三人称', protagonist: '', setting: '' }) }
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5" onClick={() => setCreating(v => !v)}>
          <Plus className="w-3.5 h-3.5" />新建作品
        </button>
        <span className="text-[11px] text-pi-dim2">{books.length} 本作品 · 走 novel-forge v10 全流程</span>
      </div>

      {creating && (
        <div className="panel !p-3 space-y-2.5">
          <input className="input-pi text-[13px]" placeholder="书名 *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <div className="flex gap-2 flex-wrap">
            <label className="text-xs text-pi-dim flex items-center gap-1.5">题材
              <select className="input-pi !py-1.5 text-xs w-24" value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))}>
                {GENRES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="text-xs text-pi-dim flex items-center gap-1.5">叙事
              <select className="input-pi !py-1.5 text-xs w-24" value={form.narrator} onChange={e => setForm(f => ({ ...f, narrator: e.target.value }))}>
                {NARRATORS.map(n => <option key={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <input className="input-pi text-[13px]" placeholder="主角设定（可选，如：陈默，落魄刑警，能听见死者遗言）" value={form.protagonist} onChange={e => setForm(f => ({ ...f, protagonist: e.target.value }))} />
          <textarea className="input-pi text-[13px] min-h-[60px] resize-y" placeholder="世界观/金手指设定（可选）" value={form.setting} onChange={e => setForm(f => ({ ...f, setting: e.target.value }))} />
          <div className="flex justify-end"><button className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50" disabled={!form.title.trim() || busy} onClick={submit}>{busy ? '创建中…' : '建档'}</button></div>
        </div>
      )}

      {!isLoading && books.length === 0 && !creating && (
        <div className="panel !p-8 text-center">
          <Library className="w-8 h-8 mx-auto text-pi-dim2 mb-2" strokeWidth={1.5} />
          <p className="text-[13px] text-pi-dim">书架空空——建一本，写起来</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {books.map(b => (
          <button key={b.id} onClick={() => onOpen(b.id)} className="panel !p-3.5 text-left glow-hover group">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-9 h-9 rounded-pi-sm bg-pi-accent/15 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-4 h-4 text-pi-accent" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-pi-text truncate group-hover:text-pi-accent transition-colors duration-fast">《{b.title}》</div>
                <div className="text-[11px] text-pi-dim mt-0.5">{genreLabel(b.genre)} · {b.chapters} 章{narratorSuffix(b.narrator)}</div>
                {b.protagonist && <div className="text-[11px] text-pi-dim2 truncate mt-0.5">{b.protagonist}</div>}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
const narratorSuffix = (n?: string) => (n && n !== '第三人称' ? ` · ${n}` : '')

// ══ 章节阅读（全屏覆盖层）══
function ChapterReader({ id, ch, onClose }: { id: string; ch: NovelChapter; onClose: () => void }) {
  const { data, error } = useSWR(['novel-chapter', id, ch.file], ([, i, f]: readonly [string, string, string]) => NovelApi.chapter(i, f), { revalidateOnFocus: false })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className={`fixed inset-0 z-[var(--pi-z-modal)] flex flex-col bg-pi-bg`}>
      <div className="h-12 flex items-center gap-2 px-3 border-b border-pi-border-soft flex-shrink-0">
        <button className="touch-hit p-2 rounded-pi-md hover:bg-pi-bg2 text-pi-dim hover:text-pi-text" aria-label="关闭" onClick={onClose}><X className="w-4 h-4" /></button>
        <span className="text-[13px] font-medium truncate">第{String(ch.no).padStart(3, '0')}章</span>
        {!!data?.content && <span className="text-[10px] text-pi-dim2 flex-shrink-0">{data.content.length} 字</span>}
      </div>
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <article className="max-w-2xl mx-auto text-[15px] leading-[1.95] whitespace-pre-wrap text-pi-text">
          {error ? <span className="text-red-400 text-[13px]">加载失败：{(error as Error).message}</span>
            : !data ? <span className="text-pi-dim2 text-[13px]">加载中…</span> : data.content}
        </article>
      </div>
    </div>
  )
}

// ══ 作品工作台 ══
function BookWorkbench({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, error, mutate } = useSWR(['novel-detail', id], ([, i]: readonly [string, string]) => NovelApi.detail(i), { revalidateOnFocus: false })
  const meta = data?.meta || {}
  const chapters: NovelChapter[] = data?.chapters || []
  const nextCh = data?.nextCh || 1
  // 写作态
  const [outline, setOutline] = useState('')
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [reading, setReading] = useState<NovelChapter | null>(null)
  const abortRef = useRef<(() => void) | null>(null)

  const append = (s: string) => setLog(prev => [...prev.slice(-200), s])

  const write = () => {
    if (running) return
    setRunning(true); setLog([]); setSteps([])
    abortRef.current = NovelApi.write({ id, outline: outline.trim() || undefined }, ev => {
      const d = ev.data || {}
      switch (ev.type) {
        case 'note': append('· ' + (d.text || '')); break
        case 'tool': {
          const argsText = typeof d.args === 'object' && d.args !== null
            ? (d.args.command || d.args.path || d.args.prompt || JSON.stringify(d.args).slice(0, 100))
            : String(d.args || '')
          setSteps(prev => [...prev, { id: d.id || 't' + Date.now(), name: d.name || 'tool', args: argsText, status: 'running' }])
          break
        }
        case 'tool_end':
          setSteps(prev => prev.map(s => s.id === d.id ? { ...s, status: (d.isError ? 'error' : 'done'), output: (d.output || '').slice(0, 120) } : s))
          break
        case 'delta': break // 正文流不进日志（成稿为准，点章节读）
        case 'error': append('[错误] ' + (d.message || '未知错误')); break
        case 'done':
          setRunning(false)
          if (d.ok) { append(`[完成] 第 ${d.no} 章已入库`); mutate() }
          break
      }
    })
  }
  const stop = () => { abortRef.current?.(); setRunning(false); append('[已手动停止——引擎侧流程仍在收尾，稿子落盘后可在下方看到]') }

  if (error) return <div className="panel !p-6 text-[13px] text-red-400">加载失败：{(error as Error).message}</div>
  if (!data) return <div className="panel !p-6 text-[13px] text-pi-dim2">加载中…</div>
  if (data.error) return <div className="panel !p-6 text-[13px] text-red-400">{data.error}</div>

  return (
    <div className="space-y-4">
      {/* 回书架 */}
      <button className="flex items-center gap-1 text-xs text-pi-dim hover:text-pi-text transition-colors duration-fast touch-hit py-1" onClick={onBack}>
        <ChevronLeft className="w-3.5 h-3.5" />返回书架
      </button>

      {/* 作品档案头 */}
      <div className="panel !p-3">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-[17px] font-bold text-pi-text">《{meta.title}》</h2>
          <span className="text-[11px] text-pi-dim">{genreLabel(meta.genre)} · {meta.narrator || '第三人称'} · 已写 {chapters.length} 章 · 下一步：第 {nextCh} 章</span>
        </div>
        {(meta.protagonist || meta.setting) && (
          <div className="text-[12px] text-pi-dim mt-1.5 leading-relaxed">
            {meta.protagonist && <p>主角：{meta.protagonist}</p>}
            {meta.setting && <p>世界：{meta.setting}</p>}
          </div>
        )}
        {/* 真相摘要 */}
        {data.truth?.summaries?.length > 0 && (
          <details className="mt-2.5 text-[12px] text-pi-dim">
            <summary className="cursor-pointer select-none hover:text-pi-text transition-colors duration-fast">剧情梗概（前情提要）</summary>
            <ul className="mt-1.5 space-y-1 pl-4 list-disc">
              {data.truth.summaries.map((s: any, i: number) => <li key={i}>{typeof s === 'string' ? s : (s.summary || JSON.stringify(s)).slice(0, 120)}</li>)}
            </ul>
          </details>
        )}
      </div>

      {/* 续写条 */}
      <div className="panel !p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <input className="input-pi text-[13px] flex-1" placeholder={`第 ${nextCh} 章大纲（可选——留空则按既定伏笔自然推进）`} value={outline} onChange={e => setOutline(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          {running
            ? <button className="h-8 px-4 rounded-pi-md bg-red-500/90 text-white text-xs font-medium animate-pulse" onClick={stop}>⏹ 停止</button>
            : <button className="btn-primary text-xs px-4 py-2" onClick={write}>✍️ 续写第 {nextCh} 章</button>}
          <span className="text-[11px] text-pi-dim2">编辑部→审计→真相更新 全流程，一章约几分钟到十几分钟</span>
        </div>
      </div>

      {/* 执行进度 */}
      {steps.length > 0 && (
        <div className="space-y-1.5">
          {steps.map((s, i) => (
            <div key={s.id || i} className="panel !p-2.5 flex items-start gap-2.5">
              <span className={`mt-0.5 w-5 h-5 rounded-pi-sm flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${s.status === 'running' ? 'bg-pi-accent/20 text-pi-accent' : s.status === 'error' ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-300'}`}>
                {s.status === 'running' ? <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-pi-accent/25 border-t-pi-accent animate-spin" /> : s.status === 'error' ? '✕' : '✓'}
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
        <div className="panel !p-3 max-h-48 overflow-y-auto font-mono text-[12px] leading-relaxed">
          {log.map((l, i) => (
            <div key={i} className={l.startsWith('[错误]') ? 'text-red-400' : l.startsWith('[完成]') ? 'text-emerald-300' : l.startsWith('[已手动') || l.startsWith('[警告') || l.startsWith('· ⚠️') ? 'text-amber-300' : 'text-pi-dim'}>{l}</div>
          ))}
        </div>
      )}

      {/* 章节列表 */}
      <div className="space-y-1.5">
        <div className="text-[11px] text-pi-dim2 px-1">目录（点击阅读）</div>
        {chapters.length === 0 && <div className="panel !p-3 text-[12px] text-pi-dim2 text-center">还没有章节——上面点「续写」开工</div>}
        {chapters.map(c => (
          <button key={c.file} onClick={() => setReading(c)} className="panel !p-3 w-full flex items-center gap-2.5 text-left glow-hover">
            <BookOpen className="w-4 h-4 text-pi-dim flex-shrink-0" strokeWidth={1.8} />
            <span className="text-[13px] text-pi-text flex-1 truncate">第{String(c.no).padStart(3, '0')}章</span>
            {c.size ? <span className="text-[10px] text-pi-dim2">{Math.round(c.size / 1024 * 10) / 10} KB</span> : null}
            <ChevronLeft className="w-3.5 h-3.5 text-pi-dim2 rotate-180 flex-shrink-0" />
          </button>
        ))}
      </div>

      {reading && <ChapterReader id={id} ch={reading} onClose={() => setReading(null)} />}
    </div>
  )
}

export default function NovelStudioView() {
  const [openId, setOpenId] = useState<string | null>(null)
  return openId ? <BookWorkbench id={openId} onBack={() => setOpenId(null)} /> : <BookShelf onOpen={setOpenId} />
}
