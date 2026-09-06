# 聊天运行观测第二批 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将统一运行观测接入聊天界面，让用户在对话中看见阶段、记忆命中、情绪镜像和交付结果。

**Architecture:** 复用 `/api/run/overview` 与既有 `/api/runs/:id` 数据，前端只在当前会话存在活动 run 时轮询；新增纯展示组件，不改变聊天提交链路。记忆和情绪摘要使用已有 API，失败时隐藏摘要而不影响聊天。

**Tech Stack:** React 19、TypeScript、SWR、Lucide、Node test runner。

---

### Task 1: 聊天运行状态组件

**Files:**
- Create: `frontend/src/components/ChatRunStatus.tsx`
- Modify: `frontend/src/components/ChatArea.tsx`
- Test: `tests/unit/chat-run-status.test.mjs`

- [ ] 写源码契约测试：组件消费 `RunApi.overview`、渲染 `RunTimeline`、支持停止入口文案。
- [ ] 运行测试确认先红。
- [ ] 实现紧凑运行状态栏，只在有 active run 时显示，支持折叠和移动端换行。
- [ ] 将组件放在聊天消息区上方，不改变 SendBox 行为。
- [ ] 运行测试确认通过并提交。

### Task 2: 记忆与情绪摘要

**Files:**
- Create: `frontend/src/components/RunContextSummary.tsx`
- Modify: `frontend/src/components/ChatRunStatus.tsx`
- Test: `tests/unit/chat-run-status.test.mjs`

- [ ] 写测试锁定“记忆命中 / 情绪状态 / 工具数量”三种摘要标签。
- [ ] 实现无数据安全隐藏、错误不打断聊天、摘要可展开。
- [ ] 使用已有 `EmotionApi.get`，不新造情绪接口；记忆只读取运行摘要字段。
- [ ] 运行测试并提交。

### Task 3: 聊天集成交付与验证

**Files:**
- Modify: `frontend/src/components/ChatArea.tsx`
- Modify: `frontend/src/api.ts`
- Modify: `CHANGELOG.md`
- Test: `tests/unit/chat-run-status.test.mjs`

- [ ] 为当前运行完成/失败写状态契约，失败时显示可执行恢复动作。
- [ ] 接入已存在的运行详情查询，完成后保留最近一次摘要 8 秒再收起。
- [ ] 运行全量 Node 单测、前端 tsc、生产构建。
- [ ] 重启 8787，带 token 验证 `/api/run/overview` 和聊天首屏。
- [ ] 提交第二批代码、dist 和变更记录。
