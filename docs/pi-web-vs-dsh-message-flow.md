# pi-web vs dsh 消息流对比研究

> 日期：2026-08-14
> 对象：pi-web（D:\pi-web\server.mjs unifiedChat + JSONL 会话）vs dsh（@deepseek-ai/dsh v0.1.0-rc.6，事件溯源会话）
> 方法：源码级对比（server.mjs / dsh-session / dsh-agent / dsh-agent-loop）

---

## 一句话核心区别

**pi-web 存"消息"（可变数组 + JSONL 副本）；dsh 存"事件"（append-only 日志，消息只是投影）。**

pi-web 的消息流是"模型消息形状"（OpenAI 兼容：user/assistant/toolResult），
dsh 的消息流是"领域事件流"（30+ 种事件类型，模型消息由 surface 投影推导）。

---

## 两边的消息流形态

### pi-web（消息为中心）

```
会话文件(JSONL) ──加载──> 内存 messages 数组 ──> 模型请求
     ↑                                              │
     └──────── 追加新消息 <──── 工具结果/回复 <──────┘
```

- JSONL 行类型：`session` / `message` / `model_change` / `thinking_level_change` / `compaction` / `session_info`
- `message` 行内嵌 OpenAI 风格消息：`role: user | assistant | toolResult`
  - assistant 带 `provider/model/usage/stopReason/responseId` 元数据
  - toolResult 带 `toolCallId/toolName/isError`
- 每条消息有 `id` + `parentId` → **树形结构**，渲染时从 leaf 沿 parentId 回溯路径
- 运行时 unifiedChat 直接操作内存数组，工具调用 = `assistant.tool_calls` → 执行 → 追加 `tool` 结果

### dsh（事件为中心）

```
事件日志(append-only, JSONL+zstd) ──replay──> Session 状态
                                                    │
                              deriveMessages()（surface 投影折叠）
                                                    │
                              assembleContextFor()（sections 拼接 + 工具 + runtime 投影）
                                                    │
                                                    模型请求
```

- 事件类型（30+）：`user/message` `assistant/message` `assistant/chunk` `tool/call` `tool/result`
  `compaction/*` `approval/*` `request/header` `sandbox/mode` `plan/mode` `llm/retry` `goal/*` `hook/*` `session/*` …
- **Surface** 投影层：只有 `user/message` / `assistant/message` / `tool/result` 三种事件能产生模型可见消息
- 事件带 `surfaceOp`：`append`（追加）或 `replace`（替换）；替换只影响模型面，日志保留原文

---

## 逐维度对比

| 维度 | pi-web | dsh | 谁强 |
|---|---|---|---|
| 事实源 | 内存消息数组（JSONL 是副本） | append-only 事件日志 | dsh |
| 存储形态 | 直接存 OpenAI 消息 | 存事件，消息是派生 | dsh |
| 工具消息 | `toolResult` 单事件（结果内嵌） | `tool/call` + `tool/result` 两事件 | dsh（审计粒度细） |
| 编辑/纠错 | 无替换语义 | surfaceOp replace（模型面替换，日志留原文） | dsh |
| 多分支 | id+parentId 树，leaf 回溯路径 | 线性日志 + seq | **pi-web** |
| 流式 | 直接 SSE 输出 | `assistant/chunk` 事件入日志 | dsh（可回放） |
| 上下文组装 | 手拼 system + messages | SystemPrompt sections（persona/工具/时间/runtime 各贡献按序拼接） | dsh |
| 运行时上下文 | 无 | RuntimeContext 投影（快照只留最后一份，变化才提交） | dsh |
| compaction | 重写文件 + parentId 重链 + **丢原文** | `compaction/*` 事件 + replace 投影，**日志保留** | dsh |
| resume | 读 JSONL 重建数组 | replay 日志即状态（projection 缓存加速） | dsh |
| 查询/统计 | 直接解析文件（简单 API） | session-query(sqlite) / projection 缓存 / stats / telemetry 插件 | dsh |
| 调试直观性 | 消息即 OpenAI 格式，一眼看懂 | 事件流 + 投影，心智负担高 | **pi-web** |
| 消息元数据 | 内嵌在消息上 | 独立事件（usage 挂空 assistant message） | 平 |

---

## 关键设计差异详解

### 1. 事件溯源 vs 消息数组（哲学级差异）

dsh 的会话 = 事件日志，任何状态（含模型消息）都是**每次从日志折叠推导**的。
好处：可回放、可追溯、编辑不丢历史（replace 只动投影面）、resume 无需额外机制。
pi-web 是经典实现：消息数组是主状态，JSONL 只是持久化，编辑（compaction）直接改文件。

### 2. 替换语义：dsh 有，pi-web 没有

dsh 的 `surfaceOp: replace` 让"模型看到的"和"用户看到的"可以不同：
- compaction 后模型看到压缩版，用户转录用 append-origin 事件（原文不丢）
- 工具结果纠错：replace 只允许改 content，禁止改结构（`tool/result` 替换必须恰好重写一个节点）

pi-web 的 compaction 是破坏性的：重写 JSONL、parentId 重链到 compaction 条目，原文没了。

### 3. 工具调用拆成两个事件（tool/call + tool/result）

pi-web 只有 `toolResult`（结果），调用动作没有独立事件；
dsh 把"发起调用"和"返回结果"分开记录——审计、重试、结果替换都更干净。

### 4. 上下文组装工程化（sections）

dsh 的 SystemPrompt 把上下文拆成命名区段（persona、工具、时间上下文、运行时上下文…），
各自插件贡献、按序拼接、可单独替换；还有 RuntimeContext 投影机制（动态上下文只留最后快照，变了才提交）。
pi-web 是手拼一个 system 字符串。

### 5. pi-web 的独特优势：parentId 多分支树

dsh 是线性日志，没有分支概念；pi-web 的消息树支持"从任何 leaf 回溯路径"，
适合分支会话（同一会话探索多条路径）。这是 pi-web 领先 dsh 的地方。

---

## 结论

**各自主场不同**：
- dsh 是"审计级"消息流——事件溯源、可回放、可追溯，适合做严肃 Agent 平台底座
- pi-web 是"实用级"消息流——消息即 OpenAI 格式、多分支树、调试直观，胜在轻和快

**pi-web 值得吸收的三点**（按性价比排序）：
1. **工具调用拆事件**：记录 `tool/call` 独立事件（现在只有结果），审计/重试更干净——改动小
2. **非破坏性 compaction**：压掉的消息不删原文，而是标记 + 投影（模型面压缩、日志留底）——改动中
3. **上下文 sections 化**：system 从单字符串改为命名区段拼接，插件可各自贡献——改动中

**不建议吸收**：完整事件溯源（30+ 事件类型 + 投影折叠）对 pi-web 当前体量是过度设计，
parentId 树已经解决了分支问题，重构成事件溯源会丢掉 pi-web 的直观性优势。
