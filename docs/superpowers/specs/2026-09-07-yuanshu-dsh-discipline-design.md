# 元枢吸收 dsh 纪律（三刀）

日期：2026-09-07  
状态：实现中  
来源：对照笔记 `docs/dsh-design-notes.md` / `docs/pi-web-vs-dsh-message-flow.md`，产品结论「dsh 当执行臂，元枢当大脑」。

## 目标

把 dsh 三条工程纪律抄进元枢主循环，**不**把会话改成事件溯源，**不**切默认主驾。

## 不做什么

- 30+ 事件类型 + surface 投影折叠
- 插件热替换进主聊天
- 改 pi SDK `context.js` 的读路径
- 把 bash 日常命令全部改成弹框

## 三刀

### 1. 上下文命名区段

`engine/yuanshu-prompt.mjs`：sections 按序拼接成一条 system。  
区段：`persona / protocol / rules / tools / skills / memory / time / runtime / task`。空段跳过。`replaceSection` 只换一区。Runtime 快照无变化不提交。

`handleUnifiedChat` 用 `buildYuanshuSections` + `prependAssembledSystem` 替换一串 `unshift`。

### 2. 沙箱阶梯

`engine/yuanshu-sandbox.mjs`：`read-only → workspace-write → danger-full-access`，只升不降。模式是每调用真相，不写进工具 schema。

- 默认 `workspace-write`（读写工作区、普通 bash）
- 规划模式 `read-only`（写/执行直接拒绝）
- 危险 bash（与 `approval.mjs` 同一正则）要 `danger-full-access`；无应答者 fail-closed
- `sandbox_permissions` 必须配非空 `justification`
- 拒绝词统一：`[sandbox: file access denied under X mode]`
- `workspace-write` 下路径必须落在工作区根内

接到 `runYuanshuToolRound`，在 `policyDecide` 之后、执行器之前。

### 3. 非破坏压缩

`engine/yuanshu-compact.mjs`：

- 模型面：摘要 + 近尾消息（`view`）
- 内存：原文留在 `archive`
- 会话文件：`compactSession` 重写前把丢掉的消息追加到 `*.archive.jsonl`（pi 仍读瘦身后的主文件）

不改 JSONL 消息树，parentId 分支仍在。

## 验证

冻结评测绳加 cases；`npm test` 全绿。不跑真模型。默认主驾仍是 pi。
