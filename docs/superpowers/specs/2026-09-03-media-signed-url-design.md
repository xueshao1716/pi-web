# pi-web 媒体短期签名 URL 设计

## 背景

pi-web 的 API、会话 SSE 和 TUI WebSocket 已使用 `Authorization: Bearer` 认证，长期访问令牌不再出现在这些连接 URL 中。但浏览器原生 `img`、`audio`、`video` 和普通下载链接无法添加 Authorization header，前端仍通过 `withFileToken()` 将长期 `pi_web_token` 追加到 `/api/ws/file` URL。

这会使 token 出现在浏览器历史、复制链接、代理访问日志、截图和第三方资源诊断信息中。服务端现有 `engine/filebox.mjs` 已具备进程内 HMAC 签名的文件 URL：链接包含受限的路径、到期时间与签名，不包含长期 token；进程重启后随机签名密钥变化，旧链接自然失效。

本轮将前端媒体和下载入口迁移到这一短期签名 URL 机制，同时保留服务端对历史 token URL 的兼容，不修改文件存储、Aieyra、Claude 正式配置、Android IME 原生逻辑或运行中的服务配置。

## 目标

- 前端不再为 `/api/ws/file` 媒体或下载链接拼接长期 token query 参数。
- 已登录客户端可通过 Bearer 认证请求一个短期签名的文件 URL。
- 签名 URL 只授权单个工作空间内的文件路径，且可过期、不可篡改、不含长期凭据。
- 历史聊天、旧接口响应和旧客户端的 `?token=` 文件链接继续由现有服务端鉴权兼容，避免立即失效。
- 已由服务端生成的合法 `exp`/`sig` 链接不重复签发。
- 所有行为先以失败测试固定，再做最小实现。

## 非目标

- 不删除服务端 `checkAuth()` 中的 token query 参数兼容分支。
- 不重构图片、音频、视频标签为 fetch/Blob URL。
- 不新增数据库、磁盘映射、常驻签名服务或新的密钥配置。
- 不改变 `GET /api/ws/file` 的文件范围、下载行为或 MIME/Range 响应。
- 不在本轮处理第三方外链媒体、data URL、blob URL 或不属于 `/api/ws/file` 的 URL。

## 方案选择

### 方案 A：Bearer 换短期签名 URL（采用）

新增一个受现有 `Authorization: Bearer` 保护的签发端点。前端将旧的相对文件 URL 发送给它，服务端验证该 URL 仅为 `/api/ws/file`、包含单个相对 `path` 参数且可通过工作空间路径守卫，然后用现有 HMAC 机制返回短期 URL。前端媒体和下载链接只使用这个短期 URL。

优点：复用已有 HMAC 和浏览器原生媒体能力；不需要把大媒体读入 JavaScript 内存；能正常支持播放、预览、下载、新窗口打开和 HTTP Range；改动集中。

缺点：短链仍可在有效期内被复制使用，且会出现在日志中，但它不包含长期 token、只绑定单一路径、可过期且服务重启后立即失效。

### 方案 B：Bearer fetch 后转换 Blob URL（不采用）

前端使用 fetch 加 Bearer，读取文件为 Blob 再赋给媒体元素。

优点：媒体 URL 中完全没有凭据或签名。

缺点：大图片、视频和音频需要在前端内存中完整读取，视频 Range、下载、另开窗口和释放生命周期复杂；不适合现有媒体与附件工作流。

### 方案 C：为媒体端点永久放宽认证（不采用）

让 `/api/ws/file` 不需要认证。

缺点：会直接公开工作空间内可猜测的资源路径，不符合当前安全模型。

## 架构与数据流

### 1. 文件签名模块

`engine/filebox.mjs` 保持为签名能力的唯一来源。

- `signedUrl(relPath, download)` 继续生成 `/api/ws/file?path=...&exp=...&sig=...`。
- 签名输入保持为原始相对路径与毫秒级到期时间，HMAC 使用进程随机密钥。
- TTL 从 24 小时调整为 15 分钟。该时间足以支持媒体加载和短时播放，显著降低复制链接泄露后的可用窗口。
- `verifySigned(req)` 保持现有验证语义。
- 新增纯函数 `fileUrlPath(url)`：只接受相对 `/api/ws/file` URL，提取并返回单个 `path` 与可选的 `download`；拒绝绝对 URL、协议相对 URL、非文件路由、缺失/空 path、重复 path、`token`、`sig`、`exp` 或未知查询参数。该函数不访问文件系统。

路径是否属于工作空间仍由 `workspace-api.mjs` 的 `wsSafePath()` 处理，避免在 filebox 中复制路径策略。

### 2. 签发 API

新增 `POST /api/ws/file-url`。

请求体：

```json
{ "url": "/api/ws/file?path=%E7%94%9F%E6%88%90%E7%89%A9%2Fimage.png" }
```

响应体：

```json
{ "url": "/api/ws/file?path=...&exp=...&sig=..." }
```

端点位于现有 API 路由表内，因此沿用全局 `checkAuth()` 的 Bearer 认证，不接受 token 写入请求 URL。处理步骤：

1. 用 `readBody()` 读取 JSON。
2. 调用 `fileUrlPath()` 解析并拒绝无效输入，返回 400。
3. 调用 `wsSafePath(relPath)` 验证路径受工作空间根目录约束；越界或无效路径返回 403。
4. 调用 `signedUrl(relPath, download)`，返回 `{ url }`。

