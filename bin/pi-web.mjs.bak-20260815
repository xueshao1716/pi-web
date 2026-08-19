#!/usr/bin/env node
// pi-web 全局命令：一键启动 + 打开浏览器 + 显示地址
// 别人电脑装完 pi-web 后，运行 `pi-web` 就能打开前端
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// 定位 pi-web 目录：优先环境变量，其次 npm 全局包，最后默认路径
function findPiWebDir() {
  const candidates = [
    process.env.PI_WEB_DIR,
    process.env.PI_WEB_HOME,
    path.join(os.homedir(), "pi-web"),
    "D:/pi-web",
    "C:/pi-web",
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(path.join(c, "server.mjs"))) return c; } catch {}
  }
  // npm 全局包位置（本脚本所在）
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  try { if (fs.existsSync(path.join(here, "server.mjs"))) return here; } catch {}
  return null;
}

const dir = findPiWebDir();
if (!dir) {
  console.error("❌ 未找到 pi-web（server.mjs）。请先安装 pi-web。");
  process.exit(1);
}

const port = parseInt(process.env.PI_WEB_PORT || "8787", 10);
const host = process.env.PI_WEB_HOST || "127.0.0.1";
const url = `http://${host}:${port}/`;

// 检查服务是否已运行
function isRunning() {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: "/api/health", timeout: 3000 }, (res) => {
      res.resume(); resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

const isRunningNow = await isRunning();
if (!isRunningNow) {
  console.log(`📦 启动 pi-web（${dir}）…`);
  const cwd = process.env.PI_WEB_CWD || path.join(os.homedir(), "pi-workspace");
  try { fs.mkdirSync(cwd, { recursive: true }); } catch {}
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: dir,
    env: { ...process.env, PI_WEB_CWD: cwd },
    stdio: "ignore",
    detached: true,
    windowsHide: true,
  });
  child.unref();
  // 等端口就绪
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isRunning()) break;
  }
}

// 打开浏览器
try {
  const opener = process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(opener, args, { stdio: "ignore", detached: true, windowsHide: true }).unref();
} catch {}

console.log("");
console.log("╭──────────────────────────────────────╮");
console.log("│           pi-web 已启动              │");
console.log("╰──────────────────────────────────────╯");
console.log(`  访问地址: ${url}`);
try {
  const token = fs.readFileSync(path.join(dir, ".token"), "utf8").trim();
  console.log(`  访问令牌: ${token}`);
} catch {
  console.log("  访问令牌: 见 " + path.join(dir, ".token"));
}
console.log("");
