# Codex 接入 aieyra 四池模型设计

日期：2026-09-01

## 目标

将当前 pi-web 已配置及 aieyra 实时模型池中的 32 个文本/代码模型接入 Codex 桌面版与 CLI，保留现有 51relay 和 WorkBuddy 路由，不改变 Codex 当前默认模型。

## 架构

Codex 继续使用本机 `http://127.0.0.1:8915`。本地 `codex-key-router/proxy.js` 根据请求中的 `model` 精确选择上游：

- `aieyra-gpt-*` → aieyra GPT key
- `aieyra-grok-*` → aieyra Grok key
- `aieyra-claude-*` → aieyra Claude key
- `aieyra-gemini-*` → aieyra Gemini key
- `hy4`/`hy3`/`gpt-5.6-luna` → 保留 WorkBuddy
- `claude*` 旧模型 → 保留 51relay Claude key
- 其他旧模型 → 保留 51relay GPT key

aieyra key 只从 `C:/Users/xuexiaofeng/.pi/agent/auth.json` 在运行时读取。Codex 模型目录只保存带池前缀的模型标识，不保存凭据。

## 模型目录

从 `models-store.json` 的四个 aieyra provider 读取基础配置，并实时查询四个 key 对应的 `/v1/models` 清单，共 32 项：GPT 13、Grok 3、Claude 9、Gemini 7。Codex slug 使用 `aieyra-gpt/<id>` 等唯一名称，避免不同池的同名模型冲突；路由器去掉对应前缀后向 aieyra 发送原始模型 ID。图像、音频、实时和视频模型按文本/代码范围排除。

每个条目基于现有 Codex 官方条目模板生成，保留 Codex 所需的 `shell_type`、`model_messages`、推理级别和工具字段，使用 `unified_exec` + Responses API。目录写入前备份，JSON 解析失败则不替换原文件。

## 错误处理与回滚

- 未识别的 aieyra 前缀返回明确的 503，不误发到其他池。
- 缺失 key 返回 503，不输出 key 内容。
- 上游错误原样透传状态和响应。
- 修改前备份 config、catalog、router；任一步校验失败都保留原配置，可通过备份恢复。

## 验收

- catalog JSON 可解析且包含 32 个唯一 aieyra 条目。
- 路由器 healthz 显示四个 aieyra key 已加载，但不显示凭据。
- `/v1/models` 合并返回四池模型。
- 四个池各至少完成一个真实请求；GPT、Grok、Gemini 的 Responses 请求通过，Claude 返回 aieyra 余额不足；GPT 工具声明请求通过。Codex CLI 已确认能选中新 slug 并打到路由器，但带完整工具集的流式会话未完成，作为兼容性残留风险记录。
