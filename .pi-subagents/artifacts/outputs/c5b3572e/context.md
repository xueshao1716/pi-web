# Code Context

## Files Retrieved
1. `server.mjs` (lines 788-874) - `/api/chat` 的 agent 订阅桥；每个 `tool_execution_start/end` 各向直连 SSE writer 和 session bus 发一次，事件 id 原样取 `event.toolCallId`。
2. `engine/session-bus.mjs` (lines 1-48) - 会话广播总线；每个 key 自增 seq，`turn_end` 清缓冲；它不是 `/api/chat` 的第二个渲染输入。
3. `frontend/src/components/ChatArea.tsx` (lines 65-141) - IndexedDB 与服务端历史的合并入口。
4. `frontend/src/components/ChatArea.tsx` (lines 205-216) - 本地/SWR 双写及 draft 展示规则。
5. `frontend/src/components/ChatArea.tsx` (lines 230-259) - session bus 在前端只触发 `mutateMsgs()`，不消费 tool 事件渲染。
6. `frontend/src/components/ChatArea.tsx` (lines 292-346) - 流式 assistant 每 3 秒以固定本地 id 写 IndexedDB，finalize 再以同 id覆盖。
7. `frontend/src/components/ChatArea.tsx` (lines 405-474) - `/api/chat` SSE 消费；`tool` 无条件 append，`tool_end` 按 id 更新。
8. `frontend/src/components/Message.tsx` (lines 7-57, 180-183) - `tools.map` 一项渲染一卡片；React key 用 `t.id || i`，渲染层自身不复制。
9. `frontend/src/lib/local-db.ts` (lines 172-229) - 合并仅按 id，或“非空文本+role+120 秒”去重；明确跳过空文本（纯工具）消息。
10. `engine/session-utils.mjs` (lines 27-76) - 服务端 JSONL 历史把每个 assistant entry 独立转消息，并按 toolCall id 关联 toolResult。
11. `frontend/src/api.ts` (lines 113-139) - session SSE EventSource 实现；只把事件交给调用者，ChatArea 调用者仅 revalidate。
12. `frontend/src/types.ts` (lines 26-49, 62-74) - ToolCall/ChatMessage/RunningTool 数据结构。

## Key Code

### P0/P1 最可能根因：纯工具本地最终消息与服务端历史并存

`ChatArea.finalize()` 会把整个流式轮次（包括 bash 卡片）保存为一个客户端 id（`a<timestamp>`）的本地消息；随后 session bus 事件或焦点恢复触发服务端历史重拉。引擎 JSONL 使用自己的 assistant entry id。两者 id 必然不同。

`mergeMessages()` 只对有文本的消息做内容指纹：

```ts
for (const m of localMsgs) {
  if (!m.text || !m.text.trim()) continue // 空文本（纯工具调用）不参与内容匹配
  ...
}
...
if (sMsg.text && sMsg.text.trim()) { ... }
merged.push(serverMessage)
```

因此 bash-only/纯工具 assistant：

- 本地：`id=a...`, `text=''`, `tools=[bash]`
- 服务端：`id=<JSONL entry id>`, `text=''`, `tools=[同一 bash toolCall id]`
- 合并结果：两个 assistant message，各含同一工具卡；`Message` 各渲染一次，看起来就是“两条相同消息/卡片”。

更广泛地，客户端把整轮聚合成一个 assistant 消息，而 `extractMessages()` 按 JSONL 中每个 assistant entry 分段输出；一次 agent turn 中若有多轮 tool call，历史形态和本地聚合形态不一致。即便最终有文本，内容指纹也无法匹配中间的纯工具历史 entry，所以重复风险仍在。

**严重性：high（用户可见重复，刷新/跨端/重验证后稳定复现；数据本身通常未重复执行）。**

### 次要缺陷：实时 tool start 不幂等

`ChatArea` 当前逻辑：

```ts
case 'tool':
  return { ...p, tools: [...p.tools, { id: d.id || 't' + Date.now(), ... }] }
```

它没有按 `d.id` upsert/dedupe。若 agent/网关确实把同一 `tool_execution_start`（同 id）发两次，会立即显示两卡；之后 `tool_end` 会同时更新两个同 id 项。该路径是明确的健壮性缺口，但本次静态链路和真实 JSONL抽样不支持它是首要根因。

**严重性：medium（重复事件时必现，但尚无生产双发证据）。**

### 双 SSE 路径不是同一页面的双渲染输入

后端确实对每个 agent event 同时：

