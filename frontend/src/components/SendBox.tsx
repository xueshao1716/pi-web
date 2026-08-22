import { useEffect, useRef, useState } from 'react'
import { WsApi } from '../api'

// 斜杠命令（Claude Code 风格，对齐线上版）
const SLASH_COMMANDS = [
  { cmd: '/new', desc: '新建会话' },
  { cmd: '/legacy', desc: '切换到旧版界面' },
  { cmd: '/compact', desc: '压缩上下文（省 token）' },
  { cmd: '/stats', desc: '查看统计' },
  { cmd: '/help', desc: '显示所有命令' },
]

export interface FileAttachment { path: string; content: string }

interface Props {
  streaming: boolean
  onStop: () => void
  onSend: (text: string, files: FileAttachment[]) => void
  onCommand: (cmd: string) => void
}

export default function SendBox({ streaming, onStop, onSend, onCommand }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<FileAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  // slash 菜单：输入以 / 开头且无空格时激活
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  // @ 引用菜单
  const [atQuery, setAtQuery] = useState<string | null>(null)
  const [atResults, setAtResults] = useState<{ name: string; path: string }[]>([])

  // slash 匹配
  const slashMatches = slashQuery !== null
    ? SLASH_COMMANDS.filter(c => c.cmd.startsWith(slashQuery.toLowerCase()))
    : []
  const showSlash = slashMatches.length > 0

  // @ 搜索（防抖）
  useEffect(() => {
    if (atQuery === null) return
    const kw = atQuery.trim()
    if (kw.length < 1) { setAtResults([]); return }
    const t = setTimeout(async () => {
      try {
        const d = await WsApi.search(kw)
        let items = (d.results || []).slice(0, 6)
        if (!items.length) {
          // 文件名无匹配 → 回退展示根目录文件（快速引用常用文件）
          try { const t = await WsApi.tree(''); items = (t.items || []).filter(i => i.type === 'file').slice(0, 6).map(i => ({ name: i.name, path: i.path })) } catch {}
        }
        setAtResults(items)
      } catch { setAtResults([]) }
    }, 250)
    return () => clearTimeout(t)
  }, [atQuery])
  const showAt = atQuery !== null

  const onChange = (v: string) => {
    setValue(v)
    // 光标前的最后一个触发符决定菜单态
    const before = v.slice(0, v.length) // 简化：看全文结尾
    const slashM = before.match(/(?:^|\n)\/([a-z]*)$/i)
    const atM = before.match(/@([^\s@]*)$/)
    setSlashQuery(slashM ? '/' + slashM[1] : null)
    setAtQuery(atM ? atM[1] : null)
  }

  const pickSlash = (cmd: string) => {
    setValue(''); setSlashQuery(null)
    onCommand(cmd)
  }
  const pickAt = async (r: { path: string }) => {
    setValue(v => v.replace(/@[^\s@]*$/, ''))
    setAtQuery(null)
    if (files.some(f => f.path === r.path)) return // 去重
    try { const d = await WsApi.read(r.path); setFiles(prev => [...prev, { path: r.path, content: d.content || '' }]) } catch {}
  }

  const doSend = () => {
    const v = value.trim()
    if (!v || streaming) return
    onSend(v, files)
    setValue(''); setFiles([]); setSlashQuery(null); setAtQuery(null)
  }

  // 上传附件（走聊天图片通道之外的通用文件）
  const onUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    setUploading(true)
    try {
      const buf = await f.arrayBuffer()
      let bin = ''; const bytes = new Uint8Array(buf)
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      const d = await WsApi.upload(f.name, btoa(bin))
      if (d.path) {
        const rd = await WsApi.read(d.path)
        setFiles(prev => [...prev, { path: d.path!, content: rd.content || '' }])
      }
    } catch {} finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  return (
    <div className="relative">
      {/* 斜杠命令菜单 */}
      {showSlash && (
        <div className="absolute bottom-full left-0 right-0 mb-1 panel !p-1 max-h-56 overflow-y-auto z-20">
          {slashMatches.map(c => (
            <div key={c.cmd} className="px-3 py-2 rounded-pi-sm hover:bg-pi-bg3 cursor-pointer flex items-baseline gap-2" onMouseDown={e => { e.preventDefault(); pickSlash(c.cmd) }}>
              <span className="font-mono text-[13px] text-pi-accent">{c.cmd}</span>
              <span className="text-xs text-pi-dim2">{c.desc}</span>
            </div>
          ))}
        </div>
      )}
      {/* @ 文件引用菜单 */}
      {showAt && (
        <div className="absolute bottom-full left-0 right-0 mb-1 panel !p-1 max-h-56 overflow-y-auto z-20">
          {atResults.length === 0 ? (
            <div className="px-3 py-2 text-xs text-pi-dim2">输入关键词搜索工作空间文件…</div>
          ) : atResults.map(r => (
            <div key={r.path} className="px-3 py-2 rounded-pi-sm hover:bg-pi-bg3 cursor-pointer" onMouseDown={e => { e.preventDefault(); pickAt(r) }}>
              <div className="text-[13px] text-pi-text">{r.name}</div>
              <div className="text-[10px] text-pi-dim2 font-mono truncate">{r.path}</div>
            </div>
          ))}
        </div>
      )}

      {/* 已引用文件 chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1 pb-1.5">
          {files.map(f => (
            <span key={f.path} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pi-pill bg-pi-accent/12 border border-pi-accent/25 text-[11px] text-pi-text">
              📄 {f.path.split('/').pop() || f.path}
              <button className="text-pi-dim2 hover:text-pi-red ml-0.5" onClick={() => setFiles(prev => prev.filter(x => x.path !== f.path))}>✕</button>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-pi-xl border border-pi-border bg-pi-bg2/50 backdrop-blur-lg focus-within:border-pi-accent focus-within:ring-1 focus-within:ring-pi-accent/30 transition-all">
        <textarea ref={taRef} rows={2} value={value} disabled={streaming}
          placeholder='给小语发消息…　"/" 命令 · "@ 引用文件'
          className="w-full bg-transparent border-none outline-none px-4 py-3 text-[13.5px] text-pi-text resize-none placeholder:text-pi-dim2 disabled:opacity-60"
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (showSlash) { pickSlash(slashMatches[0].cmd); return }
              if (showAt && atResults.length) { pickAt(atResults[0]); return }
              doSend()
            } else if (e.key === 'Escape') { setSlashQuery(null); setAtQuery(null) }
          }} />
        <div className="flex items-center px-3 pb-3 gap-1.5">
          <span className="text-pi-dim2 text-xs flex-1">Enter 发送 · Shift+Enter 换行</span>
          <input ref={fileInputRef} type="file" className="hidden" onChange={onUploadFile} />
          <button className="btn-tool text-xs" title="附加文件内容" onClick={() => fileInputRef.current?.click()} disabled={streaming || uploading}>
            {uploading ? '上传中…' : '📎 附加'}
          </button>
          {streaming ? (
            <button onClick={onStop}
              className="h-8 px-4 rounded-full bg-red-500/90 text-white text-xs font-medium flex items-center gap-1.5 hover:bg-red-500 transition-colors">
              <span className="w-2.5 h-2.5 bg-white rounded-[2px]" /> 停止
            </button>
          ) : (
            <button onClick={doSend} title="发送"
              className="w-8 h-8 rounded-full bg-pi-accent text-white flex items-center justify-center hover:bg-pi-accent2 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="12 19 12 5"/><polyline points="5 12 12 5 19 12"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
