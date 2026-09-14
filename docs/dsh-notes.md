# dsh 借鉴笔记

对 DeepSeek Harness（本机 `@deepseek-ai/dsh` **0.1.5-rc.2**，`%APPDATA%\npm\node_modules\@deepseek-ai\` 下约 230 个 `dsh-*` 包）的评估结论。2026-09-14 读的是**实现**，不是 README；每条结论带 `文件:行号`。

判断尺子是元枢自己的四条价值观：**没被观测的说法不算证据 / 宁可漏不可灌水 / 人工审批边界 / 失败必须可见**。

## 结论速览

- **元枢早就从 dsh 借过东西**，而且有些借完了还在注释里标了出处（`engine/output-guard.mjs:2`：「借鉴 dsh repeat-tool-reminder / llm-retry 插件设计」）。
- 本轮四条候选"值得吸收"里，**三条元枢已经有了**，其中一条（工具结果压缩）元枢**比 dsh 更强**。
- **真缺口只有三处**，且都需要产品决策而不是照搬：跨轮目标驱动、fork 型子智能体、沙箱默认方向。
- dsh 最诱人的那套东西（声明式装配 / 服务注入 / patch 三层覆盖）**不建议吸收**——它的收益全部来自 dsh 独有的三个前提，元枢一个都没有。理由见第五节。

## 一 dsh 在本机的形态

| | |
|---|---|
| 组合根 | `~\.dsh\profiles\<name>\cordis.yml`（**空数组**） |
| 真实行集 | `dsh-base\cordis.patch.yml`，**84 行**，以一次无 id 的 `insert` 整体追加 |
| 叠加顺序 | bundles → profile 的 `cordis.patch.yml` → `--patch`，**后写的赢** |
| 覆盖规则 | **整键替换，绝不深合并**（`cordis-plugin-include\lib\index.js:100-103`） |
| 激活语义 | 行顺序**无加载语义**；由服务是否可用驱动（`cordis\lib\index.js:1316-1343`，`provide()` 后 `reflect.notify()` 让缺服务者 INACTIVE、齐了就 `_reload()` 跑 `apply()`） |
| 调试 | `dsh --dump-config`（打印合成树并标注每行来源） |
| 元枢实际用的 | `dsh --profile headless`，即 `dsh-base` + `dsh-headless` —— 也就是**整套 harness** |

`dsh-headless\cordis.patch.yml` 只**加 3 行**（`code-runtime` / `headless-startup` / `headless-runner`）+ 覆盖 2 行 config，**没有禁用 `dsh-base` 的任何一行**。所以元枢每轮启动都带着 sqlite 会话查询、OTEL 遥测、插件清点这些它不用的东西。想瘦身不用改 dsh，建一个自己的 profile 在那个 profile 的 `cordis.patch.yml` 里 `disabled: true` 即可——**这是 patch 层"做减法"的能力，元枢目前没利用**。

## 二 已经有了的（**不要去"吸收"**）

这几条是四条调研线里被推荐最多的，逐条核对元枢实现后**全部已有**：

| dsh 机制 | 元枢现状 | 证据 |
|---|---|---|
| **重复相同工具调用提醒** | **已有**，且注释明说来源 | `engine/yuanshu-loop.mjs:185-186` `recordStuckEvent` + `detectStuck`；`engine/output-guard.mjs:2` 标注"借鉴 dsh repeat-tool-reminder" |
| **改前必读 / 外部改动后拒绝覆盖** | **已有** | `engine/tools/unified-tools.mjs:340-344`：锁内重读，内容变了就拒绝写入并提示重新读取 |
| **工具结果省略账本** | **已有，且更强** | `engine/reasonix-tools.mjs:90` 报省略字符数与行区间；`:78,92` **还会嗅探省略段里的失败信号并摘出来**（"不要当成成功"）——dsh 没有这一层 |
| **溢写失败时退回原文** | **已有** | `engine/reasonix-tools.mjs:88`「原件未归档（归档不可用），如需完整内容请重新执行该命令」；dsh 的对应策略见 `dsh-spill-local\lib\index.js:43-66`（"A spill failure must NEVER turn a successful tool call into an isError"） |
| **压缩保持 tool-call / tool-result 成对** | **已有** | `engine/unified-chat.mjs:181-188` 成对输出 assistant `tool_calls` + `role:"tool"` 结果。调研线警告的"孤儿 tool-result 会让 provider 400"**对元枢不适用** |
| **大结果先原样发 N 次再压缩** | **已有，且比 dsh 保守** | `engine/reasonix-tools.mjs:110` `FULL_SENDS = 2`（源自 SoL-Pi 的 ObservationPack，见 `sol-pi-notes.md`） |

写进这份文档的首要目的就是**防止以后有人（包括我）再把它们当缺口重做一遍**。

## 三 真缺口（三处，都需要产品决策）

### 3.1 跨轮目标驱动 —— 元枢没有

dsh：`dsh-goal-round-driver` 每轮注入一条 `source.kind === "goal"` 的 user 消息（`lib\index.js:11-18`），要求"以当前工作区和持久会话状态为准，不要相信早前叙述"。**三重闸门**：

1. **回合上限**：默认 256（`dsh-goal\lib\index.js:588`），超限自动 block（`round-driver:125-131`）
2. **单轮预约**：全链路核对 `goalId + revision + round`，不匹配就 reject（`round-driver:277-303`）
3. **错误即解除**：`agent/error`、`max-tokens`、异常 abort 一律 `disarm`（`round-driver:201-203, 264-272`）

判定权限被卡住：`complete` / `blocked` 只接受**直接人类输入**或当前目标的确切已承认回合（`dsh-tool-goal\lib\index.js:49-80`）；`blocked` 还要跑满 3 圈（`:115`）。**会话恢复后 activation 回到 `disarmed`，必须人类说"继续"才重新武装**（`dsh-goal\lib\index.js:595-601`）——这条与元枢"人工审批边界"完全同向。

> 元枢现状：有时间引擎（定时任务）和任务看板，但没有"目标跨轮自动推进"。要不要，是产品决策——它天然与"不自动替用户做价值判断"有张力。**若要，三重闸门必须一起搬**，少任何一条都会变成自转。

### 3.2 fork 型子智能体 —— 元枢只有 spawn 型

差别只有一个 seed：fork 取父会话日志中**最后一个 `turn/end` 之前的平衡前缀**（`dsh-subagent-fork-in-process\lib\index.js:23-28`），spawn 不传 seed（`spawn-in-process\lib\index.js:35`）。能力声明 `inheritsParentContext` 为 true/false，工具描述按它自动改写措辞。

选哪个**不是 dsh 推理出来的**，是 composition 里两条硬编码工具行：spawn → `subagent`（continuable）、fork → `subagent_fork`（one-shot）（`dsh-base\cordis.patch.yml:349-367`）。另有防绕过设计：子深度取 `max(持久化 header, 运行期 options)`，**运行期只能加深、不能降低**（`dsh-subagent\lib\types\depth.js:18-25`）。

> 元枢现状 ≈ spawn（干净上下文 + 自包含 prompt）。fork 的价值是省掉重复总结上下文；实现路径是"把自身历史的一个平衡前缀作为子智能体初始消息"。中等成本。

### 3.3 沙箱默认方向相反

dsh 的沙箱三档 `read-only | workspace-write | danger-full-access`，**部署默认 `read-only`**（`dsh-sandbox-policy\lib\index.js:27-31,97-104`），会话内放宽只 append 一条 `sandbox/mode` 事件再 fold；`workspace-write` 下每次写操作**当场 realpath** 防符号链接换靶（`dsh-fs-sandbox\lib\index.js:153-166`）。

审批词汇只有 `allowed-once | rejected | cancelled | unavailable`——**没有"总是允许"**，每条授权只对该次操作有效（`dsh-user-approval\lib\index.js:30-35`）；缺审批通道或应答非法一律降级为 deny；`approval/asked` 与 `approval/decided` 必须成对且在同一 open turn 内，turn 外请求直接抛错（理由：与崩溃残尾无法区分，`:131-146`）。

> 元枢现状：审批注册表已在（`createApprovalInterceptor`、确认注册表、超时 fail-closed），沙箱阶梯也在，但**默认方向是宽松那端**。只改默认值就会改所有人的体验，所以列为待定。

## 四 不该吸收 / 不适用

| 项 | 为什么 |
|---|---|
| **声明式装配（patch 三层 + 服务注入 + isolate realm）** | 收益全部来自 dsh 独有的三个前提：**多会话共享一进程、三方插件分发、热重载**。元枢单进程单用户、模块自己人写，一个都没有。dsh 用 487 行 base patch 加 cordis/include/loader 三个包才撑住它；元枢十几二十个模块，声明式装配省下的只是"改一行 import"，代价是引入激活/等待/realm 一整套新运行时概念**以及一类新的静默失败**（id 打错或 `name` 不匹配只 warn 后跳过，行会悄悄不存在 —— `cordis-plugin-include\lib\index.js:51,93-98`）。**收益/成本比是负的。** 值得取的只有最薄一层：启动期显式清单 + 逐行自检"这行确实生效了"。 |
| **LLM 摘要式历史压缩** | `dsh-compaction-basic` 用模型生成摘要（`thresholdRatio 0.8 / retainRatio 0.16`）。摘要是**模型生成的、不可验证的说法**，与元枢价值观正面冲突。只可取其中两条确定性约束：切点成对、摘要必须严格小于原文否则拒绝提交（`lib\index.js:15-17,900-919`）。元枢的确定性压缩更合适。 |
| **会话 JSONL 加格式版本号** | dsh 做得很漂亮（`SESSION_FORMAT_VERSION = 3`，逐版本相邻迁移，读未来版本明确拒绝并提示升级，`dsh-session\lib\index.js:56`、`dsh-session-format\lib\index.js:96,124-129`）。但**元枢不拥有那个格式**——会话文件由 Pi 的 SessionManager 写，元枢只往里追加自定义条目。除非元枢自己接管会话文件，否则加不了版本头。列为"不适用"而非"缺口"。 |
| **SQLite FTS5 会话检索 / OTEL 遥测 / 独立 todo 栈 / dsh 式 plan-mode** | 违背零依赖，或元枢已有等价物（工具级只读 Plan、任务看板）。 |
| **workflow 引擎（worker 线程 + vm）** | 引入新失败面；且它的 `agent()` 子失败返回 `null` 让脚本 `.filter(Boolean)`——违背元枢"失败必须可见"。可取的是"显式上限做跑飞兜底"与 `fatal vs per-item null` 的区分。 |
| **Ralph 的轮次报告契约** | 机制本身值得（`status/summary/evidence/nextSteps/blocker` + 状态-字段强校验 + 上限，`dsh-tool-ralph\lib\index.js:20-22,37-48,71-88`），但**元枢没有 ralph 工具**，没有落点。先记着。 |

## 五 一条方法论教训（附一处更正）

调研里我犯过一次**"一次测量当成实测"**的错：判断 dsh 不适合主驾时，我跑了 `dsh --profile headless "只回复两个字：收到"`，得到 **26.9 秒**，就直接写进了代码注释、CHANGELOG 和给用户的回答。

复测六次是 **4.4 / 4.7 / 4.68 / 4.73 / 4.76 / 5.0 秒**；`--dump-config`（只装配配置、不调模型）**0.25 秒**。26.9 秒是**单次冷启动**（230 个包未进文件缓存），不是常态。

结论方向没变（每轮新起子进程、无流式、无记忆，确实不适合当主驾），但**数字必须给分布或标清单次**。已更正 `engine/engine-pair.mjs`、`tests/unit/engine-pair.test.mjs` 与 CHANGELOG 的 `[2.10.2]` 条目。

> dsh 自己的 `dsh-token-meter` 正是治这个的：`measure()` 返回的 `baseline.kind` 只有 `usage`（provider 实测）才敢标成实测，否则一律 `estimated`；带 header 不匹配时 surface delta 归零，**不做跨路由减法**（`lib\types\index.js:97,107,117`）。元枢可以直接借用这个形状——任何数字旁边挂它自己的可信度标签。

## 六 尚未核实

- `dsh-jobs` 的 `job_output` 流式/最终输出的区分由哪个 producer 声明 `outputLimitBytes`（`dsh-jobs-local` 只透传不保留）。不影响本笔记任何结论。
