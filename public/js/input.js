// ===== input.js（从 app.js 拆分，全局作用域，保持原逻辑不变）=====
// ══ @ 文件引用（Cursor 风格）══
const pendingFiles = [];   // {path, content}
const pendingImages = [];  // {data, mimeType, name}
let fpNavStack = [];
function openFilePicker() {
  $("file-picker").hidden = false;
  $("slash-menu").hidden = true;
  fpNavStack = [];
  loadFsDir(".");
}
function closeFilePicker() { $("file-picker").hidden = true; }

async function loadFsDir(p) {
  try {
    const data = await api("/api/fs?path=" + encodeURIComponent(p));
    $("fp-path").textContent = data.current || ".";
    const list = $("fp-list");
    list.innerHTML = "";
    if (!data.items.length) { list.innerHTML = '<div class="fp-empty">空目录</div>'; return; }
    for (const it of data.items) {
      const el = document.createElement("div");
      el.className = "fp-item";
      el.innerHTML = `<span class="fi-ico">${it.type === "dir" ? "📁" : "📄"}</span><span class="fi-name">${esc(it.name)}</span><span class="fi-path">${it.type === "dir" ? "" : esc(it.path)}</span>`;
      el.addEventListener("click", () => {
        if (it.type === "dir") { fpNavStack.push(p); loadFsDir(it.path); }
        else pickFile(it);
      });
      list.appendChild(el);
    }
  } catch (e) { toast("加载目录失败: " + e.message); }
}

async function pickFile(item) {
  try {
    const data = await api("/api/fs/read?path=" + encodeURIComponent(item.path));
    if (pendingFiles.length >= 10) return toast("最多引用 10 个文件");
    pendingFiles.push({ path: item.path, content: data.content });
    stripAt();
    renderChips();
    closeFilePicker();
    $("input").focus();
  } catch (e) { toast("读取文件失败: " + e.message); }
}

function renderChips() {
  const box = $("chips");
  const total = pendingFiles.length + pendingImages.length;
  box.hidden = !total;
  box.innerHTML = "";
  pendingFiles.forEach((f, i) => {
    const c = document.createElement("span");
    c.className = "chip";
    const name = f.path.split("/").pop();
    const prefix = f.path.startsWith("#技能") ? "#" : "@";
    c.innerHTML = `${prefix}${esc(name)}<span class="c-del">×</span>`;
    c.querySelector(".c-del").addEventListener("click", () => {
      pendingFiles.splice(i, 1);
      renderChips();
    });
    box.appendChild(c);
  });
  pendingImages.forEach((im, i) => {
    const c = document.createElement("span");
    c.className = "chip";
    c.title = im.name;
    c.innerHTML = `<img class="thumb" src="data:${im.mimeType};base64,${im.data}" alt=""><span class="c-del">×</span>`;
    c.querySelector(".c-del").addEventListener("click", () => {
      pendingImages.splice(i, 1);
      renderChips();
    });
    box.appendChild(c);
  });
}
function stripAt() {
  const t = $("input");
  t.value = t.value.replace(/@[^\s@]*$/, "");
}
$("fp-up").addEventListener("click", () => {
  if (fpNavStack.length) loadFsDir(fpNavStack.pop());
  else loadFsDir(".");
});

// ══ 斜杠命令（Claude Code 风格）══
const SLASH_COMMANDS = [
  { cmd: "/new", desc: "新建会话" },
  { cmd: "/compact", desc: "压缩上下文（省 token）" },
  { cmd: "/stats", desc: "查看 token / 成本统计" },
  { cmd: "/model", desc: "切换模型" },
  { cmd: "/clear", desc: "清空当前视图" },
  { cmd: "/help", desc: "显示所有命令" },
];

