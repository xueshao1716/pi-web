# Code Context

## Files Retrieved
1. `D:/pi-web/server.mjs`（lines 520-749, 785-917, 1289-1315, 1491-1497, 1624-1628）- `/api/chat` 当前执行生命周期、busy/gen、两条模型管线、断连 abort、session stream 路由的核心 seam。
2. `D:/pi-web/engine/session-bus.mjs`（lines 1-48）- 当前内存事件环、seq、重放和订阅实现；durable event log 的直接替换点。
3. `D:/pi-web/engine/unified-chat.mjs`（lines 413-579）- 自制模型通道执行、signal 取消、JSONL 最终落盘与 SSE writer 耦合点。
4. `D:/pi-web/engine/session-manager.mjs`（lines 236-270）- 兼容现有 pi 会话 JSONL 的 openSession/SessionManager 入口与 activeSessions 内存状态。
5. `D:/pi-web/frontend/src/api.ts`（lines 69-136）- 当前 POST SSE 客户端与 session EventSource 重连实现。
6. `D:/pi-web/frontend/src/components/ChatArea.tsx`（lines 240-256, 280-369, 382-535）- 多端订阅只触发 SWR、IndexedDB 草稿、发送/停止/事件归并的 UI seam。
7. `D:/pi-web/frontend/src/types.ts`（lines 81-87）- 已存在 `SseEvent {type,seq,data,ts}`，可扩展 runId 而不另造前端事件体系。
8. `D:/pi-web/tests/smoke.mjs`（line 44 附近）- 现有 `/api/chat` 冒烟入口；未发现 session-bus、cursor、断线续跑专项测试。

## Key Code

### 现状准确 seam

- **HTTP 连接就是任务所有者（Blocker）**：Agent 路径在 `server.mjs:906-917` 的 `req.on("close")` 直接 `agent.abort()`，2.5 秒后还会 dispose agent、清 busy；unified 路径在 `server.mjs:710-724` 将请求 close 绑定到 `AbortController.abort()`；agent 降级 unified 路径同样在 `server.mjs:1293-1297` 绑定 close。浏览器刷新、移动网络切换、代理断 SSE 都会终止任务。
- **“发送新消息”隐式 stop（High）**：`server.mjs:560-579` 遇到 `entry.busy` 自动 abort 当前 agent，失败则 dispose/reopen。目标要求“显式 stop 才 abort”，因此必须改为 409/返回 activeRun，而不是新消息抢占。
- **运行状态只在内存（High）**：`entry.busy/busySince/gen` 在 `server.mjs:580-586`；重启即丢。`engine/session-manager.mjs:236-270` 仅从 JSONL 恢复会话及模型，不恢复 run。
- **事件总线非 durable（Blocker）**：`engine/session-bus.mjs:5-25` 是进程内 Map、最多 500 条，且 `turn_end` 立即清空。服务重启、长任务超过 500 条或完成后再连均不能重放。
- **cursor 实际未推进（High）**：后端虽支持 `?after=`（`session-bus.mjs:29-36`），但前端 `streamSession` 构造 URL 时始终复用函数入参 `after`（`api.ts:113-129`），收到事件未更新；`ChatArea` 更固定传 0（`ChatArea.tsx:246`）。EventSource 的 `Last-Event-ID` 也未使用，因为服务端没写 `id:` 行。
- **多端流不是渲染源（High）**：`ChatArea.tsx:240-255` 对 session stream 的任意事件仅 debounce `mutateMsgs()`；生成中还直接忽略。JSONL 多数在消息结束边界可见，因此另一端看不到可靠的进行中轨迹。
- **两条模型管线事件不对称（High）**：Agent 路径显式 `writer.push + busEmit`（如 `server.mjs:844-867`）；`handleUnifiedChat`（`unified-chat.mjs:413-579`）只写传入 writer，没有统一 durable sink。改造若只替 session-bus，会漏掉自定义 provider/降级路径。
- **前端 stop 只是断连接（Blocker）**：`ChatArea.tsx:510-516` 调 `abortRef.current()`，而 `api.ts:72-108` 只是 abort fetch。解耦后这不会停止后台 run，必须改显式 stop API。
- **现有 JSONL 是消息权威历史，应保留**：unified 在 `unified-chat.mjs:520-526, 559-579` 完成后 append user/assistant；agent 使用 SessionManager 自动落盘。run/event log 不应混写或改变 pi JSONL schema，否则 TUI/终端和已有解析器兼容风险大。

