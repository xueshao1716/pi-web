import { useMemo, useState } from 'react'
import { Sparkles, Copy, Check } from 'lucide-react'
import { VIDEO_SCENES, buildVideoPrompt } from '../lib/video-prompt.mjs'

const SCENE_KEYS = Object.keys(VIDEO_SCENES) as Array<keyof typeof VIDEO_SCENES & string>

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><label className="block text-[11px] text-pi-dim2 mb-1 tracking-wide">{label}</label>{children}</div>
)

export default function VideoPrompt({ onUsePrompt, onSpecChange }: {
  onUsePrompt?: (prompt: string) => void
  onSpecChange?: (spec: { seconds: string; frame: string }) => void
}) {
  const [scene, setScene] = useState<keyof typeof VIDEO_SCENES>('cinematic')
  const [subject, setSubject] = useState(VIDEO_SCENES.cinematic.subject)
  const [action, setAction] = useState(VIDEO_SCENES.cinematic.action)
  const [place, setPlace] = useState(VIDEO_SCENES.cinematic.scene)
  const [lighting, setLighting] = useState(VIDEO_SCENES.cinematic.lighting)
  const [camera, setCamera] = useState(VIDEO_SCENES.cinematic.camera)
  const [style, setStyle] = useState(VIDEO_SCENES.cinematic.style)
  const [constraint, setConstraint] = useState(VIDEO_SCENES.cinematic.constraint)
  const [seconds, setSeconds] = useState(VIDEO_SCENES.cinematic.seconds)
  const [frame, setFrame] = useState(VIDEO_SCENES.cinematic.frame)
  const [beats, setBeats] = useState('')
  const [memory, setMemory] = useState(VIDEO_SCENES.cinematic.memory || '')
  const [richness, setRichness] = useState<'lite' | 'standard'>('standard')
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState('')

  const pickScene = (key: keyof typeof VIDEO_SCENES) => {
    const s = VIDEO_SCENES[key]
    setScene(key)
    setSubject(s.subject)
    setAction(s.action)
    setPlace(s.scene)
    setLighting(s.lighting)
    setCamera(s.camera)
    setStyle(s.style)
    setConstraint(s.constraint)
    setSeconds(s.seconds)
    setFrame(s.frame)
    setMemory(s.memory || '')
    setBeats('')
    onSpecChange?.({ seconds: s.seconds, frame: s.frame })
  }

  const draft = useMemo(() => buildVideoPrompt({
    sceneKey: scene,
    subject, action, scene: place, lighting, camera, style, quality: '720P 清晰',
    constraint, seconds, frame, richness, beats, memory,
  }), [scene, subject, action, place, lighting, camera, style, constraint, seconds, frame, richness, beats, memory])

  const generate = () => {
    setOutput(draft)
    onUsePrompt?.(draft)
    onSpecChange?.({ seconds, frame })
  }

  const copyToClipboard = async () => {
    if (!output) return
    try { await navigator.clipboard.writeText(output); setCopied('1'); setTimeout(() => setCopied(''), 1500) } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="panel !p-3">
        <h3 className="text-[13px] font-semibold text-pi-text mb-2.5">镜头模板</h3>
        <div className="flex flex-wrap gap-1.5">
          {SCENE_KEYS.map((k: keyof typeof VIDEO_SCENES & string) => (
            <button key={k} type="button" onClick={() => pickScene(k)}
              className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors duration-fast ${scene === k ? 'bg-pi-accent text-white border-pi-accent font-medium' : 'bg-transparent text-pi-dim border-pi-border-soft hover:text-pi-text hover:border-pi-dim'}`}>
              {VIDEO_SCENES[k].icon} {VIDEO_SCENES[k].name}
            </button>
          ))}
        </div>
      </div>

      <div className="panel !p-3 space-y-3">
        <h3 className="text-[13px] font-semibold text-pi-text">镜头卡 · 主体 / 动作 / 场景</h3>
        <Field label="主体"><input className="input-pi text-[12px] min-h-11" value={subject} onChange={e => setSubject(e.target.value)} /></Field>
        <Field label="动作"><input className="input-pi text-[12px] min-h-11" value={action} onChange={e => setAction(e.target.value)} /></Field>
        <Field label="场景"><input className="input-pi text-[12px] min-h-11" value={place} onChange={e => setPlace(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="光影"><input className="input-pi text-[12px] min-h-11" value={lighting} onChange={e => setLighting(e.target.value)} /></Field>
          <Field label="运镜"><input className="input-pi text-[12px] min-h-11" value={camera} onChange={e => setCamera(e.target.value)} /></Field>
        </div>
        <Field label="风格"><input className="input-pi text-[12px] min-h-11" value={style} onChange={e => setStyle(e.target.value)} /></Field>
        <Field label="约束"><input className="input-pi text-[12px] min-h-11" value={constraint} onChange={e => setConstraint(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="时长">
            <select className="input-pi !py-2 text-[12px] min-h-11" value={seconds} onChange={e => { setSeconds(e.target.value); onSpecChange?.({ seconds: e.target.value, frame }) }}>
              {['5', '8', '10', '12'].map(s => <option key={s} value={s}>{s} 秒</option>)}
            </select>
          </Field>
          <Field label="画幅">
            <select className="input-pi !py-2 text-[12px] min-h-11" value={frame} onChange={e => { setFrame(e.target.value); onSpecChange?.({ seconds, frame: e.target.value }) }}>
              <option value="16:9">横版 16:9</option>
              <option value="9:16">竖版 9:16</option>
            </select>
          </Field>
        </div>
        <div className="flex gap-1.5">
          {([['lite', '精简'], ['standard', '标准']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setRichness(k)}
              className={`px-2.5 py-1 rounded-full text-[11px] border ${richness === k ? 'bg-pi-accent text-white border-pi-accent' : 'bg-transparent text-pi-dim border-pi-border-soft'}`}>{label}</button>
          ))}
        </div>
        {richness === 'standard' && (
          <>
            <Field label="记忆点">
              <input className="input-pi text-[12px] min-h-11" value={memory} onChange={e => setMemory(e.target.value)} placeholder="第几秒看见什么" />
            </Field>
            <Field label="时间轴（可改）">
              <textarea className="input-pi text-[12px] min-h-[72px] resize-none" rows={2} placeholder="空着就用镜头卡的起承转合" value={beats} onChange={e => setBeats(e.target.value)} />
            </Field>
          </>
        )}
      </div>

      <button type="button" onClick={generate} className="w-full py-3 min-h-11 rounded-pi-lg bg-gradient-to-r from-pi-accent to-pi-accent2 text-white font-semibold text-sm tracking-wider hover:brightness-110 transition-colors duration-fast">
        <Sparkles className="w-4 h-4 inline mr-2" />生成提示词
      </button>

      {output && (
        <div className="panel !p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-pi-text">生成结果</span>
            <div className="flex items-center gap-1.5">
              {onUsePrompt && (
                <button type="button" onClick={() => onUsePrompt(output)} className="btn-tool text-xs">填入出片框</button>
              )}
              <button type="button" onClick={copyToClipboard} className="btn-tool text-xs inline-flex items-center gap-1.5">
                {copied ? <><Check className="w-3.5 h-3.5 text-emerald-400" />已复制</> : <><Copy className="w-3.5 h-3.5" />复制</>}
              </button>
            </div>
          </div>
          <pre className="bg-black/30 rounded-pi-md p-3 text-[12px] text-pi-dim whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto font-mono">{output}</pre>
        </div>
      )}
    </div>
  )
}
