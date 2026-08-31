import { useState } from 'react'
import { FlaskConical, Puzzle, StickyNote, TrendingUp, Sprout, Check, ChevronDown, ChevronRight } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import SectionHeader from '../components/SectionHeader'
import type { LucideIcon } from 'lucide-react'
import useSWR from 'swr'
import { RefineApi, SkillsApi, PromptsApi, ImprovementsApi } from '../api'
import GardenerView from '../components/GardenerView'

// ── 应用中心（Phase 3）：经验沉淀台 / 技能库 / 提示词库 / 改进提案 ──

type Tab = 'refine' | 'skills' | 'prompts' | 'improve' | 'gardener'
type Tool = { key: Tab; icon: LucideIcon; label: string; description: string }

const TOOL_GROUPS: { label: string; tools: Tool[] }[] = [
  {
    label: '知识资产',
    tools: [
      { key: 'refine', icon: FlaskConical, label: '经验沉淀台', description: '从近期工作中提炼、审核并应用可复用经验。' },
      { key: 'skills', icon: Puzzle, label: '技能库', description: '检索工作台已经收录的技能与能力说明。' },
      { key: 'prompts', icon: StickyNote, label: '提示词库', description: '浏览、展开并复制可复用的提示词资产。' },
    ],
  },
  {
    label: '系统改进',
    tools: [
      { key: 'improve', icon: TrendingUp, label: '改进提案', description: '分析运行数据，整理仍需处理的系统改进点。' },
      { key: 'gardener', icon: Sprout, label: '记忆园丁', description: '查看记忆健康状态，处理重复、冲突与待整理内容。' },
    ],
  },
]
const TOOLS = TOOL_GROUPS.flatMap(group => group.tools)

