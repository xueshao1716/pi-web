// pi-web —— 基于 pi SDK 的 Web 聊天服务（Codex 风格多会话）
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

import { CONFIG } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

// ── 加载 pi SDK ────────────────────────────────────────────────────
const { createAgentSession, createAgentSessionServices, createAgentSessionFromServices, SettingsManager, ModelRuntime, SessionManager, DefaultResourceLoader, getAgentDir } = await import(
  pathToFileURL(CONFIG.piPackage).href
);

// ── 会话目录：直接使用 pi 终端的会话文件（~/.pi/agent/sessions/<encoded-cwd>/）──
function encodeCwdDir(cwd) {
  const r = path.resolve(cwd);
  const safe = r.replace(/^[\\/]/, "").replace(/[\\/:]/g, "-");
  return `--${safe}--`;
}
const SESSIONS_DIR = path.join(getAgentDir(), "sessions", encodeCwdDir(CONFIG.cwd));
console.log(`[pi-web] 会话目录: ${SESSIONS_DIR}`);

console.log("[pi-web] 正在初始化模型运行时…");
let modelRuntime = await ModelRuntime.create();
console.log(`[pi-web] 模型运行时加载完成`);

// ── 模型列表（从 models-store.json 构建：白名单精选 + 用户后添加的 provider 全部显示）──
let modelList = [];
// 精选白名单：只保留真正常用的模型（一眼看完）
const KEEP_MODELS = new Set([
  // deepseek（默认）
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-pro",
  // openai 主流（去旧版/去 pro 高价版）
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5.2",
  "openai/gpt-5.4",
  "openai/gpt-5.6-luna",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/o3",
  "openai/o4-mini",
  // openrouter 各家族旗舰
  "openrouter/anthropic/claude-opus-5",
  "openrouter/anthropic/claude-sonnet-5",
  "openrouter/anthropic/claude-haiku-4.5",
  "openrouter/anthropic/claude-fable-5",
  "openrouter/google/gemini-3.6-flash",
  "openrouter/google/gemini-2.5-pro",
  "openrouter/google/gemma-3-27b-it",
  "openrouter/deepseek/deepseek-v4-pro",
  "openrouter/deepseek/deepseek-r1",
  "openrouter/qwen/qwen3-max",
  "openrouter/qwen/qwen3.7-max",
  "openrouter/qwen/qwen3-coder-plus",
  "openrouter/x-ai/grok-4.5",
  "openrouter/moonshotai/kimi-k3",
  "openrouter/z-ai/glm-5.2",
  "openrouter/z-ai/glm-4.6",
  "openrouter/mistralai/mistral-large",
  "openrouter/meta-llama/llama-4-maverick",
  "openrouter/nvidia/nemotron-3-super-120b-a12b",
]);

let defaultModel = undefined; // 在启动模型列表构建后初始化（见下）

// ── 会话文件扫描（pi 会话格式 jsonl，跨所有 cwd 目录）──────────────
function scanSessionFiles() {
  const out = [];
  try {
    const root = path.join(getAgentDir(), "sessions");
    for (const sub of fs.readdirSync(root)) {
      if (sub.startsWith(".")) continue; // 跳过 .trash 等隐藏目录
      const dir = path.join(root, sub);
      let st; try { st = fs.statSync(dir); } catch { continue; }
      if (!st.isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith(".jsonl")) out.push(path.join(dir, f));
      }
    }
  } catch {}
  return out;
}
function parseSessionFile(file) {
  const info = { id: null, createdAt: null, updatedAt: null, name: null, preview: "", messageCount: 0, file, cwd: null };
  try {
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (!e || typeof e !== "object") continue;
      if (!info.id && e.type === "session") {
        info.id = e.id; info.createdAt = e.timestamp; info.updatedAt = e.timestamp; info.cwd = e.cwd;
        continue;
      }
      if (e.timestamp && (!info.updatedAt || e.timestamp > info.updatedAt)) info.updatedAt = e.timestamp;
      if (e.type === "session_info" && e.name) info.name = e.name;
      if (e.type === "message" && e.message?.role === "user") {
        info.messageCount++;
        if (!info.preview) {
          const t = extractText(e.message.content);
          if (t) info.preview = t.slice(0, 60);
        }
      }
    }
  } catch {}
  // 兜底：header 可能被重写丢失，从文件名 <ts>_<sessionId>.jsonl 提取
  if (!info.id) {
    const base = path.basename(file, ".jsonl");
    const m = base.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (m) info.id = m[0];
  }
  if (!info.cwd) info.cwd = CONFIG.cwd;
  if (!info.createdAt && info.id) {
    const t = path.basename(file, ".jsonl").split("_")[0];
    if (t) info.createdAt = t.replace(/-/g, ":").replace(".", ":");
  }
  return info;
}

// ── 会话管理 ───────────────────────────────────────────────────────
const activeSessions = new Map();   // id -> { agent, sm, busy }
let lastUnnamedId = null;           // 最近创建/复用的未命名会话（打断时复用同一会话）
let lastUnnamedEntry = null;

// 带中文偏好系统提示的资源加载器
function makeLoader(agentDir) {
  return new DefaultResourceLoader({
    cwd: CONFIG.cwd,
    agentDir,
    appendSystemPrompt: [
      "用户偏好：请始终使用中文进行思考和回答；思考过程（thinking）也用中文。",
      "当任务涉及文件操作、命令执行时，请主动使用 read/write/edit/bash 工具完成，而不是只给出建议。",
      "自我认知：当被问及“你是谁/叫什么/介绍下自己/你的能力”等身份类问题时，按固定格式回答（不要主动自我介绍，也不要一开口就背身份）。固定格式：我叫小语，你的 AI 工作伙伴。我能干：写代码、做设计、整理文档、分析数据，并直接操作工作空间完成交付。由 pi 引擎驱动。当前使用模型与模型特色见对话上下文的系统信息。",
      "任务完成后请主动归纳经验：把本次任务的成功做法/踩过的坑/可复用知识按格式追加到经验库（默认路径 工程/经验库/experience.md），每次最多 3 条、每条 3 行内，并在回复末尾简要说明已沉淀的经验。",
      ...loadProjectRules(),
      ...loadExperience(),
    ],
  });
}

// ── 经验库：新任务自动加载最近经验（自动进化）──
// 经验库路径：工作空间/工程/经验库/experience.md；每次加载最近 N 个条目注入上下文
let expCache = null, expMtime = 0;
function loadExperience(maxEntries = 6) {
  try {
    const f = path.join(CONFIG.cwd, "工程", "经验库", "experience.md");
    const st = fs.statSync(f);
    if (st.mtimeMs !== expMtime || !expCache) {
      expMtime = st.mtimeMs;
      const raw = fs.readFileSync(f, "utf8");
      const blocks = raw.split(/\n### /).filter(b => b.includes("✅") || b.includes("⚠️") || b.includes("📌"));
      const recent = blocks.slice(-maxEntries).map(b => "### " + b.trim());
      expCache = recent;
    }
    if (!expCache.length) return [];
    return [`【经验库·最近 ${expCache.length} 条】遇到同类任务时参考，避免重复踩坑：\n${expCache.join("\n\n")}`];
  } catch { return []; }
}

// ── 项目规则（借鉴 Windsurf .windsurfrules）：工作空间下的 .pi-rules.md 自动加载 ──
// 文件位置：D:\pi-workspace\.pi-rules.md（或 CONFIG.cwd 下）。agent 每次对话自动携带，无需手动 @ 引用
let projectRulesCache = null;
let projectRulesMtime = 0;
function loadProjectRules() {
  try {
    const f = path.join(CONFIG.cwd, ".pi-rules.md");
    const st = fs.statSync(f);
    if (st.mtimeMs !== projectRulesMtime) {
      projectRulesCache = fs.readFileSync(f, "utf8").trim();
      projectRulesMtime = st.mtimeMs;
    }
    if (!projectRulesCache) return [];
    return [`以下为项目规则（.pi-rules.md），请严格遵守：\n${projectRulesCache}`];
  } catch {
    return [];
  }
}

async function createSession(name) {
  const sm = SessionManager.create(CONFIG.cwd, SESSIONS_DIR);
  const id = sm.getSessionId();
  const file = sm.getSessionFile();
  const agent = await createSessionAgent(sm, defaultModel);
  activeSessions.set(id, { agent, sm, busy: false, lastUsed: Date.now() });
  invalidateSessionCache(); // 新增会话 → 列表缓存失效
  if (name) { try { sm.appendSessionInfo(name); } catch {} }
  return id;
}

// ── 活动会话 LRU 淘汰（防止长跑内存只增不减）──
const MAX_ACTIVE_SESSIONS = 30; // 保留上限；超过后淘汰最久未用且不忙的会话
function evictInactiveSessions() {
  if (activeSessions.size <= MAX_ACTIVE_SESSIONS) return;
  const idle = [...activeSessions.entries()]
    .filter(([, e]) => !e.busy)
    .sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0));
  for (const [id, e] of idle) {
    if (activeSessions.size <= MAX_ACTIVE_SESSIONS) break;
    try { e.agent?.dispose?.(); } catch {}
    activeSessions.delete(id);
    console.log(`[pi-web] LRU 淘汰闲置会话 ${id}`);
  }
}

async function openSession(id) {
  if (activeSessions.has(id)) {
    const hit = activeSessions.get(id);
    hit.lastUsed = Date.now();
    return hit;
  }
  evictInactiveSessions();
  const found = getSessionList().find(s => s.id === id);
  if (!found || !found.file || !fs.existsSync(found.file)) return null;
  const sessionCwd = found.cwd || CONFIG.cwd;
  let sm;
  try {
    sm = SessionManager.open(found.file, path.dirname(found.file), sessionCwd);
  } catch {
    // 会话文件损坏（历史 bug 可能产生）→ 跳过，不阻塞其他会话
    return null;
  }
  const agent = await createSessionAgent(sm, defaultModel);
  const entry = { agent, sm, busy: false, lastUsed: Date.now() };
  activeSessions.set(id, entry);
  return entry;
}

// 创建 agent（pi CLI 同款 services 方式：正确注册工具 + 完整 model 触发工具调用）
async function createSessionAgent(sm, model) {
  const cwd = (typeof sm.getCwd === "function" && sm.getCwd()) || CONFIG.cwd;
  const settingsManager = SettingsManager.create(cwd, getAgentDir());
  const services = await createAgentSessionServices({
    cwd,
    agentDir: getAgentDir(),
    settingsManager,
    modelRuntime,
  });
  // 完整 model（runtime 定义，含 compat——简版 {provider,id} 会导致工具不触发）
  let fullModel = model;
  try {
    fullModel = modelRuntime.getModels().find(m => m.provider === model.provider && m.id === model.id) || model;
  } catch {}
  const created = await createAgentSessionFromServices({
    services,
    sessionManager: sm,
    model: fullModel,
    thinkingLevel: process.env.PI_REASONING_LEVEL || "high",
    tools: CONFIG.tools,
  });
  return created.session;
}

// 确保 entry 的 agent 存在（minimax 直调通道后 agent 被销毁，从 session 文件重建以恢复记忆）
async function ensureAgent(entry, model) {
  if (entry.agent) return entry.agent;
  const agent = await createSessionAgent(entry.sm, model || defaultModel);
  entry.agent = agent;
  console.log(`[pi-web] agent 重建（直调后恢复记忆）`);
  return agent;
}

// 判断会话是否还没有任何对话消息（新会话首轮）
function isFirstTurn(sm) {
  try {
    const roots = sm.getTree() || [];
    const hasMsg = roots.some(n => n.entry?.type === "message" && ["user", "assistant"].includes(n.entry?.message?.role));
    return !hasMsg;
  } catch { return false; }
}

async function deleteSession(id) {
  const entry = activeSessions.get(id);
  if (entry) {
    try { entry.agent.dispose(); } catch {}
    activeSessions.delete(id);
  }
  const found = getSessionList().find(s => s.id === id);
  if (found?.file) {
    // 软删除：移入回收站目录（.trash），误删可找回
    const trashDir = path.join(path.dirname(found.file), ".trash");
    try {
      fs.mkdirSync(trashDir, { recursive: true });
      fs.renameSync(found.file, path.join(trashDir, path.basename(found.file)));
      invalidateSessionCache();
      return;
    } catch {}
    try { fs.unlinkSync(found.file); } catch {}
  }
}

// 从会话文件中提取消息（供历史渲染）
function extractMessages(entries, leafId) {
  // 若指定 leafId：只返回该分支路径上的消息（沿 parentId 回溯）
  const byId = new Map(entries.filter(e => e.id).map(e => [e.id, e]));
  const pathIds = new Set();
  if (leafId && byId.has(leafId)) {
    let cur = byId.get(leafId);
    while (cur) { pathIds.add(cur.id); cur = cur.parentId && byId.get(cur.parentId) ? byId.get(cur.parentId) : null; }
  }
  // 第一遍：收集 toolResult（可能出现在 assistant 之后）
  const toolResults = new Map();
  for (const e of entries) {
    if (e.type !== "message" || !e.message) continue;
    const m = e.message;
    if (m.role === "toolResult" && m.toolCallId) {
      toolResults.set(m.toolCallId, { output: extractText(m.content), isError: !!m.isError });
    }
  }
  const out = [];
  for (const e of entries) {
    if (e.type !== "message") continue;
    if (leafId && !pathIds.has(e.id)) continue;
    const m = e.message;
    if (!m) continue;
    if (m.role === "user") {
      const text = extractText(m.content);
      const files = extractFiles(m.content);
      if (text || files.length) out.push({ role: "user", text, files, ts: e.timestamp, id: e.id });
    } else if (m.role === "assistant") {
      const text = extractText(m.content);
      const files = extractFiles(m.content);
      const tools = [];
      let think = "";
      if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b.type === "toolCall" && b.id && b.name) {
            const r = toolResults.get(b.id) || {};
            tools.push({ id: b.id, name: b.name, args: b.arguments || null, output: r.output || "", isError: !!r.isError });
          } else if (b.type === "thinking" && (b.thinking || b.text)) {
            think += (b.thinking || b.text || "");
          }
        }
      }
      if (text || files.length || tools.length || think) out.push({ role: "assistant", text, files, tools, think, ts: e.timestamp, id: e.id });
    }
  }
  return out;
}
function extractText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter(b => b.type === "text").map(b => b.text || "").join("");
  }
  return "";
}

// 从消息 content 提取文件附件（type: file 的块）
function extractFiles(content) {
  if (!Array.isArray(content)) return [];
  return content.filter(b => b.type === "file").map(b => ({ name: b.name, path: b.path, size: b.size, mime: b.mime }));
}

function listSessions() {
  const files = scanSessionFiles();
  return files.map(parseSessionFile)
    .filter(s => s.id)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .map(s => ({
      id: s.id,
      name: s.name || (s.preview ? s.preview.slice(0, 20) : "新会话"),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      preview: s.preview,
      messageCount: s.messageCount,
      file: s.file,
      cwd: s.cwd,
    }));
}

// ── 会话列表缓存（避免每次请求全量扫描+解析所有 JSONL，会话多时性能瓶颈）──
let sessionListCache = null;
function getSessionList() {
  if (!sessionListCache) sessionListCache = listSessions();
  return sessionListCache;
}
function invalidateSessionCache() { sessionListCache = null; }

