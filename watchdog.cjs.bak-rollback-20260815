// ===== pi-web 自动守护（watchdog）v2：每 30s 检查，挂掉自动拉起，带锁文件防重复 + 重启限频 =====
const { spawn, execSync } = require("child_process");
const net = require("net");
const path = require("path");
const fs = require("fs");

const PORT = 8787;
const WEB_DIR = "D:/pi-web";
const LOCK = path.join(WEB_DIR, ".watchdog.lock");
const LOG = path.join(WEB_DIR, "watchdog.log");
let restartCount = 0;
let lastRestartAt = 0;
let child = null;

function log(msg) {
  const line = `[${new Date().toLocaleString("zh-CN")}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + "\n"); } catch {}
}

// 锁文件：防止多个 watchdog 实例（旧任务+新任务同时跑会互相杀）
function acquireLock() {
  try {
    if (fs.existsSync(LOCK)) {
      const pid = parseInt(fs.readFileSync(LOCK, "utf8"), 10);
      try { process.kill(pid, 0); return false; } catch { /* 旧锁进程已死 */ }
    }
    fs.writeFileSync(LOCK, String(process.pid));
    process.on("exit", () => { try { fs.unlinkSync(LOCK); } catch {} });
    return true;
  } catch { return true; }
}

function portOpen() {
  return new Promise((resolve) => {
    const s = net.connect(PORT, "127.0.0.1");
    s.on("connect", () => { s.destroy(); resolve(true); });
    s.on("error", () => resolve(false));
    s.setTimeout(2500, () => { s.destroy(); resolve(false); });
  });
}

function killPort() {
  try {
    const out = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, { encoding: "utf8" });
    const pids = new Set(out.split("\n").map(l => l.trim().split(/\s+/).pop()).filter(Boolean));
    for (const pid of pids) {
      try { execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" }); log(`清理残留 PID ${pid}`); } catch {}
    }
  } catch {}
}

async function startServer() {
  // 重启限频：10 秒内最多重启 1 次，防死循环风暴
  const now = Date.now();
  if (now - lastRestartAt < 10000) {
    log("⚠️ 重启过于频繁，跳过本轮（防风暴）");
    return;
  }
  lastRestartAt = now;
  killPort();
  await new Promise(r => setTimeout(r, 2000));
  if (child) { try { child.kill(); } catch {} child = null; }
  child = spawn("node", ["server.mjs"], { cwd: WEB_DIR, stdio: "ignore", windowsHide: true });
  log(`已启动 server (pid ${child.pid})，累计重启 ${restartCount} 次`);
  child.on("exit", (code, sig) => {
    log(`server 退出 code=${code} signal=${sig}`);
    child = null;
    if (code !== 0) {
      restartCount++;
      setTimeout(() => startServer(), 3000);
    }
  });
  // 启动后 15s 确认响应
  setTimeout(async () => {
    const ok = await portOpen();
    if (!ok) log("⚠️ 启动 15s 后端口仍不通");
    else log("✅ server 响应正常");
  }, 15000);
}

(async () => {
  if (!acquireLock()) {
    log("检测到已有 watchdog 实例（锁文件存在），本实例退出");
    process.exit(0);
  }
  log("═══ pi-web 守护 v2 启动 ═══");
  if (await portOpen()) {
    log("当前 server 正常，进入监控");
  } else {
    log("当前 server 未运行，启动中…");
    startServer();
  }
  setInterval(async () => {
    const ok = await portOpen();
    if (!ok) {
      log("⚠️ 检测到 server 掉线，拉起");
      startServer();
    }
  }, 30000);
})();