// ══ 自定义斜杠命令（提示词模板，localStorage）══
let customSlash = [];
try { customSlash = JSON.parse(localStorage.getItem("pi_custom_slash") || "[]") || []; } catch {}
function saveCustomSlash() {
  try { localStorage.setItem("pi_custom_slash", JSON.stringify(customSlash)); } catch {}
}
function insertCustomSlash(cmd) {
  const c = customSlash.find(x => x.cmd === cmd);
  if (!c) return;
  const input = $("input");
  const stripped = input.value.replace(/\/\S*$/, "");
  input.value = (stripped.trim() ? stripped.trim() + "\n" : "") + (c.prompt || "");
  autoGrow();
  input.focus();
}
function openSlashManage() {
  renderSlashList();
  $("slash-manage-modal").classList.add("show");
}
function renderSlashList() {
  const box = $("sm-list");
  box.innerHTML = "";
  if (!customSlash.length) { box.innerHTML = '<div class="sm-empty">暂无自定义命令，用下面的表单添加一个</div>'; return; }
  customSlash.forEach((c, i) => {
    const el = document.createElement("div");
    el.className = "sm-item";
    el.innerHTML = `<span class="sm-cmd">${esc(c.cmd)}</span><span class="sm-desc">${esc(c.desc || "")}</span><button class="sm-del" title="删除">✕</button>`;
    el.querySelector(".sm-del").addEventListener("click", () => {
      customSlash.splice(i, 1);
      saveCustomSlash();
      renderSlashList();
      toast("已删除 " + c.cmd);
    });
    box.appendChild(el);
  });
}
$("sm-save").addEventListener("click", () => {
  let cmd = $("sm-cmd").value.trim().replace(/^\/+/, "");
  const desc = $("sm-desc").value.trim();
  const prompt = $("sm-prompt").value.trim();
  if (!cmd || !prompt) return toast("命令名和提示词不能为空");
  cmd = "/" + cmd;
  customSlash = customSlash.filter(x => x.cmd !== cmd);
  // 上限保护：最多 50 条自定义命令，超出提示（防 localStorage 被撑满）
  if (customSlash.length >= 50) return toast("⚠️ 最多 50 条自定义命令，请先删除部分");
  customSlash.push({ cmd, desc, prompt });
  saveCustomSlash();
  $("sm-cmd").value = ""; $("sm-desc").value = ""; $("sm-prompt").value = "";
  renderSlashList();
  toast(`已添加命令 ${cmd}`);
});
$("sm-close").addEventListener("click", () => $("slash-manage-modal").classList.remove("show"));
$("slash-manage-modal").addEventListener("click", (e) => { if (e.target === $("slash-manage-modal")) $("slash-manage-modal").classList.remove("show"); });

function showSlashMenu() {
  const box = $("slash-menu");
  box.hidden = false;
  box.innerHTML = "";
  for (const c of SLASH_COMMANDS) {
    const el = document.createElement("div");
    el.className = "slash-item";
    el.innerHTML = `<span class="sl-cmd">${c.cmd}</span><span class="sl-desc">${c.desc}</span>`;
    el.addEventListener("click", () => { closeSlashMenu(); runSlash(c.cmd); });
    box.appendChild(el);
  }
  if (customSlash.length) {
    const sep = document.createElement("div");
    sep.className = "sl-sep";
    sep.textContent = "自定义";
    box.appendChild(sep);
    for (const c of customSlash) {
      const el = document.createElement("div");
      el.className = "slash-item";
      el.innerHTML = `<span class="sl-cmd">${esc(c.cmd)}</span><span class="sl-desc">${esc(c.desc || "自定义命令")}</span>`;
      el.addEventListener("click", () => { closeSlashMenu(); insertCustomSlash(c.cmd); });
      box.appendChild(el);
    }
  }
  // 提示词模板（/模板名 由 agent 自动展开）
  api("/api/prompts").then(({ prompts }) => {
    if (!prompts || !prompts.length) return;
    const head = document.createElement("div");
    head.className = "fp-head";
    head.innerHTML = `<span class="fp-title">📋 模板</span>`;
    box.appendChild(head);
    for (const p of prompts) {
      const el = document.createElement("div");
      el.className = "slash-item";
      el.innerHTML = `<span class="sl-cmd">/${p.name}</span><span class="sl-desc">${esc(p.description)}</span>`;
      el.addEventListener("click", () => {
        closeSlashMenu();
        $("input").value = "/" + p.name + " ";
        autoGrow();
        updateSendBtn();
        $("input").focus();
      });
      box.appendChild(el);
    }
  }).catch(() => {});
  const mgr = document.createElement("div");
  mgr.className = "slash-item";
  mgr.innerHTML = `<span class="sl-cmd" style="color:var(--dim)">＋ 管理命令…</span><span class="sl-desc"></span>`;
  mgr.addEventListener("click", () => { closeSlashMenu(); openSlashManage(); });
  box.appendChild(mgr);
}
function closeSlashMenu() { $("slash-menu").hidden = true; }
async function runSlash(cmd) {
  const input = $("input");
  if (customSlash.some(c => c.cmd === cmd)) { insertCustomSlash(cmd); return; }
  input.value = ""; autoGrow();
  switch (cmd) {
    case "/new": newSession(); break;
    case "/compact":
      if (!currentId) return toast("当前无会话");
      try {
        await api(`/api/sessions/${encodeURIComponent(currentId)}/compact`, { method: "POST" });
        toast("✓ 上下文已压缩");
      } catch (e) { toast("压缩失败: " + e.message); }
      break;
    case "/stats": openStats(); break;
    case "/model": $("model-select").focus(); break;
    case "/clear": clearMessages(); break;
    case "/help": toast("命令: " + SLASH_COMMANDS.map(c => c.cmd).join(" ")); break;
  }
}

