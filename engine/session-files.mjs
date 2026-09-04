// engine/session-files.mjs —— 会话文件层（2026-08-20 从 server.mjs 拆出）
// 职责：会话文件扫描/解析/列表缓存/消息提取。纯文件操作 + 缓存，不依赖 HTTP/模型。
// 外部依赖通过 initSessionFiles 注入（与 engine/model-router.mjs 的 init 模式一致）：
//   sessionsDir  = SESSIONS_DIR（当前工作区会话目录）
//   workspaceCwd = CONFIG.cwd（用于列表 group 判定：workspace vs terminal）
import fs from "node:fs";
import path from "node:path";
import { extractText, extractImages, extractFiles } from "./session-utils.mjs";
import { classifySessionGroup } from "./session-groups.mjs";

let _sessionsDir = "";
let _workspaceCwd = "";

export function initSessionFiles({ sessionsDir = "", workspaceCwd = "" } = {}) {
  _sessionsDir = sessionsDir;
  _workspaceCwd = workspaceCwd;
}

// ── 会话文件扫描（pi 会话格式 jsonl，跨所有 cwd 目录）──────────────
// 2026-08-20 恢复全目录扫描 + 前端按 group 分组：工作区会话一组，pi 终端会话（小语）单独一组
export function scanSessionFiles() {
  const out = [];
  try {
    const root = _sessionsDir ? path.dirname(_sessionsDir) : "";
    if (!root) return out;
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

export function parseSessionFile(file) {
  const info = { id: null, createdAt: null, updatedAt: null, name: null, preview: "", messageCount: 0, file, cwd: null, group: null };
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
      if (e.type === "session_info") {
        if (e.name) info.name = e.name;
        if (e.group) info.group = e.group;
      }
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
  return info;
}

// ── 会话解析缓存（2026-08-19 索引优化）──
const fileCache = new Map(); // file -> { info, mtimeMs, size }
export function parseSessionFileCached(file) {
  try {
    const st = fs.statSync(file);
    const hit = fileCache.get(file);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.info;
    const info = parseSessionFile(file);
    fileCache.set(file, { info, mtimeMs: st.mtimeMs, size: st.size });
    if (fileCache.size > 512) {
      let oldest = null;
      for (const [k, v] of fileCache) if (!oldest || v.mtimeMs < oldest.v.mtimeMs) oldest = { k, ...v };
      if (oldest) fileCache.delete(oldest.k);
    }
    return info;
  } catch {
    fileCache.delete(file);
    return parseSessionFile(file);
  }
}

function listSessions() {
  const files = scanSessionFiles();
  return files.map(parseSessionFileCached)
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
      group: classifySessionGroup({
        name: s.name || s.preview || "",
        cwd: s.cwd,
        group: s.group,
        workspaceCwd: _workspaceCwd,
      }),
    }));
}

// ── 会话列表缓存（避免每次请求全量扫描+解析所有 JSONL，会话多时性能瓶颈）──
let sessionListCache = null;
export function getSessionList() {
  if (!sessionListCache) sessionListCache = listSessions();
  return sessionListCache;
}
export function invalidateSessionCache() { sessionListCache = null; }

// 轻量读取会话文件 entries（只解析 JSONL 首部信息）
export function readEntriesFromFile(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// 从会话最新 assistant 消息提取文件附件（供 SSE 实时推送）
export function extractMessageFiles(sm, baselineLines = 0) {
  try {
    const file = sm.sessionFile;
    if (!file || !fs.existsSync(file)) return [];
    const entries = readEntriesFromFile(file);
    // 只提取本次对话开始之后（baselineLines 之后）新增的 assistant 消息中的 file 块
    // 避免历史文件每次对话都被重新捞出来推送
    for (let i = entries.length - 1; i >= baselineLines; i--) {
      const e = entries[i];
      if (e?.type !== "message" || e?.message?.role !== "assistant") continue;
      const c = e.message.content;
      const files = extractFiles(c);
      if (files.length) return files;
    }
    return [];
  } catch { return []; }
}

// 从会话最新 assistant 消息提取图片附件（供 SSE 实时推送）
export function extractMessageImages(sm) {
  try {
    const file = sm.sessionFile;
    if (!file || !fs.existsSync(file)) return [];
    const entries = readEntriesFromFile(file);
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e?.type !== "message" || e?.message?.role !== "assistant") continue;
      const images = extractImages(e.message.content);
      if (images.length) return images;
    }
    return [];
  } catch { return []; }
}
