# pi-web 工程收口与构建一致性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 pi-web 三端前端资源与远程地址行为，并收紧网络、Mermaid 和构建文档，使修复可测试、可复现、可回滚。

**Architecture:** `frontend/` 是唯一前端源码，`frontend/dist/` 是唯一构建产物源；Node 同步脚本把产物复制到服务端 `public/` 和 Tauri `app/dist/`，Capacitor 直接指向 `frontend/dist/`。前端所有 HTTP/WS 地址通过 `api.ts` 的小型 URL 层生成，服务端通过环境变量控制监听和显式 CORS 白名单。

**Tech Stack:** Node.js ESM、Node test runner、React 19、TypeScript、Vite、Capacitor 8、Tauri 2、Mermaid。

## Global Constraints

- 不读取、输出或硬编码任何 API 密钥、访问令牌或凭据。
- 不修改正式 Claude 配置、Aieyra 配置、微信迁移数据或 Android IME 原生逻辑。
- 不注册常驻服务、不启动长期后台进程；测试服务必须在测试结束后关闭。
- 保留现有工作区未提交修改，不覆盖与本计划无关的产物或源文件。
- 默认监听 `127.0.0.1`；只有 `PI_WEB_LAN=1` 才启用默认 `0.0.0.0`。
- `frontend/dist/` 是唯一前端构建源；`public/` 和 `app/dist/` 由同步脚本更新。
- Mermaid 使用 `securityLevel: 'strict'`；超长 Mermaid 输入不得进入渲染流程。
- 每个行为修改必须先写失败测试并观察 RED，再写最小实现并观察 GREEN。
- 结束前执行 `npm test`、`frontend npx tsc --noEmit`、`frontend npm run build`、相关 `node --check` 和 `git diff --check`。

## 文件结构

- Create: `scripts/sync-frontend.mjs` — 清理并同步 `frontend/dist` 到 `public`、`app/dist`。
- Modify: `package.json` — 增加前端构建、同步和组合脚本。
- Modify: `capacitor.config.ts` — 使用唯一 React 构建产物目录。
- Modify: `frontend/src/api.ts` — 暴露 API base 和 HTTP/WS URL 解析函数。
- Modify: `frontend/src/pages/SessionDb.tsx` — 使用统一 API 封装。
- Modify: `frontend/src/components/TuiTerminal.tsx` — 使用统一 WS 地址。
- Modify: `config.mjs` — 增加显式 LAN 开关并恢复最小默认监听面。
- Modify: `server.mjs` — 使用显式 CORS origin 白名单，并为预检响应设置正确头部。
- Modify: `frontend/src/components/Markdown.tsx` — Mermaid 严格安全级别和输入长度限制。
- Modify: `README.md` — 更新真实默认配置、构建链、壳关系和 APK ABI 命名。
- Create/Modify: `tests/unit/pi-web-hardening.test.mjs` — URL、同步、配置、CORS、Mermaid 契约测试。

---

### Task 1: 统一前端资源构建与同步

**Files:**
- Create: `scripts/sync-frontend.mjs`
- Modify: `package.json`
- Modify: `capacitor.config.ts`
- Test: `tests/unit/pi-web-hardening.test.mjs`

**Interfaces:**
- Produces executable `node scripts/sync-frontend.mjs`.
- `scripts/sync-frontend.mjs` exports `syncFrontend({ sourceDir, targets })` for unit testing and, when run directly, uses `frontend/dist`, `public`, `app/dist` relative to repository root.
- `package.json` scripts become:
  - `build:frontend`: `npm --prefix frontend run build`
  - `sync:frontend`: `node scripts/sync-frontend.mjs`
  - `build:mobile:web`: `npm run build:frontend && npm run sync:frontend`

- [ ] **Step 1: Write the failing sync contract test**

Add a test that creates temporary source and target directories, puts an old `index.html`/old hashed asset in both targets, calls `syncFrontend`, and asserts both targets exactly mirror the source and do not retain the old asset. Add a config assertion that `capacitor.config.ts` uses `webDir: 'frontend/dist'`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/unit/pi-web-hardening.test.mjs --test-name-pattern "frontend sync"
```

Expected: FAIL because `scripts/sync-frontend.mjs` does not exist and Capacitor still points at `public`.

- [ ] **Step 3: Implement the minimal synchronizer**

Use Node built-ins only. Resolve paths from the caller or repository root, reject a missing source directory, remove each target directory contents without removing the target directory itself, then copy the complete source tree recursively. Export `syncFrontend` and guard the CLI entry with `import.meta.url`.

Update root scripts and Capacitor config. Do not change Tauri config; it already points to `app/dist`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/unit/pi-web-hardening.test.mjs --test-name-pattern "frontend sync"
```

