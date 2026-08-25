import { useMemo, useState } from 'react'
import { Wrench, Package, ChevronRight } from 'lucide-react'
import Message from './Message'
import type { ChatMessage } from '../types'

// ── 轮次折叠（turnDisclosure，对齐 NomiFun 交互）──
// 一轮 = 一条用户消息 + 其后所有 assistant/system 消息；
// 默认只展开最后一轮，历史轮折叠成一行摘要（问题节选 + 工具/产物统计），点击展开。
interface Turn {
  key: string
  user?: ChatMessage
  rest: ChatMessage[]
}

export function groupTurns(messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = []
  for (const m of messages) {
    if (m.role === 'user' || turns.length === 0) {
      turns.push({ key: m.id || 't' + turns.length, user: m.role === 'user' ? m : undefined, rest: m.role === 'user' ? [] : [m] })
    } else {
      turns[turns.length - 1].rest.push(m)
    }
  }
  return turns
}

// 摘要统计：工具调用数 / 产物（文件+图片+音频）数
function turnStats(turn: Turn) {
  let tools = 0, artifacts = 0
  for (const m of turn.rest) {
    tools += m.tools?.length || 0
    artifacts += (m.files?.length || 0) + (m.images?.length || 0) + (m.audios?.length || 0)
  }
  return { tools, artifacts }
}

const excerpt = (s: string, n = 64) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

function TurnRow({ turn, index, open, onToggle }: { turn: Turn; index: number; open: boolean; onToggle: () => void }) {
  const { tools, artifacts } = turnStats(turn)
  const q = turn.user ? excerpt(turn.user.text || '(附件消息)') : '(系统提示)'
  const answer = turn.rest.find(m => m.role === 'assistant')
  const aExcerpt = answer?.text ? excerpt(answer.text, 80) : ''
  // 轮次状态：有错误→红 / 有回复→绿 / 无回复（被打断）→灰
  const hasError = turn.rest.some(m => m.tools?.some(t => t.isError))
  const status = hasError ? { c: 'bg-pi-red', t: '有工具报错' } : answer ? { c: 'bg-emerald-400', t: '已完成' } : { c: 'bg-pi-dim2', t: '无回复' }
  return (
    <div className="my-1.5">
      <button onClick={onToggle}
        className="press w-full flex items-center gap-2 px-3 py-2.5 rounded-pi-lg border border-pi-border-soft bg-pi-bg2/40 hover:bg-pi-bg-hover/60 hover:border-pi-border transition-colors text-left group/turn">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ring-2 ${status.c} ${hasError ? "ring-pi-red/20" : answer ? "ring-emerald-500/15" : "ring-white/5"}`} title={status.t} />
        <span className="text-[10px] font-mono text-pi-dim2 w-7 flex-shrink-0">#{index + 1}</span>
        <span className="text-[13px] text-pi-dim truncate flex-1 min-w-0">
          <span className="text-pi-text/85">{q}</span>
          {aExcerpt && <span className="text-pi-dim"> <span className="text-pi-accent2/60">→</span> {aExcerpt}</span>}
        </span>
        <span className="flex items-center gap-1.5 flex-shrink-0 text-[10px] text-pi-dim2">
          {tools > 0 && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-pi-pill bg-white/[0.04]" title={`${tools} 次工具调用`}><Wrench className="w-3 h-3" />{tools}</span>}
          {artifacts > 0 && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-pi-pill bg-white/[0.04]" title={`${artifacts} 个产物`}><Package className="w-3 h-3" />{artifacts}</span>}
          {turn.user?.ts && <span className="hidden sm:inline">{new Date(turn.user.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>}
          <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="pl-2 border-l border-pi-border-soft ml-4">
          {turn.user && <Message msg={turn.user} />}
          {turn.rest.map(m => <Message key={m.id} msg={m} />)}
        </div>
      )}
    </div>
  )
}

interface TurnListProps {
  messages: ChatMessage[]
  // 流式中的实时消息（始终展开，属于最后一轮）
  streamingNode?: React.ReactNode
  // 默认展开最近几轮（其余折叠）
  keepExpanded?: number
}

export default function TurnList({ messages, streamingNode, keepExpanded = 1 }: TurnListProps) {
  const turns = useMemo(() => groupTurns(messages), [messages])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)

  // 折叠规则：showAll → 全开；否则最后 keepExpanded 轮 + 手动展开的
  const lastKeys = new Set(turns.slice(-keepExpanded).map(t => t.key))
  const isOpen = (t: Turn, i: number) => showAll || lastKeys.has(t.key) || expanded.has(t.key)
  const collapsedCount = turns.filter(t => !lastKeys.has(t.key) && !expanded.has(t.key)).length

  return (
    <div>
      {!showAll && collapsedCount > 0 && (
        <button className="mx-auto mb-2 block text-[11px] text-pi-dim2 hover:text-pi-accent transition-colors"
          onClick={() => setShowAll(true)}>
          ▤ 展开全部 {turns.length} 轮对话
        </button>
      )}
      {showAll && turns.length > keepExpanded && (
        <button className="mx-auto mb-2 block text-[11px] text-pi-dim2 hover:text-pi-accent transition-colors"
          onClick={() => { setShowAll(false); setExpanded(new Set()) }}>
          ▤ 收起历史轮次
        </button>
      )}
      {turns.map((t, i) => (
        <TurnRow key={t.key} turn={t} index={i} open={isOpen(t, i)}
          onToggle={() => setExpanded(prev => {
            const next = new Set(prev)
            if (lastKeys.has(t.key)) return next // 最后一轮默认展开，不折叠
            next.has(t.key) ? next.delete(t.key) : next.add(t.key)
            return next
          })} />
      ))}
      {streamingNode}
    </div>
  )
}