function RefineView() {
  const { data: list, mutate } = useSWR('refine-list', () => RefineApi.list(), { refreshInterval: 60000 })
  const { data: status } = useSWR('refine-status', () => RefineApi.status(), { refreshInterval: 60000 })
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const pending = list?.pending || []
  const applied = list?.applied || []
  const rejected = list?.rejected || []

  const plan = async () => {
    setBusy('plan'); setMsg('')
    try {
      await RefineApi.plan()
      setMsg('已从近期工作日志生成改进提案，列表已刷新')
      await mutate()
    } catch (e: any) { setMsg('生成失败：' + (e?.message || e)) } finally { setBusy('') }
  }
  const act = async (kind: 'approve' | 'reject', id: string) => {
    setBusy(id)
    try { await RefineApi[kind](id); await mutate() } catch {} finally { setBusy('') }
  }

  return (
    <div className="space-y-4">
      <div className="panel !p-3.5 flex items-center gap-3 flex-wrap">
        <span className="text-[12px] text-pi-dim">待审 <b className="text-pi-text">{pending.length}</b> · 已采纳 <b className="text-pi-text">{applied.length}</b> · 已拒绝 <b className="text-pi-text">{rejected.length}</b></span>
        <button className="btn-primary text-[13px] px-3 py-1.5 ml-auto disabled:opacity-60" onClick={plan} disabled={!!busy}>
          {busy === 'plan' ? '分析中…（可能要 1-2 分钟）' : '从近期工作生成提案'}
        </button>
      </div>
      {msg && <div className="text-[12px] text-pi-accent px-1">{msg}</div>}
      {[['待审提案', pending] as const, ['已采纳', applied] as const, ['已拒绝', rejected] as const].map(([label, arr]) => arr.length > 0 && (
        <div key={label}>
          <h3 className="text-[13px] font-semibold text-pi-text mb-2">{label}（{arr.length}）</h3>
          <div className="space-y-2">
            {arr.map((p: any, i: number) => (
              <div key={p.id || i} className="panel !p-3">
                <div className="text-[13px] text-pi-text font-medium">{p.title || p.name || p.id}</div>
                {p.rationale && <div className="text-[12px] text-pi-dim2 mt-1 line-clamp-3">{p.rationale}</div>}
                {(p as any).status && <div className="text-[11px] text-pi-dim2 mt-1">状态：{(p as any).status}</div>}
                {label === '待审提案' && p.id && (
                  <div className="flex gap-2 mt-2">
                    <button className="btn-primary text-[13px] px-3 py-1 disabled:opacity-60" disabled={busy === p.id} onClick={() => act('approve', p.id)}>{busy === p.id ? '处理中…' : '采纳执行'}</button>
                    <button className="btn-tool text-[13px]" onClick={() => act('reject', p.id)}>拒绝</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {!pending.length && !applied.length && !rejected.length && (
        <EmptyState icon={FlaskConical} title="暂无提案" hint="点上方按钮，让小语分析近期工作日志、主动提出改进建议" />
      )}
    </div>
  )
}

function SkillsView() {
  const [kw, setKw] = useState('')
  const { data } = useSWR('skills', () => SkillsApi.list())
  const skills = (data?.skills || []).filter(s => !kw.trim() || (s.name + s.description).toLowerCase().includes(kw.toLowerCase()))
  return (
    <div>
      <input className="input-pi !py-1.5 text-[13px] w-full sm:w-64 mb-3" placeholder={`搜索 ${data?.skills?.length || 0} 个技能…`} value={kw} onChange={e => setKw(e.target.value)} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
        {skills.map(s => (
          <div key={s.name} className="panel !p-3" title={s.location}>
            <div className="font-mono text-[13px] text-pi-accent">{s.name}</div>
            <div className="text-[12px] text-pi-dim mt-1 line-clamp-3">{s.description}</div>
          </div>
        ))}
      </div>
      {!skills.length && (
        <EmptyState icon={Puzzle} title="没有匹配的技能" />
      )}
    </div>
  )
}

function PromptsView() {
  const { data } = useSWR('prompts', () => PromptsApi.list())
  const [open, setOpen] = useState<string | null>(null)
  const [copied, setCopied] = useState('')
  const prompts = data?.prompts || []
  const copy = async (p: any) => {
    try { await navigator.clipboard.writeText(p.content); setCopied(p.name); setTimeout(() => setCopied(''), 1500) } catch {}
  }
  return (
    <div className="space-y-2">
      {prompts.map(p => (
        <div key={p.name} className="panel !p-3">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setOpen(open === p.name ? null : p.name)}>
            <span className="text-[13px] text-pi-text font-medium flex-1">{p.name}<span className="text-pi-dim2 font-normal ml-2 text-[12px]">{p.description}</span></span>
            <button className="btn-tool text-[13px] !px-2 inline-flex items-center gap-1" title="复制内容" onClick={e => { e.stopPropagation(); copy(p) }}>{copied === p.name && <Check className="w-3.5 h-3.5" aria-hidden="true" />}{copied === p.name ? '已复制' : '复制'}</button>
            {open === p.name ? <ChevronDown className="w-3.5 h-3.5 text-pi-dim2" aria-hidden="true" /> : <ChevronRight className="w-3.5 h-3.5 text-pi-dim2" aria-hidden="true" />}
          </div>
          {open === p.name && <pre className="mt-2 pt-2 border-t border-pi-border-soft text-[12px] text-pi-dim whitespace-pre-wrap max-h-64 overflow-auto font-mono">{p.content}</pre>}
        </div>
      ))}
      {!prompts.length && (
        <EmptyState icon={StickyNote} title="提示词库为空" hint="在 ~/.pi/agent/prompts/ 放入 .md 文件即可" />
      )}
    </div>
  )
}

function ImproveView() {
  const { data, mutate } = useSWR('improvements', () => ImprovementsApi.list())
  const [busy, setBusy] = useState(false)
  const items = data?.improvements || []
  const analyze = async () => {
    setBusy(true)
    try { await ImprovementsApi.analyze(); await mutate() } catch {} finally { setBusy(false) }
  }
  const dismiss = async (id: string) => { try { await ImprovementsApi.setStatus(id, 'dismissed'); await mutate() } catch {} }
  return (
    <div className="space-y-3">
      <button className="btn-primary text-[13px] px-3 py-1.5 disabled:opacity-60" onClick={analyze} disabled={busy}>
        {busy ? '分析中…' : '分析运行数据找改进点'}
      </button>
      {items.map((it: any, i: number) => (
        <div key={it.id || i} className="panel !p-3">
          <div className="text-[13px] text-pi-text font-medium">{it.title || it.summary || it.id}</div>
          {it.detail && <div className="text-[12px] text-pi-dim2 mt-1 line-clamp-4">{it.detail}</div>}
          <button className="btn-tool text-[13px] mt-2" onClick={() => it.id && dismiss(it.id)}>忽略</button>
        </div>
      ))}
      {!items.length && (
        <EmptyState icon={TrendingUp} title="当前没有待处理的改进提案" hint="点上方按钮分析 provider 用量与错误率" />
      )}
    </div>
  )
}

export default function Apps() {
  const [tab, setTab] = useState<Tab>('refine')
  const currentTool = TOOLS.find(tool => tool.key === tab) || TOOLS[0]

  return (
    <div className="flex-1 overflow-y-auto relative z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <PageHeader
          title="应用中心"
          description="在知识资产与系统改进工具之间切换，让每类工作保留自己的操作语境。"
        />

        <select
          aria-label="选择应用工具"
          className="input-pi !py-2 text-[13px] w-full md:hidden mb-5"
          value={tab}
          onChange={event => setTab(event.target.value as Tab)}
        >
          {TOOL_GROUPS.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.tools.map(tool => <option key={tool.key} value={tool.key}>{tool.label}</option>)}
            </optgroup>
          ))}
        </select>

        <div className="md:grid md:grid-cols-[190px_minmax(0,1fr)] md:gap-6 items-start">
          <aside className="hidden md:block sticky top-6">
            <nav aria-label="应用工具导航" className="space-y-5">
              {TOOL_GROUPS.map(group => (
                <div key={group.label}>
                  <div className="px-2 mb-1.5 text-[11px] font-medium text-pi-dim2">{group.label}</div>
                  <div className="space-y-1">
                    {group.tools.map(tool => {
                      const Icon = tool.icon
                      return (
                        <button
                          key={tool.key}
                          type="button"
                          aria-current={tab === tool.key ? 'page' : undefined}
                          onClick={() => setTab(tool.key)}
                          className={`w-full min-h-10 px-2.5 py-2 rounded-pi-md inline-flex items-center gap-2 text-left text-[13px] transition-colors ${tab === tool.key ? 'nav-active font-medium' : 'text-pi-dim hover:text-pi-text hover:bg-pi-bg-hover'}`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
                          <span>{tool.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </aside>

          <main className="min-w-0">
            <SectionHeader title={currentTool.label} description={currentTool.description} icon={currentTool.icon} />
            <div key={tab} className="page-enter">
              {tab === 'refine' && <RefineView />}
              {tab === 'skills' && <SkillsView />}
              {tab === 'prompts' && <PromptsView />}
              {tab === 'improve' && <ImproveView />}
              {tab === 'gardener' && <GardenerView />}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
