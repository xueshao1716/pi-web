# server.mjs 多模块重构实施计划（2026-08-17）

> **For agentic workers:** REQUIRED SUB-SKILL: 本计划在发起会话内联执行（executing-plans），任务用 checkbox 追踪。
> 前置分析：`docs/server-refactor-analysis.md`（2026-08-17 20:22 完成，规模/区块/性能点/红线全清单）。

**Goal:** 把 5643 行单文件 server.mjs 拆成分层多模块架构，为每个新模块编写 node:test 单元测试，并落地确定性性能优化（静态缓存/ETag/IO 缓存）。

**Architecture:** 目标为「瘦身 server.mjs（路由+编排+启动）+ lib/ 独立模块」。每模块单一职责，纯函数优先（依赖注入 modelList/state 等，不引用 server 顶层变量），行为零变更（只搬不移）。

**Tech Stack:** Node.js ESM（type: module）、node:test 内置测试器、零外部依赖（npm i 不进 package.json）。

## Global Constraints

- 零外部依赖：只用 node:test / node 内置模块
- 改 server.mjs 前先备份（`.bak-refactor-YYYYMMDD-HHmm` 品牌化命名）
- 行为零变更：搬运不改业务逻辑；跨模块状态用参数注入，不隐式引用 server 顶层变量
- 每任务后：`node --check src` + 全量回归（现有 42 测试）+ `curl http://127.0.0.1:8787/api/health` 冒烟
- 每任务独立 commit（双推：git push origin main，origin 含 GitHub+Gitee 双 pushurl）
- 服务在线：watchdog 30s 自愈，切换期间掉线可控

---

## 目标模块地图

```
server.mjs                路由 + 编排 + 会话层 + 启动（远期瘦身目标 ~2500 行）
lib/static.mjs            静态资源服务：内存缓存 + ETag 304 + 指纹强缓存（?v= → immutable）
lib/messages.mjs          消息提取纯函数：extractMessages/Text/Images/Files + scanRecentArtifacts
lib/router.mjs            模型路由纯函数（2026-08-17 Cursor Router）：classify/route/isAuto/modelCapabilities
lib/convert.mjs           docx/xlsx→markdown：python 脚本模板 + execFile 执行器
lib/fsjson.mjs            同步 JSON IO + mtime 内存缓存（热路径降阻塞）
tests/unit/*.test.mjs     每模块对应单测（node --test，零依赖）
```

## 后续批次路线图（本轮不落地，下一会话按需推进）

- Task 6: `lib/sessionio.mjs` —— scanSessionFiles/parseSessionFile/readEntriesFromFile/slimSessionImages/compactSession
- Task 7: `lib/bus.mjs` —— sessionBus/agentEventRing/taskProgress 集中状态 + SSE 总线
- Task 8: `lib/ws.mjs` —— findWorkspaceFiles/saveArtifact/handleWs* 工作空间文件 API
- Task 9: `lib/chat.mjs` —— handleChat SSE 主路径（629 行，依赖最多，最后拆）

---

### Task 1: lib/static.mjs —— 静态资源缓存 + ETag

**Files:**
- Create: `lib/static.mjs`
- Modify: `server.mjs`:2189-2218（handleStatic 替换实现为调用 lib 派生）;`server.mjs` 顶部 + import
- Test: `tests/unit/static.test.mjs`

**Interfaces:**
- Consumes: `PUBLIC_DIR`（路径字符串）、`MIME` 表、`path`/`fs`
- Produces:
  - `createStaticServer({ publicDir, mime, logger? })` → `{ handle(req,res) }`
  - `handle` 返回语义：200（含 ETag + Cache-Control）、304（If-None-Match 命中）、403（穿越）、404

**实现要点：**
- 内存缓存 Map<absPath, {data, mtimeMs, etag, mime}>：mtime 未变则复用 Buffer，避免每请求 readFile
- ETag = `"W/\"" + size + "-" + mtimeMs + "\""`（弱校验，Last-Modified 兼容）
- `If-None-Match` 命中 → 304 不带 body
- 带 `?v=` 或 `?t=` 指纹参数的静态资源 → `Cache-Control: public, max-age=31536000, immutable`（不变更 hash 不失效）
- 无指纹参数 → `no-cache` + ETag（validate 用）
- service worker sw.js：仅 `no-cache` + `Service-Worker-Allowed: /`（不可强缓存）
- 保留路径穿越防护（file.startsWith(PUBLIC_DIR)）

- [ ] **Step 1: 写失败测试** `tests/unit/static.test.mjs`（用临时目录造文件，node:test mock http req/res）