// ══ 会话统计 ══
function fmtNum(n) {
  if (n == null) return "-";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}
async function openStats() {
  if (!currentId) return toast("当前无会话");
  try {
    const { stats } = await api(`/api/sessions/${encodeURIComponent(currentId)}/stats`);
    const t = stats.tokens || {};
    const cu = stats.contextUsage || {};
    $("stats-body").innerHTML = `
      <div class="stat-row"><span>消息数</span><b>${stats.totalMessages ?? "-"}</b></div>
      <div class="stat-row"><span>输入 tokens</span><b>${fmtNum(t.input)}</b></div>
      <div class="stat-row"><span>输出 tokens</span><b>${fmtNum(t.output)}</b></div>
      <div class="stat-row"><span>缓存读 / 写</span><b>${fmtNum(t.cacheRead)} / ${fmtNum(t.cacheWrite)}</b></div>
      <div class="stat-row"><span>总成本</span><b>$${(stats.cost || 0).toFixed(4)}</b></div>
      <div class="stat-row"><span>上下文占用</span><b>${fmtNum(cu.tokens)} / ${fmtNum(cu.contextWindow)}${cu.percent != null ? ` (${cu.percent}%)` : ""}</b></div>
      <div class="stat-row"><span>工具调用</span><b>${stats.toolCalls ?? "-"}</b></div>
    `;
    $("stats-modal").classList.add("show");
  } catch (e) { toast("统计获取失败: " + e.message); }
}
$("stats-close").addEventListener("click", () => $("stats-modal").classList.remove("show"));
$("stats-modal").addEventListener("click", (e) => { if (e.target === $("stats-modal")) $("stats-modal").classList.remove("show"); });

// ══ 全局用量看板（所有会话）══
async function openGlobalStats() {
  $("gstats-modal").classList.add("show");
  const body = $("gstats-body");
  body.textContent = "加载中…";
  try {
    const { sessions, totals } = await api("/api/stats/global");
    if (!sessions.length) { body.innerHTML = '<div class="gs-empty">暂无会话用量数据</div>'; return; }
    body.innerHTML = `
      <div class="gs-totals">
        <div class="gs-total"><div class="gt-num">$${totals.cost.toFixed(4)}</div><div class="gt-label">总成本</div></div>
        <div class="gs-total"><div class="gt-num">${fmtNum(totals.input + totals.output)}</div><div class="gt-label">总 Tokens</div></div>
        <div class="gs-total"><div class="gt-num">${fmtNum(totals.input)}</div><div class="gt-label">输入</div></div>
        <div class="gs-total"><div class="gt-num">${fmtNum(totals.output)}</div><div class="gt-label">输出</div></div>
      </div>
      <table class="gs-table">
        <tr><th>会话</th><th>输入</th><th>输出</th><th>缓存读</th><th>成本</th></tr>
        ${sessions.map(s => `<tr><td class="gs-name"><a data-sid="${esc(s.id)}">${esc(s.name)}</a></td><td>${fmtNum(s.tokens.input)}</td><td>${fmtNum(s.tokens.output)}</td><td>${fmtNum(s.tokens.cacheRead)}</td><td>$${s.tokens.cost.toFixed(4)}</td></tr>`).join("")}
      </table>`;
    body.querySelectorAll(".gs-name a").forEach(a => {
      a.addEventListener("click", async () => {
        $("gstats-modal").classList.remove("show");
        await refreshSessions();
        await selectSession(a.dataset.sid);
      });
    });
  } catch (e) {
    body.innerHTML = `<div class="gs-empty">加载失败: ${esc(e.message)}</div>`;
  }
}
$("gstats-close").addEventListener("click", () => $("gstats-modal").classList.remove("show"));
$("gstats-modal").addEventListener("click", (e) => { if (e.target === $("gstats-modal")) $("gstats-modal").classList.remove("show"); });

// ══ 上下文占用提醒（>80% 建议压缩）══
async function checkCompactHint() {
  if (!currentId) return;
  try {
    const key = "pi_compact_hint_" + currentId;
    if (localStorage.getItem(key)) return;
    const { stats } = await api(`/api/sessions/${encodeURIComponent(currentId)}/stats`);
    const cu = stats.contextUsage || {};
    if (cu.percent != null && cu.percent >= 80) {
      $("compact-msg").textContent = `上下文已用 ${cu.percent}% · 建议压缩以节省 token`;
      $("compact-banner").hidden = false;
    }
  } catch {}
}
$("compact-now").addEventListener("click", async () => {
  if (!currentId) return;
  try {
    await api(`/api/sessions/${encodeURIComponent(currentId)}/compact`, { method: "POST" });
    $("compact-banner").hidden = true;
    if (currentId) localStorage.setItem("pi_compact_hint_" + currentId, "1");
    toast("✓ 上下文已压缩");
  } catch (e) { toast("压缩失败: " + e.message); }
});
$("compact-dismiss").addEventListener("click", () => {
  $("compact-banner").hidden = true;
  if (currentId) localStorage.setItem("pi_compact_hint_" + currentId, "1");
});

