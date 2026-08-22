# pi-web React 前端（设计系统版）— 进度存档

> ⚠️ **状态说明**：这是 pi-web 前端的「React + 液态玻璃设计系统」**实验性重写**，目前处于**未上线、备用存档**状态。
> **线上仍是 vanilla 版**（`public/index.html`，深色科技 + WebGL 等离子背景 + 12 套主题），React 版与线上完全隔离、互不影响。

---

## 一、为什么有这套工程

pi-web 原前端是 vanilla JS + CSS（无构建、直接 serve `public/`）。为了探索「nomifun 式精品质感 + 组件化开发」，启动了这套 React 工程，用 **React + Vite + UnoCSS + IconPark** 重建主界面，并自建了「液态玻璃」设计系统。

**最终结论**：vanilla 版已足够精品且更成熟（有 12 套主题/WebGL 背景/矢量图标），所以这套 React 版**没有正式替换线上**，作为**备选/灵感存档**保留。以后若想推进（换美学方向、补功能、或把它的设计系统思路移植回 vanilla），从此工程继续。

---

## 二、技术栈

| 层 | 选型 |
|---|---|
| 框架 | React 19 + Vite 8 |
| 样式 | **纯 UnoCSS**（原子类 + design token），未用组件库（曾用 Arco 已移除） |
| 图标 | `@icon-park/react` |
| Markdown | `react-markdown` + `remark-gfm` + `mermaid` |
| 状态 | React Context（`src/store.tsx`）|
| 构建 | `pnpm build` → `frontend/dist`（**不污染 `public/`**）|

---

## 三、目录结构

```
frontend/
├── vite.config.ts        # base:'./' 相对路径，产物可放任意子目录
├── uno.config.ts         # UnoCSS shortcuts + design token 映射
├── tsconfig.json
├── package.json
└── src/
    ├── main.tsx          # 入口（virtual:uno.css + styles.css）
    ├── App.tsx           # AppProvider 包裹
    ├── AppLayout.tsx     # 三栏布局 + 右上角工具胶囊
    ├── store.tsx         # 全局状态（auth/sessions/models）
    ├── api.ts            # API 契约层（全部 /api/* 端点封装 + SSE）
    ├── types.ts          # Model/Session/ChatMessage 等类型
    ├── styles.css        # 全局 token + 玻璃面板 + markdown 排版
    ├── theme/
    │   └── tokens.ts     # 设计 token 体系（色彩/间距/圆角/字体/动效/阴影）
    └── components/
        ├── Login.tsx         # 登录 + /api/models 鉴权
        ├── Sidebar.tsx       # 会话列表（分组/新建/重命名/删除）
        ├── ChatArea.tsx      # 聊天区（SSE 流式 + 思考/工具卡/markdown）
        ├── Message.tsx       # 消息气泡（玻璃化 + 工具卡 + 思考折叠）
        ├── Markdown.tsx      # markdown/mermaid 渲染
        ├── Workspace.tsx     # 工作空间面板（ws/* 文件树/预览/搜索）
        ├── ModelManager.tsx  # 模型管理（providers/增删/切换）
        └── ThemeSwitcher.tsx # 主题切换（深/浅 + 主色）
```

---

## 四、已实现功能（对接真实 API）

| 面板 | 状态 | API |
|---|---|---|
| 登录/鉴权 | ✅ | `GET /api/models` |
| 会话列表 | ✅ 分组/新建/重命名/删除 | `GET/POST /api/sessions` |
| 流式聊天 | ✅ 思考/工具卡/markdown/mermaid | `POST /api/chat` (SSE) |
| 工作空间 | ✅ 文件树/预览/搜索 | `GET /api/ws/*` |
| 模型管理 | ✅ providers/添加/删除/切换 | `GET /api/models/manage`, `POST /api/model` |
| 主题切换 | ✅ 深色 + 主色 | 本地 |

**API 契约层**在 `src/api.ts`，已封装：ModelsApi / SessionsApi / ChatApi / WsApi / KeysApi / streamSession(SSE)。

---

## 五、设计系统（液态玻璃）

`src/theme/tokens.ts` + `src/styles.css` 定义了整套设计 token：

