import { useMemo, useState } from 'react'
import { Film, Music, FileText, ImagePlus, FolderOpen, Images as ImagesIcon, Package } from 'lucide-react'
import useSWR from 'swr'
import { WsApi, withFileToken } from '../api'
import GeneratePanel from '../components/GeneratePanel'
import type { Artifact } from '../types'

// ── 资产库：生成物 + 交付物统一浏览（Phase 3）──
// 类型筛选 + 图片网格灯箱预览；文件/视频/音频走新窗口打开

const IMG_RE = /\.(png|jpe?g|gif|webp|svg)$/i
const VID_RE = /\.(mp4|webm|mov)$/i
const AUD_RE = /\.(mp3|wav|ogg|m4a)$/i

const fmtSize = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n >= 1e3 ? (n / 1e3).toFixed(0) + ' KB' : n + ' B'
const fmtDate = (d: string) => (d || '').slice(5).replace('-', '/')

function ArtifactTile({ a, onOpen }: { a: Artifact; onOpen: () => void }) {
  const isImg = IMG_RE.test(a.name)
  return (
    <div className="group panel !p-2 cursor-pointer overflow-hidden flex flex-col gap-1.5 card-hover" onClick={onOpen}>
      <div className="relative rounded-pi-md bg-pi-bg3/60 aspect-[4/3] overflow-hidden flex items-center justify-center">
        {isImg
          ? <img src={withFileToken(a.url)} alt={a.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-300" />
          : (() => { const F = VID_RE.test(a.name) ? Film : AUD_RE.test(a.name) ? Music : FileText; return <F className="w-8 h-8 opacity-50" strokeWidth={1.5} /> })()}
        {/* 悬浮遮罩：预览提示 */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center"
          style={{ background: 'linear-gradient(to top, rgba(5,8,18,.72), rgba(5,8,18,.15))' }}>
          <span className="text-[11px] text-white/90 px-2.5 py-1 rounded-pi-pill bg-white/10 backdrop-blur-sm border border-white/15">{isImg ? '预览' : '打开'}</span>
        </div>
      </div>
      <div className="text-[11.5px] text-pi-text truncate" title={a.name}>{a.name}</div>
      <div className="flex items-center justify-between text-[10px] text-pi-dim2">
        <span className="truncate px-1.5 py-0.5 rounded-pi-pill bg-pi-bg3">{a.type}</span>
        <span className="flex-shrink-0 ml-2">{fmtSize(a.size)} · {fmtDate(a.date)}</span>
      </div>
    </div>
  )
}

export default function Assets() {
  const [typeFilter, setTypeFilter] = useState('全部')
  const [kw, setKw] = useState('')
  const [viewer, setViewer] = useState<Artifact | null>(null)
  const [showGen, setShowGen] = useState(false)
  // swr：资产清单缓存 + 聚焦重验证（生成新图后切回来自动出现）
  const { data: artData, isLoading, mutate: mutateArtifacts } = useSWR('artifacts', () => WsApi.artifacts(), { revalidateOnFocus: true, dedupingInterval: 10000 })
  const { data: delData } = useSWR('deliveries', () => WsApi.deliveries(), { dedupingInterval: 60000 })

  const types = useMemo(() => {
    const set = new Set<string>()
    for (const a of artData?.artifacts || []) set.add(a.type)
    return ['全部', ...[...set].sort()]
  }, [artData])

  const list = useMemo(() => {
    let arr = artData?.artifacts || []
    if (typeFilter !== '全部') arr = arr.filter(a => a.type === typeFilter)
    const k = kw.trim().toLowerCase()
    if (k) arr = arr.filter(a => a.name.toLowerCase().includes(k))
    return arr.slice(0, 200)
  }, [artData, typeFilter, kw])

  const deliveries = delData?.deliveries || []

  return (
    <div className="flex-1 overflow-y-auto relative z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <div className="mb-4">
          <div className="page-eyebrow mb-1">Asset Library</div>
          <h1 className="page-title">资产库</h1>
          <p className="text-xs text-pi-dim2 mt-1.5">工作空间「生成物」{artData?.artifacts?.length || 0} 个 · 「交付」{deliveries.length} 个</p>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <button className={`text-xs px-3.5 py-1.5 rounded-full font-medium inline-flex items-center gap-1.5 transition-all duration-150 ${showGen ? 'btn-grad text-white shadow-lg shadow-pi-accent/25' : 'bg-pi-accent/12 text-pi-accent border border-pi-accent/25 hover:bg-pi-accent/22'}`}
            onClick={() => setShowGen(v => !v)}>
            <ImagePlus className="w-4 h-4" /> 生成图片
          </button>
          <input className="input-pi !py-1.5 text-xs w-48 sm:w-56 rounded-full" placeholder="搜索资产名…" value={kw} onChange={e => setKw(e.target.value)} />
        </div>

        {showGen && <GeneratePanel onClose={() => setShowGen(false)} onGenerated={() => mutateArtifacts()} />}

        {/* 类型筛选 */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {types.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`text-xs px-3 py-1.5 rounded-pi-md transition-colors ${typeFilter === t ? 'bg-pi-accent/15 text-pi-accent font-medium' : 'text-pi-dim hover:text-pi-text hover:bg-pi-bg3'}`}>
              {t}
            </button>
          ))}
          {isLoading && <span className="text-[11px] text-pi-dim2 self-center animate-pulse">加载中…</span>}
        </div>

        {/* 网格 */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 mb-8">
          {list.map(a => <ArtifactTile key={a.path} a={a} onOpen={() => {
            if (IMG_RE.test(a.name)) setViewer(a)
            else window.open(withFileToken(a.url), '_blank')
          }} />)}
        </div>
        {!list.length && !isLoading && (
          <div className="empty-state py-14 mb-8 text-center">
            <ImagesIcon className="w-9 h-9 mb-2 mx-auto opacity-40" strokeWidth={1.5} />
            <div className="text-sm text-pi-dim">这个筛选下没有资产</div>
            <div className="text-[11px] text-pi-dim2 mt-1">换个类型，或点右上角生成一张新图</div>
          </div>
        )}

        {/* 交付物列表 */}
        {deliveries.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-pi-text mb-2 inline-flex items-center gap-1.5"><Package className="w-4 h-4" /> 成品交付</h2>
            <div className="panel !p-0 overflow-hidden mb-8">
              {deliveries.map(d => (
                <div key={d.wsPath} className="flex items-center gap-3 px-4 py-2.5 border-b border-pi-border-soft/50 last:border-0 hover:bg-pi-bg3/40 transition-colors cursor-pointer"
                  onClick={() => window.open(withFileToken(d.url), '_blank')}>
                  <span>{d.type === 'dir' ? <FolderOpen className="w-4 h-4" /> : <FileText className="w-4 h-4" />}</span>
                  <span className="text-[12.5px] text-pi-text truncate flex-1">{d.name}</span>
                  <span className="text-[10px] text-pi-dim2">{fmtSize(d.size)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 图片灯箱 */}
      {viewer && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8" onClick={() => setViewer(null)}>
          <div className="max-w-[90vw] max-h-[88vh] flex flex-col gap-2" onClick={e => e.stopPropagation()}>
            <img src={withFileToken(viewer.url)} alt={viewer.name} className="max-w-full max-h-[78vh] object-contain rounded-pi-lg border border-pi-border" />
            <div className="flex items-center gap-3 text-xs text-pi-dim">
              <span className="truncate flex-1">{viewer.name}</span>
              <span>{fmtSize(viewer.size)}</span>
              <button className="btn-tool !py-1" onClick={() => window.open(viewer.url, '_blank')}>新窗口打开</button>
              <button className="btn-tool !py-1" onClick={() => setViewer(null)}>✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
