# pi-web 更新日志

> 每次发版：bump `engine/unified-chat.mjs` 的 `APP_VERSION` → 这里加一条 → 构建 `frontend/dist` → 双推。

## [Unreleased] - 2026-09-06
### 新增
- 聊天区接入运行观测状态栏：展示阶段、工具数量、情绪摘要与失败重试入口。
- 运行摘要补充记忆命中与上下文预览，聊天完成态支持详情查看并自动收起。
- 引擎控制台拆分配置、运行诊断、工具搜索与 Gateway 旁路，补齐刷新失败提示和移动端可读性。

## [2.6.0] - 2026-09-04
### 新增
- 工作台看板（桌面侧栏 + 手机「更多」）、进化引擎与跨会话回忆
- 水墨 / 竹影主题；本机 Aieyra Anthropic 网关给 Claude Code
- ppt-html 模板路径可配置（`PPT_HTML_TEMPLATES`）
### 修复
- PPT 生成与单页 refine 的 SSE 断连会 abort/dispose agent
- htmlPath 前缀穿越；小说目录与自愈提示词不再写死 D 盘路径
- CHANGELOG 看板实际能读到仓库根的更新日志

## [2.5.0] - 2026-08-15
### 新增
- 正式版本体系：版本常量 + CHANGELOG 更新日志，看板顶部显示 pi-web 版本与最近更新
### 修复
- 时间引擎崩溃：server.mjs 缺失 `createTimeEngine` 导入与 `timeEngine` 变量声明，前端一用时间引擎即崩（反复重启 42 次的诱因）
- 更新：pi 引擎 0.84.1 → 0.84.2

## [2.4.0] - 2026-08-15
- 安装一条命令化：极简版（纯 zip）+ 全自动版（装 git）双脚本，`irm … | iex` 一条命令部署
- 全局安装支持：`npm i -g git+https://gitee.com/linxinyu520xue/pi-web.git` 后 `pi-web` 即用（setup.mjs 自初始化）
- 外网分享服务固化：start-share.cmd 一键启动 8644 + cloudflared 隧道

## [2.3.0] - 2026-08-14
- 断线自恢复：任务进度快照（/api/tasks/active）+ 前端断流自动恢复轮询
- OpenIM 评估结论：不需要，SSE 心跳 + 断线重连已够

## [2.2.0] - 2026-08-12
- 经验沉淀台：提案制（plan/approve/reject/rollback）+ 基因反馈闭环（效率/可靠/适应三滑块）
- pi-reasonix 扩展：DeepSeek 前缀缓存优化（命中率实测 94%+）

## [2.1.0] - 2026-08-11
- 多 provider 模型通道策略：默认 opencode-go 套餐 deepseek-v4-flash，图像自动降级切换
- 技能体系接入：web-search / image-generation / voice-transcribe / session-export-redacted

## [2.0.0] - 2026-08-10
- 记忆系统：固定记忆 + 记忆日志自动沉淀 + 经验库（跨会话长期有效）
- 情绪引擎：VAD 三维情绪感知，对话自适应语气
- 工作空间分类视图（工程/文档/生成物/交付）+ 一键交付 + 文件断点续传
- 外网分享 share_project：稳定域名 + 自动复制目录
- 会话分支 / 模板 / 项目分组 / 主题系统
## 2026-09-06

- 第一批主驾工作台升级：新增统一运行观测快照与 `/api/run/overview`，Board/Engine 展示主驾健康和判断→执行→记忆→交付阶段。
## 2026-09-06

- 第一批主驾工作台升级：新增统一运行观测快照与 `/api/run/overview`，Board/Engine 展示主驾健康和判断→执行→记忆→交付阶段。
