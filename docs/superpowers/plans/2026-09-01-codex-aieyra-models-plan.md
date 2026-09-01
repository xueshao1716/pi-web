# Codex aieyra 模型接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 pi-web 实时发现的 aieyra 四池 32 个文本/代码模型安全接入 Codex 桌面版与 CLI，并保留现有路由。

**Architecture:** Codex 继续请求本机 `127.0.0.1:8915`。本地 Node 路由器根据带池前缀的模型名选择 aieyra provider，并从 pi-web `auth.json` 运行时读取对应 key；Codex catalog 由现有官方条目深拷贝生成 32 个唯一条目，不保存凭据。

**Tech Stack:** Node.js HTTP/HTTPS proxy, Python JSON/TOML validation scripts, Codex `model-catalog.json`, Codex CLI.

## Global Constraints

- 只接入 aieyra 当前四池中的文本/代码模型（本次实时清单为 32 项：GPT 13、Grok 3、Claude 9、Gemini 7）。
- 运行时从四个 aieyra key 的 `/v1/models` 读取清单，并过滤模型 ID 中的 image/audio/realtime/video；不要只依赖可能滞后的 models-store。
- key 只从 `C:/Users/xuexiaofeng/.pi/agent/auth.json` 运行时读取，不写入 catalog、源代码或仓库。
- aieyra slug 使用 `aieyra-<pool>/<id>`；路由器将前缀转换为对应池和原始上游模型 ID。
- 保留 51relay Claude/GPT 路由与 WorkBuddy `hy4`/`hy3`/`gpt-5.6-luna` 路由。
- 不改变 Codex 当前默认模型 `claude-sonnet-5`。
- 不触碰 `D:/pi-web` 当前已有 UI 未提交改动。
- 所有配置修改前创建带时间戳的备份；JSON/TOML 校验失败不得替换原配置。
- 每条 shell 命令控制在 60 秒以内；不输出任何密钥。

---

### Task 1: 建立 aieyra 清单与路由契约测试

**Files:**
- Create: `D:/pi-workspace/工程/codex-key-router/test-router.mjs`
- Read: `C:/Users/xuexiaofeng/.pi/agent/models-store.json`
- Read: `C:/Users/xuexiaofeng/.pi/agent/auth.json`

**Interfaces:**
- Test-only contract for `routeForModel(model)`: returns `{ kind: "aieyra", pool: "gpt"|"grok"|"claude"|"gemini", upstreamModel: string }` for prefixed models; returns existing route kinds for legacy models.
- Test-only contract for `aieyraModelIds`: live pool discovery is expected to contain 13/3/9/7 text/code models.

- [ ] **Step 1: Read the live four-pool model arrays and assert the current counts**

Run:

```bash
python - <<'PY'
import json
p='C:/Users/xuexiaofeng/.pi/agent/models-store.json'
d=json.load(open(p,encoding='utf-8'))
for provider in ('aieyra-gpt','aieyra-grok','aieyra-claude','aieyra-gemini'):
    models=d[provider]['models']
    assert all(m.get('input') == ['text'] for m in models), provider
    print(provider, len(models), ' '.join(m['id'] for m in models))
PY
```

Expected: the live aieyra pools report GPT 13, Grok 3, Claude 9, Gemini 7 text/code models.

- [ ] **Step 2: Write failing route contract tests**

`test-router.mjs` must exercise the exported pure routing contract without starting a server:

```js
import assert from 'node:assert/strict';
import { routeForModel } from './proxy.js';

assert.deepEqual(routeForModel('aieyra-gpt/gpt-5.5'), {
  kind: 'aieyra', pool: 'gpt', upstreamModel: 'gpt-5.5',
});
assert.deepEqual(routeForModel('aieyra-claude/claude-sonnet-5'), {
  kind: 'aieyra', pool: 'claude', upstreamModel: 'claude-sonnet-5',
});
assert.equal(routeForModel('hy4-preview').kind, 'workbuddy');
assert.equal(routeForModel('claude-sonnet-5').kind, 'relay-claude');
assert.equal(routeForModel('gpt-5.5').kind, 'relay-gpt');
assert.equal(routeForModel('aieyra-unknown/foo').kind, 'aieyra-unknown');
console.log('router contract ok');
```

- [ ] **Step 3: Run the test and verify it fails for the missing export/route**

Run: `node D:/pi-workspace/工程/codex-key-router/test-router.mjs`

Expected: FAIL because `routeForModel` is not yet exported or does not classify aieyra prefixes.

---