// 轻量读取会话文件 entries（只解析 JSONL 首部信息）
function readEntriesFromFile(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// ── 模型管理（前端手动添加 API + 测试识别）────────────────────────
const AGENT_DIR = getAgentDir();
const AUTH_PATH = path.join(AGENT_DIR, "auth.json");
const MODELS_PATH = path.join(AGENT_DIR, "models-store.json");
// 启动时构建模型列表：原生 provider（pi 内置目录）+ store 自定义，只显示配置过 Key 的
{
  const store = readJsonFile(MODELS_PATH);
  const authed = new Set(Object.keys(readJsonFile(AUTH_PATH)));
  const all = [];
  // 原生 provider（pi 内置目录，如 xiaomi-token-plan-cn）——不在 store 的
  try {
    for (const m of (modelRuntime.getModels?.() || [])) {
      if (!authed.has(m.provider) || store[m.provider]) continue;
      all.push({ provider: m.provider, id: m.id, name: m.name || m.id, api: m.api, baseUrl: m.baseUrl, reasoning: !!m.reasoning, contextWindow: m.contextWindow, input: m.input, compat: m.compat, thinkingLevelMap: m.thinkingLevelMap, capabilities: modelCapabilities(m.id) });
    }
  } catch {}
  // store 自定义 / 既有 provider
  for (const [provider, cfg] of Object.entries(store)) {
    if (!authed.has(provider)) continue;
    for (const m of (cfg.models || [])) {
      all.push({ provider, id: m.id, name: m.name || m.id, api: m.api, baseUrl: m.baseUrl, reasoning: !!m.reasoning, contextWindow: m.contextWindow, input: m.input, compat: m.compat, thinkingLevelMap: m.thinkingLevelMap, capabilities: m.capabilities || modelCapabilities(m.id) });
    }
  }
  modelList = all.filter(m => {
    if (["deepseek", "openai", "openrouter"].includes(m.provider)) return KEEP_MODELS.has(`${m.provider}/${m.id}`);
    return true;
  });
}
// 默认模型：优先 CONFIG.model，其次 deepseek（稳定），再兜底第一个
if (CONFIG.model) {
  defaultModel = modelList.find(m => `${m.provider}/${m.id}` === CONFIG.model) || undefined;
}
if (!defaultModel) {
  defaultModel = modelList.find(m => m.provider === "deepseek") || modelList[0];
}
console.log(`[pi-web] 可用模型: ${modelList.length} 个（含 ${Object.keys(readJsonFile(MODELS_PATH)).join(", ")}）`);
const SUPPORTED_PROVIDERS = ["deepseek", "openai", "openrouter", "anthropic", "google", "qwen", "xai", "moonshotai", "zai", "minimax", "together", "mistral"];

function readJsonFile(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; } }
function writeJsonFile(p, obj) { try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8"); return true; } catch { return false; } }
// 对外请求：用 python 子进程（自动走系统代理，部分平台如 apihub.agnes-ai.com 直连不通）
const { spawn } = await import("node:child_process");
async function httpJsonFetch(url, options = {}) {
  // 代码走 stdin（python -），body 走临时文件——避免 argv 传参在 Windows 命令行被拆坏（引号/长度）
  const tmpFile = path.join(os.tmpdir(), "piweb-req-" + Date.now() + "-" + Math.floor(Math.random() * 1e6));
  try { fs.writeFileSync(tmpFile, options.body || "", "utf8"); } catch { return Promise.reject(new Error("临时文件写入失败")); }
  const pyCode = [
    "import urllib.request, json, sys",
    "url=sys.argv[1]; method=sys.argv[2]; headers=json.loads(sys.argv[3]); timeout=float(sys.argv[4]); body_file=sys.argv[5]",
    "try: body=open(body_file, 'r', encoding='utf-8').read()",
    "except: body=''",
    "req=urllib.request.Request(url, data=body.encode() if body else None, method=method or 'GET', headers=headers)",
    "r=urllib.request.urlopen(req, timeout=timeout)",
    "data=r.read()",
    "sys.stdout.write(str(r.status)+chr(10)+data.decode('utf-8','replace'))",
    "os_remove=1",
  ].join("\n");
  return new Promise((resolve, reject) => {
    const child = spawn("python", ["-", url, options.method || "GET", JSON.stringify(options.headers || {}), String(options.timeout || 60000), tmpFile],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { try { child.kill(); } catch {} reject(new Error("timeout")); }, (options.timeout || 60000) + 5000);
    child.stdout.on("data", (d) => { stdout += d; if (stdout.length > 50 * 1024 * 1024) { try { child.kill(); } catch {} } });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (err) => { clearTimeout(timer); reject(new Error(String(err.message).slice(0, 120))); });
    child.on("close", (code) => {
      clearTimeout(timer);
      try { fs.unlinkSync(tmpFile); } catch {}
      if (code !== 0) {
        const msg = String(stderr || `exit ${code}`).slice(0, 150);
        if (/timed? ?out|timeout/i.test(msg)) return reject(new Error("timeout"));
        return reject(new Error(msg || "python 请求失败"));
      }
      const nl = stdout.indexOf("\n");
      const status = parseInt(stdout.slice(0, nl), 10) || 200;
      const body = stdout.slice(nl + 1);
      resolve({
        status,
        ok: status >= 200 && status < 300,
        json: async () => { try { return JSON.parse(body); } catch { return null; } },
        text: async () => body,
      });
    });
    // 代码通过 stdin 传（python - 从 stdin 读代码），body 已在临时文件
    try { child.stdin.write(pyCode + "\n"); } catch {}
    try { child.stdin.end(); } catch {}
  });
}

const CRLF = "\r\n";

// 模型能力档案：根据 id 推断（chat 默认 + image/video/tts/asr 标记）
function modelCapabilities(id) {
  const caps = { chat: true, image: false, video: false, tts: false, asr: false };
  if (/image/i.test(id)) { caps.image = true; caps.chat = false; }
  if (/video/i.test(id)) { caps.video = true; caps.chat = false; }
  if (/tts/i.test(id)) { caps.tts = true; caps.chat = false; }
  if (/asr/i.test(id)) { caps.asr = true; caps.chat = false; }
  return caps;
}
// 找到已配置的媒体能力模型（查档案，不靠正则猜）
function findMediaModel(type) {
  for (const m of modelList) {
    const caps = m.capabilities || modelCapabilities(m.id);
    if (type === "image" && caps.image) return m;
    if (type === "tts" && caps.tts) return m;
    if (type === "video" && caps.video) return m;
  }
  return null;
}
// 检测消息中的媒体意图（支持多意图：配图+配音同时）
function detectMediaIntents(message) {
  const intents = [];
  const msg = String(message || "");
  // 否定检测：明确说不要图/不要语音时绝不触发（“不用配图”“别画”“不需要语音”等）
  const negated = /(不用|别|不要|无需|不需要|别配|不配|不用画|别画|不需要配).{0,6}(图|画|图片|配图|配音|语音)/.test(msg);
  // 强指令词：明确的祈使动词，任意位置都触发（如“配图”“画图”“生成图片”）
  const STRONG = /(配图|画图|画个|画一|插画|生成图片|绘图|配一幅|做个.{0,4}(图|插画)|配个图)/;
  // 弱意图词：可能误触发的模糊表达，仅在前 30 字内触发（指令通常在开头）
  const WEAK = /(画.{0,8}(图|图片)|生成.{0,6}(图|图片)|一张.{0,8}(图|图片)|配.{0,3}(图|图片)|插图|配图)/;
  if (!negated && (STRONG.test(msg) || (msg.slice(0, 30).match(WEAK)))) intents.push({ type: "image" });
  const ttsNeg = /(不用|别|不要|无需|不需要).{0,6}(朗读|配音|语音|读出来)/.test(msg);
  if (!ttsNeg && /(配音|朗读|读出来|生成语音|配个音|读一下|配个音)/.test(msg)) intents.push({ type: "tts" });
  return intents;
}
// 提取媒体 prompt（去掉意图词）
function extractMediaPrompt(message) {
  return String(message || "")
    .replace(/(配图|配.{0,2}图|插画|画图|画个|画一|画.{0,2}图|插图|生成图片|绘图|配一幅|生成.{0,8}图片|画.{0,10}图片|一张.{0,10}图片|做个.{0,6}图|配音|朗读|读出来|语音|生成语音|读一下|说出来)/g, "")
    .replace(/[，。！？,.]/g, " ")
    .trim() || message;
}
// 异步生成媒体（与主模型并行）
async function generateMediaAsync(intent, prompt) {
  try {
    if (intent.type === "image") {
      const m = findMediaModel("image");
      if (!m) { console.log(`[pi-web] 媒体: 无 image 模型`); return null; }
      const url = await generateImage(m.provider, m.id, prompt);
      console.log(`[pi-web] 媒体 image: ${url ? "成功" : "失败"} prompt=${String(prompt).slice(0,30)}`);
      return url ? { type: "image", url, model: `${m.provider}/${m.id}` } : null;
    }
    if (intent.type === "tts") {
      const url = await generateTTS(prompt);
      console.log(`[pi-web] 媒体 tts: ${url ? "成功" : "失败"}`);
      return url ? { type: "audio", url, model: "xiaomi-token-plan-cn/mimo-v2.5-tts" } : null;
    }
  } catch (e) { console.log(`[pi-web] 媒体异常: ${String(e?.message||e).slice(0,80)}`); return null; }
  return null;
}
// TTS：mimo-tts 走 chat/completions（内容放 assistant 消息），返回音频 data URL
async function generateTTS(text) {
  try {
    const provider = "xiaomi-token-plan-cn";
    const resolved = resolveAuth(provider);
    if (!resolved) return null;
    const base = (resolved.baseUrl || "https://token-plan-cn.xiaomimimo.com/v1").replace(/\/+$/, "");
    const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
    const r = await httpJsonFetch(`${baseNoV1}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resolved.key}` },
      body: JSON.stringify({
        model: "mimo-v2.5-tts",
        messages: [
          { role: "assistant", content: String(text).slice(0, 2000) },
          { role: "user", content: "请朗读以上内容" },
        ],
        max_tokens: 500,
      }),
      timeout: 90000,
    });
    if (!r.ok) return null;
    const data = await r.json();
    const audio = data.choices?.[0]?.message?.audio?.data;
    if (!audio) return null;
    return `data:audio/wav;base64,${audio}`;
  } catch { return null; }
}

// 绘图：返回图片数据（供 handleChat 绘图模型通道复用）
async function generateImage(provider, modelId, prompt) {
  const resolved = resolveAuth(provider);
  if (!resolved) return null;
  const baseUrl = resolved.baseUrl || (readJsonFile(MODELS_PATH)[provider]?.models || []).find(m => m.id === modelId)?.baseUrl;
  const key = resolved.key;
  const base = (baseUrl || "").replace(/\/+$/, "");
  const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
  const mkReq = (u) => httpJsonFetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: modelId, prompt, n: 1, size: "1024x1024" }),
    timeout: 180000,
  });
  let r = await mkReq(`${baseNoV1}/v1/images/generations`);
  if (r.status === 404) r = await mkReq(`${baseNoV1}/images/generations`);
  if (!r.ok) return null;
  const data = await r.json();
  const item = data.data?.[0];
  if (!item) return null;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item.url) return item.url;
  return null;
}

async function handleImage(res, body) {
  const { provider, modelId, prompt } = body || {};
  if (!provider || !modelId || !prompt) return json(res, 400, { error: "缺少 provider / modelId / prompt" });
  const resolved = resolveAuth(provider);
  if (!resolved) return json(res, 400, { error: `${provider} 未配置 API Key（模型管理中添加）` });
  const baseUrl = resolved.baseUrl || (readJsonFile(MODELS_PATH)[provider]?.models || []).find(m => m.id === modelId)?.baseUrl;
  const key = resolved.key;
  const base = (baseUrl || "").replace(/\/+$/, "");
  const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
  try {
    const mkReq = (u) => httpJsonFetch(u, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, prompt, n: 1, size: "1024x1024" }),
      timeout: 180000,
    });
    let r = await mkReq(`${baseNoV1}/v1/images/generations`);
    if (r.status === 404) r = await mkReq(`${baseNoV1}/images/generations`);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return json(res, 502, { error: `绘图接口调用失败 ${r.status}: ${txt.slice(0, 150)}` });
    }
    const data = await r.json();
    const item = data.data?.[0];
    if (!item) return json(res, 500, { error: "绘图接口未返回图片" });
    if (item.b64_json) return json(res, 200, { image: `data:image/png;base64,${item.b64_json}` });
    if (item.url) return json(res, 200, { image: item.url });
    return json(res, 500, { error: "绘图接口未返回可用图片数据" });
  } catch (e) {
    json(res, 500, { error: String(e?.message || e).slice(0, 200) });
  }
}

// POST /api/models/remove {provider}
// 内置 provider（走 pi agent）；其余自定义 provider 走直调通道
const KNOWN_PROVIDERS = new Set(["deepseek", "openai", "openrouter", "anthropic", "google", "qwen", "xai", "moonshotai", "zai", "minimax", "together", "mistral"]);

// 解析 provider 的认证：优先 auth.json，其次环境变量（如 OPENROUTER_API_KEY）
function resolveAuth(provider) {
  const auth = readJsonFile(AUTH_PATH);
  if (auth[provider]?.key) return { key: auth[provider].key, baseUrl: auth[provider].baseUrl || "" };
  const envName = String(provider).toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_API_KEY";
  if (process.env[envName]) return { key: process.env[envName], baseUrl: "" };
  return null;
}

// 刷新内存模型列表（直接读 models-store.json——权威来源，且重建运行时让新 key 生效）
async function refreshModelList() {
  try { modelRuntime = await ModelRuntime.create(); } catch {}
  const store = readJsonFile(MODELS_PATH);
  const authed = new Set(Object.keys(readJsonFile(AUTH_PATH)));
  const all = [];
  // 原生 provider（pi 内置目录，如 xiaomi-token-plan-cn）——只取不在 store 里的（store 的保持自定义逻辑）
  try {
    for (const m of (modelRuntime.getModels?.() || [])) {
      if (!authed.has(m.provider) || store[m.provider]) continue;
      all.push({
        provider: m.provider, id: m.id, name: m.name || m.id, api: m.api, baseUrl: m.baseUrl,
        reasoning: !!m.reasoning, contextWindow: m.contextWindow, input: m.input,
        compat: m.compat, thinkingLevelMap: m.thinkingLevelMap,
        capabilities: modelCapabilities(m.id),
      });
    }
  } catch {}
  // 自定义 / 既有 provider（store）
  for (const [provider, cfg] of Object.entries(store)) {
    if (!authed.has(provider)) continue;
    for (const m of (cfg.models || [])) {
      all.push({
        provider, id: m.id, name: m.name || m.id, api: m.api, baseUrl: m.baseUrl,
        reasoning: !!m.reasoning, contextWindow: m.contextWindow, input: m.input,
        compat: m.compat, thinkingLevelMap: m.thinkingLevelMap,
        capabilities: m.capabilities || modelCapabilities(m.id),
      });
    }
  }
  modelList = all.filter(m => {
    if (["deepseek", "openai", "openrouter"].includes(m.provider)) return KEEP_MODELS.has(`${m.provider}/${m.id}`);
    return true;
  });
  if (defaultModel && !modelList.find(m => m.provider === defaultModel.provider && m.id === defaultModel.id)) {
    defaultModel = modelList[0] || undefined;
  }
  console.log(`[pi-web] 模型刷新: ${modelList.length} 个（含 ${Object.keys(store).join(", ")}）`);
}

// GET /api/models/manage —— 只显示真正配置了 Key 的 provider
async function handleModelsManage(res) {
  const auth = readJsonFile(AUTH_PATH);
  const store = readJsonFile(MODELS_PATH);
  const providers = Object.keys(store)
    .filter(p => auth[p]?.key)
    .map(p => ({
      provider: p,
      hasKey: !!auth[p],
      baseUrl: auth[p]?.baseUrl || "",
      modelCount: (store[p]?.models || []).length,
      capabilities: (store[p]?.models || []).reduce((acc, m) => { const c = m.capabilities || modelCapabilities(m.id); for (const k of Object.keys(acc)) if (c[k]) acc[k] = true; return acc; }, { chat: false, image: false, video: false, tts: false, asr: false }),
      models: (store[p]?.models || []).map(m => m.id).slice(0, 30),
    }));
  json(res, 200, { providers, supported: SUPPORTED_PROVIDERS });
}

// 添加时实际探测模型能力（无关键字模型逐个验证：chat / image / tts）
async function probeModelCapabilities(baseNoV1, key, modelId) {
  const caps = { chat: false, image: false, video: false, tts: false, asr: false };
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  try {
    const r = await httpJsonFetch(`${baseNoV1}/v1/chat/completions`, {
      method: "POST", timeout: 10000, headers,
      body: JSON.stringify({ model: modelId, max_tokens: 5, messages: [{ role: "user", content: "hi" }] }),
    });
    if (r.ok) caps.chat = true;
  } catch {}
  // TTS 探测：不发畸形消息（避免部分 API 封禁 key），复用正常 chat 请求检查响应中的 audio 字段
  try {
    const r = await httpJsonFetch(`${baseNoV1}/v1/chat/completions`, {
      method: "POST", timeout: 10000, headers,
      body: JSON.stringify({ model: modelId, max_tokens: 5, messages: [{ role: "user", content: "hi" }] }),
    });
    if (r.ok) {
      const d = await r.json();
      if (d.choices?.[0]?.message?.audio?.data) caps.tts = true;
    }
  } catch {}
  try {
    const r = await httpJsonFetch(`${baseNoV1}/v1/images/generations`, {
      method: "POST", timeout: 10000, headers,
      body: JSON.stringify({ model: modelId, prompt: "test", n: 1 }),
    });
    if (r.ok) caps.image = true;
  } catch {}
  return caps;
}

// 自定义 provider 模型发现：直调 openai 兼容 /v1/models，并探测能力
async function discoverCustomModels(base, apiKey) {
  const mk = (u) => httpJsonFetch(u, { headers: { "Authorization": `Bearer ${apiKey}` }, timeout: 20000 });
  const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
  for (const u of [`${baseNoV1}/v1/models`, `${base}/models`]) {
    try {
      const r = await mk(u);
      if (!r.ok) continue;
      const data = await r.json();
      const list = data.data || data.models || [];
      if (!list.length) continue;
      const models = [];
      for (const m of list) {
        if (typeof m.id !== "string") continue;
        const model = { id: m.id, name: m.name || m.id, api: "openai-completions", baseUrl: baseNoV1, provider: "", reasoning: true, input: ["text"], contextWindow: 128000, maxTokens: 32768 };
        if (/(image|video|tts|asr)/i.test(m.id)) model.capabilities = modelCapabilities(m.id);
        else model.capabilities = await probeModelCapabilities(baseNoV1, apiKey, m.id);
        models.push(model);
      }
      return models;
    } catch {}
  }
  return null;
}