- [ ] **Step 2: 跑测试确认红** `node --test tests/unit/static.test.mjs` → FAIL（模块不存在）

- [ ] **Step 3: 实现 lib/static.mjs**（createStaticServer + 缓存 + ETag + 304 + 指纹强缓存）

- [ ] **Step 4: 接入 server.mjs**：备份 → import → handleStatic 改为 `staticServer.handle(req,res)` 一行 → `node --check server.mjs` → 重启冒烟（curl -I / 看 ETag/Cache-Control）→ 旧 42 测试仍绿

- [ ] **Step 5: Commit** `feat: 静态资源缓存+ETag+指纹强缓存（server 重构 Task1）`

---

### Task 2: lib/messages.mjs —— 消息提取纯函数

**Files:**
- Create: `lib/messages.mjs`
- Modify: `server.mjs`:872-1034（extractMessages/extractText/extractImages/extractFiles/extractMessageFiles/extractMessageImages/scanRecentArtifacts 移除，改为 import）
- Test: `tests/unit/messages.test.mjs`

**Interfaces:**
- Consumes: `fs`/`path`、`SCAN_EXCLUDE`（正则，构造时传入）、`CONFIG.cwd`（scanRecentArtifacts 用，参数注入 `{cwd, scanExclude}`）
- Produces（签名与现实现完全一致）:
  - `extractMessages(entries, leafId?)` → Array<{role,text,files,images,tools,think,ts,id}>
  - `extractText(content)` / `extractImages(content)`（>2.5MB 省略）/ `extractFiles(content)`
  - `extractMessageFiles(sm, baselineLines=0)` / `extractMessageImages(sm)`（依赖 readEntriesFromFile 回调注入）
  - `scanRecentArtifacts({withinMs=120000,max=10,cwd,scanExclude})` → Array

- [ ] **Step 1: 写失败测试**（构造 entries 样例：toolResult 收集、leafId 回溯、thinking 拼接、图片限额、artifact 时间窗/优先级/同名校验）

- [ ] **Step 2: 跑测试确认红** → FAIL（模块不存在）

- [ ] **Step 3: 实现 lib/messages.mjs**（原样搬运 + 依赖注入）

- [ ] **Step 4: 接入 server.mjs**：备份 → 删除原函数 → import + 调用点改传参 → `node --check` → 冒烟（重启后会话消息加载正常）→ 42 测试绿

- [ ] **Step 5: Commit** `feat: 消息提取独立模块+单测（server 重构 Task2）`

---

### Task 3: lib/router.mjs —— 模型路由纯函数

**Files:**
- Create: `lib/router.mjs`
- Modify: `server.mjs`:1103-1163（Cursor Router 区块：isAutoModel/classifyTaskComplexity/routeForAuto 移除，改为 import）；`modelCapabilities` 1224-1231 同步迁出
- Test: `tests/unit/router.test.mjs`

**Interfaces:**
- Consumes: `modelList`/`defaultModel`/`CONFIG` 由参数传入（保持纯函数，不引用 server 变量）
- Produces:
  - `classifyTaskComplexity(text)` → `{level:'complex'|'simple', score, reasons[]}`（语义与现实现完全一致）
  - `routeForAuto(text, {modelList, defaultModel, config})` → `{model, level, score, reasons, auto}`
  - `isAutoModel(m)` → boolean
  - `modelCapabilities(id)` → `{chat,image,video,tts,asr}`

- [ ] **Step 1: 写失败测试**（分类边界：长任务/重构/问候/短消息/大段代码块；路由：复杂→pro、简单→flash、显式 CONFIG.model 优先、PI_AUTO_ROUTE=0、能力画像正则）

- [ ] **Step 2: 跑测试确认红** → FAIL

- [ ] **Step 3: 实现 lib/router.mjs**（原样搬运 classify/route/isAuto/modelCapabilities + ROUTER_ROUTER 常量）

- [ ] **Step 4: 接入 server.mjs**：备份 → import → 调用点改传参（`routeForAuto(text, {modelList, defaultModel, CONFIG})`）→ `node --check` → 冒烟（/api/models 的 autoDefault 字段不变）→ 42 测试绿

- [ ] **Step 5: Commit** `feat: 模型路由独立模块+单测（server 重构 Task3）`

---

### Task 4: lib/convert.mjs —— 格式转换模块

**Files:**
- Create: `lib/convert.mjs`
- Modify: `server.mjs`:2651-2700（handleWsConvert，改为薄壳调用）
- Test: `tests/unit/convert.test.mjs`

