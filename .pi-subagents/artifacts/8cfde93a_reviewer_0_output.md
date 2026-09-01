## Review

- **Correct**
  - `frontend/src/components/ChatArea.tsx:39,318-325`：看门狗阈值已从 `90_000` 改为 `600_000`，且停止条件仍同时要求 `streamRef.current`、`activeRunRef.current`，不会作用于普通接口。
  - `frontend/src/components/ChatArea.tsx:248-250`：流式期间过滤 `isDraft` 消息；非流式期间仍保留草稿展示逻辑。
  - `engine/run-manager.mjs:135-142`：正常返回路径中，`session_updated` 位于 `completed` 之前；事件账本顺序测试通过。
  - `server.mjs:1405-1411`：Run Manager 已注入现有 `busPush`，向对应会话总线发送 `session_updated`。
  - `npm test`：264/264 通过；目标定向测试 15/15 通过。未修改文件，未调用模型请求。

- **Fixed**
  - 无。本次为只读审查，未修改文件。

- **Blocker**
  - 无阻断级实现问题。

- **Important**
  - `frontend/src/api.ts:140-159`：现有 `streamSession()` 只注册了 `es.onmessage` 和 `subscribed` 监听，没有注册 `session_updated` 这个命名 SSE 事件的监听器。服务端在 `server.mjs:1411` 发送的是 `event: session_updated`；浏览器 `EventSource` 不会把命名事件派发给 `onmessage`，因此**其他前端实例实际不会收到该事件，也不会触发 `ChatArea.tsx:494-498` 的刷新逻辑**。这使目标 2 的端到端行为尚未成立。建议增加 `es.addEventListener('session_updated', handler)`，并为该路径补运行时测试。
  - `tests/unit/run-manager.test.mjs:31-44`：新增测试没有传入 `onSessionUpdated` 回调，只验证了 Run 事件账本中 `session_updated < completed`，没有验证回调被调用、回调携带正确 `sessionId`，也没有验证“现有会话总线 → 其他前端”链路。
  - `tests/unit/frontend-structure.test.mjs:91-94`：只用正则检查 `server.mjs` 中存在 `busPush` 配置，无法发现上述 `streamSession` 未监听命名事件的问题。

- **Minor**
  - `frontend/src/components/ChatArea.tsx:39,319`：常量定义为 `IDLE_WARN_MS`，但实际停止条件仍硬编码 `idle >= 600`。当前行为正确，但将来修改常量时可能产生不一致；建议统一使用 `idle * 1000 >= IDLE_WARN_MS`。
  - `frontend/src/components/ChatArea.tsx:890` 的 `mobile-composer` 改动与本次三个修复目标无关，应确保不要和本次修复混入同一提交。
  - 工作区还有大量非目标未提交内容：`git status` 显示约 185 个已删除 tracked 文件、284 个未跟踪文件，以及其他源码/构建产物变更。它们未纳入本次目标 diff，但提交时必须严格隔离。

- **Validation note**
  - `git diff --check`：通过。
  - `npm test`：通过，264/264。
  - `npx tsc --noEmit -p frontend/tsconfig.json`：未通过，原因是当前 TypeScript 版本移除了 `baseUrl` 选项（`frontend/tsconfig.json:15-16`），属于现有工具链配置风险，不能据此确认本次 React 改动的类型检查状态。