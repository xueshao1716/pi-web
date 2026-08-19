// ══ pi-web 集成冒烟测试（2026-08-19）══
// 用法：node tests/smoke.mjs [--keep] [--port 8899] [--msg "问句"]
// 作用：起独立测试实例 → 真实模型调用 → 验证 SSE 事件序（think/delta/done）+ 文本输出。
//       --keep 保留实例便于调试；默认测完即杀。
// 覆盖：主通道（agent 管线）+ 兑底通道（PI_USE_AGENT=0）
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const KEEP = args.includes("--keep");
const PORT = Number((args.find(a => a.startsWith("--port=")) || "=8899").split("=")[1]);
const MSG = args.find(a => a.startsWith("--msg="))?.split("=")[1] || "用一句话回答：1+1等于几？";
const TOKEN = fs.readFileSync(path.join(ROOT, ".token"), "utf8").trim();

let results = { pass: 0, fail: 0 };
function ok(name, cond, detail = "") {
  if (cond) { results.pass++; console.log(`  ✔ ${name}`); }
  else { results.fail++; console.log(`  ✖ ${name} ${detail}`); }
}

async function parseSse(body) {
  // SSE 文本 → [{event, data}]（data 是 JSON 字符串）
  const out = [];
  let ev = null, dataLines = [];
  for (const line of body.split("\n")) {
    if (line.startsWith("event:")) { ev = line.slice(6).trim(); }
    else if (line.startsWith("data:")) { dataLines.push(line.slice(5).trim()); }
    else if (line === "") {
      if (ev && dataLines.length) out.push({ event: ev, data: dataLines.join("\n") });
      ev = null; dataLines = [];
    }
  }
  return out;
}

async function chatOnce(port, { useAgent = true } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180000);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ message: MSG, model: "aliyun-bailian/qwen3.8-max" }),
      signal: ctrl.signal,
    });
    const body = await res.text();
    return { status: res.status, events: await parseSse(body) };
  } finally { clearTimeout(timer); }
}

async function bootInstance(env, logTag) {
  const log = fs.openSync(path.join(ROOT, `smoke-${logTag}.log`), "w");
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", log, log], detached: false,
  });
  // 等待健康检查（最多 20s）
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/frontend-version`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      if (r.ok) return child;
    } catch {}
  }
  fs.closeSync(log);
  child.kill();
  throw new Error(`${logTag} 实例启动超时`);
}

async function main() {
  console.log(`\n[smoke] pi-web 集成冒烟 · 端口 ${PORT} · 消息="${MSG}"\n`);

  // ── 主通道（agent 管线）──
  console.log("【主通道 agent 管线】");
  const mainProc = await bootInstance({ PI_WEB_PORT: String(PORT) }, "main");
  try {
    const r = await chatOnce(PORT);
    ok("HTTP 200", r.status === 200, `(status=${r.status})`);
    const names = r.events.map(e => e.event);
    ok("事件序含 delta", names.includes("delta"), `(events=${names.join(",")})`);
    ok("事件序含 done", names.includes("done"), `(events=${names.join(",")})`);
    const delta = r.events.filter(e => e.event === "delta").map(e => { try { return JSON.parse(e.data).text || ""; } catch { return ""; } }).join("");
    ok("delta 有文本输出", delta.trim().length > 0, `(len=${delta.length})`);
    const idxDelta = names.indexOf("delta"), idxDone = names.indexOf("done");
    ok("事件序正确(delta→done)", idxDelta >= 0 && idxDone > idxDelta);
    console.log(`  📝 回复: ${delta.trim().slice(0, 80)}`);
  } finally { if (!KEEP) mainProc.kill(); }

  // ── 兑底通道（unifiedChat，PI_USE_AGENT=0）──
  console.log("\n【兑底通道 unifiedChat】");
  const fbProc = await bootInstance({ PI_WEB_PORT: String(PORT), PI_USE_AGENT: "0" }, "fallback");
  try {
    const r = await chatOnce(PORT);
    ok("HTTP 200", r.status === 200, `(status=${r.status})`);
    const names = r.events.map(e => e.event);
    ok("事件序含 delta", names.includes("delta"), `(events=${names.join(",")})`);
    ok("事件序含 done", names.includes("done"), `(events=${names.join(",")})`);
    const delta = r.events.filter(e => e.event === "delta").map(e => { try { return JSON.parse(e.data).text || ""; } catch { return ""; } }).join("");
    ok("delta 有文本输出", delta.trim().length > 0, `(len=${delta.length})`);
    console.log(`  📝 回复: ${delta.trim().slice(0, 80)}`);
  } finally { if (!KEEP) fbProc.kill(); }

  console.log(`\n[smoke] 结果: ${results.pass} 通过 / ${results.fail} 失败`);
  process.exit(results.fail ? 1 : 0);
}

main().catch(e => { console.error("[smoke] 异常:", e); process.exit(1); });
