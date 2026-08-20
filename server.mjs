// pi-web —— 基于 pi SDK 的 Web 聊天服务（Codex 风格多会话）
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync, spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

// ── 输出质量守卫（Output Guard）：模型不可靠是默认假设（借鉴 dsh repeat-tool-reminder）──
import { bindOutputGuardDeps, classifyAnomaly, isRepeatReply, normReply, recordReply } from "./engine/output-guard.mjs";
// ── Reasonix 机制（esengine/DeepSeek-Reasonix 借鉴）：工具结果压缩 / NEEDS_PRO 自报升级 / scavenge 捞回 ──
import { shrinkToolResult, NEEDS_PRO_RE, scavengeToolCalls } from "./engine/reasonix-tools.mjs";
// ── 会话解析纯函数（拆模块）：消息/文本/图片/文件提取 ──
import { extractMessages, extractText, extractImages, extractFiles } from "./engine/session-utils.mjs";
import { initSessionFiles, scanSessionFiles, parseSessionFile, parseSessionFileCached, readEntriesFromFile, getSessionList, invalidateSessionCache, extractMessageFiles, extractMessageImages } from "./engine/session-files.mjs";
// ── 统一 HTTP 客户端（拆模块）：原生 fetch + 自动系统代理（env → Windows 注册表），替代 python 子进程 ──
import { httpJsonFetch, httpBufferFetch } from "./engine/http.mjs";
// ── 统一工具集（拆模块）：schema + 执行器；安全线（deny/危险命令/受保护路径/路径越权）在 engine/tools/security.mjs ──
import { BASE_TOOL_SCHEMAS, createUnifiedToolExecutor } from "./engine/tools/unified-tools.mjs";
import { safeJoin } from "./engine/tools/security.mjs";
// ── dsh 执行臂工具（拆模块）：双引擎派单/并发控制/结构化回传解析 ──
import { createDshTool } from "./engine/dsh-tool.mjs";

// ── 模型路由层（拆模块）：429 降级 / 复杂度分类 / Auto 路由 / pro 候选 ──
import { initModelRouter, isOcGoBlocked, markModelBlocked, markOcGoBlocked, ocGoCandidate, pickFallbackDefault, pickFallbackExcluding, resetModelHealth, isAutoModel, routeForAuto, routeProCandidate, ROUTER_AUTO, isAuthErrorStatus } from "./engine/model-router.mjs";
// ── 模型能力探测与发现（拆模块）：能力推断 / 真实API探测(24h缓存) / 自定义 provider 发现 ──
import { modelCapabilities, probeModelCapabilities, discoverCustomModels } from "./engine/model-probe.mjs";
import { CONFIG } from "./config.mjs";
// ── Gateway 2.0 插件化引擎 + Code Mode（dsh 设计沉淀）──
import { createGateway } from "./engine/gateway.mjs";
import { sseWrite, createSseWriter, startSseHeartbeat } from "./engine/sse.mjs";
import { json, readBody } from "./engine/http-utils.mjs";
import { initWorkspaceApi, WS_ROOT, findWorkspaceFiles, wsSafePath, saveArtifact, handleWsTree, handleWsFile, handleWsRead, handleWsWrite, handleWsArtifacts, wsNextVersion, wsCopyDir, handleWsDeliver, handleWsPackage, handleWsDeliveries, handleWsRename, handleWsDelete, handleWsSearch, handleWsProjectCreate, handleWsConvert } from "./engine/workspace-api.mjs";
import { initContextLoader, makeLoader, loadExperience, readRulesWithImports, loadContextRules, jitRulesForPath, loadProjectRules, loadSkillIndex, execActivateSkill, ACTIVATE_SKILL_TOOL, WORK_PROTOCOL, loadMemory, loadMemoryIndex, loadExperienceIndex, shouldInjectFullMemory, setLastUserQuery } from "./engine/context-loader.mjs";
import { createStaticServer } from "./lib/static.mjs";
import { CodeRuntime } from "./code-mode/code-runtime.mjs";
import { createCodeMode } from "./code-mode/code-mode.mjs";
import { createTimeEngine } from "./engine/time-engine.mjs";
const memoryApi = await import("./engine/memory.mjs");
const emotion = await import("./engine/emotion.mjs");
emotion.init(CONFIG.cwd); // 基因系统：加载人格基因 + 提案池
// 隔离子任务执行器（P2）：注入模型适配依赖（复用系统代理栈）
const subagent = await import("./engine/subagent.mjs");
const workshop = await import("./engine/workshop.mjs");
const { WORKSHOP_PAGES } = workshop;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

// 时间引擎实例（启动时初始化；未初始化时相关 API 返回友好错误）
let timeEngine = null;

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
initSessionFiles({ sessionsDir: SESSIONS_DIR, workspaceCwd: CONFIG.cwd }); // 会话文件层外部依赖注入
initWorkspaceApi({ wsRoot: path.resolve(CONFIG.cwd) }); // 工作空间根注入
initContextLoader({ cwd: CONFIG.cwd, DefaultResourceLoader }); // 上下文加载层注入
console.log(`[pi-web] 会话目录: ${SESSIONS_DIR}`);

console.log("[pi-web] 正在初始化模型运行时…");
// OpenCode Go：pi runtime 从环境变量 OPENCODE_API_KEY 读 key——必须在 ModelRuntime.create() 前注入
// （auth.json 在 AGENT_DIR 下，从文件读，不依赖启动 shell 环境）
try {
  if (!process.env.OPENCODE_API_KEY) {
    const authPath0 = require("node:path").join(getAgentDir(), "auth.json");
    const fs0 = require("node:fs");
    if (fs0.existsSync(authPath0)) {
      const auth0 = JSON.parse(fs0.readFileSync(authPath0, "utf8"));
      const ocKey = auth0["opencode-go"]?.key || auth0["opencode"]?.key;
      if (ocKey) process.env.OPENCODE_API_KEY = ocKey;
    }
  }
} catch {}
let modelRuntime = await ModelRuntime.create();
console.log(`[pi-web] 模型运行时加载完成`);
// 诊断：确认 opencode-go provider 是否被 pi runtime 识别
try {
  const ogCount = modelRuntime.getModels().filter(m => m.provider === "opencode-go").length;
  console.log(`[pi-web] opencode-go 模型数: ${ogCount}`);
} catch {}

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

// ── 会话管理 ───────────────────────────────────────────────────────
const activeSessions = new Map();   // id -> { agent, sm, busy }
const pushedArtifacts = new Map();  // sessionId -> Set(已推送文件路径)，防止重复推"本轮产物"
let lastUnnamedId = null;           // 最近创建/复用的未命名会话（打断时复用同一会话）
let lastUnnamedEntry = null;

// 带中文偏好系统提示的资源加载器
async function createSession(name) {
  const sm = SessionManager.create(CONFIG.cwd, SESSIONS_DIR);
  const id = sm.getSessionId();
  const file = sm.getSessionFile();
  // 2026-08-19 收敛：新会话一律用默认模型（千问）。不再继承 lastModelKey——
  //   否则用户切过的 nvidia/deepseek 残留会污染新会话默认（“后端不是千问”死循环根源）。
  //   用户切模型只锁当前会话（session-model-keys 持久化），新会话永远回到默认。
  let agent = null;
  let modelKey = null;
  agent = await createSessionAgent(sm, defaultModel);
  activeSessions.set(id, { agent, sm, busy: false, lastUsed: Date.now(), modelKey: defaultModel && defaultModel.provider ? { provider: defaultModel.provider, id: defaultModel.id } : null, agentModel: defaultModel && defaultModel.provider ? { provider: defaultModel.provider, id: defaultModel.id } : null });
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

// 会话瘦身：把会话文件里超大 base64 图片数据替换成占位（read 工具读图会把整张图存进历史，
// 模型不支持看图时这些数据纯浪费——22 张图 = 22MB 垃圾沉淀，拖慢每次对话）
async function slimSessionImages(file) {
  try {
    const st = fs.statSync(file);
    if (st.size < 5 * 1024 * 1024) return; // 只有超大会话才处理
    const raw = fs.readFileSync(file, "utf8");
    const lines = raw.split("\n");
    let replaced = 0, totalSlimmed = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const d = JSON.parse(line);
        const msg = d?.message;
        if (!msg || typeof msg !== "object") continue;
        const content = msg.content;
        if (!Array.isArray(content)) continue;
        let changed = false;
        for (const part of content) {
          if (part && part.type === "image" && typeof part.data === "string" && part.data.length > 100_000) {
            totalSlimmed += part.data.length;
            part.data = `[图片已瘦身:原数据 ${(part.data.length / 1024).toFixed(0)}KB，模型不支持看图已省略]`;
            part.slimmed = true;
            changed = true;
          }
        }
        if (changed) {
          lines[i] = JSON.stringify(d);
          replaced++;
        }
      } catch {}
    }
    if (replaced) {
      fs.writeFileSync(file, lines.join("\n"), "utf8");
      console.log(`[pi-web] 会话瘦身: ${file.split(/[\\/]/).pop()} 替换 ${replaced} 条图片数据，释放 ${(totalSlimmed / 1024 / 1024).toFixed(1)}MB`);
    }
  } catch (e) {
    console.log(`[pi-web] 会话瘦身失败: ${String(e?.message || e).slice(0, 80)}`);
  }
}

// 分层记忆（compaction）：会话历史超过上下文窗口阈值时，把早期消息压缩成摘要
// 原理：pi 引擎原生支持 compaction——context.js 读上下文时自动用摘要替代其之前所有消息
// 实现：自己算 cutPoint + directChat 生成摘要 + 重写文件（parentId 重链到 compaction 条目）
let compactingSessions = new Set();

async function compactSession(file, model, force = false, focus = "") {
  if (compactingSessions.has(file)) return { skip: true, reason: "busy: 该会话正在压缩中" };
  compactingSessions.add(file);
  let sm = null;
  try {
    const st = fs.statSync(file);
    // 只有超大会话（>3MB 或估算超阈值）才压缩，避免小会话频繁触发
    if (!force && st.size < 3 * 1024 * 1024) return;
    // 用引擎打开会话（pi-coding-agent 的 SessionManager，fileEntries 公开且完整）
    sm = SessionManager.open(file, path.dirname(file), CONFIG.cwd);
    const entries = sm.fileEntries || [];
    const msgs = entries.filter(e => e.type === "message");
    if (msgs.length < 8) return { skip: true, reason: "会话消息过少(或已压缩过)，无需压缩" };
    // 已有 compaction 且后续消息不多 → 跳过（避免每次打开都压）
    let lastCompIdx = -1;
    for (let i = entries.length - 1; i >= 0; i--) { if (entries[i].type === "compaction") { lastCompIdx = i; break; } }
    if (!force && lastCompIdx >= 0 && entries.length - lastCompIdx < 40) return; // 手动 /compact 强制再压
    // 估算会话 token（中文≈1.5/字，其他≈0.35/字符）——超阈值才压缩
    const estTok = msgs.reduce((s, e) => {
      const txt = JSON.stringify(e.message || {});
      const cn = (txt.match(/[\u4e00-\u9fff]/g) || []).length;
      return s + Math.round(cn * 1.5 + (txt.length - cn) * 0.35);
    }, 0);
    const threshold = Math.min(300_000, Math.round((model?.contextWindow || 1_000_000) * 0.7));
    if (!force && estTok < threshold) return; // 手动 /compact 无条件压缩，自动压缩仍按阈值
    // 保留最近约 30K token 的消息（其余压掉），从 cut 消息沿 parentId 收集整条保留链
    const keepBudget = 30000;
    let keepFrom = msgs.length;
    let acc = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const txt = JSON.stringify(msgs[i].message || {});
      const cn = (txt.match(/[\u4e00-\u9fff]/g) || []).length;
      acc += Math.round(cn * 1.5 + (txt.length - cn) * 0.35);
      if (acc >= keepBudget) { keepFrom = i; break; }
    }
    keepFrom = Math.max(4, Math.min(keepFrom, msgs.length - 2)); // 至少留 2 条，最多压到剩 4 条以下
    const cutMsg = msgs[Math.min(keepFrom, msgs.length - 1)];
    const toSummarize = msgs.slice(0, keepFrom);
    if (!force && toSummarize.length < 6) return; // 手动 /compact 无条件压缩（force）
    // 组装摘要输入（截断到合理长度）
    const parts = [];
    for (const e of toSummarize) {
      const m = e.message || {};
      const role = m.role || "?";
      let text = "";
      const content = m.content;
      if (typeof content === "string") text = content.slice(0, 1500);
      else if (Array.isArray(content)) {
        text = content.map(p => (typeof p === "string" ? p : p?.text || (p?.type === "image" ? "[图片]" : ""))).join(" ").slice(0, 1500);
      }
      if (role === "toolResult") text = `[工具结果 ${m.toolName || ""}] ${text.slice(0, 150)}`;
      if (text.trim()) parts.push(`${role}: ${text}`);
    }
    const inputText = parts.join("\n").slice(0, 60000).replace(/[\uD800-\uDFFF]/g, "") + (focus ? "[\n压缩焦点：" + focus + "]" : "");
    if (!inputText.trim()) return { skip: true, reason: "无可压缩的文本内容" };
    // 用 token 计划免费模型生成摘要（2026-08-19 用户定：deepseek 官方涨价贵，日常不用）；失败回退默认模型
    let summaryModel = modelList.find(m => m.provider === "sensenova" && /flash-lite/i.test(m.id))
      || modelList.find(m => m.provider === "xiaomi-token-plan-cn" && /mimo-v2\.5$/i.test(m.id));
    const prompt = `你是会话摘要助手。以下是 AI 助手与用户的一段早期对话记录。请生成结构化摘要，按下列六类保留关键信息：
1. 用户的核心诉求与任务目标
2. 已完成的事项与关键决策
3. 重要约定/路径/技术选型（保留具体文件名、路径、命令）
4. 错误与修复方式
5. 遗留问题与待办
6. 当前工作状态
要求：只留关键信息，总长不超过 400 字，按 1-6 编号要点列表输出。

对话记录：
${inputText}`;
    // 内联 deepseek 官方直连生成摘要（curl 已验证 200；directChat/unifiedChat 均存在中间层 400/回 null 问题，不再依赖）
    let summary = "";
    let dcErr = "";
    try {
      const _auth2 = readJsonFile(AUTH_PATH);
      const _dk = _auth2["deepseek"]?.key || _auth2["opencode-go"]?.key || "";
      const _url = "https://api.deepseek.com/v1/chat/completions";
      const _rr = await httpJsonFetch(_url, { method: "POST", timeout: 90000,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${_dk}` },
        body: JSON.stringify({ model: "deepseek-v4-flash", messages: [{ role: "user", content: prompt }], max_tokens: 8000 }) });
      if (_rr.ok) {
        const _dd = await _rr.json();
        summary = String((_dd?.choices?.[0]?.message?.content) || (_dd?.choices?.[0]?.message?.reasoning_content) || "").trim().slice(0, 3000);
        if (!summary) console.log("[pi-web] compact 摘要响应异常: " + JSON.stringify(_dd).slice(0, 500));
      } else {
        dcErr = "HTTP " + _rr.status + ": " + String(await _rr.text()).slice(0, 200);
      }
    } catch (e) { dcErr = String(e?.message || e).slice(0, 200); }
    if (!summary) return { skip: true, reason: "摘要生成失败: " + (dcErr || "响应无 content") };
    // 构造新文件：非消息条目 + compaction + 保留消息链（parentId 重链到 compaction）
    const compId = `comp_${Date.now().toString(36)}`;
    const compEntry = {
      type: "compaction", id: compId, parentId: null,
      timestamp: new Date().toISOString(), summary, firstKeptEntryId: cutMsg.id, tokensBefore: estTok,
      details: { via: "pi-web-auto" },
    };
    // 保留链条：从 cutMsg 沿 parentId 收集所有后代
    const byId = new Map(entries.map(e => [e.id, e]));
    const byParent = new Map();
    for (const m of msgs) {
      const p = m.parentId;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(m);
    }
    const retained = [];
    const stack = [cutMsg.id];
    while (stack.length) {
      const id = stack.pop();
      const m = byId.get(id);
      if (!m || m.type !== "message") continue;
      retained.push(m);
      for (const child of (byParent.get(id) || [])) stack.push(child.id);
    }
    retained.sort((a, b) => entries.findIndex(e => e.id === a.id) - entries.findIndex(e => e.id === b.id));
    // 新数组：非消息条目（保持原序）+ compaction + 保留消息
    const newEntries = [];
    for (const e of entries) { if (e.type !== "message") newEntries.push(e); }
    newEntries.push(compEntry);
    let first = true;
    for (const m of retained) {
      const copy = { ...m };
      if (first) { copy.parentId = compId; first = false; }
      newEntries.push(copy);
    }
    // 备份 + 重写（SessionManager 的 _rewriteFile 全量写 fileEntries）
    try { fs.copyFileSync(file, file + ".bak"); } catch {}
    sm.fileEntries = newEntries;
    sm._rewriteFile();
    console.log(`[pi-web] 分层记忆: ${file.split(/[\\/]/).pop()} ${(estTok / 1000).toFixed(0)}K→摘要(${summary.length}字), 保留 ${retained.length} 条消息`);
    return { summary, retained: retained.length, before: estTok };
  } catch (e) {
    console.log(`[pi-web] 分层记忆跳过: ${String(e?.message || e).slice(0, 120)}`);
    return { skip: true, reason: "异常: " + String((e && (e.stack || e.message)) || e).slice(0, 500) };
  } finally {
    compactingSessions.delete(file);
  }
  return null;
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
  // 超大会话先瘦身（避免加载 20MB+ 历史）
  await slimSessionImages(found.file);
  // 分层记忆：会话历史超阈值时压缩早期消息为摘要（pi 引擎原生支持 compaction 条目）
  try { await compactSession(found.file, defaultModel); } catch {}
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
  // 恢复会话级模型选择（修复 A：LRU 淘汰/服务重启后不丢用户切的模型；handleChat 检测到不一致会自动重建 agent）
  const savedKey = loadSessionModelKey(id);
  if (savedKey) entry.modelKey = savedKey;
  activeSessions.set(id, entry);
  return entry;
}

// 创建 agent（pi CLI 同款 services 方式：正确注册工具 + 完整 model 触发工具调用）
let searchToolDef = null;
let searchToolInit = null;
async function initSearchTool() {
  if (searchToolDef) return searchToolDef;
  try {
    // typebox 在 pi 引擎的依赖里，用 createRequire 从引擎路径解析
    const { createRequire } = await import("node:module");
    // 用 CONFIG.piPackage（引擎入口路径，server 顶部已验证可用）解析 typebox
    const req2 = createRequire(CONFIG.piPackage);
    const { Type } = req2("typebox");
    const fb = await import("./engine/filebox.mjs");
    searchToolDef = {
      name: "search_files",
      label: "搜索工作空间文件",
      description: "在本地工作空间搜索文件（按关键词/类型）。当用户要求发送/查看/交付某个文件、或不确定文件在哪时使用。搜索是本地执行的，速度快、结果准确。",
      promptSnippet: "用户要文件时，先用 search_files 找到准确路径，再用 📎 交付 标记交付",
      promptGuidelines: [
        "Use search_files when the user asks to send/deliver/find a file, or when you need a specific file's path.",
        "Pass the user's words as query (e.g. '酒店的ppt'), optionally types=['.ppt','.pptx'].",
        "After search, deliver the chosen file(s) with 📎 交付: <path> at the end of your reply.",
      ],
      parameters: Type.Object({
        query: Type.String({ description: "搜索关键词（用户原话或提取的关键词）" }),
        types: Type.Optional(Type.Array(Type.String({ description: "文件扩展名过滤，如 ['.png','.jpg']" }))),
      }),
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        const wsRoot = (typeof CONFIG !== "undefined" && CONFIG.cwd) || process.cwd();
        const files = fb.findFiles(wsRoot, { query: params.query || "", types: params.types || null, max: 10 });
        return {
          content: [{ type: "text", text: fb.findResultText(files, wsRoot) }],
          details: { files: files.map(f => ({ name: f.name, path: f.path })) },
        };
      },
    };
  } catch (e) {
    console.log(`[pi-web] search_files 工具初始化失败: ${String(e?.message || e).slice(0, 80)}`);
  }
  return searchToolDef;
}

// 外网分享工具：模型只需传项目路径，本地系统复制到外网分享目录并返回链接
// 模型永远不需要碰 cloudflared/隧道/端口——分享是自动的
let shareToolDef = null;
async function initShareTool() {
  if (shareToolDef) return shareToolDef;
  try {
    const { createRequire } = await import("node:module");
    const req2 = createRequire(CONFIG.piPackage);
    const { Type } = req2("typebox");
    shareToolDef = {
      name: "share_project",
      label: "外网分享项目",
      description: "把项目/网页分享到外网。当用户要求分享链接、外网访问、上线预览、给别人看时使用。只需传入项目路径，本地系统自动处理（复制到分享目录 + 返回公网链接），不需要也不应该手动操作 cloudflared/隧道/端口/DNS。",
      promptSnippet: "用户要分享/外链时，用 share_project 传入项目目录即可，勿动隧道",
      promptGuidelines: [
        "Use share_project when the user asks to share a project online, get a public link, or preview externally.",
        "Pass the project directory path (e.g. 工程/项目名 or 交付/xxx). Never touch cloudflared/config.yml/ports/DNS manually.",
        "The tool returns a public URL — show it to the user directly.",
      ],
      parameters: Type.Object({
        path: Type.String({ description: "要分享的项目目录或文件（工作空间相对路径），如 工程/贪吃蛇" }),
      }),
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        const src = params.path || "";
        const wsRoot = CONFIG.cwd;
        const safe = wsSafePath(src);
        if (!safe || !fs.existsSync(safe)) {
          return { content: [{ type: "text", text: `项目不存在: ${src}。请先用 search_files 找到正确路径。` }] };
        }
        const shareDir = path.join(wsRoot, "外网分享");
        fs.mkdirSync(shareDir, { recursive: true });
        const base = path.basename(safe);
        const target = path.join(shareDir, base);
        // 复制到分享目录（目录递归复制，文件直接复制）
        try {
          if (fs.statSync(safe).isDirectory()) {
            fs.cpSync(safe, target, { recursive: true, force: true });
          } else {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(safe, target);
          }
        } catch (e) {
          return { content: [{ type: "text", text: `复制失败: ${String(e?.message || e).slice(0, 80)}` }] };
        }
        const host = process.env.PI_WEB_SHARE_HOST || "share.myxinyu.xin";
        const isHtml = fs.existsSync(path.join(target, "index.html"));
        const url = `https://${host}/${encodeURIComponent(base)}${isHtml ? "/" : ""}`;
        return {
          content: [{ type: "text", text: `✅ 已分享到外网：${url}\n（项目已复制到 外网分享/${base}）` }],
          details: { url, path: `外网分享/${base}` },
        };
      },
    };
  } catch (e) {
    console.log(`[pi-web] share_project 工具初始化失败: ${String(e?.message || e).slice(0, 80)}`);
  }
  return shareToolDef;
}
async function createSessionAgent(sm, model) {
  const cwd = (typeof sm.getCwd === "function" && sm.getCwd()) || CONFIG.cwd;
  const settingsManager = SettingsManager.create(cwd, getAgentDir());
  const customTools = [];
  const st = await initSearchTool();
  if (st) customTools.push(st);
  const sh = await initShareTool();
  if (sh) customTools.push(sh);
  // 双引擎：dsh（DeepSeek Harness）作为执行臂——pi 主引擎派单，dsh 干代码/沙箱活，pi 验收
  const dt = await initDshTool();
  if (dt) customTools.push(dt);
  // 外部思考调试开关（externalThinking）：注入 think 工具让模型把推理写进工具参数
  if (isExternalThinking()) customTools.push(THINK_TOOL);
  // 两阶段引导（dsh 生态 anchored-standard 借鉴，2026-08-17）：
  // DeepSeek 系模型对首轮工具目录敏感——dsh 生态实测 7 工具首轮 91-92 分 vs 2-4 工具首轮 99 分。
  // 新会话首轮只暴露文件核心工具（read/write/edit/bash），首个文本/工具事件后 promote 恢复完整集
  // （setActiveToolsByName 下个 turn 生效，不打断当前轮）。可用环境变量 PI_TWO_PHASE=0 关闭。
  const MIN_BOOTSTRAP = ["read", "write", "edit", "bash"].filter(t => CONFIG.tools.includes(t));
  const bootstrap = isFirstTurn(sm) && MIN_BOOTSTRAP.length >= 2 && process.env.PI_TWO_PHASE !== "0";
  const allowedTools = bootstrap
    ? [...new Set([...MIN_BOOTSTRAP, ...customTools.map(t => t.name).filter(n => MIN_BOOTSTRAP.includes(n))])]
    : [...new Set([...CONFIG.tools, ...customTools.map(t => t.name)])];
  if (bootstrap) console.log(`[agent] 两阶段引导：首轮最小工具集 ${allowedTools.join(", ")}（首个文本/工具后自动 promote 完整集）`);
  console.log(`[agent] 工具集: ${allowedTools.join(", ")}`);
  const services = await createAgentSessionServices({
    cwd,
    agentDir: getAgentDir(),
    settingsManager,
    modelRuntime,
    customTools,
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
    tools: allowedTools,
  });
  return created.session;
}

