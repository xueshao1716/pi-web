# 记忆现行作废（Memory Supersede）

日期：2026-09-06  
状态：第一刀落地——写时作废 + 读时过滤

## 要挡住的失败

同一件事同时有两个现行答案。病例：`记忆.md` 已是 `wire_api=responses`，日志 9/5 仍写「必须 chat」，召回新旧一起进上下文。

## 不做什么

- 不把记忆改成 JSONL
- 不回填两千多条旧日志
- 不让园丁自动改记忆（对撞只报告；写入口是 `upsertMemoryFact`）
- 不改人格文件

## 模型

- `记忆.md` 的 `##` 章节是命名空间
- 一节多条并行事实时打显式键：`- **codex.wire_api**：responses`
- 日志新条目带 `topic` / `status`
- `status: superseded` 默认不进召回；`includeSuperseded: true` 给园丁/考古

## 写入口

`upsertMemoryFact({ section, topic?, text, reason? })`

1. 在对应章节替换同 topic 行（无键则写 `**现行**`）
2. 追加 `status: current` 日志
3. 同 topic 旧日志改 `superseded`

`autoMemorize` 流水账照旧追加，不进 topic 现行层。

## 读

`searchMemoryLog` / `loadRecentMemory` 默认跳过作废条。