// ══ 导出会话 ══
$("mm-export").addEventListener("click", async () => {
  $("more-menu").hidden = true;
  if (!currentId) return toast("当前无会话");
  // token 不走 URL（避免进浏览器历史/服务器日志/referrer），改用请求头，fetch 后 Blob 下载
  try {
    const res = await fetch(apiUrl(`/api/sessions/${encodeURIComponent(currentId)}/export?format=html`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "session.html";
    a.click();
    URL.revokeObjectURL(url);
    toast("已导出会话");
  } catch (e) {
    toast("导出失败: " + (e?.message || e));
  }
});

// ══ 事件绑定 ══
// 外部思考调试开关（🧠）：默认关，localStorage 记忆；开启后请求带 think:true
window.externalThinkingOn = localStorage.getItem("pi-exthink") === "1";
function refreshExThinkBtn() {
  const b = $("btn-exthink");
  if (!b) return;
  b.style.opacity = window.externalThinkingOn ? "1" : "0.45";
  b.style.boxShadow = window.externalThinkingOn ? "0 0 0 1.5px var(--accent)" : "none";
  b.title = window.externalThinkingOn ? "🧠 外部思考已开启（推理草稿可见）" : "🧠 外部思考调试：让模型把推理草稿写出来（当前关）";
}
$("btn-exthink")?.addEventListener("click", () => {
  window.externalThinkingOn = !window.externalThinkingOn;
  localStorage.setItem("pi-exthink", window.externalThinkingOn ? "1" : "0");
  refreshExThinkBtn();
  toast(window.externalThinkingOn ? "🧠 外部思考已开启：模型推理草稿将可见" : "🧠 外部思考已关闭");
});
refreshExThinkBtn();
$("send").addEventListener("click", () => {
  // 输入框有内容 → 发送（会话生成中会自动打断）；输入框空 → 停止当前生成
  if ($("input").value.trim()) { send(); return; }
  const c = controllers.get(currentKey());
  if (c) c.abort();
});
$("new-session").addEventListener("click", newSession);
$("dd-file").addEventListener("click", (e) => {
  e.stopPropagation();
  $("attach-drop-menu").hidden = true;
  // 展开菜单：⬆ 上传本地文件 / 📁 浏览工作目录（两个选项都保留）
  const m = $("attach-menu");
  m.hidden = !m.hidden;
  closeFilePicker();
  closeSlashMenu();
});
$("att-browse").addEventListener("click", () => {
  $("attach-menu").hidden = true;
  openFilePicker();
  $("input").focus();
});
$("att-upload").addEventListener("click", () => {
  $("attach-menu").hidden = true;
  $("local-file").click();
});
// 上传本地文件（支持文本 + Word/Excel/PPT）
const IMG_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/bmp"];
const TEXT_EXTS = new Set(["txt", "md", "js", "ts", "jsx", "tsx", "py", "json", "xml", "html", "css", "scss", "yml", "yaml", "csv", "log", "sh", "bat", "cmd", "ini", "conf", "toml", "sql", "go", "rs", "c", "cpp", "h", "java", "php", "rb", "vue", "svelte"]);
const OFFICE_EXTS = new Set(["docx", "xlsx", "pptx"]);
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
$("local-file").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!files.length) return;
  await handleLocalFiles(files);
});