- **色彩**：深色分层 `bg/bg1/bg2/bg3`（`#080d1a` 系）+ 主色 `#4a58fa` + 语义色 green/red/yellow + 工具图标色
- **玻璃面板**：`.glass` / `.glass-strong`（backdrop-blur + saturate）/ `.glass-hi`（高光描边）
- **光斑背景**：体 `body::before` 径向紫色光晕 + 主色 glow
- **按钮**：`.btn-grad`（蓝紫渐变 + 辉光）
- **消息气泡**：`.msg-bubble`（毛玻璃 + 高光）
- **动效**：`motion.fast/base/slow`（cubic-bezier），欢迎页 stagger 编排
- **UnoCSS shortcuts**：`btn`/`btn-primary`/`btn-ghost`/`card`/`panel`/`input-pi`/`btn-grad`

---

## 六、如何运行 / 发布

```bash
cd frontend
pnpm install          # 安装依赖（Node 25 + pnpm 11）
pnpm dev              # 开发：http://localhost:5173（/api 已代理到 8787）
pnpm build            # 构建 → frontend/dist（独立，不碰 public/）
```

**发布为备副本**（不替换线上 index.html）：

```bash
# 把 dist 产物放到 public/react/，通过 /static/react/ 访问
mkdir -p public/react/assets
cp frontend/dist/index.html public/react/
cp frontend/dist/assets/* public/react/assets/
# 访问：http://127.0.0.1:8787/static/react/index.html
```

> 注意：`vite.config.ts` 的 `base:'./'` 让产物用相对路径，所以放任意子目录都能运行；`/static/*` 会被 server.mjs 去掉前缀映射到 `public/`。

---

## 七、与 vanilla 版的关系（重要决策记录）

- **线上**：vanilla 版（`public/index.html`）—— 深色科技 + WebGL 等离子背景 + 12 套主题 + 矢量图标 + 动效。**精品方向，已够成熟**。
- **React 版**：这套工程 —— 液态玻璃设计系统 + 组件化 + UnoCSS。**未上线，仅存档**。
- **决策**：React 版虽然是组件化方向，但质感在当时**未超过 vanilla 版**，且 vanilla 更成熟、功能更全。故**未替换**，保留作备选。
- **已多次验证隔离**：`frontend/` 与 `public/react/` 均为独立未跟踪目录，不影响 `public/index.html`。

---

## 八、待办 / 灵感方向（以后可继续）

- [ ] **美学方向**：当前是液态玻璃，可换其他方向（Taste Skill 的柔和、Brutalism 等）
- [ ] **补功能**：引擎面板（`/api/engine/*`）、代码模式（`/api/code/*`）、@文件引用、斜杠命令、语音、多模型对比、多端 SSE 同步
- [ ] **移植 vanill 版美学**：把 vanilla 的 12 套主题系统、WebGL 等离子背景移植到 React
- [ ] **正式替换**：若 React 质感追上 vanilla 且功能补齐，再考虑替换 `public/index.html`（需备份回退）
- [ ] **用 frontend-design / ui-ux-pro-max 技能**做审美驱动设计（这两个技能本会话已加载）
- [ ] **接入 OpenRouter**：`@deepseek-ai/dsh-llm-pi-ai` 适配器已配好，模型含 `stealth/ox-alpha`（免费多模态）

---

## 九、相关经验（防踩坑）

- **构建绝不写 `public/`**：`vite.config.ts` 的 `outDir` 必须是独立的 `dist`，且 `emptyOutDir` 独立，否则会覆盖线上 `index.html`（曾发生一次已恢复）。
- **base 用相对路径** `'./'`：产物才能放任意子目录。
- **PowerShell 写中文文件会乱码**：改含中文的 JS/CSS 用 `edit`/`write` 工具，勿用 `Set-Content -Encoding UTF8`（曾把 workspace.js 改成 GBK 乱码）。
- **CDP 截图需注入 token**：dev 联调要在 localStorage 设 `pi_web_token`。

---

*最后更新：2026-08 · 记录 React 液态玻璃实验版进度，作为 pi-web 前端未来的备选/灵感存档。*
