# pi-web UI System Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留 pi-web 深色专业工作台身份和现有功能的前提下，统一全局页面骨架并重点重做最难看的功能页与移动端导航。

**Architecture:** 先建立小型公共展示组件和设计契约，再依次改应用壳、模型中心和其他功能页。所有视觉状态继续消费现有 `--pi-*` 语义 token，不引入新的 UI 框架或后端接口；每个任务都可独立构建和审查。

**Tech Stack:** React 19、TypeScript、Vite、UnoCSS、Lucide React、Node test、Impeccable detector。

## Global Constraints

- 不改变后端 API、模型路由、持久化 Run、会话数据结构和聊天数据流。
- 不新增产品功能，不引入新的运行时依赖。
- 不重做聊天核心交互，只做主题适配和视觉收口。
- 不触碰主工作区 refine/workshop/图片工作台的未提交改动。
- 新增组件必须职责单一，禁止新建巨型文件；现有文件改动以当前页面职责为边界。
- 页面正文不小于 13px，说明以 12px 为主，11px 仅用于 ID/时间/测量值，10px 只用于 badge。
- 结构图标统一使用 Lucide，不使用 emoji；触控目标不小于 44px。
- 验证视口：375×812、390×844、768×1024、1440×900。

---

### Task 1: 全局页面地基与设计契约

**Files:**
- Create: `frontend/src/components/PageHeader.tsx`
- Create: `frontend/src/components/SectionHeader.tsx`
- Create: `frontend/src/components/StatusTile.tsx`
- Modify: `frontend/src/components/EmptyState.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/theme/generate.mjs`
- Modify: `frontend/tests/design-contract.test.mjs`

**Interfaces:**
- Produces: `PageHeader({ title, description, actions?, meta? })`
- Produces: `SectionHeader({ title, description?, icon?, actions? })`
- Produces: `StatusTile({ label, value, detail?, icon, tone? })`
- Changes: `EmptyState` 仅接受 Lucide `icon`，保留 `title/hint/action/className/children`。

- [ ] **Step 1: 写失败的设计契约测试**
  - 新增公共组件存在且禁止 `page-eyebrow` 的断言。
  - 新增 EmptyState 禁止 emoji prop 的断言。
  - 保留并明确原生 `select/time/date/range/color` 控件主题规则断言。
- [ ] **Step 2: 运行 `node --test frontend/tests/design-contract.test.mjs`，确认新增断言因组件/规则缺失而失败。**
- [ ] **Step 3: 实现三个小型公共组件、统一 focus/selection/native controls/页面容器样式，并把 `--pi-z-topbar` 纳入生成器单一真源。**
- [ ] **Step 4: 清除本任务触及范围内 `<10px`、`transition-all` 和 emoji 空状态。**
- [ ] **Step 5: 运行设计契约、TypeScript 和构建。**
- [ ] **Step 6: 提交 `refactor(ui): 建立统一页面视觉地基`。**

### Task 2: 应用壳、桌面右面板与移动导航

**Files:**
- Create: `frontend/src/components/MobileMoreMenu.tsx`
- Create: `frontend/src/components/UtilityPanel.tsx`
- Modify: `frontend/src/AppLayout.tsx`
- Delete: `frontend/src/components/MobileFab.tsx`
- Modify: `frontend/src/styles.css`
- Test: `tests/unit/frontend-ui-structure.test.mjs`

**Interfaces:**
- `MobileMoreMenu({ open, onClose, route, nav, onOpenPanel, onOpenTheme })`
- `UtilityPanel({ active, onChange, onClose, expanded, onToggleExpanded, children })`

- [ ] **Step 1: 写结构测试，断言移动底栏为“对话/会话/资产/任务/更多”、不再引用 `MobileFab`，桌面工具面板不是默认 `inset-x-0` 全屏。**
- [ ] **Step 2: 运行目标测试并确认失败。**
- [ ] **Step 3: 用 MobileMoreMenu 替代拖拽 FAB；设置类子路由保持“更多”活跃。**
- [ ] **Step 4: 桌面实现 400–520px 真右侧上下文面板，并给终端/TUI显式展开动作。**
- [ ] **Step 5: 验证安全区、44px 触控目标、Esc 关闭、aria-expanded/aria-current。**
- [ ] **Step 6: 运行目标测试、TypeScript、构建并提交 `refactor(ui): 统一桌面与移动导航结构`。**

### Task 3: 模型中心决策化重排

**Files:**
- Create: `frontend/src/components/models/ActiveModelHero.tsx`
- Create: `frontend/src/components/models/ModelFilterBar.tsx`
- Create: `frontend/src/components/models/ModelCard.tsx`
- Modify: `frontend/src/pages/ModelHub.tsx`
- Modify: `frontend/src/components/ModelChannels.tsx`
- Test: `tests/unit/frontend-ui-structure.test.mjs`

