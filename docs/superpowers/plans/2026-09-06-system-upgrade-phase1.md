# 元枢系统升级第一批 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立统一运行观测层，并把 Board 与 Engine 升级为以主驾状态、任务阶段和能力健康为核心的工作台。

**Architecture:** 后端新增轻量 `run-observability.mjs`，从现有 run-manager、session-bus、engine-pair 和 emotion 数据源生成统一快照；前端通过 `RunApi` 读取快照，公共组件负责阶段条、状态徽标和异常恢复入口。旧 API 保持兼容，Board/Engine 先接入，新 Chat 后续只消费同一快照。

**Tech Stack:** Node.js ESM、Node test runner、React 19、TypeScript、SWR、Tailwind utility classes。

---

### Task 1: 运行观测领域模型

**Files:**
- Create: `engine/run-observability.mjs`
- Test: `tests/unit/run-observability.test.mjs`

- [ ] 写测试：快照默认字段稳定、事件映射到阶段、失败和完成状态可读。
- [ ] 运行单测确认先红。
- [ ] 实现纯函数 `phaseFromEvent`、`summarizeRun`、`buildRunSnapshot`，不依赖 HTTP。
- [ ] 运行测试确认通过。
- [ ] 提交 `feat: add run observability model`。

### Task 2: 服务端运行观测接口

**Files:**
- Modify: `server.mjs`
- Modify: `engine/run-manager.mjs`
- Test: `tests/unit/run-observability.test.mjs`

- [ ] 为 `/api/run/overview` 和 `/api/run/:id` 写接口契约测试。
- [ ] 接入现有运行管理器和事件日志，返回 snapshot、recent、active、health 字段。
- [ ] 保持没有运行记录时返回空结构，不抛异常。
- [ ] 用 Node 测试和本地健康接口验证。
- [ ] 提交 `feat: expose run observability api`。

### Task 3: 公共 UI 状态组件

**Files:**
- Create: `frontend/src/components/RunTimeline.tsx`
- Create: `frontend/src/components/HealthBadge.tsx`
- Modify: `frontend/src/components/PageHeader.tsx`
- Test: `tests/unit/frontend-run-observability.test.mjs`

- [ ] 写源码契约测试，锁定阶段顺序、无障碍标签和错误态文案。
- [ ] 实现紧凑阶段条、健康徽标和统一页头 meta 区。
- [ ] 保持移动端可横向滚动、桌面端不抢主内容空间。
- [ ] 运行前端契约测试。
- [ ] 提交 `feat: add shared run status components`。

### Task 4: Board 总览升级

**Files:**
- Modify: `frontend/src/pages/Board.tsx`
- Modify: `frontend/src/api.ts`
- Test: `tests/unit/board-page.test.mjs`

- [ ] 写测试要求 Board 使用 `RunApi.overview`、提供继续对话/创作/交付/待办四个入口。
- [ ] 接入统一快照和健康徽标。
- [ ] 将最近会话、产物、任务和事件流整理为四个信息区，复用已有 API。
- [ ] 为加载、空数据、失败状态提供明确动作。
- [ ] 运行前端契约测试并构建。
- [ ] 提交 `feat: make board the system overview`。

### Task 5: Engine 控制台升级

**Files:**
- Modify: `frontend/src/pages/Engine.tsx`
- Modify: `frontend/src/api.ts`
- Test: `tests/unit/engine-panel.test.mjs`

- [ ] 写测试要求引擎页展示主驾/次席、健康、能力矩阵、最近失败和评测入口。
- [ ] 接入 RunApi 与现有 EngineApi，合并轮询而不重复请求。
- [ ] 增加诊断入口，失败时给出可执行恢复动作。
- [ ] 运行契约测试和前端构建。
- [ ] 提交 `feat: upgrade engine control center`。

### Task 6: 第一批集成验证

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/architecture-state.md`

- [ ] 运行 `npm test`。
- [ ] 运行 `cd frontend && npx tsc --noEmit`。
- [ ] 运行 `npm run build:frontend`。
- [ ] 重启 8787，验证 `/api/health`、`/api/run/overview` 和 Board 首屏。
- [ ] 记录第一批已完成能力和第二批边界。
- [ ] 提交 `chore: verify phase one system upgrade`。
