#!/usr/bin/env node
// 元枢 vs pi：同一条 POST /api/chat，临时切主驾，跑完还原。
// 用法：node bench/engine-bench.mjs [--quick]
import fs from "node:fs";
import path from "node:path";
import { runYuanshuEval } from "../engine/yuanshu-eval.mjs";
import { CASES, judgeReply, parseChatSse, pickNativeModel, summarizeBench } from "./engine-bench-lib.mjs";

const BASE = "http://127.0.0.1:8787";
const TOKEN = fs.existsSync("D:/pi-web/.token")
  ? fs.readFileSync("D:/pi-web/.token", "utf8").trim()
  : fs.readFileSync(path.join(process.env.USERPROFILE || "", ".pi-web-token"), "utf8").trim();
const QUICK = process.argv.includes("--quick");
const TIMEOUT_MS = QUICK ? 30000 : 90000;
const AUTH = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function api(method, url, body, timeout = 15000) {
  const r = await fetch(`${BASE}${url}`, {
    method,
    headers: AUTH,
    body: body == null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { j = { raw: text }; }
  if (!r.ok) throw new Error(`${method} ${url} HTTP ${r.status} ${String(text).slice(0, 160)}`);
  return j;
}

async function setPair(primary, secondary) {
  return api("POST", "/api/engine/pair", { primary, secondary });
}

async function chatOnce(msg, caseId, modelKey, timeout = TIMEOUT_MS) {
  const session = await api("POST", "/api/sessions", { name: `bench-${caseId}-${Date.now().toString(36)}`, group: "test" }, 10000);
  const sessionId = session?.id;
  if (!sessionId) throw new Error("建会话失败");
  try {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({ message: msg, sessionId, model: `${modelKey.provider}/${modelKey.id}` }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!r.ok || !r.body) throw new Error(`chat HTTP ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let raw = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += dec.decode(value, { stream: true });
  }
  const parsed = parseChatSse(raw);
  return { ...parsed, ms: Date.now() - t0, sessionId };
  } finally {
    // 自清理：用例跑完即删 bench 会话，不污染会话列表（2026-09-06 手工清了 74 个残留的教训）
    try { await api("DELETE", `/api/sessions/${sessionId}`, null, 10000); } catch {}
  }
}

const engines = [
  { id: "yuanshu", label: "元枢", pair: { primary: "yuanshu", secondary: "pi" } },
  { id: "pi", label: "pi", pair: { primary: "pi", secondary: "yuanshu" } },
];

const original = await api("GET", "/api/engine/pair");
const models = await api("GET", "/api/models");
const modelKey = pickNativeModel(models);
if (!modelKey) throw new Error("没有可用的 SDK 原生模型，pi 会兑底元枢，横评作废");

const results = [];
try {
  for (const eng of engines) {
    const after = await setPair(eng.pair.primary, eng.pair.secondary);
    console.error(`\n=== ${eng.label} 主驾（pair ${after.primary}/${after.secondary} · 模型 ${modelKey.provider}/${modelKey.id}）===`);
    for (const c of CASES) {
      const t0 = Date.now();
      try {
        const got = await chatOnce(c.msg, `${eng.id}-${c.id}`, modelKey);
        const pass = judgeReply(c.id, got.text);
        const leadOk = got.lead === eng.id;
        results.push({
          engine: eng.id, case: c.id, group: c.group, pass, leadOk, lead: got.lead,
          ms: got.ms, chars: got.text.length, toolSeen: got.toolSeen,
          reply: got.text.slice(0, 140),
        });
        const mark = pass && leadOk ? "OK" : (!leadOk ? "LEAD" : "FAIL");
        console.error(`${mark} ${c.id} ${c.group} ${got.ms}ms lead=${got.lead || "?"} | ${got.text.slice(0, 48).replace(/\n/g, " ")}`);
      } catch (e) {
        results.push({
          engine: eng.id, case: c.id, group: c.group, pass: false, leadOk: false,
          ms: Date.now() - t0, error: String(e?.message || e).slice(0, 160),
        });
        console.error(`ERR ${c.id} ${e?.message || e}`);
      }
    }
  }
} finally {
  try {
    await setPair(original.primary, original.secondary);
    console.error(`\n已还原主次对 ${original.primary}/${original.secondary}`);
  } catch (e) {
    console.error(`还原主次对失败：${e?.message || e}`);
  }
}

const live = summarizeBench(results);
const contract = await runYuanshuEval();
const report = {
  ts: new Date().toISOString(),
  channel: "POST /api/chat",
  model: `${modelKey.provider}/${modelKey.id}`,
  restoredPair: { primary: original.primary, secondary: original.secondary },
  contract: { yuanshu: { passed: contract.passed, total: contract.total, score: contract.score, byTag: contract.byTag }, pi: { note: "厂商黑盒，没有对等循环契约绳" } },
  live,
  detail: results,
};
fs.mkdirSync("D:/pi-web/bench", { recursive: true });
fs.writeFileSync("D:/pi-web/bench/last-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ contract: report.contract, live, model: report.model }, null, 2));
console.error("报告已写: bench/last-report.json");