### 建议最小模块

1. `engine/run-store.mjs`：Run 元数据持久化与 CAS 状态转换；小规模下先用“每 run 一个 JSON + atomic rename”，避免引 SQLite 依赖。
2. `engine/run-event-log.mjs`：每 run append-only JSONL；负责单写者 seq 分配、append 后广播、按 cursor 扫描重放、保留策略。
3. `engine/run-registry.mjs`：仅保存本进程 live executor（AbortController/agent promise/subscribers），不是权威状态；显式 stop 通过它触发 abort。
4. `engine/run-executor.mjs`：把现有 `handleChat` 中“准备 entry → 选择管线 → 执行 → finalize”移出 HTTP handler。接收 event sink，而不是 `req/res`。
5. `engine/run-api.mjs`：create/get/events/stop 路由；server.mjs 只注入依赖和注册路由。
6. `frontend/src/api.ts`：新增 `RunsApi.create/get/stop/stream`；保留旧 `ChatApi.send` 作为迁移期兼容。
7. `frontend/src/components/ChatArea.tsx`：以 `{runId,lastSeq}` 驱动流状态；stop 调 API；断线只关闭 subscriber，不 finalize 为错误。

### 建议 API

- `POST /api/runs`
  - body：现有 chat body（`sessionId,message,model,files,params,taskKey`），另可带 `clientRequestId`（UUID，幂等键）。
  - response：`202 { runId, sessionId, status:"queued", nextSeq:1 }`。
  - 同一 session 有 active run：`409 { error:"session_busy", activeRunId }`；**不得隐式 abort**。
- `GET /api/runs/:runId` → run 元数据和 `lastSeq`。
- `GET /api/runs/:runId/events?after=<seq>`，SSE；同时支持 `Last-Event-ID`，取两者最大值；每条写 `id: <seq>`, `event: <type>`, `data: <完整信封>`。
- `POST /api/runs/:runId/stop`，可选 `{reason}`；幂等：终态返回 200 原状态，running/queued 转 `stopping` 后触发唯一 abort。
- 可选兼容别名：`GET /api/sessions/:sid/stream` 在迁移期查 active/latest run 并代理事件，但新前端必须按 runId 订阅，避免 session 内多轮 seq 混淆。
- 旧 `POST /api/chat` 第一阶段继续存在；第二阶段内部 create run 后“创建+订阅”桥接为旧 SSE 形态，但请求 close **只 unsubscribe，不 abort**。

### Run 数据格式

`runs/<yyyy-mm>/<runId>.json`：

```json
{
  "version": 1,
  "runId": "uuid",
  "sessionId": "existing-session-uuid",
  "clientRequestId": "uuid",
  "status": "queued|running|stopping|completed|failed|stopped|interrupted",
  "createdAt": "ISO",
  "startedAt": "ISO|null",
  "finishedAt": "ISO|null",
  "lastSeq": 42,
  "model": {"provider":"...","id":"..."},
  "input": {"message":"...","files":[],"params":{}},
  "error": null,
  "ownerInstanceId": "boot-uuid",
  "schemaVersion": 1
}
```

建议 input 可先完整保存以支持排障，但附件仅存引用/哈希，不复制大 base64；必要时单独 blob 化并限权。元数据写用临时文件 + rename，状态转移做 `expectedStatus` 校验。

`run-events/<yyyy-mm>/<runId>.jsonl` 每行：

```json
{"v":1,"runId":"uuid","sessionId":"uuid","seq":1,"type":"run_started","ts":"ISO","data":{}}
{"v":1,"runId":"uuid","sessionId":"uuid","seq":2,"type":"delta","ts":"ISO","data":{"text":"你"}}
{"v":1,"runId":"uuid","sessionId":"uuid","seq":3,"type":"tool","ts":"ISO","data":{"id":"tc1","name":"read","args":{"path":"..."}}}
{"v":1,"runId":"uuid","sessionId":"uuid","seq":4,"type":"run_completed","ts":"ISO","data":{"messageIds":["stable-id"]}}
```

约束：seq 对单 run 严格递增；append 成功后才广播；客户端以 `(runId,seq)` 去重；终态事件只允许一次；大 tool output 沿用现有 spill 策略，只在事件存预览+引用。`done/finish/turn_end` 逐步归一成 `run_completed`，迁移期可同时发 legacy type。

