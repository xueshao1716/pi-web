# pi-web 工程收口与构建一致性设计

## 背景

审计确认 pi-web 当前存在四类需要优先处理的问题：

1. React 前端已是 Web/Tauri 的主版本，但 Capacitor 仍打包 `public/` 中的旧 vanilla 产物。
2. `SessionDb.tsx` 和 `TuiTerminal.tsx` 绕过统一 API 地址配置，在本地壳连接远程服务时会访问错误地址。
3. 服务默认监听 `0.0.0.0`，CORS 无条件反射任意 Origin，且部分流式/资源鉴权使用 URL token，远程暴露面偏大。
4. 前端构建、产物同步和 Android 构建之间缺少单一可复现入口，README 与真实默认配置漂移。

本轮只处理上述问题及其必要测试，不修改 Aieyra 网关、Claude 正式配置、微信迁移、Android IME 原生逻辑或大规模业务重构。

## 目标

- 让 Web、Tauri Android、Capacitor Android 使用同一份 React 构建产物。
- 让所有前端 API、SSE、WebSocket 请求尊重 `pi_api_base`。
- 在不破坏已支持的局域网手机连接的前提下，提供显式可控的监听和 CORS 配置。
- 将 Mermaid 渲染收紧到安全模式，并保留现有图表能力。
- 提供单一的构建/同步命令链，确保新环境可按文档重建前端与 Android 包。
- 用单元/契约测试锁定这些行为。

## 非目标

- 不注册 Windows 常驻服务。
- 不切换 Claude Code 正式默认通道。
- 不升级 Claude Code。
- 不清理历史 APK、日志或其他用户文件。
- 不重写 `server.mjs` 或拆分大型前端组件。
- 不移除 Capacitor 或 Tauri 壳；本轮先统一它们的资源来源。

## 方案

### 1. 单一前端产物源

`frontend/` 是唯一前端源码和构建入口，`frontend/dist/` 是唯一构建产物源。

新增一个明确的同步脚本，将 `frontend/dist/` 同步到：

- `app/dist/`：Tauri 的 `frontendDist` 入口
- `public/`：现有服务端静态目录及 Capacitor 的 `webDir`

同步使用 Node 内置 `fs.cp`/等价跨平台实现，不依赖 Unix `cp`、PowerShell 或额外 npm 包。脚本必须先清理目标目录中的旧前端资源，再复制完整产物，避免残留旧 hash 资源。

根目录提供组合脚本：

```text
npm run build:frontend
npm run sync:frontend
npm run build:mobile:web
```

其中 `build:mobile:web` 只负责构建并同步 Web 资源，不自动触发耗时 Android 编译；Tauri/Capacitor 的 Android 构建命令在 README 中显式写出，避免长命令隐藏副作用。

Capacitor 配置改为 `webDir: 'frontend/dist'`，同时同步脚本仍更新 `public/`，以兼容服务端静态部署和现有非 Capacitor 使用方式。Tauri 继续使用 `app/dist`，由同步脚本保证内容一致。

### 2. 统一 URL 解析

在 `frontend/src/api.ts` 增加可测试的地址函数：

- `getApiBase(): string`：返回已规范化的 `_apiBase`。
- `apiUrl(path: string): string`：拼接 API base 和路径，不产生双斜杠。
- `webSocketUrl(path: string): string`：根据 API base 或当前页面协议生成 `ws:`/`wss:` 地址，并保留远程 host/port。

`SessionDb.tsx` 的数据库请求改用统一 `api()` 封装；`TuiTerminal.tsx` 改用 `webSocketUrl('/ws/tui?...')`。token 仍只从现有运行时鉴权状态读取，不新增凭据存储，不把 token 写入代码。

由于浏览器 `EventSource` 不能设置 Authorization header，本轮不强行重写现有会话 SSE；URL token 作为兼容性债务保留，并在安全章节和测试中明确边界。文件资源签名 URL 的现有 `sig` 优先逻辑保持不变。

### 3. 服务端网络与 CORS 收口

配置新增显式开关：

