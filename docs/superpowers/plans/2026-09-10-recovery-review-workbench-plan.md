# Recovery and Review Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make durable run recovery preserve the actual checkpoint kind through the SSE and run-manager chain, then add a safe review workbench that shows structured Git changes and verification state.

**Architecture:** Preserve canonical checkpoint metadata when the manager derives an event patch, while retaining the existing durable event log and run store. Add a read-only Git review endpoint with bounded structured status/diff data, then expose it in a lazy frontend page using existing app tokens and SWR patterns. Review actions acknowledge findings locally in the browser only; no discard, reset, stage, commit, push, or notification is introduced.

**Tech Stack:** Node.js ESM, node:test, React + TypeScript, SWR, existing pi CSS tokens, git CLI.

---

### Task 1: Reproduce and fix canonical checkpoint recovery

**Files:**
- Modify: `D:/pi-web/tests/unit/run-manager.test.mjs`
- Modify: `D:/pi-web/engine/run-manager.mjs`

- [ ] **Step 1: Write the failing integration test**

Add a test that emits a real `checkpoint` SSE event whose payload has `phase: "tool_plan"`, then confirms the durable checkpoint still has `checkpointKind: "tool_plan"` and that a resumed execution receives the original plan through `__runContext`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run `node --test tests/unit/run-manager.test.mjs` from `D:/pi-web`. Expected failure: the persisted checkpoint kind is `executing` and the resumed context does not qualify for tool-plan replay.

- [ ] **Step 3: Implement the minimal canonical-kind fix**

In `checkpointForEvent`, derive `checkpointKind` from `data.checkpointKind` first and otherwise from the event payload phase, and derive the phase/step without replacing a canonical kind with the transport phase. Preserve the existing allowlisted checkpoint fields.

- [ ] **Step 4: Run the focused test and the recovery unit tests**

Run `node --test tests/unit/run-manager.test.mjs tests/unit/run-store.test.mjs tests/unit/run-effects.test.mjs`. Expected: all pass.

- [ ] **Step 5: Commit the recovery fix**

Run `git add engine/run-manager.mjs tests/unit/run-manager.test.mjs && git commit -m "fix: preserve checkpoint kind through recovery events"`.

### Task 2: Add structured Git review data

**Files:**
- Modify: `D:/pi-web/engine/misc-api.mjs`
- Modify: `D:/pi-web/server.mjs`
- Create: `D:/pi-web/tests/unit/git-review-api.test.mjs`

- [ ] **Step 1: Write failing API tests**

Use a temporary Git repository and injected `cwd`/`json` dependencies to assert the review handler returns branch, per-file status, bounded unified diff text, and a verification placeholder with explicit `unknown` state. Assert paths are repository-relative and no raw command output is required by the client.

- [ ] **Step 2: Run the focused test and verify it fails**

Run `node --test tests/unit/git-review-api.test.mjs`. Expected failure: the handler is not exported and no structured fields are returned.

- [ ] **Step 3: Implement read-only review aggregation**

Add `handleGitReview` beside the existing Git handlers. Use `git status --short --branch`, `git diff --no-ext-diff --unified=3`, and `git ls-files --others --exclude-standard`; parse bounded output into branch, files, diff, and a `verification: { state: "unknown", checks: [] }` object. Keep command timeout/maxBuffer limits and return a truthful `isRepo:false` response when outside a repo.

- [ ] **Step 4: Register the route and run the focused tests**

Register `GET /api/git/review`, export the handler from the factory, then rerun `node --test tests/unit/git-review-api.test.mjs tests/unit/run-manager.test.mjs`.

- [ ] **Step 5: Commit the API change**

Run `git add engine/misc-api.mjs server.mjs tests/unit/git-review-api.test.mjs && git commit -m "feat: expose structured git review data"`.

### Task 3: Build the review workbench UI

**Files:**
- Modify: `D:/pi-web/frontend/src/api.ts`
- Modify: `D:/pi-web/frontend/src/AppLayout.tsx`
- Create: `D:/pi-web/frontend/src/pages/ReviewWorkbench.tsx`
- Modify: `D:/pi-web/frontend/src/styles.css`
- Create: `D:/pi-web/tests/unit/review-workbench.test.mjs`

- [ ] **Step 1: Add source-contract tests**

Assert the page exposes branch/file counts, verification state, refresh action, bounded diff rendering, empty/error states, and an acknowledgement control that never calls a mutation endpoint.

- [ ] **Step 2: Run the contract test and verify it fails**

Run `node --test tests/unit/review-workbench.test.mjs`. Expected failure because the API entry, route, and page do not exist.

- [ ] **Step 3: Implement the page and route**

Add `GitReviewApi.review`, lazy-load the page from `AppLayout`, and render a compact operate-mode layout: branch/status strip, file list with additions/deletions, verification card, diff preview, and local acknowledgement state. Use existing PageHeader, SWR, Lucide icons, and touch-sized controls; no marketing copy or destructive Git actions.

- [ ] **Step 4: Run TypeScript, contract tests, and build**

Run `node --test tests/unit/review-workbench.test.mjs`, `D:/pi-web/frontend/node_modules/.bin/tsc.cmd --noEmit -p frontend/tsconfig.json`, and `C:/Program Files/nodejs/npm.cmd --prefix frontend run build`. Expected: all pass and `frontend/dist` updates only with generated bundles.

- [ ] **Step 5: Commit the UI change**

Run `git add frontend/src frontend/dist && git commit -m "feat: add git review workbench"`.

### Task 4: Verify, review, and hand off

**Files:**
- Review: all files changed by Tasks 1-3

- [ ] **Step 1: Run the complete test and quality set**

Run `node --test tests/unit/*.test.mjs`, `C:/Program Files/nodejs/npm.cmd --prefix frontend run typecheck`, `C:/Program Files/nodejs/npm.cmd --prefix frontend run build`, and `node C:/Users/xuexiaofeng/.agents/skills/impeccable/scripts/detect.mjs --json frontend/src/pages/ReviewWorkbench.tsx frontend/src/styles.css`.

- [ ] **Step 2: Inspect the final diff and live service boundary**

Confirm `git diff --check`, verify the existing 8787 listener remains untouched, and state clearly that server-side changes require the normal future restart before the live service exposes them.

- [ ] **Step 3: Commit only verified changes**

Run `git status --short`, then commit any remaining verified changes with a focused message. Do not push, notify, reset, or discard unrelated work.
