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

---

## Fix round 1（审查修复）

### 审查发现与处理
1. **残留 `page-eyebrow`**：设计契约升级为扫描 `frontend/src` 全部 TS/TSX/CSS，要求使用数为 0。RED 实际定位 8 处（审查点名的 Engine/LingXi/ModelHub/System/Tasks/Workshop，以及同类 Apps/Assets），均仅删除英文 eyebrow 元素；未恢复禁用 CSS，未改业务逻辑，也未触碰 engine/public 下 workshop/refine/image 文件。
2. **公共组件字号角色**：EmptyState hint 11→12px、CTA 12→13px；StatusTile label 保持 11px 元数据，detail 11→12px。
3. **10px 角色限制**：Themes “默认”按钮 10→11px；TitleBar 符号 10→11px。新增最小角色测试锁定 PageHeader/SectionHeader/StatusTile 不使用 10px 正文字号，并精确锁定上述公共组件及两处字号。

### RED
- 命令：`node --test frontend/tests/design-contract.test.mjs`
- 结果：按预期失败（16/18 通过、2/18 失败）。失败项明确列出 8 个 `page-eyebrow` 残留文件，并报告 EmptyState hint 不是 12px；角色断言随后会继续覆盖 CTA、StatusTile detail、Themes 默认按钮与 TitleBar 符号。

### GREEN 与验证
- `node --test frontend/tests/design-contract.test.mjs`：18/18 通过。
- `./frontend/node_modules/.bin/tsc --noEmit -p frontend`：通过，零诊断。
- `npm --prefix frontend run build`：通过，Vite 生产构建成功。
- `git diff --check`：通过。
- 构建后的 `frontend/dist` tracked/untracked 噪音已恢复/清理，未纳入提交。

### Fix round 1 改动文件
- `frontend/tests/design-contract.test.mjs`
- `frontend/src/components/EmptyState.tsx`
- `frontend/src/components/TitleBar.tsx`
- `frontend/src/styles.css`
- `frontend/src/pages/Themes.tsx`
- `frontend/src/pages/Apps.tsx`
- `frontend/src/pages/Assets.tsx`
- `frontend/src/pages/Engine.tsx`
- `frontend/src/pages/LingXi.tsx`
- `frontend/src/pages/ModelHub.tsx`
- `frontend/src/pages/System.tsx`
- `frontend/src/pages/Tasks.tsx`
- `frontend/src/pages/Workshop.tsx`

### 残余问题
- 构建仍有既有 Vite/UnoCSS/大 chunk 非阻塞警告，本轮未扩大范围处理。
- 未做截图或真机视觉验收；机械删除 eyebrow 元素与字号角色由契约、TypeScript 和生产构建覆盖。
