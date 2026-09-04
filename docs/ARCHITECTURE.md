# 小语 · 全平台个人 AI 伙伴 —— 架构蓝图

> 一句话：**一个大脑，全端皮肤。** 底层引擎、中层服务、顶层客户端，人格与记忆只存一份，
> Windows / Linux / Android / Web / 手机页面全部指向同一个「小语」。

## 1. 三层架构

```
┌─────────────────────────────────────────────────────┐
│ 顶层 · 客户端（全是薄壳，只管「长得好 + 连得上」）      │
│  Windows(Tauri)  Linux(Tauri)  Android(Tauri 2)     │
│  Web浏览器  PWA  手机页面(响应式)                      │
├─────────────────────────────────────────────────────┤
│ 中层 · pi-web 服务端（本仓库主体）                     │
│  server.mjs (HTTP+SSE, 鉴权, 限速, 路由)             │
│  engine/ (会话/模型路由/工具/安全/记忆/技能/媒体…)     │
│  frontend/ (React SPA —— 所有客户端共用的唯一界面)    │
├─────────────────────────────────────────────────────┤
│ 底层 · 引擎                                          │
│  pi SDK（会话/agent 管线）   dsh（UI 协议/任务/密钥）  │
└─────────────────────────────────────────────────────┘
```

**铁律：**
1. 客户端零业务逻辑——不解析模型流、不管理会话，只做窗口/托盘/生命周期/推送。
2. 前端只有一份（React SPA）——所有壳都包它，禁止任何客户端分叉 UI。
3. 人格（小语）、记忆、会话、密钥只存服务端一份——换设备登录即「同一个小语」。
4. 服务端永驻（watchdog 守护），客户端随便开关，互不拖拽生命周期。

## 2. 仓库目录规范（monorepo）

```
pi-companion/
├── server.mjs           # 服务端入口（现布局保留，迁移动画后进 server/）
├── engine/              # 服务端全部能力模块（现有）
├── frontend/            # React SPA（现有）→ 所有客户端的共用界面
├── app/                 # Tauri 2 壳（一套代码出 Windows/Linux/Android；含移动端连接页）
├── docs/                # 架构/部署/规范文档（本目录）
├── scripts/             # dev / build / release 脚本
├── tests/               # 单元 + e2e（node --test）
├── .github/workflows/   # CI：测试 + 多平台产物
└── config.mjs           # 唯一配置入口（env 优先，默认值可移植）
```

## 3. 文件/代码规范

**服务端（engine/）**
- kebab-case `.mjs`；一模块一职责；依赖一律 `initXxx(deps)` / `createXxx(deps)` 注入，
  禁止模块顶层读环境或写死绝对路径。
- 硬编码路径零容忍：一切目录从 `CONFIG.cwd` / `__dirname` / `os.tmpdir()` 派生。
- 凭据零入库：auth/token/.env 只在机器本地，`.gitignore` 兜底。

**前端（frontend/src/）**
- 组件 PascalCase、hooks `useXxx`、全局样式走 `--pi-*` token（主题系统已就位）。
- 任何新界面必须同时过桌面（≥1280px）与手机（390px）两档验收截图。

**通用**
- 中文注释、变更必带 commit message、先测后称完成。
- 平台功能对照表（docs/FEATURE-MATRIX.md）随功能更新，缺席要写明原因。

## 4. 客户端矩阵与生命周期

| 客户端 | 技术 | 服务端生命周期 | 分发 |
|---|---|---|---|
| Web | SPA 直连 | 无关（服务常驻） | 浏览器/tunnel |
| 手机页面 | 同 SPA 响应式 | 无关 | 同上 |
| PWA | manifest + SW | 无关 | 「安装应用」 |
| Windows | Tauri 2 壳 | 探测 8787，未起则拉起 watchdog；关窗→托盘 | CI 产物 exe/msi |
| Linux | Tauri 2 壳 | 同上 | AppImage/deb |
| Android | Tauri 2 壳 | 连局域网/隧道地址，只做客户端 | APK |

## 5. 里程碑

- **M1 规范化（地基）**：路径外部化（11 处硬编码）→ 本目录结构成型 → PWA manifest → README 重写
- **M2 Windows**：Tauri 壳 + 托盘 + 自启 + 服务探测
- **M3 Android + 手机页**：Tauri 2 APK + 响应式完善
- **M4 Linux + CI**：GitHub Actions 多平台产物 + 自动发版
- **M5 功能矩阵补全**：通知/快捷键/语音/离线体验按平台补齐

## 6. 现状与差距（2026-09-04）

✅ 已就位：服务端能力全量（会话/多模型路由/工具/安全三层防线/记忆/技能/媒体/进化/回忆）、
React 前端（含水墨/竹影等主题）、首次启动向导、PWA manifest、移动端响应式、
工作台看板、watchdog 自愈、tunnel、双根白名单 + 凭据防护。

⚠️ 仍待：GitHub Actions CI 尚未落地；`server.mjs` 入口仍然偏长；部分脚本/文档仍有本机路径示例；
图像/小说作品的画布化按产品约定尚未开始。

M1 已完成部分：PWA manifest、首次向导已有；硬编码路径还在收口（模板/小说/自愈已可配置）。
M4（Linux + CI 发版）未开始。
