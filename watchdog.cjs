// ===== pi-web 自动守护（watchdog）v2：每 30s 检查，挂掉自动拉起，带锁文件防重复 + 重启限频 =====
const { spawn, execSync, execFileSync } = require("child_process");
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
let crashTimes = []; // 最近崩溃时间戳（用于连续崩溃检测→回滚）
let rollbackDone = false; // 回滚只做一次，避免无限回滚

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

// server.mjs 语法校验：node --check（抓语法错误，如 Missing catch、括号不匹配）
function serverSyntaxOk() {
  try {
    execFileSync(process.execPath, ["--check", "server.mjs"], { cwd: WEB_DIR, encoding: "utf8", windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    return true;
  } catch (e) {
    log("⚠️ 语法校验失败: " + String(e?.message || e).slice(0, 200));
    return false;
  }
}

// 回滚到最近的 server.mjs.bak-*（坏文件保留为 server.mjs.broken-<ts> 供分析）
// 只选语法校验通过的备份：跳过坏备份（如测试残留/回滚源本身语法错误）
function rollbackServer() {
  try {
    const files = fs.readdirSync(WEB_DIR)
      .filter(f => /^server\.mjs\.bak/.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(WEB_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (!files.length) { log("⚠️ 无可用备份，无法回滚"); return false; }
    let bak = null;
    for (const x of files) {
      try {
        execFileSync(process.execPath, ["--check", x.f], { cwd: WEB_DIR, stdio: "ignore" });
        bak = x.f; break;
      } catch { /* 该备份语法错误，跳过 */ }
    }
    if (!bak) { log("⚠️ 所有备份均语法错误，无法回滚"); return false; }
    const bad = path.join(WEB_DIR, `server.mjs.broken-${Date.now()}`);
    fs.renameSync(path.join(WEB_DIR, "server.mjs"), bad);
    fs.copyFileSync(path.join(WEB_DIR, bak), path.join(WEB_DIR, "server.mjs"));
    log(`🔧 已回滚 server.mjs ← ${bak}（坏文件保留: ${path.basename(bad)}）`);
    return true;
  } catch (e) { log("⚠️ 回滚失败: " + String(e?.message || e)); return false; }
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
    // 防风暴跳过时，若连续崩溃≥3次则回滚到备份（抓运行时错误，如 ReferenceError）
    crashTimes = crashTimes.filter(t => now - t < 5 * 60 * 1000);
    if (!rollbackDone && crashTimes.length >= 3 && !serverSyntaxOk()) {
      log("⚠️ 连续崩溃且语法异常，自动回滚备份");
      if (rollbackServer() && serverSyntaxOk()) { rollbackDone = true; log("✅ 回滚后语法校验通过"); }
    }
    log("⚠️ 重启过于频繁，跳过本轮（防风暴）");
    return;
  }
  lastRestartAt = now;
  // 拉起前语法体检：不过则回滚到最近备份再启动
  if (!serverSyntaxOk()) {
    log("⚠️ server.mjs 语法错误，尝试回滚备份");
    if (rollbackServer()) {
      if (!serverSyntaxOk()) { log("⚠️ 回滚后仍语法错误，跳过本轮"); return; }
      log("✅ 回滚后语法校验通过");
    } else return;
  }
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
      crashTimes.push(Date.now());
      // 连续崩溃≥3次（5分钟内）→ 自动回滚到最近备份（抓运行时错误如 ReferenceError）
      crashTimes = crashTimes.filter(t => Date.now() - t < 5 * 60 * 1000);
      if (!rollbackDone && crashTimes.length >= 3) {
        log("⚠️ 连续崩溃 3 次，自动回滚备份");
        if (rollbackServer()) { rollbackDone = true; log("✅ 已回滚，准备重启"); }
      }
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
