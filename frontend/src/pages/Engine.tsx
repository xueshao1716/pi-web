import { useRef, useState } from 'react'
import { CheckCircle2, LoaderCircle, RefreshCw } from 'lucide-react'
import useSWR from 'swr'
import { EngineApi, RunApi } from '../api'
import { useApp } from '../store'
import TerminalPanel from '../components/TerminalPanel'
import PageHeader from '../components/PageHeader'
import EnginePairPanel from '../components/engine/EnginePairPanel'
import EngineTools from '../components/engine/EngineTools'
import EngineGatewayPanels from '../components/engine/EngineGatewayPanels'
import EngineRunDiagnostics from '../components/engine/EngineRunDiagnostics'

export default function Engine() {
  const { currentModel, selectSession } = useApp()
  const { data: status, error: statusError, mutate: mutateStatus, isValidating } = useSWR('engine-status', () => EngineApi.status(), { refreshInterval: 60000 })
  const { data: toolsData, error: toolsError, mutate: mutateTools } = useSWR('engine-tools', () => EngineApi.tools(), { refreshInterval: 60000 })
  const { data: pair, error: pairError, mutate: mutatePair } = useSWR('engine-pair', () => EngineApi.pair(), { refreshInterval: 60000 })
  const { data: runData, error: runError, mutate: mutateRuns } = useSWR('engine-run-overview', () => RunApi.overview(), { refreshInterval: 10000 })
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)
  const [refreshError, setRefreshError] = useState('')
  const [refreshFailed, setRefreshFailed] = useState<Record<string, boolean>>({})
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalMounted, setTerminalMounted] = useState(false)
  const trackRefresh = async (key: string, request: () => Promise<unknown>) => {
    try {
      const result = await request()
      setRefreshFailed(previous => ({ ...previous, [key]: false }))
      return result
    } catch (error) {
      setRefreshFailed(previous => ({ ...previous, [key]: true }))
      throw error
    }
  }
  const reloadStatus = () => trackRefresh('status', () => mutateStatus(EngineApi.status(), { revalidate: false }))
  const reloadPair = () => trackRefresh('pair', () => mutatePair(EngineApi.pair(), { revalidate: false }))
  const probe = async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true; setRefreshing(true); setRefreshError('')
    try {
      const results = await Promise.allSettled([
        reloadStatus(), reloadPair(),
        trackRefresh('tools', () => mutateTools(EngineApi.tools(), { revalidate: false })),
        trackRefresh('runs', () => mutateRuns(RunApi.overview(), { revalidate: false })),
      ])
      if (results.some(result => result.status === 'rejected')) setRefreshError('部分状态刷新失败，已保留上次数据。')
    } finally { refreshingRef.current = false; setRefreshing(false) }
  }
  const openSession = (id: string) => { selectSession(id); location.hash = '#/chat' }
  const label = (id?: string) => pair?.catalog.find(item => item.id === id)?.label || id || '加载中'
  const observation = runError || refreshFailed.runs ? <span className="text-sm text-pi-danger">观测暂不可用</span>
    : !runData ? <span role="status" className="text-sm text-pi-dim">加载中</span>
    : <span className="inline-flex items-center gap-2 text-sm text-pi-text">{runData.active.length ? <LoaderCircle className="w-4 h-4 text-pi-accent animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-pi-success" />}{runData.active.length ? `${runData.active.length} 个任务运行中` : '当前无活动任务'}</span>

  return <div className="flex-1 overflow-y-auto relative z-10 bg-pi-bg">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
      <PageHeader title="引擎控制台" description="主聊天引擎 / 运行诊断 / Gateway 旁路" meta={observation} actions={
        <button type="button" className="btn-ghost min-h-11" disabled={refreshing} onClick={() => void probe()}><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />刷新状态</button>
      } />
      {refreshError && <p role="alert" className="text-sm text-pi-danger mb-3">{refreshError}</p>}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 text-sm">
        <div className="min-w-0"><dt className="text-pi-dim">配置主驾</dt><dd className="text-pi-text font-medium mt-1 break-all">{pairError || refreshFailed.pair ? '暂不可用' : label(pair?.primary)}</dd></div>
        <div className="min-w-0"><dt className="text-pi-dim">配置次席</dt><dd className="text-pi-text font-medium mt-1 break-all">{pairError || refreshFailed.pair ? '暂不可用' : label(pair?.secondary)}</dd></div>
        <div className="min-w-0"><dt className="text-pi-dim">当前模型选择</dt><dd className="text-pi-text mt-1 break-all">{currentModel === 'auto/auto' ? '自动路由' : currentModel}</dd></div>
        <div className="min-w-0"><dt className="text-pi-dim">旁路插件</dt><dd className="text-pi-text mt-1">{statusError || refreshFailed.status ? '暂不可用' : status ? `${(status.plugins || []).filter((p: any) => p.mounted).length} / ${(status.plugins || []).length} 已挂载` : '加载中'}</dd></div>
      </dl>
      <EngineRunDiagnostics data={runData} error={runError || refreshFailed.runs} onOpenSession={openSession} />
      <EnginePairPanel data={pair} error={pairError || refreshFailed.pair} onReload={reloadPair} />
      <EngineTools data={toolsData} error={toolsError || refreshFailed.tools} />
      <EngineGatewayPanels data={status} error={statusError || refreshFailed.status} onReload={reloadStatus} onProbe={probe} probing={refreshing || isValidating} />
      <section className="border-t border-pi-border-soft py-5">
        <button type="button" className="btn-ghost min-h-11" aria-expanded={terminalOpen} onClick={() => { setTerminalMounted(true); setTerminalOpen(value => !value) }}>{terminalOpen ? '收起代码模式' : '打开代码模式'}</button>
        {terminalMounted && <div className={terminalOpen ? 'flex h-[520px] max-h-[65vh] mt-3 flex-col border border-pi-border-soft rounded-pi-md overflow-hidden' : 'hidden'}><TerminalPanel /></div>}
      </section>
    </div>
  </div>
}
