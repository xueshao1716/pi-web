import { useState } from 'react'
import { StoryApi } from '../../api'
import type { StoryDialogueAuditResult, StoryDialogueDoctorResult, StoryProject } from '../../types'

// 台词专科：**先机检，再让模型诊断**。
//
// 用户的原话是「人物、场景搭上了，对话还是不行」。翻同行做法时发现，台词这块
// 最要命的几条**本来就是能算的**（[manju-laoli 的语速自检](https://github.com/lixiaoxiao9888-create/manju-laoli-skill)：
// 标准 3.5~5 字/秒、单句 >24 字强制拆镜、标点不计入字数），以前却要花一次模型调用
// 才能从"听起来别扭"里猜出"这句说不完"。所以这里分两层：
//   ① 体检（不花钱）：字数、需要的秒数、哪句超长、哪句在解释情绪；
//   ② 诊断（花一次）：照七维逐句改写，每条改写必须给 ≥3 条维度依据——
//      只给一句"更自然了"就等于没诊断，界面会把这种条目标出来。
const levelLabel: Record<string, string> = { ok: '没发现硬问题', info: '有可改进', warn: '有硬问题' }

export default function StoryDialogue({ project, sceneId, busy, onDone, onNotice, onError }: {
  project: StoryProject
  sceneId?: string
  busy: boolean
  onDone: (project: StoryProject) => void
  onNotice: (text: string) => void
  onError: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [audit, setAudit] = useState<StoryDialogueAuditResult | null>(null)
  const [doctor, setDoctor] = useState<StoryDialogueDoctorResult | null>(null)
  const [working, setWorking] = useState('')
  const [msg, setMsg] = useState('')
  const [adopted, setAdopted] = useState<string[]>([])

  const runAudit = async () => {
    setWorking('audit'); setMsg('')
    try { const r = await StoryApi.dialogueAudit(project.id, sceneId ? { sceneId } : {}); setAudit(r) }
    catch (e: any) { setMsg(e?.message || '台词体检失败') } finally { setWorking('') }
  }
  const runDoctor = async () => {
    setWorking('doctor'); setMsg('')
    try {
      const r = await StoryApi.dialogueDoctor(project.id, sceneId ? { sceneId } : {})
      setDoctor(r); setAudit({ scenes: [{ sceneId: r.sceneId, title: r.sceneTitle, beats: [{ beatId: '', beatKind: '', budgetSec: null, audit: r.audit }] }], totals: { beats: 1, chars: r.audit.speech.chars, warn: r.audit.issues.filter(i => i.level === 'warn').length, info: r.audit.issues.filter(i => i.level === 'info').length }, notes: {} })
      onNotice(`台词诊断完成：${r.doctor.lines.length} 句里改了 ${r.doctor.changed} 句${r.retried ? '（模型第一次没给 JSON，重试过一次）' : ''}。逐条看，采纳哪条就写回哪条。`)
    } catch (e: any) { setMsg(e?.message || '台词诊断失败') } finally { setWorking('') }
  }
  // 采纳一条改写：写回这一段（beat）的台词。
  // 只替换**命中的那一行**，同段其它台词一个字都不动——台词是剧作内容，不许被顺手重排。
  const adopt = async (speaker: string, original: string, rewritten: string) => {
    const target = project.scenes.flatMap(s => (s.beats || []).map(b => ({ scene: s, beat: b })))
      .find(({ beat }) => String(beat.dialogue || '').includes(original))
    if (!target) { onError('找不到这句台词在哪一段了（可能刚被改过），刷新后再试'); return }
    setWorking(original)
    try {
      const dialogue = String(target.beat.dialogue || '').replace(original, rewritten)
      const scenes = project.scenes.map(s => s.id !== target.scene.id ? s : { ...s, beats: s.beats.map(b => b.id === target.beat.id ? { ...b, dialogue } : b) })
      const r = await StoryApi.patchProject(project.id, { scenes } as any)
      onDone(r.project)
      setAdopted(prev => [...prev, original])
      onNotice(`已采纳这句：${speaker}「${rewritten.slice(0, 30)}${rewritten.length > 30 ? '…' : ''}」`)
    } catch (e: any) { onError(e?.message || '写回台词失败') } finally { setWorking('') }
  }

  const sceneRows = audit?.scenes || []
  return <div className="story-dialogue">
    <div className="story-head">
      <span>台词{audit ? ` · ${audit.totals.beats} 段 / ${audit.totals.chars} 字${audit.totals.warn ? ` · ${audit.totals.warn} 处硬问题` : ''}` : ''}</span>
      <button className="btn-ghost" disabled={busy} onClick={() => { setOpen(o => !o); if (!open && !audit) void runAudit() }}>{open ? '收起' : '台词'}</button>
    </div>
    {open && <div className="story-dialogue-body">
      <p className="story-hint">
        台词按 <strong>3.5~5 字/秒</strong>算（标点不计入字数，另算停顿）。单句超过 24 字就得拆镜——
        这是同行用一千多个项目换来的经验值。体检<strong>不花模型钱</strong>；诊断才调模型。
        {sceneId ? '（当前只体检选中的这一场）' : '（体检全项目）'}
      </p>
      <div className="story-actions">
        <button className="btn-ghost" disabled={busy || working === 'audit'} onClick={runAudit}>{working === 'audit' ? '体检中…' : '台词体检（不花钱）'}</button>
        <button className="btn-primary" disabled={busy || working === 'doctor'} onClick={runDoctor}>{working === 'doctor' ? '诊断中…' : '台词诊断与重构（调模型）'}</button>
      </div>
      {msg && <p role="status" className="story-notice">{msg}</p>}

      {!!sceneRows.length && <div className="story-dialogue-audit">
        {sceneRows.map(s => <div key={s.sceneId} className="story-dialogue-scene">
          <div className="story-dialogue-scene-head"><strong>{s.title || '未命名场景'}</strong><span>{s.beats.length} 段有台词</span></div>
          {s.beats.map(b => <div key={b.beatId || 'x'} className={`story-dialogue-beat is-${b.audit.level}`}>
            <div className="story-dialogue-metrics">
              <span>{b.audit.speech.chars} 字</span>
              <span>需 {b.audit.speech.minSec}~{b.audit.speech.maxSec} 秒</span>
              {b.budgetSec ? <span className={b.audit.speech.minSec > b.budgetSec ? 'is-bad' : ''}>这段预算 {b.budgetSec} 秒</span> : null}
              <span>{levelLabel[b.audit.level] || b.audit.level}</span>
              <span>{b.audit.speakers.map(x => `${x.speaker} ${x.lines}句`).join(' · ')}</span>
            </div>
            {!!b.audit.issues.length && <ul className="story-dialogue-issues">
              {b.audit.issues.map((i, k) => <li key={k} className={`is-${i.level}`}>
                {i.dim ? `【${i.dim}】` : ''}{i.message}{i.text ? <em>「{String(i.text).slice(0, 34)}{String(i.text).length > 34 ? '…' : ''}」</em> : null}
              </li>)}
            </ul>}
            {!!b.audit.humanDims.length && <p className="story-hint">机检查不了：{b.audit.humanDims.join('、')}——「金句够不够狠」「潜台词够不够深」只能人看，别把体检通过当成台词好。</p>}
          </div>)}
        </div>)}
      </div>}

      {doctor && <div className="story-dialogue-doctor">
        <div className="story-doctor-head">
          <strong>{doctor.sceneTitle || '这一场'} · 诊断结果</strong>
          <span>{doctor.model.provider}/{doctor.model.id}{doctor.retried ? ' · 重试过' : ''}</span>
        </div>
        {doctor.doctor.summary && <p className="story-doctor-summary">{doctor.doctor.summary}</p>}
        <ul className="story-doctor-lines">
          {doctor.doctor.lines.map((l, i) => <li key={i} className={`story-doctor-line${adopted.includes(l.original) ? ' is-adopted' : ''}`}>
            <div className="story-doctor-orig"><span>原</span>{l.speaker ? `${l.speaker}：` : ''}{l.original}</div>
            {l.rewritten && l.rewritten !== l.original
              ? <div className="story-doctor-new"><span>改</span>{l.rewritten}</div>
              : <div className="story-doctor-keep"><span>留</span>这一句不用动</div>}
            {!!l.reasons.length && <ul className="story-doctor-reasons">{l.reasons.map((r, k) => <li key={k}>{r}</li>)}</ul>}
            {l.thin && <p className="story-hint is-warn">这条改写只给了 {l.reasons.length} 条依据（要求 ≥3 条）——依据不足，看清楚再决定。</p>}
            {!!l.shots.length && <div className="story-doctor-shots">
              <span>拆镜建议</span>
              {l.shots.map((s, k) => <div key={k}><em>{s.shot}</em>{s.text}<span>{s.chars} 字</span></div>)}
            </div>}
            {l.rewritten && l.rewritten !== l.original && !adopted.includes(l.original) &&
              <button className="btn-ghost" disabled={busy || working === l.original} onClick={() => adopt(l.speaker, l.original, l.rewritten)}>
                {working === l.original ? '写回中…' : '采纳这一条（写回台词）'}
              </button>}
            {adopted.includes(l.original) && <span className="story-doctor-adopted">已采纳</span>}
          </li>)}
        </ul>
        {!!doctor.doctor.keep.length && <details className="story-doctor-keep-list">
          <summary>模型认为不用动的（{doctor.doctor.keep.length}）</summary>
          <ul>{doctor.doctor.keep.map((k, i) => <li key={i}>{k}</li>)}</ul>
        </details>}
        <p className="story-hint">采纳只替换这一句，同段其它台词一个字不动。诊断是草稿——它给的理由你不认，就别采纳。</p>
      </div>}
    </div>}
  </div>
}
