import { useEffect, useState } from 'react'
import { WsApi } from '../api'
import Markdown from './Markdown'

interface TreeNode { name: string; type: string; path: string }

export default function Workspace() {
  const [cur, setCur] = useState('')
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [selectedFile, setSelectedFile] = useState<{ name: string; path: string; content: string } | null>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])

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

  const FolderIcon = () => <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
  const FileIcon = () => <svg className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-56 border-r border-pi-border-soft flex flex-col">
        <div className="flex items-center gap-2 px-3 h-11 border-b border-pi-border-soft flex-shrink-0">
          <span className="text-sm font-semibold text-pi-text">工作空间</span>
          <span className="text-[10px] text-pi-dim2 truncate">{cur}</span>
        </div>
        <div className="p-2 flex-shrink-0"><input className="input-pi text-xs" placeholder="搜索文件…" value={q} onChange={e => onSearch(e.target.value)} /></div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {q.trim().length >= 2 ? (
            results.map((r: any, i) => (
              <div key={i} className="px-2 py-1.5 text-sm text-pi-dim cursor-pointer hover:bg-pi-bg2 rounded-pi-sm" onClick={() => openFile(r.path)}>
                <div className="truncate text-pi-text">{r.name}</div><div className="text-[10px] text-pi-dim2 truncate">{r.path}</div>
              </div>
            ))
          ) : nodes.map(n => (
            <div key={n.path} className="px-2 py-1.5 text-sm text-pi-text cursor-pointer hover:bg-pi-bg2 rounded-pi-sm flex items-center gap-1.5" onClick={() => n.type === 'dir' ? loadTree(n.path) : openFile(n.path)}>
              {n.type === 'dir' ? <FolderIcon /> : <FileIcon />}<span className="truncate">{n.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {selectedFile ? (
          <>
            <div className="flex items-center gap-2 mb-3 border-b border-pi-border-soft pb-2">
              <span className="font-semibold text-pi-text text-sm">{selectedFile.name}</span>
              <span className="text-xs text-pi-dim2 truncate">{selectedFile.path}</span>
            </div>
            {/\.(md|txt)$/i.test(selectedFile.name) ? <Markdown text={selectedFile.content} /> : <pre className="whitespace-pre-wrap text-[13px] text-pi-text font-mono">{selectedFile.content}</pre>}
          </>
        ) : <div className="h-full flex items-center justify-center text-pi-dim2 text-sm">← 选择左侧文件预览</div>}
      </div>
    </div>
  )
}