// POST /api/models/add —— 添加（内置 provider 用 pi runtime；自定义 provider 直调探测）
async function handleModelsAdd(res, body) {
  const { provider, apiKey, baseUrl } = body || {};
  if (!provider || !apiKey) return json(res, 400, { error: "缺少 provider 或 API Key" });
  if (!/^[a-zA-Z0-9_-]+$/.test(provider)) return json(res, 400, { error: "provider 名称只能包含字母、数字、横线" });
  const auth = readJsonFile(AUTH_PATH);
  auth[provider] = { type: "api_key", key: apiKey, ...(baseUrl ? { baseUrl } : {}) };
  writeJsonFile(AUTH_PATH, auth);
  try {
    let models = null;
    if (KNOWN_PROVIDERS.has(provider)) {
      const runtime = await ModelRuntime.create({ authPath: AUTH_PATH, modelsPath: MODELS_PATH });
      runtime.setRuntimeApiKey(provider, apiKey);
      const authCheck = await runtime.checkAuth(provider);
      if (authCheck && authCheck.status === "invalid") {
        delete auth[provider]; writeJsonFile(AUTH_PATH, auth);
        return json(res, 401, { error: `API Key 无效：${authCheck.message || "认证失败"}` });
      }
      models = await runtime.getAvailable(provider);
      const base = (baseUrl || "").replace(/\/+$/, "");
      const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
      if (baseNoV1 && models?.length) {
        for (const m of models) {
          if (!/(image|video|tts|asr)/i.test(m.id)) m.capabilities = await probeModelCapabilities(baseNoV1, apiKey, m.id);
        }
      }
    } else {
      const base = (baseUrl || "").replace(/\/+$/, "");
      if (!base) return json(res, 400, { error: "自定义 provider 必须填写 Base URL" });
      models = await discoverCustomModels(base, apiKey);
    }
    if (!models || !models.length) {
      delete auth[provider]; writeJsonFile(AUTH_PATH, auth);
      return json(res, 404, { error: "该 Key 下未发现可用模型（请确认 Base URL 与接口协议正确）" });
    }
    const store = readJsonFile(MODELS_PATH);
    store[provider] = { models, checkedAt: new Date().toISOString() };
    writeJsonFile(MODELS_PATH, store);
    console.log(`[pi-web] 模型添加成功: ${provider} ${models.length} 个`);
    await refreshModelList();
    json(res, 200, { ok: true, modelCount: models.length, models: models.map(m => m.id) });
  } catch (e) {
    const a2 = readJsonFile(AUTH_PATH); delete a2[provider]; writeJsonFile(AUTH_PATH, a2);
    console.log(`[pi-web] 模型添加失败: ${provider} → ${String(e?.message || e).slice(0, 100)}`);
    json(res, 500, { error: String(e?.message || e).slice(0, 200) });
  }
}

// GET /api/prompts —— 提示词模板列表（~/.pi/agent/prompts/*.md）
async function handlePrompts(res) {
  const dir = path.join(getAgentDir(), "prompts");
  const list = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      const content = fs.readFileSync(path.join(dir, f), "utf8");
      const name = f.replace(/\.md$/, "");
      let desc = "";
      let body = content;
      const fm = content.match(/^---\n([\s\S]*?)\n---\n?/);
      if (fm) {
        const dm = fm[1].match(/description:\s*(.+)/);
        if (dm) desc = dm[1].trim();
        body = content.slice(fm[0].length);
      }
      list.push({ name, description: desc || (body.split("\n")[0] || "").slice(0, 60), content: body.trim() });
    }
  } catch {}
  json(res, 200, { prompts: list });
}

// GET /api/sessions/:id/tree —— 会话分支树
async function handleSessionTree(res, id) {
  const entry = await openSession(id);
  if (!entry) return json(res, 404, { error: "会话不存在" });
  const sm = entry.sm;
  const roots = sm.getTree();
  const leafId = sm.getLeafId();
  // 只保留消息节点，限制深度与宽度（防大会话递归溢出）
  const isMsg = (n) => n.entry?.type === "message" && ["user", "assistant"].includes(n.entry?.message?.role);
  const simplify = (node, depth = 0, budget = { n: 0 }) => {
    budget.n++;
    if (depth > 8 || budget.n > 400) return null;
    const children = (node.children || [])
      .map(c => simplify(c, depth + 1, budget))
      .filter(Boolean)
      .slice(0, 30);
    if (!isMsg(node)) {
      if (!children.length) return null;
      return { id: node.entry.id, type: node.entry.type, children };
    }
    const content = node.entry.message?.content || [];
    const text = (content.filter(b => b.type === "text").map(b => b.text || "").join("") || node.entry.message?.text || "").slice(0, 50);
    return { id: node.entry.id, role: node.entry.message.role, text, ts: node.entry.timestamp, children };
  };
  json(res, 200, { tree: roots.map(s => simplify(s)).filter(Boolean), leafId });
}

// POST /api/sessions/:id/branch {entryId} —— 从某条消息分叉
async function handleSessionBranch(res, id, body) {
  const entry = await openSession(id);
  if (!entry) return json(res, 404, { error: "会话不存在" });
  const entryId = body?.entryId;
  if (!entryId) return json(res, 400, { error: "缺少 entryId" });
  try {
    entry.sm.branch(entryId);
    // 分支后重建 agent（从文件加载新分支上下文）
    if (entry.agent) { try { entry.agent.dispose(); } catch {} entry.agent = null; }
    await ensureAgent(entry, defaultModel);
    json(res, 200, { ok: true, leafId: entry.sm.getLeafId() });
  } catch (e) {
    json(res, 500, { error: String(e?.message || e).slice(0, 150) });
  }
}

// POST /api/sessions/:id/remove —— 删除会话
async function handleModelsRemove(res, body) {
  const { provider } = body || {};
  if (!provider) return json(res, 400, { error: "缺少 provider" });
  const auth = readJsonFile(AUTH_PATH); delete auth[provider]; writeJsonFile(AUTH_PATH, auth);
  const store = readJsonFile(MODELS_PATH); delete store[provider]; writeJsonFile(MODELS_PATH, store);
  await refreshModelList();
  json(res, 200, { ok: true });
}

// GET /api/search?q= —— 搜索所有会话历史
async function handleSearch(res, q) {
  q = (q || "").trim();
  if (q.length < 2) return json(res, 200, { results: [] });
  const ql = q.toLowerCase();
  const results = [];
  for (const file of scanSessionFiles()) {
    try {
      const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
      const hits = [];
      for (const line of lines) {
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (e.type !== "message" || !e.message) continue;
        const text = extractText(e.message.content);
        if (!text || !text.toLowerCase().includes(ql)) continue;
        hits.push({ role: e.message.role, snippet: text.replace(/\s+/g, " ").slice(0, 160) });
        if (hits.length >= 3) break;
      }
      if (hits.length) {
        const info = parseSessionFile(file);
        results.push({ sessionId: info.id, name: info.name || "会话", preview: info.preview, hits });
      }
    } catch {}
  }
  json(res, 200, { results: results.slice(0, 20) });
}

// GET /api/git/status 、 /api/git/diff —— Git 集成
function runGit(args) {
  return new Promise((resolve) => {
    execFile("git", ["-C", CONFIG.cwd, ...args], { encoding: "utf8", timeout: 8000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        const msg = String(err.message || "");
        if (msg.includes("not a git repository") || msg.includes("Not a git repository")) {
          return resolve({ ok: false, isRepo: false, output: "" });
        }
        return resolve({ ok: false, isRepo: true, output: msg.split("\n").slice(-5).join("\n") });
      }
      resolve({ ok: true, output: stdout });
    });
  });
}
async function handleGitStatus(res) {
  const r = await runGit(["status", "--short", "--branch"]);
  json(res, 200, { isRepo: r.isRepo !== false, output: r.output || "" });
}
async function handleGitDiff(res) {
  const r = await runGit(["diff", "--stat"]);
  json(res, 200, { isRepo: r.isRepo !== false, output: r.output || "" });
}

// ── 鉴权 ───────────────────────────────────────────────────────────
function checkAuth(req) {
  const h = req.headers.authorization || "";
  if (h === `Bearer ${CONFIG.token}`) return true;
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  return url.searchParams.get("token") === CONFIG.token;
}

// ── SSE ────────────────────────────────────────────────────────────
function sseWrite(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── 路由 ───────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function handleStatic(req, res) {
  let p = new URL(req.url, "http://localhost").pathname;
  if (p === "/") p = "/index.html";
  const file = path.join(PUBLIC_DIR, path.normalize(p).replace(/^([/\\])+/, ""));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end("forbidden"); return; }
  try {
    const data = await fs.promises.readFile(file);
    const headers = {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache, max-age=0",
    };
    // service worker 需要覆盖根路径 scope
    if (p === "/sw.js") headers["Service-Worker-Allowed"] = "/";
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function handleModels(res) {
  // 只返回已配置 Key 的 provider 的模型（auth.json 或环境变量），避免列出无法使用的模型
  const list = modelList
    .filter(m => resolveAuth(m.provider))
    .map(m => ({
      provider: m.provider, id: m.id, name: m.name || m.id,
      contextWindow: m.contextWindow,
      vision: Array.isArray(m.input) && m.input.includes("image"),
      reasoning: !!m.reasoning,
      capabilities: m.capabilities || modelCapabilities(m.id),
    }));
  json(res, 200, {
    models: list,
    current: defaultModel ? { provider: defaultModel.provider, id: defaultModel.id } : null,
    cwd: CONFIG.cwd,
    tools: CONFIG.tools,
  });
}

async function handleSwitchModel(req, res, body) {
  const m = modelList.find(x => x.provider === body.provider && x.id === body.modelId);
  if (!m) return json(res, 404, { error: `模型未找到: ${body.provider}/${body.modelId}` });
  const switched = !(defaultModel?.provider === m.provider && defaultModel?.id === m.id);
  defaultModel = m;
  // 完整 runtime 模型（含 compat/thinkingFormat，简版模型会导致 agent 通道 reasoning 处理异常）
  let fullModel = m;
  try {
    fullModel = modelRuntime.getModels().find(x => x.provider === m.provider && x.id === m.id) || m;
  } catch {}
  // 只切换指定会话的模型；正在生成的会话不打断（避免静默无输出）
  if (body.sessionId && activeSessions.has(body.sessionId)) {
    const entry2 = activeSessions.get(body.sessionId);
    if (!entry2.busy) {
      try {
        const ag = await ensureAgent(entry2, fullModel);
        await ag.setModel(fullModel);
        // 只有模型真的变了才注入上下文同步（同一模型重复切换不注入，避免刷屏污染会话）
        if (switched) { try { await syncContextAfterSwitch(entry2, m); } catch {} }
      } catch {}
    }
  }
  json(res, 200, { ok: true, model: { provider: m.provider, id: m.id } });
}

// 切换模型后的上下文灌输：注入一条简短的模型信息提示（不再让模型 read 会话文件——
// 那会导致模型反复读文件卡住；新模型从 pi 引擎组装的历史中自然获得上下文）
async function syncContextAfterSwitch(entry, model) {
  try {
    const file = entry.sm.sessionFile;
    if (!file || !fs.existsSync(file)) return;
    const mName = model?.name || model?.id || "新模型";
    const patch = `（提示）当前会话已切换模型为 ${mName}。请直接根据对话历史继续回答，无需重复确认。`;
    await entry.sm.appendMessage({ role: "user", content: [{ type: "text", text: patch }] });
    console.log(`[pi-web] 模型切换为 ${mName}，已注入简短上下文提示`);
  } catch {}
}

// POST /api/chat —— SSE 流式
// ══ 工作空间：产物落盘 + 文件服务 ══
const WS_ROOT = path.resolve(CONFIG.cwd);  // 工作空间根（= 会话 cwd，统一反斜杠）
function wsSafePath(p) {
  const resolved = path.resolve(WS_ROOT, String(p || "").replace(/^\/+/, ""));
  return resolved === WS_ROOT || resolved.startsWith(WS_ROOT + path.sep) ? resolved : null;
}
// 媒体产物落盘：远程 URL 下载 / data URL 保存 → 返回本地可访问路径
async function saveArtifact(artifact) {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const typeDir = artifact.type === "image" ? "图片" : artifact.type === "audio" ? "音频" : "视频";
    const dir = path.join(WS_ROOT, "生成物", typeDir, date);
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toTimeString().slice(0, 5).replace(":", "");
    const ext = artifact.type === "image" ? ".png" : artifact.type === "audio" ? ".wav" : ".mp4";
    const file = path.join(dir, `产物_${ts}${ext}`);
    if (artifact.url.startsWith("data:")) {
      const b64 = artifact.url.split(",")[1];
      fs.writeFileSync(file, Buffer.from(b64, "base64"));
    } else if (artifact.url.startsWith("http")) {
      // python 下载（走系统代理，二进制安全）
      const py = "import urllib.request,sys; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])";
      await new Promise((resolve, reject) => {
        execFile("python", ["-c", py, artifact.url, file], { timeout: 60000, windowsHide: true }, (err) => err ? reject(err) : resolve());
      });
    } else {
      return artifact.url;
    }
    console.log(`[pi-web] 产物已落盘: ${file}`);
    return `/api/ws/file?path=${encodeURIComponent(file)}`;
  } catch (e) {
    console.log(`[pi-web] 落盘失败: ${String(e?.message || e).slice(0, 60)}`);
    return artifact.url;
  }
}

// GET /api/ws/tree —— 工作空间目录树
async function handleWsTree(res, reqPath) {
  const safe = wsSafePath(reqPath || "");
  if (!safe) return json(res, 403, { error: "路径越权" });
  const items = [];
  try {
    for (const it of fs.readdirSync(safe, { withFileTypes: true })) {
      items.push({
        name: it.name,
        type: it.isDirectory() ? "dir" : "file",
        path: path.relative(WS_ROOT, path.join(safe, it.name)).replace(/\\/g, "/"),
      });
    }
  } catch {}
  json(res, 200, { items, current: path.relative(WS_ROOT, safe) || "." });
}

// GET /api/ws/file —— 提供文件（图片/音频/视频/文本）
async function handleWsFile(res, reqPath) {
  const safe = wsSafePath(reqPath);
  if (!safe || !fs.existsSync(safe)) return json(res, 404, { error: "文件不存在" });
  const ext = path.extname(safe).toLowerCase();
  const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".webm": "video/webm", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json" }[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
  fs.createReadStream(safe).pipe(res);
}

// GET /api/ws/read —— 读文本文件内容
async function handleWsRead(res, reqPath) {
  const safe = wsSafePath(reqPath);
  if (!safe || !fs.existsSync(safe) || fs.statSync(safe).isDirectory()) return json(res, 404, { error: "文件不存在" });
  try {
    const content = fs.readFileSync(safe, "utf8");
    json(res, 200, { content, name: path.basename(safe), path: reqPath });
  } catch { json(res, 500, { error: "读取失败（可能非文本）" }); }
}

// POST /api/ws/write —— 写文件
async function handleWsWrite(res, body) {
  const { path: p, content } = body || {};
  const safe = wsSafePath(p);
  if (!safe) return json(res, 403, { error: "路径越权" });
  try {
    fs.mkdirSync(path.dirname(safe), { recursive: true });
    fs.writeFileSync(safe, content || "");
    json(res, 200, { ok: true });
  } catch (e) { json(res, 500, { error: String(e?.message || e).slice(0, 100) }); }
}

// GET /api/ws/artifacts —— 生成物列表（按类型/日期）
async function handleWsArtifacts(res) {
  const out = [];
  const genDir = path.join(WS_ROOT, "生成物");
  try {
    for (const type of fs.readdirSync(genDir)) {
      const typePath = path.join(genDir, type);
      if (!fs.statSync(typePath).isDirectory()) continue;
      for (const date of fs.readdirSync(typePath)) {
        const datePath = path.join(typePath, date);
        for (const f of fs.readdirSync(datePath)) {
          const fp = path.join(datePath, f);
          out.push({
            name: f, type, date,
            path: path.relative(WS_ROOT, fp).replace(/\\/g, "/"),
            size: fs.statSync(fp).size,
            url: `/api/ws/file?path=${encodeURIComponent(fp)}`,
          });
        }
      }
    }
  } catch {}
  out.sort((a, b) => b.date.localeCompare(a.date));
  json(res, 200, { artifacts: out.slice(0, 200) });
}

// ══ 成品交付 ══
function wsNextVersion(name) {
  const deliverDir = path.join(WS_ROOT, "交付");
  try { fs.mkdirSync(deliverDir, { recursive: true }); } catch {}
  let v = 1;
  while (true) {
    const target = path.join(deliverDir, `${name}-v${v}`);
    if (!fs.existsSync(target) && !fs.existsSync(target + ".zip")) break;
    v++;
  }
  return v;
}
// 递归复制目录
function wsCopyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const it of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, it.name), d = path.join(dst, it.name);
    if (it.isDirectory()) wsCopyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
