# Asset Library Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `frontend/src/pages/Assets.tsx` into a unified media-first asset library with type categories, time sorting/filtering, automatic project grouping from paths, in-page previews, and safe file actions while preserving the existing workspace APIs.

**Architecture:** Keep the existing `/api/ws/artifacts`, `/api/ws/deliveries`, `/api/ws/file`, `/api/ws/read`, `/api/ws/rename`, and `/api/ws/delete` contracts. Add a pure frontend normalization/filtering layer that maps generated artifacts and deliveries into one `AssetItem` model, then split the page into focused toolbar, collection, preview, and details components. Use one selected-item state for all previews and actions; use existing signed/tokenized file URLs and backend safety checks.

**Tech Stack:** React 18, TypeScript, SWR, Tailwind utility classes plus `frontend/src/styles.css`, lucide-react, Node built-in test runner.

## Global Constraints

- The page must classify assets as all, image, video, audio, text/document, or other.
- Time supports newest/oldest sorting and today/7-day/30-day filters.
- Projects are inferred automatically from the asset's workspace-relative path; no manual project database is added.
- Images, videos, audio, and text/Markdown/JSON must preview inside the asset library where technically supported.
- Existing generation and delivery APIs remain usable; external video aggregation and arbitrary rule JavaScript are out of scope.
- File actions must use existing backend path validation and token/signed file URLs; no raw unvalidated local path is introduced in the browser.
- Preserve unrelated uncommitted files in the main checkout; implementation occurs only in `.worktrees/assets-library-upgrade`.
- No decorative gradients, glass blur, emoji controls, or non-badge 10px text; inherit pi-web semantic colors and controls.
- Every production behavior change follows TDD: write a failing test, run it RED, implement minimally, run it GREEN.

---

### Task 1: Unified asset data model and pure collection utilities

**Files:**
- Create: `frontend/src/lib/assets.ts`
- Modify: `frontend/src/types.ts`
- Test: `tests/unit/assets-library.test.mjs`

**Interfaces:**
- `AssetItem` includes `id`, `name`, `path`, `url`, `size`, `date`, `mtimeMs`, `kind`, `source`, `project`, and optional `isDirectory`.
- Export `normalizeArtifacts(artifacts: Artifact[]): AssetItem[]`.
- Export `normalizeDeliveries(deliveries: AssetDelivery[]): AssetItem[]`.
- Export `mergeAssets(artifacts: Artifact[], deliveries: AssetDelivery[]): AssetItem[]`.
- Export `filterAssets(items, query)` where query supports `kind`, `source`, `project`, `timeRange`, and `search`.
- Export `sortAssets(items, order: 'newest' | 'oldest')`.
- Export `assetKindForName(name: string): AssetKind` and `projectForPath(path: string): string`.

- [ ] **Step 1: Write failing tests** covering:
  - common image/video/audio/text/other extensions map to the expected kinds;
  - an artifact path such as `工程/元枢安卓App/交付/cover.png` maps project to `元枢安卓App`, while root-level paths use `未分类`;
  - generated artifacts and delivery records merge without duplicate IDs;
  - search matches filename and relative path;
  - today/7-day/30-day time ranges and newest/oldest ordering use `mtimeMs`/date deterministically;
  - directories remain `other` and are not offered as playable media.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `node --test tests/unit/assets-library.test.mjs`
Expected: FAIL because the asset utility module and `AssetDelivery` contract do not exist.

- [ ] **Step 3: Implement the minimal types and pure utilities**

Use stable IDs based on `source + path`; normalize delivery `wsPath` as the relative path and preserve its URL. Infer a project from the first meaningful path segment, ignoring known workspace buckets (`生成物`, `交付`, `工程`, `文档`, `收发文件`, `workshop-out`) and returning `未分类` when no project segment exists. Convert API dates to a numeric timestamp when possible; never use the current time as a fake fallback in sorting tests.

- [ ] **Step 4: Run focused and existing tests to verify GREEN**

Run: `node --test tests/unit/assets-library.test.mjs tests/unit/frontend-ui-structure.test.mjs`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/assets.ts frontend/src/types.ts tests/unit/assets-library.test.mjs
git commit -m "feat: add unified asset collection model"
```

### Task 2: API surface and asset action contracts

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/types.ts`
- Modify: `tests/unit/frontend-ui-structure.test.mjs`
- Test: `tests/unit/workspace-file.test.mjs` (only if an endpoint contract test is needed)

**Interfaces:**
- `AssetDelivery` is the typed shape returned by `/api/ws/deliveries`.
- `WsApi.rename(oldPath: string, newName: string)` calls `/api/ws/rename`.
- `WsApi.delete(path: string)` calls `/api/ws/delete` with `{ path, confirmed: true }` only after UI confirmation.
- `WsApi.read(path: string)` remains the text preview API.
- `withFileToken(url)` remains the only browser URL helper for legacy file URLs.

- [ ] **Step 1: Add failing structural tests** asserting the frontend has typed delivery data, rename/delete methods, and does not introduce direct filesystem URLs or a second ad-hoc preview state.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `node --test tests/unit/frontend-ui-structure.test.mjs`
Expected: FAIL on the missing typed action contracts.

- [ ] **Step 3: Implement the typed API methods**

Add the delivery interface and methods using the existing `api()` helper, preserving authentication, timeout defaults, and current endpoint names. Do not alter backend behavior unless a test proves the current response shape is insufficient.

- [ ] **Step 4: Run the focused tests to verify GREEN**