```js
writer.push("tool", ...); // POST /api/chat
busEmit("tool", ...);     // GET /api/sessions/:id/stream
```

但 ChatArea 的 session bus callback 忽略事件内容，只 debounce 后 `mutateMsgs()`；实际工具流式 UI 只消费 `ChatApi.send` 的回调。因此不是“同一 tool event 经两条 SSE 都 append 到 stream.tools”。bus 会间接促成历史重拉，从而触发上述本地/服务端合并重复。

### 真实 JSONL 证据（已脱敏，仅统计与结构）

只读扫描 `~/.pi/agent/sessions/**/*.jsonl` 共 280 个文件：

- 发现 **0 个重复 toolCall id**。
- 仅 3 个文件存在相邻“同 tool 名+同参数但不同 id”的调用。
- 一个具体样本中，两次相同 `bash` 命令分别是不同 `toolu_...` id，且各自紧邻独立 toolResult；这是 agent 有意重复轮询构建日志，不是事件层双发或同一执行重复落盘。

这降低了“agent 重复 start 同 id”和“JSONL 已双写”的概率。不同 id 的相同 bash 可能是合法重试/轮询，前端不能仅按命令文本全局去重。

## Architecture

1. Agent 发 `tool_execution_start/end`。
2. `server.mjs` 单个 subscribe handler 将其转换为 `/api/chat` 的 `tool/tool_end`，同时广播 session bus。
3. 发起端 ChatArea 只用 `/api/chat` 更新 `streamRef.tools`；session bus 只触发 SWR 历史重拉。
4. 流式中每 3 秒把聚合 assistant 草稿写 IndexedDB；结束时同客户端 id覆盖为 final。
5. 引擎另外将结构化 assistant/toolResult entries 写 JSONL。
6. `/messages` 经 `extractMessages()` 将 JSONL assistant entries 转为服务端消息。
7. `mergeMessages()` 合并 IndexedDB 和服务端消息；纯工具消息既不同 id又无 text，无法判同源，双份保留。
8. `Message` 对每条 message 的每个 tool 数组元素渲染 ToolCard，于是同一 toolCall 可出现两卡。

## Most Likely Root Cause and Evidence

1. **最可能（high）：IndexedDB 最终消息与服务端 JSONL 历史的身份/粒度不一致，纯工具消息合并不去重。** 直接证据是 `local-db.ts` 明确排除空文本去重，且客户端 id 与 JSONL id独立；session bus/焦点恢复会主动重拉历史。
2. **次可能（medium）：同 id 的 tool start 重发时前端无幂等保护。** 代码上必然重复，但 280 个 JSONL 抽样未见重复 toolCall id；仍需抓 SSE 才能完全排除瞬时事件双发（JSONL不记录 execution_start 事件本身）。
3. **较低概率：不同 id、同参数的真实重复执行。** 样本确有，但均各自有 toolResult，符合 agent 主动轮询/重试；按文本去重会误吞合法调用。
4. **较低概率：writer + bus 双发直接渲染。** 已由前端调用关系排除；bus 不 append tool，只触发历史刷新。

## Reproduction / Test Plan

### 稳定复现主因
1. 清理一个测试会话在当前浏览器的 IndexedDB，建立新会话。
2. 发送一个会产生 bash 调用且 assistant 在该 tool step 没有文本的请求。
3. 在 `/api/chat` SSE 中记录 `tool` 的 id（不要记录敏感 args/output）。确认一次 start、一次 end。
4. 等 finalize 后，通过切标签触发 focus revalidate，或等待 session bus debounce；也可刷新页面。
5. 检查 IndexedDB：本地 `a...` assistant 含该 tool id；检查 `/api/sessions/:id/messages`：不同 message id 含同 tool id。
6. 断言 UI 出现两张同 tool id 的卡。若删除 IndexedDB 本地项后刷新只剩一张，即完整证明。

### 自动化测试
- `local-db` 单测：local 纯工具消息与 server 纯工具消息，message id 不同但 `tools[0].id` 相同；期望合并后只保留一份。
- 多工具单测：同一客户端聚合消息 `[A,B]`，服务端分为两个 assistant messages `[A]`,`[B]`；期望每个 toolCall id 仅出现一次且最终文本不丢。
- SSE reducer 单测：连续两个 `tool` 事件同 id，期望 tools length=1（upsert）；不同 id即便 name/args相同，期望 length=2。
- E2E：捕获 POST SSE、`/messages`、IndexedDB、DOM 四层 id，分别覆盖刷新前、刷新后、跨端触发 bus revalidate。

## Minimal Fix Location

