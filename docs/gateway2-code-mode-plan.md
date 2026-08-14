# Gateway 2.0 插件化引擎 + PTC/Code Mode 沉淀计划

日期：2026-08-14
来源：学习 dsh（@deepseek-ai/dsh）后的沉淀任务，用户确认"都做"。

## 背景

dsh 的核心设计（已学完）：
- 一切皆插件：模型适配器 / 工具注册表 / 会话存储 / agent loop 均可替换卸载，无特权核心
- PTC 模式（Code Mode）：CodeRuntime 跑模型写的程序，工具暴露为 TS 异步绑定（`$tools.xxx()`），
  程序用顶层 await/return 组合多步操作，返回 `{ value, logs, error? }`

pi-web 现状：
- `server.mjs`（4675 行）单文件，`unifiedChat` = 模型适配器+工具循环雏形，`executeUnifiedTool` = 工具执行器
- 已有 registry.js（消息渲染注册表，插件思想）和 `/api/agent/events` 事件环（trajectory 沉淀）

## 任务 A：Gateway 2.0 插件化引擎

新目录 `engine/`，6 个模块：

| 文件 | 职责 |
|---|---|
| `plugin-registry.mjs` | PluginRegistry：注册/卸载/依赖解析/顺序/生命周期(mount/unmount) |
| `model-adapter.mjs` | ModelAdapter 接口 + 内置 HTTP 适配器（OpenAI 兼容） |
| `tool-registry.mjs` | ToolRegistry：工具定义(name/desc/schema/handler) + 动态注册 |
| `session-store.mjs` | SessionStore 接口 + 内存实现 + 文件实现 |
| `agent-loop.mjs` | AgentLoop：标准工具循环（复用 unifiedChat 的防循环/重试/思考提取逻辑） |
| `gateway.mjs` | Gateway 组装：PluginRegistry + 各组件 + 统一入口 |

原则：
- engine/ 模块**不依赖 server.mjs**，保持纯净（自带轻量 HTTP 客户端，Node 25 原生 fetch + 可选注入）
- server.mjs 只做**组装注入**：把 executeUnifiedTool 注入 ToolRegistry、httpJsonFetch 注入 ModelAdapter
- 现有 chat 流程不动（零回归），引擎作为新能力 + 未来替换路径

## 任务 B：PTC/Code Mode 沉淀

新目录 `code-mode/`，2 个模块：

| 文件 | 职责 |
|---|---|
| `code-runtime.mjs` | CodeRuntime：worker_threads 执行模型程序，`run({program, bindings}) → {value, logs, error?}`，超时/日志捕获/错误分类 |
| `code-mode.mjs` | Code Mode SDK：工具列表 → TS 绑定描述；`run_code` 工具（模型写程序→执行→反馈，多轮） |

安全：worker 里禁用 require/process/fs 等宿主能力，只能通过 `$tools` 绑定操作；
绑定执行走注入的 executeUnifiedTool（自带宪法 deny 红线 + 受保护路径检查）。

## API 路由（server.mjs 薄壳）

```
GET  /api/engine/status              # 引擎状态：组件实现、插件列表
POST /api/engine/plugins/register    # 动态注册插件
POST /api/engine/plugins/unregister  # 卸载插件
POST /api/engine/chat                # 走引擎的对话（agent loop + tools）
GET  /api/code/tools                 # 列出代码模式可用工具绑定
POST /api/code/run                   # 运行程序 { program } → { value, logs, error? }
POST /api/code/chat                  # 模型写程序并执行（run_code 工具循环）
```

## 前端（public/）

- index.html：菜单加「🧩 引擎」「💻 代码模式」两个视图 + panel
- public/js/panels.js：两个面板逻辑（引擎状态/插件管理 + 代码编辑器/运行/结果）
- ui.js：视图切换挂载（沿用现有 data-view + panel-* 模式）

## 验证

- `node --test tests/unit/engine.test.mjs`（plugin-registry / tool-registry / session-store / code-runtime）
- curl 调 /api/engine/status、/api/code/run
- 重启 pi-web 看前端面板