## Architecture

### 目标数据流

1. HTTP create 只校验、创建 session（若需要）、原子写 run queued，立即 202。
2. `run-executor` 将 queued→running，建立**服务器拥有**的 AbortController；浏览器请求对象不进入 executor。
3. Agent 与 unified 两条管线都只面向统一 `eventSink.append(type,data)`；sink 持久化分配 seq 后广播。
4. JSONL 仍由原 SessionManager/unified 逻辑在消息边界写入，是跨 TUI/终端兼容的最终消息历史；event log 是 run 过程账本，不替代 JSONL。
5. 任意端凭 runId + cursor 订阅，先重放磁盘事件，再加入 live subscribers；重复事件按 seq 忽略。
6. 只有 stop API 或服务端策略（超时/关机）调用 run AbortController。SSE close 只删除 subscriber。
7. 完成顺序建议：先确保会话 JSONL 最终消息落盘 → append `run_completed`（带 stable message IDs）→ CAS run completed。这样客户端收到 completed 后重拉 messages 必定可见；崩在中间时启动恢复器可根据事件/JSONL对账。

### stable message ID

最小阶段不要改 pi JSONL schema：终态事件先记录 SessionManager 已生成的 entry/message id（可在执行前后记录 leaf/新增 entry）；前端本地临时 id 与 server id 在 completed 时映射。若当前 agent 回调拿不到 ID，第一阶段允许 `messageIds:[]` + completed 后重拉；后续再稳定暴露。不要用时间戳当跨端全局 ID。

## 迁移步骤

### Phase 0：契约与观测（无行为切换）
- 定义 Run/Event schema、状态机、事件 type 映射；给现有 writer 增加可组合 sink（HTTP SSE + session bus + durable log）。
- 先让 Agent 与 unified 路径事件都经过同一 sink，修掉事件不对称。
- 加 `runId/seq` 到事件信封，旧客户端忽略新增字段仍可工作。

### Phase 1：durable log + cursor
- 新增 run store/event log 和只读 `GET run/events`；执行仍由旧 `/api/chat` 发起，但同时创建 run、持久化所有事件。
- session stream 迁移为兼容代理；不再 `turn_end` 清 buffer，磁盘日志成为重放源。
- 前端维护每 run cursor，收到即推进；重连使用 `after`/Last-Event-ID，按 `(runId,seq)` 幂等归并。

### Phase 2：执行与连接解耦
- 新增 `POST /api/runs` 202；run executor 后台执行。
- 旧 `/api/chat` 改为 create + subscribe adapter；删除所有 `req.close → abort/dispose`。
- busy 时返回 activeRun，不再自动 abort。前端 send 后订阅；刷新后从 session 的 active run 或保存的 runId 恢复。

### Phase 3：显式 stop 与多端完成态
- 前端停止按钮改 `POST /api/runs/:id/stop`；只有服务端确认 `run_stopped` 才 finalize。
- 多端同时 stop 幂等；所有端看到 stopping/stopped。
- IndexedDB 降级为离线缓存，不再作为流式权威来源；服务端事件重放覆盖它。

### Phase 4：清理与可选重启恢复
- 保留 event log 至少 7-30 天或按总量阈值；仅删除终态且超过 TTL 的 run。
- 启动扫描 `running/stopping` 且 ownerInstanceId 非本实例的 run：第一版标 `interrupted`，写终态事件；不要谎称自动续跑。
- 真正跨进程续跑需要 provider/tool 幂等 checkpoint，属于后续，不应阻塞“浏览器断线续跑”。

## 竞态、清理与重启限制