// ══ 本地文件统一处理：图片→视觉附件、Office→解析文本、文本→引用、其他→上传保存 ══
// （提取自原 change 回调，供「选择文件」与「拖放文件」共用）
async function handleLocalFiles(files) {
  let added = 0, skipped = 0, transferred = 0;
  const sessionId = window.currentId || null;
  for (const f of files.slice(0, 10)) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    try {
      // 1. 任意文件都上传保存（会话 file 消息，界面可下载）
      if (f.size <= 20 * 1024 * 1024) {
        const b64 = await fileToBase64(f);
        const up = await api("/api/files/upload", { method: "POST", body: { name: f.name, data: b64, mime: f.type, sessionId } });
        if (up?.ok) {
          transferred++;
          // 若上传时无当前会话，自动挂到返回的会话并同步前端（保证界面显示卡片）
          if (up.sessionId && !window.currentId) {
            window.currentId = up.sessionId;
            refreshSessions();
          }
          refreshMessages();
        }
        else { skipped++; toast(`「${f.name}」上传失败`); continue; }
      } else { skipped++; toast(`「${f.name}」超 20MB 已跳过`); continue; }
      // 2. 文本/Office：额外读内容给 agent 引用；图片：额外进视觉附件
      let text = null;
      if (IMG_TYPES.includes(f.type)) {
        if (pendingImages.length < 3 && f.size <= 2 * 1024 * 1024) {
          const b64 = await fileToBase64(f);
          pendingImages.push({ data: b64, mimeType: f.type, name: f.name });
          added++;
        }
        continue;
      }
      if (OFFICE_EXTS.has(ext)) {
        if (f.size > 5 * 1024 * 1024) { continue; }
        const b64 = await fileToBase64(f);
        const r = await api("/api/parse-file", { method: "POST", body: { name: f.name, base64: b64 } });
        text = r.text || "";
      } else if (TEXT_EXTS.has(ext)) {
        if (f.size > 200 * 1024) { continue; }
        text = await f.text();
      }
      if (text) { pendingFiles.push({ path: f.name, content: text }); added++; }
    } catch (err) {
      skipped++;
      toast(`「${f.name}」处理失败: ${String(err.message || err).slice(0, 40)}`);
    }
  }
  renderChips();
  $("input").focus();
  if (transferred) toast(`📎 已传输 ${transferred} 个文件` + (added ? `，${added} 个已引用给 agent` : "") + (skipped ? `，跳过 ${skipped}` : ""));
  else if (added) toast(`已引用 ${added} 个文件` + (skipped ? `，跳过 ${skipped} 个` : ""));
  else if (skipped) toast(`跳过 ${skipped} 个文件`);
}

// ══ 拖放文件到窗口：松开即引用（复用 handleLocalFiles）+ 遮罩反馈 ══
(function initDragDrop() {
  const overlay = document.createElement("div");
  overlay.className = "drag-overlay";
  overlay.innerHTML = "📎 松开以引用文件";
  document.body.appendChild(overlay);
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    overlay.classList.add("show");
  });
  window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay.classList.remove("show");
  });
  window.addEventListener("drop", async (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    depth = 0;
    overlay.classList.remove("show");
    await handleLocalFiles([...e.dataTransfer.files]);
  });
})();
$("dd-cmd").addEventListener("click", () => { $("attach-drop-menu").hidden = true; showSlashMenu(); $("input").focus(); });

// ══ 输入框模型选择器（快速切换当前会话模型）══
function showInputModelMenu() {
  const menu = $("think-menu");
  menu.innerHTML = "";
  // 菜单跟随模型按钮定位（按钮在输入区右侧）
  const btn = $("input-model");
  const shell = btn.closest(".input-shell");
  if (shell && btn) {
    const menuW = Math.min(320, shell.clientWidth - 40);
    menu.style.minWidth = "280px";
    menu.style.left = Math.max(0, Math.min(btn.offsetLeft, shell.clientWidth - menuW - 4)) + "px";
    menu.style.right = "auto";
  }
  if (!modelList.length) {
    const e = document.createElement("div");
    e.className = "fp-empty"; e.textContent = "暂无可用模型，先在模型管理中添加";
    menu.appendChild(e); return;
  }
  // 顶部入口：多模型对比
  const cmp = document.createElement("div");
  cmp.className = "think-item";
  cmp.style.cssText = "border-bottom:1px solid var(--border);color:var(--accent);font-weight:600";
  cmp.innerHTML = `<span>⛓ 多模型对比</span>`;
  cmp.addEventListener("click", openCompareMenu);
  menu.appendChild(cmp);
  const groups = {};
  for (const m of modelList) (groups[m.provider] = groups[m.provider] || []).push(m);
  for (const [prov, ms] of Object.entries(groups)) {
    const head = document.createElement("div");
    head.className = "fp-head";
    head.innerHTML = `<span class="fp-title">${esc(prov)}</span>`;
    menu.appendChild(head);
    for (const m of ms) {
      const el = document.createElement("div");
      el.className = "think-item";
      const cur = `${m.provider}/${m.id}` === $("model-select").value;
      el.innerHTML = `<span>${cur ? "✓ " : ""}${esc(m.name || m.id)}</span><span class="tk-provider">${m.provider}</span>${m.reasoning ? `<span class="tk-badge">推理</span>` : ""}`;
      el.addEventListener("click", () => {
        $("think-menu").hidden = true;
        switchModel(m.provider, m.id);
      });
      menu.appendChild(el);
    }
  }
  menu.hidden = false;
}

