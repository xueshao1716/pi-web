// 小说工坊：项目管理 + 按管道节点工作，不再只有「续写一章」
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'frontend', 'src')
const read = (...parts) => readFileSync(join(SRC, ...parts), 'utf8')
const engine = readFileSync(join(ROOT, 'engine', 'workshop-novel-run.mjs'), 'utf8')
const server = readFileSync(join(ROOT, 'server.mjs'), 'utf8')

test('书架能管作品：状态筛选、删除、管道进度', () => {
  const shelf = read('components', 'novel', 'NovelShelf.tsx')
  assert.ok(shelf.includes('新建作品'), '书架必须能建书')
  assert.ok(shelf.includes('删除'), '书架必须能删书')
  assert.ok(shelf.includes('archived') || shelf.includes('归档'), '必须能看归档状态')
  assert.ok(shelf.includes('pipelineReady'), '卡片必须显示管道进度')
})

test('作品工作台按管道节点切换，覆盖产品化到导出', () => {
  const bench = read('components', 'novel', 'NovelWorkbench.tsx')
  for (const label of ['产品化', '叙事声音', '世界观', '人物', '大纲', '硬事实', '写章', '修订', '导出']) {
    assert.ok(bench.includes(label), `工作台缺节点 ${label}`)
  }
  assert.ok(bench.includes('data-slot="novel-pipeline"'), '必须有管道导航')
})

test('作者只加意见，设定和写章都自动生成', () => {
  const bench = read('components', 'novel', 'NovelWorkbench.tsx')
  assert.ok(bench.includes('我的意见'), '必须有常驻意见框')
  assert.ok(bench.includes('自动生成设定'), '产品化+五层必须一键自动生成')
  assert.ok(bench.includes('自动写第'), '章节必须自动写')
  assert.ok(bench.includes('按意见修订'), '修订必须吃意见')
  assert.ok(bench.includes('按意见重做'), '单节点可按意见重跑')
  assert.ok(server.includes('/api/novel/studio'), '必须有 studio 一键生成设定接口')
  assert.ok(engine.includes('handleBookStudio'), 'studio 必须走 agent 自动写各层文件')
})

test('未生成节点显示待生成，不把占位「待构建」当成正文', () => {
  const bench = read('components', 'novel', 'NovelWorkbench.tsx')
  assert.ok(bench.includes('待生成'), '未就绪节点必须标待生成')
  assert.ok(bench.includes('还没生成'), '占位文件不能当作成品展示')
  assert.ok(bench.includes('placeholderNode'), '必须能识别待构建占位')
})

test('小说写章/推进节点 SSE 必须挂断连 abort', () => {
  assert.ok(engine.includes('attachSseAbort'), 'workshop-novel 必须挂 attachSseAbort')
  assert.ok(server.includes('handleBookWrite({ ...wsCtx(), req }'), '写章必须传入 req')
  assert.ok(server.includes('/api/novel/advance'), '必须有按节点推进的接口')
  assert.ok(server.includes('/api/novel/revise'), '必须有修订接口')
})

test('已写章节常驻，能查看、预览、修改', () => {
  const bench = read('components', 'novel', 'NovelWorkbench.tsx')
  const chaptersUi = read('components', 'novel', 'NovelChapters.tsx')
  const api = read('api.ts')
  assert.ok(bench.includes('<NovelChapters'), '工作台必须挂章节面板，不能只藏在写章节点里')
  assert.ok(!bench.includes("node?.kind === 'write' &&"), '章节目录不得再被写章节点条件包起来')
  assert.ok(chaptersUi.includes('data-slot="novel-chapters"'), '章节面板必须有稳定槽位')
  assert.ok(chaptersUi.includes('查看'), '必须能查看已写章节')
  assert.ok(chaptersUi.includes('预览'), '必须能预览正文')
  assert.ok(chaptersUi.includes('修改'), '必须能改已写章节')
  assert.ok(chaptersUi.includes('保存'), '修改后必须能保存')
  assert.ok(api.includes('saveChapter'), '前端必须有保存章节 API')
  assert.ok(server.includes('["POST", "/api/novel/chapter"'), '服务端必须能写入章节')
})

test('按意见重做等文字按钮必须横向，不能用 28px 图标钮 btn-tool', () => {
  const bench = read('components', 'novel', 'NovelWorkbench.tsx')
  const toolHits = [...bench.matchAll(/className=\{?`[^`]*btn-tool[^`]*`\}?[^>]*>\s*[^<]*[\u4e00-\u9fff]/g)]
  assert.equal(toolHits.length, 0, '中文操作按钮不得用 btn-tool（w-7 h-7 会竖排）')
  assert.ok(bench.includes('whitespace-nowrap'), '文字按钮必须 nowrap 横向')
  assert.ok(bench.includes('btn-ghost'), '次级文字按钮用 btn-ghost')
})
