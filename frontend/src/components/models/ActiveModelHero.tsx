import { Route, Zap } from 'lucide-react'
import type { Model } from '../../types'

export type ActiveModelHeroProps = {
  currentModel: string
  model?: Model
}

export default function ActiveModelHero({ currentModel, model }: ActiveModelHeroProps) {
  const isAuto = currentModel === 'auto/auto'
  const free = model?.free || (model?.note || '').includes('免费')

  return (
    <section className="panel !p-4 sm:!p-5 mb-4" aria-labelledby="active-model-title">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)] sm:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] text-pi-dim">
            <span className={`w-8 h-8 rounded-pi-md flex items-center justify-center ${isAuto ? 'bg-pi-accent/15 text-pi-accent' : 'bg-pi-default text-pi-dim'}`}>
              {isAuto ? <Zap className="w-4 h-4" /> : <Route className="w-4 h-4" />}
            </span>
            当前模型
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h2 id="active-model-title" className="text-[17px] font-semibold text-pi-text truncate">
              {isAuto ? 'Auto 智能路由' : model?.name || currentModel}
            </h2>
            {free && <span className="text-[10px] px-1.5 py-0.5 rounded-pi-pill border border-pi-success/30 bg-pi-success/10 text-pi-success">免费</span>}
          </div>
          <p className="mt-1 text-[12px] text-pi-dim2 font-mono truncate">
            {isAuto ? 'auto/auto · 按任务动态选择通道' : `${model?.provider || currentModel.split('/')[0]}/${model?.id || currentModel.split('/').slice(1).join('/')}`}
          </p>
        </div>

        <div className="rounded-pi-lg border border-pi-accent/20 bg-pi-accent/8 px-3.5 py-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-pi-text">
            <Zap className="w-4 h-4 text-pi-accent flex-shrink-0" />
            Auto 如何工作
          </div>
          <p className="mt-1.5 text-[12px] leading-5 text-pi-dim">
            简单任务优先免费 flash，复杂任务升级 pro 并限制 token；遇到 429 或故障自动探测降级。手动选择具体模型后则固定使用该模型。
          </p>
        </div>
      </div>
    </section>
  )
}
