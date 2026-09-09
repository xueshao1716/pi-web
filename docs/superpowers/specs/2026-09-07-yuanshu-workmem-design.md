# 元枢磁盘工作记忆（Planning with Files）

日期：2026-09-07  
状态：实现中

## 目标

把 Planning with Files 的「上下文是 RAM、文件是磁盘」抄进元枢：每会话三份 Markdown，开轮从 **prompt 接缝**注入。不是 MCP，不替代 `todo_write`。

## 文件

根目录：`~/.pi/agent/yuanshu-work/<safeSessionId>/`（测试注入临时目录）

- `task_plan.md`：阶段与勾选，整表覆盖
- `findings.md`：研究发现/决策，只追加
- `progress.md`：操作、验收、**失败**，只追加

会话 id 清洗后才入路径；写出根外即拒绝。单文件有上限，注入只带尾段。

## 工具

`plan_files`：`file=task_plan|findings|progress`，`content` 必填。`task_plan` 覆盖，另外两个追加。

短清单仍 `todo_write`。协议写明分工。

## 注入

插件 `yuanshu:prompt:plan` → 区段 `plan`。有文件才灌内容；任务句且尚无文件时给一句「多步请 plan_files」。闲聊「嗯」不灌。

开轮 `assembleYuanshuSystem` 的 ctx 带 `sessionId` + `message`。一轮只收一次。

## 不做什么

- 不改规划模式 `planPending`（只读锁）
- 不往用户工作空间写这三份文件
- 不自动把每次工具失败灌进 progress（模型自己记）
- 不接 Playwright MCP