// 确保 entry 的 agent 存在（直调通道后 agent 可能被销毁，从 session 文件重建以恢复记忆）
async function ensureAgent(entry, model) {
  if (entry.agent) return entry.agent;
  // 会话级模型优先：会话自己切过模型则用它，否则用传入的（默认全局）
  const effModel = (entry?.modelKey && modelList.find(m => m.provider === entry.modelKey.provider && m.id === entry.modelKey.id))
    || model || defaultModel;
  const agent = await createSessionAgent(entry.sm, effModel);
  entry.agent = agent;
  entry.agentModel = effModel ? { provider: effModel.provider, id: effModel.id } : null;
  console.log(`[pi-web] agent 重建（模型 ${effModel?.provider}/${effModel?.id}）`);
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
  clearSessionModelKey(id); // 修复 A：删除会话时清理模型选择记录
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

// 从会话文件中提取消息（供历史渲染）——已拆到 engine/session-utils.mjs
// 从消息 content 提取文本（type: text 的块）——已拆到 engine/session-utils.mjs

// 从会话最新 assistant 消息提取文件附件（供 SSE 实时推送）
// 扫描工作空间里最近被工具创建/修改的文件（本轮产物），供前端展示文件卡片
// 排除：隐藏目录、node_modules、.git、backups、临时文件
const SCAN_EXCLUDE = /(^|[\\/])(node_modules|\.git|\.cache|backups?|temp|tmp|\.token)([\\/]|$)/i;
function scanRecentArtifacts(withinMs = 2 * 60 * 1000, max = 10) {
  try {
    const root = path.resolve(CONFIG.cwd);
    if (!fs.existsSync(root)) return [];
    const now = Date.now();
    const out = [];
    // 只扫关键目录：根目录 + 生成物/ + 收发文件/今天 + 工程/（含子目录，专项工作台产物都在这）
    // 避免把工程/ 子目录的历史文件当本轮产物：靠 withinMs 时间窗 + 只收成品类型
    const today = new Date().toISOString().slice(0, 10);
    const scanDirs = [root, path.join(root, "生成物"), path.join(root, "收发文件", today), path.join(root, "工程")];
    const seenNames = new Set();
    // 递归收集（工程/ 要递归子目录；其余平扫）
    const collect = (dir, recursive) => {
      let items;
      try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const it of items) {
        if (it.name.startsWith(".") || it.name.startsWith("_")) continue; // 排除隐藏 + 临时验证脚本（_前缀）
        if (SCAN_EXCLUDE.test(dir + path.sep + it.name)) continue;
        if (it.isDirectory()) {
          if (recursive && it.name !== "node_modules") collect(path.join(dir, it.name), true);
          continue;
        }
        const full = path.join(dir, it.name);
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        if (st.size <= 0 || now - st.mtimeMs >= withinMs) continue;
        // 只收常见产物类型
        const ext = path.extname(it.name).toLowerCase();
        if (!/^\.(html|htm|md|txt|js|css|json|py|png|jpg|jpeg|gif|webp|pdf|docx?|xlsx?|pptx?|mp3|wav|mp4|webm|svg|zip)$/.test(ext)) continue;
        // 同名去重（不同目录的同一产物只推最新一份）
        if (seenNames.has(it.name)) continue;
        seenNames.add(it.name);
        out.push({
          name: it.name,
          path: path.relative(root, full).replace(/\\/g, "/"),
          size: st.size,
          mime: "",
          mtimeMs: st.mtimeMs,
        });
      }
    };
    for (const dir of scanDirs) collect(dir, dir === path.join(root, "工程"));
    // 按"成品优先级"排序：网页/文档/图片类优先（脚本/验证文件靠后）
    const priority = (name) => {
      const ext = path.extname(name).toLowerCase();
      if (/^\.(html?|md|pdf|docx?|pptx?|png|jpe?g|gif|webp)$/.test(ext)) return 0;
      if (/^\.(zip|mp4|mp3|wav|svg|json)$/.test(ext)) return 1;
      if (/^\.(js|css|py|txt|ts)$/.test(ext)) return 2;
      return 3;
    };
    return out.sort((a, b) => priority(a.name) - priority(b.name) || (b.mtimeMs || 0) - (a.mtimeMs || 0)).slice(0, max);
  } catch { return []; }
}

// 输出质量守卫依赖注入（engine/output-guard.mjs 需要读会话文件做复读基准恢复）
try { bindOutputGuardDeps({ readEntriesFromFile, extractText }); } catch {}

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
// 默认模型：优先 CONFIG.model，其次商汤 flash-lite（2026-08-20 千问下架后主力，免费实测可用），
// 再回退小米/火山等免费通道，最后第一个
if (CONFIG.model) {
  defaultModel = modelList.find(m => `${m.provider}/${m.id}` === CONFIG.model) || undefined;
}
if (!defaultModel) {
  defaultModel = modelList.find(m => m.provider === "sensenova" && /flash-lite/i.test(m.id))
    || modelList.find(m => m.provider === "xiaomi-token-plan-cn" && /mimo-v2\.5$/i.test(m.id))
    || modelList.find(m => m.provider === "volces-ark" && /ark-code/i.test(m.id))
    || modelList[0];
}
console.log(`[pi-web] 默认模型: ${defaultModel?.provider}/${defaultModel?.id}`);
console.log(`[pi-web] 可用模型: ${modelList.length} 个（含 ${Object.keys(readJsonFile(MODELS_PATH)).join(", ")}）`);

// 模型路由层依赖注入（engine/model-router.mjs）：getter 动态读取，避免值拷贝 stale
initModelRouter({ getModelList: () => modelList, getDefaultModel: () => defaultModel, configModel: CONFIG.model });

// ══ Cursor Router 简化版（2026-08-17，对标 Cursor Router Auto / Windsurf Adaptive）══
// 理念：默认 Auto 路由——规则分类器按任务复杂度选模型：简单→flash（日常主力），复杂→pro（强推理，带上限）。
// 策略保守：flash vs pro 实测（2026-08-13）——pro 慢 2.4-7×、贵 3×、过度思考烧 token、偶发篡改数据，
// 所以 99% 的日常任务走 flash；只有明确复杂任务（长任务/多步骤/深度分析/代码库级）才升级 pro。
// 用户手动选择具体模型 → 不干预（与 Cursor "手动覆盖 Auto" 同构）。环境变量 PI_AUTO_ROUTE=0 可关闭。
// ⚠️ 实现已拆到 engine/model-router.mjs（2026-08-19）：
//   pro/flash 同源问题修正——千问只作 flash 主力，pro = ocGo deepseek-v4-pro → mimo-pro → ark；
//   ocGo 429 期间 pro 无可用 → 回落 flash 并播报真实原因（不假装升级）。

// ══ 复读检测与降级重试（2026-08-19 加固）══
// 判定逻辑已迁移到 engine/output-guard.mjs（输出质量守卫，纯判定模块）：
//   复读/空回复/纯思考 统一 classifyAnomaly；这里只保留"重试执行"（换 fallback 模型直调 + 播报）。
async function retryRepeatWithFallback(message, sessionKey, writer, busEmit, currentModel) {
  // ⚠️ 2026-08-19 修复：兜底必须排除出问题的模型（否则千问复读→兜底还是千问，切换无效）
  const fbModel = pickFallbackExcluding(currentModel);
  if (!fbModel) return null; // 无可用备用通道（全链冷却/清单缺模型）
  const note = `⚠️ 检测到模型复读（回复与上一条完全相同），已自动切换 ${fbModel.provider}/${fbModel.id} 重新生成…`;
  try { writer.push("note", { text: note }); if (busEmit) busEmit("note", { text: note }); } catch {}
  const fb = await directChat(fbModel, message);
  if (fb?.text) {
    const add = `\n\n（以下为切换模型后的新回复）\n${fb.text}`;
    try { writer.push("delta", { text: add }); if (busEmit) busEmit("delta", { text: add }); } catch {}
    recordReply(sessionKey, fb.text);
    console.log(`[pi-web] 复读重试成功: ${fbModel.provider}/${fbModel.id}`);
    return fb.text;
  }
  try { writer.push("note", { text: "⚠️ 复读检测触发，但备用模型也无回复（请手动切换模型或重试）" }); } catch {}
  return null;
}

// ══ 会话级模型选择持久化（2026-08-19 修复 A）════
// 现象：模型切换只存内存 entry.modelKey，会话 LRU 淘汰/服务重启后丢失 → 悄悄回 Auto → 429 场景下持续报错。
// 修复：切换写入 AGENT_DIR/session-model-keys.json，openSession 恢复；删除会话时清理。
const SESSION_KEYS_FILE = path.join(AGENT_DIR, "session-model-keys.json");
function saveSessionModelKey(sid, mk) {
  if (!sid) return;
  try { const d = readJsonFile(SESSION_KEYS_FILE); d[sid] = mk; fs.writeFileSync(SESSION_KEYS_FILE, JSON.stringify(d, null, 1)); } catch {}
}
function loadSessionModelKey(sid) { try { return readJsonFile(SESSION_KEYS_FILE)[sid] || null; } catch { return null; } }
function clearSessionModelKey(sid) { try { const d = readJsonFile(SESSION_KEYS_FILE); if (d[sid]) { delete d[sid]; fs.writeFileSync(SESSION_KEYS_FILE, JSON.stringify(d, null, 1)); } } catch {} }

// ══ 全局最后模型（2026-08-19 新增）══
// 现象：新建会话 createSession 不恢复模型选择 → 新会话永远回 Auto → 降级链落 mimo，用户上次选的千问不继承 → “智能路由乱了”
// 修复：用户切过具体模型后记录全局 lastModel，新会话继承（agent 直接用该模型）；切回 Auto 时清空
const LAST_MODEL_FILE = path.join(AGENT_DIR, "last-model.json");
function saveLastModel(mk) {
  try {
    if (!mk || (mk.provider === "auto" && mk.id === "auto")) { fs.writeFileSync(LAST_MODEL_FILE, JSON.stringify({}, null, 1)); return; }
    fs.writeFileSync(LAST_MODEL_FILE, JSON.stringify({ provider: mk.provider, id: mk.id }, null, 1));
  } catch {}
}
let lastModelKey = (() => { try { const d = readJsonFile(LAST_MODEL_FILE); return d?.provider && d?.id ? { provider: d.provider, id: d.id } : null; } catch { return null; } })();

// Plan 模式只读工具集（工具级硬限制）：读文件 + 搜索，不给写/执行工具
const PLAN_READONLY_SET = ["read", "search_files"];
const SUPPORTED_PROVIDERS = ["deepseek", "openai", "openrouter", "anthropic", "google", "qwen", "xai", "moonshotai", "zai", "together", "mistral", "modelscope", "cloudflare-ai"];

function readJsonFile(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; } }
function writeJsonFile(p, obj) { try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8"); return true; } catch { return false; } }
const CRLF = "\r\n";

// ── 隔离子任务执行器初始化（P2）──
// 复用系统代理栈 + 模型配置；flash 候选走千问（成本优先，子任务不值得 pro）
try {
  subagent.initSubagent({
    httpFetch: httpJsonFetch,
    authReader: () => readJsonFile(AUTH_PATH),
    modelReader: () => readJsonFile(MODELS_PATH),
    resolveAuth,
    getDefaultModel: () => defaultModel,
    getFlashModel: () => modelList.find(m => m.provider === "sensenova" && /flash-lite/i.test(m.id))
      || modelList.find(m => m.provider === "xiaomi-token-plan-cn" && /mimo-v2\.5$/i.test(m.id))
      || defaultModel,
  });
} catch (e) { console.log("[pi-web] subagent 初始化失败: " + String(e?.message || e).slice(0, 80)); }
// P3 资产路由：技能库摘要索引注入（任务→技能自动匹配）
try { emotion.bindSkillIndex(() => loadSkillIndex()); } catch {}

// 模型能力档案：根据 id 推断（chat 默认 + image/video/tts/asr 标记）
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
async function generateImage(provider, modelId, prompt, size) {
  const resolved = resolveAuth(provider);
  if (!resolved) return null;
  const baseUrl = resolved.baseUrl || (readJsonFile(MODELS_PATH)[provider]?.models || []).find(m => m.id === modelId)?.baseUrl;
  const key = resolved.key;
  const base = (baseUrl || "").replace(/\/+$/, "");
  const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
  const mkReq = (u) => httpJsonFetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: modelId, prompt, n: 1, size: size || "1024x1024" }),
    timeout: 180000,
  });
  let r = await mkReq(`${baseNoV1}/v1/images/generations`);
  if (!r.ok) r = await mkReq(`${baseNoV1}/images/generations`);
  if (!r.ok) r = await mkReq(`${baseNoV1}/v3/images/generations`); // 火山方舟规划版等 v3 endpoint
  if (!r.ok) return null;
  const data = await r.json();
  const item = data.data?.[0];
  if (!item) return null;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item.url) return item.url;
  return null;
}

async function handleImage(res, body) {
  const { provider, modelId, prompt, size, image } = body || {};
  if (!provider || !modelId || !prompt) return json(res, 400, { error: "缺少 provider / modelId / prompt" });
  const resolved = resolveAuth(provider);
  if (!resolved) return json(res, 400, { error: `${provider} 未配置 API Key（模型管理中添加）` });
  const baseUrl = resolved.baseUrl || (readJsonFile(MODELS_PATH)[provider]?.models || []).find(m => m.id === modelId)?.baseUrl;
  const key = resolved.key;
  const base = (baseUrl || "").replace(/\/+$/, "");
  const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
  // 阿里云百炼 wan 系列图像：/api/v1/services/aigc/multimodal-generation/generation
  if (provider === "aliyun-bailian" && /^wan\d/.test(modelId || "")) {
    const sizeMap = { "1024x1024": "1024*1024", "832x1472": "720*1280", "736x1312": "720*1280", "720x1280": "720*1280", "1920x1920": "1024*1024" };
    const sz = sizeMap[size] || "1024*1024";
    try {
      const host = (baseUrl || "").includes("maas.aliyuncs.com") ? baseUrl.replace(/\/compatible-mode\/v1.*$/, "") : "";
      const apiBase = host || "https://token-plan.cn-beijing.maas.aliyuncs.com";
      const mkReq = (u) => httpJsonFetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: modelId,
          input: { messages: [{ role: "user", content: [{ text: prompt }] }] },
          parameters: { size: sz, n: 1 },
        }),
        timeout: 180000,
      });
      let r = await mkReq(`${apiBase}/api/v1/services/aigc/multimodal-generation/generation`);
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return json(res, 502, { error: `aliyun 绘图失败 ${r.status}: ${txt.slice(0, 150)}` });
      }
      const data = await r.json();
      const img = data?.output?.choices?.[0]?.message?.content?.find?.((c) => c?.image)?.image;
      if (!img) return json(res, 500, { error: "aliyun 绘图接口未返回图片" });
      return json(res, 200, { image: img });
    } catch (e) {
      json(res, 500, { error: String(e?.message || e).slice(0, 200) });
    }
    return;
  }
  // minimax 专属：/v1/image_generation + aspect_ratio + image_urls 响应
  if (provider === "minimax") {
    const ratioMap = { "1024x1024": "1:1", "832x1472": "9:16", "1472x832": "16:9", "1024x1792": "9:16", "1792x1024": "16:9" };
    const aspect_ratio = ratioMap[size] || (size === "1024x1024" ? "1:1" : "9:16");
    try {
      const mkReq = (u) => httpJsonFetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: modelId, prompt, aspect_ratio, response_format: "url" }),
        timeout: 180000,
      });
      let r = await mkReq(`${baseNoV1}/v1/image_generation`);
      if (!r.ok) r = await mkReq(`${baseNoV1}/image_generation`);
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return json(res, 502, { error: `minimax 绘图失败 ${r.status}: ${txt.slice(0, 150)}` });
      }
      const data = await r.json();
      const urls = data?.data?.image_urls;
      if (Array.isArray(urls) && urls.length) return json(res, 200, { image: urls[0] });
      return json(res, 500, { error: "minimax 绘图接口未返回图片" });
    } catch (e) {
      json(res, 500, { error: String(e?.message || e).slice(0, 200) });
    }
    return;
  }
  // ModelScope 专属：异步任务模式（提交 → 轮询 /v1/tasks/{id} → 取 output_images）
  if (provider === "modelscope") {
    const sizeMap = { "1024x1024": "1024x1024", "832x1472": "720x1280", "736x1312": "720x1280", "720x1280": "720x1280", "1920x1920": "1024x1024" };
    const sz = sizeMap[size] || "1024x1024";
    try {
      const mkReq = (u, body) => httpJsonFetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-ModelScope-Async-Mode": "true" },
        body: JSON.stringify(body || {}),
        timeout: 60000,
      });
      let r = await mkReq(`${baseNoV1}/v1/images/generations`, { model: modelId, prompt, n: 1, size: sz });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return json(res, 502, { error: `modelscope 提交失败 ${r.status}: ${txt.slice(0, 150)}` });
      }
      const { task_id } = await r.json();
      if (!task_id) return json(res, 500, { error: "modelscope 未返回 task_id" });
      // 轮询任务状态（约 14s 成功，最多 90s；官方示例 5s 间隔）
      for (let i = 0; i < 18; i++) {
        await new Promise(res => setTimeout(res, 5000));
        const q = await httpJsonFetch(`${baseNoV1}/v1/tasks/${encodeURIComponent(task_id)}`, {
          headers: { Authorization: `Bearer ${key}`, "X-ModelScope-Task-Type": "image_generation" }, timeout: 30000,
        });
        if (!q.ok) continue;
        const t = await q.json();
        if (t.task_status === "SUCCEED") {
          const imgUrl = t.output_images?.[0];
          if (imgUrl) return json(res, 200, { image: imgUrl }); // output_images 是可直接访问的图片 URL（前端 <img> 直接加载）
          return json(res, 500, { error: "modelscope 任务成功但无图片" });
        }
        if (t.task_status === "FAILED") {
          return json(res, 500, { error: "modelscope 任务失败: " + String(t.message || "未知").slice(0, 120) });
        }
      }
      return json(res, 504, { error: "modelscope 任务超时（90s）" });
    } catch (e) {
      json(res, 500, { error: String(e?.message || e).slice(0, 200) });
    }
    return;
  }
  // Cloudflare Workers AI 专属：POST /accounts/{id}/ai/run/@cf/... 返回 { result.image } base64
  if (provider === "cloudflare-ai") {
    // account_id 从 auth.json 的额外字段取（同 provider 配置里 account_id）
    const auth = readJsonFile(AUTH_PATH);
    const accountId = auth["cloudflare-ai"]?.account_id || process.env.CLOUDFLARE_ACCOUNT_ID || "";
    if (!accountId) return json(res, 400, { error: "cloudflare-ai 未配置 account_id（模型管理中添加）" });
    const sizeMap = { "1024x1024": [512, 512], "832x1472": [512, 896], "736x1312": [512, 896], "720x1280": [512, 896], "1920x1920": [768, 768] };
    // 默认 512x512 省免费额度（10k Neurons/天，1024 大图一张就顶一天）
    const [w, h] = sizeMap[size] || [512, 512];
    // 原始二进制返回的模型（phoenix 等）：响应直接是图片字节，不是 JSON base64
    const rawBinary = /leonardo\/phoenix/.test(modelId || "");
    // FLUX.2 系列：要求 multipart/form-data 输入（prompt 字段），不是纯 JSON；且 multipart 需精确字节 → 也走二进制通道
    const useMultipart = /flux-2/.test(modelId || "");
    const rawChannel = rawBinary || useMultipart;
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${modelId}`;
      const jsonBody = JSON.stringify({ prompt, width: w, height: h, steps: 4 });
      let body = jsonBody;
      let headers = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
      if (useMultipart) {
        const boundary = "----piwebcf" + Math.floor(Math.random() * 1e9);
        body = `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n--${boundary}--\r\n`;
        headers = { "Content-Type": `multipart/form-data; boundary=${boundary}`, Authorization: `Bearer ${key}` };
      }
      if (rawChannel) {
        // 二进制模型：原生 fetch 直接拿 buffer（旧 python 中转 + base64 方案已移除）
        const r = await httpBufferFetch(url, { method: "POST", headers, body, timeout: 180000 });
        if (r.status >= 300) return json(res, 502, { error: `cloudflare 绘图失败 ${r.status}` });
        const buf = r.buffer();
        if (!buf || !buf.length) return json(res, 500, { error: "cloudflare 未返回图片数据" });
        // 部分模型（FLUX.2）响应是 JSON {result:{image: b64}}，需要解包；纯二进制模型（phoenix）直接用
        try {
          const parsed = JSON.parse(buf.toString("utf8"));
          const inner = parsed?.result?.image;
          if (typeof inner === "string") return json(res, 200, { image: `data:image/jpeg;base64,${inner}` });
        } catch {}
        return json(res, 200, { image: `data:image/jpeg;base64,${buf.toString("base64")}` });
      }
      const r = await httpJsonFetch(url, {
        method: "POST",
        headers,
        body,
        timeout: 180000,
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return json(res, 502, { error: `cloudflare 绘图失败 ${r.status}: ${txt.slice(0, 150)}` });
      }
      const data = await r.json();
      const b64 = data?.result?.image;
      if (!b64) return json(res, 500, { error: "cloudflare 未返回图片数据" });
      return json(res, 200, { image: `data:image/jpeg;base64,${b64}` });
    } catch (e) {
      json(res, 500, { error: String(e?.message || e).slice(0, 200) });
    }
    return;
  }
  try {
    // 火山方舟 seedream 5.0：最小 3686400 像素，但保留宽高比（1:1/9:16/16:9）
    let effSize = size || "1024x1024";
    if (provider === "volces-ark" && /seedream/i.test(modelId || "")) {
      // 按比例映射且面积 ≥3686400：1:1→1920x1920；9:16→1440x2560(面积3686400)；16:9→2560x1440
      const ratioMap = {
        "1024x1024": "1920x1920",   // 1:1
        "832x1472": "1440x2560",    // 9:16 竖图
        "736x1312": "1440x2560",    // 9:16
        "720x1280": "1440x2560",    // 9:16
        "1472x832": "2560x1440",    // 16:9 横图
      };
      effSize = ratioMap[effSize] || (effSize.includes("x") ? effSize : "1920x1920");
    }
    const mkReq = (u) => httpJsonFetch(u, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, prompt, n: 1, size: effSize, ...(image ? { image } : {}) }),
      timeout: 180000,
    });
    let r = await mkReq(`${baseNoV1}/v1/images/generations`);
    if (!r.ok) r = await mkReq(`${baseNoV1}/images/generations`);
    if (!r.ok) r = await mkReq(`${baseNoV1}/v3/images/generations`); // 火山方舟规划版等 v3 endpoint
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
    json(res, 500, { error: String(e?.message || e).slice(0, 800) });
  }
}

// 出图后自动落盘到本地（生成物/图片/日期），返回本地 URL——稳定展示 + 留档
// 避免第三方 OSS 链接不稳定导致页面图不展示
async function handleImageWithSave(res, req, body) {
  let payload = null;
  const origJson = json;
  // 拦截 handleImage 内部的 json(res, ...)，吞掉输出，捕获结果
  json = (r, code, obj) => {
    if (r === res) { payload = { code, obj }; return; } // 吞掉，统一在最后发
    return origJson(r, code, obj);
  };
  try {
    await handleImage(res, body);
  } catch (e) {
    payload = { code: 500, obj: { error: String(e?.message || e).slice(0, 200) } };
  } finally {
    json = origJson;
  }
  // 成功出图 → 落盘本地，覆盖返回
  if (payload && payload.code === 200 && payload.obj?.image) {
    const saved = await saveArtifact({ type: "image", url: payload.obj.image }).catch(() => null);
    if (saved) payload.obj.image = saved;
    // 相对路径补全为绝对 URL（按实际访问 Host，本地/公网都可用）——修复"每次手动拼 127.0.0.1:8787"的坑
    if (typeof payload.obj.image === "string" && payload.obj.image.startsWith("/")) {
      const host = req?.headers?.host || "127.0.0.1:8787";
      const proto = req?.headers?.["x-forwarded-proto"]?.startsWith("https") ? "https" : "http";
      payload.obj.image = `${proto}://${host}${payload.obj.image}`;
    }
  }
  // 统一输出（只发一次）
  try { json(res, payload?.code || 500, payload?.obj || { error: "未知错误" }); } catch {}
}

