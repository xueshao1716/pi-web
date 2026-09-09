# 元枢吸收 VoiceMem 三条（文本工作台版）

日期：2026-09-07  
状态：已落地（不接 VoiceMem pip；需重启 8787 后引擎侧生效）

## 目标

不把 VoiceMem / Mem0 装进 8787。只吸收三件事：任务记忆先路由再注入 Top-5；情绪残留挂上「对谁/对什么」；人格提案改会后沉淀，一轮过阈值不写。

## 做法

1. **左脑路由**  
   新模块 `engine/yuanshu-memroute.mjs`。从记忆日志 / 纠正 / 关系里按查询 + 记忆.md 标题（当 Schema）打分，**最多 5 条**进上下文。`loadMemory()` 不再把纠正 8 条 + 关系 10 条整份跟上。工作协议仍单独常驻，不占 5 格。

2. **右脑边**  
   `residue.edges[实体] = { warmth, hurt, curiosity, n }`。实体从「对/跟/和/关于 X」以及记忆.md 标题命中抽出。全局三维杠仍在，边是附加。潮汐 JSON 可带精简 `e`。

3. **长短归因**  
   本轮只把证据推进 `pendingPersona`。`flushPersonaAttribution(sessionId)` 在收轮调用：同一实体+种类出现 ≥2 次才 `proposeMemoryNudge`。评测 key `eval-` 不提案。

## 接线

- `loadMemory` 走路由
- `endYuanshuEmotion` + pi `turn_end` 调 flush
- `emotionPrompt` 命中实体时带上那条边

## 不做什么

- 不接 VoiceMem pip / 声纹 / VAD 四段检索
- 不改默认主驾
- 不做工作台边列表 UI（本轮只进指令和记忆注入）
