import { useState } from 'react'
import { ImagePlus, Presentation, BookOpen, Camera } from 'lucide-react'
import GeneratePanel from '../components/GeneratePanel'
import WorkshopView from '../components/WorkshopView'
import NovelStudioView from '../components/NovelStudioView'
import WanXiang from '../components/WanXiang'

// ── 专项工作台（08-26 从应用中心提升为主功能路由）：AI 绘画 / PPT / 小说工坊 / 万像出图 ──

type Tab = 'image' | 'ppt' | 'novel' | 'wanxiang'
const TABS: [Tab, typeof ImagePlus, string][] = [
  ['image', ImagePlus, 'AI 绘画'],
  ['ppt', Presentation, 'PPT 生成'],
  ['novel', BookOpen, '小说工坊'],
  ['wanxiang', Camera, '万像出图'],
]
const TAB_DESC: Record<Tab, string> = {
  image: '选模型出图，成品自动归档到资产库',
  ppt: '走 ppt-generator 技能全流程，通常需要几分钟',
  novel: '书架式创作：作品沉淀 · 真相文件一致性 · 章节递进',
  wanxiang: '人物写真提示词工作台：场景模板 · 五要素 · 赌图 · 多平台适配（即梦/MJ/SD）',
}

export default function Workshop() {
  const [tab, setTab] = useState<Tab>('image')

  return (
    <div className="flex-1 min-h-0 overflow-y-auto page-enter">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5">
          <div className="page-eyebrow mb-1">Workshop</div>
          <h1 className="page-title">专项工作台</h1>
          <p className="text-xs text-pi-dim2 mt-1.5">{TAB_DESC[tab]}</p>
        </div>

        {/* 分段控件 */}
        <div className="flex items-center gap-1 mb-5 p-1 rounded-pi-lg bg-pi-bg2/60 border border-pi-border-soft w-fit">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-pi-md transition-colors duration-fast ${
                tab === k ? 'bg-pi-accent text-white font-medium' : 'text-pi-dim hover:text-pi-text'}`}>
              <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />{label}
            </button>
          ))}
        </div>

        {tab === 'image' && <div className="max-w-3xl"><GeneratePanel onGenerated={() => {}} /></div>}
        {tab === 'ppt' && <WorkshopView key="ppt" kind="ppt" />}
        {tab === 'novel' && <NovelStudioView />}
        {tab === 'wanxiang' && <div className="max-w-3xl"><WanXiang /></div>}
      </div>
    </div>
  )
}