**Interfaces:**
- Consumes: `execFile`（child_process）、`wsSafePath` 回调注入（server 侧保留路径校验）
- Produces:
  - `docxScript()` / `xlsxScript()` —— 返回与现实现逐字节一致的 python 脚本字符串
  - `runConvert({ext, filePath, execFileImpl?})` → Promise<string>（python -c + 60s timeout；返回 markdown 文本）
  - `SUPPORTED_EXT` = ['.docx', '.xlsx']

- [ ] **Step 1: 写失败测试**（docxScript 含 `Document(`/`heading` 关键词且无未闭合；xlsxScript 含 `openpyxl`/`iter_rows`；runConvert 用 fake execFile 验证参数 `["-c", script, tmp]` + timeout=60000；不支持的扩展名 → 抛/返回错误标记）

- [ ] **Step 2: 跑测试确认红** → FAIL

- [ ] **Step 3: 实现 lib/convert.mjs**

- [ ] **Step 4: 接入 server.mjs**：备份 → handleWsConvert 改用 runConvert → `node --check` → 冒烟（真机 /api/ws/convert 传 docx 验证一次）→ 42 测试绿

- [ ] **Step 5: Commit** `feat: 格式转换独立模块+单测（server 重构 Task4）`

---

### Task 5: lib/fsjson.mjs —— 同步 JSON IO + mtime 缓存

**Files:**
- Create: `lib/fsjson.mjs`
- Modify: `server.mjs`:1164-1165（readJsonFile/writeJsonFile 替换为 import 版）
- Test: `tests/unit/fsjson.test.mjs`

**Interfaces:**
- Produces:
  - `createJsonStore({maxEntries=256})` → `{read(p), write(p,obj), invalidate(p), stats()}`
  - `read(p)`：首次读入内存缓存；mtime 未变命中缓存（同一引用）；mtime 变 → 重读；解析失败 → 返回 {} 且不进缓存
  - `write(p,obj)`：写盘 + 更新缓存
  - stats() 返回 `{hits, misses, entries}`（单测断言缓存生效用）

- [ ] **Step 1: 写失败测试**（首读 miss→hits、mtime 不变命中、改盘后 mtime 变化重读、write 后立即命中、坏 JSON 返回 {} 不缓存、invalidate 清条目）

- [ ] **Step 2: 跑测试确认红** → FAIL

- [ ] **Step 3: 实现 lib/fsjson.mjs**（fs.statSync + fs.readFileSync + fs.mkdirSync/writeFileSync；缓存键=绝对路径）

- [ ] **Step 4: 接入 server.mjs**：备份 → 顶部实例化 `const jsonStore = createJsonStore()` → `readJsonFile`/`writeJsonFile` 改为薄壳转发 → 找到热路径调用点（scanSessionFiles 缓存、MODELS_PATH/AUTH_PATH 读取）补 invalidate → `node --check` → 冒烟 → 42 测试 + 新增测试全绿

- [ ] **Step 5: Commit** `feat: JSON IO 内存缓存（server 重构 Task5）`

---

## 收尾（Task 6 之后统一做）

- [ ] 全量回归：`npm test` 全绿（现有 42 + 新增全部）
- [ ] 真机冒烟：`curl -s http://127.0.0.1:8787/` 200；`curl -s http://127.0.0.1:8787/api/models` autoDefault 正常；重启一次确认 watchdog 拉起无报错
- [ ] 更新 `docs/server-refactor-analysis.md` 状态：标注已完成模块，更新剩余路线图
- [ ] 双推：`git push origin main`（GitHub+Gitee）
- [ ] 沉淀：经验库条目（server 重构方法论：纯函数提取+依赖注入+每模块单测；node:test 零依赖单测模式）

## Self-Review

- **Spec 覆盖**：多模块方案 → 目标模块地图 + 本轮 Task1-5 + 后续路线图 ✓；单元测试 → 每 Task 独立测试文件 ✓；性能优化 → Task1（静态缓存/ETag/指纹）+ Task5（IO 缓存），分析文档其余点（148 处同步 fs、动态 import 提升）列入后续批次 ✓；跨模块分析 → docs/server-refactor-analysis.md 已完成 ✓
- **占位符扫描**：无 TBD/TODO；代码任务均含接口契约与实现要点
- **类型一致性**：Task4 `runConvert({ext,filePath,execFileImpl})` 与 server 调用点约定一致；Task2 scanRecentArtifacts 参数化签名与 server 调用点对应