### Task 2: Implement aieyra four-pool routing

**Files:**
- Modify: `D:/pi-workspace/工程/codex-key-router/proxy.js`
- Modify: `D:/pi-workspace/工程/codex-key-router/test-router.mjs`

**Interfaces:**
- Export `routeForModel(model)` for tests.
- Runtime `pickKey(model)` selects aieyra key by exact prefix and legacy route otherwise.
- Runtime `upstreamForRoute(route)` selects `token.aieyra.cn` for aieyra and `www.51relay.com` for legacy relay.

- [ ] **Step 1: Add pure route classification before server code**

Implement exact prefix matching:

```js
const AIEYRA_POOLS = Object.freeze({
  gpt: 'aieyra-gpt', grok: 'aieyra-grok',
  claude: 'aieyra-claude', gemini: 'aieyra-gemini',
});
function routeForModel(model = '') {
  const match = /^aieyra-(gpt|grok|claude|gemini)\/(.+)$/.exec(model);
  if (match) return { kind: 'aieyra', pool: match[1], upstreamModel: match[2] };
  if (/^(hy4|hy3|gpt-hy4|gpt-5\.6-luna)/i.test(model)) return { kind: 'workbuddy' };
  if (/^claude/i.test(model)) return { kind: 'relay-claude' };
  return { kind: 'relay-gpt' };
}
```

An aieyra-looking but malformed/unknown prefix must return `{kind: 'aieyra-unknown'}` and never fall through to 51relay.

- [ ] **Step 2: Add aieyra key loading without logging values**

Read `auth.json` once per request or through a short-lived cache; use `auth["aieyra-${pool}"].key`. Add `aieyraKey(pool)` returning an empty string when absent or invalid. Keep existing `gptKey()` and `claudeKey()` behavior unchanged.

- [ ] **Step 3: Route request model separately from upstream model**

For aieyra requests, parse JSON, replace only the outgoing body’s `model` with `route.upstreamModel`, set host `token.aieyra.cn`, and send the corresponding Authorization header. Forward the original request URL and method. For non-aieyra routes preserve current WorkBuddy and 51relay behavior.

- [ ] **Step 4: Return explicit errors for malformed aieyra routes or missing keys**

Use HTTP 503 JSON errors with pool/model context but no credentials. Never send malformed aieyra requests to 51relay.

- [ ] **Step 5: Run route contract tests**

Run: `node D:/pi-workspace/工程/codex-key-router/test-router.mjs`

Expected: PASS.

- [ ] **Step 6: Validate syntax and commit only router files**

Run: `node --check D:/pi-workspace/工程/codex-key-router/proxy.js`

Then:

```bash
git -C D:/pi-workspace add 工程/codex-key-router/proxy.js 工程/codex-key-router/test-router.mjs
git -C D:/pi-workspace commit -m "feat(codex): route aieyra model pools"
```

---

### Task 3: Generate and validate the Codex catalog entries

**Files:**
- Create: `D:/pi-workspace/工程/codex-key-router/sync-aieyra-catalog.py`
- Modify: `C:/Users/xuexiaofeng/.codex/model-catalog.json`
- Backup: `C:/Users/xuexiaofeng/.codex/model-catalog.json.bak-aieyra-<timestamp>`

**Interfaces:**
- Script reads `models-store.json` and current catalog; writes an atomic catalog replacement.
- Generated slugs are `aieyra-gpt/<id>`, `aieyra-grok/<id>`, `aieyra-claude/<id>`, `aieyra-gemini/<id>`.
- Every generated entry has the same required structural fields as the selected official template, including `shell_type` and `model_messages`.

- [ ] **Step 1: Inspect current catalog custom entries and choose a verified template**

Run a Python read-only check that prints for candidate entries `slug`, `shell_type`, `supported_in_api`, keys under `model_messages`, `base_instructions`, `support_verbosity`, `use_responses_lite`, and `visibility`, without dumping long prompt text.

Expected: choose an existing non-OpenAI custom model entry with working `unified_exec` fields; preserve its full `model_messages` object by deep copy.

- [ ] **Step 2: Write generator with explicit validation**

The generator must:

