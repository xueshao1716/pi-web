import { useState } from 'react'
import { ImagePlus, Presentation, BookOpen } from 'lucide-react'
import GeneratePanel from '../components/GeneratePanel'
import WorkshopView from '../components/WorkshopView'

// ── 专项工作台（08-26 从应用中心提升为主功能路由）：AI 绘画 / PPT·小说生成 ──

type Tab = 'image' | 'longform'
const TABS: [Tab, typeof ImagePlus, string][] = [
  ['image', ImagePlus, 'AI 绘画'],
  ['longform', BookOpen, 'PPT · 小说生成'],
]
const TAB_DESC: Record<Tab, string> = {
  image: '选模型出图，成品自动归档到资产库',
  longform: 'SSE 长任务流式生成，成品可直接下载',
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
          <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-pi-dim2">
            <Presentation className="w-3.5 h-3.5" />生成物自动入库资产库
          </span>
        </div>

        {tab === 'image' ? (
          <div className="max-w-3xl"><GeneratePanel onGenerated={() => {}} /></div>
        ) : (
          <WorkshopView />
        )}
      </div>
    </div>
  )
}
