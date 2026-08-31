# Task 1 报告：公共视觉地基

## 结果
已完成 Task 1，范围限定在前端公共视觉地基；未修改后端，未触碰 workshop/refine/image 实现。

## TDD 证据
### RED
- 命令：`node --test frontend/tests/design-contract.test.mjs`
- 结果：按预期失败。新增断言报告三个公共组件缺失、`styles.css` 仍定义 `page-eyebrow`、`EmptyState` 仍暴露/实现 `emoji` prop；同时复现 baseline 5 项存量失败（token 单一真源、<10px/字号阶梯、transition-all、原生控件规则）。

### GREEN
- `node --test frontend/tests/design-contract.test.mjs`：17/17 通过。
- `./frontend/node_modules/.bin/tsc --noEmit -p frontend`：通过，零诊断。
- `npm --prefix frontend run build`：通过，Vite 生产构建成功。
- `git diff --check`：通过。

环境说明：隔离 worktree 初始无 `frontend/node_modules`。首次 TypeScript/build 因依赖缺失失败，`npm ci` 因 frontend 无独立 lockfile 失败，普通 install 又遇既有 Vite/plugin-react peer 声明冲突；最终以 `npm --prefix frontend install --ignore-scripts --no-package-lock --legacy-peer-deps` 安装 package.json 声明依赖，未生成/修改 lockfile，再完成 GREEN。

## 改动文件
- 新增：`frontend/src/components/PageHeader.tsx`
- 新增：`frontend/src/components/SectionHeader.tsx`
- 新增：`frontend/src/components/StatusTile.tsx`
- 修改：`frontend/src/components/EmptyState.tsx`
- 修改：`frontend/src/styles.css`
- 修改：`frontend/src/theme/generate.mjs`
- 修改：`frontend/tests/design-contract.test.mjs`
- 契约存量修复所需窄改：`AppLayout.tsx`、`ActivityFeed.tsx`、`ChatArea.tsx`、`Message.tsx`、`SendBox.tsx`、`SetupWizard.tsx`、`Sidebar.tsx`、`TitleBar.tsx`、`LingXi.tsx`、`ModelHub.tsx`、`Themes.tsx`（仅 Lucide 空状态、字号 class 或 transition 属性）。

## 实现摘要
- 三个小型公共展示组件实现任务书约定接口。
- EmptyState 删除 emoji 入口，既有三个调用点改用 Lucide。
- 统一 selection、既有 focus-visible、select/time/date/range/color 原生控件层及页面容器/标题/状态摘要样式。
- `--pi-z-topbar` 移入 `Z_INDEX` 生成器并重建 generated token 区块。
- 清除契约命中的 <10px 与 transition-all，字号收敛到既有白名单。

## Diff 摘要
19 个源码/测试文件及本报告；新增 3 个公共组件，公共样式与契约增强，业务文件仅做契约违规的机械替换。

## 提交
`HEAD` — `refactor(ui): 建立统一页面视觉地基`

## 残余问题
- 公共组件在本 Task 只建立地基，各业务页全面迁移由后续任务完成。
- `.pi-subagents/` 是任务启动前已有运行时未跟踪目录，未暂存、未提交。
- 未做浏览器截图/真机手测；本 Task 依任务书完成契约测试、TypeScript 和 build。