- **Blocker：双提交/重试发送**。手机超时重发 POST 会创建两个 run；必须 `clientRequestId + sessionId` 唯一索引/原子 create，重复返回原 run。
- **Blocker：append 与广播顺序**。先广播后落盘会产生“客户端见过但 cursor 重放不到”的洞；必须 fs append 成功后广播。
- **High：多写者 seq**。一个 run 只能有一个 executor；进程内 mutex + run owner/CAS。多进程部署前需真正文件锁/数据库事务。
- **High：stop/complete 同时发生**。状态机 CAS：`running→stopping→stopped` 或 `running→completed` 只能一个获胜；终态事件唯一。
- **High：同 session 并发**。现有 SessionManager/JSONL parent 链不适合两 run 并写；最小方案每 session 单 active run，第二次发送 409。
- **High：危险操作 confirm**。run 断线后确认事件必须可重放；confirm registry 当前若仅内存，服务重启后应使 run interrupted/failed，不能继续等待幽灵 Promise。
- **High：服务重启不能自动继续 LLM/tool 调用**。第一版只保证浏览器/HTTP 断线不影响；Node 进程崩溃仍将运行中 run 标 interrupted。工具可能已经产生副作用，禁止盲目 replay 整个 run。
- **Medium：日志增长和敏感数据**。delta/tool args/output 可能含密钥或大文本；沿用脱敏/大响应 spill，设置权限、TTL、总容量水位和 terminal-run GC。
- **Medium：部分尾行**。崩溃可能留下 event JSONL 半行；读取应忽略最后一条无效 JSON，seq 从最后有效行恢复；必要时每关键/终态事件 fsync。
- **Medium：完成与 messages 可见性**。终态必须在 JSONL flush 后发；否则多端收到 completed 后 SWR 仍读旧消息。
- **Medium：EventSource 鉴权**。当前 token 放 query（`api.ts:119`），会进入 URL/日志；本改造可保持兼容，但长期应使用 fetch SSE 或短期订阅票据。
- **Low：run/session 双 key 旧 bus**。当前 `server.mjs:785-788` 同一事件可能双挂 taskId/sessionId；新日志只按 runId 单写，session 视图做索引，避免重复序列。

## 测试矩阵

| 层级 | 场景 | 预期 |
|---|---|---|
| 单元 | event log 连续 append 1..N | seq 严格递增，重启读取 lastSeq 正确 |
| 单元 | JSONL 尾部半行/损坏行 | 忽略无效尾行，不复用已提交 seq |
| 单元 | `after=0/N/N+1` 与 Last-Event-ID | 精确重放，无漏无重；两 cursor 取最大 |
| 单元 | stop 与 complete 并发 | 仅一个终态、仅一个终态事件 |
| 单元 | 相同 clientRequestId 并发 create | 只创建一个 run，返回同 runId |
| 单元 | 每 session 两次 send | 第二次 409 + activeRunId，不 abort 第一条 |
| 集成 | POST create 后立即断开 | 后台继续，event log 最终 completed，JSONL 有完整消息 |
| 集成 | SSE 收到 seq=10 后断网再连 | 从 11 重放，UI 文本/tool 不重复 |
| 集成 | 任务完成后新设备首次连接 | 从磁盘完整重放或取 completed+messages，非空白 |
| 集成 | Agent provider 路径 | delta/think/tool/confirm/terminal 全有 runId+seq |
| 集成 | unified/custom provider 及 agent fallback | 与 Agent 路径同样事件契约，不漏 durable log |
| 集成 | 显式 stop（模型请求中/工具中/confirm 中） | abort 被调用一次，run stopped；HTTP disconnect 不调用 abort |
| 集成 | 两端同时 stop | 两端收到同一 stopped，API 幂等 200 |
| 集成 | server 在 running 中 kill/restart | run 变 interrupted；旧事件可重放；不会自动重复副作用工具 |
| 集成 | completed 后 GC 前/后订阅 | TTL 内可重放；GC 后 GET 明确 410/归档状态 |
| E2E | 桌面发、手机观察、桌面刷新 | 手机实时按 seq 渲染；桌面刷新从 cursor 恢复；任务不停 |
| E2E | 手机后台/网络切换/代理断流 | 重连恢复，停止按钮仍能显式终止 |
| 回归 | 旧 `/api/chat` 客户端 | SSE 格式兼容；断连接不再 abort；旧 stop 语义需 UI 版本门控/兼容提示 |
| 回归 | 既有 pi/TUI JSONL 会话 | 可列出、打开、继续对话、compact/export；文件 schema 未改变 |
| 回归 | 多端 SWR/IndexedDB | completed 后服务端消息去重，本地 draft 被 server message id 替换 |

## Start Here

先打开 `D:/pi-web/engine/session-bus.mjs`：它只有 48 行，完整暴露当前事件信封、seq、buffer、subscriber 和 replay seam。先用 `run-event-log` 替换其存储层，并让它接受 runId，是风险最低的第一刀；随后再把 `server.mjs` 两条管线统一接入 sink，最后解除 HTTP close 的 abort。