// POST /api/ws/deliver —— 一键交付：复制源到 交付目录（name-vN）
async function handleWsDeliver(res, body) {
  const { sourcePath, name } = body || {};
  const safe = wsSafePath(sourcePath);
  if (!safe || !fs.existsSync(safe)) return json(res, 404, { error: "源不存在" });
  const base = (name || path.basename(safe)).replace(/[\/:*?"<>|\s]+/g, "-").slice(0, 60) || "交付物";
  const v = wsNextVersion(base);
  const target = path.join(WS_ROOT, "交付", `${base}-v${v}`);
  try {
    if (fs.statSync(safe).isDirectory()) wsCopyDir(safe, target);
    else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(safe, target + path.extname(safe)); }
    json(res, 200, { ok: true, path: `交付/${base}-v${v}`, version: v });
  } catch (e) { json(res, 500, { error: String(e?.message || e).slice(0, 100) }); }
}
// POST /api/ws/deliver/package —— 打包 zip（powershell Compress-Archive）
async function handleWsPackage(res, body) {
  const { path: p } = body || {};
  const safe = wsSafePath(p);
  if (!safe || !fs.existsSync(safe)) return json(res, 404, { error: "源不存在" });
  const zipName = (path.basename(safe) || "交付物").replace(/[\/:*?"<>|\s]+/g, "-") + ".zip";
  const zipPath = path.join(WS_ROOT, "交付", zipName);
  try {
    const src = fs.statSync(safe).isDirectory() ? path.join(safe, "*") : safe;
    const ps = `Compress-Archive -Path '${src.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`;
    await new Promise((resolve, reject) => execFile("powershell", ["-NoProfile", "-Command", ps], { timeout: 120000, windowsHide: true }, (err) => err ? reject(err) : resolve()));
    json(res, 200, { ok: true, path: `交付/${zipName}`, url: `/api/ws/file?path=${encodeURIComponent(zipPath)}` });
  } catch (e) { json(res, 500, { error: "打包失败: " + String(e?.message || e).slice(0, 80) }); }
}
// GET /api/ws/deliveries —— 交付列表
async function handleWsDeliveries(res) {
  const out = [];
  const deliverDir = path.join(WS_ROOT, "交付");
  try {
    for (const it of fs.readdirSync(deliverDir, { withFileTypes: true })) {
      const fp = path.join(deliverDir, it.name);
      out.push({
        name: it.name,
        type: it.isDirectory() ? "dir" : "file",
        size: fs.statSync(fp).size,
        url: `/api/ws/file?path=${encodeURIComponent(fp)}`,
        wsPath: `交付/${it.name}`,
      });
    }
  } catch {}
  out.sort((a, b) => (a.type === "dir" ? 0 : 1) - (b.type === "dir" ? 0 : 1));
  json(res, 200, { deliveries: out });
}

// POST /api/ws/rename —— 重命名
async function handleWsRename(res, body) {
  const { oldPath, newName } = body || {};
  const safeOld = wsSafePath(oldPath);
  const safeNew = safeOld ? wsSafePath(path.join(path.dirname(safeOld), String(newName || ""))) : null;
  if (!safeOld || !safeNew || !fs.existsSync(safeOld)) return json(res, 404, { error: "源不存在" });
  if (!newName || /[\/:*?"<>|]/.test(newName)) return json(res, 400, { error: "非法名称" });
  try {
    fs.renameSync(safeOld, safeNew);
    json(res, 200, { ok: true, path: path.relative(WS_ROOT, safeNew).replace(/\\/g, "/") });
  } catch (e) { json(res, 500, { error: String(e?.message || e).slice(0, 100) }); }
}
// POST /api/ws/delete —— 删除（工作空间内）
async function handleWsDelete(res, body) {
  const { path: p, confirmed } = body || {};
  const safe = wsSafePath(p);
  if (!safe || !fs.existsSync(safe)) return json(res, 404, { error: "不存在" });
  // 双保险：前端已 confirm 后必须带 confirmed:true（防 CSRF / 误调）；且禁止删除工作空间根目录
  if (!confirmed) return json(res, 400, { error: "需要确认" });
  if (safe === WS_ROOT) return json(res, 400, { error: "不能删除工作空间根目录" });
  // TOCTOU 防护：解析真实路径（符号链接可能把校验后的路径指到工作空间外），再次确认在范围内
  try {
    const real = fs.realpathSync(safe);
    const rootReal = fs.realpathSync(WS_ROOT);
    if (real !== rootReal && !real.startsWith(rootReal + path.sep)) {
      return json(res, 400, { error: "路径超出工作空间范围" });
    }
  } catch { return json(res, 400, { error: "路径解析失败" }); }
  try {
    fs.rmSync(safe, { recursive: true, force: true });
    json(res, 200, { ok: true });
  } catch (e) { json(res, 500, { error: String(e?.message || e).slice(0, 100) }); }
}
// GET /api/ws/search?q= —— 递归文件名搜索
async function handleWsSearch(res, q) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    for (const it of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, it.name);
      const rel = path.relative(WS_ROOT, fp).replace(/\\/g, "/");
      if (it.isDirectory()) {
        if (it.name === "node_modules" || it.name === ".git" || it.name === "AppData") continue;
        walk(fp, depth + 1);
      } else if (it.name.toLowerCase().includes(String(q || "").toLowerCase())) {
        out.push({ name: it.name, path: rel, type: "file", size: fs.statSync(fp).size });
      }
    }
  };
  try { walk(WS_ROOT, 0); } catch {}
  out.sort((a, b) => a.path.localeCompare(b.path));
  json(res, 200, { results: out.slice(0, 100) });
}
// POST /api/ws/projects —— 新建项目
async function handleWsProjectCreate(res, body) {
  const { name } = body || {};
  const clean = String(name || "").replace(/[\/:*?"<>|\s]+/g, "-").slice(0, 60);
  if (!clean) return json(res, 400, { error: "缺少项目名" });
  const safe = wsSafePath(path.join("工程", clean));
  if (!safe) return json(res, 403, { error: "路径越权" });
  if (fs.existsSync(safe)) return json(res, 400, { error: "项目已存在" });
  try {
    fs.mkdirSync(safe, { recursive: true });
    fs.writeFileSync(path.join(safe, "README.md"), `# ${clean}

新建项目，用对话描述需求开始开发。
`);
    json(res, 200, { ok: true, path: "工程/" + clean });
  } catch (e) { json(res, 500, { error: String(e?.message || e).slice(0, 100) }); }
}
// POST /api/ws/convert —— 文档转换（docx/xlsx → markdown 文本）
async function handleWsConvert(res, body) {
  const { path: p } = body || {};
  const safe = wsSafePath(p);
  if (!safe || !fs.existsSync(safe)) return json(res, 404, { error: "不存在" });
  const ext = path.extname(safe).toLowerCase();
  const tmp = safe.replace(/\\/g, "\\\\");
  let script;
  if (ext === ".docx") {
    script = `import docx, sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
d = docx.Document(sys.argv[1])
out = []
for p in d.paragraphs:
    t = p.text.strip()
    if not t: continue
    st = (p.style.name or "").lower() if p.style else ""
    if "heading 1" in st: out.append("# " + t)
    elif "heading 2" in st: out.append("## " + t)
    elif "heading 3" in st: out.append("### " + t)
    else: out.append(t)
for tb in d.tables:
    out.append("")
    for row in tb.rows:
        out.append("| " + " | ".join(c.text.strip() for c in row.cells) + " |")
    out.append("")
print("
".join(out))`;
  } else if (ext === ".xlsx") {
    script = `import openpyxl, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
wb = openpyxl.load_workbook(sys.argv[1], read_only=True)
for ws in wb.worksheets:
    print("## " + ws.title)
    for row in ws.iter_rows(values_only=True):
        vals = [str(c) if c is not None else "" for c in row]
        if any(vals): print("| " + " | ".join(vals) + " |")
    print("")`;
  } else return json(res, 400, { error: "仅支持 docx/xlsx 转 markdown" });
  try {
    const text = await new Promise((resolve, reject) => {
      execFile("python", ["-c", script, tmp], { timeout: 60000, windowsHide: true, encoding: "utf8" }, (err, stdout) => err ? reject(err) : resolve(stdout));
    });
    json(res, 200, { ok: true, markdown: text });
  } catch (e) { json(res, 500, { error: "转换失败: " + String(e?.message || e).slice(0, 100) }); }
}

// ══ 统一模型接入层：所有模型一视同仁（对话 + 工具循环 + 思考提取）══
const UNIFIED_TOOLS = [
  { type: "function", function: { name: "bash", description: "运行 shell 命令（Windows cmd），如 dir、node、python、git", parameters: { type: "object", properties: { command: { type: "string", description: "要运行的命令" } }, required: ["command"] } } },
  { type: "function", function: { name: "read", description: "读取工作空间内文件内容", parameters: { type: "object", properties: { path: { type: "string", description: "文件路径（相对工作空间）" } }, required: ["path"] } } },
  { type: "function", function: { name: "write", description: "写入文件（自动创建目录）", parameters: { type: "object", properties: { path: { type: "string", description: "文件路径（相对工作空间）" }, content: { type: "string", description: "文件内容" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "edit", description: "用精确文本替换修改文件（先 read 再 edit）", parameters: { type: "object", properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } }, required: ["path", "oldText", "newText"] } } },
  { type: "function", function: { name: "web_search", description: "联网搜索（DuckDuckGo，无需 key）。查询资料、最新信息、验证事实时使用。返回前 5 条结果标题+摘要+链接", parameters: { type: "object", properties: { query: { type: "string", description: "搜索关键词（中文/英文均可）" } }, required: ["query"] } } },
];
// Web 搜索：Bing 网页搜索（免费无 key，走系统代理）。返回结构化结果列表
async function webSearchTool(query) {
  try {
    const q = encodeURIComponent(String(query || "").slice(0, 200));
    const r = await httpJsonFetch(`https://www.bing.com/search?q=${q}&count=5`, {
      method: "GET", timeout: 20000,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" },
    });
    if (!r || !r.ok) return `（搜索请求失败: HTTP ${r?.status || "?"}）`;
    const html = await r.text();
    const results = [];
    // Bing 结果块：<li class="b_algo">…<h2><a href="...">标题</a></h2>…<p class="b_lineclamp…">摘要</p>
    const re = /<li class="b_algo"[^>]*>([\s\S]*?)(?=<li class="b_algo"|<\/ol>|$)/g;
    let m;
    while ((m = re.exec(html))) {
      const block = m[1];
      const a = block.match(/<h2[^>]*>.*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const p = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
      if (!a) continue;
      const title = stripHtml(a[2]).slice(0, 120);
      let url = a[1].trim().replace(/&amp;/g, "&");
      // Bing 跳转链接：/ck/a 里的 u=a1…参数是 base64 编码的真实地址（如 aHR0cHM6…），解码还原
      const um = url.match(/[?&]u=a1([^&]+)/);
      if (um) {
        const enc = um[1].replace(/\+/g, " ");
        try {
          // 先试 base64（Bing 的 u 参数格式）
          const b64 = atobSafe(enc);
          if (/^https?:\/\//.test(b64)) url = b64;
          else url = decodeURIComponent(enc);
        } catch { try { url = decodeURIComponent(enc); } catch {} }
      }
      const snippet = p ? stripHtml(p[1]).slice(0, 200) : "";
      if (title) results.push({ title, url, snippet });
    }
    if (!results.length) return "（搜索无结果，可尝试换关键词）";
    return results.slice(0, 5).map((x, i) => `${i + 1}. ${x.title}\n   ${x.url}\n   ${x.snippet}`).join("\n");
  } catch (e) {
    return `（搜索失败: ${String(e?.message || e).slice(0, 100)}）`;
  }
}
function stripHtml(s) { return String(s).replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim(); }
function atobSafe(s) { return Buffer.from(String(s).trim(), "base64").toString("utf8"); }
// Windows 内联代码改写：node -e / python -c 的多行或引号嵌套代码在 cmd 下会被拆坏
// （典型错误：SyntaxError: unterminated string literal / "const ^^^^）
// 改写为写临时文件再执行。返回 {cmd, file, code} 或 null（无需改写）
function rewriteInlineCode(cmd) {
  const nodeM = cmd.match(/^\s*(?:node|nodejs|bun|deno)\s+(-e|--eval|--print)\s+(.+)$/s);
  const pyM = cmd.match(/^\s*(?:python|python3|py)\s+-c\s+(.+)$/s);
  if (!nodeM && !pyM) return null;
  const isNode = !!nodeM;
  const raw = (nodeM ? nodeM[2] : pyM[1]).trim();
  // 提取引号内的代码：支持双引号或单引号包裹
  let code = null;
  const dq = raw.match(/^"([\s\S]*?)"\s*$/);
  const sq = raw.match(/^'([\s\S]*?)'\s*$/);
  if (dq) code = dq[1];
  else if (sq) code = sq[1];
  else code = raw; // 无引号包裹（少见）
  // 是否需要改写：含换行 或 内部引号与包裹引号冲突
  const hasNewline = /\n/.test(code);
  const nestedQuote = dq ? /[\\"']/.test(code) : sq ? /["']/.test(code) : true;
  if (!hasNewline && !nestedQuote) return null; // 简单命令直接用
  const tmp = path.join(os.tmpdir(), `pi-inline-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${isNode ? "js" : "py"}`);
  return { file: tmp, code, interp: isNode ? (process.env.npm_node || process.execPath || "node") : "python" };
}

async function executeUnifiedTool(name, args) {
  try {
    if (name === "bash") {
      const cmd = String(args?.command || "").trim();
      if (!cmd) return { text: "空命令", isError: true };
      // 危险命令拦截（防 prompt injection / 幻觉触发不可逆操作）
      const DANGEROUS = /^\s*(rm\s+(-rf|-r|-f)?|format\s+[a-zA-Z]:|del\s+\/[sf]|rd\s+\/s|shutdown|taskkill\s+\/f|reg\s+delete|diskpart|mkfs|dd\s+if=)/i;
      if (DANGEROUS.test(cmd)) return { text: "⚠️ 拒绝执行：该命令可能造成不可逆数据丢失", isError: true };
      // 交互命令防护：pi / node / python 等命令若被模型幻觉出无效子命令，会进入交互模式挂起直到超时
      // （典型：`pi list-models` 不是有效命令，pi CLI 把它当消息参数启动交互会话 → 挂 5 分钟）
      const PI_CMDS = new Set(["install", "remove", "uninstall", "update", "list", "config", "auth", "--help", "-h", "--version", "-v", "--provider", "--model", "--print", "-p", "--continue", "-c", "--resume", "-r"]);
      const piM = cmd.match(/^\s*pi(?:\s+([a-zA-Z-]+))?/);
      if (piM) {
        const sub = piM[1] || "";
        if (sub && !PI_CMDS.has(sub) && !sub.startsWith("--")) {
          return { text: `⚠️ "pi ${sub}" 不是有效命令（pi 支持: install/remove/update/list/config/auth）。\n正确用法：\n- 查看已安装包: pi list\n- 安装: pi install <source>\n- 卸载: pi remove <source>\n请改用正确的命令，或先运行 "pi --help" 查看完整用法。`, isError: true };
        }
      }
      // 其他常见的无输出交互命令直接拦截（避免挂起）：
      const INTERACTIVE = /^(pip|npm|npx|yarn|pnpm|git)\s+(login|init\s+-y?)/i;
      if (INTERACTIVE.test(cmd)) return { text: `⚠️ 拒绝执行交互式命令（${cmd.slice(0, 40)}），可能挂起等待输入`, isError: true };
      // Windows cmd 引号问题修复：node -e / python -c 内联代码含换行或嵌套引号时，cmd 会拆坏代码（典型错误 "const ^^^^"）
      // 自动改写为「写临时文件再执行」，让模型的内联脚本稳定运行，消除工具重试循环的根源
      const fixed = rewriteInlineCode(cmd);
      if (fixed) {
        console.log(`[pi-web] 内联代码改写: ${cmd.slice(0, 60)}... -> ${fixed.file}`);
        try { fs.writeFileSync(fixed.file, fixed.code, "utf8"); } catch {}
      }
      const cleanup = fixed ? (() => { try { fs.unlinkSync(fixed.file); } catch {} }) : null;
      // 异步执行，避免阻塞事件循环（同步 execFileSync 会让整个服务器卡住）
      // 非零退出码也返回输出（如 grep 无匹配、git status 非干净状态），让模型自行判断；仅超时/被 kill 视为异常
      // 注意：改写后的内联代码必须绕过 cmd（cmd 会把带引号的绝对路径与 cwd 拼接，导致 MODULE_NOT_FOUND），直接 execFile 解释器
      const run = fixed
        ? new Promise((resolve, reject) => {
            execFile(fixed.interp, [fixed.file], { encoding: "buffer", timeout: 300000, cwd: CONFIG.cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, out, errOut) => {
              if (err && err.killed) reject(err);
              else resolve({ stdout: out, stderr: errOut, exitCode: err?.code ?? 0 });
            });
          })
        : new Promise((resolve, reject) => {
            execFile(process.env.ComSpec || "cmd.exe", ["/c", cmd], { encoding: "buffer", timeout: 300000, cwd: CONFIG.cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, out, errOut) => {
              if (err && err.killed) reject(err);
              else resolve({ stdout: out, stderr: errOut, exitCode: err?.code ?? 0 });
            });
          });
      try {
        const { stdout, stderr, exitCode } = await run;
        cleanup?.();
        let text = stdout.toString("utf8");
        if (/\uFFFD/.test(text)) {
          try { text = new TextDecoder("gbk").decode(stdout); } catch {}
        }
        if (stderr && stderr.length) {
          let es = stderr.toString("utf8");
          if (/\uFFFD/.test(es)) { try { es = new TextDecoder("gbk").decode(stderr); } catch {} }
          text += (text ? "\n" : "") + es;
        }
        const exitMark = exitCode ? `\n[退出码 ${exitCode}]` : "";
        return { text: (text.replace(/\r\n/g, "\n") || "(无输出)") + exitMark, isError: exitCode ? true : false };
      } catch (e) {
        cleanup?.();
        // 命令执行超时/被 kill：明确告知（之前 60s 超时对大任务不够，已提到 300s）
        const msg = String(e?.message || e);
        const reason = e?.killed || /timeout|killed/i.test(msg) ? "执行超过 5 分钟被终止" : "执行失败";
        return { text: `命令${reason}: ${msg.slice(0, 200)}`, isError: true };
      }
    }
    if (name === "read") {
      const p = wsSafePath(args?.path);
      if (!p || !fs.existsSync(p)) return { text: `文件不存在: ${args?.path}`, isError: true };
      if (fs.statSync(p).isDirectory()) return { text: "这是一个目录，请指定文件", isError: true };
      const c = fs.readFileSync(p, "utf8");
      return { text: c.slice(0, 50000), isError: false };
    }
    if (name === "write") {
      const p = wsSafePath(args?.path);
      if (!p) return { text: "路径越权", isError: true };
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const content = String(args?.content ?? "");
      fs.writeFileSync(p, content, "utf8");
      return { text: `✅ 已写入 ${args?.path}（${content.length} 字符）`, isError: false };
    }
    if (name === "edit") {
      const p = wsSafePath(args?.path);
      if (!p || !fs.existsSync(p)) return { text: `文件不存在: ${args?.path}`, isError: true };
      const c = fs.readFileSync(p, "utf8");
      const oldT = String(args?.oldText ?? "");
      if (!c.includes(oldT)) return { text: "未找到 oldText 片段（可能已修改）", isError: true };
      fs.writeFileSync(p, c.replace(oldT, String(args?.newText ?? "")), "utf8");
      return { text: `✅ 已修改 ${args?.path}`, isError: false };
    }
    if (name === "web_search") {
      const r = await webSearchTool(args?.query);
      return { text: r, isError: r.startsWith("（搜索") || r.startsWith("(") ? true : false };
    }
    return { text: `未知工具: ${name}`, isError: true };
  } catch (e) {
    return { text: `工具执行失败: ${String(e?.message || e).slice(0, 200)}`, isError: true };
  }
}
// 统一对话循环：openai 兼容 API → tool_calls 循环 → 思考提取
async function unifiedChat(model, messages, opts = {}) {
  const auth = readJsonFile(AUTH_PATH);
  const key = auth[model.provider]?.key;
  if (!key) return { error: `无 ${model.provider} 的 key` };
  const resolved = resolveAuth(model.provider);
  const store = readJsonFile(MODELS_PATH);
  const mdef = (store[model.provider]?.models || []).find(m => m.id === model.id)
    || modelList.find(m => m.provider === model.provider && m.id === model.id);
  const baseUrl = resolved?.baseUrl || mdef?.baseUrl || model.baseUrl;
  if (!baseUrl) return { error: "无 baseUrl" };
  const base = (baseUrl || "").replace(/\/+$/, "");
  const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
  const history = [...messages];
  const toolDefs = opts.tools === false ? undefined : (opts.tools || UNIFIED_TOOLS);
  // 官方理念：按模型声明的 reasoning/compat/thinkingLevelMap 统一适配（不按厂商特判）
  const isReasoning = mdef?.reasoning === true || model.reasoning === true;
  const compat = mdef?.compat || model.compat || {};
  const thinkingLevelMap = mdef?.thinkingLevelMap || model.thinkingLevelMap || null;
  // 思考模型：映射 pi thinking level → provider 参数（默认 high）；不支持时降级
  let thinkingParam = null;
  if (isReasoning) {
    const mapped = thinkingLevelMap?.["high"];
    if (mapped !== null && mapped !== false && mapped !== undefined) thinkingParam = mapped;
    else if (compat.supportsReasoningEffort !== false) thinkingParam = "high";
  }
  const buildBody = (withThinking) => {
    const body = {
      model: model.id,
      messages: history,
      ...(toolDefs ? { tools: toolDefs, tool_choice: "auto" } : {}),
      stream: false,
      max_tokens: Math.min(mdef?.maxTokens || 8192, 8192),
    };
    // 模型参数（借鉴 Open WebUI 参数面板）：temperature / top_p 可调
    if (opts.params) {
      if (typeof opts.params.temperature === "number" && opts.params.temperature >= 0 && opts.params.temperature <= 2) body.temperature = opts.params.temperature;
      if (typeof opts.params.top_p === "number" && opts.params.top_p > 0 && opts.params.top_p <= 1) body.top_p = opts.params.top_p;
    }
    if (withThinking && thinkingParam !== null) body.reasoning_effort = thinkingParam;
    return body;
  };
  const mkReq = (u, withThinking) => httpJsonFetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(buildBody(withThinking)),
    timeout: 300000, // 思考模型多轮工具调用可能很慢（每轮 30-60s），120s 不够
  });
  let usedThinking = thinkingParam !== null;
  let turn = 0;
  const seenCalls = new Map();
  while (turn < 20) {
    turn++;
    // 客户端已断开 → 立即停止（打断场景：前端 abort 后不再继续消耗模型调用）
    if (opts.signal?.aborted) return { aborted: true };
    let r;
    // 自动重试：网络错误/5xx 重试最多 2 次
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        r = await mkReq(`${baseNoV1}/v1/chat/completions`, usedThinking);
        if (r.status === 404) r = await mkReq(`${baseNoV1}/chat/completions`, usedThinking);
        if (!r.ok && r.status >= 500 && attempt === 0) { await new Promise(x => setTimeout(x, 1500)); continue; }
        break;
      } catch (e) {
        if (attempt === 0 && !/timeout/i.test(String(e?.message || ""))) { await new Promise(x => setTimeout(x, 1500)); continue; }
        throw e;
      }
    }
    // 模型不接受 reasoning_effort → 去掉思考参数重试（统一降级，非厂商特判）
    if (!r.ok && usedThinking && (r.status === 400 || r.status === 422)) {
      usedThinking = false;
      r = await mkReq(`${baseNoV1}/v1/chat/completions`, false);
      if (r.status === 404) r = await mkReq(`${baseNoV1}/chat/completions`, false);
    }
    if (!r.ok) {
      const errBody = await r.text().catch(() => "");
      return { error: `HTTP ${r.status}: ${String(errBody).slice(0, 150)}` };
    }
    const data = await r.json();
    const msg = data.choices?.[0]?.message || {};
    const tcs = msg.tool_calls;
    if (tcs && tcs.length && toolDefs) {
      history.push({ role: "assistant", content: msg.content || null, tool_calls: tcs });
      for (const tc of tcs) {
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
        const fnName = tc.function?.name || "";
        // 重复检测：相同工具+相同参数连续 3 次 → 中断（防死循环）
        // 失败重试（isError）不算死循环——模型在环境问题（网络/权限）下合理重试，但连续 5 次失败也停，避免无限空转
        const sig = fnName + ":" + JSON.stringify(args);
        seenCalls.set(sig, (seenCalls.get(sig) || 0) + 1);
        if (opts.onTool) opts.onTool(tc.id, fnName, args);
        const out = await executeUnifiedTool(fnName, args);
        const failed = out.isError === true;
        if (!failed && seenCalls.get(sig) >= 3) {
          return { error: "模型工具调用陷入循环，已中断（建议换一种方式提问）" };
        }
        if (failed && seenCalls.get(sig) >= 5) {
          // 失败重试 5 次仍不行：作为工具结果注入，让模型看到失败原因并换策略（而非继续空转）
          out.text = `[系统提示] 工具 ${fnName} 已连续失败 5 次（最近错误：${String(out.text || "").slice(0, 100)}）。请换一种方式完成任务，不要重复相同的失败操作。`;
        }
        if (opts.onToolEnd) opts.onToolEnd(tc.id, fnName, args, out);
        history.push({ role: "tool", tool_call_id: tc.id, content: out.text });
      }
      continue;
    }
    const content = String(msg.content || "").trim();
    let think = String(msg.reasoning_content || "").trim();
    let text = content;
    if (/<think>[\s\S]*?<\/think>/.test(content)) {
      const m = content.match(/<think>([\s\S]*?)<\/think>/);
      if (!think) think = String(m?.[1] || "").trim();
      text = content.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
    }
    return { think, text: text || null, history };
  }
  // 超过轮数上限：尽量返回中间结果（不直接丢错误）
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "assistant" && m.content && !m.tool_calls) {
      return { text: String(m.content), partial: true };
    }
  }
  return { error: "工具调用超过 20 轮，已停止（任务过于复杂或陷入循环）" };
}

// ══ 消息看板：pi 更新 + 能力看板 ══
const CAPABILITIES = [
  { icon: "💬", name: "多模型对话", desc: "deepseek / 小米 mimo / Agnes，思考 + 工具调用" },
  { icon: "🛠", name: "编程工具", desc: "读文件 / 写文件 / 编辑 / 跑命令（与 TUI 同一引擎）" },
  { icon: "🧠", name: "思考块", desc: "reasoning 思考过程内联显示" },
  { icon: "🖼", name: "媒体生成", desc: "配图 / 配音 / 视频，自动落盘到工作空间" },
  { icon: "📦", name: "工作空间", desc: "工程 / 生成物 / 文档 / 交付 四区管理" },
  { icon: "📤", name: "一键交付", desc: "成品交付 + 版本递增 + zip 打包" },
  { icon: "📄", name: "文档中心", desc: "Markdown 渲染 / PDF / Office 解析 / 转 Markdown" },
  { icon: "🌳", name: "会话分支", desc: "分支切换、模板、项目分组、导出" },
  { icon: "🎨", name: "主题系统", desc: "霓虹主题 + 全屏壁纸 + 侧边栏透明" },
  { icon: "👤", name: "人格小语", desc: "直接、有条理、有审美、讨厌机器人味" },
];
async function handleNotices(res) {
  let releases = [];
  try {
    const py = `import urllib.request, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
try:
    req = urllib.request.Request("https://api.github.com/repos/earendil-works/pi/releases?per_page=8", headers={"User-Agent":"pi-web","Accept":"application/vnd.github+json"})
    data = json.loads(urllib.request.urlopen(req, timeout=20).read())
    for r in data:
        print(json.dumps({"tag": r.get("tag_name",""), "name": r.get("name",""), "date": (r.get("published_at") or "")[:10], "body": (r.get("body") or "")[:300]}, ensure_ascii=False))
except Exception as e:
    print("ERR:" + str(e))`;
    const out = await new Promise((resolve, reject) => execFile("python", ["-c", py], { timeout: 30000, windowsHide: true, encoding: "utf8" }, (err, stdout) => err ? reject(err) : resolve(stdout)));
    for (const line of out.trim().split("\n").filter(Boolean)) {
      if (line.startsWith("ERR:")) { console.log("[pi-web] GitHub 拉取失败:", line.slice(4).slice(0, 60)); continue; }
      try { releases.push(JSON.parse(line)); } catch {}
    }
  } catch {}
  let piVersion = "?";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(CONFIG.piPackage), "..", "package.json"), "utf8"));
    piVersion = pkg.version || "?";
  } catch {}
  json(res, 200, { releases, piVersion, capabilities: CAPABILITIES });
}

