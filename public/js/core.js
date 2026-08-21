// ===== core.js（从 app.js 拆分，全局作用域，保持原逻辑不变）=====
const $ = id => document.getElementById(id);
// 2026-08-21 修复外网报错：localStorage 不可用（隐私模式/禁 cookie）时不能中断 core.js（否则 apiUrl 未定义）
function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
let token = (new URLSearchParams(location.search).get("token") || safeGet("pi_web_token") || "");
// 2026-08-20 移动端（Capacitor 壳）：API 地址可配置——URL ?api= 或 localStorage pi_api_base
// 壳内 web 资源是本地文件，API 必须指向远程 server（公网域名或局域网 IP）
function apiBase() {
  try {
    return new URLSearchParams(location.search).get("api") || safeGet("pi_api_base") || "";
  } catch { return safeGet("pi_api_base") || ""; }
}
function apiUrl(path) { return apiBase() + path; }
let sessions = [];
let currentId = null;
let modelList = [];
// 会话级模型记忆：sessionId -> "provider/modelId"（切换会话时恢复各自模型，避免串台）
let sessionModels = {};
try { sessionModels = JSON.parse(localStorage.getItem("pi_session_models") || "{}"); } catch {}

console.log("pi-web v21");
// PWA：禁用 service worker（2026-08-15：SW 陈旧缓存导致页面不更新/刷新才生效，本地+隧道服务离线缓存收益为负）
// 一次性注销旧 SW + 清空缓存，之后走正常 HTTP 缓存（版本号 ?v= 控制）
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => { regs.forEach((r) => r.unregister()); })
      .catch(() => {});
    if (window.caches) {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
    }
  });
}

// 移动端视口高度修正（解决 iOS 键盘/地址栏导致底部超出屏幕）
const updateVH = () => {
  const vv = window.visualViewport;
  if (vv) document.documentElement.style.setProperty("--vvh", vv.height + "px");
};
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateVH);
  window.visualViewport.addEventListener("scroll", updateVH);
}
updateVH();

// ══ 工具函数 ══
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2200);
}
async function api(path, opts = {}) {
  opts.headers = { ...(opts.headers || {}), Authorization: `Bearer ${token}` };
  if (opts.body && typeof opts.body === "object") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  // 超时保护：网络卡死时 fetch 不会永久挂起（30s 上限，AbortSignal.timeout 浏览器均支持）
  const timeoutMs = opts.timeoutMs || 30000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("请求超时")), timeoutMs);
  try {
    const r = await fetch(apiUrl(path), { ...opts, signal: opts.signal || ctrl.signal });
    const ct = r.headers.get("content-type") || "";
    const data = ct.includes("json") ? await r.json() : null;
    if (!r.ok) { const err = new Error((data && data.error) || `HTTP ${r.status}`); err.status = r.status; throw err; }
    return data;
  } finally {
    clearTimeout(timer);
  }
}
// 安全转义：用于 HTML 文本与属性插值（& < > 引号全转，堵属性注入）
function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/`/g,"&#96;");
}

// ── 通用输入/确认弹窗（Promise 化，替代原生 prompt/confirm；统一样式、不阻塞、可测）──
let promptResolve = null;
function appPrompt(msg, def = "", title = "输入") {
  $("app-prompt-title").textContent = title;
  $("app-prompt-msg").textContent = msg;
  const input = $("app-prompt-input");
  input.value = def;
  $("app-prompt-modal").classList.add("show");
  setTimeout(() => { input.focus(); input.select(); }, 50);
  return new Promise((resolve) => { promptResolve = resolve; });
}
function appConfirm(msg, title = "确认") {
  $("app-prompt-title").textContent = title;
  $("app-prompt-msg").textContent = msg;
  $("app-prompt-input").style.display = "none";
  $("app-prompt-ok").textContent = "确定";
  $("app-prompt-modal").classList.add("show");
  return new Promise((resolve) => { promptResolve = (v) => resolve(v === true); });
}
function closeAppPrompt(v) {
  $("app-prompt-modal").classList.remove("show");
  $("app-prompt-input").style.display = "";
  $("app-prompt-ok").textContent = "确定";
  if (promptResolve) { const r = promptResolve; promptResolve = null; r(v); }
}
$("app-prompt-ok").addEventListener("click", () => {
  const v = $("app-prompt-input").value;
  closeAppPrompt($("app-prompt-input").style.display === "none" ? true : v);
});
$("app-prompt-cancel").addEventListener("click", () => closeAppPrompt(false));
$("app-prompt-close").addEventListener("click", () => closeAppPrompt(false));
$("app-prompt-modal").addEventListener("click", (e) => { if (e.target === $("app-prompt-modal")) closeAppPrompt(false); });
$("app-prompt-input").addEventListener("keydown", (e) => { if (e.key === "Enter") $("app-prompt-ok").click(); if (e.key === "Escape") closeAppPrompt(false); });
function fmtDur(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return (ms / 1000).toFixed(1) + "s";
}
function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1024/1024).toFixed(2)} MB`;
}

// 文件/媒体 URL 补鉴权 token（浏览器直接 GET 无法带 header，用 URL 参数）
function ensureFileToken(url) {
  if (!url || url.startsWith("data:") || url.startsWith("http")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "token=" + encodeURIComponent(token);
}

// ══ 可拖拽侧边栏（借鉴 agegr/pi-web：CSS 变量 + localStorage 持久化，桌面端）══
(function initSidebarResize() {
  const sidebar = $("sidebar");
  if (!sidebar) return;
  const MIN = 180, MAX = 480, DEF = 260;
  let w = parseInt(localStorage.getItem("pi_sidebar_width") || "", 10);
  if (!(w >= MIN && w <= MAX)) w = DEF;
  document.documentElement.style.setProperty("--sidebar-width", w + "px");
  if (window.innerWidth <= 768) return; // 移动端抽屉不拖拽
  const grip = document.createElement("div");
  grip.className = "sidebar-grip";
  grip.title = "拖拽调整侧边栏宽度";
  sidebar.appendChild(grip);
  let dragging = false;
  grip.addEventListener("pointerdown", (e) => {
    dragging = true;
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing-sidebar");
  });
  grip.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const w2 = Math.round(Math.max(MIN, Math.min(MAX, e.clientX - sidebar.getBoundingClientRect().left)));
    document.documentElement.style.setProperty("--sidebar-width", w2 + "px");
  });
  const stop = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("resizing-sidebar");
    try { localStorage.setItem("pi_sidebar_width", String(parseInt(getComputedStyle(sidebar).width, 10) || DEF)); } catch {}
  };
  grip.addEventListener("pointerup", stop);
  grip.addEventListener("pointercancel", stop);
})();
