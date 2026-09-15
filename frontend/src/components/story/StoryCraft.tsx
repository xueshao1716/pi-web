import { useEffect, useState } from 'react'
import { StoryApi } from '../../api'
import type { StoryCraftAudit, StoryCraftEngine, StoryProject } from '../../types'

// 深度构思：**情绪契约 + 人物四件套 + 矛盾单元 + 分集地图 + 因果节拍 + 四账台账**。
//
// 用户说「人物、场景搭上了，深度构思还是不行」。去看同行怎么做
//（[short-drama-factory](https://github.com/lixiaoxiao9888-create/short-drama-factory) /
//  [drama-skills](https://github.com/zenstory-ai/drama-skills) / [Dramatron](https://github.com/google-deepmind/dramatron)），
// 真正的差别不在"提示词写得更长"，而在**有没有这些可检查的产物**：
//   · 全剧不变的是**情绪契约**（那口气），矛盾只是单元载具——一条矛盾硬拉 80 集必废；
//   · 人物先立**欲望/秘密/弧光/语言指纹**四件套，再谈大纲；
//   · 事件之间用「因此/但是」连接，不是「然后」并列；
//   · **无台账不开写**：伏笔要写清第几集回收，没写回收集的不许埋。
// 这几条都能在界面上逐条看、也能机检——所以这里不是"生成一大段文字"，而是把它摊成可核对的表。
export default function StoryCraft({ project, busy, onDone, onNotice, onError }: {
  project: StoryProject
  busy: boolean
  onDone: (project: StoryProject) => void
  onNotice: (text: string) => void
  onError: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [idea, setIdea] = useState('')
  const [episodes, setEpisodes] = useState(String((project.episodes || []).length || 12))
  const [draft, setDraft] = useState<StoryCraftEngine | null>(null)
  const [audit, setAudit] = useState<StoryCraftAudit | null>(null)
  const [working, setWorking] = useState('')
  const [msg, setMsg] = useState('')
  const engine = draft || project.craft || null

  // 打开面板就给**已保存的构思**做一次体检（只读、纯机检）。
  // 真机上踩到：体检只在"生成/保存"之后才算，于是打开一个已有构思的项目时，
  // 那条"伏笔没写回收集"安安静静躺着——体检的价值就在于当下看得见。
  useEffect(() => {
    if (!open || draft || !project.craft) return
    let alive = true
    void StoryApi.craftAudit(project.id, { plannedEpisodes: Number(episodes) || undefined })
      .then(r => { if (alive) setAudit(r.audit) })
      .catch(() => { /* 体检失败不该挡住面板 */ })
    return () => { alive = false }
  }, [open, draft, project.id, project.craft, episodes])

  const generate = async () => {
    setWorking('gen'); setMsg('')
    try {
      const r = await StoryApi.storyEngine(project.id, { idea: idea.trim() || undefined, episodes: Number(episodes) || undefined })
      setDraft(r.engine); setAudit(r.audit)
      onNotice(`深度构思已生成草稿：${r.engine.units.length} 个矛盾单元、${r.engine.episodeMap.length} 集地图、${r.engine.ledger.setups.length} 条伏笔${r.retried ? '（模型第一次没给 JSON，重试过一次）' : ''}。确认后再保存。`)
    } catch (e: any) { setMsg(e?.message || '深度构思没成功') } finally { setWorking('') }
  }
  const save = async () => {
    if (!engine) return
    setWorking('save'); setMsg('')
    try {
      const r = await StoryApi.saveCraft(project.id, { craft: engine })
      onDone(r.project); setDraft(null); setAudit(r.audit)
      onNotice('构思已保存到项目：后面的分集与生成都会它为准。')
    } catch (e: any) { setMsg(e?.message || '保存构思失败') } finally { setWorking('') }
  }
  const buildEpisodes = async () => {
    setWorking('map'); setMsg('')
    try {
      const r = await StoryApi.applyEpisodeMap(project.id, {})
      onDone(r.project)
      onNotice(r.created.length ? `按分集地图建了 ${r.created.length} 集${r.skipped ? `（${r.skipped} 集已存在，没覆盖你改过的）` : ''}，每集的目标与钩子都写进集里了。` : '地图里的集都已经存在，没有新建。')
    } catch (e: any) { setMsg(e?.message || '建集失败') } finally { setWorking('') }
  }

  const warn = (audit?.issues || []).filter(i => i.level === 'warn')
  const info = (audit?.issues || []).filter(i => i.level === 'info')
  return <div className="story-craft">
    <div className="story-head">
      <span>深度构思{engine ? ` · ${engine.units.length} 单元 / ${engine.episodeMap.length} 集${warn.length ? ` · ${warn.length} 处要修` : ''}` : ' · 还没做'}</span>
      <button className="btn-ghost" disabled={busy} onClick={() => setOpen(o => !o)}>{open ? '收起' : '深度构思'}</button>
    </div>
    {open && <div className="story-craft-body">
      <p className="story-hint">
        这里定的是**那口气**（情绪契约）、人物的<b>欲望/秘密/弧光/语言指纹</b>、矛盾按单元怎么跑、
        每集停在哪个钩子上，以及**伏笔埋在第几集、第几集回收**。
        一条矛盾烧满全剧是最常见的废稿原因——单元硬帽超过 30 集，体检会拦你一下。
      </p>
      <div className="story-craft-gen">
        <input aria-label="构思方向" value={idea} disabled={busy || working === 'gen'} placeholder="想加的方向（可留空）：如 女主视角、每集一个反转、结尾回到开场那场雨" onChange={e => setIdea(e.target.value)} />
        <label>计划集数<input aria-label="计划集数" value={episodes} disabled={busy || working === 'gen'} onChange={e => setEpisodes(e.target.value.replace(/[^0-9]/g, ''))} /></label>
        <button className="btn-primary" disabled={busy || working === 'gen'} onClick={generate}>{working === 'gen' ? '构思中…' : engine ? '重新构思（覆盖草稿）' : '开始深度构思'}</button>
        {draft && <button className="btn-ghost" disabled={busy || working === 'save'} onClick={save}>{working === 'save' ? '保存中…' : '确认并保存到项目'}</button>}
      </div>
      {msg && <p role="status" className="story-notice">{msg}</p>}
      {draft && <p className="story-notice">这是**草稿**，还没写进项目。看一遍，改不动的直接说，确认了再保存。</p>}

      {!!(warn.length || info.length) && <div className="story-craft-audit">
        <strong>构思体检</strong>
        <ul>
          {warn.map((i, k) => <li key={`w${k}`} className="is-warn">{i.message}</li>)}
          {info.map((i, k) => <li key={`i${k}`} className="is-info">{i.message}</li>)}
        </ul>
        <p className="story-hint">机检只查结构（伏笔有没有回收集、每集有没有钩子、单元矛盾有没有硬帽），查不了"好不好看"。</p>
      </div>}

      {engine && <>
        <div className="story-craft-block">
          <strong>情绪契约</strong>
          <p>{engine.emotionContract.line || '（没写）'}</p>
          {!!engine.emotionContract.neverDo.length && <p className="story-hint">绝不违背：{engine.emotionContract.neverDo.join('；')}</p>}
        </div>

        {!!engine.characters.length && <div className="story-craft-block">
          <strong>人物四件套</strong>
          <ul className="story-craft-cast">
            {engine.characters.map((c, i) => <li key={i}>
              <b>{c.name}</b>{c.slot ? <span className="story-craft-slot">{c.slot}</span> : null}
              <div>欲望：{c.desire || '—'}</div>
              <div>秘密：{c.secret || '—'}</div>
              <div>弧光：{c.arc || '—'}</div>
              <div className={c.voicePrint ? '' : 'is-warn'}>语言指纹：{c.voicePrint || '缺（没有它，两个角色的台词会一个腔调）'}</div>
            </li>)}
          </ul>
        </div>}

        {!!engine.units.length && <div className="story-craft-block">
          <strong>矛盾单元</strong>
          <ul className="story-craft-units">
            {engine.units.map((u, i) => <li key={i} className={u.cap && u.cap > 30 ? 'is-warn' : ''}>
              <b>第 {u.no} 单元</b>{u.episodes ? `（${u.episodes}）` : ''}{u.cap ? `硬帽 ${u.cap} 集` : ''}
              <div>{u.spine || '—'}</div>
              {u.rounds ? <div className="story-hint">回合：{u.rounds}</div> : null}
              <div className="story-hint">接缝：火种 {u.seam.ember || '—'}｜对手 {u.seam.opponent || '—'}｜弧光 {u.seam.arc || '—'}</div>
            </li>)}
          </ul>
        </div>}

        {!!engine.episodeMap.length && <div className="story-craft-block">
          <strong>分集地图</strong>
          <div className="story-actions">
            <button className="btn-ghost" disabled={busy || working === 'map'} onClick={buildEpisodes}>{working === 'map' ? '建集中…' : '按地图建集（写进项目的「集」）'}</button>
          </div>
          <ul className="story-craft-map">
            {engine.episodeMap.map((e, i) => <li key={i}>
              <b>第 {e.no} 集</b>
              <div>目标：{e.goal || '—'}</div>
              <div className={e.coldOpen ? 'story-hint' : 'is-warn'}>前 3 秒：{e.coldOpen || '缺'}</div>
              <div className={e.hook ? 'story-hint' : 'is-warn'}>断章钩子：{e.hook || '缺'}</div>
            </li>)}
          </ul>
        </div>}

        {!!engine.ledger.setups.length && <div className="story-craft-block">
          <strong>伏笔账</strong>
          <ul className="story-craft-ledger">
            {engine.ledger.setups.map((s, i) => <li key={i} className={s.payoffAt ? '' : 'is-warn'}>
              <span>埋第 {s.setupAt ?? '?'} 集</span>
              <span className={s.payoffAt ? '' : 'is-bad'}>{s.payoffAt ? `第 ${s.payoffAt} 集回收` : '没写回收集'}</span>
              <span>{s.text}</span>
            </li>)}
          </ul>
        </div>}

        {!!engine.beats.length && <div className="story-craft-block">
          <strong>因果节拍</strong>
          <ol className="story-craft-beats">
            {engine.beats.map((b, i) => <li key={i} className={/然后|接着|之后/.test(b.link) ? 'is-warn' : ''}>
              {b.event}<span className="story-craft-link">{b.link || '—'}</span>{b.changes.length ? <span className="story-hint">改变：{b.changes.join('、')}</span> : null}
            </li>)}
          </ol>
        </div>}

        {!!engine.ledger.rules.length && <div className="story-craft-block">
          <strong>规则账（不许破的）</strong>
          <ul>{engine.ledger.rules.map((r, i) => <li key={i}>{r.text}</li>)}</ul>
        </div>}
      </>}
    </div>}
  </div>
}
