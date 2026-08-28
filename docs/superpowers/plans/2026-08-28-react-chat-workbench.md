# React Chat Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the React chat workbench a clear, stable, responsive primary surface without changing pi-web's API, message tree, model routing, or vanilla entry.

**Architecture:** Keep the existing React/Vite/UnoCSS structure. Consolidate route metadata inside `AppLayout`, add a small global control layer in `styles.css`, and refine the existing `Sidebar`, `ChatArea`, `Message`, and `SendBox` surfaces in place. The first implementation slice is deliberately limited to the chat path; other pages inherit only proven tokens and control rules later.

**Tech Stack:** React 19, TypeScript, Vite, UnoCSS, Lucide React, Radix primitives, SWR, Node test runner.

---

## Working-tree rules

- Work in `D:\pi-web` because the requested project is already there.
- Do not reset, clean, stage, or commit unrelated changes.
- The only implementation files allowed in the first slice are the files listed below plus the focused test file.
- Do not write React build output into `public/`; visual checks use the Vite dev server or existing isolated `frontend/dist` output.

### Task 1: Consolidate React route metadata

**Files:**
- Modify: `frontend/src/AppLayout.tsx`
- Modify: `frontend/src/hooks/useHashRoute.tsx`
- Test: `frontend/tests/design-contract.test.mjs`

- [ ] **Step 1: Add a failing source contract for one route registry**

Add a test that reads `AppLayout.tsx` and asserts that the same route registry provides the page component lookup and navigation metadata. The test must fail against the current duplicated `NAV` plus `PageBody` if-chain.

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run from `D:\pi-web\frontend`:

```powershell
node --test tests/design-contract.test.mjs
```

Expected: the new route-registry assertion fails while the existing design-contract assertions remain readable.

- [ ] **Step 3: Implement the registry with lazy page components**

After the lazy imports, define one typed registry containing each page route, icon, label, and lazy component. Derive desktop navigation and page lookup from it. Keep `chat` as the special route with no lazy page component, and keep the mobile five-item navigation explicit because it is a different information architecture.

- [ ] **Step 4: Run the focused test and type check**

Run:

```powershell
node --test tests/design-contract.test.mjs
pnpm exec tsc --noEmit
```

Expected: all design-contract tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit only the route registry changes**

```powershell
git add frontend/src/AppLayout.tsx frontend/src/hooks/useHashRoute.tsx frontend/tests/design-contract.test.mjs
git commit -m "refactor: centralize React route metadata"
```

### Task 2: Normalize themed controls and focus states

**Files:**
- Modify: `frontend/src/styles.css`
- Test: `frontend/tests/design-contract.test.mjs`

- [ ] **Step 1: Add failing contracts for native control coverage**

Add assertions requiring theme-aware rules for `select`, `input[type="time"]`, `input[type="date"]`, `input[type="range"]`, `input[type="color"]`, `audio`, and `:focus-visible`. Keep hidden file inputs excluded from visual styling requirements.

- [ ] **Step 2: Run the test and confirm it fails for the missing selectors**

```powershell
node --test tests/design-contract.test.mjs
```

Expected: the new selector assertions fail before the CSS is added.

- [ ] **Step 3: Add the shared control layer**

Add CSS rules that:

- use existing `--pi-field`, `--pi-field-border`, `--pi-text`, `--pi-dim2`, and `--pi-accent` tokens;
- give select/time/date controls a consistent dark/light color scheme and readable native indicator;
- give range controls a stable track/thumb size and visible focus state;
- keep color input usable without exposing the browser's white default wrapper;
- make audio controls fit the message column;
- provide one consistent `:focus-visible` outline for keyboard users;
- leave `input[type="file"].hidden` behavior unchanged.

- [ ] **Step 4: Run all frontend contract checks**

```powershell
node --test tests/design-contract.test.mjs
pnpm run check:theme
node scripts/check-raw-hex.mjs
```

Expected: design and theme contracts pass. Any remaining raw-hex output must be recorded and handled only when it is in this slice; wallpaper presets and model-specific fallback colors are not silently removed.

- [ ] **Step 5: Commit the control layer**

```powershell
git add frontend/src/styles.css frontend/tests/design-contract.test.mjs
git commit -m "style: normalize React native controls"
```

