// engine/workspace-api.mjs —— 工作空间：产物落盘 + 文件服务（2026-08-20 从 server.mjs 拆出）
// 依赖注入：initWorkspaceApi({ wsRoot })；json/readBody 来自 http-utils，safeJoin 来自 tools/security
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { json } from "./http-utils.mjs";
import { safeJoin } from "./tools/security.mjs";
import { httpBufferFetch } from "./http.mjs";

let _wsRoot = "";
export function initWorkspaceApi({ wsRoot = "" } = {}) {
  _wsRoot = wsRoot;
  // ⚠️ 2026-08-22 修复：必须在 init 时赋值——原"WS_ROOT = _wsRoot || WS_ROOT"写在模块顶层，
  // 导入时 _wsRoot 还是空串且之后不再更新 → WS_ROOT 恒为 "" → 所有 ws 接口"路径越权"。
  // ESM live binding：这里赋值后，所有 import { WS_ROOT } 的模块同步拿到新值。
  WS_ROOT = wsRoot || WS_ROOT;
}
// 工作空间根（= 会话 cwd，统一反斜杠）；let 导出供外部读引用
export let WS_ROOT = "";

// 智能文件查找：按关键词 + 类型匹配工作空间文件（供交付时精准定位）
// 关键词来自用户请求（如"酒店的ppt"→关键词"酒店"+类型 ppt）；无关键词则按最近/成品优先
const WS_SKIP_DIRS = new Set(["node_modules", ".git", ".thumbs", "backups", ".cache", "temp", "tmp", "__pycache__", ".venv"]);
export function findWorkspaceFiles({ keyword = "", types = null, max = 8, maxDepth = 4 } = {}) {
  try {
    const root = WS_ROOT;
    if (!fs.existsSync(root)) return [];
    const out = [];
    const kw = String(keyword || "").toLowerCase().replace(/[的得了]/g, "");
    // 宽泛词（图片/项目/文档/文件等）命中率太高，不作为匹配关键词——只匹配具体词
    const WEAK_KW = new Set(["图片", "项目", "文档", "文件", "照片", "画", "图", "ppt", "网页", "网站", "配图", "截图", "原图"]);
    const walk = (dir, depth) => {
      if (depth > maxDepth || out.length >= max * 3) return;
      let items;
      try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const it of items) {
        if (it.name.startsWith(".") || it.name.startsWith("_")) continue;
        if (WS_SKIP_DIRS.has(it.name)) continue;
        const full = path.join(dir, it.name);
        if (it.isDirectory()) { walk(full, depth + 1); continue; }
        const ext = path.extname(it.name).toLowerCase();
        if (types && !types.includes(ext)) continue;
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        const rel = path.relative(root, full).replace(/\\/g, "/");
        // 关键词匹配：文件名或路径含关键词（多个关键词任一命中）
        const nameLower = it.name.toLowerCase();
        let score = 0;
        if (kw) {
          const kws = kw.split(/[\s、，,]+/).filter(Boolean);
          for (const k of kws) {
            if (!k || WEAK_KW.has(k)) continue; // 跳过宽泛词
            if (k && (nameLower.includes(k) || rel.toLowerCase().includes(k))) score += 2;
          }
          if (score === 0 && kws.some(k => k && !WEAK_KW.has(k))) continue; // 有具体词但没命中 → 跳过
        }
        out.push({ name: it.name, path: rel, size: st.size, mime: "", mtimeMs: st.mtimeMs, score });
      }
    };
    walk(root, 0);
    // 排序：关键词命中优先 > 成品类型优先 > 最近修改
    const prio = (n) => {
      const e = path.extname(n).toLowerCase();
      if (/^\.(html?|md|pdf|png|jpe?g|gif|webp)$/.test(e)) return 0;
      if (/^\.(pptx?|docx?|zip|mp4|svg|json)$/.test(e)) return 1;
      if (/^\.(js|css|py|txt)$/.test(e)) return 2;
      return 3;
    };
    return out.sort((a, b) => (b.score || 0) - (a.score || 0) || prio(a.name) - prio(b.name) || (b.mtimeMs || 0) - (a.mtimeMs || 0)).slice(0, max);
  } catch { return []; }
}
// 路径安全原语已抽到 engine/tools/security.mjs；此处保留同名薄封装，15+ 调用点零改动
export function wsSafePath(p) {
  return safeJoin(WS_ROOT, p);
}
// 媒体产物落盘：远程 URL 下载 / data URL 保存 → 返回本地可访问路径
export async function saveArtifact(artifact) {
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
      // P0 安全修复：SSRF 防护——禁止下载内网/回环地址
      try {
        const u = new URL(artifact.url);
        const host = u.hostname;
        if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "0.0.0.0"
            || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])/.test(host)
            || host.endsWith(".local") || host.endsWith(".internal")) {
          console.log(`[saveArtifact] SSRF 拦截: ${artifact.url}`);
          return artifact.url;
        }
      } catch { return artifact.url; }
      // 原生 fetch 下载（自动系统代理、二进制安全；替代 python urlretrieve）
      const r = await httpBufferFetch(artifact.url, { timeout: 60000 });
      if (!r.ok) throw new Error(`下载失败 HTTP ${r.status}`);
      const buf = r.buffer();
      // 响应体大小限制：50MB（防 OOM）
      if (buf.length > 50 * 1024 * 1024) throw new Error(`下载内容超过 50MB 限制`);
      fs.writeFileSync(file, buf);
    } else {
      return artifact.url;
    }
    console.log(`[pi-web] 产物已落盘: ${file}`);
    // 用签名 URL（免鉴权，24h 有效）——img 标签可直接加载，无需带 token
    try {
      const fb = await import("./filebox.mjs");
      const rel = path.relative(WS_ROOT, file);
      return fb.signedUrl(rel);
    } catch {
      return `/api/ws/file?path=${encodeURIComponent(file)}`;
    }
  } catch (e) {
    console.log(`[pi-web] 落盘失败: ${String(e?.message || e).slice(0, 60)}`);
    return artifact.url;
  }
}

