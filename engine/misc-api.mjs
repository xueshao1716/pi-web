// engine/misc-api.mjs —— 杂项 API 组（2026-08-29 #7 红线治理从 server.mjs 拆出）
// 包含：scanRecentArtifacts（产物扫描）/ prompts / sessions tree+branch / models remove /
//       search / git status+diff。工厂模式显式注入。

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

export function createMiscApi(deps) {
  const {
    json, readJsonFile, writeJsonFile,
    getAgentDir, authPath, modelsPath,
    openSession, ensureAgent, getDefaultModel,
    refreshModelList, scanSessionFiles, extractText, parseSessionFile,
    cwd, scanExclude,
  } = deps;

  // 产物扫描：只扫关键目录（根目录 + 生成物/ + 收发文件/今天 + 工程/），时间窗内 + 成品类型
  function scanRecentArtifacts(withinMs = 2 * 60 * 1000, max = 10) {
    try {
      const root = path.resolve(cwd);
      if (!fs.existsSync(root)) return [];
      const now = Date.now();
      const out = [];
      const today = new Date().toISOString().slice(0, 10);
      const scanDirs = [root, path.join(root, "生成物"), path.join(root, "收发文件", today), path.join(root, "工程")];
      const seenNames = new Set();
      const collect = (dir, recursive) => {
        let items;
        try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const it of items) {
          if (it.name.startsWith(".") || it.name.startsWith("_")) continue;
          if (scanExclude.test(dir + path.sep + it.name)) continue;
          if (it.isDirectory()) {
            if (recursive && it.name !== "node_modules") collect(path.join(dir, it.name), true);
            continue;
          }
          const full = path.join(dir, it.name);
          let st;
          try { st = fs.statSync(full); } catch { continue; }
          if (st.size <= 0 || now - st.mtimeMs >= withinMs) continue;
          const ext = path.extname(it.name).toLowerCase();
          if (!/^\.(html|htm|md|txt|js|css|json|py|png|jpg|jpeg|gif|webp|pdf|docx?|xlsx?|pptx?|mp3|wav|mp4|webm|svg|zip)$/.test(ext)) continue;
          if (seenNames.has(it.name)) continue;
          seenNames.add(it.name);
          out.push({ name: it.name, path: path.relative(root, full).replace(/\\/g, "/"), size: st.size, mime: "", mtimeMs: st.mtimeMs });
        }
      };
      for (const dir of scanDirs) collect(dir, dir === path.join(root, "工程"));
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

  // GET /api/prompts —— 提示词模板目录
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
    const isMsg = (n) => n.entry?.type === "message" && ["user", "assistant"].includes(n.entry?.message?.role);
    const simplify = (node, depth = 0, budget = { n: 0 }) => {
      budget.n++;
      if (depth > 8 || budget.n > 400) return null;
      const children = (node.children || [])
        .map((c) => simplify(c, depth + 1, budget))
        .filter(Boolean)
        .slice(0, 30);
      if (!isMsg(node)) {
        if (!children.length) return null;
        return { id: node.entry.id, type: node.entry.type, children };
      }
      const content = node.entry.message?.content || [];
      const text = (content.filter((b) => b.type === "text").map((b) => b.text || "").join("") || node.entry.message?.text || "").slice(0, 50);
      return { id: node.entry.id, role: node.entry.message.role, text, ts: node.entry.timestamp, children };
    };
    json(res, 200, { tree: roots.map((s) => simplify(s)).filter(Boolean), leafId });
  }

  // POST /api/sessions/:id/branch {entryId} —— 从某条消息分叉
  async function handleSessionBranch(res, id, body) {
    const entry = await openSession(id);
    if (!entry) return json(res, 404, { error: "会话不存在" });
    const entryId = body?.entryId;
    if (!entryId) return json(res, 400, { error: "缺少 entryId" });
    try {
      entry.sm.branch(entryId);
      if (entry.agent) { try { entry.agent.dispose(); } catch {} entry.agent = null; }
      await ensureAgent(entry, getDefaultModel());
      json(res, 200, { ok: true, leafId: entry.sm.getLeafId() });
    } catch (e) {
      json(res, 500, { error: String(e?.message || e).slice(0, 150) });
    }
  }

  // POST /api/models/remove —— 删除自定义 provider
  async function handleModelsRemove(res, body) {
    const { provider } = body || {};
    if (!provider) return json(res, 400, { error: "缺少 provider" });
    const auth = readJsonFile(authPath); delete auth[provider]; writeJsonFile(authPath, auth);
    const store = readJsonFile(modelsPath); delete store[provider]; writeJsonFile(modelsPath, store);
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

  // Git 集成
  function runGit(args) {
    return new Promise((resolve) => {
      execFile("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 8000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
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

  return {
    scanRecentArtifacts, handlePrompts, handleSessionTree, handleSessionBranch,
    handleModelsRemove, handleSearch, runGit, handleGitStatus, handleGitDiff,
  };
}