// ══ 自愈修复 ══
let repairBusy = false;
async function handleRepair(res, body) {
  const issue = String(body?.issue || "").trim();
  if (!issue) return json(res, 400, { error: "缺少问题描述" });
  if (repairBusy) return json(res, 409, { error: "已有修复任务进行中" });
  repairBusy = true;
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write(":\n\n");
  const write = (event, data) => { try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {} };
  try {
    write("delta", { text: "🔧 小语开始修复…\n" });
    const sm = SessionManager.create(CONFIG.cwd, SESSIONS_DIR);
    const agent = await createSessionAgent(sm, defaultModel);
    write("delta", { text: "🧠 正在分析代码并修复…\n" });
    const reply = await agent.prompt(`你是 pi-web（D:\\pi-web）的修复工程师。用户报告了问题：\n${issue}\n\n请：\n1. 用 read 工具检查 server.mjs / public/index.html 相关代码
2. 定位并修复问题
3. 用 bash 运行 node --check server.mjs 验证语法\n4. 完成后回复「修复完成」并简述改了什么\n\n注意：只修改 D:\\pi-web 下的文件，不要动 node_modules。`);
    write("delta", { text: "\n" + String(reply || "").slice(0, 800) + "\n" });
    write("delta", { text: "\n✅ 修复完成，重启服务中…（页面会自动恢复）" });
    write("done", { repair: true });
    setTimeout(() => {
      console.log("[pi-web] 自愈重启…");
      try { spawn(process.execPath, [process.argv[1]], { detached: true, stdio: "ignore" }); } catch {}
      setTimeout(() => { try { process.exit(0); } catch {} }, 900);
    }, 1500);
  } catch (e) {
    repairBusy = false;
    write("error", { message: String(e?.message || e).slice(0, 300) });
  }
}

// ══ 可视化设计器：AI 生成页面 ══
async function handleDesignerGenerate(res, body) {
  const promptText = String(body?.prompt || "").trim();
  if (!promptText) return json(res, 400, { error: "缺少描述" });
  try {
    const fullPrompt = `你是资深网页设计师。根据需求生成一个完整、自包含的 HTML 页面。

需求：${promptText}

要求：
- 输出完整的 <!DOCTYPE html> 代码，样式全部内联在 <style> 标签里
- 现代美观的设计，配色协调，有层次感，移动端也能看（用简单的响应式）
- 不要使用外部图片链接（用 CSS 渐变、纯色、或 data URI 占位）
- 可以直接在浏览器打开预览
- 只输出 HTML 代码，不要任何解释、不要 markdown 代码围栏`;
    const result = await directChat(defaultModel, fullPrompt);
    const raw = String(result?.text || "").trim();
    if (!raw) return json(res, 500, { error: "模型未返回内容，请重试" });
    const m = raw.match(/```html\s*([\s\S]*?)```/);
    const html = (m ? m[1] : raw).trim();
    if (!html.includes("<!DOCTYPE") && !html.includes("<html")) return json(res, 500, { error: "模型未返回 HTML" });
    json(res, 200, { html });
  } catch (e) { json(res, 500, { error: String(e?.message || e).slice(0, 150) }); }
}