// GET /api/ws/tree —— 工作空间目录树
export async function handleWsTree(res, reqPath) {
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

// GET /api/ws/file —— 提供文件（图片/音频/视频/文本；?download=1 强制下载）
export async function handleWsFile(res, req, url) {
  // 优先：签名 URL（path+exp+sig，安全防篡改、可过期，不依赖内存映射）
  const fb = await import("./filebox.mjs");
  let target = null;
  if (url?.searchParams.get("sig")) {
    const v = fb.verifySigned(req);
    if (v.ok) target = wsSafePath(v.rel);
    else return json(res, 403, { error: v.reason || "无权访问" });
  } else if (url?.searchParams.get("path")) {
    // 兼容旧链接（直接 path，需带 token 鉴权）
    target = wsSafePath(url.searchParams.get("path") || "");
  }
  if (!target || !fs.existsSync(target)) return json(res, 404, { error: "文件不存在" });
  const safe = target;
  const ext = path.extname(safe).toLowerCase();
  const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".webm": "video/webm", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json" }[ext] || "application/octet-stream";
  const headers = { "Content-Type": mime, "Cache-Control": "no-cache" };
  if (url?.searchParams.get("download") === "1") {
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(safe))}`;
  }
  // 断点续传支持（HTTP Range，借鉴 file-transfer-go）：大文件中断后可从断点续传
  const stat = fs.statSync(safe);
  const total = stat.size;
  const range = req.headers?.range || "";
  const m = range.match(/bytes=(\d+)-(\d*)/);
  if (m) {
    let start = parseInt(m[1], 10);
    let end = m[2] ? parseInt(m[2], 10) : total - 1;
    if (isNaN(start) || start >= total) {
      res.writeHead(416, { "Content-Range": `bytes */${total}` });
      res.end();
      return;
    }
    if (end >= total) end = total - 1;
    headers["Content-Range"] = `bytes ${start}-${end}/${total}`;
    headers["Accept-Ranges"] = "bytes";
    headers["Content-Length"] = end - start + 1;
    res.writeHead(206, headers);
    fs.createReadStream(safe, { start, end }).pipe(res);
    return;
  }
  headers["Accept-Ranges"] = "bytes";
  headers["Content-Length"] = total;
  res.writeHead(200, headers);
  fs.createReadStream(safe).pipe(res);
}

// GET /api/ws/read —— 读文本文件内容
export async function handleWsRead(res, reqPath) {
  const safe = wsSafePath(reqPath);
  if (!safe || !fs.existsSync(safe) || fs.statSync(safe).isDirectory()) return json(res, 404, { error: "文件不存在" });
  try {
    const content = fs.readFileSync(safe, "utf8");
    json(res, 200, { content, name: path.basename(safe), path: reqPath });
  } catch { json(res, 500, { error: "读取失败（可能非文本）" }); }
}

// POST /api/ws/write —— 写文件
export async function handleWsWrite(res, body) {
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
// 兼容两种目录结构：<type>/<date>/<file> 与 <type>/<file>（实际工作空间大多为后者）
export async function handleWsArtifacts(res) {
  const out = [];
  const genDir = path.join(WS_ROOT, "生成物");
  const push = (fp, type, date) => {
    try {
      if (!fs.statSync(fp).isFile()) return;
      out.push({
        name: path.basename(fp), type, date,
        path: path.relative(WS_ROOT, fp).replace(/\\/g, "/"),
        size: fs.statSync(fp).size,
        url: `/api/ws/file?path=${encodeURIComponent(fp)}`,
      });
    } catch {}
  };
  try {
    for (const type of fs.readdirSync(genDir)) {
      const typePath = path.join(genDir, type);
      let typeStat;
      try { typeStat = fs.statSync(typePath); } catch { continue; }
      if (!typeStat.isDirectory()) continue;
      for (const entry of fs.readdirSync(typePath)) {
        const entryPath = path.join(typePath, entry);
        let es;
        try { es = fs.statSync(entryPath); } catch { continue; }
        if (es.isDirectory()) {
          // 三层：<type>/<date>/<file>
          for (const f of fs.readdirSync(entryPath)) push(path.join(entryPath, f), type, entry);
        } else {
          // 两层：<type>/<file>（date 取文件修改日期）
          push(entryPath, type, es.mtime.toISOString().slice(0, 10));
        }
      }
    }
  } catch {}
  out.sort((a, b) => b.date.localeCompare(a.date));
  json(res, 200, { artifacts: out.slice(0, 500) });
}

// ══ 成品交付 ══
export function wsNextVersion(name) {
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
export function wsCopyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const it of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, it.name), d = path.join(dst, it.name);
    if (it.isDirectory()) wsCopyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
// POST /api/ws/deliver —— 一键交付：复制源到 交付目录（name-vN）
export async function handleWsDeliver(res, body) {
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
export async function handleWsPackage(res, body) {
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
export async function handleWsDeliveries(res) {
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
export async function handleWsRename(res, body) {
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
export async function handleWsDelete(res, body) {
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
export async function handleWsSearch(res, q) {
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
export async function handleWsProjectCreate(res, body) {
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
export async function handleWsConvert(res, body) {
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