1. Load four aieyra provider arrays and the live `/v1/models` lists.
2. Filter `input == ['text']` and reject duplicate `(pool,id)` pairs.
3. Deep-copy one verified catalog template.
4. Set `slug` to the prefixed slug and `display_name` to `Aieyra · <pool> · <id>`.
5. Set `description` to a short provider/model description.
6. Set `visibility: "list"`, `supported_in_api: true`, `shell_type: "unified_exec"`.
7. Set provider metadata only in catalog-safe fields; never include key/base URL.
8. Remove any template-specific model slug references from fields that must identify the new slug, while retaining generic instructions.
9. Replace existing generated aieyra entries idempotently instead of duplicating them.
10. Assert exactly 32 generated entries and unique slugs.
11. Write through a same-directory temporary file, flush/close, then replace the target.

- [ ] **Step 3: Run generator in dry-run mode**

Run: `python D:/pi-workspace/工程/codex-key-router/sync-aieyra-catalog.py --dry-run`

Expected: reports 32 entries grouped 13/3/9/7 and prints slugs only.

- [ ] **Step 4: Back up and apply the catalog**

Run: `python D:/pi-workspace/工程/codex-key-router/sync-aieyra-catalog.py --apply`

Expected: timestamped backup exists; resulting catalog parses and includes exactly 32 prefixed entries.

- [ ] **Step 5: Validate required fields and no secrets**

Run a Python validator that loads the catalog, checks all 32 entries have `slug`, `display_name`, `shell_type`, `model_messages`, `supported_in_api`, checks no catalog string contains `sk-` or aieyra key hashes/values, and reports counts only.

- [ ] **Step 6: Commit only the generator and router test support**

Do not commit user-level Codex files to the workspace repo. Commit the generator separately:

```bash
git -C D:/pi-workspace add 工程/codex-key-router/sync-aieyra-catalog.py
git -C D:/pi-workspace commit -m "feat(codex): add aieyra catalog sync"
```

---

### Task 4: Restart the local router and perform live validation

**Files:**
- Read/modify process state only: local process listening on `127.0.0.1:8915`
- Read: `C:/Users/xuexiaofeng/.codex/config.toml`
- Read: generated catalog

**Interfaces:**
- Existing Codex provider remains `OpenAI` at `http://127.0.0.1:8915` with `wire_api = "responses"`.
- Default model remains `claude-sonnet-5`.

- [ ] **Step 1: Validate Codex TOML invariants before restart**

Parse/check the relevant lines and assert provider URL, wire API, and default model are unchanged.

- [ ] **Step 2: Restart only the router safely**

Stop the existing router PID after identifying the listener, then launch `proxy.js` hidden through the existing watcher or the documented startup path. Do not stop pi-web or touch its port 8787. Confirm exactly one listener on 8915.

- [ ] **Step 3: Check router health without exposing keys**

Run: `curl -sS -m 10 http://127.0.0.1:8915/healthz`

Expected: `ok: true` and four aieyra pool availability booleans; no key strings.

- [ ] **Step 4: Check merged model discovery**

Run: `curl -sS -m 20 http://127.0.0.1:8915/v1/models` and parse IDs/counts without printing authorization data.

Expected: aieyra model discovery works; no malformed response.

- [ ] **Step 5: Probe one real model per aieyra pool**

Send minimal `stream: false` OpenAI-compatible chat requests via the router using prefixed models. The router must rewrite the model to the original aieyra ID. Record only HTTP status, response content length, and error category. If the upstream requires streaming, retry with `stream: true` and record the result.

Expected: each pool responds with non-empty content or a clear upstream capability error; no request reaches 51relay.

- [ ] **Step 6: Probe one tool request**

Send one minimal tool declaration through an aieyra model known to accept tools. Record HTTP status and whether a tool call or valid normal response is returned. Do not execute a destructive tool.

- [ ] **Step 7: Run Codex CLI smoke test with one prefixed model**

Use the installed Codex executable with a short non-mutating prompt and the new model slug, with a timeout under 60 seconds. Confirm it reaches the local router and returns a response. Do not alter the default model.

- [ ] **Step 8: Final verification and report**

Run `node --check`, route tests, catalog validator, config invariants, listener uniqueness, and `git -C D:/pi-workspace status --short`. Report exact counts, tested pools, statuses, backup paths, and any model-specific failures. Never claim a model works unless the live request produced evidence.

---

## Self-review checklist

- Spec coverage: routing, catalog generation, no-secret boundary, backups, rollback, preservation of existing routes, and multi-dimensional validation are covered by Tasks 1–4.
- Placeholder scan: no TBD/TODO or unspecified implementation steps remain.
- Type consistency: `routeForModel`, `aieyraKey`, and prefixed slug formats are defined consistently across tasks.
- Scope: the only persistent workspace changes are the focused router implementation, tests, and catalog generator; user-level Codex configuration is intentionally outside the repository.
