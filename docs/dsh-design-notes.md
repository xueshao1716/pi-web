# dsh 设计亮点学习笔记

> 日期：2026-08-14
> 对象：`@deepseek-ai/dsh` v0.1.0-rc.6（DeepSeek Harness，本机 npm 全局安装）
> 来源：README / 源码（lib/ 编译产物，100+ 个 `@deepseek-ai/dsh-*` 插件包）
> 定位：纯设计学习沉淀；dsh 本身是 RC 版，建议取其思想、轻量自研（pi-web engine/ 已按此路线落地）

---

## 1. 微内核架构：能力都是"接缝"（最核心）

100+ 个 `dsh-*` 插件包，每个关注点一个包，**没有特权核心**：
agent-loop、code-runtime、sandbox、approval、compaction、session-*、tool-*、
subagent、typert、permission-presets、user-questions、trajectory……

- 每个能力定义成 **Service Seam**（接口契约 + 错误语义 + 生命周期），
  具体实现（Provider）可整体替换、可卸载。
- 包内约定：`types` + `index`（纯 Service Definition）+ 独立实现包。
- 前端 UI 也是插件（`dsh-client-ui-*` 几十个），浏览器可直接消费。
- 组合：`dsh.profile.bundles`（有序插件包列表）→ profile `cordis.patch.yml`
  → home 级 `$DSH_HOME/cordis.patch.yml` → `--patch` 覆盖层。
  用 `--dump-config` 可无启动检查组合结果。

**可借鉴**：能力边界先切成"接口 + 实现"，再谈功能堆叠。

## 2. 工具调度器：屏障 + 有界滚动池（agent-loop）

- **排他调用形成屏障（barrier）**：屏障前的工具全部跑完才放行后面的。
- **并行调用用有界滚动池**：并发上限封顶，超出排队。
- 分发可以重叠（overlap），但**策略、结果、结果上下文严格保持模型顺序**。
- **Abort 语义严谨**：
  - 中止时给未启动的调用补**合成错误结果** → 回放（replay）仍然有效；
  - 调度器内部故障 → 停止补货、排空已启动的，**绝不伪造工具结果**。

**可借鉴**：工具调用的"保序 + 中止不撒谎"是防乱序/防幻觉的关键。

## 3. 沙箱升级阶梯（安全模型，最值得抄）

- 权限阶梯**严格单向**：`read-only → workspace-write → danger-full-access`，
  只能向更宽升级；`read-only` 是地板（nothing escalates to it）。
- **模式在执行时校验**（per-call truth），不烘焙进工具 schema
  （schema 是注册表全局的，模式是每调用真相）。
- 参数配对校验：`sandbox_permissions` 必须配 `justification`（非空句子），
  防模型瞎请求。
- **fail-closed 审批链**：升级请求先走用户审批通道，无人应答自动拒绝。
- 模型可见的统一拒绝标记：
  `[sandbox: file access denied under X mode]`——所有执行族共用同一词汇，
  模型能识别策略拒绝，并在拒绝时获得升级提示（nudge）。

**可借鉴**：权限只升不降 + 拒绝标记模型可见 + 审批 fail-closed。

## 4. Code Runtime 可移植契约（比"跑模型写的代码"高一层）

承诺**跨后端可移植**：一份 namespace 列表在 TS worker / Python 后端都有效。

- 统一保留名单：`console`（worker 日志捕获）、`__dsh_main__`/`__builtins__`/
  `__name__`（Python 引导）、`__debug__`（CPython 编译期常量）——
  防止"某后端能用、另一后端撞车"。
- 保留词取 **ECMAScript ∪ Python 并集**（如 `lambda` TS 能过、Python 必炸 → 两边都禁）。
- 错误成员统一拒绝：JS Error 的 `name/message/stack` + Python 异常协议的
  `args/with_traceback/add_note` + 所有 dunder 形式（`/^__.+__$/`）。
- 扩展新语言 = 收窄并集 = 破坏性变更审查（by design）。

**可借鉴**：先定跨实现契约（可移植性），再谈实现——杀死整类兼容性 bug。

## 5. 审批系统："事件日志即状态"

- 结果词汇只有 4 个：`allowed-once / rejected / cancelled / unavailable`。
- 策略：`ask / never`；**无应答者自动 fail-closed**。
- 会话内策略切换 = 事件日志的**纯折叠**（replay 日志就是当前状态，
  resume 无需额外 catch-up 机制）。

**可借鉴**：状态从事件日志重放推导，而不是另存一份可变状态。

## 6. Workflow 组合子纪律

- `parallel()` / `pipeline()`：**fatal 错误直接重抛**（拼错选项、触发上限
  必须响亮失败），普通子任务失败映射为 `null`。
- `fatal` 标志在每个 catch 点显式区分，而不是含糊吞错。

## 7. 事件监听器隔离

- 生命周期事件派发时，每个监听器失败被**包含并记日志**，不破坏主流程；
  `workflow/end` 恰好触发一次。
- 错误体系：`HarnessError` 带机器可路由的 `code` 分类法 + `errorChain`。

## 8. 会话持久化（工程细节）

- JSONL + Zstandard 压缩，格式版本化（`SESSION_FORMAT_VERSION`）。
- SessionId 是未校验的 branded string → **路径使用前必须编码**（防穿越/防碰撞）。
- 原子写、截断修复（truncation-repair offset）、写批量延迟上限。

## 9. Runtime Context 投影

- 动态运行时上下文的**持久化投影**：只保留最后一个快照，无变化不提交
  （project 只在新值不同时生成候选消息）。
- 替换类事件会使旧投影失效（`isReplacementSurfaceEvent` + `sourceEventSeqs`）。

---

## 一句话总结

dsh 真正的强项不是功能多，而是**纪律**：

1. 接缝切得干净（接口与实现分离，无特权核心）
2. 错误不撒谎（fatal 显式、abort 不伪造结果、监听器隔离）
3. 权限只升不降（严格阶梯 + fail-closed 审批）
4. 契约先于实现（跨后端可移植性）
5. replay 即状态（事件日志是唯一事实源）

功能层面 pi-web 已在追赶（engine/ 6 模块 + code-mode/ 3 模块），
但这些工程纪律才是拉开差距的地方。
