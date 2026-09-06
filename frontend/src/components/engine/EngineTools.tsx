import { useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { EngineApi } from '../../api'

export default function EngineTools({ data, error }: { data?: Awaited<ReturnType<typeof EngineApi.tools>>; error?: unknown }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const tools = data?.tools || []
  const term = query.trim().toLowerCase()
  const filtered = tools.filter(t => `${t.name} ${t.description}`.toLowerCase().includes(term))
  return <section className="border-t border-pi-border-soft py-5" aria-labelledby="engine-tools-title">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <h2 id="engine-tools-title" className="text-sm font-semibold text-pi-text">工具注册表 <span className="text-pi-dim font-normal">{data ? `${tools.length} 个已注册` : ''}</span></h2>
      <label className="relative w-full sm:w-64"><Search className="absolute left-3 top-3.5 w-4 h-4 text-pi-dim pointer-events-none" />
        <input type="search" aria-label="搜索工具" className="input-pi !pl-9 min-h-11" placeholder="搜索工具" value={query} onChange={e => setQuery(e.target.value)} />
      </label>
    </div>
    {error ? <p role="alert" className="text-sm text-pi-danger mb-3">工具列表暂不可用{data ? '，以下为上次数据' : '，请刷新重试'}。</p> : !data ? <p role="status" className="text-sm text-pi-dim">正在加载工具...</p> : null}
    {data && <p className="text-sm text-pi-dim mb-2">宿主工具表{data.dsh ? ' · dsh_task 已注入' : ''}{data.skill ? ' · 技能激活已注入' : ''}</p>}
    <div className="divide-y divide-pi-border-soft">
      {filtered.map(t => <div key={t.name}>
        <button type="button" className="min-h-11 w-full flex items-center gap-2 py-2 text-left text-sm text-pi-text hover:bg-pi-bg-hover" aria-expanded={!!open[t.name]} onClick={() => setOpen(value => ({ ...value, [t.name]: !value[t.name] }))}>
          <span className="font-mono break-all min-w-0">{t.name}</span><ChevronDown className={`ml-auto w-4 h-4 shrink-0 ${open[t.name] ? 'rotate-180' : ''}`} />
        </button>
        {open[t.name] && <p className="pb-3 text-sm text-pi-dim leading-relaxed break-words">{t.description || '暂无描述'}</p>}
      </div>)}
    </div>
    {data && !filtered.length && <p role="status" className="text-sm text-pi-dim py-4">{tools.length ? '没有匹配的工具' : '尚未注册工具'}</p>}
  </section>
}
