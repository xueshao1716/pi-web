import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowUp, File, Folder, Paperclip, RefreshCw, Upload } from 'lucide-react'
import { useApp } from '../store'
import { WsApi } from '../api'
const Markdown = lazy(() => import('./Markdown'))

function LazyMarkdown({ text }: { text: string }) {
  return <Suspense fallback={<div className="text-pi-dim2 text-xs py-2">渲染中…</div>}><Markdown text={text} /></Suspense>
}

interface TreeNode { name: string; type: string; path: string }

export default function Workspace() {
  const { currentSessionId } = useApp()
  const [cur, setCur] = useState('')
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [selectedFile, setSelectedFile] = useState<{ name: string; path: string; content: string } | null>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [tip, setTip] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const flash = (msg: string) => { setTip(msg); setTimeout(() => setTip(''), 3000) }

  // 交付：复制到 交付/ 目录（版本化）
  const deliver = async () => {
    if (!selectedFile) return
    try { const d = await WsApi.deliver(selectedFile.path, selectedFile.name); flash(`✓ 已交付 → ${d.path}`) }
    catch (e: any) { flash(`✗ 交付失败: ${e.message}`) }
  }
  // 上传：base64 → /api/files/upload
  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    try {
      const buf = await f.arrayBuffer()
      let bin = ''; const bytes = new Uint8Array(buf)
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      const d = await WsApi.upload(f.name, btoa(bin), currentSessionId || undefined)
      flash(`✓ 已上传 ${f.name}${d.path ? ' → ' + d.path : ''}`)
      loadTree(cur)
    } catch (e: any) { flash(`✗ 上传失败: ${e.message}`) }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const loadTree = async (p = '') => {
    try { const d = await WsApi.tree(p); setNodes(d.items || []); setCur(d.current || '') } catch {}
  }
  useEffect(() => { loadTree('') }, [])
  const openFile = async (path: string) => { try { const d = await WsApi.read(path); setSelectedFile(d) } catch {} }
  const onSearch = async (v: string) => {
    setQ(v)
    if (v.trim().length < 2) { setResults([]); return }
    try { const d = await WsApi.search(v); setResults(d.results || []) } catch {}
  }

  const parentPath = (path: string) => path.split(/[\\/]/).filter(Boolean).slice(0, -1).join('/')

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-60 border-r border-pi-border-soft flex flex-col">
        <div className="flex items-center gap-2 px-3 min-h-14 border-b border-pi-border-soft flex-shrink-0">
          <Folder className="w-4 h-4 text-pi-accent flex-shrink-0" strokeWidth={1.8} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-pi-text">工作区</div>
            <div className="text-[10px] text-pi-dim2 truncate" title={cur || '项目根目录'}>{cur || '项目根目录'}</div>
          </div>
          {cur && <button type="button" className="btn-tool !h-8 !w-8 !p-0" title="返回上一级" aria-label="返回上一级" onClick={() => loadTree(parentPath(cur))}><ArrowUp className="w-3.5 h-3.5" /></button>}
          <button type="button" className="btn-tool !h-8 !w-8 !p-0" title="刷新工作区" aria-label="刷新工作区" onClick={() => loadTree(cur)}><RefreshCw className="w-3.5 h-3.5" /></button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={onUpload} />
          <button type="button" className="btn-tool !h-8 !w-8 !p-0" title="上传文件到工作区" aria-label="上传文件到工作区" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" />
          </button>
        </div>
        {tip && <div className="px-3 py-1 text-[11px] bg-pi-accent/10 border-b border-pi-border-soft text-pi-dim flex-shrink-0">{tip}</div>}
        <div className="p-2 flex-shrink-0"><input className="input-pi text-xs" placeholder="搜索文件…" value={q} onChange={e => onSearch(e.target.value)} /></div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {q.trim().length >= 2 ? (
            results.map((r: any, i) => (
              <button type="button" key={i} className="w-full px-2 py-1.5 text-left text-sm text-pi-dim cursor-pointer hover:bg-pi-bg2 rounded-pi-sm" onClick={() => openFile(r.path)}>
                <div className="truncate text-pi-text">{r.name}</div><div className="text-[10px] text-pi-dim2 truncate">{r.path}</div>
              </button>
            ))
          ) : nodes.length ? nodes.map(n => (
            <button type="button" key={n.path} className="w-full px-2 py-1.5 text-left text-sm text-pi-text cursor-pointer hover:bg-pi-bg2 rounded-pi-sm flex items-center gap-1.5" onClick={() => n.type === 'dir' ? loadTree(n.path) : openFile(n.path)}>
              {n.type === 'dir' ? <Folder className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" strokeWidth={1.8} /> : <File className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" strokeWidth={1.8} />}<span className="truncate">{n.name}</span>
            </button>
          )) : <div className="px-2 py-6 text-center text-xs text-pi-dim2">当前目录为空</div>}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {selectedFile ? (
          <>
            <div className="flex items-center gap-2 mb-3 border-b border-pi-border-soft pb-2">
              <span className="font-semibold text-pi-text text-sm">{selectedFile.name}</span>
              <span className="text-xs text-pi-dim2 truncate flex-1">{selectedFile.path}</span>
              <button className="btn-tool text-xs" onClick={deliver} title="复制到 交付/ 目录（版本化）"><Paperclip className="w-3.5 h-3.5" /> 交付</button>
            </div>
            {/\.(md|txt)$/i.test(selectedFile.name) ? <LazyMarkdown text={selectedFile.content} /> : <pre className="whitespace-pre-wrap text-[13px] text-pi-text font-mono">{selectedFile.content}</pre>}
          </>
        ) : <div className="h-full flex items-center justify-center text-pi-dim2 text-sm">← 选择左侧文件预览</div>}
      </div>
    </div>
  )
}
