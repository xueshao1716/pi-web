# Chat Durable Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Android 软键盘遮挡与工具卡重复，并把聊天执行从发起 HTTP/SSE 连接中解耦，支持按游标断线重放与显式停止。

**Architecture:** 先把前端消息/tool 归并做成可测试纯函数；再新增文件型 Run 元数据与 append-only 事件日志；随后用 `run-manager` 在服务端后台拥有执行请求，旧 `handleChat` 通过内存请求/响应适配器复用，浏览器只订阅持久化事件；最后前端切到 `POST /api/runs + GET /events + POST /stop`。现有 pi 会话 JSONL 继续作为最终消息权威历史，Run 事件账本不改其 schema。

**Tech Stack:** Node.js ESM、Node test runner、React 19、TypeScript、IndexedDB、SSE、Tauri 2 Android WebView。

## Global Constraints

- 不修改或清理主工作区既有的 `refine-api/workshop/workspace-api/public` 未提交工作线。
- 只有一个写入者操作本 worktree；每个任务完成后必须独立 review。
- 新增后端职责必须拆进 `engine/`，禁止继续膨胀 `server.mjs`。
- 不能按 bash 命令文本去重；工具调用身份只认稳定 `toolCallId`。
- 浏览器 SSE 断开不得 abort 后台任务；只有显式 stop API 或服务端策略可 abort。
- 同一 session 同时最多一个 active run；第二次发送返回 `409 session_busy`，不得隐式打断旧任务。
- 首版只承诺浏览器/网络断线后任务继续；Node 进程重启后的 running run 标记 `interrupted`，不得自动重放可能有副作用的工具。
- 现有 `/api/chat` 保留兼容，但 React 新前端切换至 `/api/runs`。
- Run 事件 `seq` 对单 run 严格递增；必须先落盘再广播；SSE 必须写 `id: <seq>` 并支持 `after` 与 `Last-Event-ID`。
- Run/event 文件不得记录 Authorization、API Key 或完整大附件；请求正文仅在内存执行，持久化元数据只保留 message 预览和附件路径。
- 完成前必须运行：后端专项测试、全量 `npm test`、前端 `npx tsc --noEmit -p .`、`npm run build`、Impeccable detect。

---

### Task 1: 修复移动键盘遮挡与工具消息重复

