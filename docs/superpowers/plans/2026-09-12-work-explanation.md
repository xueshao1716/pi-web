# 工作说明层实施计划

> 执行方式：在当前任务内连续实现、核查并交付。用户已批准方案和继续执行。

**Goal:** 让同一轮工作的状态、依据、协作和证据在四个入口一致且可读。

**Architecture:** 后端纯函数从现有事件白名单构造 WorkExplanation；运行 API 提供按会话过滤的概览与详情。前端共享说明卡，保留原有任务控制入口。

**Tech Stack:** Node.js ESM、node:test、React、TypeScript、SWR、现有主题 tokens。

## 1. 统一数据对象

- [ ] 新建 `tests/unit/work-explanation.test.mjs`，构造 run 和事件验证：completed 不等于 verified；模型自报不能变成运行时检查；失败验证优先；相同工具与子任务 ID 只计一次；token 和工具参数不出现在结果；终态与缺失字段正确表达。
- [ ] 执行 `node --test tests/unit/work-explanation.test.mjs`，确认因模块缺失失败。
- [ ] 新建 `engine/work-explanation.mjs` 和事件收集辅助模块。返回 `{ version, runId, sessionId, goal, status, updatedAt, executor, basis, tools, subagents, memory, artifacts, verification, problem, nextStep }`，状态采用原运行状态，验证单独计算。
- [ ] 修改 `engine/run-api.mjs`，概览按可选 session 参数先过滤再取近期记录；为概览与详情附加 explanation。`server.mjs` 注入匹配当前运行的 AIBody 查询。
- [ ] 为 `tests/unit/run-api.test.mjs` 增加会话隔离和概览/详情一致性测试，执行这两组测试。

## 2. 共享展示与聊天

- [ ] 在 `frontend/src/lib/work-explanation.ts` 定义对应类型；`frontend/src/api.ts` 扩展 RunSummary 和 overview 参数。
- [ ] 新建 `frontend/src/components/WorkExplanation.tsx`：摘要行加折叠详情，使用 dl 展示目标、执行与依据；工具/协作/产物按记录列出；验证、缺口和下一步单独表达，未知信息使用明确文案。
- [ ] 修改 `ChatRunStatus.tsx`，按 session 缓存概览，移除跨会话 lastRun 和八秒隐藏逻辑；保留停止、重试、继续入口；加载失败可见。修改 `RunContextSummary.tsx` 中“记忆命中”为“记忆写入”。

## 3. 其他入口

- [ ] 工作台在已有运行概览位置展示共享卡，并提供打开对应会话入口。
- [ ] 引擎运行诊断展开后嵌入共享卡；补充引擎、模型、工具及 AIBody 的职责解释。
- [ ] 验收页增加近期运行证据区域，注明与当前仓库验证的范围不同；复用相同卡片。

## 4. 验证与交付

- [ ] 新增前端源码契约检查，确认四个入口共用组件、会话过滤、状态与验证分离。
- [ ] 运行 `npm test`、`frontend/node_modules/.bin/tsc --noEmit`、`npm --prefix frontend run build` 和仓库约定的 Impeccable detect。
- [ ] 在浏览器确认聊天、工作台、引擎、验收可展开；使用隔离样例检查 390px 布局和错误/无记录状态，不修改用户真实产物。
- [ ] 检查差异并提交，安全重启后验证服务和 bundle，合并回 main 并双推。
