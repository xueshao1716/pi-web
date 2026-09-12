# 元枢连续创作编排阶段一实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为元枢建立可持久化的故事项目、Story Bible、分镜 beat 和生成运行记录，并提供 B 方案工作台壳，为后续连续图片、视频和小说适配打基础。

**Architecture:** 在现有 `server.mjs` 路由与媒体网关之上新增 `story-orchestrator` 模块。项目状态以工作空间内的 JSON 文件原子保存；前端新增 Story Workbench 页面，时间线是主视图，当前 beat 的继承链和参数在右侧面板展示。阶段一只建立状态与编排 API，不改变聊天快捷出图/视频行为。

**Tech Stack:** Node.js ESM、现有 `server.mjs` API 路由、React 19 + TypeScript、Tailwind/现有 design tokens、Node 内置 `node:test`。

---

### Task 1: 建立故事项目存储与继承纯函数

**Files:**
- Create: `engine/story-store.mjs`
- Test: `tests/unit/story-store.test.mjs`

- [ ] **Step 1: Write failing tests for project creation, atomic shape, and inheritance**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, mergeBeatContext, validateProject } from '../../engine/story-store.mjs';

test('createProject returns stable bible and empty scenes', () => {
  const p = createProject({ title: '黄河边的夏天' }, { now: () => '2026-09-12T08:00:00.000Z', id: () => 'p1' });
  assert.equal(p.id, 'p1');
  assert.equal(p.title, '黄河边的夏天');
  assert.deepEqual(p.bible, { characters: [], locations: [], props: [], wardrobe: [], style: {}, rules: [] });
  assert.deepEqual(p.scenes, []);
});

test('mergeBeatContext keeps ordered inherited entities and rejects cycles', () => {
  const project = { bible: { characters: [{ id: 'c1', name: '阿宁' }], locations: [], props: [], wardrobe: [], style: { tone: '电影感' }, rules: [] } };
  const scene = { beats: [
    { id: 'b1', references: [{ id: 'c1', role: 'character' }], prompt: '站在河边' },
    { id: 'b2', references: [], inheritFromBeatId: 'b1', prompt: '回头' },
  ] };
  const result = mergeBeatContext(project, scene, scene.beats[1]);
  assert.deepEqual(result.referenceIds, ['c1']);
  assert.equal(result.prompt, '站在河边\n回头');
  assert.throws(() => mergeBeatContext(project, { beats: [{ id: 'a', inheritFromBeatId: 'b' }, { id: 'b', inheritFromBeatId: 'a' }] }, { id: 'a', inheritFromBeatId: 'b' }), /循环/);
});