**Files:**
- Create: `frontend/src/lib/chat-stream.ts`
- Create: `frontend/src/lib/viewport.ts`
- Create: `tests/unit/chat-stream.test.mjs`
- Create: `tests/unit/local-db-merge.test.mjs`
- Modify: `frontend/src/components/ChatArea.tsx`
- Modify: `frontend/src/AppLayout.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/lib/local-db.ts`
- Modify: `app/src-tauri/gen/android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Produces: `upsertRunningTool(tools, event)`，同 id 更新、不重复；不同 id 即使命令相同也并存。
- Produces: `installVisualViewportHeight()`，把可见高度写到 `--pi-viewport-height`，返回清理函数。
- Produces: `mergeMessages()` 对同 `toolCallId` 的本地/服务端工具消息归并，服务端最终 output/error 优先，本地草稿状态保留。

- [ ] **Step 1: 写失败测试**
  - 同 ID 的两个 tool start 合并为一个。
  - 不同 ID 的相同 bash args 保留两个。
  - 本地空文本工具消息与服务端不同 message id、相同 tool id 合并为一份。
  - 本地聚合 `[A,B]` 与服务端分段 `[A]`、`[B]` 后每个 tool id 只出现一次且最终 output 不丢。

- [ ] **Step 2: 运行专项测试确认 RED**
  - Run: `node --test tests/unit/chat-stream.test.mjs tests/unit/local-db-merge.test.mjs`
  - Expected: 因新导出/行为未实现而失败。

- [ ] **Step 3: 实现最小纯函数并接入 ChatArea**
  - `case 'tool'` 使用 `upsertRunningTool`；缺 id 时才生成客户端 id。
  - `mergeMessages` 先按 message id/文本指纹，再按 tool id 归并；禁止 name/args 指纹去重。

- [ ] **Step 4: 实现移动可见高度**
  - `installVisualViewportHeight` 监听 `visualViewport.resize/scroll` 和 `window.resize`，写入 `--pi-viewport-height: <height>px`；无 VisualViewport 时用 `innerHeight`。
  - 移动根容器使用 `.mobile-app-root`，CSS fallback 顺序为 `100vh`、`100dvh`、`var(--pi-viewport-height)`。
  - Manifest Activity 显式添加 `android:windowSoftInputMode="adjustResize"`。
  - 保持 ChatArea/SendBox 正常 flex 文档流，不改 fixed/sticky。

- [ ] **Step 5: 验证 GREEN**
  - Run: `node --test tests/unit/chat-stream.test.mjs tests/unit/local-db-merge.test.mjs`
  - Run: `cd frontend && npx tsc --noEmit -p .`

### Task 2: 持久化 Run 元数据与事件账本

**Files:**
- Create: `engine/run-store.mjs`
- Create: `engine/run-event-log.mjs`
- Create: `tests/unit/run-store.test.mjs`
- Create: `tests/unit/run-event-log.test.mjs`

**Interfaces:**
- Produces: `createRunStore({ rootDir, now?, idFactory? })`，方法 `create/get/update/findActiveBySession/markOrphanedInterrupted`。
- Produces: `createRunEventLog({ rootDir, now? })`，方法 `append/readAfter/getLastSeq/subscribe/close`。
- Run status: `queued | running | stopping | completed | failed | stopped | interrupted`。
- Event envelope: `{v:1,runId,sessionId,seq,type,ts,data}`。

- [ ] **Step 1: 写失败测试**
  - create 后原子可读；`clientRequestId+sessionId` 重试返回同一 run。
  - 同 session active run 可查询；终态后不再视为 active。
  - 启动恢复将旧 owner 的 queued/running/stopping 标 interrupted。
  - append 生成连续 seq；`readAfter(N)` 精确返回 N 后事件。
  - JSONL 尾部半行被忽略；append 落盘成功后 subscriber 才收到。

- [ ] **Step 2: 运行确认 RED**
  - Run: `node --test tests/unit/run-store.test.mjs tests/unit/run-event-log.test.mjs`

- [ ] **Step 3: 实现文件存储**
  - 默认目录由调用方注入；测试使用临时目录。
  - 元数据写临时文件后 rename；事件一 run 一 JSONL；读取忽略无效尾行。
  - 元数据 input 只保存 `messagePreview`、`model`、附件路径，禁止 key/header/base64。

- [ ] **Step 4: 验证 GREEN**
  - Run: `node --test tests/unit/run-store.test.mjs tests/unit/run-event-log.test.mjs`

### Task 3: 后端后台 Run、SSE 重放与显式停止

**Files:**
- Create: `engine/run-manager.mjs`
- Create: `engine/run-api.mjs`
- Create: `tests/unit/run-manager.test.mjs`
- Create: `tests/unit/run-api.test.mjs`
- Modify: `server.mjs`

**Interfaces:**
- `createRunManager({store,eventLog,executeChat,instanceId})`：`create/start/get/stop/subscribe/recover`。
- `executeChat` 适配现有 `handleChat(req,res,body)`：manager 创建内存 EventEmitter 风格 request/response；response 的 SSE chunk 被解析后 append 到 eventLog；浏览器连接不传入执行器。
- `createRunApi({json,readBody,manager})` 提供 create/get/events/stop handlers。

- [ ] **Step 1: 写失败测试**
  - create 立即返回 runId，执行在后台继续。
  - subscriber 断开不调用后台 request close，不触发 abort。
  - stop 幂等，running 时只触发一次 close/abort；completed stop 返回原状态。
  - 同 session active 时 create 抛 `session_busy` 并带 activeRunId。
  - SSE `after`/`Last-Event-ID` 取较大值、写 id/event/data、先重放再订阅。
  - completed 前事件均可在新 subscriber 重放。

- [ ] **Step 2: 实现 manager 与 API**
  - 数据目录：`<agentDir>/pi-web-runs`，不放仓库和工作空间。
  - `POST /api/runs` 返回 202；`GET /api/runs/:id`；`GET /api/runs/:id/events`；`POST /api/runs/:id/stop`。
  - 后台执行响应解析 legacy SSE，逐事件持久化；`done/finish` 后标 completed，`error` 后标 failed，显式 stop 后标 stopped。
  - 旧 `/api/chat` 暂保留，不改行为；React 切换后不再依赖它。
  - server 启动时调用 recover，把旧实例的非终态 run 标 interrupted 并追加终态事件。

- [ ] **Step 3: 接入 server 路由并验证**
  - Run: `node --test tests/unit/run-manager.test.mjs tests/unit/run-api.test.mjs`
  - Run: `node --check server.mjs && node --check engine/run-manager.mjs && node --check engine/run-api.mjs`

### Task 4: React 切换到可恢复 Run 客户端

**Files:**
- Create: `frontend/src/lib/run-events.ts`
- Create: `tests/unit/run-events.test.mjs`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/components/ChatArea.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `CHANGES-20260831-watchdog-sound-draft.md`

**Interfaces:**
- `RunsApi.create(body) -> {runId,sessionId,status,lastSeq}`。
- `RunsApi.stream(runId, after, onEvent, onError) -> close()`；每次事件推进 cursor，重连从最后 seq 开始。
- `RunsApi.stop(runId)` 显式停止。
- `applyRunEvent(state,event)` 按 `(runId,seq)` 幂等归并；支持 legacy `delta/think/tool/tool_end/file/image/media/note/emotion/error/done`。

- [ ] **Step 1: 写失败测试**
  - 重复 seq 不重复 delta/tool；跳号事件按到达顺序只应用一次。
  - 同 tool id 重放不重复。
  - completed/stopped/failed 终态归一。

- [ ] **Step 2: 改 API 与 ChatArea**
  - send：先创建 run，再订阅；`activeRunRef` 保存 runId/lastSeq，并持久化到 IndexedDB/localStorage 的 session scoped 小记录。
  - 页面/会话进入时若有 active run，从保存 cursor 恢复订阅；GET run 为终态时重放剩余事件并 finalize。
  - SSE error 只提示“正在重连”，不得 finalize/abort；看门狗不再 abort fetch，改调用 `RunsApi.stop`。
  - stop 按钮调用 stop API，收到 stopped 终态后 finalize。
  - completed 后重拉服务端 messages，并清理 run 恢复记录与对应本地草稿。

- [ ] **Step 3: 全量验证**
  - Run: `node --test tests/unit/run-events.test.mjs`
  - Run: `npm test`
  - Run: `cd frontend && npx tsc --noEmit -p .`
  - Run: `cd frontend && npm run build`
  - Run: `node C:/Users/xuexiaofeng/.agents/skills/impeccable/scripts/detect.mjs --json frontend/src/AppLayout.tsx frontend/src/components/ChatArea.tsx frontend/src/styles.css`

- [ ] **Step 4: 运行行为冒烟**
  - 使用隔离端口启动 server，创建测试 session/run；订阅收到至少 `run_started` 与终态。
  - SSE 订阅中途断开，确认 run 仍完成；用 `after` 重连只收到后续 seq。
  - 长任务显式 stop，确认状态为 stopped；单纯关闭订阅不停止。