// POST /api/designer/save —— 保存页面到工程
async function handleDesignerSave(res, body) {
  const { project, filename, html } = body || {};
  const clean = String(project || "").replace(/[\/:*?"<>|\s]+/g, "-").slice(0, 60);
  const fname = String(filename || "index.html").replace(/[\/:*?"<>|]+/g, "-").slice(0, 60);
  if (!clean || !html) return json(res, 400, { error: "缺少项目名或内容" });
  const safe = wsSafePath(path.join("工程", clean, fname));
  if (!safe) return json(res, 403, { error: "路径越权" });
  try {
    fs.mkdirSync(path.dirname(safe), { recursive: true });
    fs.writeFileSync(safe, html, "utf8");
    json(res, 200, { ok: true, path: "工程/" + clean + "/" + fname });
  } catch (e) { json(res, 500, { error: String(e?.message || e).slice(0, 100) }); }
}

// 多模型对比（借鉴 Open WebUI：同一问题同时问多个模型，结果并排展示）
async function handleCompare(res, body) {
  const message = String(body?.message || "").trim();
  const models = Array.isArray(body?.models) ? body.models.slice(0, 4) : [];
  if (!message) return json(res, 400, { error: "消息不能为空" });
  if (!models.length) return json(res, 400, { error: "至少选择一个模型" });
  const tasks = models.map(async (mk) => {
    const m = modelList.find(x => x.provider === mk.provider && x.id === mk.id);
    if (!m) return { provider: mk.provider, id: mk.id, error: "模型未找到" };
    const t0 = Date.now();
    try {
      const rules = loadProjectRules();
      const history = rules.length ? [{ role: "system", content: rules.join("\n") }] : [];
      const r = await directChat(m, message, history);
      return { provider: m.provider, id: m.id, text: r?.text || "（无回复）", ms: Date.now() - t0, error: r?.error };
    } catch (e) {
      return { provider: m.provider, id: m.id, error: String(e?.message || e).slice(0, 100), ms: Date.now() - t0 };
    }
  });
  const results = await Promise.all(tasks);
  json(res, 200, { message, results });
}

// SSE 心跳：每 20s 发注释行保持连接活跃（对抗公网隧道/代理的 idle 超时）
function startSseHeartbeat(res) {
  const hb = setInterval(() => {
    try { res.write(": ping\n\n"); } catch {}
  }, 20000);
  return hb;
}

// 直调模型接口拿文本（绕过 agent，稳定快速）
async function directChat(model, message, history = []) {
  try {
    const auth = readJsonFile(AUTH_PATH);
    const key = auth[model.provider]?.key;
    if (!key) return null;
    const resolved = resolveAuth(model.provider);
    const store = readJsonFile(MODELS_PATH);
    const mdef = (store[model.provider]?.models || []).find(m => m.id === model.id)
      || modelList.find(m => m.provider === model.provider && m.id === model.id);
    const baseUrl = resolved?.baseUrl || mdef?.baseUrl;
    if (!baseUrl) return null;
    const base = (baseUrl || "").replace(/\/+$/, "");
    const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
    const messages = [...history, { role: "user", content: message }];
    const mkReq = (u) => httpJsonFetch(u, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model.id, messages, stream: false, max_tokens: Math.min(mdef?.maxTokens || 8192, 8192) }),
      timeout: 120000,
    });
    let r = await mkReq(`${baseNoV1}/v1/chat/completions`);
    if (r.status === 404) r = await mkReq(`${baseNoV1}/chat/completions`);
    if (!r.ok) return null;
    const data = await r.json();
    const msg = data.choices?.[0]?.message || {};
    const content = msg.content || "";
    const raw = content.trim();
    let think = (msg.reasoning_content || "").trim();
    let text = raw;
    if (/<think>[\s\S]*?<\/think>/.test(raw)) {
      const m = raw.match(/<think>([\s\S]*?)<\/think>/);
      if (!think) think = (m?.[1] || "").trim();
      text = raw.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
    }
    return { think, text: text || null };
  } catch (e) {
    if (e && /timeout/i.test(String(e?.message || ""))) return { timeout: true };
    return null;
  }
}

// POST /api/think —— 双模型流水线：用指定模型先推理
async function handleThink(res, body) {
  const { provider, modelId, message } = body || {};
  if (!provider || !modelId || !message) return json(res, 400, { error: "缺少 provider / modelId / message" });
  const store = readJsonFile(MODELS_PATH);
  const resolved = resolveAuth(provider);
  if (!resolved) return json(res, 400, { error: `${provider} 未配置 API Key（模型管理中添加）` });
  const mdef = (store[provider]?.models || []).find(m => m.id === modelId);
  if (!mdef) return json(res, 404, { error: `模型 ${provider}/${modelId} 未找到` });
  const baseUrl = resolved.baseUrl || mdef.baseUrl;
  const key = resolved.key;
  const apiType = mdef.api || "openai-completions";
  try {
    let data, modelName;
    if (apiType === "anthropic-messages") {
      const r = await httpJsonFetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: modelId, max_tokens: Math.min(mdef.maxTokens || 8192, 8192), messages: [{ role: "user", content: message }] }),
        timeout: 180000,
      });
      if (!r.ok) { const txt = await r.text().catch(() => ""); return json(res, 502, { error: `思考模型调用失败 ${r.status}: ${txt.slice(0, 150)}` }); }
      data = await r.json();
      modelName = data.model || modelId;
      const blocks = data.content || [];
      const thinking = blocks.filter(b => b.type === "thinking").map(b => b.text || "").join("");
      const content = blocks.filter(b => b.type === "text").map(b => b.text || "").join("");
      const text = (thinking || content || "").trim();
      if (!text) return json(res, 500, { error: "思考模型未返回内容" });
      return json(res, 200, { text, model: modelName, reasoning: !!thinking });
    }
    const base = (baseUrl || "").replace(/\/+$/, "");
    const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
    const mkReq = (u) => httpJsonFetch(u, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: message }], stream: false, max_tokens: Math.min(mdef.maxTokens || 8192, 8192) }),
      timeout: 120000,
    });
    let r = await mkReq(`${baseNoV1}/v1/chat/completions`);
    if (r.status === 404) r = await mkReq(`${baseNoV1}/chat/completions`);
    if (!r.ok) { const txt = await r.text().catch(() => ""); return json(res, 502, { error: `思考模型调用失败 ${r.status}: ${txt.slice(0, 150)}` }); }
    data = await r.json();
    modelName = data.model || modelId;
    const msg = data.choices?.[0]?.message || {};
    const reasoning = msg.reasoning_content || "";
    const content = msg.content || "";
    let text = (reasoning || content || "").trim();
    if (!reasoning && /<think>/.test(text)) { text = text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim() || text; }
    if (!text) return json(res, 500, { error: "思考模型未返回内容" });
    json(res, 200, { text, model: modelName, reasoning: !!reasoning });
  } catch (e) {
    json(res, 500, { error: String(e?.message || e).slice(0, 200) });
  }
}

// 视频生成（任务式轮询）
async function generateVideo(provider, modelId, prompt) {
  const resolved = resolveAuth(provider);
  if (!resolved) return { error: `${provider} 未配置 API Key` };
  const baseUrl = resolved.baseUrl || (readJsonFile(MODELS_PATH)[provider]?.models || []).find(m => m.id === modelId)?.baseUrl;
  const key = resolved.key;
  const base = (baseUrl || "").replace(/\/+$/, "");
  const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
  try {
    const createR = await httpJsonFetch(`${baseNoV1}/video/generations`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, prompt, n: 1 }), timeout: 60000,
    });
    if (!createR.ok) { const t = await createR.text().catch(() => ""); return { error: `视频任务创建失败 ${createR.status}: ${t.slice(0, 150)}` }; }
    const created = await createR.json();
    const taskId = created.task_id || created.id || created.data?.task_id;
    if (!taskId) return { error: "视频接口未返回任务 ID" };
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const qR = await httpJsonFetch(`${baseNoV1}/videos/generations?task_id=${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${key}` }, timeout: 20000,
        });
        if (!qR.ok) continue;
        const q = await qR.json();
        const url = q.url || q.video_url || q.output?.url || q.data?.url || q.data?.video_url;
        if (url) return { video: url, task_id: taskId };
        if (q.status === "failed" || q.state === "failed") return { error: "视频生成失败" };
      } catch {}
    }
    return { error: "视频生成超时（120s）", task_id: taskId };
  } catch (e) { return { error: String(e?.message || e).slice(0, 150) }; }
}

// POST /api/media —— 视频生成
async function handleMedia(res, body) {
  const { provider, modelId, prompt } = body || {};
  if (!provider || !modelId || !prompt) return json(res, 400, { error: "缺少参数" });
  const r = await generateVideo(provider, modelId, prompt);
  if (r.video) return json(res, 200, { video: r.video, task_id: r.task_id });
  return json(res, 500, { error: r.error || "视频生成失败" });
}

// 直调通道：绕开 pi agent，直接调接口并维护会话历史
async function handleDirectChat(res, entry, message, sessionId) {
  let hist = [];
  try {
    const file = entry.sm.sessionFile;
    if (file && fs.existsSync(file)) hist = extractMessages(readEntriesFromFile(file)).slice(-20);
  } catch {}
  const mediaIntents = detectMediaIntents(message);
  const mediaPromise = mediaIntents.length
    ? Promise.all(mediaIntents.map(it => generateMediaAsync(it, extractMediaPrompt(message))))
    : Promise.resolve([]);
  const result = await directChat(defaultModel, message, hist.map(h => ({ role: h.role, content: h.text })));
  if (!result || result.timeout) {
    sseWrite(res, "error", { message: result?.timeout ? "模型响应超时（60s），请稍后重试" : "模型未返回内容，请稍后重试" });
    return;
  }
  const text = result.text;
  if (!text) { sseWrite(res, "error", { message: "模型未返回内容，请稍后重试" }); return; }
  try {
    entry.sm.appendMessage({ role: "user", content: [{ type: "text", text: message }] });
    entry.sm.appendMessage({ role: "assistant", content: [{ type: "text", text }] });
  } catch {}
  if (entry.agent) { try { entry.agent.dispose(); } catch {} entry.agent = null; }
  if (!entry.sm.getSessionName()) { try { entry.sm.appendSessionInfo(message.slice(0, 24)); } catch {} }
  if (result.think) { sseWrite(res, "think", { text: result.think }); sseWrite(res, "think_end", {}); }
  sseWrite(res, "delta", { text });
  const mediaResults = await mediaPromise;
  for (const mr of mediaResults) {
    if (!mr) continue;
    if (mr.url) mr.url = await saveArtifact(mr);  // 产物落盘 → 本地路径
    sseWrite(res, "media", mr);
  }
  sseWrite(res, "done", { sessionId });
  console.log(`[pi-web] 直调通道: ${defaultModel.provider}/${defaultModel.id}`);
}

// 上下文压缩：历史超限时用模型摘要旧消息（保留最近 8 条），防止长对话撑爆上下文
async function maybeCompactHistory(history, model) {
  const total = history.reduce((n, m) => n + String(m.content || "").length, 0);
  if (history.length < 12 || total < 80000) return history;
  const keep = history.slice(-8);
  const old = history.slice(0, -8);
  const oldText = old.map(m => `${m.role}: ${typeof m.content === "string" ? m.content.slice(0, 600) : "(工具调用)"}`).join("\n");
  try {
    const summary = await unifiedChat(model, `请用不超过 250 字总结以下对话的关键信息（保留：用户的需求、已创建的文件的路径、已完成的关键操作、待办事项）。只输出总结：

${oldText.slice(0, 40000)}`, { tools: false });
    if (summary && summary.text) {
      return [{ role: "system", content: "【早前对话摘要】" + summary.text }, ...keep];
    }
  } catch {}
  return history;
}

// 统一通道：所有模型走 unifiedChat（对话 + 工具 + 思考 + 媒体 + 压缩 + 重试）
async function handleUnifiedChat(res, entry, message, sessionId, params, signal) {
  let hist = [];
  try {
    const file = entry.sm.sessionFile;
    if (file && fs.existsSync(file)) hist = extractMessages(readEntriesFromFile(file)).slice(-20);
  } catch {}
  const mediaIntents = detectMediaIntents(message);
  const mediaPromise = mediaIntents.length
    ? Promise.all(mediaIntents.map(it => generateMediaAsync(it, extractMediaPrompt(message))))
    : Promise.resolve([]);
  const onToolStart = (id, name, args) => sseWrite(res, "tool", { name, args, id });
  const onToolEnd = (id, name, args, out) => {
    const text = out?.text || "";
    sseWrite(res, "tool_end", { name, id, isError: out?.isError === true, output: text.slice(0, 2000) });
  };
  let history = [...hist.map(h => ({ role: h.role, content: h.text })), { role: "user", content: message }];
  // 注入项目规则（.pi-rules.md，借鉴 Windsurf rules），确保不挤占历史上下文
  const rules = loadProjectRules();
  if (rules.length) history = [{ role: "system", content: rules.join("\n") }, ...history];
  history = await maybeCompactHistory(history, defaultModel);
  const result = await unifiedChat(defaultModel, history, { onTool: onToolStart, onToolEnd, params, signal });
  if (!result || result.error) {
    sseWrite(res, "error", { message: result?.error || "模型未返回内容，请稍后重试" });
    return;
  }
  // 客户端已断开 → 不写会话、不发 SSE（避免半截结果污染会话文件）
  if (result.aborted || signal?.aborted) return;
  const text = result.text;
  if (!text) { sseWrite(res, "error", { message: "模型未返回内容，请稍后重试" }); return; }
  try {
    entry.sm.appendMessage({ role: "user", content: [{ type: "text", text: message }] });
    entry.sm.appendMessage({ role: "assistant", content: [{ type: "text", text }] });
  } catch {}
  if (entry.agent) { try { entry.agent.dispose(); } catch {} entry.agent = null; }
  if (!entry.sm.getSessionName()) { try { entry.sm.appendSessionInfo(message.slice(0, 24)); } catch {} }
  if (result.think) { sseWrite(res, "think", { text: result.think }); sseWrite(res, "think_end", {}); }
  sseWrite(res, "delta", { text });
  const mediaResults = await mediaPromise;
  for (const mr of mediaResults) {
    if (!mr) continue;
    if (mr.url) mr.url = await saveArtifact(mr);
    sseWrite(res, "media", mr);
  }
  sseWrite(res, "done", { sessionId });
  console.log(`[pi-web] 统一通道: ${defaultModel.provider}/${defaultModel.id}`);
}

