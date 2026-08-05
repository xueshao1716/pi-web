# 小语 · AI 工作台（pi-web）

基于 [pi 引擎](https://github.com/earendil-works/pi-coding-agent) 的 Web 工作台：会话、工具调用、媒体生成、工作空间管理，前后端一体。

## 🚀 新机器一键安装（Windows）

复制下面**一整条命令**到 PowerShell 运行，自动完成：装 Node → 下载源码 → 装后端 pi 引擎 → 生成令牌 → 启动服务：

```powershell
powershell -ExecutionPolicy Bypass -Command "curl.exe -L -o %TEMP%\pi-web-install.ps1 https://raw.githubusercontent.com/xueshao1716/pi-web/main/install.ps1 && powershell -ExecutionPolicy Bypass -File %TEMP%\pi-web-install.ps1"
```

装完后：
1. 浏览器打开 `http://127.0.0.1:8787`
2. 输入访问令牌（查看 `C:\Users\你的用户名\pi-web\.token`）
3. 配置 API 密钥（编辑 `~/.pi/agent/auth.json`，如 deepseek）

> 国内网络自动切换 ghproxy 镜像下载，无需手动处理。

## 特性

- 💬 多模型对话（deepseek / minimax / 小米 mimo 等）+ 思考 + 工具调用
- 🛠 编程工具：读文件 / 写文件 / 编辑 / 跑命令
- 🖼 媒体生成：配图、配音（自动归档到工作空间）
- 📡 外网分享：项目放入分享目录，一键生成公网链接
- 📦 工作空间：工程 / 生成物 / 文档 / 交付 四区管理，一键交付
- 📄 文档：Markdown / PDF / Office 解析
- 🌳 会话：分支、模板、项目分组、导出
- 🎨 主题编辑器、可视化页面设计器、技能面板

## 环境要求

- Node.js ≥ 20
- pi 引擎全局安装：`npm i -g @earendil-works/pi-coding-agent`

## 快速开始

```bash
# 方式零：Windows 一键安装（推荐给小白用户，自动装 Node + 下载 + 启动）
powershell -ExecutionPolicy Bypass -File install.ps1

# 方式一：一键安装向导（推荐，跨平台）
node setup.mjs            # 检测环境并引导
node setup.mjs --install  # 自动安装缺失依赖
node setup.mjs --start    # 启动服务

# 方式二：手动
# 1. 安装依赖（pi 引擎）
npm i -g @earendil-works/pi-coding-agent
# 2. 配置 API 密钥
#    编辑 ~/.pi/agent/auth.json（见下文“配置模型与密钥”）
# 3. 启动
node server.mjs
# 或 Windows：start.bat

# 3. 访问
# http://127.0.0.1:8787
# 首次打开输入访问令牌（见 .token 文件或环境变量 PI_WEB_TOKEN）
```

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PI_WEB_PORT` | `8787` | 服务端口 |
| `PI_WEB_HOST` | `127.0.0.1` | 监听地址 |
| `PI_WEB_TOKEN` | 自动生成 | 访问令牌（存 `.token`） |
| `PI_WEB_CWD` | `~/pi-workspace` | 工作空间根目录 |
| `PI_WEB_TOOLS` | `read,write,edit,bash` | 允许的工具集 |
| `PI_WEB_MODEL` | 第一个可用 | 默认模型 |
| `PI_PACKAGE` | 自动解析 | pi 引擎入口路径 |
| `PI_WEB_SHARE_HOST` | 空 | 外网分享域名（可选，配置后启用分享） |

## 配置模型与密钥

### 两个文件，分工明确

| 文件 | 位置 | 内容 | 是否入库 |
|---|---|---|---|
| `models-store.json` | `~/.pi/agent/` | 模型清单（ID、接口、地址、计费） | ❌ 本地私有（仓库提供 `models.example.json` 模板） |
| `auth.json` | `~/.pi/agent/` | 各 provider 的 API 密钥 | ❌ 绝不入库 |

### 模型清单（models-store.json）

仓库提供了精简模板 [`models.example.json`](models.example.json)，包含 6 个 provider 的代表模型：

```bash
cp models.example.json ~/.pi/agent/models-store.json
```

每个模型的字段：

```json
{
  "id": "deepseek-v4-flash",      // 模型 ID（请求时使用）
  "name": "DeepSeek V4 Flash",    // 显示名
  "api": "openai-completions",     // 接口协议：openai-completions / openai-responses
  "provider": "deepseek",          // 提供方名（与 auth.json 的 key 对应）
  "baseUrl": "https://api.deepseek.com",  // API 地址
  "reasoning": true,               // 是否推理模型
  "input": ["text"],               // 支持的输入：text / image
  "cost": { "input": 0.3 },        // 计费（可选）
  "contextWindow": 1000000,        // 上下文窗口
  "maxTokens": 384000              // 最大输出
}
```

### API 密钥（auth.json）

模型文件本身**不含密钥**。密钥按 provider 名放在 `~/.pi/agent/auth.json`：

```json
{
  "deepseek": { "type": "api_key", "key": "sk-xxx", "baseUrl": "https://api.deepseek.com" },
  "minimax": { "type": "api_key", "key": "sk-xxx", "baseUrl": "https://api.minimaxi.com" },
  "openrouter": { "type": "api_key", "key": "sk-or-xxx", "baseUrl": "https://openrouter.ai/api/v1" }
}
```

- `provider` 字段（models-store.json）与 auth.json 的**顶层 key 必须同名**，服务才能找到对应密钥
- 会话记录同样在 `~/.pi/agent/sessions/`（仓库外，不提交）

### 添加新 provider 三步

1. `models-store.json` 加一个 provider 节点（照模板抄）
2. `auth.json` 加同名 key + API 密钥
3. 重启服务，底部模型选择器即可看到

## 外网分享（可选）

1. 将项目放入工作空间的 `外网分享/` 目录（或自定目录）
2. 配置 `PI_WEB_SHARE_HOST` 指向你的域名，并按需配置隧道（如 cloudflared）
3. 分享链接：`https://<你的域名>/<项目名>/`

## 开发

- 前端：`public/`（原生 HTML/CSS/JS，无构建步骤）
- 后端：`server.mjs`（Node 原生 http）
- 版本管理：见 `CHANGELOG.md`，每次迭代递增版本号并同步 `SYS_VERSION`（`public/js/workspace.js`）

## 开源约定

- 私有信息（域名、令牌、密钥、内网地址）**绝不写入**代码与文档
- 路径不硬编码：一律环境变量 + 跨平台推导（`os.homedir()` / `process.cwd()`）
- 平台差异：Node 标准 API 优先，避免 Windows 特有命令

## License

MIT
