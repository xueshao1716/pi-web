// engine/stats-api.mjs —— 统计/技能/导出/重命名（2026-08-20 从 server.mjs 拆出）
// 依赖：json(http-utils)、scanSessionFiles/parseSessionFile/getSessionList/readEntriesFromFile/invalidateSessionCache(session-files)、extractMessages(session-utils)
import fs from "node:fs";
import path from "node:path";
import { json } from "./http-utils.mjs";
import { scanSessionFiles, parseSessionFile, getSessionList, readEntriesFromFile, invalidateSessionCache } from "./session-files.mjs";
import { extractMessages } from "./session-utils.mjs";

let _getAgentDir = () => "", _cwd = "", _DefaultResourceLoader = null;
export function initStatsApi({ getAgentDir = null, cwd = "", DefaultResourceLoader = null } = {}) {
  if (getAgentDir) _getAgentDir = getAgentDir; _cwd = cwd; _DefaultResourceLoader = DefaultResourceLoader;
}

export async function handleGlobalStats(res) {
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
export async function handleProviderStats(res) {
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
export function safeSessionStats(agent) {
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
export async function handleStats(res, id) {
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
export async function handleCompact(res, id) {
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
const BUILTIN_SKILLS_DIR = path.join(import.meta.dirname, "skills");
export function listBuiltinSkills() {
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
export async function handleSkills(res) {
  try {
    const agentDir = _getAgentDir();
    const loader = new _DefaultResourceLoader({ cwd: _cwd, agentDir });
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
export async function handleSkillRead(res, p) {
  const agentDir = _getAgentDir();
  const globalSkills = path.join(os.homedir(), ".agents", "skills");
  const roots = [agentDir, globalSkills, path.join(import.meta.dirname, "skills")];
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
export async function handleParseFile(res, body) {
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
export function escHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// 脱敏模块（自动擦除 API key/令牌/密码）
let sanitizeContent = null;
try {
  ({ sanitizeContent } = await import("./sanitize.mjs"));
} catch {}
export async function handleExport(res, id, format) {
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
export function resolveFsPath(p) {
  const root = path.resolve(CONFIG.cwd);
  const target = path.resolve(root, p || ".");
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

export async function handleFsList(res, p) {
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

export async function handleFsRead(res, p) {
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
export async function handleRename(res, id, body) {
  const entry = await openSession(id);
  if (!entry) return json(res, 404, { error: "会话不存在" });
  const name = String(body.name || "").slice(0, 60) || "新会话";
  try { entry.sm.appendSessionInfo(name); } catch {}
  invalidateSessionCache(); // 2026-08-20 修复：重命名后会话列表立即刷新（否则缓存里还是旧名）
  json(res, 200, { ok: true, name });
}
