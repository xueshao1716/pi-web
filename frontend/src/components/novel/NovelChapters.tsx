import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { BookOpen, X } from 'lucide-react'
import { NovelApi, type NovelChapter } from '../../api'

function padNo(n: number) {
  return String(n).padStart(3, '0')
}

export default function NovelChapters({ id, chapters, onChanged }: {
  id: string
  chapters: NovelChapter[]
  onChanged?: () => void
}) {
  const [open, setOpen] = useState<{ ch: NovelChapter; mode: 'preview' | 'edit' } | null>(null)
  return (
    <div data-slot="novel-chapters" className="panel !p-3 space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[12px] font-semibold text-pi-text">已写章节</h3>
        <span className="text-[11px] text-pi-dim2">{chapters.length} 章</span>
      </div>
      {chapters.length === 0 && (
        <p className="text-[12px] text-pi-dim2">还没有章节。设定齐了之后点「自动写第 1 章」。写出后可以在这里查看、预览、修改。</p>
      )}
      {chapters.map(c => (
        <div key={c.file} className="flex items-center gap-2 py-1.5 border-t border-pi-border-soft">
          <BookOpen className="w-4 h-4 text-pi-dim shrink-0" strokeWidth={1.8} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] truncate">第{padNo(c.no)}章{c.title ? ` · ${c.title}` : ''}</div>
            {!!c.chars && <div className="text-[11px] text-pi-dim2">{c.chars} 字</div>}
          </div>
          <button className="btn-ghost text-xs px-2.5 py-1.5 whitespace-nowrap" onClick={() => setOpen({ ch: c, mode: 'preview' })}>查看</button>
          <button className="btn-ghost text-xs px-2.5 py-1.5 whitespace-nowrap" onClick={() => setOpen({ ch: c, mode: 'edit' })}>修改</button>
        </div>
      ))}
      {open && (
        <ChapterOverlay id={id} ch={open.ch} mode={open.mode}
          onMode={mode => setOpen({ ch: open.ch, mode })}
          onClose={() => setOpen(null)}
          onSaved={() => onChanged?.()} />
      )}
    </div>
  )
}

function ChapterOverlay({ id, ch, mode, onMode, onClose, onSaved }: {
  id: string
  ch: NovelChapter
  mode: 'preview' | 'edit'
  onMode: (mode: 'preview' | 'edit') => void
  onClose: () => void
  onSaved: () => void
}) {
  const { data, error, mutate } = useSWR(['novel-chapter', id, ch.file], ([, i, f]: readonly [string, string, string]) => NovelApi.chapter(i, f), { revalidateOnFocus: false })
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (data?.content != null) setDraft(data.content) }, [data?.content])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await NovelApi.saveChapter({ id, file: ch.file, content: draft })
      if (r.error) setErr(r.error)
      else { await mutate(); onSaved() }
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-[var(--pi-z-modal)] flex flex-col bg-pi-bg">
      <div className="h-12 flex items-center gap-2 px-3 border-b border-pi-border-soft flex-shrink-0">
        <button className="touch-hit p-2 rounded-pi-md hover:bg-pi-bg2 text-pi-dim" aria-label="关闭" onClick={onClose}><X className="w-4 h-4" /></button>
        <span className="text-[13px] font-medium truncate">第{padNo(ch.no)}章{ch.title ? ` · ${ch.title}` : ''}</span>
        {!!data?.content && mode === 'preview' && <span className="text-[10px] text-pi-dim2">{data.content.length} 字</span>}
        <div className="ml-auto flex items-center gap-2">
          {mode === 'preview'
            ? <button className="btn-ghost text-xs px-3 py-1.5 whitespace-nowrap" onClick={() => onMode('edit')}>修改</button>
            : <>
                <button className="btn-ghost text-xs px-3 py-1.5 whitespace-nowrap" onClick={() => onMode('preview')}>预览</button>
                <button className="btn-primary text-xs px-3 py-1.5 whitespace-nowrap disabled:opacity-50" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存'}</button>
              </>}
        </div>
      </div>
      {err && <div className="px-3 py-1.5 text-[12px] text-red-400">{err}</div>}
      {mode === 'edit' ? (
        <textarea className="flex-1 min-h-0 input-pi !rounded-none border-0 text-[15px] leading-[1.95] p-4 sm:px-6" value={draft} onChange={e => setDraft(e.target.value)} />
      ) : (
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          <article className="max-w-2xl mx-auto text-[15px] leading-[1.95] whitespace-pre-wrap text-pi-text">
            {error ? <span className="text-red-400 text-[13px]">加载失败</span> : !data ? '加载中…' : data.content}
          </article>
        </div>
      )}
    </div>
  )
}
