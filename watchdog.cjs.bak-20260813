// ===== pi-web 自动守护（watchdog）：每 30s 检查，挂了自动拉起 =====
// 用法：node watchdog.mjs   （可注册为开机自启/计划任务）
const { execFileSync, spawn, execSync } = require("child_process");
const net = require("net");
const path = require("path");
const fs = require("fs");

const PORT = 8787;
const WEB_DIR = "D:/pi-web";
const LOG = path.join(WEB_DIR, "watchdog.log");
let restarts = 0;

function log(msg) {
  const line = `[${new Date().toLocaleString("zh-CN")}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + "\n"); } catch {}
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
  killPort();
  await new Promise(r => setTimeout(r, 2000));
  const child = spawn("node", ["server.mjs"], {
    cwd: WEB_DIR,
    stdio: "ignore",
    detached: false,
    windowsHide: true,
  });
  child.on("exit", (code, sig) => {
    log(`server 退出 code=${code} signal=${sig} —— 触发重启`);
    restarts++;
    setTimeout(startServer, 3000);
  });
  log(`已启动 server (pid ${child.pid})，累计重启 ${restarts} 次`);
  // 启动后等 12s 确认能响应
  setTimeout(async () => {
    const ok = await portOpen();
    if (!ok) log("⚠️ 启动 12s 后端口仍不通，等待下次检查");
    else log("✅ server 响应正常");
  }, 12000);
}

(async () => {
  log("═══ pi-web 守护启动 ═══");
  // 先看当前是否活着
  if (await portOpen()) {
    log("当前 server 正常，进入监控");
  } else {
    log("当前 server 未运行，启动中…");
    startServer();
  }
  // 定期检查
  setInterval(async () => {
    const ok = await portOpen();
    if (!ok) {
      log("⚠️ 检测到 server 掉线，拉起");
      startServer();
    }
  }, 30000);
})();