async function handleChat(req, res, body) {
  let message = typeof body.message === "string" ? body.message.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  console.log(`[chat] msg="${message.slice(0, 20)}" sid=${sessionId} model=${defaultModel?.provider}/${defaultModel?.id} agent=${body.model || ""}`);
  if (!message) return json(res, 400, { error: "消息不能为空" });

  // @ 文件引用：把文件内容拼入消息上下文
  if (Array.isArray(body.files) && body.files.length) {
    const parts = [];
    for (const f of body.files.slice(0, 20)) {
      if (!f?.path || typeof f.content !== "string") continue;
      if (f.content.length > 150000) f.content = f.content.slice(0, 150000) + "\n…[已截断]";
      parts.push(`参考文件 ${f.path}：\n\`\`\`\n${f.content}\n\`\`\``);
    }
    if (parts.length) message = message + "\n\n" + parts.join("\n\n");
  }

  // 图片附件：转给模型的 images 参数
  let images = [];
  if (Array.isArray(body.images) && body.images.length) {
    images = body.images
      .slice(0, 3)
      .filter(i => i?.data && i?.mimeType && i.data.length < 3 * 1024 * 1024)
      .map(i => ({ type: "image", data: i.data, mimeType: i.mimeType }));
  }

  let entry;
  if (sessionId) {
    entry = await openSession(sessionId);
    if (!entry) return json(res, 404, { error: "会话不存在" });
  } else {
    // 未命名会话：body.fresh=true 表示用户点了「新建会话」→ 新建；否则复用上一个（打断续发同一会话）
    if (body.fresh || !lastUnnamedEntry || activeSessions.get(lastUnnamedId) !== lastUnnamedEntry) {
      const id = await createSession();
      lastUnnamedId = id;
      lastUnnamedEntry = activeSessions.get(id);
      entry = lastUnnamedEntry;
    } else {
      entry = lastUnnamedEntry;
      // 用户可能切换过模型：同步最新默认模型（用完整 runtime 模型，保证 compat 生效）
      try {
        if (defaultModel) {
          let fm = defaultModel;
          try { fm = modelRuntime.getModels().find(x => x.provider === defaultModel.provider && x.id === defaultModel.id) || defaultModel; } catch {}
          const ag = await ensureAgent(entry, fm);
          await ag.setModel(fm);
        }
      } catch {}
    }
  }
  // busy → 打断当前任务（对标 TUI interrupt：同一会话上处理新消息）
  if (entry.busy) {
    const curAgent = entry.agent;
    try { await curAgent.abort(); } catch {}
    // 等待当前任务释放 busy（abort 生效通常 2-3s）
    let waited = 0;
    while (entry.busy && waited < 8000) {
      await new Promise(r => setTimeout(r, 200));
      waited += 200;
    }
    if (entry.busy) {
      // abort 未生效（LLM 流卡死）→ 销毁旧 agent 重建，彻底释放
      try { curAgent.dispose(); } catch {}
      entry.busy = false;
      for (const [id, e] of activeSessions) if (e === entry) activeSessions.delete(id);
      console.log(`[pi-web] 会话 ${sessionId || "new"} 打断失败，已销毁卡住 agent 并重建`);
      if (sessionId) {
        entry = await openSession(sessionId);
        if (!entry) return json(res, 404, { error: "会话不存在" });
      } else {
        const id = await createSession();
        lastUnnamedId = id;
        lastUnnamedEntry = activeSessions.get(id);
        entry = lastUnnamedEntry;
      }
    }
  }
  // 代次机制：每次请求递增，旧请求 finally 只在代次未变时释放 busy（防快速重发竞态）
  entry.gen = (entry.gen || 0) + 1;
  const thisGen = entry.gen;
  entry.busy = true;

  // 绘图模型（id 含 image）→ 走图像生成接口（在写 SSE headers 之前处理）
  if (defaultModel && /image/i.test(defaultModel.id)) {
    try {
      const image = await generateImage(defaultModel.provider, defaultModel.id, message);
      if (image) return json(res, 200, { image, model: `${defaultModel.provider}/${defaultModel.id}` });
    } catch {}
    return json(res, 500, { error: "绘图失败（模型不支持图像生成或 Key 无效）" });
  }
  // 视频模型（id 含 video）→ 走视频生成（异步任务轮询）
  if (defaultModel && /video/i.test(defaultModel.id)) {
    const r = await generateVideo(defaultModel.provider, defaultModel.id, message);
    if (r.video) return json(res, 200, { video: r.video, model: `${defaultModel.provider}/${defaultModel.id}` });
    return json(res, 500, { error: r.error || "视频生成失败" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // 通道策略：默认用 pi agent 官方管线（与 TUI 同源，工具执行/打断/竞态都成熟），
  // 自制 unifiedChat 仅作兑底（官方管线异常时降级）。设置 PI_USE_AGENT=0 可强制走 unifiedChat
  const useAgent = process.env.PI_USE_AGENT !== "0" && !!defaultModel;
  if (defaultModel && !useAgent) {
    const hb2 = startSseHeartbeat(res);
    // 打断支持：客户端断开 SSE 时中止 unifiedChat（不再继续工具调用/模型请求）
    const abortCtrl = new AbortController();
    const onClose = () => { try { abortCtrl.abort(); } catch {} };
    req.on("close", onClose);
    try {
      await handleUnifiedChat(res, entry, message, sessionId || findKeyByEntry(entry), body.params, abortCtrl.signal);
    } catch (e) {
      try { sseWrite(res, "error", { message: String(e?.message || e) }); } catch {}
    } finally {
      clearInterval(hb2);
      req.removeListener("close", onClose);
      // 代次匹配才释放（快速重发时新请求已占 busy，旧请求不得干扰）
      if (entry.gen === thisGen) entry.busy = false;
      try { res.end(); } catch {}
      if (entry.gen === thisGen) invalidateSessionCache(); // 消息写入会话文件 → 列表缓存失效
    }
    return;
  }

  const agent = await ensureAgent(entry, defaultModel);
  const sm = entry.sm;
  const hbTimer = startSseHeartbeat(res); // 心跳保活（公网隧道不因 idle 断开）
  let sawDelta = false; // 是否产生过文本输出（用于空回复兜底）
  let collected = "";   // 收集主模型输出（用于媒体路由的配图/配音内容）
  const mediaIntents = detectMediaIntents(message);
  // 并行启动全部媒体生成（不阻塞主模型文字流式）
  let mediaPromise = mediaIntents.length
    ? Promise.all(mediaIntents.map(it => generateMediaAsync(it, extractMediaPrompt(message))))
    : Promise.resolve([]);
  const unsubscribe = agent.subscribe((event) => {
    try {
      if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
        sawDelta = true;
        collected += event.assistantMessageEvent.delta;
        sseWrite(res, "delta", { text: event.assistantMessageEvent.delta });
      } else if (event.type === "message_update" && event.assistantMessageEvent?.type === "thinking_delta") {
        sseWrite(res, "think", { text: event.assistantMessageEvent.delta });
      } else if (event.type === "message_update" && event.assistantMessageEvent?.type === "thinking_end") {
        sseWrite(res, "think_end", {});
      } else if (event.type === "tool_execution_start") {
        sseWrite(res, "tool", { name: event.toolName, args: event.args, id: event.toolCallId });
      } else if (event.type === "tool_execution_end") {
        const text = Array.isArray(event.result?.content)
          ? event.result.content.map(c => c.text || "").join("")
          : "";
        sseWrite(res, "tool_end", { name: event.toolName, id: event.toolCallId, isError: !!event.isError, output: text });
      } else if (event.type === "turn_end") {
        sseWrite(res, "turn_end", {});
      } else if (event.type === "auto_retry_start") {
        sseWrite(res, "note", { text: `⚠️ 自动重试中（第 ${event.attempt} 次）：${event.errorMessage}` });
      } else if (event.type === "compaction_start") {
        sseWrite(res, "note", { text: "🧹 上下文压缩中…" });
      }
    } catch {}
  });

  let aborted = false;
  req.on("close", () => {
    if (!res.writableEnded && !aborted) {
      aborted = true;
      try { agent.abort(); } catch {}
      // 兜底：abort 未及时生效时（如 LLM 流卡住），2.5s 后销毁 agent 并释放 busy，避免会话被永久锁定
      setTimeout(() => {
        if (entry.busy && entry.gen === thisGen) {
          entry.busy = false;
          try { agent.dispose(); } catch {}
          for (const [id, e] of activeSessions) if (e === entry) activeSessions.delete(id);
          console.log(`[pi-web] 会话 ${sessionId || "new"} 连接断开，已销毁卡住 agent`);
        }
      }, 2500);
    }
  });

  try {
    // 自我认知：仅当用户问"你是谁/介绍自己"等身份问题时注入固定答案（不主动开场白）
    let promptMsg = message;
    if (/谁|介绍.*(自己|一下|你)|你是|你叫|名字|叫什么|干嘛的|干什么的|身份|自我介绍|能力/.test(message) && message.length < 80) {
      const m = defaultModel;
      const features = [];
      if (m?.reasoning) features.push("推理型");
      if (m?.contextWindow) features.push(`上下文 ${Math.round(m.contextWindow / 1000)}k`);
      if (Array.isArray(m?.input) && m.input.includes("image")) features.push("支持图片");
      const featText = features.length ? features.join(" · ") : "标准模型";
      const modelName = m?.name || m?.id || "未知";
      const providerName = m?.provider ? `（${m.provider}）` : "";
      promptMsg = `（自我认知指令）用户问了身份类问题。请按固定格式回答，不要展开、不要加开场白以外的内容：
"我叫小语，你的 AI 工作伙伴。我能干：写代码、做设计、整理文档、分析数据，并直接操作工作空间完成交付。由 pi 引擎驱动。当前使用模型是：${modelName}${providerName}。模型特色：${featText}。"
回答完直接等用户下一步指令。

用户消息：${message}`;
    }
    // 媒体生成与主模型并行（拿到文字即可继续推下一步，不用等全部完成）
    const mediaResults = mediaIntents.length ? await mediaPromise : [];
    await agent.prompt(promptMsg, { images });
    for (const mr of mediaResults) {
      if (!mr) continue;
      if (mr.url) mr.url = await saveArtifact(mr);  // 产物落盘 → 本地路径
      sseWrite(res, "media", mr);
    }
    // 空回复兜底：agent 完成但无任何文本输出（如 minimax 偶发把回答全放 <think>）→ 直调模型接口补一次
    if (!sawDelta && defaultModel) {
      const fallback = await directChat(defaultModel, message);
      if (fallback?.text) {
        sseWrite(res, "delta", { text: fallback.text });
        console.log(`[pi-web] 空回复兜底成功: ${defaultModel.provider}/${defaultModel.id}`);
      } else {
        console.log(`[pi-web] 空回复兜底失败: ${defaultModel.provider}/${defaultModel.id}`);
        // 明确提示（API Key 失效 / 模型异常），避免用户以为卡死
        try { sseWrite(res, "error", { message: `模型 ${defaultModel.provider}/${defaultModel.id} 无回复——API Key 可能失效或额度不足，请到模型管理中重新配置` }); } catch {}
      }
    }
    // 自动命名：尚无名称时用首条消息
    if (!entry.sm.getSessionName()) {
      try { entry.sm.appendSessionInfo(message.slice(0, 24)); } catch {}
    }
    sseWrite(res, "done", { sessionId: sessionId || findKeyByEntry(entry) });
  } catch (e) {
    // 官方 agent 管线异常 → 降级到自制 unifiedChat 兑底（避免任务静默失败）
    const agentErr = String(e?.message || e);
    console.log(`[pi-web] agent 通道异常，降级 unifiedChat: ${agentErr.slice(0, 120)}`);
    try { unsubscribe(); } catch {}
    try {
      // 降级前先释放 busy（unifiedChat 会重新接管），并用同代次避免竞态
      if (entry.gen === thisGen) entry.busy = false;
      const abortCtrl2 = new AbortController();
      const onClose2 = () => { try { abortCtrl2.abort(); } catch {} };
      req.on("close", onClose2);
      await handleUnifiedChat(res, entry, message, sessionId || findKeyByEntry(entry), body.params, abortCtrl2.signal);
      req.removeListener("close", onClose2);
    } catch (e2) {
      try { sseWrite(res, "error", { message: `降级通道也失败: ${String(e2?.message || e2)}` }); } catch {}
    }
  } finally {
    clearInterval(hbTimer);
    try { unsubscribe(); } catch {}
    // 代次匹配才释放（快速重发时新请求已占 busy，旧请求不得干扰）
    if (entry.gen === thisGen) entry.busy = false;
    try { res.end(); } catch {}
    if (entry.gen === thisGen) invalidateSessionCache(); // 消息写入会话文件 → 列表缓存失效
  }
}

function findKeyByEntry(entry) {
  for (const [id, e] of activeSessions) if (e === entry) return id;
  return null;
}

// GET /api/sessions/:id/messages
async function handleMessages(res, id, req, url) {
  const found = getSessionList().find(s => s.id === id);
  if (!found || !found.file || !fs.existsSync(found.file)) return json(res, 404, { error: "会话不存在" });
  const entries = readEntriesFromFile(found.file);
  // leafId 仅当前端显式传 ?leafId=xxx（分叉视图）时过滤；普通视图返回全部消息
  // 修复：换浏览器/终端后会话“只剩一两条/内容变了”——根因是内存 leafId 漂移导致误过滤
  const leafId = url?.searchParams?.get("leafId") || null;
  json(res, 200, { messages: extractMessages(entries, leafId), leafId });
}

// GET /api/stats/global —— 所有会话的 token/成本汇总（直接从会话文件读取 usage）
async function handleGlobalStats(res) {
  const files = scanSessionFiles();
  const rows = [];
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, messages: 0 };
  for (const file of files) {
    const info = parseSessionFile(file);
    const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, messages: 0 };
    try {
      const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
      for (const line of lines) {
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (!e || e.type !== "message" || e.message?.role !== "assistant" || !e.message?.usage) continue;
        const u = e.message.usage;
        t.input += u.input || 0;
        t.output += u.output || 0;
        t.cacheRead += u.cacheRead || 0;
        t.cacheWrite += u.cacheWrite || 0;
        const c = u.cost;
        if (typeof c === "number") t.cost += c;
        else if (c && typeof c === "object") t.cost += (c.total || c.input || 0);
        t.messages++;
      }
    } catch {}
    if (!t.messages) continue;
    totals.input += t.input; totals.output += t.output;
    totals.cacheRead += t.cacheRead; totals.cacheWrite += t.cacheWrite;
    totals.cost += t.cost; totals.messages += t.messages;
    rows.push({ id: info.id, name: info.name || "新会话", updatedAt: info.updatedAt, tokens: t });
  }
  rows.sort((a, b) => b.tokens.cost - a.tokens.cost);
  json(res, 200, { sessions: rows, totals, count: rows.length });
}

// GET /api/sessions/:id/stats —— token/成本统计
async function handleStats(res, id) {
  const entry = await openSession(id);
  if (!entry) return json(res, 404, { error: "会话不存在" });
  try {
    const stats = entry.agent ? entry.agent.getSessionStats() : {};
    json(res, 200, { stats: JSON.parse(JSON.stringify(stats)) });
  } catch (e) {
    json(res, 500, { error: String(e?.message || e) });
  }
}

// POST /api/sessions/:id/compact —— 压缩上下文
async function handleCompact(res, id) {
  const entry = await openSession(id);
  if (!entry) return json(res, 404, { error: "会话不存在" });
  if (entry.busy) return json(res, 409, { error: "会话正在处理中" });
  try {
    const result = await ensureAgent(entry, defaultModel).then(ag => ag.compact());
    json(res, 200, { ok: true, summary: result?.summary || "" });
  } catch (e) {
    json(res, 500, { error: String(e?.message || e) });
  }
}

// GET /api/skills —— 技能列表（与 pi 相同的资源加载逻辑）
async function handleSkills(res) {
  try {
    const agentDir = getAgentDir();
    const loader = new DefaultResourceLoader({ cwd: CONFIG.cwd, agentDir });
    await loader.reload();
    const { skills, diagnostics } = loader.getSkills();
    json(res, 200, {
      skills: (skills || []).map(s => ({
        name: s.name,
        description: s.description || "",
        location: (() => {
          const fp = s.filePath || "";
          if (fp.includes("node_modules")) return "package";
          if (fp.includes(".agents") || fp.includes(".pi")) return "user";
          return "project";
        })(),
        path: s.filePath || "",
      })),
      diagnostics: diagnostics || [],
    });
  } catch (e) {
    json(res, 500, { error: String(e?.message || e) });
  }
}

// GET /api/skills/read?path= —— 技能详情（SKILL.md）
async function handleSkillRead(res, p) {
  const agentDir = getAgentDir();
  const globalSkills = path.join(os.homedir(), ".agents", "skills");
  const roots = [agentDir, globalSkills];
  const resolved = path.resolve(p);
  const ok = roots.some(root => resolved === root || resolved.startsWith(root + path.sep));
  if (!ok) return json(res, 403, { error: "路径越界" });
  try {
    const content = await fs.promises.readFile(resolved, "utf8");
    json(res, 200, { path: resolved, content });
  } catch {
    json(res, 404, { error: "读取失败" });
  }
}

// POST /api/parse-file —— 解析 Office 文档（docx/xlsx/pptx）为文本
async function handleParseFile(res, body) {
  const name = body?.name || "";
  const b64 = body?.base64 || "";
  if (!name || !b64) return json(res, 400, { error: "缺少文件" });
  const ext = path.extname(name).toLowerCase();
  if (![".docx", ".xlsx", ".pptx"].includes(ext)) return json(res, 400, { error: "不支持的格式" });
  if (b64.length > 7 * 1024 * 1024) return json(res, 413, { error: "文件过大" });
  const tmp = path.join(os.tmpdir(), "pi-web-" + Date.now() + ext);
  try {
    fs.writeFileSync(tmp, Buffer.from(b64, "base64"));
    // 路径通过 argv 传给 python（execFile 不会经过 shell），杜绝字符串拼接注入
    // 脚本内部从 sys.argv[1] 取路径，不再把路径拼进代码字符串
    let script;
    if (ext === ".docx") {
      script = `import sys, docx
d = docx.Document(sys.argv[1])
lines=[]
for p in d.paragraphs:
    if p.text.strip(): lines.append(p.text)
for t in d.tables:
    for row in t.rows:
        lines.append(" | ".join(c.text.strip() for c in row.cells))
print("\\n".join(lines))`;
    } else if (ext === ".xlsx") {
      script = `import sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
lines=[]
for ws in wb.worksheets:
    lines.append(f"=== 工作表: {ws.title} ===")
    for row in ws.iter_rows():
        vals=[str(c.value) if c.value is not None else "" for c in row]
        if any(vals): lines.append(" | ".join(vals))
print("\\n".join(lines))`;
    } else {
      script = `import sys
from pptx import Presentation
prs = Presentation(sys.argv[1])
lines=[]
for i, slide in enumerate(prs.slides, 1):
    lines.append(f"=== 幻灯片 {i} ===")
    for shape in slide.shapes:
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                t="".join(r.text for r in para.runs)
                if t.strip(): lines.append(t)
print("\\n".join(lines))`;
    }
    const out = await new Promise((resolve, reject) => {
      execFile("python", ["-c", script, tmp], { encoding: "utf8", timeout: 25000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err); else resolve(stdout);
      });
    });
    json(res, 200, { text: out.slice(0, 150000), size: out.length });
  } catch (e) {
    json(res, 500, { error: "解析失败: " + String(e?.message || e).slice(0, 200) });
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// GET /api/sessions/:id/export?format=html|jsonl —— 导出会话
function escHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
async function handleExport(res, id, format) {
  const found = getSessionList().find(s => s.id === id);
  if (!found || !found.file || !fs.existsSync(found.file)) return json(res, 404, { error: "会话不存在" });
  const entries = readEntriesFromFile(found.file);
  const msgs = extractMessages(entries);
  const name = (found.name || "会话").replace(/[\\/:*?"<>|]/g, "_");
  const dlName = encodeURIComponent(name);
  if (format === "jsonl") {
    res.writeHead(200, {
      "Content-Type": "application/jsonl",
      "Content-Disposition": `attachment; filename="pi-session.jsonl"; filename*=UTF-8''${dlName}.jsonl`,
    });
    res.end(fs.readFileSync(found.file));
    return;
  }
  const bodyHtml = msgs.map(m => {
    const who = m.role === "user" ? "你" : "pi";
    return `<div class="msg ${m.role}"><div class="who">${who}</div><div class="text">${escHtml(m.text)}</div></div>`;
  }).join("\n");
  const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${escHtml(name)}</title><style>
body{max-width:800px;margin:0 auto;padding:24px;font-family:-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#0b0c0f;color:#e6e8ee}
h1{font-size:18px;color:#8b7cf6}.msg{margin-bottom:20px}.msg .who{font-size:11px;color:#8a91a5;text-transform:uppercase;letter-spacing:1px}.msg.user .who{color:#a394ff}.msg .text{white-space:pre-wrap;line-height:1.7;font-size:14px}
</style></head><body><h1>${escHtml(name)}</h1>${bodyHtml}</body></html>`;
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Disposition": `attachment; filename="pi-session.html"; filename*=UTF-8''${dlName}.html`,
  });
  res.end(html);
}

// ── 文件系统 API（受限工作目录）─────────────────────────────────────
function resolveFsPath(p) {
  const root = path.resolve(CONFIG.cwd);
  const target = path.resolve(root, p || ".");
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

async function handleFsList(res, p) {
  const dir = resolveFsPath(p);
  if (!dir) return json(res, 403, { error: "路径越界" });
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const items = entries.map(e => ({
      name: e.name,
      type: e.isDirectory() ? "dir" : "file",
      path: path.relative(CONFIG.cwd, path.join(dir, e.name)).replace(/\\/g, "/"),
    })).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    json(res, 200, {
      cwd: CONFIG.cwd,
      current: path.relative(CONFIG.cwd, dir).replace(/\\/g, "/") || ".",
      items,
    });
  } catch (e) {
    json(res, 500, { error: String(e?.message || e) });
  }
}

async function handleFsRead(res, p) {
  const file = resolveFsPath(p);
  if (!file) return json(res, 403, { error: "路径越界" });
  try {
    const stat = await fs.promises.stat(file);
    if (stat.isDirectory()) return json(res, 400, { error: "这是目录" });
    if (stat.size > 200 * 1024) return json(res, 413, { error: "文件过大（>200KB）" });
    const content = await fs.promises.readFile(file, "utf8");
    json(res, 200, { path: path.relative(CONFIG.cwd, file).replace(/\\/g, "/"), content });
  } catch (e) {
    json(res, 404, { error: "读取失败: " + String(e?.message || e) });
  }
}

// POST /api/sessions/:id/rename
async function handleRename(res, id, body) {
  const entry = await openSession(id);
  if (!entry) return json(res, 404, { error: "会话不存在" });
  const name = String(body.name || "").slice(0, 60) || "新会话";
  try { entry.sm.appendSessionInfo(name); } catch {}
  json(res, 200, { ok: true, name });
}

// ── HTTP 服务器 ────────────────────────────────────────────────────
// 全局错误兜底：未捕获的异步异常不静默退出进程（watchdog 之外的保命层）
process.on("unhandledRejection", (reason) => {
  console.error("[pi-web] unhandledRejection:", String(reason?.stack || reason || "").slice(0, 500));
});
process.on("uncaughtException", (err) => {
  console.error("[pi-web] uncaughtException:", String(err?.stack || err || "").slice(0, 500));
});

// ── 分享管理（LEGACY，保留兼容：现分享由外部分享服务器 node server.js + 隧道统一管理）──
// 说明：前端已无调用入口；域名通过环境变量 PI_WEB_SHARE_HOST 配置，开源环境可留空（仅本地访问）
const SHARE_PORT = 8642;
const SHARE_HOST = process.env.PI_WEB_SHARE_HOST || "";
let shareProcess = null; // 当前分享的 http.server 子进程
let sharePath = null;    // 分享的目录

// 启动分享：python -m http.server 8642 --directory <path>
function startShare(dir) {
  return new Promise((resolve) => {
    try {
      // 先停掉旧的（幂等）
      stopShareSync();
      const child = spawn("python", ["-m", "http.server", String(SHARE_PORT), "--directory", dir], {
        cwd: dir, windowsHide: true, stdio: "ignore", detached: false,
      });
      shareProcess = child;
      sharePath = dir;
      child.on("error", (e) => { console.log(`[pi-web] 分享启动失败: ${e.message}`); });
      child.on("exit", (code) => { if (shareProcess === child) { shareProcess = null; sharePath = null; console.log(`[pi-web] 分享已停止 (code ${code})`); } });
      // 等端口就绪
      const t = Date.now();
      const check = setInterval(() => {
        const net = require("node:net");
        const s = net.connect(SHARE_PORT, "127.0.0.1");
        s.on("connect", () => { s.destroy(); clearInterval(check); resolve({ ok: true, url: `https://${SHARE_HOST}/`, path: dir }); });
        s.on("error", () => { if (Date.now() - t > 5000) { clearInterval(check); resolve({ ok: false, error: "启动超时" }); } });
      }, 300);
    } catch (e) {
      resolve({ ok: false, error: String(e?.message || e).slice(0, 100) });
    }
  });
}
function stopShareSync() {
  if (shareProcess) {
    try { shareProcess.kill(); } catch {}
    shareProcess = null;
  }
  sharePath = null;
}