**Interfaces:**
- `ActiveModelHero` 展示当前模型和 Auto 说明，不请求新 API。
- `ModelFilterBar` 只接收受控筛选状态与回调。
- `ModelCard` 使用现有 `Model` 类型和 `onUse`。

- [ ] **Step 1: 写结构测试，断言当前模型焦点区先于模型网格、通道管理位于折叠区、业务文件不含固定 emerald/purple/sky 色类。**
- [ ] **Step 2: 运行测试确认失败。**
- [ ] **Step 3: 拆分三组件并把第一屏重排为“当前模型 → 筛选 → 模型结果”。**
- [ ] **Step 4: 将通道、累计用量和 provider 表下沉到“通道与用量”折叠区。**
- [ ] **Step 5: 模型卡压缩到可比较信息；状态色改用 `pi-success/pi-info/pi-accent` 语义 token。**
- [ ] **Step 6: 运行测试、TypeScript、构建并提交 `feat(ui): 重塑模型中心决策体验`。**

### Task 4: 主题与系统页面重排

**Files:**
- Modify: `frontend/src/pages/Themes.tsx`
- Modify: `frontend/src/pages/System.tsx`
- Test: `tests/unit/frontend-ui-structure.test.mjs`

**Interfaces:**
- 两页使用 Task 1 的 `PageHeader/SectionHeader/StatusTile`。
- 现有 ThemeApi/SystemApi 调用保持不变。

- [ ] **Step 1: 写结构测试，断言主题开发者选项默认折叠、系统状态位于能力清单之前、两页不再手写 `<h1>` 页面头。**
- [ ] **Step 2: 运行测试确认失败。**
- [ ] **Step 3: 主题页形成画廊/实时预览/精调布局，Token 速览与导出进入开发者折叠区。**
- [ ] **Step 4: 系统页顶部加入服务/版本/运行时长/网络状态摘要，更新与网络成为主区，能力清单移到底部折叠。**
- [ ] **Step 5: 清理 9px 文本、emoji、固定色和 transition-all。**
- [ ] **Step 6: 运行测试、TypeScript、构建并提交 `feat(ui): 重排主题与系统页面层级`。**

### Task 5: 应用、任务、会话库和聊天主题收口

**Files:**
- Modify: `frontend/src/pages/Apps.tsx`
- Modify: `frontend/src/pages/Tasks.tsx`
- Modify: `frontend/src/pages/SessionDb.tsx`
- Modify: `frontend/src/components/Message.tsx`
- Modify: `frontend/src/styles.css`
- Test: `tests/unit/frontend-ui-structure.test.mjs`

**Interfaces:**
- Apps 保持现有五个内部 View 和 API。
- Tasks/SessionDb 保持现有动作和数据模型。
- Message 保持消息分支与工具卡行为。

- [ ] **Step 1: 写结构测试，断言 Apps 具有分组导航、Tasks 使用 EmptyState、SessionDb 具有桌面表格与移动卡片、Message 不含固定 purple/sky/red/emerald 色类。**
- [ ] **Step 2: 运行测试确认失败。**
- [ ] **Step 3: Apps 改为桌面左导航/手机紧凑选择器，并为当前工具补标题说明。**
- [ ] **Step 4: Tasks 统一空状态和状态色；SessionDb 对齐 PageHeader 并实现移动卡片。**
- [ ] **Step 5: Message 使用语义 token 收口身份、推理、信息和结果状态，不改消息逻辑。**
- [ ] **Step 6: 运行测试、TypeScript、构建并提交 `refactor(ui): 统一功能页与聊天视觉语言`。**

### Task 6: 全站视觉验收与修正

**Files:**
- Modify: 仅修改验收发现的本轮 UI 文件
- Test: `frontend/tests/design-contract.test.mjs`

**Interfaces:**
- 不新增功能，仅修本轮视觉回归。

- [ ] **Step 1: 运行 `npm test`、TypeScript、设计契约和生产构建。**
- [ ] **Step 2: 运行 Impeccable detector，记录并修复改动目标中的新增问题。**
- [ ] **Step 3: 用真实浏览器检查 375×812、390×844、768×1024、1440×900，覆盖 chat/models/themes/system/apps/tasks/sessiondb。**
- [ ] **Step 4: 一次性修复截图检查发现的溢出、错位、低对比和触控问题。**
- [ ] **Step 5: 最多再做一轮确认截图，验证 dark/mist、reduced-motion 和键盘 focus。**
- [ ] **Step 6: 提交 `fix(ui): 完成全站响应式视觉验收`。**