### Task 3: Refine the chat shell and input surface

**Files:**
- Modify: `frontend/src/AppLayout.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/components/ChatArea.tsx`
- Modify: `frontend/src/components/Message.tsx`
- Modify: `frontend/src/components/SendBox.tsx`
- Test: `frontend/tests/design-contract.test.mjs`

- [ ] **Step 1: Add failing contracts for core interaction states**

Add focused source contracts requiring:

- an accessible status region for ready, executing, background execution, and error states;
- a disabled send state and a distinct stop state;
- four tool statuses: running, completed, canceled, and error;
- keyboard-accessible slash/file menus;
- an accessible return-to-bottom control;
- stable mobile touch-hit classes on session and input actions.

- [ ] **Step 2: Run the test and confirm it fails only for missing/ambiguous contracts**

```powershell
node --test tests/design-contract.test.mjs
```

- [ ] **Step 3: Refine the existing surfaces without changing data flow**

Keep `ChatApi.send`, `streamSession`, `SessionsApi`, and all SSE event names unchanged. Apply the design baseline by:

- using one readable content column with a stable max width;
- making the top status row and right-panel actions occupy predictable space;
- keeping the input surface anchored above mobile safe-area padding and desktop footer chrome;
- reducing competing glass layers around the primary content;
- replacing hand-drawn command/close/send marks in the touched path with existing Lucide icons where the library already provides them;
- preserving the current optimistic message, pending-message recovery, stop, confirm, attachment, voice, slash-command, and `@` file-reference behavior;
- making errors visible instead of silently disappearing from the user's view;
- ensuring the collapsed turn row and tool card remain readable on 375px screens.

- [ ] **Step 4: Run type checks and design contracts**

```powershell
pnpm exec tsc --noEmit
node --test tests/design-contract.test.mjs
```

- [ ] **Step 5: Commit the chat-shell slice**

```powershell
git add frontend/src/AppLayout.tsx frontend/src/components/Sidebar.tsx frontend/src/components/ChatArea.tsx frontend/src/components/Message.tsx frontend/src/components/SendBox.tsx frontend/tests/design-contract.test.mjs
git commit -m "feat: refine React chat workbench surface"
```

### Task 4: Real visual and interaction verification

**Files:**
- Create: `frontend/shots/chat-workbench-desktop.png`
- Create: `frontend/shots/chat-workbench-mobile.png`
- Test: `frontend/tests/design-contract.test.mjs`

- [ ] **Step 1: Start the isolated React preview**

Run from `D:\pi-web\frontend`:

```powershell
pnpm dev --host 127.0.0.1 --port 5173
```

- [ ] **Step 2: Capture the three required viewport states**

Verify 1440 x 900 desktop, 768 x 900 tablet, and 375 x 812 mobile. Record whether the login surface is reached without a token; do not inject or expose credentials just to make a screenshot.

- [ ] **Step 3: Exercise safe, reversible chat interactions**

With a permitted local session, verify: open/close session drawer, search sessions, open a session, type without sending, keyboard navigate slash menu, keyboard navigate `@` file menu, toggle right panel, open/close command palette, switch theme, and resize the viewport. Do not delete sessions, upload personal files, submit model keys, or run a destructive tool during visual verification.

- [ ] **Step 4: Review console and layout evidence**

Check for uncaught browser errors, horizontal overflow, overlapping fixed layers, unreadable controls, and input/footer jumps. Feed one small evidence bundle at a time to Sonnet 5 for review, then confirm every suggestion against local screenshots or DOM state.

- [ ] **Step 5: Run the complete frontend baseline**

```powershell
pnpm exec tsc --noEmit
node --test tests/design-contract.test.mjs
pnpm run check:theme
```

Expected: all checks pass; the two screenshots exist; any known raw-hex or Vite warning is explicitly listed rather than hidden.

- [ ] **Step 6: Commit only verification artifacts if useful**

Do not stage existing generated `frontend/dist` churn. Only stage the two new screenshots and any focused test changes that belong to this implementation.

## Later plans

After this plan is verified, create separate plans for message-state polish, page-level language across model/assets/tasks/apps/system, Sonnet reviewer plumbing inside `/api/subagent`, and full API/SSE/upload/voice/task/cross-device regression. Do not expand this plan while executing it.
