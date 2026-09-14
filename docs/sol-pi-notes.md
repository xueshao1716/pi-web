# SoL-Pi 调研笔记

对 [NVlabs/SoL-Pi](https://github.com/NVlabs/SoL-Pi) 的评估结论。2026-09-14 读的是源码，不是 README。

## 结论速览

- **没装、没降级**。元枢保留 Pi `0.85.1`，SoL-Pi 只作为**思路来源**。
- 它真正的价值不是那四个机制，而是贯穿其中的一条纪律：
  **省下的必须是「重复」，不能是「证据」。**
- 已采纳的最小闭环见 [第四节：证据回读](NAMING.md#四证据回读)。

## 它是什么

NVIDIA Labs 出的 [Pi](https://github.com/earendil-works/pi) **独立扩展**（MIT，TypeScript，
2026-09-02 建仓）。明确声明不改 Pi、不 vendor 源码、只 import 公共 API、默认全关。

四个机制，都是"自动研究循环"里活下来的效率优化：

| 机制 | 做什么 |
|---|---|
| Action Fusion | 编辑/写入时把后续校验命令塞进同一次工具调用 |
| ObservationPack | 大工具结果换成稳定句柄 + 分页精确召回 |
| Evidence-Preserving Reducer | 长诊断日志压成回执，每条保留引用必须能在归档里逐字匹配 |
| Online Context Compact | 已完成的计划步骤作为 Pi 原生压缩的候选点，压完自动续跑 |

## 版本适配（实测，不是推断）

| | |
|---|---|
| 元枢本机 Pi | **0.85.1** |
| SoL-Pi 开发/测试基准 | **0.84.2** |
| peerDependencies | 全是 `*` → npm 不会拦安装 |

照它自己的 `scripts/check-pi-compat.mjs` 清单对着本机 0.85.1 逐项跑过：
**9/9 项公共 API 全部健在**（`createBashToolDefinition` / `createEditToolDefinition` /
`createWriteToolDefinition` / `getAgentDir` / `ModelRegistry.prototype.getApiKeyAndHeaders` /
`SessionManager.prototype.getSessionDir|getSessionId` / `CONFIG_DIR_NAME` / `pi-ai/compat complete`）。

**但剩余风险在行为层，集中在 Online Context Compact 与 TUI** —— 它的兼容文档自己写死了
0.84.2 语义：

- `ExtensionContext.compact()` 会**先中止正在跑的 agent** 再摘要
- `agent_settled` 只在整轮彻底排空后才触发；「一个从不发 `agent_settled` 的 Pi 构建根本不会启动边界压缩」
- 「**Pi 0.84.2 的 `sendMessage()` 不返回 Promise**」—— 它的续跑屏障建立在这上面
- retained-tail 压缩默认值硬编码 **20,000 token**

结论：**Action Fusion / ObservationPack 稳；Online Context Compact 最脆**，
元枢又正好停在它基准之后的版本，所以不值得为此降级。

## 值得学的地方（按价值排）

### 1. 摘要是断言，不是事实

全项目最值钱的一条。Reducer 不信任模型给的摘要，要求每一条都能被**机器验证**：

- schema 对、`source_sha256` 对（陈旧/串台的摘要会被识破）
- `status` 必须与**观测到的退出码**一致 —— 模型不能把失败说成成功
- 每条 evidence 必须是原文**逐字节连续子串**（`body.includes(quote)`），改一个字整张回执作废
- 失败日志若读起来像失败，**必须带 failure 证据**，否则拒绝
  —— 挡住「真失败被摘要成一句干净总结」
- 提示里明写 `authority=... retains diagnosis, repair, rerun` ——
  reducer **只许保全证据，不许下诊断**

**可复用面很广**：元枢凡是有「模型压缩/归纳」的地方都能套这一套。

### 2. 回读指针必须可执行

ObservationPack 的占位符不是"已截断"，是一句**能执行的话**：

```
id: obs_<24位十六进制>
original_bytes / original_lines / estimated_tokens
retrieve: call obs_recall with {"id":"...","offset":0}; continue with returned next_offset
```

对比元枢原先的「如需完整内容可重新读取」——没给路径、没给 id、中间段也没有归档。

**已落地**：见 [NAMING.md 第四节](NAMING.md#四证据回读)。

### 3. 先发全文 N 次，再替换

`FULL_SENDS = 2`：大结果**前两次请求仍发全文**，之后才换占位符。
承认模型可能**还在用**这个结果；从第 1 次投影就截断会饿死正在读它的模型。

元枢目前是立即压缩。**待评估**。

### 4. 机械细节（都已借进归档实现）

- **按整行截断**，绝不切半句
- `trimUtf8End`：按字节限长时回退多字节字符边界
- **确定性内容寻址句柄**（`toolName\0toolCallId\0内容哈希`）→ 反复投影拿到同一个 id
- 归档写入：`O_NOFOLLOW`（拒符号链接）、`0o600`、`O_EXCL`；复用前**逐字节校验 size + hash**
- **组合规则**：ObservationPack 跳过已是 reducer 回执的内容 —— 不压缩"压缩过的证据"

### 5. 区分「没跑」和「跑了失败」

Action Fusion 三个哨兵：`[then_run:succeeded|failed|skipped]`。
若 mutation 本身失败而后续命令被请求，把错误包成 **skipped** ——
明确告诉模型「命令**没跑**」，而不是让它以为跑了但失败了。
失败时把 mutation 输出和命令错误**拼在一起抛出**，不丢证据。

另有 `assertUnchangedBeforeCommand`：跑后续命令前取文件 sha256，**主动 yield 一次**再取一次，
两次不一致就拒绝执行 —— 等于承认"我自己的锁不是全局的"，用哈希夹住那个窗口。

### 6. 压缩是笔买卖

Online Context Compact 算 breakeven：还差多少请求才回本，带安全系数
（首次压缩按 2 倍余量）、缓存写读比（默认 12.5）、以及"压缩造成的缓存债要还"；
**不压的时候也记录原因**（`deferred_*` 一串）。

元枢 `needsMidLoopCompact` 是固定阈值（`turn>=8 && chars>=20000`）。
固定阈值更可预测，经济模型更讲道理但依赖"还剩多少请求"这种估计。
**可借的是框架而非整套模型**：至少在不压缩时也记一句原因。

### 7. 锁键必须 canonical

`canonicalQueueKey` 用 `realpath()` 归一化，**并沿路径向上找最近存在的祖先**
来处理"文件还不存在"（写入会创建它）。否则 `a.txt` 与 `./a.txt` / 符号链接会拿到不同的锁。

元枢是**屏障式**互斥（`parallel:false` 工具形成屏障，同轮内绝不重叠，设计本身干净），
但屏障只管**同一轮**；元枢支持多会话，**跨会话写同一文件没有协调** ——
AGENTS.md 里「同一时间只允许一个会话改源码」是一条**约定，不是机制**。**待评估**。

## 不用学的

- 元枢的屏障式工具调度 + 结果保序 + 「abort 不撒谎」（已启动排空、未启动补合成错误）
  本身设计干净，不必换成按文件队列
- Online Context Compact 的**具体机制**依赖 0.84.2 语义（见上）

## 安全面（若将来考虑安装）

- Reducer 会把诊断日志**发到 reducer 模型**（可能出机器），
  其密钥探测器官方自称"预防措施而非完整扫描器"
- 建议只开两个本地机制、无额外模型调用：
  `{"actionFusion": true, "observationPack": true, "evidencePreservingReducer": false, "onlineContextCompact": false}`
- 安装路径：`pi install git:github.com/NVlabs/SoL-Pi`（需 `pi` CLI）
- 元枢走的是**进程内 SDK**（`createAgentSessionServices` + `DefaultResourceLoader`），
  而 `DefaultResourceLoader` 支持 `additionalExtensionPaths` / `extensionFactories`，
  Pi 也有 `discoverAndLoadExtensions` —— **扩展会被加载**。
  但「扩展在元枢这条路径上真的生效」**没有实测过**，要装一次才知道。
