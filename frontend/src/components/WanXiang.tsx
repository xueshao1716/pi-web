import { useState, useCallback } from 'react'
import { Sparkles, Copy, Check, Dice5 } from 'lucide-react'

// ── 万像人物 · 写真提示词生成器（React化）──
// 纯前端：选场景 → 五要素 → 光影风格 → 输出提示词（即梦/MJ/SD通用）

// ─── 场景模板 ───
const SCENES = {
  idcard: { name: '标准证件照', icon: '🪪',
    look: '面部对称，五官端正，双眼位于同一水平线，鼻子挺拔',
    outfit: '深色有领上衣，无logo，无手表，无现代饰品',
    pose: '中性微闭口，视线看镜头正中，双肩平行，头顶占画面10%',
    lighting: '均匀柔和光线，面部无高光，背景纯色无渐变', style: '标准证件', bg: '纯白背景' },
  business: { name: '商务形象照', icon: '💼',
    look: '面容干净，专业气质，眼神沉稳',
    outfit: '深色西装两件套（藏青/碳灰），衬衫第二颗扣系上',
    pose: '45度斜侧坐，十指交叉前置大腿，腰背挺直',
    lighting: '1.4m八角柔光箱45度主光+反光板补光+轮廓光', style: '极简商务', bg: '纯白/浅灰无缝背景' },
  group: { name: '集体商务宣传照', icon: '👥',
    look: '团队专业形象，气质统一',
    outfit: '统一深色商务着装',
    pose: 'V形站位，CEO居中轴线，双肩后展',
    lighting: '双柔光箱左右35度主光+补光+轮廓光', style: '专业商务', bg: '哑光深蓝无缝背景，顶部留白' },
  dark: { name: '深色商务肖像', icon: '🖤',
    look: '面部轮廓硬朗，眼神深邃',
    outfit: '深色系服装，强调质感',
    pose: '稳重坐姿，双手自然',
    lighting: '高对比影棚人像，单一光源顶部偏左，纯黑背景', style: '高对比影棚', bg: '纯黑色无细节背景' },
  art: { name: '艺术写真（戏剧光影）', icon: '🎭',
    look: '艺术气质，情绪张力',
    outfit: '飘逸质感服装，层次丰富',
    pose: '动态姿势，肢体舒展',
    lighting: '戏剧聚光，强明暗对比，光晕扩散', style: 'editorial_fashion', bg: '纯色背景（可带光晕）' },
  gufeng: { name: '古风华丽肖像', icon: '🏮',
    look: '皮肤雪白，眼睛狭长眼尾上挑，长睫毛',
    outfit: '华丽繁复垂坠大发冠，珠宝流苏，钻石水晶珍珠大项链',
    pose: '全身特写，高级构图，肢体动作有张力',
    lighting: '华丽光影，唯美朦胧，极致超清', style: '工笔画', bg: '古风宫廷背景' },
  qingxu: { name: '情绪化电影感特写', icon: '🎞',
    look: '发丝凌乱透冷光，天真无辜眼神凝视镜头',
    outfit: '艳丽粉底碎花短袖袄，民国风味',
    pose: '特写，焦点锁定眼部折射光斑',
    lighting: '电影级冷暖光对冲，明暗高对比，柔焦虚化', style: '电影海报', bg: '民国街道虚化背景' },
  chuangyi: { name: '创意艺术与概念肖像', icon: '✨',
    look: '独特气质，辨识度高的五官',
    outfit: '流体金属质感服装，未来主义配饰',
    pose: '夸张比例，创意构图',
    lighting: '赛博霓虹光效，动态光斑', style: '概念艺术', bg: '超现实环境' },
}

const SCENE_KEYS = Object.keys(SCENES) as (keyof typeof SCENES)[]

const PICK = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const MAYBE = (p = 0.5) => Math.random() < p