Expected: PASS.

- [ ] **Step 5: Build and sync real assets**

Run:

```bash
npm run build:mobile:web
```

Expected: React build succeeds and `public/index.html` and `app/dist/index.html` reference the same hashed entry files as `frontend/dist/index.html`.

- [ ] **Step 6: Commit**

```bash
git add scripts/sync-frontend.mjs package.json capacitor.config.ts tests/unit/pi-web-hardening.test.mjs
 git commit -m "build: unify frontend artifacts across app shells"
```

---

### Task 2: Centralize HTTP and WebSocket endpoint resolution

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/pages/SessionDb.tsx`
- Modify: `frontend/src/components/TuiTerminal.tsx`
- Test: `tests/unit/pi-web-hardening.test.mjs`

**Interfaces:**
- `getApiBase(): string` returns `_apiBase` with trailing slashes removed.
- `apiUrl(path: string): string` returns normalized `_apiBase + path`.
- `webSocketUrl(path: string): string` returns a URL using `wss:` for an HTTPS API/page and `ws:` otherwise, preserving configured remote host and port.
- Existing `api()` uses `apiUrl`; existing token behavior remains unchanged.

- [ ] **Step 1: Write failing URL tests**

Add tests that load the source text or compile the pure functions through the existing project test style and assert:

```text
setApiBase('https://example.test/base/')
apiUrl('/api/models') === 'https://example.test/base/api/models'
webSocketUrl('/ws/tui') === 'wss://example.test/base/ws/tui'
setApiBase('')
apiUrl('/api/models') === '/api/models'
```

Also assert `SessionDb.tsx` no longer contains a direct `fetch('/api/sessions/db` and `TuiTerminal.tsx` calls `webSocketUrl`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test tests/unit/pi-web-hardening.test.mjs --test-name-pattern "endpoint resolution"
```

Expected: FAIL because the URL helper exports do not exist and the two components still construct local-origin requests.

- [ ] **Step 3: Implement URL helpers and migrate callers**

Normalize only the configured base, preserve relative same-origin behavior, and resolve WS protocol from the configured base URL or current page protocol. Keep query strings intact. Change `SessionDb` to call `api('/api/sessions/db' + p, opts)` and change TUI to construct its token query string with `webSocketUrl('/ws/tui?...')`. Remove unused imports introduced by the migration.

- [ ] **Step 4: Run focused tests and TypeScript check**

Run:

```bash
node --test tests/unit/pi-web-hardening.test.mjs --test-name-pattern "endpoint resolution"
cd frontend && npx tsc --noEmit
```

Expected: PASS and zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/pages/SessionDb.tsx frontend/src/components/TuiTerminal.tsx tests/unit/pi-web-hardening.test.mjs
git commit -m "fix: honor configured remote endpoint in frontend"
```

---

### Task 3: Make host binding and CORS explicit

**Files:**
- Modify: `config.mjs`
- Modify: `server.mjs`
- Test: `tests/unit/pi-web-hardening.test.mjs`

**Interfaces:**
- `CONFIG.host` defaults to `127.0.0.1`; when `PI_WEB_LAN=1` and `PI_WEB_HOST` is unset, it defaults to `0.0.0.0`; explicit `PI_WEB_HOST` always wins.
- `CONFIG.corsOrigins` is a normalized array from `PI_WEB_CORS_ORIGINS`, with known local shell origins available by default.
- Server responses allow only an exact configured Origin, set `Vary: Origin` when evaluating Origin, and never reflect an unknown Origin.

- [ ] **Step 1: Write failing config/CORS tests**

Add subprocess or source-contract tests that assert:

```text
without PI_WEB_HOST and PI_WEB_LAN: host === '127.0.0.1'
with PI_WEB_LAN=1 and no PI_WEB_HOST: host === '0.0.0.0'
with PI_WEB_HOST=192.168.1.20: host === '192.168.1.20'
```

Add HTTP tests using an ephemeral server factory if the existing server exposes one; otherwise test the isolated exported CORS helper. Assert `Origin: tauri://localhost` gets an exact allow-origin value and `Origin: https://evil.example` gets no allow-origin value. Assert OPTIONS returns 204 and does not authorize unknown origins.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test tests/unit/pi-web-hardening.test.mjs --test-name-pattern "host binding|CORS"
```

Expected: FAIL because the current default host is `0.0.0.0` and the server reflects arbitrary origins.

- [ ] **Step 3: Implement minimal configuration and CORS policy**

Add a small pure origin parser/helper in an existing focused engine module or a new `engine/cors-policy.mjs`; do not enlarge `server.mjs` with a large block. Parse comma-separated origins, trim trailing slashes, include known local shell origins, and compare exact strings. Set CORS headers before OPTIONS handling. Keep existing auth and static-route behavior unchanged.

- [ ] **Step 4: Run focused tests and real non-secret smoke checks**

Run:

```bash
node --test tests/unit/pi-web-hardening.test.mjs --test-name-pattern "host binding|CORS"
```

Then, only if a test server is needed, start it with an ephemeral port and a test token, request with allowed and disallowed Origin headers, and close it in `finally`. Do not touch the production 8787 process or print its token.

- [ ] **Step 5: Commit**

```bash
git add config.mjs server.mjs engine/cors-policy.mjs tests/unit/pi-web-hardening.test.mjs
git commit -m "security: make host binding and CORS explicit"
```

---

### Task 4: Harden Mermaid rendering

**Files:**
- Modify: `frontend/src/components/Markdown.tsx`
- Test: `tests/unit/pi-web-hardening.test.mjs`

**Interfaces:**
- Export a small pure helper from a focused module or `Markdown.tsx`: `shouldRenderMermaid(code: string): boolean`.
- Mermaid rendering uses `securityLevel: 'strict'`.
- Inputs above the chosen fixed limit (64 KiB) are skipped without calling Mermaid.

- [ ] **Step 1: Write failing Mermaid tests**

Assert the source/config contract contains `securityLevel: 'strict'`, does not use `securityLevel: 'loose'`, and `shouldRenderMermaid('x'.repeat(64 * 1024 + 1))` is false while a short diagram is true.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test tests/unit/pi-web-hardening.test.mjs --test-name-pattern "Mermaid"
```

Expected: FAIL because the implementation still uses `loose` and has no input-length guard.

- [ ] **Step 3: Implement the minimal guard**

Add a named constant `MAX_MERMAID_CHARS = 64 * 1024`, guard before the dynamic Mermaid render call, use `strict`, and keep the existing cancellation behavior and SVG container. Avoid adding another renderer or broad Markdown refactoring.

- [ ] **Step 4: Run focused tests and TypeScript check**

Run:

```bash
node --test tests/unit/pi-web-hardening.test.mjs --test-name-pattern "Mermaid"
cd frontend && npx tsc --noEmit
```

Expected: PASS and zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Markdown.tsx tests/unit/pi-web-hardening.test.mjs
git commit -m "security: restrict Mermaid rendering"
```

---

### Task 5: Update documentation and perform full verification

**Files:**
- Modify: `README.md`
- Modify: `tests/unit/pi-web-hardening.test.mjs` only if a documentation contract is needed

- [ ] **Step 1: Write documentation contract assertions**

Add assertions that README documents `frontend/dist`, `npm run build:mobile:web`, `PI_WEB_LAN=1`, the current default model `zhipu-paid/glm-5.3-flash`, and the ABI names `arm64`, `armeabi-v7a`, `x86`, `x86_64`, `universal`.

- [ ] **Step 2: Run the documentation test and verify RED**

Run:

```bash
node --test tests/unit/pi-web-hardening.test.mjs --test-name-pattern "documentation"
```

Expected: FAIL because README still describes the old default model and old frontend arrangement.

- [ ] **Step 3: Update README with the real workflow**

Document the React source/three-target relationship, the exact build commands, Tauri and Capacitor resource behavior, default loopback binding and explicit LAN switch, current default model, and APK naming rules. Do not document or expose tokens, key values, or local credential paths beyond already-safe operational guidance.

- [ ] **Step 4: Run the complete verification suite**

Run each command separately so failures are attributable:

```bash
cd /d/pi-web && npm test
cd /d/pi-web/frontend && npx tsc --noEmit
cd /d/pi-web/frontend && npm run build
cd /d/pi-web && node --check scripts/sync-frontend.mjs && node --check engine/cors-policy.mjs && node --check server.mjs
cd /d/pi-web && git diff --check
```

Then run `npm run sync:frontend` only after the build, and assert all three `index.html` files reference the same entry assets. Check `git status --short`; do not stage unrelated existing gateway or generated changes.

- [ ] **Step 5: Commit documentation and verification-safe source changes**

```bash
git add README.md tests/unit/pi-web-hardening.test.mjs
 git commit -m "docs: document reproducible pi-web build workflow"
```

- [ ] **Step 6: Send delivery notification**

Run:

```bash
python D:/pi-workspace/工程/notify.py "pi-web 工程收口完成：统一三端前端产物、修复远程 API/WS 地址、收紧 host/CORS 与 Mermaid，并完成全量验证。"
```

Do not claim Android real-device acceptance; no ADB/device is available.
