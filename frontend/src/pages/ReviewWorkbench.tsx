import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Check, CheckCircle2, CircleAlert, FileCode2, GitCompare, RefreshCw } from 'lucide-react'
import { GitReviewApi, type GitReviewFile } from '../api'
import PageHeader from '../components/PageHeader'

const emptyFiles: GitReviewFile[] = []

function statusLabel(status: GitReviewFile['status']) {
  return status === 'untracked' ? '未跟踪' : status === 'added' ? '新增' : status === 'deleted' ? '删除' : status === 'renamed' ? '重命名' : '修改'
}

function diffLineClass(line: string) {
  if (line.startsWith('+++') || line.startsWith('---')) return 'review-diff-line review-diff-file'
  if (line.startsWith('+')) return 'review-diff-line review-diff-add'
  if (line.startsWith('-')) return 'review-diff-line review-diff-remove'
  if (line.startsWith('@@')) return 'review-diff-line review-diff-hunk'
  return 'review-diff-line'
}

function diffForFile(diff: string, filePath?: string) {
  if (!diff || !filePath) return ''
  const sections = diff.split(/(?=^diff --git )/m)
  return sections.find(section => section.includes(` a/${filePath}`) || section.includes(` b/${filePath}`)) || ''
}

export default function ReviewWorkbench() {
  const { data: review, error, isLoading, mutate } = useSWR('git-review', () => GitReviewApi.review(), { refreshInterval: 30000, revalidateOnFocus: true })
  const [selectedPath, setSelectedPath] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const files = review?.files || emptyFiles
  const verification = review?.verification || { state: 'unknown', checks: [] }
  const selected = files.find(file => file.path === selectedPath) || files[0]
  const summary = useMemo(() => {
    const additions = files.reduce((sum, file) => sum + (file.additions || 0), 0)
    const deletions = files.reduce((sum, file) => sum + (file.deletions || 0), 0)
    return { additions, deletions }
  }, [files])

  useEffect(() => {
    if (!selectedPath && files[0]) setSelectedPath(files[0].path)
    if (selectedPath && !files.some(file => file.path === selectedPath)) setSelectedPath(files[0]?.path || '')
  }, [files, selectedPath])

  const diff = review?.diff || ''
  const selectedDiff = diffForFile(diff, selected?.path) || (files.length === 1 ? diff : '')
  const diffLines = selectedDiff ? selectedDiff.split(/\r?\n/) : []

  return <div className="flex-1 overflow-y-auto relative z-10 bg-pi-bg">
    <div className="review-workbench max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-7">
      <PageHeader
        title="改动与验收"
        description="先看清改了什么，再决定是否交付。这里的检查状态只在真实执行后才会变为通过。"
        meta={<span className="review-meta"><GitCompare className="w-3.5 h-3.5" />{review?.branch ? `分支 ${review.branch}` : isLoading ? '正在读取仓库…' : '尚未连接仓库'}</span>}
        actions={<button type="button" className="btn-ghost min-h-11 inline-flex items-center gap-2" onClick={() => void mutate()} disabled={isLoading}><RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />刷新改动</button>}
      />

      {error && <div className="review-alert" role="alert"><CircleAlert className="w-4 h-4" />读取 Git 改动失败，请稍后重试。</div>}
      {isLoading && <div className="review-loading" role="status">正在整理文件改动…</div>}
      {!isLoading && !error && review?.error && <div className="review-alert" role="alert"><CircleAlert className="w-4 h-4" />仓库改动太多，暂时无法完整读取；请先缩小未跟踪目录或刷新。</div>}
      {!isLoading && !error && review && !review.isRepo && <div className="review-empty"><GitCompare className="w-7 h-7" /><h2>这里还不是 Git 仓库</h2><p>把项目放进 Git 仓库后，元枢会在这里列出文件级改动和验收状态。</p></div>}

      {!isLoading && !error && review?.isRepo && !review.error && <>
        <section className="review-summary" aria-label="改动摘要">
          <div><span className="review-summary-label">文件</span><strong>{files.length}</strong></div>
          <div><span className="review-summary-label">新增行</span><strong className="text-pi-success">+{summary.additions}</strong></div>
          <div><span className="review-summary-label">删除行</span><strong className="text-pi-danger">-{summary.deletions}</strong></div>
          <div className="review-summary-verification"><span className="review-summary-label">验收</span><span className={`review-verification review-verification-${verification.state}`}><span className="review-status-dot" />{verification.state === 'passed' ? '已通过' : verification.state === 'failed' ? '有问题' : verification.state === 'running' ? '进行中' : '尚未执行'}</span></div>
        </section>

        <div className="review-workbench-grid">
          <section className="review-file-panel" aria-label="改动文件">
            <div className="review-section-head"><span>改动文件</span><span className="text-pi-dim2">{files.length} 个</span></div>
            {files.length === 0 && <p className="review-panel-empty">工作区干净，暂时没有待验收改动。</p>}
            {files.map(file => <button type="button" key={file.path} className={`review-file-row ${selected?.path === file.path ? 'is-selected' : ''}`} onClick={() => setSelectedPath(file.path)}>
              <FileCode2 className="w-4 h-4 shrink-0" />
              <span className="review-file-name" title={file.path}>{file.path}</span>
              <span className={`review-file-status review-file-status-${file.status}`}>{statusLabel(file.status)}</span>
              <span className="review-file-count">{file.additions == null ? '—' : `+${file.additions}`} / {file.deletions == null ? '—' : `-${file.deletions}`}</span>
            </button>)}
          </section>

          <section className="review-diff-panel" aria-label="差异预览">
            <div className="review-section-head"><span className="truncate">{selected?.path || '差异预览'}</span>{review.diffTruncated && <span className="review-diff-truncated">预览已截断</span>}</div>
            {selected?.status === 'untracked' && <p className="review-panel-empty">这是未跟踪文件，当前只显示文件状态；加入版本控制后才会生成逐行差异。</p>}
            {!selected && files.length === 0 && <p className="review-panel-empty">没有差异可预览。</p>}
            {selected && selected.status !== 'untracked' && <pre className="review-diff"><code>{diffLines.map((line, index) => <span className={diffLineClass(line)} key={`${index}-${line}`}>{line || ' '}{'\n'}</span>)}</code></pre>}
          </section>
        </div>

        <section className="review-verification-panel" aria-label="验收状态">
          <div><div className="review-section-head"><span>验收状态</span><span className="review-verification review-verification-unknown">只展示真实结果</span></div><p className="review-verification-copy">当前接口只读取仓库改动，尚未替你执行测试、类型检查或构建。</p></div>
          <button type="button" className={`btn-ghost review-ack-button ${acknowledged ? 'is-acknowledged' : ''}`} onClick={() => setAcknowledged(true)}><Check className="w-4 h-4" />{acknowledged ? '已记录我已查看' : '记录我已查看'}</button>
        </section>
      </>}
    </div>
  </div>
}