// ─── 负面词库 ───
const NEG_UNIVERSAL = '没有多余肢体，没有六根手指，没有畸形，没有模糊，没有水印，没有文字，没有丑陋'
const NEG_REAL = '不是卡通，不是动画，不是3D渲染，不是塑料感，不是游戏画面'
const NEG_BG = '没有杂乱背景，没有其他人，没有无关物体'
const NEG_TO_CN: Record<string, string> = {
  '没有多余肢体': '肢体完整', '没有六根手指': '五指自然', '没有畸形': '形态正常',
  '没有模糊': '画面清晰', '没有水印': '无水印', '没有文字': '无文字', '没有丑陋': '五官端正',
  '不是卡通': '真人写实', '不是动画': '非动画', '不是3D渲染': '照片质感',
  '不是塑料感': '真实皮肤纹理', '不是游戏画面': '非游戏风格',
  '没有杂乱背景': '纯净背景', '没有其他人': '单人画面', '没有无关物体': '主体聚焦',
}

const SKIN_MAP: Record<string, string> = {
  '瓷白': 'porcelain_tone（L82 a+2，通透质感）', '暖白': 'warm_white（L75 a+3，自然质感）',
  '蜜色': 'honey_tone（L68 a+4，健康光泽）', '小麦色': 'tan_tone（L60 a+5，阳光质感）',
}

// ─── 赌图池 ───
const GAMBLE = {
  gender: ['女性', '男性'], scene: SCENE_KEYS,
  style: ['自然光写实主义', 'editorial_fashion', '工笔画', '水墨漫画融合', '胶片质感', '电影海报', '概念艺术'],
  body: ['沙漏形', '梨形', '矩形', '倒三角', '纤细型', '匀称型'],
  lighting: ['窗边柔光', '三点式布光', '电影级冷暖光对冲', '逆光剪影', '戏剧聚光', '梦幻柔焦', '金色辉光'],
}
const PICKGAMBLE = <T extends keyof typeof GAMBLE>(dim: T, locks: Set<string>, chance: number) => {
  if (locks.has(dim)) return null
  if (Math.random() >= chance) return null
  return PICK(GAMBLE[dim])
}

