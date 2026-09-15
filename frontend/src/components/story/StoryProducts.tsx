import { useMemo, useState } from 'react'
import { downloadApiFile, withFileToken } from '../../api'
import type { StoryGenerationRun, StoryProject } from '../../types'

const labels: Record<string,string> = { queued:'待执行',running:'正在生成',failed:'生成失败',succeeded:'已生成',degraded:'已生成 · 请核对连续性' }
const kindLabel: Record<string,string> = { novel:'段落', image:'画面', video:'视频' }

interface Product { run: StoryGenerationRun; sceneTitle: string; beatNo: number; beatPrompt: string }

/**
 * 作品列表：把整个项目里**跑出过产物的运行**全部摊平列出来（新的在前）。
 *
 * 为什么单做一块：分镜时间线和「本段结果」都只看得到当前那一段，
 * 项目跑到十几段之后，"我到底生成过哪些东西"就没有任何一个地方能一眼看全。
 * 产物本来就都在 scene.outputs 里（服务端只 push 不覆盖），这里只是把它们摊开。
 */
export default function StoryProducts({ project, onPick }: { project: StoryProject; onPick: (beatId: string) => void }) {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  // 默认展开：这一块存在的意义就是"看得见"，收起来等于又藏起来了
  const [open, setOpen] = useState(true)

  const { products, counts } = useMemo(() => {
    // 段号按项目顺序连续编号（跨场景），便于"第几段"这句话有意义
    const noOf = new Map<string, { no: number; prompt: string; sceneTitle: string }>()
    let n = 0
    for (const scene of project.scenes || []) {
      for (const beat of scene.beats || []) {
        n += 1
        noOf.set(beat.id, { no: n, prompt: beat.prompt || '', sceneTitle: scene.title || '' })
      }
    }
    const out: Product[] = []
    const c: Record<string, number> = { image: 0, video: 0, text: 0 }
    for (const scene of project.scenes || []) {
      for (const run of scene.outputs || []) {
        const assets = run.outputAssets || []
        if (!assets.length) continue // 只有真正产出过成品的才算"作品"
        const meta = noOf.get(run.beatId)
        out.push({ run, sceneTitle: meta?.sceneTitle || scene.title || '', beatNo: meta?.no ?? 0, beatPrompt: meta?.prompt || '' })
        for (const a of assets) if (c[a.type as string] != null) c[a.type as string] += 1
      }
    }
    out.sort((a, b) => String(b.run.createdAt).localeCompare(String(a.run.createdAt)))
    return { products: out, counts: c }
  }, [project])

  const save = async (url: string, name: string) => {
    setSaving(true)
    try { setMessage(await downloadApiFile(url, name, setMessage)) }
    catch (e: any) { setMessage(e?.message || '下载未完成，请重试') }
    finally { setSaving(false) }
  }

  const total = counts.image + counts.video + counts.text
  return <section className="story-products" aria-label="作品列表">
    <details open={open} onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="story-products-title">作品列表</span>
        <span className="story-products-count">
          {products.length ? `${products.length} 次生成 · 成品 ${total} 个（画面 ${counts.image} / 视频 ${counts.video} / 正文 ${counts.text}）` : '还没有成品'}
        </span>
      </summary>
      {!products.length && <div className="story-output-empty">这个项目还没有跑出过成品。生成之后，每一次都会留在这里，不会被后来的覆盖。</div>}
      {products.length > 0 && <div className="story-product-grid">
        {products.map(p => {
          const assets = p.run.outputAssets || []
          const head = assets.find(a => a.type !== 'text') || assets[0]
          const headUrl = String(head?.url || '')
          const prose = assets.filter(a => a.type === 'text' && a.text).map(a => String(a.text)).join('\n')
          return <article key={p.run.id} className="story-product-card">
            <div className="story-product-card-head">
              <strong>{p.beatNo ? `第 ${p.beatNo} 段` : '未编号段'} · {kindLabel[p.run.kind] || p.run.kind}</strong>
              <span>{labels[p.run.status] || p.run.status}</span>
            </div>
            <div className="story-product-meta">
              {p.sceneTitle ? `${p.sceneTitle} · ` : ''}{new Date(p.run.createdAt).toLocaleString('zh-CN')}
            </div>
            {head?.type === 'image' && headUrl && <img className="story-product-thumb" src={withFileToken(headUrl)} alt={`第 ${p.beatNo} 段画面`} />}
            {head?.type === 'video' && headUrl && <video className="story-product-thumb" src={withFileToken(headUrl)} controls playsInline preload="metadata" />}
            {prose && !headUrl && <div className="story-product-prose">{prose.slice(0, 200)}{prose.length > 200 ? '…' : ''}</div>}
            {p.beatPrompt && <div className="story-product-prompt">{p.beatPrompt.slice(0, 80)}</div>}
            <div className="story-actions">
              <button className="btn-ghost" disabled={saving} onClick={() => onPick(p.run.beatId)}>定位到本段</button>
              {headUrl && assets.map((a, i) => {
                const url = String(a.url || '')
                if (!url) return null
                const ext = a.type === 'video' ? 'mp4' : a.type === 'image' ? 'png' : 'txt'
                return <button key={a.id || i} className="btn-ghost" disabled={saving} onClick={() => save(url, `故事-第${p.beatNo}段-${p.run.id.slice(0, 6)}.${ext}`)}>下载 {i + 1}</button>
              })}
              {headUrl && <a href={withFileToken(headUrl)} target="_blank" rel="noopener noreferrer">打开</a>}
            </div>
          </article>
        })}
      </div>}
      {message && <p role="status" className="story-notice">{message}</p>}
    </details>
  </section>
}