- `PI_WEB_HOST` 仍可覆盖监听地址。
- 默认改为 `127.0.0.1`，恢复最小暴露面。
- `PI_WEB_LAN=1` 时默认监听 `0.0.0.0`，用于用户明确开启手机局域网连接的场景。
- `PI_WEB_CORS_ORIGINS` 使用逗号分隔白名单；未配置时允许同源请求及已知本地壳 origin（`tauri://localhost`、`http://tauri.localhost`、`capacitor://localhost`、`http://localhost`），不反射任意 Origin。

当请求 Origin 在白名单中时返回精确的 `Access-Control-Allow-Origin` 并设置 `Vary: Origin`；不在白名单时不返回允许跨域头。OPTIONS 仍返回 204，但只携带白名单允许的 CORS 响应头。鉴权逻辑保持不变：CORS 不是鉴权机制。

README 将说明：局域网部署必须显式设置 `PI_WEB_LAN=1`，并应配合防火墙和 token 使用。

### 4. Mermaid 安全模式

`Markdown.tsx` 的 Mermaid 初始化改用严格安全级别（`strict`），继续由 Mermaid 生成 SVG 后写入已有专用容器。新增 Mermaid 输入长度上限，超限时显示可读降级提示或不渲染，不改变普通 Markdown 和代码高亮行为。

本轮不进行全面 Markdown 渲染器替换；以安全配置、长度限制和契约测试完成低风险收口。

### 5. 文档和可追溯性

README 更新以下事实：

- React `frontend/` 是唯一前端源码。
- Web/Tauri/Capacitor 的资源同步关系。
- 默认模型为当前 `config.mjs` 的真实值，不写任何密钥。
- 默认监听为本机回环；局域网模式的显式开关。
- 前端构建、同步和 Android 构建命令。
- APK 架构命名约定：单架构标注 `arm64`/`armeabi-v7a`/`x86`/`x86_64`，四 ABI 才标注 `universal`。

## 测试策略

先按 TDD 增加失败测试，再实现：

1. URL 解析测试：配置远程 API base 时 API、数据库请求和 TUI WS 不再使用当前壳 origin；同源模式保持现有结果。
2. 构建同步契约：同步后 `public/index.html`、`app/dist/index.html`、`frontend/dist/index.html` 的入口资源一致，旧 hash 资源不会残留。
3. 网络配置测试：默认 host 为回环；`PI_WEB_LAN=1` 才得到全网卡默认值；CORS 对白名单 origin 精确放行并拒绝未知 origin。
4. Mermaid 契约：使用 `strict`，超长 Mermaid 内容不进入渲染流程。
5. 全量回归：`npm test`、`frontend npx tsc --noEmit`、`frontend npm run build`、`node --check`、`git diff --check`。

所有测试必须不读取或输出 API 密钥，不启动长期后台服务。真实 Android 真机安装验收仍属于设备缺失导致的后续事项，不在本轮伪称完成。

## 风险与回滚

- 统一 `public/` 可能改变现有旧 vanilla 入口；同步前保留 Git 工作区既有未提交改动，不覆盖用户已有修改，必要时先报告冲突。
- 默认监听改回回环可能让依赖局域网直连的用户暂时无法连接；通过 `PI_WEB_LAN=1` 显式恢复，不改变公网反向代理到回环的用法。
- 严格 Mermaid 可能拒绝少量带 HTML/交互的旧图表；失败时普通 Markdown 仍可显示，且可通过后续白名单化增强，不回退到 `loose`。
- 本轮不处理 URL token 的兼容性债务，以免引入一次性大范围 SSE/媒体加载重构；后续可单独设计短期签名和 fetch 流方案。

## 验收标准

- 三个前端资源目录的入口 hash 和关键资源集合一致。
- 远程 API base 场景下，SessionDb 和 TUI 不再请求 `localhost`/当前壳 origin。
- 未设置 LAN 开关时配置默认监听 `127.0.0.1`；设置后才默认监听 `0.0.0.0`。
- 未知 Origin 不获得 `Access-Control-Allow-Origin`；允许 Origin 获得精确值和 `Vary: Origin`。
- Mermaid 使用 `strict`，超长图表不会渲染。
- 测试、类型检查、生产构建和语法检查全部通过。
- 不修改正式 Claude 配置、不暴露密钥、不留下临时网关或其他后台进程。
