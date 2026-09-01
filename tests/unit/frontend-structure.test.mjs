// 前端结构测试（nomifun *.structure.test.ts 模式，2026-08-25）
// 断言关键交互契约在源码中存在且顺序正确——比口头约定/review 可靠。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FE = join(ROOT, 'frontend', 'src')
const read = (...p) => readFileSync(join(FE, ...p), 'utf8')

test('结构：Markdown 自定义块必须包 SafeBlock 错误隔离（mermaid/dsh-ui/高亮代码）', () => {
  const src = read('components', 'Markdown.tsx')
  const safeCount = (src.match(/<SafeBlock/g) || []).length
  assert.ok(safeCount >= 3, `SafeBlock 应包裹 ≥3 条自定义渲染路径，实际 ${safeCount}`)
  for (const marker of ['MermaidBlock code={content} />', 'GenUIBlock raw={content} />']) {
    assert.ok(src.includes(marker), `自定义渲染 ${marker.split(' ')[0]} 必须仍在 SafeBlock 内`)
  }
  // 降级路径必须是纯文本 pre
  assert.ok(src.includes('PlainFallback'), '必须有统一纯文本降级组件')
})

test('结构：ChatArea 滚动必须走 useAutoScroll hook，禁止内联简易滚动逻辑回归', () => {
  const chat = read('components', 'ChatArea.tsx')
  assert.ok(chat.includes('useAutoScroll({'), 'ChatArea 必须使用 useAutoScroll')
  assert.ok(!chat.includes('nearBottomRef'), '旧的 nearBottomRef 简易滚动逻辑不得回归')
  assert.ok(!chat.includes('onScroll={onScroll}'), '滚动监听归 useAutoScroll，ChatArea 不得自带 onScroll')

  const hook = read('hooks', 'useAutoScroll.ts')
  // 三阈值三守卫的关键常量必须在位
  assert.ok(hook.includes('FOLLOW_BOTTOM_THRESHOLD_PX = 12'), '贴底阈值 12px（HiDPI 防亚像素）')
  assert.ok(hook.includes('PROGRAMMATIC_GUARD_MS = 150'), '程序滚动守卫 150ms')
  assert.ok(hook.includes('LAYOUT_GUARD_MS = 600'), 'pointerdown 封锁守卫 600ms')
  assert.ok(hook.includes('ResizeObserver'), '内容尺寸跟随必须用 ResizeObserver')
})

test('结构：SendBox 必须 key={currentSessionId} remount（切会话清空输入态）', () => {
  const chat = read('components', 'ChatArea.tsx')
  assert.match(chat, /<SendBox key=\{currentSessionId \?\? 'none'\}/, 'SendBox 切会话必须 remount 清空输入态')
})

test('结构：样式缓动必须收敛到 token（styles.css 除 :root 定义外无裸 cubic-bezier）', () => {
  const css = read('styles.css')
  for (const line of css.split('\n')) {
    if (/cubic-bezier/.test(line)) {
      assert.match(line.trim(), /^--pi-(ease|ease-sheet):/, `裸缓动曲线必须收敛到 token：${line.trim().slice(0, 60)}`)
    }
  }
})

test('结构：React 聊天使用持久化 Run，关闭 SSE 不得等同停止任务', () => {
  const chat = read('components', 'ChatArea.tsx')
  const api = read('api.ts')
  assert.ok(chat.includes('RunsApi.create('), '发送消息必须先创建持久化 Run')
  assert.ok(chat.includes('RunsApi.stream('), '消息流必须订阅 Run 事件账本')
  assert.ok(chat.includes('RunsApi.stop('), '手动停止与看门狗必须调用显式 stop API')
  assert.ok(!chat.includes('ChatApi.send('), 'React 聊天不得退回请求即任务的旧 ChatApi')
  assert.ok(!chat.includes('abortRef'), '关闭浏览器订阅不得再通过 abortRef 停止任务')
  assert.ok(api.includes("'Last-Event-ID': String(cursor)"), '断线重连必须携带最后事件游标')
})

test('结构：心情胶囊是服务端情绪镜像，禁止本地点击换脸', () => {
  const chat = read('components', 'ChatArea.tsx')
  assert.ok(!chat.includes('setMood'), '不得保留本地 setMood 点击轮换逻辑')
  assert.ok(chat.includes('emoMeta('), '必须使用服务端 VAD→表情映射（emoMeta）')
  assert.ok(chat.includes("case 'emotion':"), 'SSE emotion 事件必须被消费')
  const pill = chat.match(/<div[^>]*emo-pill[\s\S]*?>/)
  assert.ok(pill, 'emo-pill 元素必须存在')
  assert.ok(!pill[0].includes('onClick'), 'emo-pill 元素不得绑定 onClick 换脸')
})

test('长任务无事件看门狗允许持续 10 分钟后才停止', () => {
  const chat = read('components', 'ChatArea.tsx')
  assert.match(chat, /const IDLE_WARN_MS = 600_000/, '聊天无事件超时必须是 10 分钟')
  assert.doesNotMatch(chat, /IDLE_WARN_MS = 90_000/, '不得保留 90 秒自动停止')
})

test('流式期间过滤本地 assistant 草稿，避免与实时流重复渲染 bash 工具卡', () => {
  const chat = read('components', 'ChatArea.tsx')
  assert.match(chat, /const renderMessages = stream \? messages\.filter\(m => !m\.isDraft\) : messages/, '流式期间不能把 IndexedDB 草稿和实时 assistant 同时渲染')
})

test('前端收到会话已更新事件后立即刷新会话列表', () => {
  const chat = read('components', 'ChatArea.tsx')
  assert.match(chat, /case 'session_updated':[\s\S]*?refreshSessions\(\)/, 'session_updated 必须立即刷新会话列表')
  assert.doesNotMatch(chat.match(/case 'session_updated':[\s\S]*?case 'completed':/)?.[0] || '', /mutateMsgs\(\)/, '流式收尾前不能刷新消息正文，避免和实时 assistant 重复')
})


test('后端提交聊天记录后同时广播会话更新事件，支持其他前端实例同步', () => {
  const server = readFileSync(join(ROOT, 'server.mjs'), 'utf8')
  assert.match(server, /onSessionUpdated:\s*\(\{\s*run\s*\}\)\s*=>\s*busPush\(run\.sessionId,\s*"session_updated"/, '聊天记录提交后必须广播 session_updated 给会话订阅者')
})
