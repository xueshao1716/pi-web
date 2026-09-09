# 工坊智能填充：可选模型 + 带技能

日期：2026-09-07  
状态：已落地（需重启 8787 + 前端硬刷新）  
来源：修图/视频页填充慢、看不见模型、没带下面技能。

## 目标

智能填充走文本模型扩写提示词，必须：

1. **看得见、选得了**文本模型（不是出图/出片模型）
2. **默认 flash**，不要偷偷用聊天默认旗舰（慢）
3. **带上本页技能**：出图 = 万像人物 + 万像设计；视频 = Seedance + SHORTFORM

## 做法

- `pickExpandModel`：`body.model` 命中则用；否则 flash 文本模型；再否则 default
- 扩写 systemHint 拼技能 SKILL.md（单份截断，总长封顶）
- 响应带回 `model` / `modelName` / `skills`，按钮旁展示
- `PromptSmartFill` 内嵌文本模型选择，localStorage 按 kind 记住
- `directChat` 扩写限 `maxTokens`，避免 8192 空转

## 不做什么

- 不改出图/出片那只图像/视频模型选择器
- 不灌 prompt-architect（它禁止直接出结果）
- 不把技能 reference 全文件灌进填充
