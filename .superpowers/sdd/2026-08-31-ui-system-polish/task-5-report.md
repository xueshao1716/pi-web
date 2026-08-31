# Task 5 实施报告：应用、任务、会话库与聊天视觉收口

## 状态

已完成。改动仅覆盖 Task 5 指定的 `Apps`、`Tasks`、`SessionDb`、`Message` 与结构契约测试；未修改后端、API、消息数据流、工具卡分支或依赖。

原实现子任务因 25 分钟生命周期上限在机械清理阶段被终止，留下可编译但未提交的目标文件。父任务按系统化调试流程确认：终止原因是子任务生命周期超时，不是代码、测试或 Git 冲突；随后完成独立审查、三项窄修、验证与提交。

## 实现

### 应用中心

- 使用 `PageHeader` 与 `SectionHeader`。
- 五个内部 View 和原 API 全部保留。
- 桌面改为“知识资产 / 系统改进”分组左导航；移动端使用单一紧凑选择器。
- 当前工具显示独立标题和说明，不再把异质工具挤在同一排 Tab。

### 任务中心

- 使用统一页头与区块头。
- 空任务列表改用 Lucide `EmptyState`，CTA 滚动并聚焦现有创建表单。
- 保留列表、创建、执行、停止、暂停、恢复、归档、删除及历史 API 行为。
- 状态、历史和 hover 色改为 `pi-success/pi-warning/pi-danger` 语义 token。
- 移除结构 emoji 与文本加号。

### 会话数据库

- 使用统一页头。
- 桌面保留完整表格；移动端新增卡片视图，等价提供选择、编号、名称、健康、大小、消息、更新时间与置顶。
- 空筛选结果使用统一 `EmptyState`。
- 健康与置顶改为语义 token，移除置顶 emoji。
- 移动选择与置顶按钮触控目标扩为 44px。
- `/list`、`/stats`、`/rebuild`、`/sanitize`、`/meta` 行为保持不变。

### 消息视觉

- 固定 purple/sky/red/emerald 色改为 `pi-accent/pi-info/pi-danger/pi-success`。
- 系统提示与通知的 emoji 改为 Lucide `Info`。
- 用户头像不再硬编码红色。
- 保留 system/user/assistant、Thinking、ToolCard、附件、Markdown 与 streaming 分支。
- 历史工具仅提供 `status: error` 时，外框与图标统一使用归一化 `isError`。
- 工具字母/符号图标从 10px 调整为 12px；10px 仅保留在 badge。

## TDD 与恢复证据

### 初始 RED / GREEN

- 原子任务先扩展 `tests/unit/frontend-ui-structure.test.mjs`，新增 Apps、Tasks、SessionDb、Message 契约。
- 终止后父任务复核：结构与设计契约 40/40 通过，TypeScript 通过，说明主体实现完整。

### 审查修复 RED

独立短审查发现：移动会话按钮不足 44px、工具错误边框仍读 `tool.isError`、工具图标误用 10px。先新增契约后运行：

```text
node --test tests/unit/frontend-ui-structure.test.mjs
22 tests · 20 pass · 2 fail
```

两个失败测试块精确覆盖三项问题。

### 审查修复 GREEN

```text
node --test tests/unit/frontend-ui-structure.test.mjs frontend/tests/design-contract.test.mjs
40/40 passed
```

## 验证

- `npm test`：252/252 通过。
- `cd frontend && npx tsc --noEmit -p .`：通过。
- `cd frontend && npm run build`：通过；仅既有 UnoCSS shortcut、Vite deprecated option、dynamic import 与 chunk-size 警告。
- Impeccable detector（Apps/Tasks/SessionDb/Message）：零发现 `[]`。
- `git diff --check`：通过。
- 构建产物已还原，不纳入提交。

## Changed files

- `frontend/src/pages/Apps.tsx`
- `frontend/src/pages/Tasks.tsx`
- `frontend/src/pages/SessionDb.tsx`
- `frontend/src/components/Message.tsx`
- `tests/unit/frontend-ui-structure.test.mjs`
- `.superpowers/sdd/2026-08-31-ui-system-polish/task-5-report.md`

## 残余风险

- 四视口真实浏览器、dark/mist、reduced-motion 与键盘 focus 验收留给 Task 6。
- 结构测试用于锁定信息架构和保留行为，不能替代真实浏览器布局检查。
- `.pi-subagents/` 为运行时未跟踪目录，不纳入提交。