## Review Findings

- **blocker** — `D:/pi-web/server.mjs:906-917, 710-724, 1293-1297`：HTTP/SSE close 直接 abort 执行，无法满足连接解耦。
- **blocker** — `D:/pi-web/engine/session-bus.mjs:5-25`：事件仅内存且 `turn_end` 清空，无法 durable replay/重启恢复。
- **blocker** — `D:/pi-web/frontend/src/components/ChatArea.tsx:510-516`：stop 等同 fetch abort；解耦后必须有显式服务端 stop API。
- **high** — `D:/pi-web/server.mjs:560-579`：新消息隐式 abort 当前 run，与“显式 stop 才 abort”冲突。
- **high** — `D:/pi-web/frontend/src/api.ts:113-129` + `ChatArea.tsx:246`：cursor 固定不推进，且无 SSE `id:`/Last-Event-ID。
- **high** — `D:/pi-web/engine/unified-chat.mjs:413-579`：自定义/降级通道未统一走 session bus，事件持久化改造容易漏路。
- **high** — `D:/pi-web/frontend/src/components/ChatArea.tsx:240-255`：多端订阅只重拉最终 messages，不按事件恢复进行中 UI。

## Residual Risks

- 本设计只保证浏览器 HTTP 断线不影响任务；首版不承诺 Node/机器重启后继续同一 LLM/tool 调用。
- 现有 SessionManager 是否能直接返回最终 user/assistant entry ID 需实施时验证；若不能，Phase 1 先 completed 后重拉，stable ID 延后补齐。
- confirm registry、taskProgress、模型/agent 实例仍是内存对象；进程重启只能安全标 interrupted，不能恢复 Promise/网络流。
- 文件型 run store 适合当前单进程；若未来 watchdog 意外双实例或横向扩容，需升级 SQLite/事务存储和跨进程 lease。

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "已给出 7 项带 severity 的具体 review findings，并逐项引用 server.mjs、session-bus.mjs、unified-chat.mjs、api.ts、ChatArea.tsx 的准确路径与行范围；另列出 residual risks。"
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "read/grep/find/ls targeted repository inspection",
      "result": "passed",
      "summary": "只读检查服务端 chat 生命周期、session bus、两条模型管线、SessionManager、React API/ChatArea 和现有测试 seam。"
    }
  ],
  "validationOutput": [
    "确认三处 req close→abort seam：server.mjs 710-724、906-917、1293-1297。",
    "确认 session-bus 为进程内 Map、500 事件上限且 turn_end 清空：engine/session-bus.mjs 5-25。",
    "确认前端 session cursor 固定 after=0 且事件仅触发 mutateMsgs：api.ts 113-129、ChatArea.tsx 240-255。",
    "确认任务为只读设计，未修改仓库文件；仅写要求的审查产物。"
  ],
  "residualRisks": [
    "首版只能将浏览器连接与任务解耦，不能安全恢复 Node/机器重启中断的非幂等工具调用。",
    "SessionManager 最终消息 ID 暴露能力尚需实施阶段验证。",
    "文件存储方案仅适合单进程，横向扩容需事务数据库/lease。"
  ],
  "noStagedFiles": true,
  "diffSummary": "无代码 diff；仅生成只读架构设计审查文档。",
  "reviewFindings": [
    "blocker: D:/pi-web/server.mjs:906-917 - HTTP close 直接 abort/dispose agent。",
    "blocker: D:/pi-web/engine/session-bus.mjs:5-25 - 事件仅内存、500 条且 turn_end 清空。",
    "blocker: D:/pi-web/frontend/src/components/ChatArea.tsx:510-516 - stop 只是断开 fetch，无显式 run stop API。",
    "high: D:/pi-web/server.mjs:560-579 - 新消息隐式中止已有任务。",
    "high: D:/pi-web/frontend/src/api.ts:113-129 - cursor 不推进且未使用 Last-Event-ID。",
    "high: D:/pi-web/engine/unified-chat.mjs:413-579 - unified 路径未统一进入事件总线。"
  ],
  "manualNotes": "建议按 Phase 0→4 分阶段落地；第一刀从 session-bus 的持久化替换与统一 event sink 开始。"
}
```
