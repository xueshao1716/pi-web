# 元枢插件接缝（第一刀：prompt 区段贡献）

日期：2026-09-07  
状态：实现中

## 目标

把 dsh「一切皆插件」收成 **元枢循环上的接缝**，不是 100 个包，也不是把主聊天换成 Gateway。

主循环仍是 `handleUnifiedChat`。插件只通过命名接缝贡献能力。一轮对话开始时收集一次，中途不热替换。

## 不做什么

- 不把 `StandardAgentLoop` 接到 `POST /api/chat`
- 不拆 npm 包、不上 Cordis profile
- 网页仍只能挂 echo/clock，不能往 system 里塞任意 mount
- `yuanshu:` 前缀锁定，不能卸

## 第一刀：prompt-section 接缝

`engine/yuanshu-seams.mjs`

- 插件 mount 返回 `{ seam: "prompt-section", section, contribute(ctx), replace? }`
- `collectPromptContributions(registry, ctx)` 按注册序收集
- `mergeContributedSections(base, contribs)`：默认追加到同名区段；`replace: true` 才整段替换
- `assembleYuanshuSystem(baseOpts, registry, ctx)` = `buildYuanshuSections` + merge

内置锁定插件（`initEngine` 注册）：

- `yuanshu:prompt:time` → `time`
- `yuanshu:prompt:persona` → `persona`

宿主仍拼 protocol / skills / memory / rules。时间与身份改由接缝贡献；无 registry 时 `assembleYuanshuSystem` 用 baseOpts 兜底。

## 以后（本刀不做）

工具执行走 ToolRegistry、沙箱检查器接缝、compaction 投影接缝。

## 验证

单元测试 + 评测绳加 1 例。默认主驾仍是 pi。
