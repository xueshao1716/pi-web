# Task 2 实施报告：应用壳、桌面右面板与移动导航

## 状态

已完成。改动只覆盖 Task 2 指定的前端应用壳、移动导航、辅助面板、样式与结构测试；未改后端，未触碰 workshop/refine/image 工作区实现，也未引入依赖。

## 实现

- 新增 `MobileMoreMenu`，用固定底栏“更多”入口替换可拖动 `MobileFab`。
- 移动底栏固定为：对话 / 会话 / 资产 / 任务 / 更多。
- “更多”收纳灵犀、专项、模型、应用、引擎、主题、会话库、系统，以及工作空间、交付物、终端、活动、TUI 辅助面板。
- 设置类子路由统一保持“更多”活跃；底栏和菜单项提供 `aria-current`，更多按钮提供 `aria-expanded`。
- 新增 `UtilityPanel`：桌面默认作为 400–520px flex 真右栏，不覆盖 rail、会话栏或聊天主区。
- 仅终端/TUI显示显式展开按钮；展开状态提供 `aria-expanded`。
- 更多菜单和辅助面板均支持 Esc 关闭；移动触控目标最小 44px；固定底栏和菜单尊重安全区。
- 保留原工作空间、交付物、终端、活动、TUI 内容组件及原有切换/关闭事件路径。

## TDD 证据

1. 先新增 `tests/unit/frontend-ui-structure.test.mjs`。
2. 首次运行 `node --test tests/unit/frontend-ui-structure.test.mjs`：4/4 失败，明确暴露旧“设置”Tab、`MobileFab` 引用/文件、缺少新组件、桌面默认 `inset-x-0` 全屏结构和 44px 契约。
3. 实现后同一目标测试：4/4 通过。

## 验证

- `node --test tests/unit/frontend-ui-structure.test.mjs frontend/tests/design-contract.test.mjs`：22/22 通过。
- `npm test`：234/234 通过。
- `cd frontend && npx tsc --noEmit -p .`：通过。
- `cd frontend && npm run build`：通过（4280 modules transformed）。构建产物已还原，未纳入本任务提交。
- `git diff --check`：通过；仅有 Git for Windows 的 LF→CRLF 提示。
- `cd frontend && npm run lint:design -- --diff`：命令执行完成，报告 2 条既有问题：`ChatArea.tsx:679` violet gradient、`styles.css:1008` transition height；均不在本任务新增行，未扩大范围处理。

## 改动文件

- `frontend/src/AppLayout.tsx`
- `frontend/src/components/MobileMoreMenu.tsx`
- `frontend/src/components/UtilityPanel.tsx`
- `frontend/src/components/MobileFab.tsx`（删除）
- `frontend/src/styles.css`
- `tests/unit/frontend-ui-structure.test.mjs`
- `.superpowers/sdd/2026-08-31-ui-system-polish/task-2-report.md`

## Concerns

- 未执行四视口真机/浏览器截图检查；结构、类型、构建和设计契约已自动验证。
- Impeccable 的 2 条告警为既有代码，非本次引入。
- worktree 中 `.pi-subagents/` 是任务开始前已有的未跟踪运行目录，未暂存、未提交。

## Fix round：移动底栏互斥活跃态与更多菜单焦点管理

### 修复

- `mobileMoreOpen` 为 true 时，对话、会话、资产、任务四个底栏入口统一失活，只有更多保留 `aria-current="page"`；结构测试直接锁定四个互斥条件和底栏 `aria-current` 单点渲染。
- `MobileMoreMenu` 打开后主动聚焦关闭按钮，并将 Tab / Shift+Tab 循环限制在 sheet 内。
- `AppLayout` 持有更多触发按钮 ref；菜单通过关闭按钮、遮罩、Esc、路由或面板操作关闭后，焦点恢复到更多按钮。
- 未处理手机面板底栏预留或双 Esc，也未引入依赖。

### RED / GREEN

- RED：`node --test tests/unit/frontend-ui-structure.test.mjs` → 6 项中 2 项新增契约失败，分别命中底栏活跃态未互斥、缺少焦点圈定/恢复。
- GREEN：`node --test tests/unit/frontend-ui-structure.test.mjs frontend/tests/design-contract.test.mjs` → 24/24 通过。
- `cd frontend && npx tsc --noEmit -p .` → 通过。
- `cd frontend && npm run build` → 通过（4280 modules transformed；仅既有 UnoCSS/分包提示）。
- `git diff --check` → 通过；仅 Git for Windows LF→CRLF 提示。

### Fix round concerns

- 焦点行为由静态结构契约、TypeScript 与生产构建验证；未增加浏览器自动化或真机键盘手测。
- `.pi-subagents/` 仍为任务前已有的未跟踪运行目录，不纳入提交。