// ══ 多模型对比（借鉴 Open WebUI：同一问题同时问多个模型，结果并排展示）══
let compareSel = new Set();
function openCompareMenu() {
  $("think-menu").hidden = true;
  const box = $("compare-list");
  box.innerHTML = "";
  compareSel = new Set();
  const groups = {};
  for (const m of modelList) (groups[m.provider] = groups[m.provider] || []).push(m);
  for (const [prov, ms] of Object.entries(groups)) {
    const head = document.createElement("div");
    head.className = "fp-head";
    head.innerHTML = `<span class="fp-title">${esc(prov)}</span>`;
    box.appendChild(head);
    for (const m of ms) {
      const el = document.createElement("div");
      el.className = "think-item";
      el.innerHTML = `<span class="ck">☐</span><span>${esc(m.name || m.id)}</span><span class="tk-provider">${m.reasoning ? "推理" : ""}</span>`;
      el.addEventListener("click", () => {
        const k = `${m.provider}/${m.id}`;
        if (compareSel.has(k)) { compareSel.delete(k); el.querySelector(".ck").textContent = "☐"; }
        else {
          if (compareSel.size >= 4) return toast("最多同时对比 4 个模型");
          compareSel.add(k); el.querySelector(".ck").textContent = "☑";
        }
      });
      box.appendChild(el);
    }
  }
  $("compare-menu").hidden = false;
}
$("compare-cancel").addEventListener("click", () => { $("compare-menu").hidden = true; });
$("compare-go").addEventListener("click", async () => {
  const text = $("input").value.trim();
  if (!text) return toast("先输入要对比的问题");
  if (compareSel.size < 2) return toast("至少选 2 个模型");
  $("compare-menu").hidden = true;
  // 渲染对比结果卡片
  const models = [...compareSel].map(k => { const [provider, id] = k.split("/"); return { provider, id }; });
  addUserMsg(text);
  const box = $("messages");
  const wrap = document.createElement("div");
  wrap.className = "compare-wrap";
  wrap.innerHTML = `<div class="compare-head">⛓ 多模型对比 · <span class="compare-q">${esc(text.slice(0, 40))}</span></div><div class="compare-grid"></div>`;
  box.appendChild(wrap);
  const grid = wrap.querySelector(".compare-grid");
  for (const m of models) {
    const card = document.createElement("div");
    card.className = "compare-card";
    card.innerHTML = `<div class="cc-head">${esc(m.provider)}/<span style="color:var(--accent)">${esc(m.id)}</span><span class="cc-status">…</span></div><div class="cc-body">思考中…</div>`;
    grid.appendChild(card);
  }
  autoScroll();
  try {
    setStatus("多模型对比中…", "busy");
    const data = await api("/api/compare", { method: "POST", body: { message: text, models }, timeoutMs: 300000 });
    const cards = grid.querySelectorAll(".compare-card");
    data.results.forEach((r, i) => {
      const card = cards[i];
      if (!card) return;
      card.querySelector(".cc-status").textContent = r.error ? "❌" : `⏱${((r.ms || 0) / 1000).toFixed(1)}s`;
      const body = card.querySelector(".cc-body");
      if (r.error) { body.textContent = "错误: " + r.error; body.style.color = "var(--red)"; }
      else { body.innerHTML = md(r.text || "（无回复）"); bindCopyButtons(card); highlightBlocks(card); }
    });
    toast("对比完成");
  } catch (e) {
    grid.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">对比失败: ${esc(e.message)}</div>`;
  } finally {
    setStatus("就绪");
    autoScroll();
  }
});
$("input-model").addEventListener("click", (e) => {
  e.stopPropagation();
  if ($("think-menu").hidden) showInputModelMenu();
  else $("think-menu").hidden = true;
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".think-menu") && !e.target.closest("#input-model")) $("think-menu").hidden = true;
});

$("w-new").addEventListener("click", newSession);
// 欢迎屏按钮：点击直接向输入框插入触发符并聚焦（复用 input 事件链打开对应菜单）
function welcomeAt() {
  const t = $("input");
  t.value = (t.value ? t.value + " " : "") + "@";
  t.focus(); t.setSelectionRange(t.value.length, t.value.length);
  openFilePicker();
}
function welcomeSlash() {
  const t = $("input");
  t.value = "/";
  t.focus(); t.setSelectionRange(1, 1);
  showSlashMenu();
}
$("w-file").addEventListener("click", welcomeAt);
$("w-cmd").addEventListener("click", welcomeSlash);
$("logout").addEventListener("click", () => { localStorage.removeItem("pi_web_token"); location.reload(); });
$("status").addEventListener("click", openStats);
$("status").style.cursor = "pointer";
$("status").title = "点击查看会话统计";
updateSendBtn(); // 初始化发送按钮状态

