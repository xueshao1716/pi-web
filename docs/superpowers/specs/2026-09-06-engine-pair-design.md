# 双引擎主次对（Engine Pair）

日期：2026-09-06  
状态：第三刀——先长元枢；外置引擎搁下

## 目标

随时更换**主引擎 / 次引擎**，接到后台，下一条消息生效，不重启 8787。  
最终要造**自己的引擎**，pi / dsh 只是可替换适配器，不是永久双核。

## 三份引擎

| id | 名字 | 今天能不能主驾 | 定位 |
|---|---|---|---|
| `yuanshu` | 元枢 | 能（`handleUnifiedChat`） | 自制循环，要长成的那条 |
| `pi` | pi SDK | 能（官方 agent 管线） | 厂商引擎，现默认主驾 |
| `dsh` | dsh | 能（`handleDshChat` 一轮 headless） | 厂商适配器，可卸；`dsh_task` 仍是执行臂 |

默认对 = 今天的真实行为：`primary=pi`，`secondary=yuanshu`（agent 失败兑底 unifiedChat）。  
`PI_USE_AGENT=0` 仍强制本轮走元枢（运维/冒烟逃生口）。

## 不做什么（第一刀）

- 不把 dsh 伪造成完整对话大脑（适配器未写就声称主驾 = 撒谎）
- 不改会话 JSONL / 记忆 / 出图旁路（引擎换了，人还是小语）
- 不按会话存一份（全局一对；会话级以后再加）
- 不在对话中途热替换正在跑的那一轮（下一轮再生效）

## API

- `GET /api/engine/pair` → `{ primary, secondary, catalog, lead, deferred }`
- `POST /api/engine/pair` `{ primary, secondary }` 或 `{ swap: true }`

`lead` 是本轮实际主驾。非原生通道只逼 **pi** 兑底元枢；dsh / 元枢不受模型下拉绑架。`PI_USE_AGENT=0` 仍强制元枢。

## 第二刀（dsh 对话适配器）

- `engine/dsh-chat.mjs`：把最近对话 + 本轮用户打成自包含 prompt，spawn dsh `--profile headless`
- 同一套会话 JSONL（`appendMessage`），SSE `delta`/`done`
- 客户端断开 abort → kill 子进程
- **不是** unifiedChat 换个 DeepSeek 模型。dsh 仍是可卸厂商，不是第二套自制循环

## 第三刀（先长元枢）

外置（pi / dsh）先不继续加能力。默认对仍是 `pi` 主驾、`元枢` 兑底，等元枢稳了再切默认、再看外置。

- 主循环工具轮收口到 `engine/yuanshu-loop.mjs`：走 `scheduleToolCalls`（断连不启动后续工具、读写互斥、只读可并行）
- `run_code` 挂进 UNIFIED_TOOLS：元枢开口 `initEngine()`，Code Mode 不再只活在 `/api/engine/chat`
- Gateway `StandardAgentLoop` 仍是旁路演示，不替换主聊天（记忆/出图/规划还在 unifiedChat）

## 第四刀（循环再稳 · 2026-09-06）

对照 Goose 空回合/截断 tool JSON、OpenHands 工具硬中止。默认主驾仍是 pi。

- 工具执行吃 abort：`execFileAbortable` → bash / dsh_task；调度器把 `signal` 传进执行器
- 空回合：同模型最多 3 次，不落盘空 assistant；耗尽兑底其他模型
- 截断 tool JSON：立刻停，不再回灌死循环

## 第五刀（独立评测绳 · 2026-09-06）

- `engine/yuanshu-eval.mjs` + 冻结用例：稳定性 / 协议 / 记忆 / 工具轮
- `GET /api/engine/pair` 带 `eval`：`passed/total/score`
- 不跑真模型。出片和联网仍不在这条绳上
- 默认主驾仍是 pi；分数是「循环契约」，不是「可以切默认」的许可证

## 第六刀（横评 · 2026-09-06）

- 同一条 `POST /api/chat`，临时切主驾，SSE `note` 核对 lead，跑完还原
- 现网 10 题：元枢 9/10、pi 9/10（都栽在 B3 恰好五字）；元枢均时 9.7s，pi 14.3s
- 契约绳元枢 18/18（含 VAD 情绪开轮/收轮）。默认主驾仍是 pi

## 以后

1. 默认主驾再评估（评测绳全绿且现网明显领先再用）
2. pi / dsh 可卸，元枢独自当家
