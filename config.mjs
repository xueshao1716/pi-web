// pi-web 配置加载模块
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, ".token");

// 访问令牌：环境变量 PI_WEB_TOKEN 优先，其次 .token 文件，否则生成一个并保存
function loadToken() {
  if (process.env.PI_WEB_TOKEN) return process.env.PI_WEB_TOKEN;
  try {
    const t = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (t) return t;
  } catch {}
  const t = crypto.randomBytes(24).toString("hex");
  try {
    fs.writeFileSync(TOKEN_FILE, t, { mode: 0o600 });
  } catch {}
  return t;
}

// pi 全局包路径：env 优先，其次本地/全局 node_modules 推导（跨平台，不硬编码）
function resolvePiPackage() {
  if (process.env.PI_PACKAGE) return process.env.PI_PACKAGE;
  try {
    // 本地安装（开发模式）
    return require.resolve("@earendil-works/pi-coding-agent/dist/index.js");
  } catch {}
  try {
    // 全局安装（npm root -g，跨平台）
    const { execSync } = require("node:child_process");
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return path.join(root, "@earendil-works", "pi-coding-agent", "dist", "index.js");
  } catch {}
  return "";
}

// 默认工作空间：优先已存在的 pi-workspace（多盘符探测，兼容 C/D 盘部署）；否则退回启动目录
function defaultCwd() {
  // 常见位置：D:\pi-workspace（本机真实工作空间）> 主目录/pi-workspace > 启动目录
  const candidates = [];
  if (process.platform === "win32") {
    for (const drive of ["D:", "E:", "C:"]) candidates.push(path.join(drive, "pi-workspace"));
  }
  candidates.push(path.join(os.homedir(), "pi-workspace"));
  for (const c of candidates) {
    try { if (fs.statSync(c).isDirectory()) return c; } catch {}
  }
  return process.cwd();
}

export const CONFIG = {
  port: parseInt(process.env.PI_WEB_PORT || "8787", 10),
  host: process.env.PI_WEB_HOST || "0.0.0.0", // 2026-08-31 改默认监听全网卡，修手机局域网直连连不上的问题（此前 127.0.0.1 只回环可达，外网靠隧道走通掩盖了这个缺陷）
  token: loadToken(),
  tokenFile: TOKEN_FILE,
  // 工作目录：优先环境变量；默认主目录/pi-workspace（跨平台，不硬编码）
  cwd: process.env.PI_WEB_CWD || defaultCwd(),
  // 允许的工具集，逗号分隔
  tools: (process.env.PI_WEB_TOOLS || "read,write,edit,bash").split(",").map(s => s.trim()).filter(Boolean),
  // 默认模型，空 = 使用第一个可用模型
  model: process.env.PI_WEB_MODEL || "zhipu-paid/glm-5.3-flash", // 2026-08-31 默认主力切智谱付费 glm-5.3-flash（env PI_WEB_MODEL 可覆盖）
  // 外部思考调试开关（externalThinking）：给模型挂 think 工具导出推理草稿（默认关）
  externalThinking: process.env.PI_WEB_EXTERNAL_THINKING === "1",
  // pi 包路径（跨平台推导）
  piPackage: resolvePiPackage(),
};
