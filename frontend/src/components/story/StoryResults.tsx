import { useState } from 'react'
import { downloadApiFile, withFileToken } from '../../api'
import type { StoryAssetRef, StoryBeat, StoryGenerationRun, StoryScene } from '../../types'

const labels: Record<string,string> = { queued:'待执行',running:'正在生成',failed:'生成失败',succeeded:'已生成',degraded:'已生成 · 请核对连续性' }

// 本段结果：**所有版本平铺**，新的在最上面。
// 此前只渲染最新一版，旧版藏在一个 <select> 里——界面明明写着"旧版本会保留"，
// 实际上新的一出来旧的就在视野里消失了。产物本来就全在 scene.outputs 里（只追加不覆盖），
// 这里只是把它们如实摊开。
function Assets({ run, saving, onSave }: { run: StoryGenerationRun; saving: boolean; onSave: (url: string, name: string) => void }) {
  const assets: StoryAssetRef[] = run.outputAssets || []
  if (!assets.length) {
    return <div className="story-output-empty">{run.status === 'running' ? '模型正在生成，完成后结果会出现在这里。' : '这一版没有产出成品。'}</div>
  }
  return <>
    {assets.map((asset, i) => {
      const url = String(asset.url || '')
      const src = url ? withFileToken(url) : ''
      const ext = asset.type === 'video' ? 'mp4' : asset.type === 'image' ? 'png' : 'txt'
      return <div key={asset.id || i} className="story-output">
        {asset.type === 'image' && src && <img src={src} alt="本段生成画面" />}
        {asset.type === 'video' && src && <video src={src} controls playsInline preload="metadata" />}
        {asset.type === 'text' && <div className="story-prose">{String(asset.text || '')}</div>}
        <div className="story-actions">
          {src && <button className="btn-ghost" disabled={saving} onClick={() => onSave(url, `故事-${run.beatId}-v${run.id.slice(0, 6)}-${i + 1}.${ext}`)}>{saving ? '保存中…' : '下载这一版'}</button>}
          {src && <a href={src} target="_blank" rel="noopener noreferrer">打开原文件</a>}
        </div>
      </div>
    })}
  </>
}

export default function StoryResults({ scene, beat, busy, onRerun, onCheck }: { scene: StoryScene; beat: StoryBeat; busy?: boolean; onRerun?: (run: StoryGenerationRun) => void; onCheck?: (run: StoryGenerationRun) => void }) {
  const runs = (scene.outputs || []).filter(run => run.beatId === beat.id).slice().reverse()
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async (url: string, name: string) => {
    setSaving(true)
    try { setMessage(await downloadApiFile(url, name, setMessage)) }
    catch (e: any) { setMessage(e?.message || '下载未完成，请重试') }
    finally { setSaving(false) }
  }
  return <section className="story-results" aria-label="生成预览">
    <div className="story-section-head">
      <h2>本段结果</h2>
      <span>{runs.length ? `${runs.length} 个版本 · 全部保留，新的在最上面` : '还没有成品'}</span>
    </div>
    {!runs.length && <div className="story-output-empty">本段还没有成品。检查左侧内容，然后点击“生成当前段落/画面/视频”。</div>}
    {runs.map((run, idx) => <article key={run.id} className="story-version">
      <div className="story-version-head">
        <strong>第 {runs.length - idx} 版</strong>
        <span>{labels[run.status] || run.status} · {run.model?.provider}/{run.model?.id} · {new Date(run.createdAt).toLocaleString('zh-CN')}{run.seed != null ? ` · seed ${run.seed}` : ''}</span>
      </div>
      {run.degradation?.length ? <div role={run.status === 'failed' ? 'alert' : 'note'} className="story-notice">{run.degradation.join('；')}{run.status === 'failed' ? '。可以更换模型后重试，已有版本仍保留。' : ''}</div> : null}
      <Assets run={run} saving={saving} onSave={save} />
      <div className="story-actions">
        {/* 排队中的版本：给一个人工问一句的入口。「还没好」不是「失败」 */}
        {onCheck && run.status === 'running' && run.taskId && <button className="btn-ghost" disabled={busy} onClick={() => onCheck(run)}>查一次（任务号 {String(run.taskId).slice(0, 12)}）</button>}
        {/* 同参重跑：有了它，一次偶然的好结果才算真的可复现（ComfyUI 里就是"再跑一次同样的图"） */}
        {onRerun && <button className="btn-ghost" disabled={busy} onClick={() => onRerun(run)}>照这版重跑 · 同 seed{run.seed != null ? ` ${run.seed}` : '（这一版没记 seed）'}</button>}
      </div>
    </article>)}
    {message && <p role="status" className="story-notice">{message}</p>}
  </section>
}