端点不检查文件是否存在，避免给调用者额外的文件枚举信息；实际文件服务继续以 404 响应不存在文件。端点不接收任意 `exp` 或 `sig`，也不接受绝对 URL，从而不充当开放重定向或签名代理。

### 3. 前端 URL 解析与缓存

`frontend/src/api.ts` 新增异步 `signedFileUrl(url: string): Promise<string>`。

行为：

- 空值、data URL、blob URL、外站 URL、非 `/api/ws/file` URL 原样返回。
- 已有完整 `sig` 与 `exp` 的文件 URL 原样返回，不重复签发。
- 使用 `api('/api/ws/file-url', { method: 'POST', body: { url } })` 申请签名 URL；因此请求使用 Authorization header 且尊重远程 `pi_api_base`。
- 签发响应的相对 URL 用 `apiUrl()` 转为当前远程 API base 下的可用 URL。
- 使用模块级 `Map<string, Promise<string>>` 按原始文件 URL 去重并缓存 Promise，避免同一消息重新渲染时重复请求。签发失败时移除缓存项并回退为原始 URL，不追加 token。

`withFileToken()` 从前端 API 模块及所有消费者中移除；签名 URL 的唯一前端入口为 `signedFileUrl()` 与其 React hook。前端代码不得再产生 `token=` 文件 URL。

### 4. 媒体与下载消费者

新增小型 React `SignedFileUrl` hook 或等价组件级逻辑，只负责在 URL 变化时异步取得 `signedFileUrl()` 的结果，并在未取得时不发起媒体请求。

迁移范围：

- `Message.tsx` 的图片和音频附件。
- `GeneratePanel.tsx` 的生成图片预览与新窗口链接。
- `WorkshopView.tsx` 的产物下载链接。
- 通过全文搜索识别的其他 `withFileToken()` 文件资源消费者。

未获取到签名 URL 时：图片/音频不渲染真实源，下载链接保持禁用状态，避免浏览器向裸文件 URL 发送请求。签发失败时提供现有语义的低干扰失败状态，不显示 token、请求体或内部错误。

新窗口点击必须使用已签发的 URL；不得在点击处理器中再把 token 拼回 URL。

## 兼容性与安全属性

- 旧客户端的 `/api/ws/file?...&token=...` 继续被服务端认证接受，本轮不破坏它。
- 已存储的历史媒体 URL 若为裸文件 URL，将在现代前端渲染时通过新签发接口转换；若已是合法签名 URL，则直接使用。
- `download=1` 被保留在签名 URL 中并绑定到签发请求的单个文件 URL，不接受其他查询参数。
- 签名 URL 只绕过文件资源的 Bearer 检查；其后 `handleWsFile()` 仍会执行 HMAC 校验和 `wsSafePath()`。
- 签名的时效为 15 分钟，进程重启则更早失效。
- 前端不记录 token 到 URL、日志、状态、DOM 属性或错误消息中。

## 测试策略

先建立 RED，再实现 GREEN：

1. `filebox` 单元测试：有效受控文件 URL 可解析；绝对 URL、外站 URL、非文件路由、重复 path、token、已有签名或未知参数均被拒绝；生成 URL 的签名 TTL 约为 15 分钟；正常签名可验证，篡改和过期被拒绝。
2. 签发路由契约：`server.mjs` 注册 `POST /api/ws/file-url`，通过 filebox 解析和工作空间路径守卫，且不把 token 返回到响应中。
3. 前端 API 契约：存在 `signedFileUrl()`，通过 `api()` 请求签发接口并使用 `apiUrl()`；不存在把 `_token` 或 `token=` 拼到文件 URL 的逻辑。
4. 消费者契约：消息附件、生成预览和工作坊下载不再调用 `withFileToken()`，而使用签名 URL hook/组件；已签名 URL 不重复请求。
5. 回归：现有文件服务、SSE、TUI、CORS、类型检查和全量构建测试仍通过。

## 验收标准

- 新版前端源码中不存在 `withFileToken()` 向 URL 添加 `token=` 的实现或媒体消费者调用。
- 签发请求使用 Bearer header，签发响应只包含短期 `path`、`exp`、`sig` 文件 URL。
- 外站 URL、越界路径、重复参数、旧 token URL 和伪造参数不会获得签名。
- 一份裸的历史 `/api/ws/file?path=...` 媒体地址能在新版前端获得短期可加载 URL。
- 已签名 URL 不触发重复签发。
- 旧带 token 的文件 URL 仍可由服务端兼容认证。
- `npm test`、`frontend npx tsc --noEmit`、`npm run build:mobile:web`、相关 Node 语法检查和 `git diff --check` 均成功。
- 不启动或改写长期服务，不输出访问令牌或 API 密钥，不声称 Android 真机验收。

## 风险与回滚

- 浏览器媒体资源可能在签名获取完成前短暂不显示；前端以不请求裸 URL 为优先，加载完成后显示。
- 15 分钟 URL 对很长的连续媒体播放可能过短；当前项目以短音频、视频预览和下载为主。若后续发现真实长媒体播放中断，应单独测量后调整 TTL，而不是无证据回退至长期 token。
- 旧客户端继续可用 token URL，因此服务端兼容分支的清理必须在客户端升级覆盖后另立任务。
- 若出现回归，回滚此次前端使用短链的提交即可恢复旧客户端行为；签发端点和 filebox 能力是附加、无状态的，不迁移数据。