// POST /api/models/remove {provider}
// 内置 provider（走 pi agent）；其余自定义 provider 走直调通道
const KNOWN_PROVIDERS = new Set(["deepseek", "openai", "openrouter", "anthropic", "google", "qwen", "xai", "moonshotai", "zai", "together", "mistral", "opencode-go"]);

// 主流大厂预设（OpenAI 兼容 /models 探测）：首次启动引导下拉框 + keys/apply 验证共用
const PROVIDER_PRESETS = {
  deepseek:    { name: "DeepSeek 深度求索",     baseUrl: "https://api.deepseek.com" },
  openai:      { name: "OpenAI",                baseUrl: "https://api.openai.com/v1" },
  openrouter:  { name: "OpenRouter 聚合",        baseUrl: "https://openrouter.ai/api/v1" },
  anthropic:   { name: "Anthropic · Claude",    baseUrl: "https://api.anthropic.com/v1" },
  google:      { name: "Google · Gemini",        baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  qwen:        { name: "阿里云百炼 · Qwen",     baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  moonshotai:  { name: "Moonshot · Kimi",       baseUrl: "https://api.moonshot.cn/v1" },
  zai:         { name: "智谱 · GLM",            baseUrl: "https://api.z.ai/api/v1" },
  "volces-ark":{ name: "火山方舟 · Ark",       baseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
  xai:         { name: "xAI · Grok",            baseUrl: "https://api.x.ai/v1" },
  mistral:     { name: "Mistral",               baseUrl: "https://api.mistral.ai/v1" },
  together:    { name: "Together AI",           baseUrl: "https://api.together.xyz/v1" },
  sensenova:   { name: "商汤 · 日日新",         baseUrl: "https://api.sensenova.cn/v1" },
  modelscope:  { name: "魔搭 · ModelScope",     baseUrl: "https://api.modelscope.cn/v1" },
  "cloudflare-ai": { name: "Cloudflare Workers AI", baseUrl: "" },
};

// GET /api/keys/presets —— 首启引导下拉框数据（单一来源，前端不写死）
function handleKeysPresets(res) {
  json(res, 200, { presets: PROVIDER_PRESETS });
}

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
  resetModelHealth(); // 模型清单刷新 = 重新探测，冷却状态一并清零给所有模型新机会
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

// 模型能力探测与发现已抽到 engine/model-probe.mjs（modelCapabilities / probeModelCapabilities / discoverCustomModels）
// POST /api/models/add —— 添加（内置 provider 用 pi runtime；自定义 provider 直调探测）
async function handleModelsAdd(res, body) {
  const { provider, apiKey, baseUrl, account_id, toDsh } = body || {};
  if (!provider || !apiKey) return json(res, 400, { error: "缺少 provider 或 API Key" });
  if (!/^[a-zA-Z0-9_-]+$/.test(provider)) return json(res, 400, { error: "provider 名称只能包含字母、数字、横线" });
  const auth = readJsonFile(AUTH_PATH);
  auth[provider] = { type: "api_key", key: apiKey, ...(baseUrl ? { baseUrl } : {}), ...(account_id ? { account_id } : {}) };
  writeJsonFile(AUTH_PATH, auth);
  // Cloudflare Workers AI：非 OpenAI 风格，手动注册已知模型
  if (provider === "cloudflare-ai") {
    if (!account_id) {
      delete auth[provider]; writeJsonFile(AUTH_PATH, auth);
      return json(res, 400, { error: "cloudflare-ai 需要填写 Account ID（Cloudflare 控制台 → Workers AI → REST API）" });
    }
    const store = readJsonFile(MODELS_PATH);
    store[provider] = {
      models: [
        { id: "@cf/black-forest-labs/flux-1-schnell", name: "FLUX.1 Schnell", api: "openai-completions", baseUrl: "", provider: "", reasoning: false, input: ["text"], contextWindow: 8192, maxTokens: 8192, capabilities: { chat: false, image: true, video: false, tts: false, asr: false } },
      ],
      checkedAt: new Date().toISOString(),
    };
    writeJsonFile(MODELS_PATH, store);
    console.log(`[pi-web] 模型添加成功: ${provider} 1 个（手动注册）`);
    await refreshModelList();
    return json(res, 200, { ok: true, provider, models: store[provider].models, manual: true });
  }
  // 复用上次探测结果：同一 provider 重复添加时跳过逐模型 API 探测（配合 probeCache 双保险）
  const oldCaps = new Map(
    (readJsonFile(MODELS_PATH)[provider]?.models || [])
      .filter((m) => m.capabilities && typeof m.capabilities.chat === "boolean")
      .map((m) => [m.id, m.capabilities])
  );
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
          if (!/(image|video|tts|asr)/i.test(m.id)) m.capabilities = oldCaps.get(m.id) || await probeModelCapabilities(baseNoV1, apiKey, m.id);
        }
      }
    } else {
      const base = (baseUrl || "").replace(/\/+$/, "");
      if (!base) return json(res, 400, { error: "自定义 provider 必须填写 Base URL" });
      models = await discoverCustomModels(base, apiKey, oldCaps);
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
    // dsh 同步（可选）：写用户级环境变量 DEEPSEEK_API_KEY（新终端/进程生效）
    let dsh = false, dshNote = "";
    if (toDsh) {
      try {
        execFileSync("setx", ["DEEPSEEK_API_KEY", apiKey], { windowsHide: true, timeout: 10000 });
        dsh = true; dshNote = "dsh 已同步（新开的终端/进程生效）";
      } catch (e) { dshNote = "dsh 同步失败：" + String(e?.message || e).slice(0, 80); }
    }
    json(res, 200, { ok: true, modelCount: models.length, models: models.map(m => m.id), dsh, dshNote });
  } catch (e) {
    const a2 = readJsonFile(AUTH_PATH); delete a2[provider]; writeJsonFile(AUTH_PATH, a2);
    console.log(`[pi-web] 模型添加失败: ${provider} → ${String(e?.message || e).slice(0, 100)}`);
    json(res, 500, { error: String(e?.message || e).slice(0, 200) });
  }
}