// ─── Tag / Toggle 组件 ───
const Tags = ({ items, value, onChange }: { items: [string, string][]; value: string; onChange: (v: string) => void }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map(([k, label]) => (
      <button key={k} onClick={() => onChange(k)}
        className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors duration-fast ${value === k ? 'bg-pi-accent text-white border-pi-accent font-medium' : 'bg-transparent text-pi-dim border-pi-border-soft hover:text-pi-text hover:border-pi-dim'}`}>
        {label}
      </button>
    ))}
  </div>
)

const Toggle = ({ v, set, label }: { v: boolean; set: (v: boolean) => void; label: string }) => (
  <label className="flex items-center gap-2.5 cursor-pointer">
    <span className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${v ? 'bg-pi-accent' : 'bg-pi-border-soft'}`} onClick={() => set(!v)}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${v ? 'translate-x-4' : ''}`} />
    </span>
    <span className={`text-[12px] transition-colors ${v ? 'text-pi-text font-medium' : 'text-pi-dim'}`}>{label}</span>
  </label>
)

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><label className="block text-[11px] text-pi-dim2 mb-1 tracking-wide">{label}</label>{children}</div>
)

// ─── 主组件 ───
export default function WanXiang({ onUsePrompt }: { onUsePrompt?: (prompt: string) => void } = {}) {
  // 场景
  const [scene, setScene] = useState<keyof typeof SCENES>('idcard')
  // 五要素
  const [gender, setGender] = useState('女性')
  const [age, setAge] = useState(28)
  const [ptype, setPtype] = useState('真人')
  const [look, setLook] = useState('')
  const [height, setHeight] = useState(168)
  const [weight, setWeight] = useState(52)
  const [body, setBody] = useState('沙漏形')
  const [face, setFace] = useState('鹅蛋脸')
  const [skintone, setSkintone] = useState('瓷白')
  const [outfit, setOutfit] = useState('')
  const [shot, setShot] = useState('半身特写')
  const [angle, setAngle] = useState('平视')
  const [pose, setPose] = useState('')
  const [expression, setExpression] = useState('')
  // 光影·风格
  const [lighting, setLighting] = useState('窗边柔光')
  const [mood, setMood] = useState('唯美朦胧')
  const [style, setStyle] = useState('自然光写实主义')
  const [bg, setBg] = useState('')
  // 技术增强
  const [uhq, setUhq] = useState(true)
  const [zero, setZero] = useState(true)
  const [deai, setDeai] = useState(false)
  const [composition, setComposition] = useState(false)
  const [emotion, setEmotion] = useState(false)
  // 平台
  const [platform, setPlatform] = useState('dreamina')
  // 负面过滤
  const [negUniversal, setNegUniversal] = useState(true)
  const [negReal, setNegReal] = useState(true)
  const [negBg, setNegBg] = useState(false)
  // 赌图
  const [gamble, setGamble] = useState(false)
  const [gambleChance, setGambleChance] = useState(0.5)
  const [gambleLocks, setGambleLocks] = useState<Set<string>>(new Set(['gender']))
  // 输出
  const [output, setOutput] = useState('')
  const [visualPrompt, setVisualPrompt] = useState('')
  const [copied, setCopied] = useState('')

  // 场景切换 → 自动填充
  const selectScene = useCallback((k: keyof typeof SCENES) => {
    setScene(k); const s = SCENES[k]
    setLook(s.look); setOutfit(s.outfit); setPose(s.pose); setBg(s.bg); setStyle(s.style)
    const lm: Record<string, string> = { '华丽光影': '梦幻柔焦', '电影级冷暖光': '电影级冷暖光对冲', '戏剧聚光': '戏剧聚光', '赛博霓虹光效': '电影级冷暖光对冲' }
    const lm2 = Object.entries(lm).find(([f]) => s.lighting.includes(f))
    // 映射不到时回退到下拉列表内已有的值，避免 select 落在不存在值上显示空白
    setLighting(lm2 ? lm2[1] : (s.style === '工笔画' ? '金色辉光' : '窗边柔光'))
  }, [])

  // 生成提示词
  const generate = useCallback(() => {
    // 赌图：按概率随机覆写风格/身形/光影（旧版万像核心玩法）；性别默认锁定可解锁
    let g = gender
    let _style = style, _body = body, _lighting = lighting
    const gambled: string[] = []
    if (gamble) {
      const roll = <T,>(dim: keyof typeof GAMBLE, pool: readonly T[]): T | null =>
        (gambleLocks.has(dim) ? null : (Math.random() < gambleChance ? PICK([...pool]) : null))
      if (!gambleLocks.has('gender')) { const v = roll('gender', GAMBLE.gender); if (v) g = v as string }
      const st = roll('style', GAMBLE.style); if (st) { _style = st; gambled.push('风格') }
      const bd = roll('body', GAMBLE.body); if (bd) { _body = bd; gambled.push('身形') }
      const lt = roll('lighting', GAMBLE.lighting); if (lt) { _lighting = lt; gambled.push('光影') }
    }
    const sk = skintone
    const _look = look || '面容端正，五官协调'
    const _outfit = outfit || '简约得体的服装'
    const _pose = pose || '自然站姿，重心稳定'
    const _expr = expression || '自然微笑，眼神有神'
    const _bg = bg || '纯色背景'
    const _skin = SKIN_MAP[sk] || sk
    const bodyDesc = g === '女性' ? `${height}cm/${weight}kg/${_body}身形，腰臀比0.65-0.7` : `${height}cm/${weight}kg/${_body}身形，肩髋比1.2-1.35`

    const main = `${ptype}，${g}，${age}岁，${face}，${_look}，${_skin}，${bodyDesc}，${_expr}`
    const comp = `${shot}，${angle}，${_pose}`
    let light = _lighting
    if (zero) light += '（零器材模式：自然天幕光，无电线，无灯架，无器材入镜）'
    const amb = `${light}，${mood}氛围`

    const tech: string[] = []
    if (uhq) tech.push('超清画质高细节，极致细节，干净光滑的画面')
    if (deai) tech.push('真实皮肤纹理，毛孔清晰可见，照片级真实感')
    if (composition) tech.push('黄金分割构图，引导线引导视线，画面平衡有张力')
    if (emotion) tech.push('情绪光晕，光晕自然扩散，氛围感强')

    const parts = [main, _outfit, comp, amb, _style, _bg, tech.join('，')].filter(Boolean)
    const visual = parts.join('，')
    setVisualPrompt(visual)
    onUsePrompt?.(visual)

    if (platform === 'dreamina') {
      const negArr: string[] = []
      if (negUniversal) negArr.push(NEG_UNIVERSAL)
      if (negReal) negArr.push(NEG_REAL)
      if (negBg) negArr.push(NEG_BG)
      const negJoined = negArr.join('，')
      const wParts = ['五官端正:0.85', '肢体自然:0.85', '真实皮肤纹理:0.85']
      if (uhq) wParts.unshift('超清画质:0.9')
      const negPairs = negJoined.split('，').filter(Boolean).map(x => `${NEG_TO_CN[x] || x}:0.85`).join(', ')
      setOutput((gambled.length ? `【赌图命中】${gambled.join(' / ')}\n\n` : '') + `【画面描述】\n${parts.join('，')}\n\n【权重调整】\n${wParts.join(', ')}${negPairs ? '\n' + negPairs : ''}\n\n【质量保障】\n${negJoined}`)
    } else if (platform === 'mj') {
      const negArr: string[] = []
      if (negUniversal) negArr.push(...NEG_UNIVERSAL.split('，'))
      if (negReal) negArr.push(...NEG_REAL.split('，'))
      if (negBg) negArr.push(...NEG_BG.split('，'))
      setOutput(parts.join(', ') + '\n\n--style raw --stylize 600 --ar 2:3' + (negArr.length ? ' --no ' + negArr.join(', ') : ''))
    } else {
      const negArr: string[] = [...NEG_UNIVERSAL.split('，')]
      if (negReal) negArr.push(...NEG_REAL.split('，'))
      if (negBg) negArr.push(...NEG_BG.split('，'))
      setOutput(parts.join(', ') + '\n\nNegative prompt: ' + negArr.filter(Boolean).join(', ') + '\n\nControlNet: openpose + depth | LoRA: <lora:body_proportion_v2:0.7>')
    }
  }, [gender, age, ptype, look, height, weight, body, face, skintone, outfit, shot, angle, pose, expression, lighting, mood, style, bg, uhq, zero, deai, composition, emotion, platform, negUniversal, negReal, negBg, gamble, gambleChance, gambleLocks, onUsePrompt])

  const copyToClipboard = useCallback(async () => {
    if (!output) return
    try { await navigator.clipboard.writeText(output); setCopied('1'); setTimeout(() => setCopied(''), 1500) } catch {}
  }, [output])

  return (
    <div className="space-y-4">
      {/* 场景模板 */}
      <div className="panel !p-3">
        <h3 className="text-[13px] font-semibold text-pi-text mb-2.5 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-pi-accent/15 text-pi-accent text-[10px] font-bold flex items-center justify-center">1</span>
          场景模板
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {SCENE_KEYS.map(k => (
            <button key={k} onClick={() => selectScene(k)}
              className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors duration-fast ${scene === k ? 'bg-pi-accent text-white border-pi-accent font-medium' : 'bg-transparent text-pi-dim border-pi-border-soft hover:text-pi-text hover:border-pi-dim'}`}>
              {SCENES[k].icon} {SCENES[k].name}
            </button>
          ))}
        </div>
      </div>

      {/* 五要素 */}
      <div className="panel !p-3 space-y-3">
        <h3 className="text-[13px] font-semibold text-pi-text mb-2.5 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-pi-accent/15 text-pi-accent text-[10px] font-bold flex items-center justify-center">2</span>
          基本信息
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <Field label="性别">
            <select className="input-pi !py-1.5 text-[12px]" value={gender} onChange={e => setGender(e.target.value)}><option>女性</option><option>男性</option></select>
          </Field>
          <Field label="年龄">
            <input type="number" min={16} max={80} className="input-pi !py-1.5 text-[12px]" value={age} onChange={e => setAge(+e.target.value)} />
          </Field>
          <Field label="类型">
            <select className="input-pi !py-1.5 text-[12px]" value={ptype} onChange={e => setPtype(e.target.value)}><option>真人</option><option>古风</option><option>漫画</option></select>
          </Field>
        </div>
        <Field label="外貌特征">
          <input className="input-pi text-[12px]" placeholder="皮肤/脸型/五官（留空用模板默认）" value={look} onChange={e => setLook(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="身高 cm"><input type="number" className="input-pi !py-1.5 text-[12px]" value={height} onChange={e => setHeight(+e.target.value)} /></Field>
          <Field label="体重 kg"><input type="number" className="input-pi !py-1.5 text-[12px]" value={weight} onChange={e => setWeight(+e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="身材"><select className="input-pi !py-1.5 text-[12px]" value={body} onChange={e => setBody(e.target.value)}><option>沙漏形</option><option>梨形</option><option>矩形</option><option>倒三角</option><option>纤细型</option><option>匀称型</option></select></Field>
          <Field label="脸型"><select className="input-pi !py-1.5 text-[12px]" value={face} onChange={e => setFace(e.target.value)}><option>鹅蛋脸</option><option>瓜子脸</option><option>圆脸</option><option>方脸</option><option>心形脸</option><option>长脸</option></select></Field>
          <Field label="肤色"><select className="input-pi !py-1.5 text-[12px]" value={skintone} onChange={e => setSkintone(e.target.value)}><option>瓷白</option><option>暖白</option><option>蜜色</option><option>小麦色</option></select></Field>
        </div>
        <Field label="服装">
          <input className="input-pi text-[12px]" placeholder="服装描述（留空用模板默认）" value={outfit} onChange={e => setOutfit(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="景别"><select className="input-pi !py-1.5 text-[12px]" value={shot} onChange={e => setShot(e.target.value)}><option>半身特写</option><option>全身</option><option>特写</option><option>七分身</option><option>胸部以上</option></select></Field>
          <Field label="视角"><select className="input-pi !py-1.5 text-[12px]" value={angle} onChange={e => setAngle(e.target.value)}><option>平视</option><option>仰视</option><option>俯视</option><option>微仰视</option></select></Field>
        </div>
        <Field label="肢体动作"><input className="input-pi text-[12px]" placeholder="肢体动作描述" value={pose} onChange={e => setPose(e.target.value)} /></Field>
        <Field label="表情"><input className="input-pi text-[12px]" placeholder="表情描述" value={expression} onChange={e => setExpression(e.target.value)} /></Field>
      </div>

      {/* 光影·风格 */}
      <div className="panel !p-3 space-y-3">
        <h3 className="text-[13px] font-semibold text-pi-text mb-2.5 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-pi-accent/15 text-pi-accent text-[10px] font-bold flex items-center justify-center">3</span>
          光影 · 氛围 · 风格
        </h3>
        <Field label="光影"><select className="input-pi !py-1.5 text-[12px]" value={lighting} onChange={e => setLighting(e.target.value)}><option>窗边柔光</option><option>三点式布光</option><option>电影级冷暖光对冲</option><option>逆光剪影</option><option>戏剧聚光</option><option>梦幻柔焦</option><option>金色辉光</option></select></Field>
        <Field label="氛围"><select className="input-pi !py-1.5 text-[12px]" value={mood} onChange={e => setMood(e.target.value)}><option>唯美朦胧</option><option>清冷淡雅</option><option>温暖柔和</option><option>高对比戏剧</option><option>复古胶片</option><option>赛博霓虹</option><option>水墨意境</option></select></Field>
        <Field label="风格"><select className="input-pi !py-1.5 text-[12px]" value={style} onChange={e => setStyle(e.target.value)}><option>自然光写实主义</option><option>editorial_fashion</option><option>工笔画</option><option>水墨漫画融合</option><option>胶片质感</option><option>电影海报</option><option>概念艺术</option></select></Field>
        <Field label="背景"><input className="input-pi text-[12px]" placeholder="背景环境描述" value={bg} onChange={e => setBg(e.target.value)} /></Field>
      </div>

      {/* 技术增强 + 输出 */}
      <div className="panel !p-3 space-y-2.5">
        <h3 className="text-[13px] font-semibold text-pi-text mb-2.5">技术增强 & 输出</h3>
        <Toggle v={uhq} set={setUhq} label="超高清画质（UHQ）" />
        <Toggle v={zero} set={setZero} label="零器材模式" />
        <Toggle v={deai} set={setDeai} label="去AI化真实感" />
        <Toggle v={composition} set={setComposition} label="构图系统" />
        <Toggle v={emotion} set={setEmotion} label="情绪光晕" />
        <hr className="border-pi-border-soft my-2" />
        <Field label="输出平台">
          <div className="flex gap-1.5">
            {[['dreamina', '即梦'], ['mj', 'MJ'], ['sd', 'SD']].map(([k, l]) => (
              <button key={k} onClick={() => setPlatform(k)} className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors duration-fast ${platform === k ? 'bg-pi-accent text-white border-pi-accent' : 'bg-transparent text-pi-dim border-pi-border-soft hover:text-pi-text'}`}>{l}</button>
            ))}
          </div>
        </Field>
        <div className="flex items-center gap-3">
          <Toggle v={negUniversal} set={setNegUniversal} label="通用质量过滤" />
          <Toggle v={negReal} set={setNegReal} label="写实强化" />
          <Toggle v={negBg} set={setNegBg} label="纯净背景" />
        </div>
        <hr className="border-pi-border-soft my-2" />
        {/* 赌图模式 */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Toggle v={gamble} set={setGamble} label="🎲 赌图模式" />
          {gamble && (
            <>
              <label className="text-[11px] text-pi-dim flex items-center gap-1.5">命中概率
                <input type="range" min={10} max={90} step={5} value={Math.round(gambleChance * 100)} onChange={e => setGambleChance(+e.target.value / 100)} className="w-24 accent-pi-accent" />
                <span className="text-pi-text font-mono w-8 text-right">{Math.round(gambleChance * 100)}%</span>
              </label>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-pi-dim2">锁定:</span>
                {(['gender', 'style', 'body', 'lighting'] as const).map(dim => (
                  <button key={dim} onClick={() => setGambleLocks(prev => {
                    const next = new Set(prev); next.has(dim) ? next.delete(dim) : next.add(dim); return next
                  })}
                    className={`px-1.5 py-0.5 rounded-full text-[10px] border ${gambleLocks.has(dim) ? 'bg-pi-accent/15 text-pi-accent border-pi-accent/40' : 'bg-transparent text-pi-dim2 border-pi-border-soft'}`}>
                    {{ gender: '性别', style: '风格', body: '身形', lighting: '光影' }[dim]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 生成按钮 */}
      <button onClick={generate} className="w-full py-3 rounded-pi-lg bg-gradient-to-r from-pi-accent to-pi-accent2 text-white font-semibold text-sm tracking-wider hover:brightness-110 transition-colors duration-fast">
        <Sparkles className="w-4 h-4 inline mr-2" />生成提示词
      </button>

      {/* 输出 */}
      {output && (
        <div className="panel !p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-pi-text">生成结果</span>
            <div className="flex items-center gap-1.5">
              {onUsePrompt && (
                <button onClick={() => onUsePrompt(visualPrompt || output)} className="btn-tool text-xs">填入出图框</button>
              )}
              <button onClick={copyToClipboard} className="btn-tool text-xs inline-flex items-center gap-1.5">
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
