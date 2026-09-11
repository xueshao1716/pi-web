import { useEffect, useState } from 'react'
import { AlertCircle, Download, ExternalLink, FileText, X } from 'lucide-react'
import { WsApi, withFileToken } from '../../api'
import type { AssetItem } from '../../types'

export type AssetPreviewProps = { item: AssetItem | null; onClose: () => void; onAction: (action: 'download' | 'open') => void }

export default function AssetPreview({ item, onClose, onAction }: AssetPreviewProps) {
  const [text, setText] = useState<string | null>(null)
  const [textError, setTextError] = useState('')
  const [mediaError, setMediaError] = useState(false)

  useEffect(() => {
    setText(null); setTextError(''); setMediaError(false)
    if (!item || item.isDirectory || item.kind !== 'text') return
    let alive = true
    WsApi.read(item.path).then(result => { if (alive) setText(result.content) }).catch(error => { if (alive) setTextError(error?.message || '文本读取失败') })
    return () => { alive = false }
  }, [item])

  useEffect(() => {
    if (!item) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [item, onClose])

  if (!item) return null
  const src = withFileToken(item.url)
  const isPdf = item.name.toLowerCase().endsWith('.pdf')
  return (
    <div className="asset-preview preview-fullscreen" role="dialog" aria-modal="true" aria-label={`${item.name} 预览`} onClick={onClose}>
      <div className="asset-preview__surface" onClick={event => event.stopPropagation()}>
        <header className="asset-preview__header"><div className="min-w-0"><strong className="truncate block">{item.name}</strong><span className="text-xs text-pi-dim2">{item.path}</span></div><button type="button" className="asset-icon-button" aria-label="关闭预览" onClick={onClose}><X /></button></header>
        <div className="asset-preview__body">
          {item.isDirectory ? <div className="asset-preview__unsupported"><FileText />目录请通过工作空间打开</div>
            : item.kind === 'image' ? <img src={src} alt={item.name} onError={() => setMediaError(true)} />
              : item.kind === 'video' ? <video src={src} controls preload="metadata" onError={() => setMediaError(true)} />
                : item.kind === 'audio' ? <audio src={src} controls onError={() => setMediaError(true)} />
                  : item.kind === 'text' ? <div className="text-preview">{textError ? <div className="asset-error"><AlertCircle />{textError}</div> : text === null ? '读取文本中…' : text}</div>
                    : isPdf ? <iframe className="asset-preview__pdf" title={item.name} src={src} />
                      : <div className="asset-preview__unsupported"><FileText />此类型暂不支持内嵌预览</div>}
          {mediaError && <div className="asset-error"><AlertCircle />媒体加载失败，请尝试新窗口打开</div>}
        </div>
        {!item.isDirectory && <footer className="asset-preview__actions"><button type="button" onClick={() => onAction('download')}><Download />下载</button><button type="button" onClick={() => onAction('open')}><ExternalLink />新窗口打开</button></footer>}
      </div>
    </div>
  )
}
