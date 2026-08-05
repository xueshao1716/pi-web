#!/usr/bin/env node
// pi-web 自动安装/部署脚本（跨平台：Windows / macOS / Linux）
// 用法：node setup.mjs            # 检测 + 引导安装
//       node setup.mjs --install  # 自动安装缺失依赖
//       node setup.mjs --start    # 安装检查后启动服务
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
const AUTH_FILE = path.join(AGENT_DIR, "auth.json");
const MODELS_FILE = path.join(AGENT_DIR, "models-store.json");
const TOKEN_FILE = path.join(__dirname, ".token");

const ok = (m) => console.log(`  ✅ ${m}`);
const warn = (m) => console.log(`  ⚠️  ${m}`);
const fail = (m) => console.log(`  ❌ ${m}`);

function sh(cmd) {
  try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { return ""; }
}

console.log("\n╭──────────────────────────────────────╮");
console.log("│  小语 · AI 工作台 安装向导          │");
console.log("╰──────────────────────────────────────╯\n");

// 1. Node 版本
console.log("[1/5] 检查 Node.js");
const nodeV = process.version;
const major = parseInt(nodeV.replace(/^v/, "").split(".")[0], 10);
if (major >= 20) ok(`Node ${nodeV}`);
else { fail(`需要 Node ≥ 20，当前 ${nodeV}`); process.exit(1); }

// 2. pi 引擎依赖
console.log("[2/5] 检查 pi 引擎");
let piPkg = "";
try { piPkg = require("module").createRequire(import.meta.url).resolve("@earendil-works/pi-coding-agent/dist/index.js"); } catch {}
if (!piPkg) {
  try {
    const root = sh("npm root -g");
    const candidate = path.join(root, "@earendil-works", "pi-coding-agent", "dist", "index.js");
    if (fs.existsSync(candidate)) piPkg = candidate;
  } catch {}
}
if (piPkg) ok(`已找到: ${piPkg}`);
else {
  fail("未安装 pi 引擎");
  if (process.argv.includes("--install")) {
    console.log("  正在安装 @earendil-works/pi-coding-agent ...");
    try { sh("npm i -g @earendil-works/pi-coding-agent"); ok("安装完成"); }
    catch { fail("自动安装失败，请手动执行：npm i -g @earendil-works/pi-coding-agent"); }
  } else {
    warn("请执行：npm i -g @earendil-works/pi-coding-agent");
    warn("（或重跑：node setup.mjs --install）");
  }
}

// 3. 访问令牌
console.log("[3/5] 访问令牌");
if (fs.existsSync(TOKEN_FILE)) ok("令牌已存在（.token）");
else {
  const t = require("node:crypto").randomBytes(24).toString("hex");
  fs.writeFileSync(TOKEN_FILE, t, { mode: 0o600 });
  ok(`已生成令牌: ${t}`);
}

// 3.5 模型清单（自动初始化模板）
console.log("[3.5/5] 模型清单");
const MODELS_EXAMPLE = path.join(__dirname, "models.example.json");
try { fs.mkdirSync(AGENT_DIR, { recursive: true }); } catch {}
if (fs.existsSync(MODELS_FILE)) ok("已存在（~/.pi/agent/models-store.json）");
else if (fs.existsSync(MODELS_EXAMPLE)) {
  try { fs.copyFileSync(MODELS_EXAMPLE, MODELS_FILE); ok("已从 models.example.json 自动初始化"); }
  catch { warn("自动初始化失败，请手动复制：cp models.example.json ~/.pi/agent/models-store.json"); }
} else warn("未找到 models.example.json");

// 4. 模型密钥
console.log("[4/5] 模型 API 密钥");
if (fs.existsSync(AUTH_FILE)) ok("已配置 API 密钥（~/.pi/agent/auth.json）");
else {
  fail("未配置 API 密钥");
  warn("请创建 ~/.pi/agent/auth.json，示例：");
  console.log('    { "provider名": { "type": "api_key", "key": "sk-xxx", "baseUrl": "https://api.example.com" } }');
  warn("模型列表见 ~/.pi/agent/models-store.json");
}

// 5. 启动
console.log("[5/5] 启动服务");
const flag = process.argv.includes("--start") || process.argv.includes("--install");
if (flag) {
  const cwd = process.env.PI_WEB_CWD || path.join(os.homedir(), "pi-workspace");
  try { fs.mkdirSync(cwd, { recursive: true }); } catch {}
  console.log(`  工作目录: ${cwd}`);
  console.log("  访问地址: http://127.0.0.1:8787");
  console.log("  令牌: 见 .token 文件\n");
  try {
    execSync("node server.mjs", { cwd: __dirname, stdio: "inherit", env: { ...process.env, PI_WEB_CWD: cwd } });
  } catch { fail("服务退出"); }
} else {
  ok("检查完成，启动服务：node server.mjs   （或重跑 node setup.mjs --start）");
}
