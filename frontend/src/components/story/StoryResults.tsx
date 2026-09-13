import { useEffect, useState } from 'react'
import { downloadApiFile, withFileToken } from '../../api'
import type { StoryBeat, StoryScene } from '../../types'

const labels: Record<string,string> = { queued:'待执行',running:'正在生成',failed:'生成失败',succeeded:'已生成',degraded:'已生成 · 请核对连续性' }
export default function StoryResults({ scene, beat }: { scene: StoryScene; beat: StoryBeat }) {
  const runs = (scene.outputs || []).filter(run => run.beatId === beat.id).slice().reverse()
  const [version, setVersion] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const current = runs.find(run => run.id === version) || runs[0]
  useEffect(() => { setVersion(''); setMessage('') }, [beat.id, runs[0]?.id])
  const save = async (url: string, name: string) => {
    setSaving(true)
    try { setMessage(await downloadApiFile(url, name, setMessage)) }
    catch (e: any) { setMessage(e?.message || '下载未完成，请重试') }
    finally { setSaving(false) }
  }
  return <section className="story-results" aria-label="生成预览">
    <div className="story-section-head"><h2>本段结果</h2><span>{runs.length} 个运行记录</span></div>
    {runs.length > 1 && <label>版本对比<select aria-label="查看生成版本" value={current?.id || ''} onChange={e => setVersion(e.target.value)}>{runs.map((run,i) => <option key={run.id} value={run.id}>第 {runs.length-i} 版 · {labels[run.status]} · {new Date(run.createdAt).toLocaleString('zh-CN')}</option>)}</select></label>}
    {current && <p className="story-hint">{labels[current.status]} · {current.model.provider}/{current.model.id}</p>}
    {current?.degradation?.length ? <div role={current.status === 'failed' ? 'alert' : 'note'} className="story-notice">{current.degradation.join('；')}{current.status === 'failed' ? '。可以更换模型后重试，已有版本仍保留。' : ''}</div> : null}
    {!current?.outputAssets?.length && <div className="story-output-empty">{current?.status === 'running' ? '模型正在生成，完成后结果会出现在这里。' : '本段还没有成品。检查左侧内容，然后点击“生成当前段落/画面/视频”。'}</div>}
    {current?.outputAssets?.map((asset,i) => {
      const url = String(asset.url || '')
      const src = url ? withFileToken(url) : ''
      return <div key={asset.id || i} className="story-output">
        {asset.type === 'image' && src && <img src={src} alt="本段生成画面" />}
        {asset.type === 'video' && src && <video src={src} controls playsInline preload="metadata" />}
        {asset.type === 'text' && <div className="story-prose">{String(asset.text || '')}</div>}
        {src && <div className="story-actions"><button className="btn-ghost" disabled={saving} onClick={() => save(url, `故事-${beat.id}-${i + 1}.${asset.type === 'video' ? 'mp4' : 'png'}`)}>{saving ? '保存中…' : '下载本段成品'}</button><a href={src} target="_blank" rel="noopener noreferrer">打开原文件</a></div>}
      </div>
    })}
    {message && <p role="status" className="story-notice">{message}</p>}
  </section>
}
