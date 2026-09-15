import { useMemo, useState } from 'react'
import { downloadApiFile, withFileToken } from '../../api'
import type { StoryGenerationRun, StoryProject } from '../../types'

const labels: Record<string,string> = { queued:'待执行',running:'正在生成',failed:'生成失败',succeeded:'已生成',degraded:'已生成 · 请核对连续性' }
const kindLabel: Record<string,string> = { novel:'段落', image:'画面', video:'视频' }

interface Product { run: StoryGenerationRun; sceneTitle: string; beatNo: number; beatPrompt: string; stamped: boolean }

/**
 * 作品列表：把整个项目里**跑过的每一次生成**摊平列出来（新的在前）。
 *
 * 为什么单做一块：分镜时间线和「本段结果」都只看得到当前那一段，
 * 项目跑到十几段之后，"我到底生成过哪些东西"就没有任何一个地方能一眼看全。
 * 产物本来就都在 scene.outputs 里（服务端只 push 不覆盖），这里只是把它们摊开。
 *
 * 两条刻意的取舍：
 * - 段号优先用 run.beatNo（生成时刻定格的那个）。按当前分镜顺序现算只作为旧数据的回退：
 *   一旦重排分镜，"第 N 段"就会跟着变，历史产物上的编号被后来的编辑改写，那就不是历史了。
 * - 正文和缩略图**同时**展示。之前是 `prose && !headUrl`，同一段既出正文又出图时正文被吞掉。
 * 成片（project.films）也在这里：它同样是作品，而且必须能在刷新之后仍找得到。
 */
export default function StoryProducts({ project, onPick }: { project: StoryProject; onPick: (beatId: string) => void }) {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  // 默认展开：这一块存在的意义就是"看得见"，收起来等于又藏起来了
  const [open, setOpen] = useState(true)
  // 默认只看成品。失败的运行也要看得见，但不该默认占满一屏——所以给一个开关，而不是过滤掉。
  const [onlyOutput, setOnlyOutput] = useState(true)

  const { products, counts, films, hidden } = useMemo(() => {
    // 段号回退：按项目顺序连续编号（跨场景），只在旧数据没有 run.beatNo 时用
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
    let skipped = 0
    for (const scene of project.scenes || []) {
      for (const run of scene.outputs || []) {
        const assets = run.outputAssets || []
        if (!assets.length) { skipped += 1; if (onlyOutput) continue }
        const meta = noOf.get(run.beatId)
        const stamped = Number.isFinite(run.beatNo as number)
        out.push({
          run,
          sceneTitle: run.sceneTitle || meta?.sceneTitle || scene.title || '',
          beatNo: stamped ? Number(run.beatNo) : (meta?.no ?? 0),
          beatPrompt: meta?.prompt || '',
          stamped,
        })
        for (const a of assets) if (c[a.type as string] != null) c[a.type as string] += 1
      }
    }
    out.sort((a, b) => String(b.run.createdAt).localeCompare(String(a.run.createdAt)))
    return { products: out, counts: c, films: [...(project.films || [])].reverse(), hidden: skipped }
  }, [project, onlyOutput])

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
          {`${products.length} 次生成 · 成品 ${total} 个（画面 ${counts.image} / 视频 ${counts.video} / 正文 ${counts.text}）${films.length ? ` · 成片 ${films.length} 版` : ''}`}
        </span>
      </summary>
      <div className="story-products-tools">
        <label className="story-products-filter"><input type="checkbox" checked={onlyOutput} onChange={e => setOnlyOutput(e.target.checked)} />只看有产物的</label>
        {!onlyOutput && hidden > 0 && <span className="story-hint">另有 {hidden} 次运行没有产出（失败或未接引擎）</span>}
      </div>
      {films.length > 0 && <div className="story-films">
        <h3 className="story-films-title">成片 · {films.length} 版</h3>
        <ul className="story-film-list">
          {films.map((f, i) => <li key={f.id} className="story-film-item">
            <video className="story-product-thumb" src={withFileToken(f.url)} controls playsInline preload="metadata" />
            <div className="story-film-meta">
              <strong>第 {films.length - i} 版 · {f.clipCount} 段拼接{f.method === 'copy' ? '（单段直落）' : ''}</strong>
              <span>{new Date(f.createdAt).toLocaleString('zh-CN')}</span>
              <div className="story-actions">
                <a href={withFileToken(f.url)} target="_blank" rel="noopener noreferrer">打开成片</a>
                <button className="btn-ghost" disabled={saving} onClick={() => save(f.url, `成片-第${films.length - i}版.mp4`)}>下载成片</button>
              </div>
            </div>
          </li>)}
        </ul>
      </div>}
      {!products.length && <div className="story-output-empty">{onlyOutput && hidden > 0 ? `这个项目还没有跑出过成品，但有 ${hidden} 次运行没有产出——勾掉「只看有产物的」可以看到它们失败的具体原因。` : '这个项目还没有跑出过成品。生成之后，每一次都会留在这里，不会被后来的覆盖。'}</div>}
      {products.length > 0 && <div className="story-product-grid">
        {products.map(p => {
          const assets = p.run.outputAssets || []
          const head = assets.find(a => a.type !== 'text') || assets[0]
          const headUrl = String(head?.url || '')
          const prose = assets.filter(a => a.type === 'text' && a.text).map(a => String(a.text)).join('\n')
          const downloadable = assets.filter(a => String(a.url || ''))
          const suffix = p.stamped ? '' : '（按当前分镜顺序推算）'
          return <article key={p.run.id} className="story-product-card">
            <div className="story-product-card-head">
              <strong>{p.beatNo ? `第 ${p.beatNo} 段${suffix}` : '未编号段'} · {kindLabel[p.run.kind] || p.run.kind}</strong>
              <span>{labels[p.run.status] || p.run.status}</span>
            </div>
            <div className="story-product-meta">
              {p.sceneTitle ? `${p.sceneTitle} · ` : ''}{new Date(p.run.createdAt).toLocaleString('zh-CN')}
            </div>
            {head?.type === 'image' && headUrl && <img className="story-product-thumb" src={withFileToken(headUrl)} alt={`第 ${p.beatNo} 段画面`} />}
            {head?.type === 'video' && headUrl && <video className="story-product-thumb" src={withFileToken(headUrl)} controls playsInline preload="metadata" />}
            {/* 正文和画面同时存在时两个都要给：正文是这一段实际写出来的东西，不该被缩略图顶掉 */}
            {prose && <div className="story-product-prose">{prose.slice(0, 240)}{prose.length > 240 ? '…' : ''}</div>}
            {!assets.length && p.run.degradation?.length ? <div className="story-product-fail">{p.run.degradation.join('；')}</div> : null}
            {p.beatPrompt && <div className="story-product-prompt">{p.beatPrompt.slice(0, 80)}</div>}
            <div className="story-actions">
              <button className="btn-ghost" disabled={saving} onClick={() => onPick(p.run.beatId)}>定位到本段</button>
              {downloadable.map((a, i) => {
                const ext = a.type === 'video' ? 'mp4' : a.type === 'image' ? 'png' : 'txt'
                return <button key={a.id || i} className="btn-ghost" disabled={saving} onClick={() => save(String(a.url), `故事-第${p.beatNo}段-${p.run.id.slice(0, 6)}.${ext}`)}>下载 {i + 1}</button>
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