// ══ 手机端侧边栏抽屉 ══
const isMobile = () => window.innerWidth <= 768;
function openSidebar() {
  $("sidebar").classList.add("open");
  $("side-backdrop").classList.add("show");
}
function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("side-backdrop").classList.remove("show");
}
// 桌面侧边栏折叠（记忆）
if (localStorage.getItem("pi_web_sidebar_collapsed") === "1") document.body.classList.add("sidebar-collapsed");
$("menu-btn").addEventListener("click", () => {
  if (isMobile()) {
    $("sidebar").classList.contains("open") ? closeSidebar() : openSidebar();
  } else {
    document.body.classList.toggle("sidebar-collapsed");
    localStorage.setItem("pi_web_sidebar_collapsed", document.body.classList.contains("sidebar-collapsed") ? "1" : "0");
  }
});
$("side-backdrop").addEventListener("click", closeSidebar);
window.addEventListener("resize", () => { if (!isMobile()) closeSidebar(); });
$("session-name").addEventListener("click", async () => {
  if (!currentId) return;
  const name = await appPrompt("重命名会话：", $("session-name").textContent, "重命名");
  if (name === false) return;
  try {
    await api(`/api/sessions/${encodeURIComponent(currentId)}/rename`, { method: "POST", body: { name } });
    $("session-name").textContent = name;
    await refreshSessions();
  } catch (e) { toast("重命名失败: " + e.message); }
});
const autoGrow = () => {
  const t = $("input");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 180) + "px";
};
$("input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const v = $("input").value.trim();
    if (v.startsWith("/") && !v.includes(" ")) { runSlash(v); return; }
    send();
  }
  if (e.key === "Escape") { closeFilePicker(); closeSlashMenu(); closeSkillMenu(); }
  // ↑/↓：输入历史导航（光标不在首行/末尾时交还给浏览器）
  if (e.key === "ArrowUp" && !e.shiftKey) {
    const t = $("input");
    const firstNl = t.value.indexOf("\n");
    if (firstNl !== -1 && t.selectionStart > firstNl) return;
    e.preventDefault();
    if (histIdx === -1 && t.value.trim()) { inputHistory.push(t.value); histIdx = inputHistory.length - 1; }
    if (histIdx > 0) { histIdx--; t.value = inputHistory[histIdx]; autoGrow(); }
  }
  if (e.key === "ArrowDown" && !e.shiftKey) {
    const t = $("input");
    if (t.selectionStart < t.value.length) return;
    e.preventDefault();
    if (histIdx >= 0 && histIdx < inputHistory.length - 1) { histIdx++; t.value = inputHistory[histIdx]; autoGrow(); }
    else if (histIdx === inputHistory.length - 1) { histIdx = -1; t.value = ""; autoGrow(); }
  }
});
$("input").addEventListener("input", (e) => {
  updateSendBtn();
  const v = e.target.value;
  const at = v.match(/@([^\s@]*)$/);
  const hash = v.match(/#([^\s#]*)$/);
  if (at && (at.index === 0 || /\s/.test(v[at.index - 1]))) { closeSlashMenu(); closeSkillMenu(); openFilePicker(); }
  else if (hash && (hash.index === 0 || /\s/.test(v[hash.index - 1]))) { closeFilePicker(); closeSlashMenu(); showSkillMenu(hash[1]); }
  else if (v.startsWith("/") && !v.includes(" ")) { closeFilePicker(); closeSkillMenu(); showSlashMenu(); }
  else { closeFilePicker(); closeSlashMenu(); closeSkillMenu(); }
  autoGrow();
});
$("input").addEventListener("blur", () => {
  // 点击输入区内的按钮（📎文件/⚡命令）时焦点移入按钮，不关闭弹层
  setTimeout(() => {
    const active = document.activeElement;
    if (active && active.closest && active.closest(".input-shell")) return;
    closeFilePicker();
    closeSlashMenu();
    closeSkillMenu();
  }, 150);
});

// ══ 模型参数面板（借鉴 Open WebUI：temp/top_p 可调）══
// 会话级存储，随请求传给 server；默认 temp=0.7 top_p=0.95
window.piParams = window.piParams || null;
const pm = $("params-menu");
function loadParams() {
  try { const v = JSON.parse(localStorage.getItem("pi_params") || "null"); if (v) window.piParams = v; } catch {}
  if (window.piParams) {
    $("pm-temp").value = window.piParams.temperature ?? 0.7;
    $("pm-topp").value = window.piParams.top_p ?? 0.95;
    $("pm-temp-val").textContent = Number($("pm-temp").value).toFixed(1);
    $("pm-topp-val").textContent = Number($("pm-topp").value).toFixed(2);
  }
}
function saveParams() {
  window.piParams = { temperature: Number($("pm-temp").value), top_p: Number($("pm-topp").value) };
  try { localStorage.setItem("pi_params", JSON.stringify(window.piParams)); } catch {}
}
$("dd-params").addEventListener("click", (e) => {
  e.stopPropagation();
  $("attach-drop-menu").hidden = true;
  pm.hidden = !pm.hidden;
  closeFilePicker(); closeSlashMenu(); closeArchMenu?.();
});
$("pm-temp").addEventListener("input", () => { $("pm-temp-val").textContent = Number($("pm-temp").value).toFixed(1); saveParams(); });
$("pm-topp").addEventListener("input", () => { $("pm-topp-val").textContent = Number($("pm-topp").value).toFixed(2); saveParams(); });
$("pm-reset").addEventListener("click", () => {
  window.piParams = null;
  try { localStorage.removeItem("pi_params"); } catch {}
  $("pm-temp").value = 0.7; $("pm-topp").value = 0.95;
  $("pm-temp-val").textContent = "0.7"; $("pm-topp-val").textContent = "0.95";
  toast("已恢复默认参数");
});
document.addEventListener("click", (e) => { if (!e.target.closest("#params-menu") && !e.target.closest("#attach-drop-menu") && e.target.id !== "dd-params") pm.hidden = true; });
loadParams();

// ══ 语音输入（借鉴 Open WebUI STT：浏览器 Web Speech API 录音转文字，无需 server 改动）══
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRec) {
  let rec = null, listening = false;
  const voiceBtn = () => $("dd-voice");
  $("dd-voice").addEventListener("click", () => {
    if (listening) { try { rec.stop(); } catch {} return; }
    rec = new SpeechRec();
    rec.lang = "zh-CN";
    rec.interimResults = true;
    rec.continuous = true;
    let final = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      $("input").value = (final + interim).trim();
      autoGrow(); updateSendBtn();
    };
    rec.onend = () => {
      listening = false;
      const b = voiceBtn(); if (b) { b.textContent = "🎤 语音输入"; b.style.color = ""; }
    };
    rec.onerror = (e) => { toast("语音识别: " + e.error); rec?.stop(); };
    listening = true;
    const b = voiceBtn(); if (b) { b.textContent = "🔴 语音输入"; b.style.color = "#ff6b6b"; }
    toast("🎤 正在聆听… 再说一次可停止");
    rec.start();
  });
} else {
  const vb = $("dd-voice"); if (vb) { vb.title = "语音输入（浏览器不支持）"; vb.style.opacity = "0.35"; }
}

