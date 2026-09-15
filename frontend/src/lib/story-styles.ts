// 风格预设：把"这部戏长什么样"从一句自由发挥变成**可选的统一画风**。
//
// 对照 PINNGOO 的 style preset 与 LibTV 的"统一画风"时补的：我们此前只有一个 `bible.style`
// 自由文本框，于是每次都要自己描述一遍画风，而且不同段落很容易写得不一样——
// 而画风一旦漂移，人物锁得再准也救不回来。
//
// 为什么放在前端而不是后端：这些是**纯文本常量**，填进 `bible.style` 之后就随提示词走了，
// 放后端只是多一次往返、多一处可能要改的地方。真正需要后端的是"按风格生成参考图"这类动作，
// 那走的是已有的参考图通路。
export interface StylePreset {
  id: string
  name: string
  visual: string
  tone: string
  tags: string[]
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'cinematic-real', name: '电影感写实', tags: ['写实', '通用'],
    visual: '电影感写实摄影，浅景深，自然光为主，肤色真实，胶片颗粒轻微，35mm 镜头质感',
    tone: '克制、留白，情绪藏在动作与停顿里，不靠旁白解释',
  },
  {
    id: 'three-d-movie', name: '3D 动画电影', tags: ['3D', '合家欢'],
    visual: '皮克斯风格 3D 动画电影质感，圆润造型，柔和全局光，材质细腻，色温暖',
    tone: '明快、有幽默感，冲突用夸张动作与表情表达',
  },
  {
    id: 'guoman-2d', name: '国漫二维', tags: ['二维', '国风'],
    visual: '国漫二维赛璐璐动画，线条利落，色彩饱和，背景有大面积留白与山水意趣',
    tone: '热血与义气并重，台词短促有力',
  },
  {
    id: 'wuxia-ink', name: '水墨武侠', tags: ['水墨', '国风'],
    visual: '水墨意境，墨色浓淡分层，人物以线描为主，背景写意留白，偶有飞白笔触',
    tone: '留白与暗示为主，动作写意，重意境轻图解',
  },
  {
    id: 'documentary', name: '纪录片手持', tags: ['写实', '纪实'],
    visual: '手持纪实摄影，现场光，构图不完美但真实，轻微呼吸感，无调色滤镜',
    tone: '平视、不煽情，让被拍的人自己说话',
  },
  {
    id: 'film-noir', name: '黑色电影', tags: ['黑白', '悬疑'],
    visual: '黑白高对比，硬光与大面积阴影，百叶窗条纹光，湿地面反光',
    tone: '冷硬、宿命感，对白简短、话里有话',
  },
  {
    id: 'cyberpunk', name: '赛博朋克', tags: ['科幻', '霓虹'],
    visual: '赛博朋克夜景，霓虹与湿地面反光，蓝紫与青色主调，体积光，高密度城市细节',
    tone: '疏离、焦虑，信息过载下的人情味',
  },
  {
    id: 'anime-jp', name: '日式动画', tags: ['二维', '青春'],
    visual: '日式电视动画质感，平涂色彩，干净的轮廓线，天空与云占比大，光斑与逆光',
    tone: '细腻、含蓄，情绪靠停顿与长镜表达',
  },
  {
    id: 'healing-daily', name: '治愈日常', tags: ['写实', '治愈'],
    visual: '低饱和暖调，柔和自然光，生活质感道具，浅景深，安静留白',
    tone: '温和、不说教，用小事推进',
  },
  {
    id: 'short-drama-hook', name: '短剧强钩子', tags: ['短剧', '竖屏'],
    visual: '竖屏构图，人物近景为主，光线清晰不晦涩，画面对比强，信息一眼可读',
    tone: '前 3 秒出冲突，每集结尾留钩子，台词直给不绕弯',
  },
]

export function stylePresetById(id: string): StylePreset | undefined {
  return STYLE_PRESETS.find(p => p.id === id)
}
