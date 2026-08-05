// ===== core.js（从 app.js 拆分，全局作用域，保持原逻辑不变）=====
const $ = id => document.getElementById(id);
let token = new URLSearchParams(location.search).get("token") || localStorage.getItem("pi_web_token") || "";
let sessions = [];
let currentId = null;
let modelList = [];

console.log("pi-web v21");
// PWA：注册 service worker
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
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
    const r = await fetch(path, { ...opts, signal: opts.signal || ctrl.signal });
    const ct = r.headers.get("content-type") || "";
    const data = ct.includes("json") ? await r.json() : null;
    if (!r.ok) { const err = new Error((data && data.error) || `HTTP ${r.status}`); err.status = r.status; throw err; }
    return data;
  } finally {
    clearTimeout(timer);
  }
}
function esc(s) { return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

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

