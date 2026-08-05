// pi-web watchdog —— 每 30 秒检查服务，挂了自动重启
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CONFIG } from "./config.mjs";

// 从 config.mjs 读取端口/主机，脚本所在目录自动定位（避免硬编码路径，换机器/改配置不用改 watchdog）
const WD = path.dirname(fileURLToPath(import.meta.url));
const PORT = CONFIG.port;
const HOST = CONFIG.host;
const SERVER = path.join(WD, "server.mjs");
const CWD = WD;
const LOG = path.join(WD, "server.log");
const MAX_LOG_MB = 64; // 超过 64MB 轮转（防日志无限膨胀撑爆磁盘/内存）

let restarting = false;

function rotateLog() {
  try {
    const st = fs.statSync(LOG);
    if (st.size > MAX_LOG_MB * 1024 * 1024) {
      const bak = `${LOG}.1`;
      try { fs.rmSync(bak, { force: true }); } catch {}
      fs.renameSync(LOG, bak);
      console.log(`[watchdog] ${new Date().toISOString()} server.log 超过 ${MAX_LOG_MB}MB，已轮转为 server.log.1`);
    }
  } catch {}
}

// 杀掉所有正在运行的 server.mjs 进程（避免端口互踩：旧进程未退出 → 新进程 EADDRINUSE 死循环）
function killOldServer() {
  return new Promise((resolve) => {
    execFile("wmic", ["process", "where", "name='node.exe'", "get", "ProcessId,CommandLine", "/format:list"], { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      if (err) return resolve();
      let killed = 0;
      const pairs = String(stdout || "").split(/\n\s*\n/);
      for (const pair of pairs) {
        const cmdLine = (pair.match(/CommandLine=([^\r\n]*)/) || [])[1] || "";
        const pid = (pair.match(/ProcessId=(\d+)/) || [])[1];
        if (!pid || !/server\.mjs/i.test(cmdLine)) continue;
        if (String(pid) === String(process.pid)) continue;
        try {
          execFile("taskkill", ["/F", "/PID", pid], { windowsHide: true, timeout: 5000 });
          killed++;
        } catch {}
      }
      if (killed) console.log(`[watchdog] ${new Date().toISOString()} 已结束 ${killed} 个旧 server 进程`);
      resolve();
    });
  });
}

function check() {
  // 健康检查：/api/models 无 token 会返回 401（连接正常 = 路由层活着），
  // 能检测 SSE 死锁 / 模型初始化卡死等“端口通但服务废”的场景（旧版只 GET / 永远 200 是盲区）
  const api = http.get({ host: HOST, port: PORT, path: "/api/models", timeout: 5000 }, (res) => {
    res.resume();
    schedule();
  });
  api.on("error", () => { restart(); schedule(); });
  api.on("timeout", () => { api.destroy(); restart(); schedule(); });
}

async function restart() {
  if (restarting) return;
  restarting = true;
  const stamp = new Date().toISOString();
  console.log(`[watchdog] ${stamp} 服务无响应，尝试重启…`);
  rotateLog();
  try {
    // 先杀旧 server，再启新的（等 1.5s 让端口释放，避免立即 EADDRINUSE）
    await killOldServer();
    await new Promise(r => setTimeout(r, 1500));
    const fd = fs.openSync(LOG, "a");
    const child = spawn("node", [SERVER], { cwd: CWD, stdio: ["ignore", fd, fd], detached: true });
    child.unref();
  } catch (e) {
    console.log("[watchdog] 重启失败:", e.message);
  }
  setTimeout(() => { restarting = false; }, 15000);
}

function schedule() {
  setTimeout(check, 30000);
}

console.log(`[watchdog] 已启动，每 30 秒检查 http://${HOST}:${PORT}`);
check();