Run: `node --test tests/unit/frontend-ui-structure.test.mjs tests/unit/workspace-file.test.mjs`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/types.ts tests/unit/frontend-ui-structure.test.mjs tests/unit/workspace-file.test.mjs
git commit -m "feat: type asset file actions"
```

### Task 3: Media-first asset library UI

**Files:**
- Modify: `frontend/src/pages/Assets.tsx`
- Create: `frontend/src/components/assets/AssetToolbar.tsx`
- Create: `frontend/src/components/assets/AssetCard.tsx`
- Create: `frontend/src/components/assets/AssetPreview.tsx`
- Create: `frontend/src/components/assets/AssetDetails.tsx`
- Create: `frontend/src/components/assets/AssetCollection.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `tests/unit/frontend-ui-structure.test.mjs`

**Interfaces:**
- `Assets.tsx` owns SWR data, one `selectedAsset: AssetItem | null`, filters, selection set, and mutation/error feedback.
- `AssetToolbar` receives counts, filter values, available projects, and callbacks.
- `AssetCollection` receives normalized filtered items and selection callbacks.
- `AssetPreview` receives `AssetItem | null`, `onClose`, and `onAction`; it renders image/video/audio/text/other states.
- `AssetDetails` receives the selected item and rename/delete/download/open callbacks.

- [ ] **Step 1: Write failing structural/UI contract tests** covering:
  - type controls include all/image/video/audio/text-document/other;
  - time range controls and newest/oldest sorting exist;
  - project filter is populated from normalized paths rather than hardcoded project names;
  - one selected asset powers the preview/details layer;
  - `<video controls preload="metadata">`, `<audio controls>`, and text read states exist;
  - delete requires confirmation and rename uses `/api/ws/rename`;
  - mobile action bar/full-screen preview classes exist and the page has no horizontal overflow-prone fixed width;
  - loading, empty, media error, and action error feedback are represented.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `node --test tests/unit/frontend-ui-structure.test.mjs`
Expected: FAIL because the current page has only image lightbox, separate deliveries, and no unified controls or in-page video/text preview.

- [ ] **Step 3: Implement the minimal componentized UI**

Build a single collection from `mergeAssets`. Use accessible buttons for all filters and actions, `aria-pressed` for selection/filter state, and an explicit close button plus Escape handling for the preview. Keep media thumbnails lazy; videos use `preload="metadata"` and browser controls. Text preview calls `WsApi.read` only for text-like items and renders a bounded scroll region with an explicit read failure state. Delivery items show a source badge but live in the same collection. Directories use a folder card and open through the existing file/workspace path only when the current API can support it; never pass a directory to the media element.

Use a responsive desktop detail rail and mobile bottom sheet/action bar. Use `window.confirm` only for the final destructive confirmation, then send the backend's required `confirmed: true`. After rename/delete success, refresh both SWR sources, clear selection, and show a short status message; on failure retain the selection and show the returned reason. Provide a clear-filters action for empty filtered results.

- [ ] **Step 4: Run focused tests, TypeScript, and build to verify GREEN**

Run: `node --test tests/unit/frontend-ui-structure.test.mjs tests/unit/assets-library.test.mjs && (cd frontend && npx tsc --noEmit && npm run build)`
Expected: all tests, typecheck, and production build pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Assets.tsx frontend/src/components/assets frontend/src/styles.css tests/unit/frontend-ui-structure.test.mjs
git commit -m "feat: upgrade assets into media library"
```

### Task 4: Integration verification and delivery artifacts

**Files:**
- Modify: `tests/unit/frontend-ui-structure.test.mjs` only if verification exposes a durable contract gap
- Create: `.impeccable/review/assets-desktop.png` and `.impeccable/review/assets-mobile.png` as local review artifacts (git-ignored)
- Create: `.superpowers/sdd/2026-09-02-assets-library-upgrade/progress.md` as the implementation ledger (git-ignored)

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: all tests pass with zero failures.

- [ ] **Step 2: Run production checks**

Run: `cd frontend && npx tsc --noEmit && npm run build`; then run `node C:/Users/xuexiaofeng/.pi/agent/skills/impeccable/scripts/detect.mjs --json frontend/src/pages/Assets.tsx frontend/src/components/assets frontend/src/styles.css` and `git diff --check`.
Expected: typecheck/build/diff checks pass; mechanical detector has no unresolved findings or each finding is fixed before proceeding.

- [ ] **Step 3: Verify real service behavior**

With the existing pi-web service, request `/api/health`, `/api/ws/artifacts`, and `/api/ws/deliveries` with the normal auth token without printing credentials. For a real image/text asset, verify file serving; for a real video if available, verify `Range` returns `206` and `Accept-Ranges: bytes`. Verify a missing/invalid path remains rejected. Do not claim video playback if no valid local video asset exists.

- [ ] **Step 4: Inspect desktop and mobile renders**

Capture the assets route at approximately 1440px and 375px widths after settling motion. Confirm no horizontal overflow, media preview is visible, filters remain usable, and empty/error states are legible. Save captures only under `.impeccable/review/`.

- [ ] **Step 5: Sync only the built frontend artifact through the existing project workflow**

Follow the repository's existing frontend distribution sync command, inspect `git status`, and ensure no credentials, unrelated main-checkout changes, or stale generated assets are staged. Do not overwrite the main checkout's unrelated dirty files.

- [ ] **Step 6: Commit any required verification-only changes**

```bash
git add tests/unit/frontend-ui-structure.test.mjs
git commit -m "test: verify upgraded assets library"  # only when the file changed
```
