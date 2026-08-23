import { useState } from 'react'
import { FlaskConical, Factory, Puzzle, StickyNote, TrendingUp, Zap, X, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import useSWR from 'swr'
import { RefineApi, SkillsApi, PromptsApi, ImprovementsApi } from '../api'
import WorkshopView from '../components/WorkshopView'

// ── 应用中心（Phase 3）：经验沉淀台 / 技能库 / 提示词库 / 改进提案 ──

type Tab = 'refine' | 'workshop' | 'skills' | 'prompts' | 'improve'
const TABS: [Tab, LucideIcon, string][] = [
  ['refine', FlaskConical, '经验沉淀台'],
  ['workshop', Factory, '专项工作台'],
  ['skills', Puzzle, '技能库'],
  ['prompts', StickyNote, '提示词库'],
  ['improve', TrendingUp, '改进提案'],
]

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
        <button className="btn-primary text-xs px-3 py-1.5 ml-auto disabled:opacity-60" onClick={plan} disabled={!!busy}>
          {busy === 'plan' ? '分析中…（可能要 1-2 分钟）' : '从近期工作生成提案'}
        </button>
      </div>
      {msg && <div className="text-xs text-pi-accent px-1">{msg}</div>}
      {[['待审提案', pending] as const, ['已采纳', applied] as const, ['已拒绝', rejected] as const].map(([label, arr]) => arr.length > 0 && (
        <div key={label}>
          <h3 className="text-[13px] font-semibold text-pi-text mb-2">{label}（{arr.length}）</h3>
          <div className="space-y-2">
            {arr.map((p: any, i: number) => (
              <div key={p.id || i} className="panel !p-3">
                <div className="text-[13px] text-pi-text font-medium">{p.title || p.name || p.id}</div>
                {p.rationale && <div className="text-[11.5px] text-pi-dim2 mt-1 line-clamp-3">{p.rationale}</div>}
                {(p as any).status && <div className="text-[10px] text-pi-dim2 mt-1">状态：{(p as any).status}</div>}
                {label === '待审提案' && p.id && (
                  <div className="flex gap-2 mt-2">
                    <button className="btn-primary text-xs px-3 py-1 disabled:opacity-60" disabled={busy === p.id} onClick={() => act('approve', p.id)}>{busy === p.id ? '处理中…' : '采纳执行'}</button>
                    <button className="btn-tool text-xs" onClick={() => act('reject', p.id)}>拒绝</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {!pending.length && !applied.length && !rejected.length && (
        <div className="empty-state py-12 text-center">
          <FlaskConical className="w-9 h-9 mb-2 mx-auto opacity-40" strokeWidth={1.5} />
          <div className="text-sm text-pi-dim">暂无提案</div>
          <div className="text-[11px] text-pi-dim2 mt-1">点上方按钮，让小语分析近期工作日志、主动提出改进建议</div>
        </div>
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
      <input className="input-pi !py-1.5 text-xs w-64 mb-3" placeholder={`搜索 ${data?.skills?.length || 0} 个技能…`} value={kw} onChange={e => setKw(e.target.value)} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
        {skills.map(s => (
          <div key={s.name} className="panel !p-3" title={s.location}>
            <div className="font-mono text-[12.5px] text-pi-accent">{s.name}</div>
            <div className="text-[11.5px] text-pi-dim mt-1 line-clamp-3">{s.description}</div>
          </div>
        ))}
      </div>
      {!skills.length && (
        <div className="empty-state py-12 text-center">
          <Puzzle className="w-9 h-9 mb-2 mx-auto opacity-40" strokeWidth={1.5} />
          <div className="text-sm text-pi-dim">没有匹配的技能</div>
        </div>
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
            <span className="text-[13px] text-pi-text font-medium flex-1">{p.name}<span className="text-pi-dim2 font-normal ml-2 text-[11.5px]">{p.description}</span></span>
            <button className="btn-tool text-xs !px-2" title="复制内容" onClick={e => { e.stopPropagation(); copy(p) }}>{copied === p.name ? '✓ 已复制' : '复制'}</button>
            <span className="text-pi-dim2 text-[10px]">{open === p.name ? '▾' : '▸'}</span>
          </div>
          {open === p.name && <pre className="mt-2 pt-2 border-t border-pi-border-soft text-[11.5px] text-pi-dim whitespace-pre-wrap max-h-64 overflow-auto font-mono">{p.content}</pre>}
        </div>
      ))}
      {!prompts.length && (
        <div className="empty-state py-12 text-center">
          <StickyNote className="w-9 h-9 mb-2 mx-auto opacity-40" strokeWidth={1.5} />
          <div className="text-sm text-pi-dim">提示词库为空</div>
          <div className="text-[11px] text-pi-dim2 mt-1">在 ~/.pi/agent/prompts/ 放入 .md 文件即可</div>
        </div>
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
      <button className="btn-primary text-xs px-3 py-1.5 disabled:opacity-60" onClick={analyze} disabled={busy}>
        {busy ? '分析中…' : '分析运行数据找改进点'}
      </button>
      {items.map((it: any, i: number) => (
        <div key={it.id || i} className="panel !p-3">
          <div className="text-[13px] text-pi-text font-medium">{it.title || it.summary || it.id}</div>
          {it.detail && <div className="text-[11.5px] text-pi-dim2 mt-1 line-clamp-4">{it.detail}</div>}
          <button className="btn-tool text-xs mt-2" onClick={() => it.id && dismiss(it.id)}>忽略</button>
        </div>
      ))}
      {!items.length && (
        <div className="empty-state py-12 text-center">
          <TrendingUp className="w-9 h-9 mb-2 mx-auto opacity-40" strokeWidth={1.5} />
          <div className="text-sm text-pi-dim">当前没有待处理的改进提案</div>
          <div className="text-[11px] text-pi-dim2 mt-1">点上方按钮分析 provider 用量与错误率</div>
        </div>
      )}
    </div>
  )
}

export default function Apps() {
  const [tab, setTab] = useState<Tab>('refine')
  return (
    <div className="flex-1 overflow-y-auto relative z-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <div className="mb-5">
          <div className="page-eyebrow mb-1">Apps</div>
          <h1 className="page-title">应用中心</h1>
          <p className="text-xs text-pi-dim2 mt-1.5">经验沉淀 · 专项生成 · 技能与提示词资产 · 自我改进</p>
        </div>
        {/* 分段控件式 Tab */}
        <div className="inline-flex p-1 rounded-pi-lg bg-pi-bg2/70 border border-pi-border-soft mb-5 max-w-full overflow-x-auto">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`text-xs px-3 py-1.5 rounded-pi-md whitespace-nowrap inline-flex items-center gap-1.5 transition-all duration-150 ${tab === k ? 'bg-pi-accent text-white font-medium shadow-md shadow-pi-accent/25' : 'text-pi-dim hover:text-pi-text'}`}>
              <Icon className="w-3.5 h-3.5" strokeWidth={1.8} /> {label}
            </button>
          ))}
        </div>
        <div key={tab} className="page-enter">
          {tab === 'refine' && <RefineView />}
          {tab === 'workshop' && <WorkshopView />}
          {tab === 'skills' && <SkillsView />}
          {tab === 'prompts' && <PromptsView />}
          {tab === 'improve' && <ImproveView />}
        </div>
      </div>
    </div>
  )
}
