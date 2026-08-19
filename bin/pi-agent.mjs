#!/usr/bin/env node
// ===== pi-agent.mjs —— 无头 Agent 入口（大脑可移植的验收 + 未来接入外部平台的桥）=====
// 不启动 HTTP 服务、不依赖 pi SDK：engine/ 模块 + engine/tools/ + ~/.pi/agent/{auth,models-store}.json
// 直接跑完整 Agent 轮次（模型对话 + 工具调用循环）。
//
// 用法：
//   node bin/pi-agent.mjs "你的问题"
//   node bin/pi-agent.mjs --list                        # 列出可用模型（有 key 的）
//   node bin/pi-agent.mjs --model xiaomi-token-plan-cn/mimo-v2.5 "问题"
//   node bin/pi-agent.mjs --cwd D:/pi-workspace "问题"  # 工具的工作目录
//   node bin/pi-agent.mjs --system "额外系统提示" "问题"
//   echo "问题" | node bin/pi-agent.mjs                 # stdin 输入

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGateway } from "../engine/gateway.mjs";
import { BASE_TOOL_SCHEMAS, createUnifiedToolExecutor } from "../engine/tools/unified-tools.mjs";
import { safeJoin } from "../engine/tools/security.mjs";

// ── 参数解析 ──
const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--list") flags.list = true;
  else if (argv[i] === "--model") flags.model = argv[++i];
  else if (argv[i] === "--cwd") flags.cwd = argv[++i];
  else if (argv[i] === "--system") flags.system = argv[++i];
  else if (argv[i] === "--help" || argv[i] === "-h") flags.help = true;
  else flags.message = (flags.message ? flags.message + " " : "") + argv[i];
}
if (flags.help) {
  console.log(`pi-agent —— pi-web 无头 Agent（engine 直驱，无 HTTP 服务）

用法: node bin/pi-agent.mjs [选项] "问题"
  --list              列出可用模型（已配 key 的）
  --model prov/id     指定模型（如 xiaomi-token-plan-cn/mimo-v2.5）
  --cwd <dir>         工具工作目录（默认当前目录）
  --system <text>     追加系统提示
支持 stdin 管道输入。`);
  process.exit(0);
}

// ── 认证与模型清单（与 server.mjs 同源：~/.pi/agent/）──
const AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; } };
const AUTH_PATH = path.join(AGENT_DIR, "auth.json");
const MODELS_PATH = path.join(AGENT_DIR, "models-store.json");

function resolveAuth(provider) {
  const a = readJson(AUTH_PATH)[provider];
  if (a?.key) return { key: a.key, baseUrl: a.baseUrl || "" };
  const envName = String(provider).toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_API_KEY";
  if (process.env[envName]) return { key: process.env[envName], baseUrl: "" };
  return null;
}

// 可用模型 = 有 key 的 provider × 该 provider 在清单里的模型
function availableModels() {
  const store = readJson(MODELS_PATH);
  const out = [];
  for (const [provider, def] of Object.entries(store)) {
    if (!resolveAuth(provider)) continue;
    for (const m of def?.models || []) out.push({ provider, id: m.id, full: `${provider}/${m.id}`, def: m });
  }
  return out;
}

if (flags.list) {
  const models = availableModels();
  if (!models.length) { console.error(`无可用模型。请配置 ${AUTH_PATH}（如 { "deepseek": { "key": "sk-..." } }）`); process.exit(1); }
  console.log(models.map((m) => `${m.full}${m.def?.reasoning ? "  [思考]" : ""}`).join("\n"));
  process.exit(0);
}

let message = flags.message;
if (!message && !process.stdin.isTTY) {
  message = fs.readFileSync(0, "utf8").trim(); // stdin 管道
}
if (!message) { console.error('缺少问题参数。用法：node bin/pi-agent.mjs "你的问题"（--help 看完整用法）'); process.exit(1); }

// ── 组装 Gateway + 工具 ──
const cwd = flags.cwd || process.cwd();
const executeUnifiedTool = createUnifiedToolExecutor({
  cwd: () => cwd,
  safePath: (p) => safeJoin(cwd, p),
  onLog: (msg) => console.error(msg), // 工具日志走 stderr，不污染 stdout 答案
});

const gw = await createGateway({
  authReader: () => readJson(AUTH_PATH),
  modelReader: () => readJson(MODELS_PATH),
  resolveAuth,
});
for (const s of BASE_TOOL_SCHEMAS) {
  const f = s.function;
  gw.tools.register({ name: f.name, description: f.description, parameters: f.parameters, handler: (args) => executeUnifiedTool(f.name, args) });
}

// ── 模型选择 ──
const models = availableModels();
const chosen = flags.model
  ? models.find((m) => m.full === flags.model || m.id === flags.model)
  : models.find((m) => m.provider === "deepseek") || models[0];
if (!chosen) {
  console.error(`模型不可用: ${flags.model || "（无已配 key 的模型）"}。node bin/pi-agent.mjs --list 查看可用模型。`);
  process.exit(1);
}
console.error(`[pi-agent] 模型: ${chosen.full} · 工具: ${gw.tools.names().join(", ")} · 目录: ${cwd}`);

// ── 跑一轮 Agent（工具调用循环，进度走 stderr）──
const r = await gw.chat(message, {
  model: { id: chosen.id, provider: chosen.provider },
  system: "你是 pi-web 的无头 Agent，用工具完成任务，回答简洁准确。" + (flags.system ? "\n" + flags.system : ""),
  onTool: (id, name, args) => console.error(`[tool] ${name} ${JSON.stringify(args || {}).slice(0, 120)}`),
  onToolEnd: (id, name, args, out) => console.error(`[tool✓] ${name}${out?.isError ? " (错误)" : ""}`),
});

if (r.error) { console.error(`[pi-agent] 失败: ${r.error}`); process.exit(1); }
if (r.think) console.error(`[think] ${String(r.think).slice(0, 500)}`);
console.log(r.text || "(无输出)");