// ══ 输入区 "+" 更多菜单展开/收起 ══
$("btn-more-input").addEventListener("click", (e) => {
  e.stopPropagation();
  const m = $("attach-drop-menu");
  m.hidden = !m.hidden;
  closeFilePicker(); closeSlashMenu(); pm.hidden = true;
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#attach-drop") && !e.target.closest("#attach-menu") && !e.target.closest("#attach-drop-menu")) $("attach-drop-menu").hidden = true;
});

// ══ # 技能引用（类似 @ 文件引用：输入 # + 关键词 弹出技能列表，选中后作为引用文件附带）══
let skillCache = null; // 技能列表缓存
let skillMenuFilter = "";
function showSkillMenu(filter) {
  const menu = $("skill-menu");
  menu.innerHTML = "";
  skillMenuFilter = filter;
  const load = async () => {
    try {
      if (!skillCache) {
        const d = await api("/api/skills");
        skillCache = d.skills || [];
      }
      const kw = skillMenuFilter.toLowerCase();
      const list = skillCache.filter(s => !kw || (s.name || "").toLowerCase().includes(kw) || (s.description || "").toLowerCase().includes(kw));
      if (!list.length) { menu.innerHTML = '<div class="fp-empty">无匹配技能</div>'; return; }
      for (const s of list.slice(0, 15)) {
        const el = document.createElement("div");
        el.className = "skill-item";
        el.innerHTML = `<span class="sk-ico">⚡</span><span class="sk-name">${esc(s.name)}</span><span class="sk-desc">${esc((s.description || "").slice(0, 40))}</span>`;
        el.addEventListener("click", () => selectSkill(s));
        menu.appendChild(el);
      }
    } catch (e) { menu.innerHTML = `<div class="fp-empty">技能加载失败: ${esc(e.message)}</div>`; }
  };
  load();
  menu.hidden = false;
}
function closeSkillMenu() { $("skill-menu").hidden = true; }
// 选中技能：读取 SKILL.md 内容作为引用文件（走 @ 文件引用通道，server 无需改动）
// 选中技能：生成技能引用（技能的 SKILL.md 在 ~/.agents/skills/，模型可在 available_skills 中识别；
// 引用只需携带名称+路径，让模型按需读取，避免跨盘读文件）
async function selectSkill(s) {
  closeSkillMenu();
  if (pendingFiles.length >= 10) return toast("最多引用 10 个文件");
  const p = s.path || "";
  const content = `请使用技能「${s.name}」来完成任务。\n技能描述：${s.description || ""}\n技能位置：${p}\n（如需要完整技能说明，请用 read 工具读取该路径下的 SKILL.md）`;
  pendingFiles.push({ path: "#技能/" + s.name, content });
  renderChips();
  $("input").focus();
  toast(`已引用技能 ${s.name}`);
}
