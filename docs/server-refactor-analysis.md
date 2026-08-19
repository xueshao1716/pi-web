# server.mjs 重构 —— 代码库分析笔记（2026-08-17）

> 用途：重构前的全景分析。设计定稿后作为 spec 依据，实施时按模块对照。
> 状态：分析完成，待用户确认设计方向。

## 一、现状规模

| 指标 | 值 |
|---|---|
| server.mjs | 5643 行 / 305,527 字节 |
| 顶层函数 | ~120 个（handle* 路由 60+） |
| 同步 fs 调用 | 148 处（readFileSync/writeFileSync/readdirSync/statSync/existsSync…） |
| 已有独立模块 | config / memory / emotion / workshop / filebox / sanitize / browser / search-web / memory-sync / setup |
| 已有 engine 模块（8） | gateway / agent-loop / model-adapter / plugin-registry / session-store / time-engine / tool-registry / tool-scheduler |
| 已有 code-mode 模块（3） | code-mode / code-runtime / code-worker |
| 现有单测 | tests/unit/ 6 文件 22 个（node --test，零外部依赖） |
| 测试覆盖 | 仅 emotion/engine 等独立模块；**server.mjs 本体 0 测试**（单文件加载即起服务，无法 import） |

## 二、server.mjs 内部区块（按行号）

| 区块 | 行号 | 规模 | 职责 |
|---|---|---|---|
| 启动/初始化 | 1-108 | ~110 | SDK 加载、modelRuntime、auth 注入、模型白名单 |
| 会话层 | 109-680 | ~570 | scan/parse/create/open/compact/delete session、ensureAgent |
| 记忆层 | 168-445（交织上区） | ~280 | loadMemory/Index/Experience、GEMINI.md 上下文规则、jitCache |
| 工具初始化 | 687-830 | ~145 | initSearchTool / initShareTool / createSessionAgent |
| 消息提取 | 872-1035 | ~165 | extractMessages/Images/Files、scanRecentArtifacts |
| 模型路由 | 1112-1220 | ~110 | classifyTaskComplexity / routeForAuto / modelCapabilities |
| 媒体生成 | 1224-1607 | ~380 | generateTTS / generateImage / handleImage / handleImageWithSave |
| 模型管理 | 1608-2025 | ~420 | resolveAuth / refreshModelList / probe / discover / keys / models / policies |
| 搜索/Git | 2026-2077 | ~50 | handleSearch / runGit / status / diff |
| SSE 总线 | 2085-2177 | ~90 | sessionBus / busPush / handleSessionStream / createSseWriter |
| 静态资源 | 2178-2235 | ~60 | handleStatic / MIME / json |
| 模型切换 | 2236-2303 | ~65 | handleSwitchModel / syncContextAfterSwitch |
| 工作空间文件 | 2304-2650 | ~350 | findWorkspaceFiles / saveArtifact / handleWs* |
| **格式转换** | **2651-3301** | **651** | **handleWsConvert：docx/xlsx/pptx → python 字符串内嵌** |
| 通知/更新/维修/设计器/思考/媒体 | 3302-3920 | ~620 | 多家路由 + directChat + unifiedChat |
| 事件环/任务进度 | 3921-3962 | ~40 | agentEventRing / taskProgress |
| **核心对话管线** | **3963-4591** | **629** | **handleChat：SSE 流式主路径** |
| 消息/统计/压缩/技能/导出/分享/refine | 4592-5452 | ~860 | 聚合十余个 handler |
| 路由与启动 | 5453-5643 | ~190 | API_ROUTES 表（60+ 路由）+ http.createServer + 鉴权 + listen |

**两大巨型函数**：handleWsConvert（651 行，内嵌 4 种 python 转换脚本）、handleChat（629 行，SSE 对话主路径）。

## 三、全局可变状态（拆分时需要集中或注入的）

- activeSessions Map / pushedArtifacts Map（会话运行时状态）
- sessionBus Map（SSE 事件总线）/ agentEventRing / taskProgress Map（任务快照）
- modelList / modelRuntime（模型运行时与列表）
- timeEngine / codeRuntime / codeMode / gateway / engineInstance
- sessionListCache / jitCache（缓存）
- SESSIONS_DIR / AUTH_PATH / MODELS_PATH（路径常量）

## 四、性能观察（确定性收益点）

1. **静态资源**：handleStatic 每次请求全量 readFile + `Cache-Control: no-cache`（无强缓存/ETag）→ 热点文件（index.html / theme.js / js 包）应加内存缓存 + ETag + 强缓存策略
2. **148 处同步 fs**：handler 内 readFileSync/writeFileSync/statSync/readdirSync 阻塞事件循环；热路径（会话扫描、统计、保存）可转异步或加缓存
3. `await import()` 位于 handler hot path：initSearchTool 每次 createSession 执行 createRequire+import；filebox 动态 import 每次 ws 请求执行 → 应提升为模块级静态 import（副作用：改这些 import 需保持零外部依赖，filebox 是本地无副作用模块，可静态导入）
4. scanSessionFiles 全目录扫描：调用频率需确认，若每次 createSession 都扫 → 加 mtime 失效缓存（sessionListCache 已有雏形）
5. 已有缓存成果保留：jitCache（上下文规则）、sessionListCache、KEEP_MODELS 白名单

## 五、重构目标（用户要求）

1. 多模块架构（拆分 server.mjs）
2. 单元测试（server.mjs 本体目前 0 覆盖）
3. 性能优化（上述确定性收益点）
4. 跨模块分析（本文档 + 每模块 Interface 契约）

## 六、红线与约束

- 改 server.mjs 前先备份（守规矩：.bak 品牌化命名）
- 零外部依赖（node:test 内置；npm i 不进 package.json —— 全局安装依赖）
- 行为零变更：高层"只搬不移"，跨模块状态用集中 state 对象注入
- 服务在线：watchdog 30s 自愈，切换重启掉线时间可控
- 改完必须全量回归：现有 22 测试 + 每个新模块单测 + 真机聊天冒烟