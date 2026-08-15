# pi-web 更新日志

> 每次发版：bump `server.mjs` 的 `APP_VERSION` → 这里加一条 → `public/index.html` 资源戳 `v=` +1 → `public/sw.js` 的 `CACHE` 名 +1 → 双推。

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