test('validateProject rejects duplicate scene indexes', () => {
  assert.throws(() => validateProject({ scenes: [{ id: 's1', index: 1 }, { id: 's2', index: 1 }] }), /index/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/unit/story-store.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `engine/story-store.mjs`.

- [ ] **Step 3: Implement the store and pure context merge**

Implement `createProject(input, clock)` with the exact default Bible shape above. Implement `validateProject(project)` to check project object, unique scene ids/indexes, unique beat ids per scene, and reject invalid `inheritFromBeatId` references. Implement `mergeBeatContext(project, scene, beat)` with a visited set, walking `inheritFromBeatId` from oldest parent to current beat; concatenate non-empty prompts with `\n`, deduplicate reference ids while preserving order, and return `{ prompt, referenceIds, bible }`. Export `readProject`, `writeProject`, `listProjects` using `fs/promises`, `path`, and an injected root. Writes must use a sibling `.tmp` file followed by `rename`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --test tests/unit/story-store.test.mjs`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add engine/story-store.mjs tests/unit/story-store.test.mjs
git commit -m "feat: add story project store and beat inheritance"
```

### Task 2: Add orchestrator API and capability negotiation

**Files:**
- Create: `engine/story-orchestrator.mjs`
- Modify: `server.mjs` near the API route table and module imports
- Test: `tests/unit/story-orchestrator.test.mjs`

- [ ] **Step 1: Write failing tests for run creation and model degradation**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { negotiateCapabilities, createGenerationRun, appendRun } from '../../engine/story-orchestrator.mjs';

test('negotiateCapabilities reports unsupported reference and seed', () => {
  const r = negotiateCapabilities({ reference: true, keyframe: false, seed: true }, { reference: false, keyframe: false, seed: false });
  assert.deepEqual(r.degradation, ['reference: 当前模型不支持参考资产', 'seed: 当前模型不支持固定 seed']);
});

test('createGenerationRun records immutable parent and normalized status', () => {
  const r = createGenerationRun({ projectId: 'p1', sceneId: 's1', beatId: 'b1', kind: 'image', model: { provider: 'local', id: 'flux' }, params: { width: 1024 }, seed: 42, inputAssets: [{ id: 'a1', role: 'character' }], parentRunId: 'old' }, { id: () => 'run1', now: () => '2026-09-12T08:00:00.000Z' });
  assert.equal(r.id, 'run1');
  assert.equal(r.status, 'queued');
  assert.equal(r.parentRunId, 'old');
  assert.equal(r.seed, 42);
});

test('appendRun keeps previous runs and updates active run', () => {
  const scene = { outputs: [] };
  appendRun(scene, { id: 'r1', status: 'succeeded' });
  assert.equal(scene.outputs.length, 1);
  assert.equal(scene.activeRunId, 'r1');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/unit/story-orchestrator.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `engine/story-orchestrator.mjs`.

- [ ] **Step 3: Implement orchestration helpers and HTTP handlers**

Implement `negotiateCapabilities(required, supported)` returning the supported flags and ordered `degradation` messages. Implement `createGenerationRun(input, clock)` with the `GenerationRun` shape from the design and status `queued`. Implement `appendRun(scene, run)` by pushing to `scene.outputs` and setting `activeRunId`.

Add handlers `handleStoryProjects`, `handleStoryProject`, `handleStoryProjectCreate`, `handleStoryProjectPatch`, and `handleStoryRunPreview` in the same module. Store projects under `path.join(wsRoot, 'story-projects')`. Expose:

- `GET /api/story/projects`
- `POST /api/story/projects` body `{ title, logline? }`
- `GET /api/story/projects/:id`
- `PATCH /api/story/projects/:id` body is a validated partial project
- `POST /api/story/projects/:id/run-preview` body `{ sceneId, beatId, kind, model, params?, seed?, inputAssets? }`

`run-preview` only creates and persists a queued run plus capability/degradation information; it must not call an external model in this phase. Return `{ project, run }` JSON. Reject unknown ids with 404 and invalid body with 400.

- [ ] **Step 4: Register routes and run tests**

Add the import and route entries in `server.mjs` using the existing `readBody`, `json`, and `CONFIG.cwd`/`WS_ROOT` conventions. Run:

`node --test tests/unit/story-orchestrator.test.mjs tests/unit/story-store.test.mjs`

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add engine/story-orchestrator.mjs server.mjs tests/unit/story-orchestrator.test.mjs
git commit -m "feat: expose story orchestration API"
```

### Task 3: Add frontend contract and Story Workbench route

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/nav.ts`
- Modify: `frontend/src/AppLayout.tsx`
- Create: `frontend/src/pages/StoryWorkbench.tsx`
- Test: `tests/unit/frontend-story-workbench.test.mjs`

- [ ] **Step 1: Write failing source contract tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('frontend/src/pages/StoryWorkbench.tsx', 'utf8');
test('story workbench exposes timeline and node sidebar labels', () => {
  assert.match(source, /分镜时间线/);
  assert.match(source, /节点侧栏/);
  assert.match(source, /从此处继续/);
  assert.match(source, /版本对比/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/unit/frontend-story-workbench.test.mjs`

Expected: FAIL because `frontend/src/pages/StoryWorkbench.tsx` does not exist.

- [ ] **Step 3: Add shared types and API client**

Add `StoryProject`, `StoryBible`, `StoryScene`, `StoryBeat`, `StoryGenerationRun`, `StoryAssetRef` interfaces to `frontend/src/types.ts`. Add `StoryApi.listProjects`, `createProject`, `getProject`, `patchProject`, and `previewRun` to `frontend/src/api.ts`, using the existing `apiFetch`/error conventions and returning typed JSON.

- [ ] **Step 4: Implement the B-layout workbench page**

Create `StoryWorkbench.tsx` with SWR loading of the project list and selected project. Render a project picker and create button, a horizontal timeline of scenes/beats, and a right-hand details panel. The details panel must show inherited references, prompt, model/parameter placeholders, run status, and buttons labelled `从此处继续`, `重跑当前镜头`, and `版本对比`; buttons may remain disabled until the run endpoint is wired to real adapters. On mobile, render the details panel as a bottom drawer controlled by local state. Use existing classes (`panel`, `input-pi`, `btn-primary`, `text-pi-dim`) and no new dependency.

- [ ] **Step 5: Register the route and validate the frontend**

Add route label `story: '连续创作'`, lazy import in `AppLayout.tsx`, include it in `PAGE_ROUTES`, and add it to `RAIL_PRIMARY` after `workshop`. Run:

`node --test tests/unit/frontend-story-workbench.test.mjs`

`npm --prefix frontend run build`

Expected: PASS for the source contract and a successful Vite build.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/api.ts frontend/src/nav.ts frontend/src/AppLayout.tsx frontend/src/pages/StoryWorkbench.tsx tests/unit/frontend-story-workbench.test.mjs
git commit -m "feat: add story workbench shell"
```

### Task 4: End-to-end verification and handoff

**Files:**
- Modify: `tests/unit/frontend-structure.test.mjs` only if the existing route contract requires an explicit update
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run the complete required checks**

Run:

`npm test`

`npm --prefix frontend exec tsc -- --noEmit`

`npm --prefix frontend run build`

`node C:/Users/xuexiaofeng/.codex/plugins/cache/openai-primary-runtime/impeccable/scripts/detect.mjs --json frontend/src/pages/StoryWorkbench.tsx frontend/src/AppLayout.tsx`

Expected: all existing tests pass, TypeScript exits 0, Vite build exits 0, and Impeccable reports no blocking findings.

- [ ] **Step 2: Add changelog entry**

Add an entry under the current unreleased section describing the new连续创作项目、Story Bible、分镜时间线和节点侧栏，明确阶段一只创建编排记录，不直接触发外部生成。

- [ ] **Step 3: Commit verification notes**

```bash
git add CHANGELOG.md
git commit -m "docs: record story orchestration phase one"
```

- [ ] **Step 4: Report the implementation boundary**

交付时明确说明：阶段一已完成统一状态、版本血缘和 B 布局工作台；连续图片/小说适配和视频关键帧队列按设计文档的阶段二、三继续接入，ComfyUI 桥接保留在阶段四。