// ── dsh 引擎适配层：探测（安装/版本/密钥/web 前台在线）+ 一键拉起 web ──
// 背景：⇄ dsh 链接是硬编码 3080，dsh web 没起时点过去是死页——前端需要真实状态。
const DSH_WEB_PORT = 3080;
function dshResolveBin() {
  const cands = [
    path.join(process.env.APPDATA || "", "npm", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
    path.join(process.env.ProgramFiles || "", "nodejs", "node_modules", "npm", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
  ];
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch {} }
  return null;
}
async function handleDshStatus(res) {
  const bin = dshResolveBin();
  // web 前台探测：本地 3080 有响应即在线（不依赖 dsh 内部实现）
  let webUp = false;
  try {
    const r = await fetch(`http://127.0.0.1:${DSH_WEB_PORT}/`, { signal: AbortSignal.timeout(1500) });
    webUp = r.status < 500;
  } catch {}
  // 密钥：进程 env → 注册表（与 dsh-tool 的 resolveDshEnv 同链路）
  let keyOk = !!process.env.DEEPSEEK_API_KEY;
  if (!keyOk) {
    try {
      const out = execFileSync("reg", ["query", "HKCU\\Environment", "/v", "DEEPSEEK_API_KEY"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
      keyOk = /DEEPSEEK_API_KEY\s+REG_SZ\s+.+/.test(out);
    } catch {}
  }
  if (!keyOk) { const a = readJsonFile(AUTH_PATH); keyOk = !!a?.deepseek?.key; }
  json(res, 200, { installed: !!bin, bin, webUp, webPort: DSH_WEB_PORT, keyOk });
}
async function handleDshWebStart(res) {
  const bin = dshResolveBin();
  if (!bin) return json(res, 404, { error: "dsh 引擎未安装：npm i -g @deepseek-ai/dsh" });
  try {
    const probe = await fetch(`http://127.0.0.1:${DSH_WEB_PORT}/`, { signal: AbortSignal.timeout(1500) });
    if (probe.status < 500) return json(res, 200, { ok: true, already: true, url: `http://127.0.0.1:${DSH_WEB_PORT}` });
  } catch {}
  // detached 拉起：独立于 pi-web 生命周期，日志落 dsh-web.log 便于排查
  try {
    const { resolveDshEnv } = await import("./engine/dsh-tool.mjs");
    const logFd = fs.openSync(path.join(os.tmpdir(), "dsh-web.log"), "a");
    const child = spawn(process.execPath, [bin, "web"], {
      detached: true, stdio: ["ignore", logFd, logFd], windowsHide: true, env: resolveDshEnv(),
    });
    child.unref();
    try { fs.closeSync(logFd); } catch {}
  } catch (e) {
    return json(res, 500, { error: "dsh web 启动失败: " + String(e?.message || e).slice(0, 120) });
  }
  // 冷启动需要数秒：轮询最多 15s 等它上线
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const r = await fetch(`http://127.0.0.1:${DSH_WEB_PORT}/`, { signal: AbortSignal.timeout(1000) });
      if (r.status < 500) return json(res, 200, { ok: true, url: `http://127.0.0.1:${DSH_WEB_PORT}` });
    } catch {}
  }
  json(res, 202, { ok: true, pending: true, url: `http://127.0.0.1:${DSH_WEB_PORT}`, note: "dsh web 启动中（冷启动较慢），稍后刷新即可" });
}

// ── 双引擎密钥：状态查询（pi auth.json + dsh DEEPSEEK_API_KEY）──
function handleKeysStatus(res) {
  const auth = readJsonFile(AUTH_PATH);
  const piProviders = Object.keys(auth).filter(k => auth[k]?.key);
  let dshKey = process.env.DEEPSEEK_API_KEY || "";
  if (!dshKey) {
    try {
      const out = execFileSync("reg", ["query", "HKCU\\Environment", "/v", "DEEPSEEK_API_KEY"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
      const m = out.match(/DEEPSEEK_API_KEY\s+REG_SZ\s+(.+)/);
      if (m) dshKey = m[1].trim();
    } catch {}
  }
  json(res, 200, { pi: piProviders, dsh: !!dshKey });
}

// ── 双引擎密钥：应用（pi 写 auth.json + 探测验证 + 刷新模型列表；可选 setx 同步 dsh）──
// ── 声明式策略引擎（Gemini Policy Engine 借鉴）：~/.piweb/policies.json ──
// 规则：tool(glob) + match(参数名→正则) → decision(allow/deny)；deny 优先；内置隧道/密钥/危险操作默认规则
let policiesCache = null, policiesMtime = 0;
function loadPolicies() {
  try {
    const f = path.join(os.homedir(), ".piweb", "policies.json");
    const st = fs.statSync(f);
    if (st.mtimeMs !== policiesMtime || !policiesCache) {
      policiesCache = JSON.parse(fs.readFileSync(f, "utf8"));
      policiesMtime = st.mtimeMs;
    }
  } catch { policiesCache = { rules: [] }; }
  return policiesCache;
}
function toolMatch(pat, name) {
  if (pat === "*" || pat === name) return true;
  if (pat.includes("*")) {
    const re = new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    return re.test(name);
  }
  return false;
}
// 匹配工具调用 → { decision, note }（deny 优先于 allow；无规则默认 allow）
function policyDecide(tool, args) {
  const { rules = [] } = loadPolicies();
  let deny = null, allow = null;
  for (const r of rules) {
    if (!r.tool || !toolMatch(r.tool, tool)) continue;
    if (r.match) {
      let hit = true;
      for (const [k, re] of Object.entries(r.match)) {
        const v = String(args?.[k] ?? "");
        try { if (!new RegExp(re, "i").test(v)) { hit = false; break; } } catch { hit = false; break; }
      }
      if (!hit) continue;
    }
    if (r.decision === "deny") deny = r;
    else if (r.decision === "allow") allow = r;
  }
  if (deny) return { decision: "deny", note: deny.note || `工具 ${tool} 被策略禁止` };
  if (allow) return { decision: "allow", note: allow.note || "" };
  return { decision: "allow", note: "" };
}

async function handleKeysApply(res, body) {
  const { provider, apiKey, baseUrl, toDsh } = body || {};
  if (!provider || !apiKey) return json(res, 400, { error: "缺少 provider 或 API Key" });
  if (!/^[a-zA-Z0-9_-]+$/.test(provider)) return json(res, 400, { error: "provider 名称只能包含字母、数字、横线" });
  // API Key 必须是纯 ASCII（复制时易混入 ×✕ 等符号，undici fetch 会报 ByteString 错）
  if (/[^\x20-\x7E]/.test(apiKey)) {
    return json(res, 400, { error: "API Key 包含特殊字符（复制时可能带入了 ×✕ 等符号），请从平台重新复制后重试" });
  }
  // ── 先验证、后写入：任何失败路径都不写 auth.json，杜绝假 key 污染 ──
  let models = null;
  if (KNOWN_PROVIDERS.has(provider)) {
    // 内置 provider：调真实 API 探测 key（/models 端点，OpenAI 兼容）
    let base = (baseUrl || "").replace(/\/+$/, "");
    try {
      const runtime = await ModelRuntime.create({ authPath: AUTH_PATH, modelsPath: MODELS_PATH });
      if (!base) {
        // 预设优先，其次 pi 内置 provider 定义
        base = PROVIDER_PRESETS[provider]?.baseUrl || "";
        if (!base) {
          const prov = (runtime.getProviders?.() || []).find(p => p.id === provider);
          base = (prov?.baseUrl || "").replace(/\/+$/, "");
        }
      }
      if (!base) return json(res, 400, { error: `未找到 ${provider} 的 API 地址（请填写 Base URL）` });
      const probe = await fetch(base + "/models", {
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (probe.status === 401 || probe.status === 403) {
        return json(res, 401, { error: `API Key 无效（HTTP ${probe.status}），未写入配置` });
      }
      if (!probe.ok) return json(res, 502, { error: `API 探测失败（HTTP ${probe.status}），未写入配置` });
      models = await runtime.getAvailable(provider).catch(() => null);
      // ⚠️ 新装场景：store 尚无该 provider 模型定义时 getAvailable 返回空 → 用刚探测到的 /models 响应兜底建模型，杜绝"未发现可用模型"引导死路
      if (!models || !models.length) {
        try {
          const pj = await probe.json();
          models = (pj?.data || []).map(mm => ({ id: mm.id, name: mm.id || mm.id, input: ["text"], contextWindow: 128000 }))
            .filter(mm => typeof mm.id === "string" && mm.id.trim());
        } catch {}
        if (!models || !models.length) {
          try { models = await discoverCustomModels(base, apiKey); } catch { models = null; }
        }
      }
    } catch (e) {
      console.log(`[pi-web] keys/apply 探测失败: ${provider} → ${String(e?.message || e).slice(0, 120)}`);
      return json(res, 500, { error: `探测异常：${String(e?.message || e).slice(0, 120)}` });
    }
  } else {
    // 自定义 provider：discoverCustomModels 验证通过才写入
    const base = (baseUrl || "").replace(/\/+$/, "");
    if (!base) return json(res, 400, { error: "自定义 provider 必须填写 Base URL" });
    try { models = await discoverCustomModels(base, apiKey); }
    catch (e) { return json(res, 400, { error: `验证失败：${String(e?.message || e).slice(0, 120)}` }); }
  }
  if (!models || !models.length) {
    return json(res, 400, { error: "该 Key 下未发现可用模型（请确认 Base URL 与接口协议正确），未写入配置" });
  }
  // 验证全部通过：写入 auth.json
  const auth = readJsonFile(AUTH_PATH);
  auth[provider] = { type: "api_key", key: apiKey, ...(baseUrl ? { baseUrl } : {}) };
  writeJsonFile(AUTH_PATH, auth);
  const store = readJsonFile(MODELS_PATH);
  store[provider] = { models, checkedAt: new Date().toISOString() };
  writeJsonFile(MODELS_PATH, store);
  await refreshModelList();
  // dsh 同步（可选）：写用户级环境变量 DEEPSEEK_API_KEY（新终端/新进程生效）
  let dshDone = false, dshNote = "";
  if (toDsh) {
    try {
      execFileSync("setx", ["DEEPSEEK_API_KEY", apiKey], { windowsHide: true, timeout: 10000 });
      dshDone = true;
      dshNote = "dsh 已同步（新开的终端/进程生效）";
    } catch (e) {
      dshNote = "dsh 同步失败：" + String(e?.message || e).slice(0, 80);
    }
  }
  json(res, 200, { ok: true, pi: provider, dsh: dshDone, dshNote });
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

// ── 会话事件总线：任务事件统一入缓冲 + 广播给所有订阅者（多端实时观看）──
const sessionBus = new Map(); // key: taskId/sessionId → { seq, events: [], subs: Set }
function busGet(key) {
  if (!key) return null;
  if (!sessionBus.has(key)) sessionBus.set(key, { seq: 0, events: [], subs: new Set() });
  return sessionBus.get(key);
}
function busPush(key, type, data) {
  const b = busGet(key);
  if (!b) return null;
  const ev = { type, seq: ++b.seq, data: data || {}, ts: Date.now() };
  b.events.push(ev);
  if (b.events.length > 500) b.events.splice(0, b.events.length - 500); // 环形缓冲 500
  // 任务结束：清空缓冲，避免完成后订阅端重放（历史已从 /messages 拿）
  if (type === "turn_end") b.events.length = 0;
  for (const sub of b.subs) {
    try { sub.write(`event: ${type}\ndata: ${JSON.stringify(ev)}\n\n`); } catch {}
  }
  return ev;
}

// GET /api/sessions/:id/stream —— 会话实时订阅（多端观看）：补发 after 之后历史 + 实时广播 + 心跳
async function handleSessionStream(res, req, url, id) {
  const key = decodeURIComponent(id || "");
  if (!key) return json(res, 400, { error: "缺少会话 ID" });
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  const b = busGet(key);
  const after = parseInt(url?.searchParams?.get("after") || "0", 10) || 0;
  // 补发 after 之后的历史事件（断线续流/晚加入观看）
  for (const ev of b.events) if (ev.seq > after) {
    try { res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`); } catch {}
  }
  try { res.write(`event: subscribed\ndata: ${JSON.stringify({ key, lastSeq: b.seq })}\n\n`); } catch {}
  const sub = { write: (s) => { if (!res.writableEnded) { try { res.write(s); } catch {} } } };
  b.subs.add(sub);
  const hb = setInterval(() => { try { sub.write(": ping\n\n"); } catch {} }, 20000);
  req.on("close", () => { clearInterval(hb); b.subs.delete(sub); });
}

// ── 路由 ───────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".json": "application/json",
};

const staticServer = createStaticServer({ publicDir: PUBLIC_DIR, mime: MIME });

async function handleStatic(req, res) {
  return staticServer.handle(req, res);
}

function handleModels(res) {
  // 只返回已配置 Key 的 provider 的模型（auth.json 或环境变量），避免列出无法使用的模型
  // 2026-08-20：附带 free/note（store 模型条目标注：免费通道/限时免费等）供前端展示种类与免费标记
  const store = readJsonFile(MODELS_PATH);
  const list = modelList
    .filter(m => resolveAuth(m.provider))
    .map(m => {
      const sm = (store[m.provider]?.models || []).find(x => x.id === m.id) || {};
      return {
        provider: m.provider, id: m.id, name: m.name || m.id,
        contextWindow: m.contextWindow,
        vision: Array.isArray(m.input) && m.input.includes("image"),
        reasoning: !!m.reasoning,
        capabilities: m.capabilities || modelCapabilities(m.id),
        free: sm.free,       // true=免费通道（undefined=未知/付费）
        note: sm.note || "", // 标注：限时免费 / 免费额度 等
      };
    });
  json(res, 200, {
    models: list,
    current: defaultModel ? { provider: defaultModel.provider, id: defaultModel.id } : null,
    autoDefault: !CONFIG.model, // 未显式配置默认模型 → Auto（智能路由）为全局默认
    cwd: CONFIG.cwd,
    tools: CONFIG.tools,
  });
}

async function handleSwitchModel(req, res, body) {
  // Auto 路由特殊处理（Cursor Router 简化版）：不绑定具体模型，每条消息按复杂度路由
  if (body.provider === "auto" || (body.modelId && /^auto(-smart)?$/i.test(body.modelId))) {
    lastModelKey = null; saveLastModel(null); // 用户切回 Auto → 新会话也回 Auto（2026-08-19）
    if (body.sessionId && activeSessions.has(body.sessionId)) {
      const entry2 = activeSessions.get(body.sessionId);
      try { entry2.modelKey = { provider: "auto", id: "auto" }; } catch {}
      saveSessionModelKey(body.sessionId, { provider: "auto", id: "auto" }); // 修复 A：持久化
      // 重建 agent 用默认 flash 暂代，下条消息 handleChat 按复杂度实时路由
      if (entry2.agent && !entry2.busy) {
        try { entry2.agent.dispose(); } catch {}
        entry2.agent = null;
        try { const ag = await createSessionAgent(entry2.sm, defaultModel); entry2.agent = ag; entry2.agentModel = { provider: defaultModel.provider, id: defaultModel.id }; } catch {}
      }
      json(res, 200, { ok: true, model: { provider: "auto", id: "auto" }, sessionScoped: true, auto: true });
      return;
    }
    json(res, 200, { ok: true, model: { provider: "auto", id: "auto" }, deferred: true, auto: true });
    return;
  }
  const m = modelList.find(x => x.provider === body.provider && x.id === body.modelId);
  if (!m) return json(res, 404, { error: `模型未找到: ${body.provider}/${body.modelId}` });
  const switched = !(defaultModel?.provider === m.provider && defaultModel?.id === m.id);
  // 完整 runtime 模型（含 compat/thinkingFormat，简版模型会导致 agent 通道 reasoning 处理异常）
  let fullModel = m;
  try {
    fullModel = modelRuntime.getModels().find(x => x.provider === m.provider && x.id === m.id) || m;
  } catch {}
  // 会话级切换：只改指定会话的模型，不动全局 defaultModel（避免污染其他会话）
  if (body.sessionId && activeSessions.has(body.sessionId)) {
    const entry2 = activeSessions.get(body.sessionId);
    // 记录会话自己的模型选择（会话重启时恢复）
    try { entry2.modelKey = { provider: m.provider, id: m.id }; } catch {}
    saveSessionModelKey(body.sessionId, { provider: m.provider, id: m.id }); // 修复 A：持久化
    // 2026-08-19 收敛：不再写全局 lastModel——新会话一律默认千问，用户切模型只锁当前会话
    // 如果 agent 空闲，立即重建生效；busy 则标记（下次消息 handleChat 对比重建）
    if (entry2.agent && !entry2.busy) {
      try { entry2.agent.dispose(); } catch {}
      entry2.agent = null;
      try {
        const ag = await createSessionAgent(entry2.sm, fullModel);
        entry2.agent = ag;
        entry2.agentModel = { provider: m.provider, id: m.id };
        if (switched) { try { await syncContextAfterSwitch(entry2, m); } catch {} }
      } catch {}
    } else if (entry2.agent && entry2.busy) {
      // busy：不改 agentModel（保持旧值），handleChat 下次对比发现不一致会重建
      console.log(`[pi-web] 会话 busy，模型切换延迟到下次消息生效 → ${m.provider}/${m.id}`);
    }
    json(res, 200, { ok: true, model: { provider: m.provider, id: m.id }, sessionScoped: true });
    return;
  }
  // 无 sessionId → 不改全局默认（新会话还没创建，切换无意义；前端已用 pendingModel 等会话创建后按会话应用）
  // 防止旧客户端/直调 API 污染全局 defaultModel（曾导致默认模型被切到 opencode-go）
  json(res, 200, { ok: true, model: { provider: m.provider, id: m.id }, deferred: true });
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
// ══ 统一模型接入层：所有模型一视同仁（对话 + 工具循环 + 思考提取）══
// 基础工具 schema（bash/read/write/edit/web_search）已抽到 engine/tools/unified-tools.mjs；
// 此处组合 server 特有的工具（技能激活 + 外部思考）
const UNIFIED_TOOLS = [
  ...BASE_TOOL_SCHEMAS,
  ACTIVATE_SKILL_TOOL,
];
// ══ 外部思考工具（externalThinking 调试开关，默认关）══
// 思路：关闭模型原生隐藏思考后，给它一张外部"草稿纸"（think 工具），
// 模型会把分析过程写进工具参数返回给开发者——用于调试"模型为什么这么干"。
// 安全：think 内容只在内存/SSE 流中传向前端展示，不落盘、不进会话文件。
const THINK_TOOL = { type: "function", function: { name: "think", description: "（调试用）动手之前，先把你的分析、推理、计划写在 content 里。这段内容仅供开发者调试查看，不会展示给用户。", parameters: { type: "object", properties: { content: { type: "string", description: "你的思考草稿（推理过程/计划/待办检查）" } }, required: ["content"] } } };
const THINK_PROMPT = "你可以调用 think 工具，在动手之前写下你的分析过程（理解、步骤、计划、可能的坑）。写完后再执行任务。think 的内容仅供调试，不展示给用户，可以放心写。";
const isExternalThinking = () => !!(CONFIG.externalThinking || globalThis.__piWebExternalThinking);


// ── 双引擎：dsh（DeepSeek Harness）执行臂工具 —— 实现已抽到 engine/dsh-tool.mjs ──
// 模式：pi 主引擎（规划/对话/验收）→ 派单 dsh 执行（代码/沙箱/工作流）→ 结果回 pi 验收交付。
const { initDshTool } = createDshTool({
  cwd: CONFIG.cwd,
  piPackage: CONFIG.piPackage,
  loadSkillIndex,
  skillsDir: path.join(__dirname, "skills"),
});

// 统一工具执行器：实现已抽到 engine/tools/unified-tools.mjs（大脑可移植第一步）。
// server 侧注入：工作目录 / 工作空间路径安全 / 技能激活 / 时间引擎。
const executeUnifiedTool = createUnifiedToolExecutor({
  cwd: () => CONFIG.cwd,
  safePath: wsSafePath,
  activateSkill: (name) => execActivateSkill(name),
  timeEngine: () => timeEngine,
});

// ══ Reasonix 三大机制落地（2026-08-19，esengine/DeepSeek-Reasonix 借鉴）══
// 实现已抽到 engine/reasonix-tools.mjs（纯逻辑模块）：
//   ① shrinkToolResult 工具结果压缩（P3） ② NEEDS_PRO_RE 自报升级（P3） ③ scavengeToolCalls 捞回（P2）

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
  const jitInjected = new Set(); // 本会话 JIT 目录规则已注入集合（每目录一次）
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
      // 健康冷却（2026-08-20 泛化）：401/402/403/429/529 标记 30 分钟，Auto 路由与兜底链自动避开该模型
      if (isAuthErrorStatus(r.status)) markModelBlocked(model, { reason: `HTTP ${r.status} ${String(errBody).slice(0, 60)}` });
      else if (model.provider === "opencode-go" && /GoUsageLimit/i.test(errBody)) markModelBlocked(model, { reason: errBody });
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
        // 声明式策略拦截（Gemini Policy Engine 借鉴）：deny 规则（隧道/密钥/危险操作）→ 拦截并注入引导
        const pd = policyDecide(fnName, args);
        if (pd.decision === "deny") {
          if (opts.onTool) opts.onTool(tc.id, fnName, args);
          const guide = `[系统拦截] ${pd.note}`;
          history.push({ role: "tool", tool_call_id: tc.id, content: guide });
          if (opts.onToolEnd) opts.onToolEnd(tc.id, fnName, args, { text: guide, isError: true });
          continue;
        }
        // 重复检测：相同工具+相同参数连续 3 次 → 中断（防死循环）
        // 失败重试（isError）不算死循环——模型在环境问题（网络/权限）下合理重试，但连续 5 次失败也停，避免无限空转
        const sig = fnName + ":" + JSON.stringify(args);
        seenCalls.set(sig, (seenCalls.get(sig) || 0) + 1);
        if (opts.onTool) opts.onTool(tc.id, fnName, args);
        const out = await executeUnifiedTool(fnName, args);
        // JIT 上下文（Gemini 借鉴）：read/write/edit 带 path 时注入该目录链 GEMINI.md 约定（每目录每会话一次）
        if (fnName === "read" || fnName === "write" || fnName === "edit") {
          try {
            const jits = jitRulesForPath(args.path);
            if (jits.length) {
              const key = jits[0].slice(0, 30);
              if (!jitInjected.has(key)) {
                jitInjected.add(key);
                out.text = `[该目录约定 GEMINI.md]\n${jits.join("\n")}\n\n---\n${out.text}`;
              }
            }
          } catch {}
        }
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
    // ══ P2 scavenge（Reasonix 借鉴，2026-08-19）：无 tool_calls 但思考里捞到合法工具调用 → 执行（带策略拦截）
    const scavenged = tcs?.length ? [] : scavengeToolCalls(msg.reasoning_content || "", toolDefs, seenCalls);
    if (scavenged.length) {
      history.push({ role: "assistant", content: msg.content || null, tool_calls: scavenged.map(s => ({ id: s.id, type: "function", function: { name: s.name, arguments: JSON.stringify(s.args) } })) });
      for (const s of scavenged) {
        seenCalls.set(s.name + ":" + JSON.stringify(s.args), 1);
        const pd = policyDecide(s.name, s.args);
        if (pd.decision === "deny") {
          const guide = `[系统拦截] ${pd.note}`;
          if (opts.onTool) opts.onTool(s.id, s.name, s.args);
          history.push({ role: "tool", tool_call_id: s.id, content: guide });
          if (opts.onToolEnd) opts.onToolEnd(s.id, s.name, s.args, { text: guide, isError: true });
          continue;
        }
        if (opts.onTool) opts.onTool(s.id, s.name, s.args);
        const out = await executeUnifiedTool(s.name, s.args);
        if (opts.onToolEnd) opts.onToolEnd(s.id, s.name, s.args, out);
        history.push({ role: "tool", tool_call_id: s.id, content: out.text });
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

// ══ Gateway 2.0：插件化引擎（dsh 设计沉淀——模型/工具/存储/循环全是可替换插件）══
let gateway = null;
let codeRuntime = null;
let codeMode = null;
const ENGINE_TOOL_NAMES = ["bash", "read", "write", "edit", "web_search"];
function engineCurrentModel() {
  return { id: defaultModel?.id || modelList[0]?.id || "", provider: defaultModel?.provider || modelList[0]?.provider || "", baseUrl: defaultModel?.baseUrl || modelList[0]?.baseUrl };
}
async function initEngine() {
  if (gateway) return gateway;
  // CodeRuntime 绑定：直接映射到现有工具执行链（含宪法 deny 红线）
  codeRuntime = new CodeRuntime({
    bindings: Object.fromEntries(ENGINE_TOOL_NAMES.map((n) => [n, { description: toolBindingDesc(n), args: toolBindingArgs(n), exec: async (args) => executeUnifiedTool(n, toolBindingArgsObj(n, args)) }])),
  });
  codeMode = createCodeMode({ runtime: codeRuntime });
  // Gateway：注入宿主能力（httpFetch / auth / 工具执行链 / 模型）
  gateway = await createGateway({
    httpFetch: httpJsonFetch,
    authReader: () => readJsonFile(AUTH_PATH),
    modelReader: () => readJsonFile(MODELS_PATH),
    resolveAuth: (provider) => resolveAuth(provider),
    defaultExecutor: (name, args) => executeUnifiedTool(name, args),
    getModel: engineCurrentModel,
    sessionDir: path.join(getAgentDir(), "engine-sessions"),
  });
  // 注册 run_code 工具（Code Mode 作为引擎的一个普通工具，体现插件化）
  gateway.tools.register(codeMode.runCodeToolDef());
  console.log(`[engine] Gateway 2.0 就绪：适配器=${gateway.adapter.id} 工具=${gateway.tools.names().join(",")} 存储=${gateway.store.id} 循环=${gateway.loop.id}`);
  return gateway;
}
function toolBindingDesc(name) {
  return { bash: "运行 shell 命令（Windows cmd），如 dir、node、python、git", read: "读取工作空间内文件内容", write: "写入文件（自动创建目录）", edit: "用精确文本替换修改文件（先 read 再 edit）", web_search: "联网搜索（Bing，无需 key）" }[name] || name;
}
function toolBindingArgs(name) {
  return { bash: "command", read: "path", write: "path, content", edit: "path, oldText, newText", web_search: "query" }[name] || "...";
}
function toolBindingArgsObj(name, args) {
  return { bash: { command: args?.[0] }, read: { path: args?.[0] }, write: { path: args?.[0], content: args?.[1] }, edit: { path: args?.[0], oldText: args?.[1], newText: args?.[2] }, web_search: { query: args?.[0] } }[name] || {};
}

// ══ 消息看板：pi 更新 + 能力看板 ══
const APP_VERSION = "2.5.0"; // pi-web 正式版本（每次发版 bump + 记入 CHANGELOG.md + 资源戳 v= 与 sw.js CACHE 同步）
const CAPABILITIES = [
  { icon: "💬", name: "多模型对话", desc: "deepseek / 小米 mimo / Agnes，思考 + 工具调用" },
  { icon: "🛠", name: "编程工具", desc: "读文件 / 写文件 / 编辑 / 跑命令（与 TUI 同一引擎）" },
  { icon: "🧠", name: "思考块", desc: "reasoning 思考过程内联显示" },
  { icon: "🖼", name: "媒体生成", desc: "配图 / 配音 / 视频，自动落盘到工作空间" },
  { icon: "📦", name: "工作空间", desc: "分类视图（工程/文档/生成物/交付）+ 全屏浏览 + 树状连接线" },
  { icon: "📤", name: "一键交付", desc: "智能文件交付：关键词匹配 + 类型过滤 + 去重，钉钉式文件组" },
  { icon: "📎", name: "文件传输", desc: "断点续传 / 签名下载 / 图片缩略图 / 拖放文件" },
  { icon: "🧠", name: "记忆系统", desc: "固定记忆 + 记忆日志自动沉淀 + 经验库（跨会话长期有效）" },
  { icon: "❤️", name: "情绪引擎", desc: "VAD 三维情绪感知，对话自适应语气与节奏" },
  { icon: "🧬", name: "进化系统", desc: "经验自动归纳加载，越用越懂你的习惯" },
  { icon: "📡", name: "外网分享", desc: "share_project 一键分享，稳定域名 + 自动复制目录" },
  { icon: "🔍", name: "文件搜索", desc: "search_files 按关键词/类型精准定位" },
  { icon: "🌳", name: "会话分支", desc: "分支切换、模板、项目分组、导出" },
  { icon: "🎨", name: "主题系统", desc: "霓虹主题 + 全屏壁纸 + 侧边栏透明" },
  { icon: "👤", name: "人格小语", desc: "直接、有条理、有审美、讨厌机器人味" },
];
// 更新看板缓存：GitHub API 无 token 限流 60 次/时，缓存 6h 缓解 403（限流期不再反复拉取）
const NOTICES_TTL = 6 * 3600 * 1000;
let noticesCache = null;
let noticesCacheAt = 0;
async function handleNotices(res) {
  let releases;
  const now = Date.now();
  if (noticesCache && now - noticesCacheAt < NOTICES_TTL) {
    releases = noticesCache;
  } else {
    releases = [];
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
    // 失败也缓存（空列表），限流期不反复打 GitHub
    noticesCache = releases;
    noticesCacheAt = now;
    console.log(`[pi-web] 更新看板缓存刷新（${releases.length} 条 release，缓存 ${NOTICES_TTL/3600000}h）`);
  }
  let piVersion = "?";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(CONFIG.piPackage), "..", "package.json"), "utf8"));
    piVersion = pkg.version || "?";
  } catch {}
  // pi-web 自身更新日志（CHANGELOG.md 最近 5 个版本，每个最多 6 行）
  let changelog = [];
  try {
    const cl = fs.readFileSync(path.join(__dirname, "CHANGELOG.md"), "utf8");
    const blocks = [...cl.matchAll(/##\s+\[?v?([\d.]+)\]?[^\n]*\n([\s\S]*?)(?=\n##\s|\s*$)/g)];
    changelog = blocks.slice(0, 5).map(b => ({ version: b[1], lines: b[2].trim().split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#")).slice(0, 6) }));
  } catch {}
  json(res, 200, { releases, piVersion, capabilities: CAPABILITIES, appVersion: APP_VERSION, changelog });
}

// ══ 自愈修复 ══
let repairBusy = false;

// 修复前检查点：把修复可能触碰的源码备份到 backups/repair-<ts>/，改坏可回滚（对标 /refine 的回滚能力）
const REPAIR_BACKUP_FILES = ["server.mjs", "config.mjs", "engine/workshop.mjs", "engine/memory.mjs", "engine/emotion.mjs", "engine/sanitize.mjs", "engine/filebox.mjs", "engine/browser.mjs", "engine/search-web.mjs", "public/index.html"];
function createRepairCheckpoint() {
  try {
    const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
    const dir = path.join(__dirname, "backups", "repair-" + ts);
    fs.mkdirSync(dir, { recursive: true });
    for (const rel of REPAIR_BACKUP_FILES) {
      const src = path.join(__dirname, rel);
      if (!fs.existsSync(src)) continue;
      fs.copyFileSync(src, path.join(dir, rel.replace(/[\\/]/g, "__")));
    }
    for (const sub of ["js", "css"]) {
      const srcDir = path.join(__dirname, "public", sub);
      if (!fs.existsSync(srcDir)) continue;
      const dstDir = path.join(dir, "public-" + sub);
      fs.mkdirSync(dstDir, { recursive: true });
      for (const f of fs.readdirSync(srcDir)) {
        try { fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f)); } catch {}
      }
    }
    return { dir };
  } catch (e) {
    return { error: String(e?.message || e).slice(0, 120) };
  }
}

// ══ 在线更新（git pull + 重启）══
// 检查更新：对比本地 HEAD 和远程 origin/main
// ⚠️ 代理根治：本机 git 全局/系统代理可能指向未运行的 7890（死代理）→ git 全卡死。
//    git 命令统一加 -c http.proxy= -c https.proxy= 绕过系统代理直连。
const GIT_NO_PROXY = ["-c", "http.proxy=", "-c", "https.proxy="];
async function handleUpdateCheck(res) {
  try {
    const { execFile } = await import("node:child_process");
    const run = (args) => new Promise((resolve) => {
      execFile("git", ["-C", __dirname, ...GIT_NO_PROXY, ...args], { encoding: "utf8", timeout: 20000 }, (err, stdout) => resolve({ ok: !err, out: String(stdout || "").trim() }));
    });
    const [localR, remoteR, behindR] = await Promise.all([
      run(["rev-parse", "HEAD"]),
      run(["ls-remote", "origin", "refs/heads/main"]),
      run(["rev-list", "--count", "HEAD..origin/main"]),
    ]);
    const local = localR.ok ? localR.out : "";
    const remote = remoteR.ok ? remoteR.out.split(/\s+/)[0] : "";
    const behind = behindR.ok ? parseInt(behindR.out, 10) || 0 : 0;
    // 后端 pi 引擎版本：本地 vs npm 最新（用 CONFIG.piPackage 定位引擎包）
    let engineLocal = "", engineLatest = "";
    try {
      if (CONFIG.piPackage) {
        const pkgPath = path.join(path.dirname(CONFIG.piPackage), "..", "package.json");
        if (fs.existsSync(pkgPath)) {
          const v = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
          if (v) engineLocal = String(v);
        }
      }
    } catch {}
    try {
      engineLatest = await new Promise((resolve) => {
        execFile("cmd.exe", ["/c", "npm view @earendil-works/pi-coding-agent version"], { encoding: "utf8", timeout: 20000, windowsHide: true }, (err, stdout) => resolve(err ? "" : String(stdout || "").trim()));
      });
    } catch {}
    json(res, 200, {
      ok: true,
      local: local.slice(0, 8),
      remote: remote.slice(0, 8),
      behind,
      upToDate: behind === 0,
      hasRemote: !!remote && remote !== local,
      // 引擎（后端）
      engineLocal,
      engineLatest,
      engineOutdated: !!(engineLocal && engineLatest && engineLocal !== engineLatest),
    });
  } catch (e) {
    json(res, 500, { error: String(e?.message || e).slice(0, 100) });
  }
}

// 执行更新：git fetch + pull，然后提示重启
async function handleUpdateApply(res, body) {
  try {
    const { execFile, spawn } = await import("node:child_process");
    const run = (args) => new Promise((resolve) => {
      execFile("git", ["-C", __dirname, ...GIT_NO_PROXY, ...args], { encoding: "utf8", timeout: 60000 }, (err, stdout) => resolve({ ok: !err, out: String(stdout || "").trim(), err: String(err?.message || "").slice(0, 200) }));
    });
    const msgs = [];
    // 1. 引擎升级（如需）
    if (body?.engine) {
      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm"; // Windows 上 npm 是 .cmd，execFile 直接 spawn 会 ENOENT
      const engUp = await new Promise((resolve) => {
        execFile(npmCmd, ["i", "-g", "@earendil-works/pi-coding-agent@latest"], { encoding: "utf8", timeout: 180000 }, (err, stdout) => resolve({ ok: !err, out: String(stdout || "").trim(), err: String(err?.message || "").slice(0, 200) }));
      });
      if (engUp.ok) msgs.push("引擎已升级");
      else return json(res, 500, { error: "引擎升级失败: " + engUp.err });
    }
    // 2. 前端 git 拉取（只拉不合并，避免本地改动冲突；若干净直接 pull）
    const fetchR = await run(["fetch", "origin"]);
    if (!fetchR.ok) return json(res, 500, { error: "fetch 失败: " + fetchR.err });
    const pullR = await run(["pull", "--ff-only", "origin", "main"]);
    if (!pullR.ok) {
      return json(res, 409, { error: "拉取冲突: " + pullR.err + "（本地有未提交改动，请先处理）" });
    }
    msgs.push("前端已更新");
    // 更新成功 → 后台重启服务（detached，当前进程退出由 watchdog 接管）
    const { execSync } = await import("node:child_process");
    try { execSync(`taskkill /F /PID ${process.pid}`, { windowsHide: true }); } catch {}
    json(res, 200, { ok: true, message: "更新成功（" + msgs.join(" + ") + "），服务重启中…（约 10 秒）" });
    // 延迟触发重启：由 watchdog 检测到服务挂了自动拉起新代码
    setTimeout(() => { try { process.exit(0); } catch {} }, 1500);
  } catch (e) {
    json(res, 500, { error: String(e?.message || e).slice(0, 100) });
  }
}

async function handleRepair(res, body) {
  const issue = String(body?.issue || "").trim();
  if (!issue) return json(res, 400, { error: "缺少问题描述" });
  if (repairBusy) return json(res, 409, { error: "已有修复任务进行中" });
  repairBusy = true;
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write(":\n\n");
  const write = (event, data) => { try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {} };
  try {
    // 修复前检查点：先留底，改坏可回滚（对标 /refine 的回滚能力）
    const cp = createRepairCheckpoint();
    const cpMsg = cp.error ? `⚠️ 检查点创建失败: ${cp.error}` : `修复前检查点已保存：${cp.dir}`;
    write("delta", { text: `🛡 ${cpMsg}\n` });
    const sm = SessionManager.create(CONFIG.cwd, SESSIONS_DIR);
    const agent = await createSessionAgent(sm, defaultModel);
    write("delta", { text: "🧠 正在分析代码并修复…\n" });
    const repairPrompt = [
      "你是 pi-web（D:\\pi-web）的修复工程师。用户报告了问题：",
      issue,
      "",
      "请：",
      "1. 用 read 工具检查 server.mjs / public/index.html 相关代码",
      "2. 定位并修复问题",
      "3. 用 bash 运行 node --check server.mjs 验证语法",
      "4. 完成后回复「修复完成」并简述改了什么",
      "",
      "注意：只修改 D:\\pi-web 下的文件，不要动 node_modules。",
      `修复前检查点：${cp.dir ? `已保存到 ${cp.dir}（改坏的话把该目录文件复制回 D:\\pi-web 即可回滚，也可用 git 恢复）` : "创建失败（" + (cp.error || "未知") + "），改动用 git 跟踪，改坏可用 git checkout 恢复"}`,
      "修复前先读 工程/经验库/experience.md 是否有同类踩坑，避免重复犯错；修复完成后按经验库格式沉淀本次问题的根因与解法（1-3 条，每条 3 行内），并在回复末尾注明已沉淀的经验。",
    ].join("\n");
    const reply = await agent.prompt(repairPrompt);
    write("delta", { text: "\n" + String(reply || "").slice(0, 800) + "\n" });
    write("delta", { text: `\n✅ 修复完成，重启服务中…（页面会自动恢复）\n🛡 回滚方式：${cp.error ? "检查点创建失败，请用 git 恢复" : `复制 ${cp.dir} 内文件回 D:\\pi-web`}` });
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
  const models = Array.isArray(body?.models) ? body.models.slice(0, 12) : [];
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
    const baseUrl = resolved?.baseUrl || mdef?.baseUrl || model.baseUrl;
    if (!baseUrl) return null;
    const base = (baseUrl || "").replace(/\/+$/, "");
    const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
    const messages = [...history, { role: "user", content: message }];
    const apiType = mdef?.api || "openai-completions";
    // openai-responses 类型（grok/gpt-5.6-luna 等）：用 /responses 端点，input 数组格式
    if (apiType === "openai-responses") {
      const mkResp = (u) => httpJsonFetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: model.id, input: message, max_output_tokens: Math.min(mdef?.maxTokens || 8192, 8192) }),
        timeout: 120000,
      });
      let rr = await mkResp(`${baseNoV1}/v1/responses`);
      if (rr.status === 404) rr = await mkResp(`${baseNoV1}/responses`);
      if (!rr.ok) {
        if (isAuthErrorStatus(rr.status)) markModelBlocked(model, { reason: `HTTP ${rr.status} (responses)` });
        return null;
      }
      const rd = await rr.json();
      // responses 格式：output[] 里 message 类型取 text
      const textParts = (rd.output || [])
        .filter(o => o.type === "message" && Array.isArray(o.content))
        .flatMap(o => o.content.filter(c => c.type === "output_text").map(c => c.text || ""));
      const reasoningParts = (rd.output || [])
        .filter(o => o.type === "reasoning" && Array.isArray(o.summary))
        .flatMap(o => o.summary.filter(c => c.type === "summary_text").map(c => c.text || ""));
      let text = textParts.join("").trim();
      let think = reasoningParts.join("").trim();
      if (!text && think) { text = think; think = ""; }
      return { think, text: text || null };
    }
    const mkReq = (u) => httpJsonFetch(u, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model.id, messages, stream: false, max_tokens: Math.min(mdef?.maxTokens || 8192, 8192) }),
      timeout: 120000,
    });
    let r = await mkReq(`${baseNoV1}/v1/chat/completions`);
    if (r.status === 404) r = await mkReq(`${baseNoV1}/chat/completions`);
    if (!r.ok) {
      if (isAuthErrorStatus(r.status)) markModelBlocked(model, { reason: `HTTP ${r.status} (directChat)` });
      return null;
    }
    const data = await r.json();
    const msg = data.choices?.[0]?.message || {};
    const content = msg.content || "";
    const raw = content.trim();
    let think = (msg.reasoning_content || "").trim();
    let text = raw;
    if (!text && think) {
      // 推理模型把回答全放 reasoning_content（如 opencode-go 的 deepseek 风格）——content 为空时回退
      text = think;
      think = "";
    }
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
async function generateVideo(provider, modelId, prompt, body = {}) {
  const resolved = resolveAuth(provider);
  if (!resolved) return { error: `${provider} 未配置 API Key` };
  const baseUrl = resolved.baseUrl || (readJsonFile(MODELS_PATH)[provider]?.models || []).find(m => m.id === modelId)?.baseUrl;
  const key = resolved.key;
  const base = (baseUrl || "").replace(/\/+$/, "");
  const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
  try {
    // Agnes 官方：POST /v1/videos 创建任务（旧路径 /video/generations 会 403）
    const bodyObj = { model: modelId, prompt };
    if (body?.width) bodyObj.width = +body.width;
    if (body?.height) bodyObj.height = +body.height;
    if (body?.num_frames) bodyObj.num_frames = +body.num_frames;
    if (body?.frame_rate) bodyObj.frame_rate = +body.frame_rate;
    if (body?.image) bodyObj.image = body.image;
    const createR = await httpJsonFetch(`${baseNoV1}/v1/videos`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(bodyObj), timeout: 60000,
    });
    if (!createR.ok) { const t = await createR.text().catch(() => ""); return { error: `视频任务创建失败 ${createR.status}: ${t.slice(0, 150)}` }; }
    const created = await createR.json();
    const taskId = created.task_id || created.id || created.video_id || created.data?.task_id;
    if (!taskId) return { error: "视频接口未返回任务 ID" };
    for (let i = 0; i < 36; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        // Agnes 官方：GET /agnesapi?video_id= 查询（旧路径 /videos/generations 404）
        const qR = await httpJsonFetch(`${baseNoV1}/agnesapi?video_id=${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${key}` }, timeout: 20000,
        });
        if (!qR.ok) continue;
        const q = await qR.json();
        const url = q.url || q.video_url || q.output?.url || q.data?.url || q.data?.video_url || q.metadata?.url;
        if (url) return { video: url, task_id: taskId };
        if (q.status === "failed" || q.state === "failed" || q.internal_status === "failed") return { error: "视频生成失败" };
      } catch {}
    }
    return { error: "视频生成超时（180s）", task_id: taskId };
  } catch (e) { return { error: String(e?.message || e).slice(0, 150) }; }
}

// POST /api/media —— 视频生成
async function handleMedia(res, body) {
  const { provider, modelId, prompt } = body || {};
  if (!provider || !modelId || !prompt) return json(res, 400, { error: "缺少参数" });
  const r = await generateVideo(provider, modelId, prompt, body);
  if (r.video) return json(res, 200, { video: r.video, task_id: r.task_id });
  return json(res, 500, { error: r.error || "视频生成失败" });
}

// 直调通道：绕开 pi agent，直接调接口并维护会话历史
async function handleDirectChat(res, entry, message, sessionId, writer) {
  writer = writer || createSseWriter(res);
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
    writer.push("error", { message: result?.timeout ? "模型响应超时（60s），请稍后重试" : "模型未返回内容，请稍后重试" });
    return;
  }
  const text = result.text;
  if (!text) { writer.push("error", { message: "模型未返回内容，请稍后重试" }); return; }
  try {
    entry.sm.appendMessage({ role: "user", content: [{ type: "text", text: message }] });
    entry.sm.appendMessage({ role: "assistant", content: [{ type: "text", text }] });
  } catch {}
  if (entry.agent) { try { entry.agent.dispose(); } catch {} entry.agent = null; }
  if (!entry.sm.getSessionName()) { try { entry.sm.appendSessionInfo(message.slice(0, 24)); } catch {} }
  if (result.think) { writer.push("think", { text: result.think }); writer.push("think_end", {}); }
  writer.push("delta", { text });
  const mediaResults = await mediaPromise;
  for (const mr of mediaResults) {
    if (!mr) continue;
    if (mr.url) mr.url = await saveArtifact(mr);  // 产物落盘 → 本地路径
    writer.push("media", mr);
  }
  writer.push("done", { sessionId });
  console.log(`[pi-web] 直调通道: ${defaultModel.provider}/${defaultModel.id}`);
}

// 上下文压缩 v2（借鉴 Claude Code 摘要式压缩）：历史超限时用模型生成"结构化摘要"替换旧消息
// 保留六类关键信息（Claude 同款：意图/技术概念/文件路径命令/错误修复/已完成/待办），支持定向焦点（/compact focus on X）
async function maybeCompactHistory(history, model, focus = "") {
  const total = history.reduce((n, m) => n + String(m.content || "").length, 0);
  if (history.length < 12 || total < 80000) return history;
  const keep = history.slice(-10);
  const old = history.slice(0, -10);
  const oldText = old.map(m => `${m.role}: ${typeof m.content === "string" ? m.content.slice(0, 800) : "(工具调用)"}`).join("\n");
  const focusLine = focus ? `\n压缩焦点（请特别保留与以下主题相关的信息）：${focus}` : "";
  try {
    const summary = await unifiedChat(model, `你是上下文压缩助手。以下是一段 AI 助手与用户的早期对话。请生成结构化摘要，按下列六类保留关键信息：
1. 用户请求与意图（保留具体需求）
2. 关键技术概念与决策
3. 文件/路径/命令（保留具体文件名、路径、命令）
4. 错误与修复方式
5. 已完成的关键操作
6. 待办事项与当前工作
要求：只留关键信息，总长不超过 500 字，按 1-6 编号要点输出。完整工具输出和中间推理不要保留。${focusLine}

对话记录：
${oldText.slice(0, 50000)}`, { tools: false });
    if (summary && summary.text) {
      return [{ role: "system", content: "【早前对话摘要】\n" + summary.text }, ...keep];
    }
  } catch {}
  return history;
}

// 统一通道：所有模型走 unifiedChat（对话 + 工具 + 思考 + 媒体 + 压缩 + 重试）
async function handleUnifiedChat(res, entry, message, sessionId, params, signal, writer, thinkOn, taskKey) {
  const taskId = taskKey || sessionId;
  // 修复 B：兕底通道用安全模型（opencode-go 429 标记期间避开，不撞额度墙）
  const chatModel = pickFallbackDefault();
  writer = writer || createSseWriter(res);
  touchTask(taskId, { stage: "处理中" });
  let hist = [];
  try {
    const file = entry.sm.sessionFile;
    if (file && fs.existsSync(file)) hist = extractMessages(readEntriesFromFile(file)).slice(-20);
  } catch {}
  const mediaIntents = detectMediaIntents(message);
  const mediaPromise = mediaIntents.length
    ? Promise.all(mediaIntents.map(it => generateMediaAsync(it, extractMediaPrompt(message))))
    : Promise.resolve([]);
  const onToolStart = (id, name, args) => { touchTask(taskId, { stage: "执行工具", toolName: name }); writer.push("tool", { name, args, id }); };
  const onToolEnd = (id, name, args, out) => {
    touchTask(taskId, { stage: "工具完成", toolName: name });
    const text = out?.text || "";
    writer.push("tool_end", { name, id, isError: out?.isError === true, output: text.slice(0, 2000) });
  };
  let history = [...hist.map(h => ({ role: h.role, content: h.role === "tool" ? shrinkToolResult(h.text) : h.text })), { role: "user", content: message }];
  // 外部思考调试：注入引导语 + think 工具（默认关，本次请求开启时生效）
  if (thinkOn) {
    history = [{ role: "system", content: THINK_PROMPT }, ...history];
  }
  // 注入项目规则（.pi-rules.md，借鉴 Windsurf rules），确保不挤占历史上下文
  const rules = loadProjectRules();
  if (rules.length) history = [{ role: "system", content: rules.join("\n") }, ...history];
  // dsh time-context 借鉴：每轮注入当前时间（agent 时间感知，涉及时效/定时判断不靠猜）
  try {
    const t = new Date();
    const d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
    history.unshift({ role: "system", content: `【时间上下文】当前时间：${d}（周${["日","一","二","三","四","五","六"][t.getDay()]}）。涉及时间/日期/定时/时效判断以此为准。` });
  } catch {}
  // 条件注入全量记忆/经验/日志（任务型消息才带）：人格保底用常驻索引，干活时全量
  if (shouldInjectFullMemory(message)) {
    setLastUserQuery(message); // 供记忆关键词召回检索
    const fullMem = loadMemory();
    if (fullMem.length) history = [...fullMem.map(c => ({ role: "system", content: c })), ...history];
  }
  history = await maybeCompactHistory(history, chatModel);
  // Plan 模式（unifiedChat 兕底路径）：工具定义层过滤为只读（read/web_search）——模型只能请求只读工具，无写路径
  // 注意：thinkOn=false 时 toolDefs 为 undefined（unifiedChat 内部才默认 UNIFIED_TOOLS），必须显式构建只读集，否则拦截被短路
  const isPlanLock = !!entry.planPending;
  const toolDefs = thinkOn ? [...UNIFIED_TOOLS, THINK_TOOL] : undefined;
  if (isPlanLock) {
    const base = toolDefs || UNIFIED_TOOLS;
    const locked = base.filter(t => t.function?.name === "read" || t.function?.name === "web_search");
    writer.push("note", { text: "🔒 规划模式（工具级只读）· 批准后恢复写/执行" });
    console.log(`[plan] unifiedChat 工具级只读生效 → ${locked.map(t => t.function.name).join(", ")}`);
    return await runLockedChat(locked);
  }
  async function runLockedChat(locked) {
    // history 末条已是 handleChat 改写后的规划指令消息（含需求），直接复用；只传只读工具定义
    const result = await unifiedChat(chatModel, history, { onTool: onToolStart, onToolEnd, params, signal, tools: locked });
    if (!result || result.error) {
      clearTask(taskId, "error"); writer.push("error", { message: result?.error || "模型未返回内容" }); return;
    }
    if (result.aborted || signal?.aborted) { clearTask(taskId, "aborted"); return; }
    const text = result.text;
    if (!text) { writer.push("error", { message: "模型未返回内容" }); return; }
    try { entry.sm.appendMessage({ role: "user", content: [{ type: "text", text: message }] }); entry.sm.appendMessage({ role: "assistant", content: [{ type: "text", text }] }); } catch {}
    if (entry.agent) { try { entry.agent.dispose(); } catch {} entry.agent = null; }
    if (result.think) { writer.push("think", { text: result.think }); writer.push("think_end", {}); }
    writer.push("delta", { text });
    writer.push("done", { sessionId });
    clearTask(taskId, "done");
  }
  const result = await unifiedChat(chatModel, history, { onTool: onToolStart, onToolEnd, params, signal, tools: toolDefs });
  if (!result || result.error) {
    clearTask(taskId, "error");
    writer.push("error", { message: result?.error || "模型未返回内容，请稍后重试" });
    return;
  }
  // 客户端已断开 → 不写会话、不发 SSE（避免半截结果污染会话文件）
  if (result.aborted || signal?.aborted) { clearTask(taskId, "aborted"); return; }
  if (result.aborted || signal?.aborted) return;
  let text = result.text;
  if (!text) { writer.push("error", { message: "模型未返回内容，请稍后重试" }); return; }
  // ══ NEEDS_PRO 自报升级（Reasonix P3，2026-08-19）：模型认为任务超纲 → 用 pro 模型重试一次（纯自报、无静默升级）
  const proMatch = NEEDS_PRO_RE.exec(text || "");
  if (proMatch) {
    const proModel = routeProCandidate();
    if (proModel && (proModel.provider !== chatModel.provider || proModel.id !== chatModel.id)) {
      writer.push("note", { text: `🚀 模型自报任务超纲，升级 ${proModel.provider}/${proModel.id} 重试${proMatch[1] ? `（原因：${proMatch[1].trim()}）` : ""}…` });
      const proResult = await unifiedChat(proModel, history, { onTool: onToolStart, onToolEnd, params, signal, tools: toolDefs });
      if (proResult?.text && !proResult.error) {
        const proTxt = String(proResult.text).trim();
        if (!NEEDS_PRO_RE.test(proTxt)) {
          text = proTxt;
          result.think = proResult.think || result.think;
          console.log(`[pi-web] NEEDS_PRO 升级成功: ${proModel.provider}/${proModel.id}`);
        }
      }
    }
  }
  // 输出质量守卫（2026-08-19 机制化）：兑底通道统一检测 空回复/纯思考/复读 → 自动切 fallback 重试
  const rkU = sessionId || findKeyByEntry(entry) || "new";
  const anomaly = classifyAnomaly({ sessionKey: rkU, text, think: result.think || "", sessionFile: entry.sm?.sessionFile });
  if (anomaly.type !== "none") {
    console.log(`[pi-web] 输出守卫(${anomaly.type}): ${chatModel.provider}/${chatModel.id} ${anomaly.reason} → 自动切换重试`);
    const fbModel = pickFallbackExcluding(chatModel);
    if (fbModel) {
      writer.push("note", { text: `⚠️ ${anomaly.reason}，自动切换 ${fbModel.provider}/${fbModel.id} 重试…` });
      const fb = await directChat(fbModel, message);
      if (fb?.text) {
        text = fb.text;
        recordReply(rkU, text);
      } else {
        writer.push("note", { text: "⚠️ 输出守卫触发，但备用模型也无回复（请手动切换模型或重试）" });
      }
    } else {
      writer.push("note", { text: `⚠️ ${anomaly.reason}，且无可用备用通道（全链冷却），请稍后重试或手动切换模型` });
    }
  } else {
    recordReply(rkU, text);
  }
  try {
    entry.sm.appendMessage({ role: "user", content: [{ type: "text", text: message }] });
    entry.sm.appendMessage({ role: "assistant", content: [{ type: "text", text }] });
  } catch {}
  if (entry.agent) { try { entry.agent.dispose(); } catch {} entry.agent = null; }
  if (!entry.sm.getSessionName()) { try { entry.sm.appendSessionInfo(message.slice(0, 24)); } catch {} }
  if (result.think) { writer.push("think", { text: result.think }); writer.push("think_end", {}); }
  writer.push("delta", { text });
  const mediaResults = await mediaPromise;
  for (const mr of mediaResults) {
    if (!mr) continue;
    if (mr.url) mr.url = await saveArtifact(mr);
    writer.push("media", mr);
  }
  writer.push("done", { sessionId });
  clearTask(taskId, "done");
  console.log(`[pi-web] 统一通道: ${chatModel.provider}/${chatModel.id}`);
}

// ============================================================
// Agent 活动事件环（借鉴 dsh 轨迹设计：小语在干嘛，前端实时可见）
// 内存环：保留最近 200 条，不持久化（历史仍在 session 文件）
// ============================================================
const agentEventRing = [];
const AGENT_EVENT_MAX = 200;

// ── 任务进度快照：前端息屏/断线/刷新后，可查"任务是否还在跑、跑到哪一步" ──
// 内存 Map（sessionId → 快照）；任务结束保留 60s 供前端查"刚结束"，之后自动清除
const taskProgress = new Map();
function touchTask(sessionId, patch = {}) {
  if (!sessionId) return;
  const t = taskProgress.get(sessionId) || { sessionId, status: "running", stage: "处理中", startedAt: Date.now() };
  Object.assign(t, patch, { updatedAt: Date.now() });
  taskProgress.set(sessionId, t);
}
function clearTask(sessionId, status = "done") {
  if (!sessionId) return;
  const t = taskProgress.get(sessionId);
  if (!t) return;
  t.status = status;
  t.updatedAt = Date.now();
  setTimeout(() => { taskProgress.delete(sessionId); }, 60000); // 60s 后清除，前端可查"刚结束"
}

function handleAgentEventIn(req, res, body) {
  if (!body || !body.type) return json(res, 400, { error: "bad event" });
  const ev = {
    agent: body.agent || "小语",
    type: String(body.type).replace(/^pi\//, ""),
    data: body.data || {},
    ts: body.ts || new Date().toISOString(),
  };
  agentEventRing.push(ev);
  if (agentEventRing.length > AGENT_EVENT_MAX) agentEventRing.shift();
  return json(res, 200, { ok: true });
}

function handleAgentEventOut(res) {
  return json(res, 200, { events: agentEventRing.slice(-80) });
}

async function handleChat(req, res, body) {
  let message = typeof body.message === "string" ? body.message.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  // 外部思考调试开关：请求级 body.think=true 或全局 CONFIG.externalThinking
  const thinkOn = body.think === true || isExternalThinking();
  // 记录对话开始时会话行数（基线）：交付时只提取本轮新增的文件，避免历史文件重复推
  let chatBaseline = 0;
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
  // 记录对话开始时会话行数（交付去重基线：只推本轮新增文件）
  try {
    const sf = entry.sm.sessionFile;
    if (sf && fs.existsSync(sf)) chatBaseline = fs.readFileSync(sf, "utf8").split("\n").filter(Boolean).length;
  } catch {}
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

  // /compact 手动压缩命令（Claude Code /compact 借鉴）：强制对早前历史生成结构化摘要，不消耗模型回合
  // 用法：/compact 或 /compact focus on <主题>；压缩结果写入会话（compaction 条目），返回摘要供前端展示
  const compactCmd = typeof message === "string" && message.trim().match(/^\/compact(?:\s+(?:focus\s+on\s+)?(.+))?$/i);
  if (compactCmd) {
    const compactFocus = (compactCmd[1] || "").trim();
    const sf = entry.sm.sessionFile;
    try {
      if (!sf || !fs.existsSync(sf)) return json(res, 400, { error: "会话文件不存在，无法压缩" });
      entry.busy = false;
      const r = await compactSession(sf, defaultModel, true, compactFocus);
      if (!r || r.skip) return json(res, 200, { compact: "skip", reason: r?.reason || "没有可压缩的内容（消息过少或摘要生成失败）" });
      console.log(`[pi-web] 手动 /compact 完成: focus=${compactFocus || "-"} retained=${r.retained}`);
      return json(res, 200, { compact: "done", focus: compactFocus, retained: r.retained, summary: String(r.summary || "").slice(0, 500) });
    } catch (e) {
      console.log(`[pi-web] 手动 /compact 失败: ${String(e?.message || e).slice(0, 120)}`);
      return json(res, 500, { error: "压缩失败：" + String(e?.message || e).slice(0, 120) });
    } finally {
      entry.busy = false;
    }
  }

  // Plan Mode v2（Cursor/Claude Code 借鉴，工具级硬限制）：/plan <需求> → 只读调研+输出分步计划
  // v2 用 agent.setActiveToolsByName 把工具集硬切为只读集（read/search_files）——模型目录里没有写工具，
  // 无法调用 write/edit/bash/dsh/share，结构性杜绝违规（v1 仅指令约束靠模型自觉）；accept 时恢复全量。
  // unifiedChat 兑底路径在 handleUnifiedChat 内做工具定义层过滤（见下）。
  const planCmd = typeof message === "string" && message.trim().match(/^\/plan(?:\s+(accept|cancel|execute)\b)?\s*(.*)$/i);
  if (planCmd) {
    const pAct = (planCmd[1] || "").toLowerCase();
    const pRest = (planCmd[2] || "").trim();
    const applyPlanTools = async (readonly) => {
      if (!entry.agent) return; // agent 尚未创建（新会话首条 /plan），ensureAgent 后统一应用
      try {
        const names = readonly ? PLAN_READONLY_SET : entry.agent.getAllTools().map(t => t.name);
        entry.agent.setActiveToolsByName(names);
        console.log(`[plan] ${readonly ? "工具级限制生效（只读）" : "工具集已恢复全量"} → ${names.join(", ")}`);
      } catch (e) { console.log(`[plan] 工具集设置失败: ${String(e?.message || e).slice(0, 80)}`); }
    };
    if (!pAct) {
      if (!pRest) return json(res, 400, { error: "/plan 用法：/plan <需求> 进入规划模式；/plan accept 批准执行；/plan cancel 取消" });
      entry.planPending = true;
      await applyPlanTools(true);
      message = `【规划模式】请先只读调研（你的工具已被系统限制为只读，仅能读取/搜索文件，无法修改/创建/删除任何文件、无法运行写入或测试命令），然后输出一份分步实施计划：目标 / 实施步骤 / 涉及文件 / 风险点。计划用编号列表清晰输出，最后询问用户是否批准。\n\n需求：${pRest}`;
    } else if (pAct === "accept" || pAct === "execute") {
      entry.planPending = false;
      await applyPlanTools(false);
      message = `【批准规划】用户已批准你上一步输出的计划。请现在按计划开始执行（你的工具已恢复，可以正常读写文件、运行命令）。`;
    } else {
      entry.planPending = false;
      await applyPlanTools(false);
      return json(res, 200, { plan: "cancelled" });
    }
  }

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
      await handleUnifiedChat(res, entry, message, sessionId || findKeyByEntry(entry), body.params, abortCtrl.signal, undefined, thinkOn, body.taskKey);
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
  // 前端携带模型同步（修复 C：显示与实发一致——刷新/多端时前端下拉值与服务端 modelKey 对齐）
  // ⚠️ 2026-08-19 防呆：auto/auto 是前端下拉默认显示值（未显式选择），不能覆盖用户已切过的具体会话模型
  //    ——否则用户切千问后，消息带的 stale "auto/auto" 会把 modelKey 打回 Auto → 路由乱跳（铁证：选了千问实际跑 mimo）
  if (typeof body.model === "string" && body.model.includes("/")) {
    const [bp, bm] = body.model.split("/");
    try {
      if (bp === "auto" || /^auto(-smart)?$/i.test(bm)) {
        // 仅当会话本就处于 Auto（未切过具体模型）才保持；用户显式切过具体模型 → 不动，避免覆盖
        if (entry.modelKey && entry.modelKey.provider !== "auto" && entry.modelKey.id !== "auto") {
          // 已切具体模型：忽略 stale auto，保持用户选择
        } else if (!entry.modelKey || entry.modelKey.provider !== "auto") {
          entry.modelKey = { provider: "auto", id: "auto" };
          if (sessionId) saveSessionModelKey(sessionId, entry.modelKey);
        }
      } else {
        const same = entry.modelKey && entry.modelKey.provider === bp && entry.modelKey.id === bm;
        // ⚠️ 2026-08-19 收敛：前端 stale 显示值（localStorage 残留 nvidia/deepseek）不再同步进服务端——
        //   新会话一律默认千问，用户切模型走 /api/model 显式切换，只锁当前会话
        if (!same && modelList.find(m => m.provider === bp && m.id === bm)) {
          if (bp !== "deepseek" && bp !== "nvidia") {
            entry.modelKey = { provider: bp, id: bm };
            if (sessionId) saveSessionModelKey(sessionId, entry.modelKey);
            console.log(`[pi-web] 前端同步模型 → ${bp}/${bm}`);
          } else {
            console.log(`[pi-web] 忽略前端 ${bp} 同步（残留显示值防呆）→ ${bp}/${bm}`);
          }
        }
      }
    } catch {}
  }
  // 会话级模型：切过模型则用会话的；未切（默认）→ Auto 路由（Cursor Router 简化版：按任务复杂度选 flash/pro）
  let autoRoute = null;
  const effModel = (() => {
    if (entry.modelKey && isAutoModel(entry.modelKey)) {
      autoRoute = routeForAuto(message);
      return autoRoute.model;
    }
    if (entry.modelKey) return modelList.find(m => m.provider === entry.modelKey.provider && m.id === entry.modelKey.id) || defaultModel;
    // 未设置会话模型：默认走 Auto 路由（对标 Cursor 默认 Auto；PI_AUTO_ROUTE=0 可关闭）
    autoRoute = routeForAuto(message);
    return autoRoute.model;
  })();
  entry.autoRoute = autoRoute; // 供 SSE 播报与日志
  // agent 绑定模型与本次生效模型（会话级切换 或 Auto 路由实时决策）不一致 → 重建 agent
  // ⚠️ 2026-08-19：原来只在 entry.modelKey 存在时重建，Auto 路由下 agent 仍绑创建时的 defaultModel（429 中）
  //    → 主请求失败、兕底文本回复、无思考无工具。改为与 effModel 全量对齐。
  if (entry.agent && effModel &&
      (!entry.agentModel || entry.agentModel.provider !== effModel.provider || entry.agentModel.id !== effModel.id)) {
    try { entry.agent.dispose(); } catch {}
    entry.agent = null;
    console.log(`[pi-web] 生效模型变化，重建 agent → ${effModel.provider}/${effModel.id}`);
  }
  const agent = await ensureAgent(entry, effModel);
  // Plan 模式工具级限制：agent 就绪后统一应用一次（覆盖新会话首条 /plan / 模型切换重建后的 agent）
  if (entry.planPending) {
    try {
      agent.setActiveToolsByName(PLAN_READONLY_SET);
      console.log(`[plan] 工具级限制生效（只读）→ ${PLAN_READONLY_SET.join(", ")}`);
    } catch (e) { console.log(`[plan] 工具集设置失败: ${String(e?.message || e).slice(0, 80)}`); }
  }
  // agentModel 由 ensureAgent/createSessionAgent 设置真实值，这里不覆盖
  const sm = entry.sm;
  // 两阶段引导：本次请求是否新会话首轮（首轮锚定后 promote 完整工具集）
  let bootstrapTurn = isFirstTurn(entry.sm) && process.env.PI_TWO_PHASE !== "0";
  const hbTimer = startSseHeartbeat(res); // 心跳保活（公网隧道不因 idle 断开）
  const writer = createSseWriter(res); // 背压控制：慢网络时事件排队等 drain，不丢不堆
  // Cursor Router 播报：Auto 路由决策对用户透明（取 Cursor 可用性长板，可解释）
  if (autoRoute && autoRoute.auto && effModel) {
    const routeBadge = autoRoute.level === "complex" ? "🛰️ 复杂任务" : "⚡ 日常任务";
    const routeNote = `${routeBadge} · Auto 路由 → ${effModel.id}${autoRoute.reasons?.length ? "（" + autoRoute.reasons.join("/") + "）" : ""}`;
    writer.push("note", { text: routeNote });
    console.log(`[router] ${routeNote}`);
  }
  const taskId = body.taskKey || sessionId || findKeyByEntry(entry) || "new";
  // 事件总线：任务事件同时入总线（多端订阅观看），sessionId 存在时双挂
  const busKeys = [taskId, ...(sessionId && sessionId !== taskId ? [sessionId] : [])];
  const busEmit = (type, data) => { for (const k of busKeys) busPush(k, type, data); };
  touchTask(taskId, { stage: "处理中" });
  let sawDelta = false; // 是否产生过文本输出（用于空回复兜底）
  let collected = "";   // 收集主模型输出（用于媒体路由的配图/配音内容）
  const mediaIntents = detectMediaIntents(message);
  // 并行启动全部媒体生成（不阻塞主模型文字流式）
  let mediaPromise = mediaIntents.length
    ? Promise.all(mediaIntents.map(it => generateMediaAsync(it, extractMediaPrompt(message))))
    : Promise.resolve([]);
  const unsubscribe = agent.subscribe((event) => {
    try {
      // 两阶段引导 promote：首轮产生首个文本/工具事件 → 恢复完整工具集（下个 turn 生效，零成本）
      // turn_end 兜底：首轮无论是否产生文本/工具事件（纯思考/空回复/报错），结束时也强制 promote，杜绝工具集永久残缺
      // Plan 模式例外：规划期间保持只读硬限制，不 promote（否则工具级限制被绕过）
      if (bootstrapTurn && !entry.planPending && (event.type === "message_update" || event.type === "tool_execution_start" || event.type === "turn_end")) {
        try {
          const allNames = agent.getAllTools().map(t => t.name);
          if (allNames.length) {
            agent.setActiveToolsByName(allNames);
            console.log(`[agent] 两阶段引导：首轮锚定完成，promote → 完整工具集 ${allNames.join(", ")}`);
          }
        } catch (e) { console.log(`[agent] 两阶段引导 promote 失败: ${String(e?.message || e).slice(0, 80)}`); }
        bootstrapTurn = false;
      }
      if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
        sawDelta = true;
        const delta = event.assistantMessageEvent.delta || "";
        collected += delta;
        // 过滤模型复述/泄漏的内部指令（情绪语境等），避免显示给用户
        const cleaned = delta.replace(/【内部指令·情绪语境】[\s\S]*?(?=【|\n\n|$)/, "").replace(/【当前情绪语境】[\s\S]*?(?=【|\n\n|$)/, "");
        if (cleaned) { writer.push("delta", { text: cleaned }); busEmit("delta", { text: cleaned }); }
      } else if (event.type === "message_update" && event.assistantMessageEvent?.type === "thinking_delta") {
        writer.push("think", { text: event.assistantMessageEvent.delta });
        busEmit("think", { text: event.assistantMessageEvent.delta });
      } else if (event.type === "message_update" && event.assistantMessageEvent?.type === "thinking_end") {
        writer.push("think_end", {});
        busEmit("think_end", {});
      } else if (event.type === "tool_execution_start") {
        touchTask(taskId, { stage: "执行工具", toolName: event.toolName });
        writer.push("tool", { name: event.toolName, args: event.args, id: event.toolCallId });
        busEmit("tool", { name: event.toolName, args: event.args, id: event.toolCallId });
      } else if (event.type === "tool_execution_end") {
        touchTask(taskId, { stage: "工具完成", toolName: event.toolName });
        const text = Array.isArray(event.result?.content)
          ? event.result.content.map(c => c.text || "").join("")
          : "";
        writer.push("tool_end", { name: event.toolName, id: event.toolCallId, isError: !!event.isError, output: text });
        busEmit("tool_end", { name: event.toolName, id: event.toolCallId, isError: !!event.isError, output: text });
      } else if (event.type === "turn_end") {
        writer.push("turn_end", {});
        busEmit("turn_end", {});
        // 情绪实时推送：每轮结束把最新情绪快照推给前端（emo 指示器实时跳动，不再是只发/收时更新）
        try {
          const esKey = sessionId || findKeyByEntry(entry) || "new";
          const es = emotion.getSnapshot(esKey);
          if (es) { writer.push("emotion", { state: es }); busEmit("emotion", { state: es }); }
        } catch {}
      } else if (event.type === "auto_retry_start") {
        writer.push("note", { text: `⚠️ 自动重试中（第 ${event.attempt} 次）：${event.errorMessage}` });
        busEmit("note", { text: `⚠️ 自动重试中（第 ${event.attempt} 次）：${event.errorMessage}` });
      } else if (event.type === "compaction_start") {
        writer.push("note", { text: "🧹 上下文压缩中…" });
        busEmit("note", { text: "🧹 上下文压缩中…" });
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
    // 情绪感知：更新会话情绪状态，注入行为指令（用 nextTurn 机制，不写入会话历史）
    const sessKey = sessionId || findKeyByEntry(entry) || "new";
    emotion.updateEmotion(sessKey, message);
    const emoPrompt = emotion.emotionPrompt(sessKey, message);
    // 自我认知：仅当用户问"你是谁/介绍自己"等身份问题时注入固定答案（不主动开场白）
    let promptMsg = message;
    const isIdentityAsk = /谁|介绍.*(自己|一下|你)|你是|你叫|名字|叫什么|干嘛的|干什么的|身份|自我介绍|能力/.test(message) && message.length < 80;
    if (isIdentityAsk) {
      const m = effModel || defaultModel;
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
    } else if (emoPrompt) {
      // 非身份类：情绪指令通过 nextTurn 注入（不污染会话历史）
      try {
        await entry.agent?.sendCustomMessage?.(
          { customType: "context", content: [{ type: "text", text: emoPrompt }] },
          { deliverAs: "nextTurn" }
        );
      } catch {}
    }
    // dsh time-context 借鉴：agent 管线每轮注入当前时间
    try {
      const t = new Date();
      const d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
      await entry.agent?.sendCustomMessage?.(
        { customType: "context", content: [{ type: "text", text: `【时间上下文】当前时间：${d}（周${["日","一","二","三","四","五","六"][t.getDay()]}）。涉及时间/日期/定时/时效判断以此为准。` }] },
        { deliverAs: "nextTurn" }
      );
    } catch {}
    // 条件注入全量记忆（任务型消息才带）：人格保底用常驻索引（agent 创建时已注入），干活时全量
    if (shouldInjectFullMemory(message)) {
      _lastUserQuery = String(message || "");
      try {
        const fullMem = loadMemory();
        console.log(`[tiered] 任务型注入: msg="${message.slice(0, 30)}" mem=${fullMem.length ? fullMem.reduce((a, c) => a + c.length, 0) : 0}c`);
        if (fullMem.length) {
          await entry.agent?.sendCustomMessage?.(
            { customType: "context", content: [{ type: "text", text: fullMem.join("\n\n") }] },
            { deliverAs: "nextTurn" }
          );
        }
      } catch {}
    } else {
      console.log(`[tiered] 闲聊不注入: msg="${message.slice(0, 30)}"`);
    }
    // 外部思考调试：注入 think 引导（nextTurn，不污染会话历史）
    if (thinkOn) {
      try {
        await entry.agent?.sendCustomMessage?.(
          { customType: "context", content: [{ type: "text", text: THINK_PROMPT }] },
          { deliverAs: "nextTurn" }
        );
      } catch {}
    }
    // 媒体生成与主模型并行（拿到文字即可继续推下一步，不用等全部完成）
    const mediaResults = mediaIntents.length ? await mediaPromise : [];
    // 图像兜底：当前模型不支持图片且消息带图 → 临时切套餐内图像模型识别，处理完恢复原模型
    let visionSwitched = false, origAgentModel = null, visionModel = null;
    if (images.length) {
      const curM = entry.agentModel || (defaultModel ? { provider: defaultModel.provider, id: defaultModel.id } : null);
      const curSupportsVision = curM && (modelList.find(m => m.provider === curM.provider && m.id === curM.id)?.input?.includes("image"));
      if (!curSupportsVision) {
        // 兜底优先级：⚠️ 2026-08-20 修正——原 fallbackIds（mimo-v2.5/minimax-m3/qwen3.8-max/kimi-k3/gpt-5.6-luna）全是 opencode-go 套餐模型，
        // 清单瘦身(464→22)后已不存在，第一层永远落空。改为直接候选支持 image 的免费通道：xiaomi mimo-v2.5 → 商汤 flash-lite
        // （默认主力商汤本身就支持 image，一般不会走到这里）
        visionModel = modelList.find(m => m.provider === "xiaomi-token-plan-cn" && m.input?.includes("image"))
          || modelList.find(m => m.provider === "sensenova" && m.input?.includes("image"));
        if (visionModel) {
          try {
            origAgentModel = entry.agentModel || (defaultModel ? { provider: defaultModel.provider, id: defaultModel.id } : null);
            if (entry.agent) { try { entry.agent.dispose(); } catch {} entry.agent = null; }
            entry.agentModel = { provider: visionModel.provider, id: visionModel.id };
            await ensureAgent(entry, visionModel);
            visionSwitched = true;
            console.log(`[pi-web] 图像兜底：${curM?.provider}/${curM?.id} → ${visionModel.provider}/${visionModel.id}`);
          } catch (e) {
            console.log(`[pi-web] 图像兜底切换失败: ${String(e?.message || e).slice(0, 80)}`);
          }
        }
      }
    }
    try {
      await agent.prompt(promptMsg, { images });
    } finally {
      // 处理完恢复原模型（避免把会话默认模型悄悄改掉）
      if (visionSwitched && origAgentModel) {
        try {
          if (entry.agent) { try { entry.agent.dispose(); } catch {} entry.agent = null; }
          entry.agentModel = origAgentModel;
          await ensureAgent(entry, modelList.find(m => m.provider === origAgentModel.provider && m.id === origAgentModel.id) || origAgentModel);
          console.log(`[pi-web] 图像兜底已恢复: ${origAgentModel.provider}/${origAgentModel.id}`);
        } catch (e) { console.log(`[pi-web] 图像兜底恢复失败: ${String(e?.message || e).slice(0, 80)}`); }
      }
    }
    for (const mr of mediaResults) {
      if (!mr) continue;
      if (mr.url) mr.url = await saveArtifact(mr);  // 产物落盘 → 本地路径
      writer.push("media", mr);
    }
    // 空回复兜底：agent 完成但无任何文本输出（部分推理模型偶发把回答全放 <think>）→ 直调模型接口补一次
    if (!sawDelta) {
      // 修复 B：空回复兕底用安全模型（避开 opencode-go 429 且排除当前模型，不再死磕 defaultModel）
      const fbModel = pickFallbackExcluding(effModel);
      const fallback = fbModel ? await directChat(fbModel, message) : null;
      if (fallback?.text) {
        writer.push("delta", { text: fallback.text });
        console.log(`[pi-web] 空回复兜底成功: ${fbModel.provider}/${fbModel.id}`);
      } else {
        console.log(`[pi-web] 空回复兜底失败: ${fbModel?.provider}/${fbModel?.id}`);
        // 明确提示：报用户选定的模型（兜底链模型只是替死鬼，报它会让用户莫名其妙）
        try { writer.push("error", { message: `模型 ${effModel?.provider}/${effModel?.id} 无回复（已自动尝试备用通道 ${fbModel?.provider}/${fbModel?.id} 也失败）——可能是 API Key 失效/额度不足/网络代理问题，请到模型管理检查配置` }); } catch {}
      }
    }
    // 输出质量守卫：主模型输出异常（复读/纯标记/空回复）→ 自动切 fallback 重试
    //（空回复/纯思考由 sawDelta 兜底处理；此处统一 classifyAnomaly 判定，避免双重兜底）
    const rk = sessionId || findKeyByEntry(entry) || "new";
    if (sawDelta && collected) {
      const anom = classifyAnomaly({ sessionKey: rk, text: collected, think: "", sessionFile: entry.sm?.sessionFile });
      if (anom.type === "repeat" || anom.type === "marker") {
        console.log(`[pi-web] 输出守卫(${anom.type}): ${effModel?.provider}/${effModel?.id} ${anom.reason} → 自动切换重试`);
        await retryRepeatWithFallback(message, rk, writer, busEmit, effModel);
      } else if (anom.type === "none") {
        recordReply(rk, collected);
      }
    }
    // 自动命名：尚无名称时用首条消息
    if (!entry.sm.getSessionName()) {
      try { entry.sm.appendSessionInfo(message.slice(0, 24)); } catch {}
    }
    // 文件交付：优先解析模型回复里的「📎 交付:」标记（精准交付，AI 按任务针对性选文件）
    // 解析不到才兜底扫描最近产物（兼容模型不按标记回复的情况）
    try {
      let files = extractMessageFiles(entry.sm, chatBaseline);
      // 识别用户请求的文件类型（"发图片/图/照片"→只要图；"ppt"→只要演示文件）
      const wantImg = /图片|图[片片]?|照片|画|生成图|配图/i.test(message) && !/ppt|文档|pdf/.test(message);
      const wantPpt = /ppt|pptx|演示|幻灯片/i.test(message);
      const wantDoc = /文档|docx?|pdf|word/i.test(message);
      if (!files.length) {
        // 1. 解析交付标记：读取会话最新 assistant 回复，找 📎 交付: 行
        const marked = (() => {
          try {
            const entries = readEntriesFromFile(entry.sm.sessionFile);
            // 只扫本轮新增的 assistant 回复（chatBaseline 之后）——历史交付标记不得重复触发
            for (let i = entries.length - 1; i >= Math.max(chatBaseline, 0); i--) {
              const e = entries[i];
              if (e?.type !== "message" || e?.message?.role !== "assistant") continue;
              const text = extractText(e.message.content) || "";
              const hits = [];
              // 识别多种交付表达：📎 交付: / 交付物：/ 交付文件：/ 已交付 / 生成文件：
              const pats = [
                /📎\s*交付[:：]\s*(.+)/,
                /交付物[:：]?\s*`?([^`\n，。]+\.[a-z0-9]{1,6})`?/i,
                /交付文件[:：]?\s*`?([^`\n，。]+\.[a-z0-9]{1,6})`?/i,
                /(?:已)?交付[:：]?\s*`?([^`\n，。]+\.[a-z0-9]{1,6})`?/i,
              ];
              const seenPaths = new Set();
              for (const line of text.split("\n")) {
                for (const re of pats) {
                  const m = line.match(re);
                  if (!m || !m[1]) continue;
                  let rel = m[1].trim().replace(/[`"'，。、]/g, "").trim();
                  if (!rel) continue;
                  if (seenPaths.has(rel)) continue;
                  seenPaths.add(rel);
                  const safe = wsSafePath(rel);
                  if (safe && fs.existsSync(safe)) {
                    hits.push({
                      name: path.basename(safe),
                      path: rel,
                      size: fs.statSync(safe).size,
                      mime: "",
                      mtimeMs: Date.now(),
                    });
                  }
                }
              }
              if (hits.length) return hits;
            }
            return [];
          } catch { return []; }
        })();
        // 模型有明确交付标记 → 直接用；否则按用户请求关键词+类型智能查找工作空间；再无兜底最近产物
        if (!marked.length) {
          // 用户是否明确要文件（发/给/看/发一下/要文件/找文件）——创作指令（做个/帮我写）不推文件
          const wantFile = /发(个|一下|给我|我)|发我|给我|传我|发文件|找.*文件|要文件|文件.*(发|给|看)|发.*(图片|文件|图|照片)|(?:把|将).*(发|传|给).*我/.test(message);
          if (wantFile) {
          // 从用户请求提取关键词（去掉"发/给/我/一下/的/个/看"等虚词，保留"酒店/ppt/图片"等实词）
          const kwRaw = message.replace(/[发给我你它他她们一下看个这那张张那些最最近做的的了的地得把请帮忙]/g, " ");
          const typeExts = wantImg ? [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"] : wantPpt ? [".ppt", ".pptx"] : wantDoc ? [".doc", ".docx", ".pdf", ".md", ".txt"] : null;
            const found = findWorkspaceFiles({ keyword: kwRaw, types: typeExts });
            files = found.length ? found : scanRecentArtifacts();
          }
          // 不明确要文件（创作/对话）→ 不推任何文件
        } else {
          files = marked;
        }
        // 按用户请求类型过滤（要图只给图，要 ppt 只给 ppt，避免"要图给 PPT"）
        if (files.length && (wantImg || wantPpt || wantDoc)) {
          const extOf = (n) => path.extname(n || "").toLowerCase();
          files = files.filter(f => {
            const e = extOf(f.name);
            if (wantImg) return /^\.(png|jpe?g|gif|webp|bmp|svg)$/.test(e);
            if (wantPpt) return /^\.pptx?$/.test(e);
            if (wantDoc) return /^\.(docx?|pdf|md|txt)$/.test(e);
            return true;
          });
        }
        if (files.length) {
          const sessKey = sessionId || "new";
          const pushedSet = pushedArtifacts.get(sessKey) || new Set();
          const fresh = files.filter(f => !pushedSet.has(f.path));
          // 同名去重：同名文件只保留最新一份（避免同一文件从不同目录重复交付）
          {
            const seenName = new Set();
            const deduped = [];
            for (const f of fresh.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0))) {
              if (seenName.has(f.name)) continue;
              seenName.add(f.name);
              deduped.push(f);
            }
            fresh.length = 0;
            fresh.push(...deduped);
          }
          if (fresh.length) {
            fresh.forEach(f => pushedSet.add(f.path));
            pushedArtifacts.set(sessKey, pushedSet);
            try {
              const fw = fresh.slice(0, 5).map(f => ({ type: "file", name: f.name, path: f.path, size: f.size, mime: f.mime }));
              // ⚠️ 2026-08-19 修复：不再写"（交付文件）"文本标记——模型会把它当回复模板复读（正文全空）；
              //    file 块本身前端就能识别渲染（extractFiles → m.files），无需占位文本。
              await entry.sm.appendMessage({ role: "assistant", content: fw });
            } catch {}
            files = fresh;
          } else {
            files = [];
          }
        }
      }
      for (const f of files.slice(0, 5)) writer.push("file", f);
    } catch {}
    try {
      // 图片附件：会话里 read 的图直接推给前端渲染（窗口内直接显示）
      const imgs = extractMessageImages(entry.sm);
      for (const img of imgs.slice(0, 3)) writer.push("image", img);
    } catch {}
    // 自动记忆：对话结束，把本轮重要信息沉淀到记忆日志
    try {
      const mem = await import("./engine/memory.mjs");
      const assistLatest = (() => {
        try {
          const entries = readEntriesFromFile(entry.sm.sessionFile);
          for (let i = entries.length - 1; i >= 0; i--) {
            const e = entries[i];
            if (e?.type === "message" && e?.message?.role === "assistant") {
              const t = extractText(e.message.content) || "";
              if (t.trim()) return t;
            }
          }
        } catch {}
        return "";
      })();
      mem.autoMemorize(CONFIG.cwd, { userMsg: message, assistantMsg: assistLatest });
      // 纠正记忆：用户纠正语气/做法时自动记录（防再犯）——只认明确纠正句式，排除口头语
      const correctMatch = message.match(/(?:别再|不要再|别总是|不要总是|不要这样|别这样|以后别|以后不要|记住(?:别|不要|要)|不要再用|别老用)([^，。,!！?？]{2,40})/);
      if (correctMatch) {
        const correction = String(correctMatch[1] || "").trim();
        // 排除寒暄/情绪口头语：别闹了、别客气、别急、别担心……不是纠正，不记录
        const ban = /闹|客气|急|慌|谢|担心|怕|想太多|介意|不好意思/;
        if (correction.length > 1 && !ban.test(correction) && !/再犯|纠正/.test(message)) {
          mem.saveCorrection(CONFIG.cwd, { trigger: message.slice(0, 40), correction: `不要再${correction}` });
        }
      }
      // 关系记忆：用户透露偏好/习惯时自动记录——去掉"我一直"（多引出观点陈述非偏好），排除观点句式
      const relMatch = message.match(/(?:我喜欢|我习惯|我偏好|我平时|我更爱|我偏爱)(.{2,30}?)(?:，|,|。|$)/);
      if (relMatch) {
        const detail = String(relMatch[1] || "").trim();
        // 排除观点陈述（我觉得/我认为/感觉…是想法不是偏好），避免"我一直觉得"类误抓
        const skip = /^(觉得|认为|感觉|想|希望|想要|打算)/;
        if (detail.length > 1 && !skip.test(detail)) mem.saveRelation(CONFIG.cwd, { aspect: "用户透露", detail });
      }
      // 进化快照：每 20 次对话自动存一份（可回退）
      const snapCount = mem.listSnapshots(CONFIG.cwd).length;
      if (snapCount === 0 || snapCount % 20 === 0) {
        mem.saveSnapshot(CONFIG.cwd, "auto");
      }
    } catch {}
    clearTask(taskId, "done");
    writer.push("done", { sessionId: sessionId || findKeyByEntry(entry) });
  } catch (e) {
    // 官方 agent 管线异常 → 降级到自制 unifiedChat 兑底（避免任务静默失败）
    const agentErr = String(e?.message || e);
    // 429/额度检测（修复 B）：agent 管线错误里出现 opencode-go 额度耗尽 → 标记降级，后续 Auto 路由避开
    if (/GoUsageLimit|HTTP 429|status.?429/i.test(agentErr) && modelList.some(m => m.provider === "opencode-go")) markOcGoBlocked(agentErr);
    // 健康冷却（2026-08-20 泛化）：401/402/403/529 等权限/额度错误 → 标记本次生效模型，Auto 路由后续避开
    else if (effModel) {
      const st = agentErr.match(/HTTP (\d{3})|status.?(\d{3})/);
      const code = st ? parseInt(st[1] || st[2], 10) : 0;
      if ([401, 402, 403, 529].includes(code)) markModelBlocked(effModel, { reason: `HTTP ${code} (agent管线)` });
    }
    console.log(`[pi-web] agent 通道异常，降级 unifiedChat: ${agentErr.slice(0, 120)}`);
    try { unsubscribe(); } catch {}
    try {
      // 降级前先释放 busy（unifiedChat 会重新接管），并用同代次避免竞态
      if (entry.gen === thisGen) entry.busy = false;
      const abortCtrl2 = new AbortController();
      const onClose2 = () => { try { abortCtrl2.abort(); } catch {} };
      req.on("close", onClose2);
      await handleUnifiedChat(res, entry, message, sessionId || findKeyByEntry(entry), body.params, abortCtrl2.signal, writer, undefined, body.taskKey);
      req.removeListener("close", onClose2);
    } catch (e2) {
      try { writer.push("error", { message: `降级通道也失败: ${String(e2?.message || e2)}` }); } catch {}
    }
  } finally {
    clearTask(taskId, "done"); // 兜底：任何路径结束都清快照，防残留 running
    clearInterval(hbTimer);
    try { unsubscribe(); } catch {}
    // 代次匹配才释放（快速重发时新请求已占 busy，旧请求不得干扰）
    if (entry.gen === thisGen) entry.busy = false;
    try { await writer.flush(); } catch {} // 背压：确保排队事件写完再关连接，不丢尾事件
    try { writer.close(); } catch {}
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

// GET /api/stats/providers —— 按 provider/model 聚合用量（监控各模型商消耗）
async function handleProviderStats(res) {
  const files = scanSessionFiles();
  const provMap = new Map(); // provider -> { input, output, cacheRead, cost, messages, models: Map(model -> {input,output,cost,messages}) }
  for (const file of files) {
    try {
      const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
      for (const line of lines) {
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (!e || e.type !== "message" || e.message?.role !== "assistant" || !e.message?.usage) continue;
        const prov = e.message.provider || "unknown";
        const model = e.message.model || "unknown";
        const u = e.message.usage;
        let c = u.cost;
        if (c && typeof c === "object") c = c.total || c.input || 0;
        c = typeof c === "number" ? c : 0;
        const p = provMap.get(prov) || { provider: prov, input: 0, output: 0, cacheRead: 0, cost: 0, messages: 0, models: new Map() };
        p.input += u.input || 0; p.output += u.output || 0; p.cacheRead += u.cacheRead || 0;
        p.cost += c; p.messages++;
        const mm = p.models.get(model) || { model, input: 0, output: 0, cost: 0, messages: 0 };
        mm.input += u.input || 0; mm.output += u.output || 0; mm.cost += c; mm.messages++;
        p.models.set(model, mm);
        provMap.set(prov, p);
      }
    } catch {}
  }
  const providers = [...provMap.values()]
    .map(p => ({
      provider: p.provider, input: p.input, output: p.output, cacheRead: p.cacheRead,
      cost: Math.round(p.cost * 10000) / 10000, messages: p.messages,
      models: [...p.models.values()].map(m => ({ ...m, cost: Math.round(m.cost * 10000) / 10000 })).sort((a, b) => b.cost - a.cost),
    }))
    .sort((a, b) => b.cost - a.cost);
  const totalCost = Math.round(providers.reduce((a, p) => a + p.cost, 0) * 10000) / 10000;
  json(res, 200, { providers, totalCost, updatedAt: new Date().toISOString() });
}

// 安全版会话统计：引擎 getSessionStats 遇到"无 usage 的 assistant 消息"会抛
// "Cannot read properties of undefined (reading 'input')"（官方 bug），导致 stats 接口 500。
// 这里自行聚合，跳过缺失 usage 的消息，保证任何会话都能拿到统计。
function safeSessionStats(agent) {
  let userMessages = 0, assistantMessages = 0, toolResults = 0, totalMessages = 0, toolCalls = 0;
  const usageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  const addUsage = (u) => {
    if (!u || typeof u.input !== "number" || typeof u.output !== "number") return;
    usageTotals.input += u.input || 0;
    usageTotals.output += u.output || 0;
    usageTotals.cacheRead += u.cacheRead || 0;
    usageTotals.cacheWrite += u.cacheWrite || 0;
    usageTotals.cost += typeof u.cost === "number" ? u.cost : (u.cost?.total || 0);
  };
  for (const entry of agent.sessionManager.getEntries()) {
    if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) addUsage(entry.usage);
    if (entry.type !== "message") continue;
    totalMessages++;
    const m = entry.message;
    if (m.role === "user") userMessages++;
    else if (m.role === "toolResult") { toolResults++; if (m.usage) addUsage(m.usage); }
    else if (m.role === "assistant") {
      assistantMessages++;
      if (Array.isArray(m.content)) toolCalls += m.content.filter(c => c.type === "toolCall").length;
      if (m.usage) addUsage(m.usage);
    }
  }
  let contextUsage;
  try { contextUsage = agent.getContextUsage(); } catch {}
  return {
    sessionFile: agent.sessionFile,
    sessionId: agent.sessionId,
    userMessages, assistantMessages, toolCalls, toolResults, totalMessages,
    tokens: {
      input: usageTotals.input, output: usageTotals.output,
      cacheRead: usageTotals.cacheRead, cacheWrite: usageTotals.cacheWrite,
      total: usageTotals.input + usageTotals.output + usageTotals.cacheRead + usageTotals.cacheWrite,
    },
    cost: usageTotals.cost,
    contextUsage,
  };
}

// GET /api/sessions/:id/stats —— token/成本统计
async function handleStats(res, id) {
  const entry = await openSession(id);
  if (!entry) return json(res, 404, { error: "会话不存在" });
  try {
    const stats = entry.agent ? safeSessionStats(entry.agent) : {};
    json(res, 200, { stats });
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

// GET /api/skills —— 技能列表（pi 引擎资源 + pi-web 内置技能）
const BUILTIN_SKILLS_DIR = path.join(__dirname, "skills");
function listBuiltinSkills() {
  try {
    const root = BUILTIN_SKILLS_DIR;
    if (!fs.existsSync(root)) return [];
    const out = [];
    for (const d of fs.readdirSync(root, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const skillDir = path.join(root, d.name);
      const skillFile = path.join(skillDir, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;
      let name = d.name, desc = "";
      try {
        const content = fs.readFileSync(skillFile, "utf8");
        const nameM = content.match(/^name:\s*(.+)$/m);
        const descM = content.match(/^description:\s*(.+)$/m);
        if (nameM) name = nameM[1].trim();
        if (descM) desc = descM[1].trim();
      } catch {}
      out.push({ name, description: desc, location: "package", path: skillFile });
    }
    return out;
  } catch { return []; }
}
async function handleSkills(res) {
  try {
    const agentDir = getAgentDir();
    const loader = new DefaultResourceLoader({ cwd: CONFIG.cwd, agentDir });
    await loader.reload();
    const { skills, diagnostics } = loader.getSkills();
    const merged = [...(skills || []).map(s => ({
      name: s.name,
      description: s.description || "",
      location: (() => {
        const fp = s.filePath || "";
        if (fp.includes("node_modules")) return "package";
        if (fp.includes(".agents") || fp.includes(".pi")) return "user";
        return "project";
      })(),
      path: s.filePath || "",
    })), ...listBuiltinSkills()];
    json(res, 200, {
      skills: merged,
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
  const roots = [agentDir, globalSkills, path.join(__dirname, "skills")];
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

// GET /api/sessions/:id/export?format=html|jsonl —— 导出会话（自动脱敏）
function escHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// 脱敏模块（自动擦除 API key/令牌/密码）
let sanitizeContent = null;
try {
  ({ sanitizeContent } = await import("./engine/sanitize.mjs"));
} catch {}
async function handleExport(res, id, format) {
  const found = getSessionList().find(s => s.id === id);
  if (!found || !found.file || !fs.existsSync(found.file)) return json(res, 404, { error: "会话不存在" });
  const entries = readEntriesFromFile(found.file);
  const msgs = extractMessages(entries);
  const name = (found.name || "会话").replace(/[\\/:*?"<>|]/g, "_");
  const dlName = encodeURIComponent(name);
  if (format === "jsonl") {
    // JSONL 导出：整文件过脱敏（每行逐条处理，保留结构）
    const raw = fs.readFileSync(found.file, "utf8");
    const sanitized = raw.split("\n").map(line => {
      if (!line.trim()) return line;
      try {
        const obj = JSON.parse(line);
        const walk = (o) => {
          if (!o || typeof o !== "object") return;
          for (const k of Object.keys(o)) {
            const v = o[k];
            if (typeof v === "string") o[k] = sanitizeContent ? sanitizeContent(v) : v;
            else walk(v);
          }
        };
        walk(obj);
        return JSON.stringify(obj);
      } catch { return sanitizeContent ? sanitizeContent(line) : line; }
    }).join("\n");
    res.writeHead(200, {
      "Content-Type": "application/jsonl",
      "Content-Disposition": `attachment; filename="pi-session.jsonl"; filename*=UTF-8''${dlName}.jsonl`,
    });
    res.end(sanitized);
    return;
  }
  const bodyHtml = msgs.map(m => {
    const who = m.role === "user" ? "你" : "pi";
    const text = sanitizeContent ? sanitizeContent(m.text, "html") : m.text;
    return `<div class="msg ${m.role}"><div class="who">${who}</div><div class="text">${escHtml(text)}</div></div>`;
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
  invalidateSessionCache(); // 2026-08-20 修复：重命名后会话列表立即刷新（否则缓存里还是旧名）
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
// 工作台独立页映射（workshop.mjs 导出）
// 专项工作台依赖注入：把 server.mjs 内部依赖打包给 workshop.mjs（无反向 import）
function wsCtx() {
  return { CONFIG, SESSIONS_DIR, defaultModel, createSessionAgent, SessionManager, scanRecentArtifacts, sseWrite, json, getAgentDir, DefaultResourceLoader, WS_ROOT };
}

// 情绪指示器：返回当前会话情绪快照（前端展示用）
function handleEmotion(res, url) {
  const key = url.searchParams.get("session") || "new";
  json(res, 200, emotion.getSnapshot(key));
}

// ══ 经验沉淀台（refine 提案制，Prime Agent 移植）══
// 工具：工具/refine_proposal.py（plan/list/approve --only/reject/rollback/status）
const REFINE_SCRIPT = path.join(CONFIG.cwd, "工具", "refine_proposal.py");
const REFINE_PROPOSALS = path.join(CONFIG.cwd, "工程", "经验库", "refine-proposals.json");
const REFINE_LOG = path.join(CONFIG.cwd, "工程", "经验库", "refine-log.jsonl");

function readRefineJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function runRefineScript(args, timeoutMs = 180000) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn("python", [REFINE_SCRIPT, ...args], { windowsHide: true });
    } catch (e) {
      return resolve({ code: -1, out: "", err: String(e?.message || e) });
    }
    let out = "", err = "";
    const to = setTimeout(() => { try { child.kill(); } catch {} }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => { clearTimeout(to); resolve({ code, out, err }); });
  });
}

function handleRefineStatus(res) {
  const data = readRefineJson(REFINE_PROPOSALS, { pending: [], applied: [], rejected: [] });
  let lastLog = null;
  try {
    const lines = fs.readFileSync(REFINE_LOG, "utf8").trim().split("\n").filter(Boolean);
    if (lines.length) lastLog = JSON.parse(lines[lines.length - 1]);
  } catch {}
  json(res, 200, {
    counts: { pending: data.pending?.length || 0, applied: data.applied?.length || 0, rejected: data.rejected?.length || 0 },
    lastLog,
  });
}

function handleRefineList(res) {
  const data = readRefineJson(REFINE_PROPOSALS, { pending: [], applied: [], rejected: [] });
  json(res, 200, data);
}

// ══ 基因反馈：对已应用提案打分，驱动技能基因进化 ══
const SKILL_GENE_FILE = path.join(CONFIG.cwd, "工程", "经验库", "技能基因.md");
const DOMAIN_KEYWORDS = {
  "写作": ["写作", "文案", "剧本", "小说", "分镜", "提示词"],
  "绘图": ["绘图", "出图", "画像", "海报", "配图", "插图"],
  "编程": ["编程", "代码", "脚本", "工具", "自动化", "debug"],
  "视频": ["视频", "剪辑", "flvx", "flax", "flux", "转场", "配音"],
  "网页": ["网页", "前端", "html", "css", "界面", "布局", "ui"],
  "文档": ["文档", "文档整理", "归档", "方法论", "md"],
};
function detectSkillDomain(text) {
  const s = String(text || "").toLowerCase();
  let best = null, bestHit = 0;
  for (const [domain, kws] of Object.entries(DOMAIN_KEYWORDS)) {
    const hit = kws.filter(k => s.includes(k.toLowerCase())).length;
    if (hit > bestHit) { bestHit = hit; best = domain; }
  }
  return best || "通用";
}
function handleRefineFeedback(res, body) {
  const { id, domain, scores } = body || {};
  if (!id || !scores) return json(res, 400, { error: "需要 id + scores" });
  const data = readRefineJson(REFINE_PROPOSALS, { pending: [], applied: [], rejected: [] });
  const target = (data.applied || []).find(p => p.id === id);
  if (!target) return json(res, 404, { error: "未找到已应用提案" });
  const d = domain || detectSkillDomain(target.summary + " " + JSON.stringify(target.edits || []));
  // 读取技能基因.md 并更新该领域三维评分（滑动平均 0-100%）
  try {
    let md = fs.readFileSync(SKILL_GENE_FILE, "utf8");
    const seed = { efficiency: 50, reliability: 50, adaptability: 50 }; // 默认
    const get = (line) => {
      const m = line.match(/^-\s*(效率|可靠|适应)\s+\w+\s*:\s*(\d+)%/);
      return m ? { k: m[1], v: parseInt(m[2], 10) } : null;
    };
    const update = (line, key, val) => line.replace(/(效率|可靠|适应)\s+\w+\s*:\s*\d+%/, `${key} ${key === "效率" ? "efficiency" : key === "可靠" ? "reliability" : "adaptability"}: ${val}%`);
    const lines = md.split("\n");
    let inDomain = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("## ")) inDomain = lines[i].includes(d);
      if (inDomain && get(lines[i])) {
        const { k, v } = get(lines[i]);
        const map = { "效率": "efficiency", "可靠": "reliability", "适应": "adaptability" };
        const key = map[k];
        const fb = scores[key] != null ? Number(scores[key]) : (scores[k] ?? v);
        const newVal = Math.round((v + fb) / 2); // 滑动平均
        lines[i] = update(lines[i], k, Math.max(0, Math.min(100, newVal)));
      }
    }
    fs.writeFileSync(SKILL_GENE_FILE, lines.join("\n"), "utf8");
    // 记录反馈日志
    const logLine = JSON.stringify({ ts: new Date().toISOString(), id, domain: d, scores, from: "refine-feedback" }) + "\n";
    fs.appendFileSync(REFINE_LOG, logLine);
    json(res, 200, { ok: true, domain: d, msg: `已更新「${d}」技能基因` });
  } catch (e) {
    json(res, 500, { error: "更新技能基因失败: " + (e?.message || e) });
  }
}
function handleRefineGenes(res) {
  try {
    const md = fs.readFileSync(SKILL_GENE_FILE, "utf8");
    const domains = {};
    let cur = null;
    for (const line of md.split("\n")) {
      if (line.startsWith("## ")) { cur = line.slice(3).trim(); domains[cur] = {}; continue; }
      if (cur) {
        const m = line.match(/^-\s*(效率|可靠|适应)\s+\w+\s*:\s*(\d+)%/);
        if (m) domains[cur][{ "效率": "efficiency", "可靠": "reliability", "适应": "adaptability" }[m[1]]] = parseInt(m[2], 10);
      }
    }
    json(res, 200, { domains });
  } catch (e) { json(res, 500, { error: String(e?.message || e) }); }
}

async function handleRefinePlan(res, body) {
  const args = ["plan", "--log", String(body?.log || 15)];
  if (body?.global) args.push("--global");
  if (body?.dryRun) args.push("--dry-run");
  if (body?.instructions) args.push("--instructions", String(body.instructions));
  const r = await runRefineScript(args, 240000);
  if (r.code !== 0) return json(res, 500, { error: r.err || r.out || `python exit ${r.code}` });
  const data = readRefineJson(REFINE_PROPOSALS, { pending: [], applied: [], rejected: [] });
  const latest = data.pending?.length ? data.pending[data.pending.length - 1] : null;
  json(res, 200, { ok: true, latest, count: data.pending.length, log: r.out.slice(-600) });
}

async function handleRefineApprove(res, body) {
  const args = ["approve", String(body?.id || "")];
  if (body?.only) args.push("--only", String(body.only));
  const r = await runRefineScript(args, 60000);
  if (r.code !== 0) return json(res, 500, { error: r.err || r.out || `python exit ${r.code}` });
  json(res, 200, { ok: true, log: r.out.trim() });
}

async function handleRefineReject(res, body) {
  const args = ["reject", String(body?.id || "")];
  if (body?.reason) args.push("--reason", String(body.reason));
  const r = await runRefineScript(args, 60000);
  if (r.code !== 0) return json(res, 500, { error: r.err || r.out || `python exit ${r.code}` });
  json(res, 200, { ok: true, log: r.out.trim() });
}

async function handleRefineRollback(res, body) {
  const args = ["rollback", String(body?.id || "")];
  const r = await runRefineScript(args, 60000);
  if (r.code !== 0) return json(res, 500, { error: r.err || r.out || `python exit ${r.code}` });
  json(res, 200, { ok: true, log: r.out.trim() });
}

const API_ROUTES = [
  // ── 会话 ──
  ["GET", "/api/emotion", (res, req, url) => handleEmotion(res, url)],
  // ── 人格基因 + 提案制进化 ──
  ["GET", "/api/genome", (res) => json(res, 200, emotion.getGenome())],
  ["POST", "/api/genome/propose", async (res, req) => {
    const b = await readBody(req);
    const p = emotion.proposeBaselineChange(b?.gene, b?.value, b?.reason, b?.evidence);
    if (!p) return json(res, 400, { error: "提案无效（基因不存在或变化太小）" });
    json(res, 200, { ok: true, proposal: p });
  }],
  ["POST", "/api/genome/approve", async (res, req) => {
    const b = await readBody(req);
    json(res, 200, emotion.approveProposal(b?.proposal_id, b?.reviewer || "operator"));
  }],
  ["POST", "/api/genome/reject", async (res, req) => {
    const b = await readBody(req);
    json(res, 200, emotion.rejectProposal(b?.proposal_id, b?.reviewer || "operator", b?.reason));
  }],
  ["POST", "/api/genome/rollback", async (res, req) => {
    const b = await readBody(req);
    json(res, 200, emotion.rollbackSnapshot(b?.snapshot_id));
  }],
  ["POST", "/api/genome/auto", async (res) => json(res, 200, { proposals: emotion.autoProposeFromDrift() })],
  // ── 技能基因 ──
  ["GET", "/api/skill-genes", (res) => json(res, 200, emotion.getSkillGenes())],
  ["POST", "/api/skill-genes/feedback", async (res, req) => {
    const b = await readBody(req);
    const domain = b?.domain || emotion.detectSkillDomain(b?.text || "");
    const updated = emotion.updateSkillGene(domain, { success: b?.success, efficiency: b?.efficiency, reliability: b?.reliability, adaptability: b?.adaptability });
    json(res, 200, { ok: true, domain, genes: updated });
  }],
  // ── P3 资产路由：任务 → 技能自动匹配 ──
  ["GET", "/api/skill-router", (res, req, url) => json(res, 200, { skills: emotion.routerSkill(url.searchParams.get("text") || "", 3) })],
  // ── P2 隔离子任务执行器（多 agent）──
  ["POST", "/api/subagent", async (res, req) => {
    const b = await readBody(req);
    if (!b?.task) return json(res, 400, { error: "缺 task 参数" });
    const r = await subagent.spawnSubagent({ task: b.task, context: b.context || [] });
    json(res, 200, r);
  }],
  ["GET", /^\/api\/sessions\/([^/]+)\/tree$/, (res, req, url, m) => handleSessionTree(res, decodeURIComponent(m[1]))],
  ["POST", /^\/api\/sessions\/([^/]+)\/branch$/, async (res, req, url, m) => handleSessionBranch(res, decodeURIComponent(m[1]), await readBody(req))],
  ["GET", /^\/api\/sessions\/([^/]+)\/messages$/, (res, req, url, m) => handleMessages(res, decodeURIComponent(m[1]), req, url)],
  ["GET", /^\/api\/sessions\/([^/]+)\/stream$/, (res, req, url, m) => handleSessionStream(res, req, url, m[1])],
  ["GET", /^\/api\/sessions\/([^/]+)\/stats$/, (res, req, url, m) => handleStats(res, decodeURIComponent(m[1]))],
  ["POST", /^\/api\/sessions\/([^/]+)\/compact$/, (res, req, url, m) => handleCompact(res, decodeURIComponent(m[1]))],
  ["POST", /^\/api\/sessions\/([^/]+)\/rename$/, async (res, req, url, m) => handleRename(res, decodeURIComponent(m[1]), await readBody(req))],
  ["DELETE", /^\/api\/sessions\/([^/]+)$/, async (res, req, url, m) => { await deleteSession(decodeURIComponent(m[1])); return json(res, 200, { ok: true }); }],
  ["GET", /^\/api\/sessions\/([^/]+)\/export$/, (res, req, url, m) => handleExport(res, decodeURIComponent(m[1]), url.searchParams.get("format") || "html")],
  ["GET", "/api/stats/global", (res) => handleGlobalStats(res)],
  ["GET", "/api/stats/providers", (res) => handleProviderStats(res)],
  ["GET", "/api/sessions", (res) => json(res, 200, { sessions: getSessionList() })],
  ["POST", "/api/sessions", async (res, req) => { const body = await readBody(req); const id = await createSession(body.name); return json(res, 200, { id, name: body.name || "新会话" }); }],
  // ── 工作空间 ──
  ["GET", "/api/prompts", (res) => handlePrompts(res)],
  ["GET", "/api/ws/tree", (res, req, url) => handleWsTree(res, url.searchParams.get("path") || "")],
  ["GET", "/api/ws/file", (res, req, url) => handleWsFile(res, req, url)],
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
  ["GET", "/api/update/check", (res) => handleUpdateCheck(res)],
  // 前端版本号（从 index.html 的 ?v= 提取）：供前端自动检测更新→自动刷新
  ["GET", "/api/frontend-version", async (res) => {
    try {
      const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
      let max = 0;
      for (const m of html.matchAll(/[?&]v=(\d+)/g)) max = Math.max(max, parseInt(m[1], 10));
      json(res, 200, { version: max });
    } catch { json(res, 200, { version: 0 }); }
  }],
  ["POST", "/api/update/apply", async (res, req) => handleUpdateApply(res, await readBody(req))],
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
  // ── 浏览器操作（CDP 控制 Chrome）──
  ["POST", "/api/browser/start", async (res, req) => { const b = await import("./engine/browser.mjs"); const r = await b.startChrome(); json(res, r.error ? 500 : 200, r); }],
  ["POST", "/api/browser/stop", async (res) => { const b = await import("./engine/browser.mjs"); json(res, 200, b.stopChrome()); }],
  ["POST", "/api/browser/navigate", async (res, req) => { const b = await import("./engine/browser.mjs"); const body = await readBody(req); json(res, 200, await b.navigate(String(body.url || ""))); }],
  ["POST", "/api/browser/screenshot", async (res) => { const b = await import("./engine/browser.mjs"); json(res, 200, await b.screenshot()); }],
  ["POST", "/api/browser/text", async (res) => { const b = await import("./engine/browser.mjs"); json(res, 200, await b.pageText()); }],
  ["GET", "/api/fs", (res, req, url) => handleFsList(res, url.searchParams.get("path") || ".")],
  ["GET", "/api/fs/read", (res, req, url) => handleFsRead(res, url.searchParams.get("path") || "")],
  // ── 模型 ──
  ["GET", "/api/models", (res) => handleModels(res)],
  ["GET", "/api/models/manage", (res) => handleModelsManage(res)],
  ["POST", "/api/models/add", async (res, req) => handleModelsAdd(res, await readBody(req))],
  ["GET", "/api/keys/status", (res) => handleKeysStatus(res)],
  ["GET", "/api/dsh/status", (res) => handleDshStatus(res)],
  ["POST", "/api/dsh/web/start", (res) => handleDshWebStart(res)],
  ["GET", "/api/keys/presets", (res) => handleKeysPresets(res)],
  ["POST", "/api/keys/apply", async (res, req) => handleKeysApply(res, await readBody(req))],
  ["POST", "/api/models/remove", async (res, req) => handleModelsRemove(res, await readBody(req))],
  ["POST", "/api/model", async (res, req) => handleSwitchModel(req, res, await readBody(req))],
  // ── 媒体/对话 ──
  ["POST", "/api/think", async (res, req) => handleThink(res, await readBody(req))],
  ["POST", "/api/image", async (res, req) => handleImageWithSave(res, req, await readBody(req))],
  ["POST", "/api/media", async (res, req) => handleMedia(res, await readBody(req))],
  ["GET", "/api/tasks/active", async (res, req) => {
    const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const sid = u.searchParams.get("sessionId") || "";
    const tk = u.searchParams.get("taskKey") || "";
    const key = tk || sid;
    const t = key ? taskProgress.get(key) : null;
    if (!t || t.status !== "running") return json(res, 200, { active: false, taskKey: tk || null, sessionId: sid || null });
    return json(res, 200, { active: true, taskKey: tk || null, sessionId: sid || null, stage: t.stage, toolName: t.toolName || null, startedAt: t.startedAt, updatedAt: t.updatedAt });
  }],
  ["POST", "/api/chat", async (res, req) => handleChat(req, res, await readBody(req, 12))],
  ["POST", "/api/compare", async (res, req) => handleCompare(res, await readBody(req))],
  // ── Agent 活动事件（pi 事件广播扩展 → 前端实时显示小语在干嘛）──
  ["POST", "/api/agent/events", async (res, req) => handleAgentEventIn(req, res, await readBody(req, 2))],
  ["GET", "/api/agent/events", (res) => handleAgentEventOut(res)],
  // ── Gateway 2.0 插件化引擎（dsh 设计沉淀）──
  ["GET", "/api/engine/status", async (res) => { try { json(res, 200, (await initEngine()).status()); } catch (e) { json(res, 500, { error: String(e?.message || e) }); } }],
  ["POST", "/api/engine/plugins/register", async (res, req) => {
    try {
      const def = await readBody(req, 2);
      if (!def?.id) return json(res, 400, { error: "插件需要 id" });
      const gw = await initEngine();
      const r = await gw.registerPlugin(def);
      json(res, 200, r);
    } catch (e) { json(res, 400, { error: String(e?.message || e) }); }
  }],
  ["POST", "/api/engine/plugins/unregister", async (res, req) => {
    try {
      const body = await readBody(req, 1);
      const gw = await initEngine();
      json(res, 200, { removed: await gw.unregisterPlugin(String(body?.id || "")) });
    } catch (e) { json(res, 400, { error: String(e?.message || e) }); }
  }],
  ["POST", "/api/engine/chat", async (res, req) => {
    try {
      const body = await readBody(req, 12);
      const gw = await initEngine();
      const r = await gw.chat(String(body?.message || ""), { history: body?.history || [], sessionId: body?.sessionId, model: body?.model, tools: body?.tools !== false, params: body?.params, system: body?.system });
      json(res, r.error ? 400 : 200, r);
    } catch (e) { json(res, 500, { error: String(e?.message || e) }); }
  }],
  // ── Code Mode（PTC 模式：模型写程序编排工具）──
  ["GET", "/api/code/tools", async (res) => {
    try {
      const gw = await initEngine();
      json(res, 200, { bindings: Object.entries(codeRuntime.bindings).map(([n, b]) => ({ name: n, args: b.args, description: b.description })), sdk: codeMode.buildSdkText() });
    } catch (e) { json(res, 500, { error: String(e?.message || e) }); }
  }],
  ["POST", "/api/code/run", async (res, req) => {
    try {
      const body = await readBody(req, 4);
      await initEngine();
      const r = await codeRuntime.run({ program: String(body?.program || ""), timeoutMs: body?.timeoutMs });
      json(res, r.error ? 400 : 200, r);
    } catch (e) { json(res, 500, { error: String(e?.message || e) }); }
  }],
  ["POST", "/api/code/chat", async (res, req) => {
    try {
      const body = await readBody(req, 12);
      const gw = await initEngine();
      const r = await gw.chat(String(body?.message || ""), { history: body?.history || [], tools: true, params: body?.params, system: (body?.system || "") + "\n\n你可以用 run_code 工具写程序编排多步操作。" });
      json(res, r.error ? 400 : 200, r);
    } catch (e) { json(res, 500, { error: String(e?.message || e) }); }
  }],
  ["POST", "/api/parse-file", async (res, req) => handleParseFile(res, await readBody(req, 12))],
  // ── 专项工作台 ──
  ["POST", "/api/workshop/ppt", async (res, req) => workshop.handleWorkshopPpt(wsCtx(), res, await readBody(req))],
  ["POST", "/api/workshop/novel", async (res, req) => workshop.handleWorkshopNovel(wsCtx(), res, await readBody(req))],
  // ── 经验沉淀台（refine 提案制，Prime Agent 移植）──
  ["GET", "/api/refine/status", (res) => handleRefineStatus(res)],
  ["GET", "/api/refine/list", (res) => handleRefineList(res)],
  ["GET", "/api/refine/genes", (res) => handleRefineGenes(res)],
  ["POST", "/api/refine/feedback", async (res, req) => handleRefineFeedback(res, await readBody(req))],
  ["POST", "/api/refine/plan", async (res, req) => handleRefinePlan(res, await readBody(req))],
  ["POST", "/api/refine/approve", async (res, req) => handleRefineApprove(res, await readBody(req))],
  ["POST", "/api/refine/reject", async (res, req) => handleRefineReject(res, await readBody(req))],
  ["POST", "/api/refine/rollback", async (res, req) => handleRefineRollback(res, await readBody(req))],
  // ── 时间引擎 API ──
  ["GET", "/api/time/tasks", (res) => json(res, 200, { tasks: timeEngine ? timeEngine.list() : [] })],
  ["POST", "/api/time/tasks", async (res, req) => {
    try {
      const body = await readBody(req);
      if (!timeEngine) return json(res, 500, { error: "时间引擎未初始化" });
      const r = timeEngine.register(body);
      json(res, r.error ? 400 : 200, r);
    } catch (e) { json(res, 500, { error: String(e?.message || e).slice(0, 120) }); }
  }],
  ["DELETE", "/api/time/tasks", async (res, req) => {
    const u = new URL(req.url, "http://x");
    json(res, 200, timeEngine ? timeEngine.remove(u.searchParams.get("id") || "") : { removed: false });
  }],
];

const server = http.createServer(async (req, res) => {
  // 请求级 request-id：排查并发问题时能关联同一次请求的日志（小米 4.13）
  const reqId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  res.setHeader("X-Request-Id", reqId);
  const t0 = Date.now();
  try {
    // 安全响应头（CSP 限制脚本来源，防止第三方注入执行；禁 MIME 嗅探；防 clickjacking）
    // OMEGA 页需连 OpenIM(10002/10001) 与 Gateway(9000)，connect-src/worker-src 已放行本地服务
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' ws: wss: http://127.0.0.1:10002 http://127.0.0.1:9000 ws://127.0.0.1:10001 ws://127.0.0.1:9000 https://fastly.jsdelivr.net https://cubism.live2d.com https://v1.hitokoto.cn; worker-src 'self' blob:; font-src 'self' data:; frame-ancestors 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const isStatic = (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/sw.js" || WORKSHOP_PAGES[url.pathname])) ||
                     (req.method === "GET" && url.pathname.startsWith("/static/"));
    // 签名文件链接（filebox 签名）免 token：签名本身是凭证
    let isSignedFile = false;
    try {
      if (url.pathname === "/api/ws/file" && url.searchParams.get("sig")) {
        const fb = await import("./engine/filebox.mjs");
        isSignedFile = fb.verifySigned(req).ok;
      }
    } catch {}
    if (!isStatic && !isSignedFile && !checkAuth(req)) {
      return json(res, 401, { error: "未授权，请提供访问令牌" });
    }

    // 静态资源
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/sw.js")) return handleStatic(req, res);
    if (req.method === "GET" && url.pathname.startsWith("/static/")) {
      req.url = url.pathname.replace(/^\/static/, "") + (url.search || "");
      return handleStatic(req, res);
    }

    // 工作台独立页（页面本身无敏感数据，鉴权由页面 JS 调 API 时执行；可直达 URL：/workshop /workshop/ppt 等）
    if (req.method === "GET" && WORKSHOP_PAGES[url.pathname]) {
      req.url = "/" + WORKSHOP_PAGES[url.pathname] + (url.search || "");
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
    // 启动预探测 opencode-go（修复 B）：周额度 429 时启动即标记，Auto 路由全程避开，不浪费首轮请求；8/23 额度恢复后探测通过自动回到 opencode-go 优先
    setTimeout(async () => {
      try {
        const oc = modelList.find(m => m.provider === "opencode-go" && /deepseek-v4-flash/i.test(m.id));
        const ocKey = readJsonFile(AUTH_PATH)["opencode-go"]?.key;
        if (!oc || !ocKey) return;
        const ocBase = (oc.baseUrl || "https://opencode.ai/zen/go/v1").replace(/\/+$/, "");
        const probe = await httpJsonFetch(`${ocBase}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ocKey}` },
          body: JSON.stringify({ model: oc.id, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
          timeout: 25000,
        });
        // 2026-08-20 加固：403(Access denied)/401/402/429 都标记——opencode-go 账号无资格也是不可用态，Auto 路由应全程避开（此前只认 429，403 时每次请求都撞墙）
        if ([401, 402, 403, 429].includes(probe.status) || /GoUsageLimit/i.test(await probe.text().catch(() => ""))) markOcGoBlocked(`启动预探测 HTTP ${probe.status}`);
      } catch {}
    }, 3000);
    // 记忆自维护（启动后后台执行，不阻塞）：归档过期状态节；偏好提炼走提案制不自动写（改记忆需审批）
    try {
      const a = memoryApi.archiveStateSections(CONFIG.cwd, 5);
      if (a?.archived) console.log(`[memory] 归档 ${a.archived} 个过期状态节（固定记忆瘦身）`);
      else console.log(`[memory] 固定记忆状态节 ${a?.ok ? "无需归档" : "检查失败"}`);
    } catch {}
    // 时间引擎：定时任务调度（触发时跑 unifiedChat + 结果落盘 文档/时间引擎日志.md）
    try {
      timeEngine = createTimeEngine(async (task) => {
        try {
          console.log(`[time-engine] 触发任务 ${task.id}: ${String(task.prompt).slice(0, 60)}`);
          const r = await unifiedChat(defaultModel, [{ role: "user", content: `${task.prompt}\n（这是定时任务到点自动触发，请直接执行并输出结果，不要反问）` }], { tools: false });
          const out = r?.text || r?.content || r?.error || "(无输出)";
          const logDir = path.join(CONFIG.cwd, "文档");
          try { fs.mkdirSync(logDir, { recursive: true }); } catch {}
          const logFile = path.join(logDir, "时间引擎日志.md");
          const entry = `
### ${task.firedAt} [${task.id}] ${String(task.prompt).slice(0, 40)}
> ${String(out).slice(0, 600).replace(/\n/g, "\n> ")}
`;
          try { fs.appendFileSync(logFile, entry); } catch {}
          console.log(`[time-engine] 任务 ${task.id} 完成，已记录到 ${logFile}`);
        } catch (e) {
          console.log(`[time-engine] 任务 ${task.id} 异常: ${String(e?.message || e).slice(0, 100)}`);
        }
      });
      timeEngine.start();
    } catch (e) { console.log("[time-engine] 启动失败:", String(e?.message || e).slice(0, 100)); }
    console.log(`  会话目录: ${SESSIONS_DIR}`);
    // 发现文件：写 pi 引擎 agent 目录，任何 pi 会话都能发现 pi-web（替代社区 pi-web-ui）
    try {
      const discoverDir = path.join(getAgentDir());
      fs.mkdirSync(discoverDir, { recursive: true });
      const disc = `# pi-web（小语 AI 工作台）
\n这是本机已安装的 pi Web 前端。\n\n- 访问地址: http://${CONFIG.host}:${CONFIG.port}\n- 访问令牌: ${CONFIG.token}\n- 工作目录: ${CONFIG.cwd}\n- 一键打开: 运行 \`pi-web\` 命令\n- 目录: ${__dirname}\n\n> 如果用户问 pi 的网页界面/前端/工作台在哪，告诉用户运行 \`pi-web\` 或访问上面的地址。\n`;
      fs.writeFileSync(path.join(discoverDir, "pi-web.md"), disc, "utf8");
      console.log(`  📍 已写入发现文件: ${path.join(discoverDir, "pi-web.md")}`);
    } catch (e) {
      console.log(`  ⚠️ 发现文件写入失败: ${String(e?.message || e).slice(0, 60)}`);
    }
  });
}

// ══ 订阅到期提醒：每天检查追踪文档，到期前 7 天/3 天/当天打印提醒 ══
function checkSubscriptions() {
  try {
    const f = path.join(CONFIG.cwd, "文档", "平台订阅费用追踪.md");
    if (!fs.existsSync(f)) return;
    const raw = fs.readFileSync(f, "utf8");
    const today = new Date();
    const rows = raw.split("\n").filter(l => l.includes("|") && l.includes("2026-"));
    for (const line of rows) {
      const cols = line.split("|").map(c => c.trim());
      // 只匹配表格（行首是 | 且含到期日列）；排除说明段（无到期日格式）
      if (!line.trim().startsWith("|")) continue;
      // 到期日在第 4 列（平台|key|计费|到期日|...）；余额查询日期在备注列不应匹配
      const expCell = cols[4] || "";
      const m = expCell.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (!m || expCell.includes("待确认")) continue;
      const name = cols[1].replace(/[★*()]/g, "").trim();
      const exp = new Date(+m[1], +m[2] - 1, +m[3]);
      const days = Math.ceil((exp - today) / 86400000);
      if (days === 0) console.log(`[订阅提醒] ⚠️ ${name} 今天到期！记得处理续费/退订`);
      else if (days === 3) console.log(`[订阅提醒] ⚠️ ${name} 还有 3 天到期（${m[1]}-${m[2]}-${m[3]}），如需退订请提前操作`);
      else if (days === 7) console.log(`[订阅提醒] ⚠️ ${name} 还有 7 天到期（${m[1]}-${m[2]}-${m[3]}）`);
    }
  } catch {}
}
checkSubscriptions();
setInterval(checkSubscriptions, 6 * 3600 * 1000); // 每 6 小时查一次

startServer();
