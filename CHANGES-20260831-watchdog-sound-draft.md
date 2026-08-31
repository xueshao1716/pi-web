# 2026-08-31 流式卡死修复 + 提示音 + 增量持久化

## 修改内容

### P0：流式看门狗（自动中止卡死的流式连接）
**文件**：`frontend/src/components/ChatArea.tsx`

**问题**：模型流式响应中途卡住（上游限流/网络问题），前端一直等 `reader.read()`，永远不会自动恢复，只能手动点停止或切标签页。

**修复**：在已有的 `idleSeconds` 定时器里增加自动中止逻辑：
- 超过 90 秒无任何新事件（delta/tool/think）→ 判定为死流
- 自动调用 `abort()` + `finalize()`，标记错误信息 "⏱️ 长时间无响应已自动停止"
- 弹 toast 提示 "模型长时间无响应，已自动停止"

**效果**：卡住不再需要手动干预，90秒后自动停止并显示已生成的内容。

---

### P1：完成提示音（双声"叮叮"）
**文件**：`frontend/src/components/ChatArea.tsx`

**需求**：任务完成时播放提示音，让用户知道回复已生成完毕（特别是后台时）。

**实现**：在 `finalize()` 函数里，用 Web Audio API 生成双声提示音：
- 第一声：800Hz，持续 0.1s
- 第二声：1000Hz，持续 0.15s，延迟 0.15s 开始
- 音量 0.25（不刺耳）

**兼容性**：三端通用（浏览器/Android/Windows），不依赖原生桥接，纯前端 JS 实现。

---

### P2：流式增量持久化（草稿自动保存）
**文件**：`frontend/src/components/ChatArea.tsx`

**问题**：流式中途卡住/刷新页面，已经出来的内容（文字/工具输出）全部丢失，因为：
- `useSWR` 的 `revalidateOnFocus: true` 会在切标签页后重新拉取服务端消息
- 服务端只有在 `message_end` 事件时才写盘，流式中途卡死时 `message_end` 没触发
- 前端 `stream` 是临时状态，重新拉取后被覆盖

**修复**：
1. **增加草稿状态**：`const [draftMessage, setDraftMessage] = useState<ChatMessage | null>(null)`
2. **定期快照到 localStorage**：流式期间每 5 秒把当前 `stream` 内容（text/tools/think 等）存入 `pi_stream_draft`
3. **刷新时自动恢复**：组件加载时检查 localStorage，如果有匹配当前会话的草稿（30分钟内有效），显示出来
4. **草稿显示样式**：左侧橙色竖条 + 顶部标签 "📝 未完成的回复（草稿）" + "丢弃"按钮
5. **正常完成时清除**：`finalize()` 里清除 `pi_stream_draft` 和 `draftMessage` 状态

**效果**：
- 卡住/刷新后，已生成的内容不会丢失，显示为草稿
- 用户可以看到"干到哪了"，决定是继续还是丢弃重来

---

## 验证步骤

### 1. 看门狗自动停止
1. 启动 pi-web：`npm run dev`（前端）+ `node server.mjs`（后端）
2. 发一条消息，等流式开始后，**在服务端手动杀掉模型请求**（模拟卡住）
3. 观察前端：90秒后应自动显示 toast "模型长时间无响应，已自动停止"，消息区显示错误 "⏱️ 长时间无响应已自动停止"

### 2. 提示音
1. 发一条正常消息，等回复完成
2. 应听到双声"叮叮"提示音（800Hz → 1000Hz）

### 3. 草稿恢复
1. 发一条消息，等流式出来一部分内容（比如跑了几个 bash 工具）
2. **刷新页面**（F5 或 Ctrl+R）
3. 重新加载后，应看到橙色竖条标记的草稿消息，显示之前已生成的内容
4. 点"丢弃"按钮可以清除草稿

---

## 技术细节

### 为什么"bash 跑着跑着连同提问一起消失"
**根因**：不是真正的卡死，而是页面被刷新/重新拉取消息：
1. 用户消息在前端是**乐观更新**（立即显示），真正写盘在 `agent.prompt()` 的 `message_end` 事件
2. 如果流式中途卡住，`message_end` 没触发，用户消息还没写入服务端 JSONL 文件
3. 用户切标签页再切回来 → `useSWR` 触发 `revalidate` → 重新拉取 `/api/sessions/:id/messages`
4. 服务端文件里还没有这条消息 → 前端消息列表被覆盖 → 用户消息消失
5. 流式中的 bash 工具输出在前端是 `stream.tools[]` 临时状态，也被清空

**现在的修复**：
- 用户消息防丢：已有的 `pi_pending_msg` localStorage 机制（刷新后恢复）
- assistant 流式内容防丢：新增的 `pi_stream_draft` 机制（每5秒快照，刷新后显示为草稿）

### 为什么不在后端做增量持久化
**方案对比**：
1. **后端每次 delta 就写盘**：需要改 pi SDK 的 session-manager.js，拆一条消息成多个 entry，重新加载时合并，工程量大，兼容性风险高
2. **前端定期快照到 localStorage**：完全在前端实现，零后端改动，30分钟内有效，刷新/重启浏览器都能恢复，实现成本低

选择方案 2。

---

## 遗留问题

### Android 通知条件太严
**现状**：只有 `document.visibilityState === 'hidden'` 时才触发通知，如果用户"看着 App 等回复，中途锁屏几秒又解锁"，可能永远触发不了。

**后续优化**（需要重新打包 APK）：
- 增加 `wasBackgroundRef` 跟踪"流式期间是否曾去过后台"
- 条件放宽为 `hidden || wasBackgroundRef.current`

### Windows 端无通知
**现状**：`window.YuanshuBridge` 只在 Android 端存在，Windows/浏览器端是 `undefined`。

**后续优化**（需要 Rust + 重新构建 exe）：
1. `app/src-tauri/Cargo.toml` 加 `tauri-plugin-notification = "2.0"`
2. Rust 侧注册插件
3. 前端调用 `@tauri-apps/plugin-notification` 的 `sendNotification()`

---

## 相关文件
- `frontend/src/components/ChatArea.tsx`：核心修改
- `frontend/dist/`：已构建的前端产物（验证通过）

## 验证状态
- ✅ TypeScript 编译通过
- ✅ Vite 构建成功（无错误）
- ⏸️ 真实场景测试待用户验证（需要重启 pi-web 服务才能加载新前端代码）