// POST /api/share {path} —— 分享工作空间内目录
async function handleShare(res, body) {
  const p = String(body?.path || "");
  if (!p) return json(res, 400, { error: "缺少路径" });
  const safe = wsSafePath(p);
  if (!safe || !fs.existsSync(safe) || !fs.statSync(safe).isDirectory()) return json(res, 404, { error: "目录不存在" });
  const r = await startShare(safe);
  if (r.ok) json(res, 200, { ok: true, url: r.url, path: r.path, port: SHARE_PORT });
  else json(res, 500, { error: r.error || "启动失败" });
}
// GET /api/share/status
function handleShareStatus(res) {
  json(res, 200, { sharing: !!shareProcess, path: sharePath, url: shareProcess ? `https://${SHARE_HOST}/` : null, port: SHARE_PORT });
}
// POST /api/share/stop
function handleShareStop(res) {
  stopShareSync();
  json(res, 200, { ok: true, sharing: false });
}

// ── 路由表（声明式：method + 匹配器 + handler，替代 if/else 链）──
// 匹配器：字符串=精确 pathname；正则=捕获组传给 handler（$1 $2 ...）
// handler 签名：(res, req, url, match, body) => Promise|void
const API_ROUTES = [
  // ── 会话 ──
  ["GET", /^\/api\/sessions\/([^/]+)\/tree$/, (res, req, url, m) => handleSessionTree(res, decodeURIComponent(m[1]))],
  ["POST", /^\/api\/sessions\/([^/]+)\/branch$/, async (res, req, url, m) => handleSessionBranch(res, decodeURIComponent(m[1]), await readBody(req))],
  ["GET", /^\/api\/sessions\/([^/]+)\/messages$/, (res, req, url, m) => handleMessages(res, decodeURIComponent(m[1]), req, url)],
  ["GET", /^\/api\/sessions\/([^/]+)\/stats$/, (res, req, url, m) => handleStats(res, decodeURIComponent(m[1]))],
  ["POST", /^\/api\/sessions\/([^/]+)\/compact$/, (res, req, url, m) => handleCompact(res, decodeURIComponent(m[1]))],
  ["POST", /^\/api\/sessions\/([^/]+)\/rename$/, async (res, req, url, m) => handleRename(res, decodeURIComponent(m[1]), await readBody(req))],
  ["DELETE", /^\/api\/sessions\/([^/]+)$/, async (res, req, url, m) => { await deleteSession(decodeURIComponent(m[1])); return json(res, 200, { ok: true }); }],
  ["GET", /^\/api\/sessions\/([^/]+)\/export$/, (res, req, url, m) => handleExport(res, decodeURIComponent(m[1]), url.searchParams.get("format") || "html")],
  ["GET", "/api/stats/global", (res) => handleGlobalStats(res)],
  ["GET", "/api/sessions", (res) => json(res, 200, { sessions: getSessionList() })],
  ["POST", "/api/sessions", async (res, req) => { const body = await readBody(req); const id = await createSession(body.name); return json(res, 200, { id, name: body.name || "新会话" }); }],
  // ── 工作空间 ──
  ["GET", "/api/prompts", (res) => handlePrompts(res)],
  ["GET", "/api/ws/tree", (res, req, url) => handleWsTree(res, url.searchParams.get("path") || "")],
  ["GET", "/api/ws/file", (res, req, url) => handleWsFile(res, url.searchParams.get("path") || "")],
  ["GET", "/api/ws/read", (res, req, url) => handleWsRead(res, url.searchParams.get("path") || "")],
  ["GET", "/api/ws/artifacts", (res) => handleWsArtifacts(res)],
  ["POST", "/api/ws/write", async (res, req) => handleWsWrite(res, await readBody(req))],
  ["POST", "/api/ws/deliver", async (res, req) => handleWsDeliver(res, await readBody(req))],
  ["POST", "/api/ws/deliver/package", async (res, req) => handleWsPackage(res, await readBody(req))],
  ["GET", "/api/ws/deliveries", (res) => handleWsDeliveries(res)],
  ["GET", "/api/ws/search", (res, req, url) => handleWsSearch(res, url.searchParams.get("q") || "")],
  ["POST", "/api/ws/rename", async (res, req) => handleWsRename(res, await readBody(req))],
  ["POST", "/api/ws/delete", async (res, req) => handleWsDelete(res, await readBody(req))],
  ["POST", "/api/ws/projects", async (res, req) => handleWsProjectCreate(res, await readBody(req))],
  ["POST", "/api/ws/convert", async (res, req) => handleWsConvert(res, await readBody(req))],
  // ── 系统 ──
  ["GET", "/api/notices", (res) => handleNotices(res)],
  ["GET", "/api/health", (res) => json(res, 200, { ok: true })],
  ["POST", "/api/repair", async (res, req) => handleRepair(res, await readBody(req))],
  // ── 设计器 ──
  ["POST", "/api/designer/generate", async (res, req) => handleDesignerGenerate(res, await readBody(req))],
  ["POST", "/api/designer/save", async (res, req) => handleDesignerSave(res, await readBody(req))],
  // ── 对外分享 ──
  ["POST", "/api/share", async (res, req) => handleShare(res, await readBody(req))],
  ["GET", "/api/share/status", (res) => handleShareStatus(res)],
  ["POST", "/api/share/stop", (res) => handleShareStop(res)],
  // ── 文件传输：上传任意文件到工作空间，写入会话 file 消息（聊天界面可见可下载）──
  ["POST", "/api/files/upload", async (res, req) => {
    const body = await readBody(req, 24);
    const name = String(body.name || "").slice(0, 120);
    const data = String(body.data || "");
    const sessionId = String(body.sessionId || "");
    if (!name || !data) return json(res, 400, { error: "name 和 data 必填" });
    try {
      const buf = Buffer.from(data, "base64");
      if (buf.length > 20 * 1024 * 1024) return json(res, 400, { error: "文件过大（限 20MB）" });
      const date = new Date().toISOString().slice(0, 10);
      const dir = path.join(WS_ROOT, "收发文件", date);
      fs.mkdirSync(dir, { recursive: true });
      let fp = path.join(dir, name);
      if (fs.existsSync(fp)) { const pp = path.parse(name); fp = path.join(dir, `${pp.name}-${Date.now().toString(36)}${pp.ext}`); }
      fs.writeFileSync(fp, buf);
      const rel = path.relative(WS_ROOT, fp).replace(/\\/g, "/");
      // 挂到有效会话：优先指定会话（含从磁盘打开的），其次最近未命名会话，否则自动新建（保证界面可显示）
      let entry = sessionId && activeSessions.has(sessionId) ? activeSessions.get(sessionId) : null;
      if (!entry && sessionId) {
        // 会话文件存在但不在内存（如 CLI 会话 / 重启后）→ 从磁盘打开，挂到正确会话
        try {
          const opened = await openSession(sessionId);
          if (opened) { entry = opened; activeSessions.set(sessionId, opened); }
        } catch {}
      }
      if (!entry && lastUnnamedId && activeSessions.get(lastUnnamedId)) entry = activeSessions.get(lastUnnamedId);
      if (!entry) { try { const nid = await createSession(); entry = activeSessions.get(nid); } catch {} }
      if (entry) {
        try {
          await entry.sm.appendMessage({ role: "user", content: [{ type: "file", name, path: rel, size: buf.length, mime: body.mime || "" }] });
          // 触发落盘：pi 引擎在出现 assistant 消息前不写文件，追加一条空 assistant 强制 flush（空消息渲染时被过滤，不影响显示）
          await entry.sm.appendMessage({ role: "assistant", content: [] });
        } catch {}
      }
      return json(res, 200, { ok: true, name, path: rel, size: buf.length, url: `/api/ws/file?path=${encodeURIComponent(rel)}`, sessionId: entry?.sm?.getSessionId() || null });
    } catch (e) { return json(res, 500, { error: String(e.message || e).slice(0, 100) }); }
  }],
  // ── 技能/搜索/Git/文件 ──
  ["GET", "/api/skills", (res) => handleSkills(res)],
  ["GET", "/api/skills/read", (res, req, url) => handleSkillRead(res, url.searchParams.get("path") || "")],
  ["GET", "/api/search", (res, req, url) => handleSearch(res, url.searchParams.get("q") || "")],
  ["GET", "/api/git/status", (res) => handleGitStatus(res)],
  ["GET", "/api/git/diff", (res) => handleGitDiff(res)],
  ["GET", "/api/fs", (res, req, url) => handleFsList(res, url.searchParams.get("path") || ".")],
  ["GET", "/api/fs/read", (res, req, url) => handleFsRead(res, url.searchParams.get("path") || "")],
  // ── 模型 ──
  ["GET", "/api/models", (res) => handleModels(res)],
  ["GET", "/api/models/manage", (res) => handleModelsManage(res)],
  ["POST", "/api/models/add", async (res, req) => handleModelsAdd(res, await readBody(req))],
  ["POST", "/api/models/remove", async (res, req) => handleModelsRemove(res, await readBody(req))],
  ["POST", "/api/model", async (res, req) => handleSwitchModel(req, res, await readBody(req))],
  // ── 媒体/对话 ──
  ["POST", "/api/think", async (res, req) => handleThink(res, await readBody(req))],
  ["POST", "/api/image", async (res, req) => handleImage(res, await readBody(req))],
  ["POST", "/api/media", async (res, req) => handleMedia(res, await readBody(req))],
  ["POST", "/api/chat", async (res, req) => handleChat(req, res, await readBody(req, 12))],
  ["POST", "/api/compare", async (res, req) => handleCompare(res, await readBody(req))],
  ["POST", "/api/parse-file", async (res, req) => handleParseFile(res, await readBody(req, 12))],
];

const server = http.createServer(async (req, res) => {
  // 请求级 request-id：排查并发问题时能关联同一次请求的日志（小米 4.13）
  const reqId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  res.setHeader("X-Request-Id", reqId);
  const t0 = Date.now();
  try {
    // 安全响应头（CSP 限制脚本来源，防止第三方注入执行；禁 MIME 嗅探；防 clickjacking）
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' ws: wss: https://fastly.jsdelivr.net https://cubism.live2d.com https://v1.hitokoto.cn; font-src 'self' data:; frame-ancestors 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const isStatic = (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/sw.js")) ||
                     (req.method === "GET" && url.pathname.startsWith("/static/"));
    if (!isStatic && !checkAuth(req)) {
      return json(res, 401, { error: "未授权，请提供访问令牌" });
    }

    // 静态资源
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/sw.js")) return handleStatic(req, res);
    if (req.method === "GET" && url.pathname.startsWith("/static/")) {
      req.url = url.pathname.replace(/^\/static/, "") + (url.search || "");
      return handleStatic(req, res);
    }

    // API（路由表匹配）
    for (const [method, matcher, handler] of API_ROUTES) {
      if (req.method !== method) continue;
      let m = null;
      if (typeof matcher === "string") {
        if (url.pathname !== matcher) continue;
      } else {
        m = url.pathname.match(matcher);
        if (!m) continue;
      }
      return await handler(res, req, url, m);
    }
    // 路由表无匹配 → 404
    return json(res, 404, { error: "not found" });
  } catch (e) {
    try { json(res, 500, { error: String(e?.message || e) }); } catch {}
  } finally {
    // 请求日志（带 request-id 和耗时，API 路径记录，静态资源不刷屏）
    try {
      const url2 = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (!url2.pathname.startsWith("/static/")) {
        const ms = Date.now() - t0;
        console.log(`[req:${reqId}] ${req.method} ${url2.pathname} ${res.statusCode || 0} ${ms}ms`);
      }
    } catch {}
  }
});

function readBody(req, maxMB = 2) {
  return new Promise((resolve, reject) => {
    let data = "";
    const max = maxMB * 1024 * 1024;
    req.on("data", (c) => { data += c; if (data.length > max) { reject(new Error(`body too large (limit ${maxMB}MB)`)); req.destroy(); } });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });
}

// ── 启动时每日备份配置 ─────────────────────────────────────────────
try {
  const bkDir = path.join(__dirname, "backups");
  fs.mkdirSync(bkDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const bkServer = path.join(bkDir, `server-${today}.mjs`);
  const bkConfig = path.join(bkDir, `config-${today}.mjs`);
  if (!fs.existsSync(bkServer)) {
    fs.copyFileSync(__filename, bkServer);
    fs.copyFileSync(path.join(__dirname, "config.mjs"), bkConfig);
    console.log(`[pi-web] 配置已备份: ${bkDir}`);
  }
} catch {}

// 端口占用时等待释放（自愈重启后旧进程可能未退出）
let listenAttempt = 0;
// error listener 只挂一次（避免重试时叠加，MaxListenersExceededWarning 根因）
server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && listenAttempt < 30) {
    listenAttempt++;
    console.log(`[pi-web] 端口 ${CONFIG.port} 占用，等待释放 (${listenAttempt}/30)…`);
    setTimeout(() => { try { server.close(); } catch {} startServer(); }, 2000);
  } else {
    console.error("[pi-web] 启动失败:", err.message);
    process.exit(1);
  }
});
function startServer() {
  server.listen(CONFIG.port, CONFIG.host, () => {
    listenAttempt = 0; // 监听成功 → 重置重试计数
    console.log("");
    console.log("╭──────────────────────────────────────────────╮");
    console.log("│              pi-web 已启动                    │");
    console.log("╰──────────────────────────────────────────────╯");
    console.log(`  本地地址: http://${CONFIG.host}:${CONFIG.port}`);
    console.log(`  访问令牌: ${CONFIG.token}`);
    console.log(`  工作目录: ${CONFIG.cwd}`);
    console.log(`  工具集  : ${CONFIG.tools.join(", ")}`);
    console.log(`  默认模型: ${defaultModel ? defaultModel.provider + "/" + defaultModel.id : "(未设置)"}`);
    console.log(`  会话目录: ${SESSIONS_DIR}`);
  });
}
startServer();