### 首选最小修复
`frontend/src/lib/local-db.ts::mergeMessages`：在 message id/文本指纹之外，加入 **toolCall id 集合的同源去重**。不要按 tool name/args 去重。

安全规则建议：
- 如果 server message 的全部 tool ids 已存在于某条 local message，跳过该 server message，或将 server 的 output/error/status 补入 local 对应 tool。
- 若只部分重叠，按 tool id 合并数组，保留非重叠 tool 和服务端最终结果。
- 服务端最终历史应优先成为权威；长期更合理的是完成同步后删除/替换相应本地 final，而不是永久“本地优先”。

### 同时建议的低成本防线
`frontend/src/components/ChatArea.tsx` 的 `case 'tool'`：由 append 改为按 `d.id` upsert；缺 id 才生成 id。这样同 id start 双发不会重复卡。

### 长期正确修复
让 POST `/api/chat` 在本轮开始/完成时返回服务端稳定 message/run id，并让 IndexedDB 使用该 id；或 finalize 后 revalidate 成功即移除对应本地 final。客户端聚合一轮、服务端按 assistant step 分段的契约也应统一，否则仅修纯工具去重仍可能有布局/顺序差异。

## Constraints and Residual Risks

- JSONL 只能证明持久化 toolCall 没有重复 id，不能证明瞬时 `tool_execution_start` 从 agent emitter 到 subscribe callback 没有双发；需在 server 转换点加临时结构化计数或测试 spy 才能彻底排除。
- 280 文件扫描包含大量历史会话，但未精确定位用户截图对应 session；结论是高置信架构诊断，不是对特定 DOM 实例的取证。
- 不可按相同 bash command/args 去重：真实样本证明同命令不同 id可代表合法轮询。
- 工作树原本已有多处修改/未跟踪文件；本调查未修改它们。

## Start Here

先打开 `frontend/src/lib/local-db.ts` lines 172-229。这里是最直接、最符合现象且有明确代码证据的重复产生点；随后看 `ChatArea.tsx` lines 292-346 与 439-452 验证本地 final 生命周期和实时 reducer。

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete high/medium findings cite server.mjs, frontend/src/components/ChatArea.tsx, frontend/src/lib/local-db.ts, engine/session-utils.mjs, plus a 280-file JSONL structural scan."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "grep/read targeted agent→SSE→ChatArea→Message→IndexedDB/history chain",
      "result": "passed",
      "summary": "Mapped both SSE paths and the local/server merge behavior."
    },
    {
      "command": "python read-only scan of ~/.pi/agent/sessions/**/*.jsonl",
      "result": "passed",
      "summary": "Scanned 280 JSONL files; no duplicate toolCall ids; three files had adjacent same name/args with distinct ids."
    },
    {
      "command": "git status --short && git log -5 --oneline",
      "result": "passed",
      "summary": "Confirmed pre-existing dirty worktree; no investigation edits were made."
    }
  ],
  "validationOutput": [
    "Primary evidence: mergeMessages excludes empty-text pure-tool messages from content dedupe, while local and server message ids differ.",
    "Event-bus evidence: ChatArea session stream callback only triggers mutateMsgs; it does not append tool cards directly.",
    "JSONL evidence: zero duplicate toolCall ids in 280 scanned files; same-command repeats observed with different ids and independent results."
  ],
  "residualRisks": [
    "No capture of the exact user-visible session/SSE stream, so transient same-id execution_start double emission cannot be fully excluded.",
    "Client aggregates a turn while server history segments assistant entries; a tool-id merge patch needs multi-tool ordering tests.",
    "Existing unrelated dirty worktree means future implementer must avoid overwriting concurrent changes."
  ],
  "noStagedFiles": true,
  "diffSummary": "Read-only investigation; no code or test diff.",
  "reviewFindings": [
    "high: frontend/src/lib/local-db.ts:172-229 - pure-tool local and server messages with different message ids are never deduplicated, producing duplicate cards after history revalidation.",
    "medium: frontend/src/components/ChatArea.tsx:439-447 - tool start handling blindly appends; repeated same-id start events are not idempotent.",
    "info: server.mjs:854-861 and ChatArea.tsx:246-251 - writer and bus both publish tool events, but bus is only used to revalidate history, not directly render a second card.",
    "info: JSONL scan - no duplicate toolCall ids found across 280 files; identical command repetitions used distinct ids and independent tool results."
  ],
  "manualNotes": "No secrets or raw tool outputs were included. Existing unrelated worktree changes were left untouched."
}
```
