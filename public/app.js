
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

// ══ 主题系统 ══
const VAR_MAP = {
  accent:"--accent", accent2:"--accent-2", deep:"--accent-deep",
  bg:"--bg", sidebar:"--sidebar", panel:"--panel", panel2:"--panel-2",
  border:"--border", text:"--text", dim:"--dim", dim2:"--dim-2",
  green:"--green", red:"--red", yellow:"--yellow",
  toolBash:"--tool-bash", toolRead:"--tool-read", toolWrite:"--tool-write",
  toolEdit:"--tool-edit", toolTodo:"--tool-todo",
};
const EDIT_ROWS = [
  ["accent", "主色"], ["accent2", "浅色"], ["deep", "深色"],
  ["bg", "背景"], ["sidebar", "侧边栏"], ["panel", "面板"], ["panel2", "面板深"],
  ["border", "边框"], ["text", "正文"], ["dim", "次要文字"], ["dim2", "弱文字"],
  ["green", "成功色"], ["red", "错误色"], ["yellow", "警告色"],
  ["__group__", "工具图标颜色"],
  ["toolBash", "bash"], ["toolRead", "read"], ["toolWrite", "write"], ["toolEdit", "edit"], ["toolTodo", "todo"],
];

// 每套预设：完整变量组
// 工具图标色固定不变（各主题无需重复传参），glow 为霓虹辉光强度 0~1
function makeVars(accent, accent2, deep, bg, sidebar, panel, panel2, border, text, dim, dim2, glow = 0) {
  return {
    accent, accent2, deep, bg, sidebar, panel, panel2, border, text, dim, dim2,
    green: "#3ecf8e", red: "#f47067", yellow: "#f5b759",
    toolBash: "#34d399", toolRead: "#38bdf8", toolWrite: "#f59e0b", toolEdit: "#f59e0b", toolTodo: "#f472b6",
    toolGlob: "#38bdf8", toolGrep: "#38bdf8",
    glow,
  };
}
const THEMES = {
  violet:  { label:"紫罗兰", vars: makeVars("#8b7cf6","#a394ff","#6d5ce7","#0b0c0f","#0f1116","#14161d","#171a22","#262b38","#e6e8ee","#8a91a5","#5c6375") },
  sky:     { label:"天蓝",   vars: makeVars("#38bdf8","#7dd3fc","#0ea5e9","#0a1118","#0d1620","#12202c","#162634","#1e3a4f","#e2edf7","#7f9db5","#51697e") },
  emerald: { label:"翡翠",   vars: makeVars("#34d399","#6ee7b7","#10b981","#081310","#0c1a15","#10241c","#143024","#1e4033","#e0f2ea","#7ea898","#4e7766") },
  amber:   { label:"琥珀",   vars: makeVars("#f59e0b","#fcd34d","#d97706","#141006","#1a1508","#231c0c","#2b2310","#4a3d18","#f5efdf","#a99c76","#75694a") },
  rose:    { label:"玫瑰",   vars: makeVars("#fb7185","#fda4af","#e11d48","#140a0d","#1a0e12","#241318","#2d181e","#4a2630","#f7e4e8","#b08a93","#7d5d66") },
  fuchsia: { label:"品红",   vars: makeVars("#d946ef","#f0abfc","#c026d3","#120a16","#180e1e","#211329","#291832","#452653","#f3e6f7","#ab8bb8","#7c5f8a") },
  cyan:    { label:"青色",   vars: makeVars("#22d3ee","#67e8f9","#0891b2","#081214","#0c181b","#102226","#142b30","#1e4047","#e0eef1","#7ba6ae","#4e7278") },
  lime:    { label:"青柠",   vars: makeVars("#a3e635","#d9f99d","#65a30d","#101208","#151809","#1c200d","#232812","#3a4218","#eff3e0","#9aa678","#6d774f") },
  // ── 骚气主题：霓虹 / 赛博 / 高冲击 ──
  cyber:   { label:"赛博霓虹", vars: makeVars("#00e5ff","#80f0ff","#0099cc","#05070f","#0a0e1a","#0d1220","#111828","#1e2a44","#e8f6ff","#8fa8c8","#4a5a78", 0.85) },
  heatwave:{ label:"暖橙疾驰", vars: makeVars("#ff6b1a","#ffb347","#c24500","#08090d","#0d0f14","#12141b","#171a22","#2a2d38","#f5f0e8","#b0a898","#5a5248", 0.5) },
  matrix:  { label:"矩阵骇客", vars: makeVars("#00ff9c","#7dffce","#00b36b","#010302","#030805","#050d08","#08130c","#0f3d28","#e2ffef","#7ba890","#3d5c49", 0.9) },
  synthwave:{ label:"合成器浪潮", vars: makeVars("#ff71ce","#01cdfe","#c23aa0","#150b22","#1d1030","#221440","#291850","#4a2d6e","#ffeef8","#c9a8d6","#7a5a8c", 0.7) },
  ember:   { label:"余烬暗火", vars: makeVars("#ff3d3d","#ff8a5c","#b31212","#0d0505","#140808","#1a0c0c","#221010","#3d1a1a","#ffeae6","#c08a82","#6e4a44", 0.6) },
  aurora:  { label:"极光极夜", vars: makeVars("#3effb0","#7dd3fc","#1fa97a","#030b12","#071320","#0a1828","#0e2035","#1d3a52","#e8f6f4","#8fb0b8","#4a6a74", 0.7) },
  gold:    { label:"黑金帝国", vars: makeVars("#ffd700","#ffe980","#b89b00","#0a0805","#120e08","#181209","#201910","#3d3320","#f7f0e0","#bfae80","#6e6248", 0.5) },
  tokyo:   { label:"东京霓虹夜", vars: makeVars("#ff2d95","#7aa2f7","#cc1f7a","#0b0d17","#11131f","#151828","#1a1e30","#2a3048","#e8eaf5","#9aa5c8","#525a78", 0.6) },
};
const THEMES_CODEX = {
  "codex-blue-window-messenger": { label: "蓝窗信使 Blue Window", vars: {
    accent: "#2876c8",
    accent2: "#73b9ed",
    deep: "#1d5590",
    bg: "#eaf6ff",
    sidebar: "#f6fbff",
    panel: "#ffffff",
    panel2: "#e4f2fc",
    border: "#89b6e4",
    text: "#173b61",
    dim: "#607e98",
    dim2: "#a5bacc",
    green: "#3ecf8e",
    red: "#4e9be0",
    yellow: "#f3b735",
    toolBash: "#34d399",
    toolRead: "#38bdf8",
    toolWrite: "#f59e0b",
    toolEdit: "#f59e0b",
    toolTodo: "#f472b6",
  } },
  "codex-focus-capybara": { label: "打工水豚 Focus Capybara", vars: {
    accent: "#5d9eff",
    accent2: "#91c1ff",
    deep: "#4372b8",
    bg: "#1e2022",
    sidebar: "#25282b",
    panel: "#292c2f",
    panel2: "#303438",
    border: "#323e4e",
    text: "#f5f3ef",
    dim: "#b4b7bb",
    dim2: "#696c6f",
    green: "#3ecf8e",
    red: "#f5ab7c",
    yellow: "#c39a74",
    toolBash: "#34d399",
    toolRead: "#38bdf8",
    toolWrite: "#f59e0b",
    toolEdit: "#f59e0b",
    toolTodo: "#f472b6",
  } },
  "codex-hacker-zero": { label: "零号骇客 Hacker Zero", vars: {
    accent: "#21ff78",
    accent2: "#47dcff",
    deep: "#18b856",
    bg: "#010302",
    sidebar: "#030705",
    panel: "#030705",
    panel2: "#06100a",
    border: "#0c5929",
    text: "#e4ffec",
    dim: "#79a488",
    dim2: "#3d5445",
    green: "#3ecf8e",
    red: "#c064ff",
    yellow: "#c4ff42",
    toolBash: "#34d399",
    toolRead: "#38bdf8",
    toolWrite: "#f59e0b",
    toolEdit: "#f59e0b",
    toolTodo: "#f472b6",
  } },
  "codex-mecha-cat-studio": { label: "机甲猫工作室 Mecha Cat Studio", vars: {
    accent: "#ff9a3d",
    accent2: "#61ddc1",
    deep: "#b86f2c",
    bg: "#102230",
    sidebar: "#152e3d",
    panel: "#173242",
    panel2: "#1b3b4d",
    border: "#264f60",
    text: "#f5fbff",
    dim: "#adc4d2",
    dim2: "#5f7381",
    green: "#3ecf8e",
    red: "#6bc4f2",
    yellow: "#f6c766",
    toolBash: "#34d399",
    toolRead: "#38bdf8",
    toolWrite: "#f59e0b",
    toolEdit: "#f59e0b",
    toolTodo: "#f472b6",
  } },
  "codex-mirror-lake-ribbon": { label: "七秀镜湖 Mirror Lake Ribbon", vars: {
    accent: "#e9939d",
    accent2: "#f0b8be",
    deep: "#a86a71",
    bg: "#261c22",
    sidebar: "#32242b",
    panel: "#33242b",
    panel2: "#2e2026",
    border: "#60464c",
    text: "#faeee8",
    dim: "#cdb5b1",
    dim2: "#7a696a",
    green: "#3ecf8e",
    red: "#78c3b5",
    yellow: "#d8bd83",
    toolBash: "#34d399",
    toolRead: "#38bdf8",
    toolWrite: "#f59e0b",
    toolEdit: "#f59e0b",
    toolTodo: "#f472b6",
  } },
  "codex-moonlit-immortal": { label: "曜月谪仙 Moonlit Immortal", vars: {
    accent: "#5b9ff4",
    accent2: "#8cddff",
    deep: "#4272b0",
    bg: "#061a3d",
    sidebar: "#0b2750",
    panel: "#0d2b58",
    panel2: "#123666",
    border: "#5f5b4d",
    text: "#f2f7ff",
    dim: "#9fb7d8",
    dim2: "#53698b",
    green: "#3ecf8e",
    red: "#e06459",
    yellow: "#dfb866",
    toolBash: "#34d399",
    toolRead: "#38bdf8",
    toolWrite: "#f59e0b",
    toolEdit: "#f59e0b",
    toolTodo: "#f472b6",
  } },
  "codex-neon-star-hunter": { label: "霓虹猎星者 Neon Star Hunter", vars: {
    accent: "#875cff",
    accent2: "#31ddff",
    deep: "#6142b8",
    bg: "#030617",
    sidebar: "#070e25",
    panel: "#080e26",
    panel2: "#0d1635",
    border: "#342a78",
    text: "#f8f8ff",
    dim: "#98a4cc",
    dim2: "#4e5572",
    green: "#3ecf8e",
    red: "#f36bff",
    yellow: "#e8c375",
    toolBash: "#34d399",
    toolRead: "#38bdf8",
    toolWrite: "#f59e0b",
    toolEdit: "#f59e0b",
    toolTodo: "#f472b6",
  } },
  "codex-nightbound-companion": { label: "夜语伴生 Nightbound Companion", vars: {
    accent: "#65bfae",
    accent2: "#8be0d2",
    deep: "#498a7d",
    bg: "#020608",
    sidebar: "#050d10",
    panel: "#061014",
    panel2: "#09171b",
    border: "#1d2f2f",
    text: "#edf8f6",
    dim: "#94aaa7",
    dim2: "#4b5858",
    green: "#3ecf8e",
    red: "#bf8f78",
    yellow: "#4c8d86",
    toolBash: "#34d399",
    toolRead: "#38bdf8",
    toolWrite: "#f59e0b",
    toolEdit: "#f59e0b",
    toolTodo: "#f472b6",
  } },
  "codex-potion-workshop": { label: "魔法药水铺 Potion Workshop", vars: {
    accent: "#dc8248",
    accent2: "#62b9a7",
    deep: "#9e5e34",
    bg: "#2d1c12",
    sidebar: "#3c2719",
    panel: "#43291a",
    panel2: "#513421",
    border: "#634729",
    text: "#fff0cd",
    dim: "#c8aa7d",
    dim2: "#7b6348",
    green: "#3ecf8e",
    red: "#e79a7c",
    yellow: "#a9b76c",
    toolBash: "#34d399",
    toolRead: "#38bdf8",
    toolWrite: "#f59e0b",
    toolEdit: "#f59e0b",
    toolTodo: "#f472b6",
  } },
  "codex-shanhai-nexus": { label: "山海灵境 Shanhai Nexus", vars: {
    accent: "#2cb7a4",
    accent2: "#8fe8e0",
    deep: "#208476",
    bg: "#07131a",
    sidebar: "#08161d",
    panel: "#0b1c22",
    panel2: "#0e252a",
    border: "#574f35",
    text: "#e9e0c9",
    dim: "#87a39f",
    dim2: "#475b5d",
    green: "#3ecf8e",
    red: "#d85b48",
    yellow: "#c6a15b",
    toolBash: "#34d399",
    toolRead: "#38bdf8",
    toolWrite: "#f59e0b",
    toolEdit: "#f59e0b",
    toolTodo: "#f472b6",
  } },
  "codex-starcap-teemo": { label: "星愿提莫 Starcap Teemo", vars: {
    accent: "#79d6a1",
    accent2: "#9ce8cf",
    deep: "#579a74",
    bg: "#172a26",
    sidebar: "#203730",
    panel: "#203830",
    panel2: "#1b312b",
    border: "#3f6359",
    text: "#f4f7e9",
    dim: "#b8c8b8",
    dim2: "#68796f",
    green: "#3ecf8e",
    red: "#f27b62",
    yellow: "#f6cf63",
    toolBash: "#34d399",
    toolRead: "#38bdf8",
    toolWrite: "#f59e0b",
    toolEdit: "#f59e0b",
    toolTodo: "#f472b6",
  } },
};

const TOOL_VAR = { bash:"toolBash", read:"toolRead", write:"toolWrite", edit:"toolEdit", glob:"toolRead", grep:"toolRead", rg:"toolRead", todo:"toolTodo" };
const TOOL_ICONS = { bash: "$", read: "R", write: "W", edit: "E", glob: "G", grep: "g", rg: "g" };

// 自定义主题：localStorage
function loadCustomThemes() {
  try { return JSON.parse(localStorage.getItem("pi_custom_themes") || "{}"); } catch { return {}; }
}
function saveCustomThemes() {
  try { localStorage.setItem("pi_custom_themes", JSON.stringify(customThemes)); } catch {}
}
let customThemes = loadCustomThemes();

let currentTheme = localStorage.getItem("pi_theme") || "violet";
if (!THEMES[currentTheme] && !THEMES_CODEX[currentTheme] && !currentTheme.startsWith("custom:")) currentTheme = "violet";
let editVars = null;   // 编辑器当前编辑的变量组
let editDirty = false; // 是否有未保存修改

function applyVars(vars) {
  const r = document.documentElement.style;
  for (const [k, v] of Object.entries(VAR_MAP)) r.setProperty(v, vars[k] || "");
  // 发光强度（骚气主题专用）：0~1，控制关键元素的霓虹辉光
  r.setProperty("--accent-glow", String(vars.glow || 0));
}
function getThemeVars(key) {
  if (key.startsWith("custom:")) return customThemes[key.slice(7)]?.vars || THEMES.violet.vars;
  return THEMES[key]?.vars || THEMES_CODEX[key]?.vars || THEMES.violet.vars;
}
function applyTheme(key, save = true) {
  currentTheme = key;
  applyVars(getThemeVars(key));
  if (save) localStorage.setItem("pi_theme", key);
  renderSwatches();
  syncEditor();
  toast(`已应用主题：${getThemeLabel(key)}`);
}
function getThemeLabel(key) {
  if (key.startsWith("custom:")) return key.slice(7);
  return THEMES[key]?.label || THEMES_CODEX[key]?.label || "紫罗兰";
}

// ── 侧边栏色板 ──
function renderSwatches() {
  const box = $("swatches");
  box.innerHTML = "";
  // 侧边栏只显示前 6 个常用主题，完整列表在主题编辑器里（避免占太多空间）
  const keys = Object.keys(THEMES).slice(0, 6);
  for (const key of keys) {
    const t = THEMES[key];
    const b = document.createElement("button");
    b.className = "sw" + (key === currentTheme ? " active" : "");
    b.dataset.theme = key;
    b.style.setProperty("--c", t.vars.accent);
    b.title = t.label;
    b.addEventListener("click", () => applyTheme(key));
    box.appendChild(b);
  }
}
// 更多主题 → 打开主题编辑器
$("theme-more").addEventListener("click", openThemeModal);

// ── 编辑器 ──
function syncEditor() {
  // 同步选中态
  document.querySelectorAll(".theme-item").forEach(el => {
    el.classList.toggle("active", el.dataset.key === currentTheme);
  });
  // 编辑区数据：切主题时用该主题变量初始化（若当前有未保存修改则保留）
  if (!editDirty || !editVars) {
    editVars = { ...getThemeVars(currentTheme) };
  }
  renderEditorRows();
}
function renderEditorRows() {
  const box = $("te-rows");
  box.innerHTML = "";
  for (const [key, label] of EDIT_ROWS) {
    if (key === "__group__") {
      const g = document.createElement("div");
      g.className = "te-group";
      g.textContent = label;
      box.appendChild(g);
      continue;
    }
    const row = document.createElement("div");
    row.className = "te-row";
    // 颜色值只允许合法 hex（导入的 JSON 可能带恶意 HTML，防注入）
    const safeColor = /^#[0-9a-fA-F]{6}$/.test(editVars[key] || "") ? editVars[key] : THEMES.violet.vars[key];
    row.innerHTML = `
      <span class="tl">${label}</span>
      <input type="color" value="${safeColor}" data-key="${key}">
      <input class="hex" value="${safeColor}" data-key="${key}" spellcheck="false">`;
    const colorInput = row.querySelector("input[type=color]");
    const hexInput = row.querySelector(".hex");
    const update = (v) => {
      editVars[key] = v;
      editDirty = true;
      applyVars(editVars);
      colorInput.value = v;
      hexInput.value = v;
    };
    colorInput.addEventListener("input", () => update(colorInput.value));
    hexInput.addEventListener("change", () => {
      const v = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) update(v);
      else hexInput.value = editVars[key];
    });
    box.appendChild(row);
  }
}
function renderThemeLists() {
  const presetBox = $("preset-list");
  const codexBox = $("codex-list");
  const customBox = $("custom-list");
  presetBox.innerHTML = "";
  codexBox.innerHTML = "";
  customBox.innerHTML = "";
  for (const [key, t] of Object.entries(THEMES)) {
    const el = document.createElement("div");
    el.className = "theme-item" + (key === currentTheme ? " active" : "");
    el.dataset.key = key;
    el.innerHTML = `<span class="swatch-dot" style="--dot1:${t.vars.accent};--dot2:${t.vars.deep}"></span><span class="t-name">${t.label}</span>`;
    el.addEventListener("click", () => { editDirty = false; applyTheme(key); });
    presetBox.appendChild(el);
  }
  // Codex 皮肤组
  for (const [key, t] of Object.entries(THEMES_CODEX)) {
    const el = document.createElement("div");
    el.className = "theme-item" + (key === currentTheme ? " active" : "");
    el.dataset.key = key;
    el.innerHTML = `<span class="swatch-dot" style="--dot1:${t.vars.accent};--dot2:${t.vars.deep}"></span><span class="t-name">${t.label}</span>`;
    el.addEventListener("click", () => { editDirty = false; applyTheme(key); });
    codexBox.appendChild(el);
  }
  const customKeys = Object.keys(customThemes);
  if (!customKeys.length) {
    customBox.innerHTML = `<div style="color:var(--dim-2);font-size:12px;padding:6px 9px">暂无自定义主题</div>`;
  }
  for (const name of customKeys) {
    const key = "custom:" + name;
    const vars = customThemes[name].vars;
    const el = document.createElement("div");
    el.className = "theme-item" + (key === currentTheme ? " active" : "");
    el.dataset.key = key;
    el.innerHTML = `<span class="swatch-dot" style="--dot1:${vars.accent};--dot2:${vars.deep}"></span><span class="t-name">${esc(name)}</span><button class="t-del" title="删除">✕</button>`;
    el.addEventListener("click", (e) => { if (e.target.classList.contains("t-del")) return; editDirty = false; applyTheme(key); });
    el.querySelector(".t-del").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm(`删除自定义主题「${name}」？`)) return;
      delete customThemes[name];
      saveCustomThemes();
      if (currentTheme === key) { editDirty = false; applyTheme("violet"); }
      renderThemeLists(); renderSwatches();
      toast("已删除主题");
    });
    customBox.appendChild(el);
  }
}

// ── 编辑器操作 ──
function openThemeModal() {
  editVars = { ...getThemeVars(currentTheme) };
  editDirty = false;
  renderThemeLists();
  syncEditor();
  $("theme-modal").classList.add("show");
}
function closeThemeModal() {
  $("theme-modal").classList.remove("show");
}
$("theme-edit").addEventListener("click", openThemeModal);
$("theme-close").addEventListener("click", closeThemeModal);
$("theme-modal").addEventListener("click", (e) => { if (e.target === $("theme-modal")) closeThemeModal(); });

// 另存为新主题
$("te-save").addEventListener("click", () => {
  let name = $("te-name").value.trim();
  if (!name) { name = "我的主题 " + new Date().toLocaleDateString(); }
  customThemes[name] = { vars: { ...editVars } };
  saveCustomThemes();
  editDirty = false;
  currentTheme = "custom:" + name;
  localStorage.setItem("pi_theme", currentTheme);
  renderThemeLists();
  renderSwatches();
  $("te-name").value = "";
  toast(`已保存自定义主题「${name}」`);
});

// 新建（基于默认模板）
$("theme-new").addEventListener("click", () => {
  editVars = { ...THEMES.violet.vars };
  editDirty = true;
  applyVars(editVars);
  renderEditorRows();
  $("te-name").focus();
  toast("已载入默认模板，改完点「另存为新主题」");
});

// 导出
$("te-export").addEventListener("click", () => {
  const name = $("te-name").value.trim() || getThemeLabel(currentTheme);
  const data = { name, vars: { ...editVars } };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pi-theme-${name.replace(/[^\w\u4e00-\u9fa5-]/g, "_")}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("已导出主题 JSON");
});

// 导入
$("te-import").addEventListener("click", () => $("te-import-file").click());
$("te-import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const j = JSON.parse(reader.result);
      const vars = { ...THEMES.violet.vars, ...(j.vars || j) };
      const name = (j.name || file.name.replace(/\.json$/i, "")).trim() || "导入的主题";
      customThemes[name] = { vars };
      saveCustomThemes();
      editDirty = false;
      applyTheme("custom:" + name);
      renderThemeLists();
      toast(`已导入主题「${name}」`);
    } catch { toast("导入失败：JSON 格式不正确"); }
  };
  reader.readAsText(file);
  e.target.value = "";
});

// 重置默认
$("te-reset").addEventListener("click", () => {
  editVars = { ...THEMES.violet.vars };
  editDirty = false;
  applyVars(editVars);
  renderEditorRows();
  renderThemeLists();
  currentTheme = "violet";
  localStorage.setItem("pi_theme", "violet");
  renderSwatches();
  toast("已重置为默认紫罗兰主题");
});

renderSwatches();
applyTheme(currentTheme, false);
renderThemeLists();

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
  const r = await fetch(path, opts);
  const ct = r.headers.get("content-type") || "";
  const data = ct.includes("json") ? await r.json() : null;
  if (!r.ok) { const err = new Error((data && data.error) || `HTTP ${r.status}`); err.status = r.status; throw err; }
  return data;
}
function esc(s) { return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function fmtDur(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return (ms / 1000).toFixed(1) + "s";
}
function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1024/1024).toFixed(2)} MB`;
}

// ══ 登录 ══
if (token) tryLogin();
$("login-btn").addEventListener("click", () => {
  token = $("token-input").value.trim();
  if (!token) return;
  localStorage.setItem("pi_web_token", token);
  tryLogin();
});
$("token-input").addEventListener("keydown", e => { if (e.key === "Enter") $("login-btn").click(); });

async function tryLogin() {
  try {
    const data = await api("/api/models");
    localStorage.setItem("pi_web_token", token);
    $("login").style.display = "none";
    $("app").style.display = "block";
    modelList = data.models;
    $("cwd-label").textContent = "cwd: " + (data.cwd || "");
    populateModels(data);
    await refreshSessions();
    updateFooter();
  } catch (e) {
    // 401：token 无效 → 清除旧 token，提示正确来源（不回显 token/系统路径，防泄露）
    if (e?.status === 401) {
      localStorage.removeItem("pi_web_token");
      token = "";
      $("login-err").textContent = "令牌无效。请检查服务端 .token 配置文件中的令牌后重试。";
    } else {
      $("login-err").textContent = "连接失败：" + (e?.message || e) + "（确认服务已启动）";
    }
  }
}

// ══ 模型 ══
function populateModels(data) {
  const sel = $("model-select");
  sel.innerHTML = "";
  const groups = {};
  for (const m of modelList) (groups[m.provider] = groups[m.provider] || []).push(m);
  const order = Object.keys(groups).sort((a,b) => {
    const rank = { deepseek:0, openai:1, openrouter:2 };
    return (rank[a] ?? 9) - (rank[b] ?? 9);
  });
  for (const prov of order) {
    const og = document.createElement("optgroup");
    og.label = prov;
    for (const m of groups[prov]) {
      const opt = document.createElement("option");
      opt.value = `${m.provider}/${m.id}`;
      opt.textContent = m.name || m.id;
      opt.dataset.provider = m.provider;
      opt.dataset.modelId = m.id;
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }
  if (data.current) sel.value = `${data.current.provider}/${data.current.id}`;
  // 用 onchange 而非 addEventListener：populateModels 会被多次调用，避免监听器重复叠加
  sel.onchange = () => { switchModel(sel.selectedOptions[0].dataset.provider, sel.selectedOptions[0].dataset.modelId); };
  // 同步输入框旁的模型名
  const curOpt = sel.selectedOptions[0];
  $("input-model-name").textContent = curOpt ? curOpt.dataset.modelId : "…";
}
// 切换模型：当前会话正在生成时先打断（避免 server 静默中断导致无输出）
async function switchModel(provider, modelId) {
  const key = currentKey();
  if (streams.has(key) && !streams.get(key).done) {
    const c = controllers.get(key);
    if (c) c.abort();
    toast("已切换模型，当前任务已停止");
    await new Promise(r => setTimeout(r, 300));
  }
  try {
    await api("/api/model", { method: "POST", body: { provider, modelId, sessionId: currentId } });
    $("input-model-name").textContent = modelId;
    const data = await api("/api/models");
    modelList = data.models; populateModels(data); updateFooter();
    toast(`已切换 → ${provider}/${modelId}`);
  } catch (e) { toast("切换失败: " + e.message); }
}

// ══ 会话 ══
async function refreshSessions() {
  const data = await api("/api/sessions");
  sessions = data.sessions;
  renderSessions();
}
// 折叠状态
let collapsedGroups = {};
try { collapsedGroups = JSON.parse(localStorage.getItem("pi_collapsed") || "{}"); } catch {}
function toggleGroup(key) {
  collapsedGroups[key] = !collapsedGroups[key];
  try { localStorage.setItem("pi_collapsed", JSON.stringify(collapsedGroups)); } catch {}
  renderSessions();
}
function groupSessions(list) {
  const now = new Date();
  const groups = { 今天: [], 昨天: [], 本周: [], 更早: [] };
  for (const s of list) {
    const d = new Date(s.updatedAt);
    const dayDiff = Math.floor((now - d) / 86400000);
    if (dayDiff < 1 && d.toDateString() === now.toDateString()) groups.今天.push(s);
    else if (dayDiff < 2) groups.昨天.push(s);
    else if (dayDiff < 7) groups.本周.push(s);
    else groups.更早.push(s);
  }
  return groups;
}
function renderSessions() {
  const list = $("session-list");
  list.innerHTML = "";
  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.style.cssText = "color:var(--dim-2);font-size:12px;text-align:center;padding:20px 0;font-family:var(--mono)";
    empty.textContent = "暂无会话";
    list.appendChild(empty);
    return;
  }
  // 置顶会话单独一组，放最前
  const pinned = sessions.filter(s => pinnedIds.has(s.id));
  if (pinned.length) appendSessionGroup(list, "置顶", pinned, "📌");
  // 项目分组（项目内会话按更新时间倒序）
  const byProj = {};
  const validProj = new Set(projects.map(p => p.id));
  for (const s of sessions) {
    const pid = sessionProject[s.id];
    if (pid && validProj.has(pid) && !pinnedIds.has(s.id)) (byProj[pid] = byProj[pid] || []).push(s);
  }
  for (const p of projects) {
    const items = byProj[p.id];
    if (!items || !items.length) continue;
    appendSessionGroup(list, p.name, items, "📁", p);
  }
  // 临时会话组（未归档 + 归档到已不存在项目的孤儿会话，内部按时间子分组）
  const temp = sessions.filter(s => {
    if (pinnedIds.has(s.id)) return false;
    const pid = sessionProject[s.id];
    return !pid || !validProj.has(pid); // 孤儿映射也回临时，避免会话“消失”
  });
  if (temp.length) appendTempGroup(list, temp);
}

// 普通会话组（置顶 / 项目）
function appendSessionGroup(list, label, items, icon, project) {
  const gkey = "sess-" + label;
  const collapsed = !!collapsedGroups[gkey];
  const g = document.createElement("div");
  g.className = "sess-group";
  g.innerHTML = `
    <div class="sg-head"><span class="sg-arrow">${collapsed ? "▸" : "▾"}</span><span class="sg-name">${icon} ${esc(label)}</span><span class="sg-count">${items.length}</span>${project ? `<span class="sg-more" title="项目菜单">⋯</span>` : ""}</div>
    <div class="sg-body" ${collapsed ? "hidden" : ""}></div>`;
  g.querySelector(".sg-head").addEventListener("click", () => toggleGroup(gkey));
  if (project) {
    g.querySelector(".sg-more").addEventListener("click", (e) => { e.stopPropagation(); showProjectMenu(project.id, e.target); });
  }
  const body = g.querySelector(".sg-body");
  for (const s of items) appendSessionItem(body, s);
  list.appendChild(g);
}

// 临时会话组：外部一层总标题，内部按时间子分组
function appendTempGroup(list, items) {
  const gkey = "sess-临时会话";
  const collapsed = !!collapsedGroups[gkey];
  const g = document.createElement("div");
  g.className = "sess-group";
  g.innerHTML = `
    <div class="sg-head"><span class="sg-arrow">${collapsed ? "▸" : "▾"}</span><span class="sg-name">📥 临时会话</span><span class="sg-count">${items.length}</span></div>
    <div class="sg-body" ${collapsed ? "hidden" : ""}></div>`;
  g.querySelector(".sg-head").addEventListener("click", () => toggleGroup(gkey));
  const body = g.querySelector(".sg-body");
  for (const [label, sub] of Object.entries(groupSessions(items))) {
    if (!sub.length) continue;
    const subKey = "sess-临时-" + label;
    const subCollapsed = !!collapsedGroups[subKey];
    const sg = document.createElement("div");
    sg.className = "sess-group";
    sg.innerHTML = `
      <div class="sg-sub-head"><span class="sg-arrow">${subCollapsed ? "▸" : "▾"}</span><span>${label}</span><span style="margin-left:auto;font-family:var(--mono);font-size:10px">${sub.length}</span></div>
      <div ${subCollapsed ? "hidden" : ""}></div>`;
    sg.querySelector(".sg-sub-head").addEventListener("click", () => toggleGroup(subKey));
    const subBody = sg.querySelector("div[hidden], div:last-child");
    for (const s of sub) appendSessionItem(subBody, s);
    body.appendChild(sg);
  }
  list.appendChild(g);
}

// 单个会话条目（含置顶 / 归档 / 删除）
function appendSessionItem(body, s) {
  const el = document.createElement("div");
  el.className = "session-item" + (s.id === currentId ? " active" : "");
  const ch = (s.name || "新").slice(0, 1);
  el.title = s.name + (s.preview ? "\n" + s.preview : "");
  el.innerHTML = `
    <span class="s-ico">${esc(ch)}</span>
    <div class="s-info">
      <span class="s-name">${esc(s.name)}</span>
      <span class="s-date">${fmtDate(s.updatedAt)}</span>
    </div>
    <span class="s-pin ${pinnedIds.has(s.id) ? "pinned" : ""}" title="置顶">📌</span>
    <span class="s-arch" title="归档到项目">📁</span>
    <span class="s-del" title="删除会话">✕</span>`;
  el.addEventListener("click", () => selectSession(s.id));
  el.querySelector(".s-pin").addEventListener("click", (e) => { e.stopPropagation(); togglePin(s.id); });
  el.querySelector(".s-arch").addEventListener("click", (e) => { e.stopPropagation(); showArchMenu(s.id, e.target); });
  el.querySelector(".s-del").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`删除会话「${s.name}」？`)) return;
    try {
      await api(`/api/sessions/${encodeURIComponent(s.id)}`, { method: "DELETE" });
      pinnedIds.delete(s.id);
      delete sessionProject[s.id];
      saveProjects();
      if (currentId === s.id) { currentId = null; $("session-name").textContent = "新会话"; clearMessages(); }
      await refreshSessions();
      toast("会话已删除");
    } catch (e) { toast("删除失败: " + e.message); }
  });
  body.appendChild(el);
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString() ? d.toTimeString().slice(0, 5) : `${d.getMonth() + 1}/${d.getDate()}`;
}
async function selectSession(id) {
  currentId = id;
  closeSidebar();
  renderSessions();
  const s = sessions.find(x => x.id === id);
  $("session-name").textContent = s ? s.name : "新会话";
  clearMessages();
  $("messages").innerHTML = '<div class="welcome" style="padding:60px 20px"><div class="sub">加载会话中…</div></div>';
  try {
    const data = await api(`/api/sessions/${encodeURIComponent(id)}/messages`);
    for (const m of data.messages) {
      if (m.role === "user") addUserMsg(m.text, m.id);
      else if (m.role === "assistant") {
        // 历史中的工具调用还原为卡片（默认收起）
        if (Array.isArray(m.tools) && m.tools.length) {
          for (const t of m.tools) {
            let argsText = "";
            if (t.args && typeof t.args === "object") {
              if (t.args.command) argsText = t.args.command;
              else if (t.args.path) argsText = t.args.path;
              else argsText = JSON.stringify(t.args, null, 2);
            } else argsText = String(t.args || "");
            addTool(t.name, argsText, t.id, t.args);
            if (t.output) updateToolOutput(t.id, t.output);
            endTool(t.id, !!t.isError);
          }
          document.querySelectorAll("#messages .tool").forEach(el => el.classList.remove("expanded"));
        }
        if (m.text) addAssistantMsg(m.text, m.ts, m.id);
        // 历史中的思考在 pi 消息之后显示（先 pi 再思考）
        if (m.think && m.think.trim()) appendExternalThink(m.think.slice(0, 20), m.think);
      }
    }
  } catch {}
  // 该会话若正在生成（其他标签页/后台），重建进行中的视图
  renderStreamView(id);
  syncBusyUI();
  updateFooter();
  $("compact-banner").hidden = true;
  $("messages").scrollTop = $("messages").scrollHeight;
}
async function newSession() {
  freshNewSession = true;
  currentId = null;
  closeSidebar();
  $("session-name").textContent = "新会话";
  // 清空输入框与附件，避免上一条输入/引用被带到新会话
  $("input").value = "";
  pendingFiles.length = 0;
  pendingImages.length = 0;
  renderChips();
  autoGrow();
  histIdx = -1;
  clearMessages();
  renderLatestNewStream(); // 若正在新建会话中，继续显示进度
  syncBusyUI();
  updateFooter();
  await refreshSessions();
  $("input").focus();
}
// 渲染最新的未命名流式会话（存在多个新会话并发时取最新）
function renderLatestNewStream() {
  let latest = null;
  for (const [k, st] of streams) {
    if (k.startsWith("__new__") && !st.done) {
      if (!latest || st.startedAt > latest.startedAt) latest = k;
    }
  }
  if (latest) renderStreamView(latest, true);
}

// ══ 消息渲染 ══
// 数据层：每个进行中的会话一份状态（支持跨会话并发流式）
// StreamState = { text, think, thinkingEl, tools: Map<id,cardData>, toolOrder, events, startedAt, done }
const streams = new Map();
// 渲染层：只服务当前显示的会话（currentId）
let render = { assistantEl: null, toolEls: new Map(), toolOrder: [], thinkingEl: null, deltaBuf: "", thinkBuf: "", flushTimer: null };
const currentKey = () => {
  if (currentId) return currentId;
  // 无当前会话：取最新的未命名流式会话（支持多个新会话并发）
  let latest = null;
  for (const [k, st] of streams) {
    if (k.startsWith("__new__") && !st.done) {
      if (!latest || st.startedAt > latest.startedAt) latest = k;
    }
  }
  return latest || "__new__";
};

function clearMessages() {
  $("messages").innerHTML = "";
  render = { assistantEl: null, toolEls: new Map(), toolOrder: [], thinkingEl: null, deltaBuf: "", thinkBuf: "", flushTimer: null };
}

// ── 渲染缓冲（合并高频流式事件，避免 DOM 卡死）──
function flushNow() {
  if (render.flushTimer) { clearTimeout(render.flushTimer); render.flushTimer = null; }
  if (render.deltaBuf) { appendDelta(render.deltaBuf); render.deltaBuf = ""; }
  if (render.thinkBuf) { appendThinking(render.thinkBuf); render.thinkBuf = ""; }
  autoScroll();
}
function scheduleFlush() {
  if (render.flushTimer) return;
  render.flushTimer = setTimeout(() => {
    render.flushTimer = null;
    if (render.deltaBuf) { appendDelta(render.deltaBuf); render.deltaBuf = ""; }
    if (render.thinkBuf) { appendThinking(render.thinkBuf); render.thinkBuf = ""; }
    autoScroll();
  }, 40);
}
function queueDelta(t) { render.deltaBuf += t; scheduleFlush(); }
function queueThink(t) { render.thinkBuf += t; scheduleFlush(); }
function autoScroll() {
  const box = $("messages");
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 250;
  if (near) box.scrollTop = box.scrollHeight;
}

// ── 数据层事件（无条件记录；当前会话同时走 DOM 渲染）──
function onDelta(sid, text) {
  const st = streams.get(sid);
  if (st) {
    st.text += text;
    st.events.push({ type: "delta", text });
    // 工具阶段开始后：文本缓存为结论，不混排在工具卡片中间（TUI 三段式：思考→执行→结论）
    if (st.toolStarted) st.pendingText += text;
  }
  if (sid === currentKey()) {
    const st2 = streams.get(sid);
    if (!st2 || !st2.toolStarted) queueDelta(text);
  }
}
function onThink(sid, text) {
  const st = streams.get(sid);
  if (st) { st.think += text; st.events.push({ type: "think", text }); }
  if (sid === currentKey()) queueThink(text);
}
function onThinkEnd(sid) {
  const st = streams.get(sid);
  if (st) st.events.push({ type: "think_end" });
  if (sid === currentKey()) endThinking();
}
function onTool(sid, name, argsText, toolCallId, rawArgs) {
  const st = streams.get(sid);
  if (st) {
    st.toolStarted = true;
    st.tools.set(toolCallId, { name, argsText, rawArgs, output: "", isError: false, done: false, start: performance.now() });
    st.toolOrder.push(toolCallId);
    st.events.push({ type: "tool", id: toolCallId, name, argsText, rawArgs });
  }
  if (sid === currentKey()) addTool(name, argsText, toolCallId, rawArgs);
}
function onToolOutput(sid, toolCallId, text) {
  const st = streams.get(sid);
  if (st && st.tools.has(toolCallId)) {
    st.tools.get(toolCallId).output = text || "";
    st.events.push({ type: "tool_output", id: toolCallId, text: text || "" });
  }
  if (sid === currentKey()) updateToolOutput(toolCallId, text);
}
function onToolEnd(sid, toolCallId, isError, output) {
  const st = streams.get(sid);
  if (st && st.tools.has(toolCallId)) {
    const t = st.tools.get(toolCallId);
    if (output) t.output = output;
    t.isError = !!isError; t.done = true;
    st.events.push({ type: "tool_end", id: toolCallId, isError: !!isError });
  }
  if (sid === currentKey()) { if (output) updateToolOutput(toolCallId, output); endTool(toolCallId, !!isError); }
}

// 切换/重建视图：把数据层某个会话的进行中状态完整渲染到 #messages
// includeUser=true 时先渲染用户消息（新会话无历史；历史会话的历史里已有）
function renderStreamView(sid, includeUser = false) {
  const st = streams.get(sid);
  if (!st) return;
  if (includeUser && st.userText) addUserMsg(st.userText);
  let toolStarted = false;
  let pending = "";
  for (const ev of st.events) {
    switch (ev.type) {
      case "think": appendThinking(ev.text); break;
      case "think_end": endThinking(); break;
      case "tool": toolStarted = true; addTool(ev.name, ev.argsText, ev.id, ev.rawArgs); break;
      case "tool_output": updateToolOutput(ev.id, ev.text); break;
      case "tool_end": if (ev.output) updateToolOutput(ev.id, ev.output); endTool(ev.id, ev.isError); break;
      case "delta": if (toolStarted) pending += ev.text; else appendDelta(ev.text); break;
    }
  }
  if (pending.trim()) renderPendingConclusion(pending);
  autoScroll();
}

// 渲染工具任务后的结论（独立 assistant 消息，排在所有工具卡片之后）
function renderPendingConclusion(text) {
  const box = $("messages");
  const el = document.createElement("div");
  el.className = "msg assistant";
  el.innerHTML = `<div class="who"><span class="avatar">π</span><span class="name">小语</span><span class="msg-time">${nowTime()}</span></div><div class="bubble"></div>`;
  el.querySelector(".bubble").innerHTML = md(text);
  bindCopyButtons(el);
  bindMsgCopy(el);
  renderMermaidBlocks(el);
  highlightBlocks(el);
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

function appendThinking(text) {
  if (!render.assistantEl) {
    // 先创建 pi 消息（头像/名称 + 气泡），思考块将内联在气泡前
    const el = document.createElement("div");
    el.className = "msg assistant";
    el.innerHTML = `<div class="who"><span class="avatar">π</span><span class="name">小语</span><span class="msg-time">${nowTime()}</span></div><div class="bubble"></div>`;
    $("messages").appendChild(el);
    render.assistantEl = { el, bubble: el.querySelector(".bubble") };
  }
  if (!render.thinkingEl) {
    const tb = document.createElement("div");
    tb.className = "think-block";
    tb.innerHTML = `<div class="think-head"><span class="think-pulse"></span>💭 思考过程 <span class="chev">▾</span></div><div class="think-body"></div>`;
    tb.querySelector(".think-head").addEventListener("click", () => tb.classList.toggle("collapsed"));
    // 内联到 pi 消息内：头像(who) → 思考 → 气泡
    render.assistantEl.el.insertBefore(tb, render.assistantEl.bubble);
    render.thinkingEl = { el: tb, body: tb.querySelector(".think-body") };
  }
  render.thinkingEl.body.appendChild(document.createTextNode(text));
}
function endThinking() {
  if (render.thinkingEl) {
    render.thinkingEl.el.classList.add("collapsed");
    const p = render.thinkingEl.el.querySelector(".think-pulse");
    if (p) p.remove();
    render.thinkingEl = null;
  }
}

// 历史消息里的思考（独立折叠块，不依赖流式 render 状态）
function appendExternalThink(title, fullText) {
  const box = $("messages");
  const tb = document.createElement("div");
  tb.className = "think-block";
  tb.innerHTML = `<div class="think-head"><span class="think-pulse"></span>💭 ${esc(title)} <span class="chev">▾</span></div><div class="think-body">${esc(fullText)}</div>`;
  tb.querySelector(".think-head").addEventListener("click", () => tb.classList.toggle("collapsed"));
  tb.classList.add("collapsed");
  box.appendChild(tb);
}

function addUserMsg(text, id) {
  const box = $("messages");
  const el = document.createElement("div");
  el.className = "msg user";
  if (id) el.dataset.msgId = id;
  el.innerHTML = `<div class="who"><span class="avatar">你</span><span class="name">你</span><span class="msg-time">${nowTime()}</span></div><div class="bubble">${esc(text).replace(/\n/g, "<br>")}</div>${id ? `<button class="msg-fork" title="从这里分叉">↳</button>` : ""}`;
  if (id) bindFork(el, id);
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}
function nowTime() { return new Date().toTimeString().slice(0, 5); }
function fmtTs(iso) {
  if (!iso) return nowTime();
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toTimeString().slice(0, 5);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.toTimeString().slice(0, 5)}`;
}
function addAssistantMsg(text, ts, id) {
  const box = $("messages");
  const el = document.createElement("div");
  el.className = "msg assistant";
  if (id) el.dataset.msgId = id;
  el.innerHTML = `<div class="who"><span class="avatar">π</span><span class="name">小语</span><span class="msg-time">${fmtTs(ts)}</span></div><div class="bubble"></div>${id ? `<button class="msg-fork" title="从这里分叉">↳</button>` : ""}`;
  if (id) bindFork(el, id);
  el.querySelector(".bubble").innerHTML = md(text);
  bindCopyButtons(el);
  bindMsgCopy(el);
  renderMermaidBlocks(el);
  highlightBlocks(el);
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}
function bindCopyButtons(root) {
  root.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const code = btn.closest(".code-wrap").querySelector("code").textContent;
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = "已复制"; btn.classList.add("copied");
        setTimeout(() => { btn.textContent = "复制"; btn.classList.remove("copied"); }, 1500);
      });
    });
  });
}
function appendDelta(text) {
  const box = $("messages");
  if (!render.assistantEl) {
    const el = document.createElement("div");
    el.className = "msg assistant";
    el.innerHTML = `<div class="who"><span class="avatar">π</span><span class="name">小语</span><span class="msg-time">${nowTime()}</span></div><div class="bubble"></div>`;
    box.appendChild(el);
    render.assistantEl = { el, bubble: el.querySelector(".bubble") };
  }
  // 追加新文本节点（O(1)）。避免 textContent += 的 O(n²)：长文本下每次追加都重写全部内容导致卡顿
  const bubble = render.assistantEl.bubble;
  bubble.appendChild(document.createTextNode(text));
  // 定期合并文本节点，防止长回答节点数量爆炸
  if (bubble.childNodes.length > 400) {
    bubble.textContent = bubble.textContent;
  }
}

// ── 工具卡片（美化版）──
// 工具运行计时 + 状态栏阶段提示（每秒 tick，让用户知道任务还在跑）
setInterval(() => {
  let running = null;
  for (const card of render.toolEls.values()) {
    if (card.el.classList.contains("running")) {
      const s = Math.round((performance.now() - card.start) / 1000);
      card.durEl.textContent = "运行 " + s + "s";
      if (s >= 30) card.durEl.style.color = "var(--yellow)";
      if (!running) running = card.el.querySelector(".t-name")?.textContent || "工具";
    }
  }
  if (running) setStatus(`执行 ${running}…`, "busy");
}, 1000);

function buildDiffHtml(name, args) {
  if (!args || typeof args !== "object") return null;
  if (name === "edit" && args.oldString != null && args.newString != null) {
    const parts = [];
    const oldLines = String(args.oldString).split("\n");
    const newLines = String(args.newString).split("\n");
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const o = oldLines[i], n = newLines[i];
      if (o === n && o != null) parts.push(`<span class="diff-line"><span class="sig"> </span>${esc(o)}</span>`);
      else {
        if (o != null) parts.push(`<span class="diff-line del"><span class="sig">-</span>${esc(o)}</span>`);
        if (n != null) parts.push(`<span class="diff-line add"><span class="sig">+</span>${esc(n)}</span>`);
      }
    }
    return parts.join("");
  }
  if (name === "write" && args.content != null) {
    const lines = String(args.content).split("\n").slice(0, 300);
    return lines.map(l => `<span class="diff-line add"><span class="sig">+</span>${esc(l)}</span>`).join("");
  }
  return null;
}
function addTool(name, argsText, toolCallId, rawArgs) {
  const box = $("messages");
  const colorVar = "--" + (TOOL_VAR[name] || "accent");
  const icon = TOOL_ICONS[name] || "⚙";

  let head = `<span class="t-ico" style="--tc:var(${colorVar})">${icon}</span>`;
  if (name === "bash") {
    head += `<span class="t-name">bash</span><span class="t-cmd"><span class="ps">$ </span>${esc(argsText)}</span>`;
  } else if (argsText) {
    head += `<span class="t-name">${esc(name)}</span><span class="t-cmd">${esc(argsText)}</span>`;
  } else {
    head += `<span class="t-name">${esc(name)}</span>`;
  }
  head += `<span class="t-state"><span class="spinner" style="--tc:var(${colorVar})"></span>运行中</span>`;

  const el = document.createElement("div");
  el.className = "tool running";
  el.style.setProperty("--tc", `var(${colorVar})`);
  el.innerHTML = `
    <div class="tool-head">${head}</div>
    <div class="tool-body">
      <div class="tool-out"><span class="empty">等待输出…</span></div>
      <div class="tool-meta"><span class="t-dur">…</span><span class="t-size"></span><span class="chev">▾</span></div>
    </div>`;

  el.querySelector(".tool-head").addEventListener("click", () => el.classList.toggle("expanded"));
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;

  const card = {
    el,
    outEl: el.querySelector(".tool-out"),
    durEl: el.querySelector(".t-dur"),
    sizeEl: el.querySelector(".t-size"),
    stateEl: el.querySelector(".t-state"),
    start: performance.now(),
    output: "",
    hasDiff: false,
  };

  // write/edit：渲染文件变化 diff
  const diffHtml = buildDiffHtml(name, rawArgs);
  if (diffHtml) {
    card.hasDiff = true;
    card.outEl.className = "tool-out tool-code";
    card.outEl.innerHTML = diffHtml;
  }

  render.toolEls.set(toolCallId, card);
  render.toolOrder.push(toolCallId);
  return card;
}
function updateToolOutput(toolCallId, text) {
  const card = render.toolEls.get(toolCallId);
  if (!card) return;
  card.output = text || "";
  if (card.hasDiff) return;
  const shown = card.output.length > 4000 ? "…[已截断]…\n" + card.output.slice(-4000) : card.output;
  card.outEl.textContent = shown || "（无输出）";
  card.sizeEl.textContent = fmtSize(card.output.length);
  card.el.classList.add("expanded");
  card.outEl.scrollTop = card.outEl.scrollHeight;
}
function endTool(toolCallId, isError) {
  const card = render.toolEls.get(toolCallId);
  if (!card) return;
  const dur = performance.now() - card.start;
  card.durEl.textContent = "用时 " + fmtDur(dur);
  card.stateEl.innerHTML = isError
    ? `<span style="color:var(--red)">✕ 失败</span>`
    : `<span style="color:var(--green)">✓ 完成</span>`;
  card.el.classList.remove("running");
  card.el.classList.add(isError ? "done-err" : "done-ok");
  if (card.output && !card.hasDiff) {
    const shown = card.output.length > 4000 ? "…[已截断]…\n" + card.output.slice(-4000) : card.output;
    card.outEl.textContent = shown;
    card.el.classList.add("expanded");
  }
  if (card.hasDiff) card.el.classList.add("expanded");
}

// ══ 简易 Markdown ══
function md(src) {
  let s = esc(src);
  const blocks = [];
  s = s.replace(/```([\w+-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const id = `__CB${blocks.length}__`;
    if (lang === "mermaid") {
      blocks.push(`<pre class="mermaid">${code}</pre>`);
    } else {
      blocks.push(`<div class="code-wrap"><div class="code-head"><span class="lang">${lang || "code"}</span><button class="copy-btn">复制</button></div><pre><code class="language-${lang || ""}">${code.length > 100000 ? code.slice(0, 100000) + "\n…[内容过长已截断，共 " + Math.round(code.length / 1024) + "KB]…" : code}</code></pre></div>`);
    }
    return id;
  });
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  // 标题：独立成块（保留行首换行、块后补空行，避免与段落粘连）
  s = s.replace(/(^|\n)(#{1,3}) ([^\n]*)/g, (_, lead, hashes, txt) => {
    return lead + `\n<h${hashes.length}>${txt}</h${hashes.length}>\n\n`;
  });
  // 引用：连续引用行合并为一个 blockquote，独立成块
  s = s.replace(/(^|\n)((?:&gt; [^\n]*\n?)+)/g, (_, lead, block) => {
    const lines = block.trimEnd().split("\n").map(l => l.replace(/^&gt; /, ""));
    return lead + "\n<blockquote>" + lines.join("<br>") + "</blockquote>\n\n";
  });
  // 无序/有序列表：连续列表行合并为单个 <ul>/<ol>，独立成块
  s = s.replace(/(^|\n)((?:[ \t]*(?:[-*]|\d+\.) [^\n]*\n?)+)/g, (_, lead, block) => {
    const lines = block.trimEnd().split("\n").map(l => l.trim());
    const ordered = /^\d+\. /.test(lines[0]);
    const tag = ordered ? "ol" : "ul";
    const items = lines.map(l => {
      const t = ordered ? l.replace(/^\d+\.\s+/, "") : l.replace(/^[-*]\s+/, "");
      return `<li>${t}</li>`;
    }).join("");
    return lead + `\n<${tag}>${items}</${tag}>\n\n`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // GFM 表格：| a | b |\n|---|---|\n| 1 | 2 |（第二行为分隔行，跳过）
  s = s.replace(/(^|\n)((?:\|[^\n]+\|\n)(?:\|[\s:\-|]+\|\n)+((?:\|[^\n]+\|\n?)+))/g, (_, lead, tbl) => {
    const lines = tbl.trim().split("\n").filter((l, i) => i !== 1);
    const trs = lines.map((l, ri) => {
      const cells = l.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const tag = ri === 0 ? "th" : "td";
      return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
    }).join("");
    return lead + `\n<table>${trs}</table>\n\n`;
  });
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const lines = s.split(/\n{2,}/);
  s = lines.map(l => {
    const t = l.trim();
    // 以 < 开头（已转义过，只可能是我们注入的 HTML）或代码块占位符的行不包 <p>
    if (/^<|^__CB\d+__/.test(t)) return l;
    return `<p>${l.replace(/\n/g, "<br>")}</p>`;
  }).join("");
  blocks.forEach((b, i) => { s = s.replace(`__CB${i}__`, b); });
  return s;
}

// ══ 语法高亮（highlight.js，借鉴 Cursor/Codex 代码块）══
let hljsLoading = false;
function loadHighlight() {
  if (window.hljs || hljsLoading) return Promise.resolve();
  hljsLoading = true;
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "/static/vendor/highlight.min.js";
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}
async function highlightBlocks(root) {
  await loadHighlight();
  if (!window.hljs) return;
  root.querySelectorAll("pre code:not(.hljs)").forEach(el => {
    const langTag = el.closest(".code-wrap")?.querySelector(".lang")?.textContent || "";
    // 超大代码块（如 bash 输出被模型贴进结论）跳过高亮，避免 hljs 卡死
    if (el.textContent.length > 20000) return;
    try {
      if (langTag && langTag !== "code" && langTag !== "text" && langTag !== "plaintext") {
        el.classList.add("language-" + langTag);
        hljs.highlightElement(el);
      } else {
        const res = hljs.highlightAuto(el.textContent);
        el.innerHTML = res.value;
        el.classList.add("hljs");
      }
    } catch {}
  });
}

// ══ TUI 风格底部状态栏（对标 pi 终端 Footer）══
async function updateFooter() {
  $("ft-cwd").textContent = "cwd: " + (($("cwd-label").textContent || "").replace(/^cwd: /, "") || "—");
  const sel = $("model-select");
  $("ft-model").textContent = sel.selectedOptions[0]?.value || "—";
  if (!currentId) {
    $("ft-tokens").textContent = "↑– ↓–";
    $("ft-cost").textContent = "$–";
    $("ft-context").textContent = "—";
    return;
  }
  try {
    const { stats } = await api(`/api/sessions/${encodeURIComponent(currentId)}/stats`);
    const t = stats.tokens || {};
    const cu = stats.contextUsage || {};
    $("ft-tokens").textContent = `↑${fmtNum(t.input)} ↓${fmtNum(t.output)}`;
    $("ft-tokens").title = `输入 ${fmtNum(t.input)} · 输出 ${fmtNum(t.output)}`;
    $("ft-cost").textContent = "$" + (stats.cost || 0).toFixed(4);
    $("ft-context").textContent = cu.percent != null ? `上下文 ${cu.percent}%` : "—";
  } catch {}
}

// ══ 输入历史（↑ 调出上一条，对标 TUI 编辑历史）══
const inputHistory = [];
let histIdx = -1;

// ══ 状态 ══
function setStatus(text, state) {
  const st = $("status");
  st.className = "status-pill " + (state || "idle");
  $("status-text").textContent = text;
}

// ══ 发送（支持跨会话并发流式）══
const controllers = new Map(); // key -> AbortController（停止当前会话的生成）

function onNote(sid, text) {
  const st = streams.get(sid);
  if (st) { st.text += "\n" + text; st.events.push({ type: "delta", text: "\n" + text }); }
  if (sid === currentKey()) appendDelta("\n" + text);
}

let watchdog = null; // 无事件看门狗（try 外声明，finally 可清理）
let freshNewSession = false; // 用户点了「新建会话」：下次发送创建全新会话（区分打断复用）
let hasSentInPage = false;   // 本页面是否已发送过（首次发送=新会话，避免误复用 server 旧未命名会话）
let watchdogEpoch = 0;  // 当前 watchdog 所属代次（打断时旧流不得清新流的 watchdog）
const streamEpoch = {}; // key -> 代次：打断后旧流 finally 不得清理/污染新流
function bumpEpoch(key) { streamEpoch[key] = (streamEpoch[key] || 0) + 1; return streamEpoch[key]; }

async function send() {
  const text = $("input").value.trim();
  if (!text) return;
  let key = currentId || "__new__";
  // 未命名新会话：若当前视图正显示一个进行中的流 → 用它的 key（打断）；否则分配新 key
  if (!currentId) {
    const viewKey = currentKey();
    if (viewKey.startsWith("__new__") && streams.has(viewKey) && !streams.get(viewKey).done) {
      key = viewKey; // 打断当前未命名流
    } else {
      let seq = 0;
      while (streams.has("__new__" + (seq ? "-" + seq : ""))) seq++;
      key = "__new__" + (seq ? "-" + seq : "");
    }
  }
  const epoch = bumpEpoch(key);
  const fresh = freshNewSession || !hasSentInPage;
  freshNewSession = false;
  hasSentInPage = true;
  // 该会话正在生成 → 打断当前任务，新消息立即拉入处理（对标 TUI interrupt）
  if (streams.has(key) && !streams.get(key).done) {
    const c = controllers.get(key);
    if (c) c.abort();
    // 标记旧视图里进行中的工具卡片为中断（旧流 catch 因 epoch 不再接管 DOM）
    for (const card of render.toolEls.values()) {
      if (card.el.classList.contains("running")) {
        card.durEl.textContent = "已中断";
        card.stateEl.innerHTML = `<span style="color:var(--dim-2)">⏹ 中断</span>`;
        card.el.classList.remove("running");
        card.el.classList.add("done-err");
      }
    }
    appendDelta("\n\n⏹ 已打断，处理新消息");
    toast("已打断当前任务，处理新消息");
  }
  $("input").value = ""; autoGrow();
  addUserMsg(text);
  // 数据层初始化（切走再切回可重建视图）
  const st = { text: "", think: "", tools: new Map(), toolOrder: [], events: [], startedAt: performance.now(), done: false, toolStarted: false, pendingText: "", userText: text };
  streams.set(key, st);
  // 渲染层复位（当前视图 = 本会话）
  render = { assistantEl: null, toolEls: new Map(), toolOrder: [], thinkingEl: null, deltaBuf: "", thinkBuf: "", flushTimer: null };
  // 先拷贝引用文件/图片，再清空（否则 body 里永远是空数组）
  const attachFiles = pendingFiles.map(f => ({ path: f.path, content: f.content }));
  const attachImages = pendingImages.map(i => ({ data: i.data, mimeType: i.mimeType }));
  pendingFiles.length = 0;
  pendingImages.length = 0;
  renderChips();
  ensureNotify();
  setStatus("处理中…", "busy");
  updateSendBtn();
  $("inputbar").classList.add("sending");
  const controller = new AbortController();
  controllers.set(key, controller);

  try {
    let r = null;
    let streamingStarted = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        body: JSON.stringify({
          message: text,
          sessionId: currentId,
          files: attachFiles,
          images: attachImages,
          fresh,
        }),
        signal: controller.signal,
      });
      // 409 = 旧 agent 还在释放 busy：稍等重试（打断场景常见）
      if (r.status !== 409) break;
      await new Promise(res => setTimeout(res, 500 * (attempt + 1)));
    }
    if (r.status === 409) {
      streams.delete(key);
      appendDelta("\n\n⚠️ 会话仍被占用——可能是其他页面正在使用，或上次任务未完全结束。可稍后重发，或新建会话。");
      return;
    }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `HTTP ${r.status}`);
    }
    // 绘图模型：server 直接返回 JSON {image}，不走 SSE
    if ((r.headers.get("content-type") || "").includes("application/json")) {
      const j = await r.json();
      if (j.image) renderImageMsg(j.image);
      else if (j.video) renderVideoMsg(j.video);
      else throw new Error(j.error || "生成失败");
      return;
    }

    streamingStarted = true;
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", done = false;
    // 无事件 watchdog：30s 没有任何 SSE 事件且无工具在跑 → 提示可能卡住/断线
    let lastEvent = Date.now();
    let idleWarned = false;
    watchdogEpoch = epoch;
    watchdog = setInterval(() => {
      // 本看门狗已过期（被新流打断接管）→ 自毁
      if (watchdogEpoch !== epoch) { clearInterval(watchdog); watchdog = null; return; }
      const idle = (Date.now() - lastEvent) / 1000;
      const hasRunning = [...render.toolEls.values()].some(c => c.el.classList.contains("running"));
      // 45s 无事件才警告（thinking 模型首 token 延迟可达 30s+，避免误报）
      if (idle > 45 && !idleWarned && !hasRunning) {
        idleWarned = true;
        if (currentKey() === key) {
          appendDelta(`\n\n⚠️ 已 ${Math.round(idle)}s 无响应——可能网络中断或模型卡住，可点「停止」后重试`);
          setStatus(`无响应 ${Math.round(idle)}s`, "error");
        }
      } else if (idleWarned && (idle <= 45 || hasRunning)) {
        idleWarned = false;
      }
    }, 1000);
    while (!done) {
      const { value, done: d } = await reader.read();
      done = d;
      buf += decoder.decode(value || new Uint8Array(), { stream: !done });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        let ev = "message", data = "";
        for (const line of chunk.split("\n")) {
          if (line.startsWith("event:")) ev = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!data) continue;
        lastEvent = Date.now();
        let obj; try { obj = JSON.parse(data); } catch { continue; }
        switch (ev) {
          case "delta":
            endThinking();
            onDelta(key, obj.text || "");
            break;
          case "think":
            onThink(key, obj.text || "");
            break;
          case "think_end":
            onThinkEnd(key);
            break;
          case "tool": {
            let argsText = "";
            if (obj.args && typeof obj.args === "object") {
              if (obj.args.command) argsText = obj.args.command;
              else if (obj.args.path) argsText = obj.args.path;
              else argsText = JSON.stringify(obj.args, null, 2);
            } else argsText = String(obj.args || "");
            onTool(key, obj.name, argsText, obj.id, obj.args);
            break;
          }
          case "tool_output":
            onToolOutput(key, obj.id, obj.text);
            break;
          case "tool_end":
            onToolEnd(key, obj.id, !!obj.isError, obj.output);
            break;
          case "turn_end": break;
          case "media":
            // 媒体路由结果：图片/音频直接渲染到消息区
            if (currentKey() === key) {
              if (obj.type === "image") renderImageMsg(obj.url);
              else if (obj.type === "audio") renderAudioMsg(obj.url);
            }
            break;
          case "note": onNote(key, obj.text || ""); break;
          case "done":
            if (obj.sessionId && key.startsWith("__new__")) {
              streams.set(obj.sessionId, st);
              streams.delete(key);
              // controllers / streamEpoch 也要同步迁移，否则 finally 的代次判断失效
              if (controllers.has(key)) {
                controllers.set(obj.sessionId, controllers.get(key));
                controllers.delete(key);
              }
              if (streamEpoch[key] != null) {
                streamEpoch[obj.sessionId] = streamEpoch[key];
                delete streamEpoch[key];
              }
              currentId = obj.sessionId;
              key = obj.sessionId; // 同步 key，否则 finally 的 currentKey()===key 判断失效
            }
            flushNow();
            done = true;
            break;
          case "error": appendDelta("\n\n[错误] " + (obj.message || "未知错误")); flushNow(); done = true; break;
        }
      }
    }
    // 收尾（仅当当前视图仍是本会话时操作 DOM）
    if (currentKey() === key) {
      if (st.toolStarted) {
        // 工具任务：结论单独成消息，排在所有工具卡片之后
        if (st.pendingText && st.pendingText.trim()) {
          renderPendingConclusion(st.pendingText);
        } else if (!render.assistantEl && !render.toolOrder.length) {
          addAssistantMsg("（无输出）");
        }
        autoScroll();
      } else if (!render.assistantEl) {
        addAssistantMsg("（无输出）");
      } else {
        // 纯问答：流式文本结束时统一走 Markdown 渲染
        const bubble = render.assistantEl.bubble;
        const raw = bubble.innerText;
        if (raw.trim()) {
          bubble.innerHTML = md(raw);
          bindCopyButtons(render.assistantEl.el);
          renderMermaidBlocks(render.assistantEl.el);
          highlightBlocks(render.assistantEl.el);
        }
        bindMsgCopy(render.assistantEl.el);
        autoScroll();
      }
      notifyDone();
      updateFooter();
      inputHistory.push(text);
      histIdx = -1;
      if (inputHistory.length > 100) inputHistory.shift();
      if (currentId) {
        const s = sessions.find(x => x.id === currentId);
        if (s) { s.name = text.slice(0, 24); s.updatedAt = new Date().toISOString(); s.preview = text.slice(0, 60); }
        $("session-name").textContent = s ? s.name : "新会话";
        refreshSessions();
      }
    }
  } catch (e) {
    if (currentKey() === key && streamEpoch[key] === epoch) {
      if (e.name === "AbortError") {
        // 把被中断的进行中工具卡片标记为中断（停止转圈）
        for (const card of render.toolEls.values()) {
          if (card.el.classList.contains("running")) {
            card.durEl.textContent = "已中断";
            card.stateEl.innerHTML = `<span style="color:var(--dim-2)">⏹ 中断</span>`;
            card.el.classList.remove("running");
            card.el.classList.add("done-err");
          }
        }
        appendDelta("\n\n⏹ 已停止生成");
      }
      else {
        appendDelta("\n\n[连接错误] " + (e.message || e));
        // 连接建立前失败（fetch failed）→ 消息未发出，恢复输入框内容
        if (!streamingStarted) { $("input").value = text; autoGrow(); updateSendBtn(); }
      }
    }
  } finally {
    if (watchdogEpoch === epoch && watchdog) { clearInterval(watchdog); watchdog = null; }
    if (streamEpoch[key] !== epoch) return; // 旧代次：已被新流接管，不得清理/污染
    streams.delete(key);
    controllers.delete(key);
    if (currentKey() === key) {
      syncBusyUI();
      $("inputbar").classList.remove("sending");
      render.assistantEl = null;
      $("messages").scrollTop = $("messages").scrollHeight;
    }
  }
}

// 切换会话后同步发送按钮/状态栏（当前会话是否在生成）
function syncBusyUI() {
  const c = controllers.get(currentKey());
  if (c) { setStatus("处理中…", "busy"); }
  else { setStatus("就绪"); }
  updateSendBtn();
}
// 发送按钮动态状态：生成中=⏹停止 / 有输入=↩发送 / 空输入=隐藏（回车发送）
function updateSendBtn() {
  const btn = $("send");
  if (!btn) return;
  const key = currentKey();
  const streaming = streams.has(key) && !streams.get(key).done;
  if (streaming) {
    btn.hidden = false;
    btn.textContent = "⏹";
    btn.classList.add("stop");
    btn.title = "停止生成";
  } else if ($("input").value.trim()) {
    btn.hidden = false;
    btn.textContent = "↩";
    btn.classList.remove("stop");
    btn.title = "发送（Enter）";
  } else {
    btn.hidden = true;
    btn.textContent = "↩";
    btn.classList.remove("stop");
    btn.title = "发送（Enter）";
  }
}

// ══ 背景壁纸（借鉴 Codex Dream Skin）══
let wallpaper = null;
try { wallpaper = JSON.parse(localStorage.getItem("pi_wallpaper") || "null"); } catch {}
function applyWallpaper() {
  const r = document.documentElement.style;
  if (wallpaper && wallpaper.url) {
    r.setProperty("--wallpaper", `url("${wallpaper.url}")`);
    r.setProperty("--wallpaper-opacity", String(wallpaper.opacity ?? 0.55));
    r.setProperty("--wallpaper-blur", (wallpaper.blur ?? 6) + "px");
    r.setProperty("--wallpaper-dim", String(0.45));
    document.body.classList.add("has-wallpaper");
  } else {
    r.removeProperty("--wallpaper");
    r.removeProperty("--wallpaper-opacity");
    r.removeProperty("--wallpaper-blur");
    r.removeProperty("--wallpaper-dim");
    document.body.classList.remove("has-wallpaper");
  }
  if (wallpaper && wallpaper.url) {
    $("wp-opacity").value = wallpaper.opacity ?? 0.55;
    $("wp-blur").value = wallpaper.blur ?? 6;
    $("wp-status").textContent = "✓ 壁纸生效";
  } else {
    $("wp-status").textContent = "";
  }
}
function saveWallpaper() {
  try { localStorage.setItem("pi_wallpaper", JSON.stringify(wallpaper)); } catch { toast("壁纸太大，存储失败"); }
  applyWallpaper();
}
$("wp-upload").addEventListener("click", () => $("wp-file").click());
$("wp-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1920 / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      wallpaper = { url: canvas.toDataURL("image/jpeg", 0.82), opacity: 0.55, blur: 6 };
      saveWallpaper();
      toast("壁纸已应用 ✨");
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});
$("wp-url-apply").addEventListener("click", () => {
  const url = $("wp-url").value.trim();
  if (!url) return toast("请输入图片 URL");
  wallpaper = { url, opacity: parseFloat($("wp-opacity").value), blur: parseInt($("wp-blur").value) };
  saveWallpaper();
  toast("壁纸已应用 ✨");
});
$("wp-opacity").addEventListener("input", () => {
  if (!wallpaper || !wallpaper.url) return;
  wallpaper.opacity = parseFloat($("wp-opacity").value);
  applyWallpaper();
});
$("wp-blur").addEventListener("input", () => {
  if (!wallpaper || !wallpaper.url) return;
  wallpaper.blur = parseInt($("wp-blur").value);
  applyWallpaper();
});
$("wp-remove").addEventListener("click", () => {
  wallpaper = null;
  localStorage.removeItem("pi_wallpaper");
  applyWallpaper();
  toast("壁纸已移除");
});
applyWallpaper();

// ══ 模型管理（手动添加 API + 测试识别）══
async function openModelManage() {
  try {
    const data = await api("/api/models/manage");
    const box = $("mm-providers");
    box.innerHTML = "";
    if (!data.providers.length) box.innerHTML = '<div class="fp-empty">暂无配置，请在下方添加</div>';
    for (const p of data.providers) {
      const el = document.createElement("div");
      el.className = "mm-provider";
      el.innerHTML = `
        <span class="mp-name">${esc(p.provider)}</span>
        <span class="mp-status ${p.hasKey ? "ok" : ""}">${p.hasKey ? "✓ 有Key" : "无Key"}</span>
        ${p.baseUrl ? `<span class="mp-url" title="${esc(p.baseUrl)}">${esc(p.baseUrl.replace(/^https?:\/\//, "").slice(0, 22))}</span>` : ""}
        <span class="mp-caps">${(p.capabilities ? Object.entries(p.capabilities).filter(([k,v]) => v).map(([k]) => k === "chat" ? "💬" : k === "image" ? "🎨" : k === "video" ? "🎬" : k === "tts" ? "🎤" : "🎧").join("") : "") || "💬"}</span>
        <span class="mp-count">${p.modelCount} 模型</span>
        <button class="mp-del" title="删除配置">✕</button>`;
      el.querySelector(".mp-del").addEventListener("click", async () => {
        if (!confirm(`删除 ${p.provider} 的 API 配置？`)) return;
        try {
          await api("/api/models/remove", { method: "POST", body: { provider: p.provider } });
          toast(`已删除 ${p.provider}`);
          await openModelManage();
        } catch (e) { toast("删除失败: " + e.message); }
      });
      box.appendChild(el);
    }
    const sel = $("mm-type");
    sel.innerHTML = "";
    // 下拉：已配置 ✓ → 预设 → 自定义…
    const seen = new Set();
    for (const p of data.providers) {
      if (seen.has(p.provider)) continue;
      seen.add(p.provider);
      const opt = document.createElement("option");
      opt.value = p.provider; opt.textContent = p.provider + " ✓";
      sel.appendChild(opt);
    }
    for (const t of data.supported) {
      if (seen.has(t)) continue;
      seen.add(t);
      const opt = document.createElement("option");
      opt.value = t; opt.textContent = t;
      sel.appendChild(opt);
    }
    const customOpt = document.createElement("option");
    customOpt.value = "__custom__"; customOpt.textContent = "✏️ 自定义…";
    sel.appendChild(customOpt);
    $("mm-custom-row").hidden = true;
    $("mm-custom-provider").value = "";
    $("mm-result").textContent = "";
    $("mm-result").className = "mm-result";
    $("model-modal").classList.add("show");
  } catch (e) { toast("加载失败: " + e.message); }
}
$("model-manage").addEventListener("click", openModelManage);
$("mm-close").addEventListener("click", () => $("model-modal").classList.remove("show"));
$("model-modal").addEventListener("click", (e) => { if (e.target === $("model-modal")) $("model-modal").classList.remove("show"); });
$("mm-type").addEventListener("change", () => {
  $("mm-custom-row").hidden = $("mm-type").value !== "__custom__";
  if ($("mm-type").value === "__custom__") $("mm-custom-provider").focus();
});
$("mm-custom-provider").addEventListener("keydown", e => { if (e.key === "Enter") $("mm-test").click(); });
$("mm-test").addEventListener("click", async () => {
  let provider = $("mm-type").value;
  if (provider === "__custom__") {
    provider = $("mm-custom-provider").value.trim();
    if (!provider) return toast("请输入自定义服务商名称");
  }
  const apiKey = $("mm-key").value.trim();
  if (!apiKey) return toast("请输入 API Key");
  const baseUrl = $("mm-baseurl").value.trim();
  const btn = $("mm-test");
  btn.disabled = true;
  btn.textContent = "验证中…";
  const r = $("mm-result");
  r.className = "mm-result";
  r.textContent = "正在验证 API Key 并识别可用模型…";
  try {
    const res = await api("/api/models/add", { method: "POST", body: { provider, apiKey, baseUrl: baseUrl || undefined } });
    r.className = "mm-result ok";
    r.textContent = `✓ 添加成功！识别到 ${res.modelCount} 个可用模型：\n${res.models.slice(0, 12).join("、")}${res.modelCount > 12 ? "…" : ""}`;
    $("mm-key").value = "";
    $("mm-baseurl").value = "";
    // 刷新模型下拉
    const m = await api("/api/models");
    modelList = m.models;
    populateModels(m);
    await openModelManage();
  } catch (e) {
    r.className = "mm-result err";
    r.textContent = "✕ " + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "测试并添加";
  }
});

// ══ 会话搜索 + 命令面板（Ctrl+K，借鉴 Raycast/Linear 的命令面板）══
let searchTimer = null;
const PALETTE_CMDS = [
  { icon: "＋", label: "新建会话", kbd: "Ctrl+N", run: () => { newSession(); } },
  { icon: "🔍", label: "搜索会话…（输入关键词）", kbd: "", run: () => $("search-input").focus() },
  { icon: "📈", label: "全局用量看板（所有会话）", kbd: "", run: () => openGlobalStats() },
  { icon: "⚡", label: "管理自定义斜杠命令", kbd: "", run: () => openSlashManage() },
  { icon: "🎨", label: "打开主题编辑器", kbd: "", run: () => openThemeModal() },
  { icon: "⚙", label: "模型管理（API Key / Base URL）", kbd: "", run: () => openModelManage() },
  { icon: "⬇", label: "导出当前会话", kbd: "", run: () => $("export-btn").click() },
  { icon: "📊", label: "会话统计（token/成本）", kbd: "", run: () => openStats() },
  { icon: "⌨️", label: "快捷键面板", kbd: "Ctrl+/", run: () => openKeysPanel() },
];
function renderPaletteCommands() {
  const box = $("search-results");
  box.innerHTML = "";
  const hint = document.createElement("div");
  hint.className = "pal-hint";
  hint.textContent = "快捷键操作";
  box.appendChild(hint);
  for (const c of PALETTE_CMDS) {
    const el = document.createElement("div");
    el.className = "pal-item";
    el.innerHTML = `<span class="pi-ico">${c.icon}</span><span>${c.label}</span>${c.kbd ? `<span class="pi-kbd">${c.kbd}</span>` : ""}`;
    el.addEventListener("click", () => { closeSearch(); c.run(); });
    box.appendChild(el);
  }
}
function openSearch() {
  $("search-modal").classList.add("show");
  $("search-input").value = "";
  renderPaletteCommands();
  setTimeout(() => $("search-input").focus(), 60);
}
function closeSearch() { $("search-modal").classList.remove("show"); }
$("search-close").addEventListener("click", () => $("search-modal").classList.remove("show"));
$("search-modal").addEventListener("click", (e) => { if (e.target === $("search-modal")) $("search-modal").classList.remove("show"); });
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); }
});
// Esc 关闭任意打开的面板/弹窗
const MODAL_IDS = ["theme-modal", "model-modal", "search-modal", "git-modal", "stats-modal", "fileview-modal", "skill-modal", "gstats-modal", "slash-manage-modal", "keys-modal"];
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  for (const id of MODAL_IDS) $(id).classList.remove("show");
});

// ══ 快捷键面板（Ctrl+/）══
const KEY_ROWS = [
  ["发送消息", ["Enter"]],
  ["换行", ["Shift", "Enter"]],
  ["引用文件", ["@"]],
  ["斜杠命令", ["/"]],
  ["命令面板（搜索/操作）", ["Ctrl", "K"]],
  ["快捷键面板", ["Ctrl", "/"]],
  ["关闭弹层/菜单", ["Esc"]],
  ["语音输入", ["🎤"]],
];
function openKeysPanel() {
  const body = $("keys-body");
  body.innerHTML = "";
  for (const [name, keys] of KEY_ROWS) {
    const row = document.createElement("div");
    row.className = "keys-row";
    row.innerHTML = `<span class="kr-name">${name}</span><span class="kr-keys">${keys.map(k => `<kbd>${k}</kbd>`).join("")}</span>`;
    body.appendChild(row);
  }
  const actions = document.createElement("div");
  actions.className = "keys-actions";
  const btns = [
    ["＋ 新建会话", newSession],
    ["🎨 主题编辑器", openThemeModal],
    ["⚙ 模型管理", openModelManage],
    ["📈 全局用量", openGlobalStats],
    ["⚡ 管理命令", openSlashManage],
  ];
  for (const [label, fn] of btns) {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", () => { $("keys-modal").classList.remove("show"); fn(); });
    actions.appendChild(b);
  }
  body.appendChild(actions);
  $("keys-modal").classList.add("show");
}
$("keys-close").addEventListener("click", () => $("keys-modal").classList.remove("show"));
$("keys-modal").addEventListener("click", (e) => { if (e.target === $("keys-modal")) $("keys-modal").classList.remove("show"); });
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "/") { e.preventDefault(); openKeysPanel(); }
});
$("search-input").addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = $("search-input").value.trim();
  if (q.length < 2) { renderPaletteCommands(); return; }
  searchTimer = setTimeout(async () => {
    try {
      const { results } = await api("/api/search?q=" + encodeURIComponent(q));
      const box = $("search-results");
      box.innerHTML = "";
      if (!results.length) { box.innerHTML = '<div class="fp-empty">未找到匹配内容</div>'; return; }
      for (const r of results) {
        const el = document.createElement("div");
        el.className = "search-item";
        el.innerHTML = `<div class="si-name">${esc(r.name)}</div>`;
        for (const h of r.hits) {
          const hi = document.createElement("div");
          hi.className = "si-hit";
          hi.innerHTML = `<span class="si-role">${h.role === "user" ? "你" : "pi"}</span>${esc(h.snippet)}`;
          hi.addEventListener("click", async () => {
            $("search-modal").classList.remove("show");
            await selectSession(r.sessionId);
          });
          el.appendChild(hi);
        }
        box.appendChild(el);
      }
    } catch {}
  }, 300);
});

// ══ Git 面板 ══
let gitTab = "status";
async function openGit(tab) {
  gitTab = tab || "status";
  $("git-tab-status").classList.toggle("active", gitTab === "status");
  $("git-tab-diff").classList.toggle("active", gitTab === "diff");
  $("git-modal").classList.add("show");
  const out = $("git-output");
  out.textContent = "加载中…";
  try {
    const { isRepo, output } = await api("/api/git/" + gitTab);
    if (!isRepo) {
      out.textContent = "当前工作目录不是 Git 仓库（或 git 未安装）。\n\n要在该目录初始化：git init";
      return;
    }
    // 简单着色：文件名/删除/新增
    const lines = output.split("\n");
    out.innerHTML = lines.map(l => {
      if (l.startsWith("+") || l.startsWith("A") || l.startsWith("M ")) return `<span class="green">${esc(l)}</span>`;
      if (l.startsWith("-") || l.startsWith("D") || l.startsWith("!!")) return `<span class="red">${esc(l)}</span>`;
      if (l.startsWith("??")) return `<span class="yellow">${esc(l)}</span>`;
      if (l.startsWith("##")) return `<b>${esc(l)}</b>`;
      return esc(l);
    }).join("\n") || "（干净，无改动）";
  } catch (e) {
    out.textContent = "Git 出错: " + e.message;
  }
}
$("git-btn").addEventListener("click", () => openGit("status"));
$("git-close").addEventListener("click", () => $("git-modal").classList.remove("show"));
$("git-modal").addEventListener("click", (e) => { if (e.target === $("git-modal")) $("git-modal").classList.remove("show"); });
$("git-tab-status").addEventListener("click", () => openGit("status"));
$("git-tab-diff").addEventListener("click", () => openGit("diff"));

// ══ 消息复制 ══
function bindMsgCopy(el) {
  if (el.querySelector(".msg-copy")) return;
  const btn = document.createElement("button");
  btn.className = "msg-copy";
  btn.textContent = "复制";
  btn.addEventListener("click", () => {
    const text = el.querySelector(".bubble").innerText;
    navigator.clipboard.writeText(text).then(() => toast("已复制消息"));
  });
  el.appendChild(btn);
}

// ══ Mermaid 渲染 ══
function loadMermaid() {
  if (window.mermaid || document.querySelector("script[data-mermaid]")) return Promise.resolve();
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
    s.dataset.mermaid = "1";
    s.onload = () => { try { window.mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" }); } catch {} resolve(); };
    s.onerror = resolve;
    document.head.appendChild(s);
  });
}
async function renderMermaidBlocks(root) {
  const blocks = root.querySelectorAll("pre.mermaid");
  if (!blocks.length) return;
  await loadMermaid();
  if (!window.mermaid) {
    // CDN 不可达时降级：保留原始代码并给出提示，而不是静默消失
    for (const b of blocks) {
      const hint = document.createElement("div");
      hint.className = "mermaid-rendered";
      hint.innerHTML = '<span style="color:var(--dim-2);font-size:12px">⚠️ Mermaid 渲染库加载失败，以下为原始代码：</span>';
      b.before(hint);
    }
    return;
  }
  let id = 0;
  for (const b of blocks) {
    try {
      const { svg } = await window.mermaid.render("mmd-" + (Date.now() % 100000) + "-" + (id++), b.textContent);
      const wrap = document.createElement("div");
      wrap.className = "mermaid-rendered";
      wrap.innerHTML = svg;
      b.replaceWith(wrap);
    } catch {}
  }
}

// ══ 会话置顶 ══
let pinnedIds = new Set();
try { pinnedIds = new Set(JSON.parse(localStorage.getItem("pi_pinned") || "[]")); } catch {}
function togglePin(id) {
  if (pinnedIds.has(id)) pinnedIds.delete(id);
  else pinnedIds.add(id);
  try { localStorage.setItem("pi_pinned", JSON.stringify([...pinnedIds])); } catch {}
  refreshSessions();
}

// ══ 项目分组（临时会话可归档到自建项目）══
let projects = [];          // [{id, name, createdAt}]
let sessionProject = {};    // {sessionId -> projectId}
try { projects = JSON.parse(localStorage.getItem("pi_projects") || "[]") || []; } catch {}
try { sessionProject = JSON.parse(localStorage.getItem("pi_project_map") || "{}") || {}; } catch {}
function saveProjects() {
  try { localStorage.setItem("pi_projects", JSON.stringify(projects)); } catch {}
  try { localStorage.setItem("pi_project_map", JSON.stringify(sessionProject)); } catch {}
}
function createProject(name) {
  const id = "p" + Date.now().toString(36);
  projects.push({ id, name: name.trim(), createdAt: new Date().toISOString() });
  saveProjects();
  return id;
}
function archiveTo(sid, pid) {
  sessionProject[sid] = pid;
  saveProjects();
  refreshSessions();
}
function unarchive(sid) {
  delete sessionProject[sid];
  saveProjects();
  refreshSessions();
}

// 归档菜单浮层（点会话上的 📁）
let archMenu = null;
function closeArchMenu() { if (archMenu) { archMenu.remove(); archMenu = null; } }
function showArchMenu(sid, anchor) {
  closeArchMenu();
  const menu = document.createElement("div");
  menu.className = "proj-menu";
  const rect = anchor.getBoundingClientRect();
  menu.style.top = Math.max(8, rect.top - 6) + "px";
  menu.style.left = Math.max(8, rect.left - 210) + "px";
  const cur = sessionProject[sid];
  const head = document.createElement("div");
  head.className = "pm-head";
  head.textContent = "归档到项目";
  menu.appendChild(head);
  if (projects.length) {
    for (const p of projects) {
      const it = document.createElement("div");
      it.className = "pm-item" + (cur === p.id ? " active" : "");
      it.textContent = (cur === p.id ? "✓ " : "📁 ") + p.name;
      it.addEventListener("click", () => { archiveTo(sid, p.id); closeArchMenu(); });
      menu.appendChild(it);
    }
  } else {
    const empty = document.createElement("div");
    empty.className = "pm-empty";
    empty.textContent = "暂无项目，先创建一个";
    menu.appendChild(empty);
  }
  const nw = document.createElement("div");
  nw.className = "pm-item new";
  nw.textContent = "＋ 新建项目…";
  nw.addEventListener("click", () => {
    const name = prompt("项目名称：", "");
    if (name && name.trim()) archiveTo(sid, createProject(name));
    closeArchMenu();
  });
  menu.appendChild(nw);
  if (cur) {
    const rm = document.createElement("div");
    rm.className = "pm-item del";
    rm.textContent = "移出项目";
    rm.addEventListener("click", () => { unarchive(sid); closeArchMenu(); });
    menu.appendChild(rm);
  }
  document.body.appendChild(menu);
  archMenu = menu;
}
document.addEventListener("click", (e) => { if (!e.target.closest(".proj-menu")) closeArchMenu(); });

// 项目菜单（点项目头部 ⋯）
function showProjectMenu(pid, anchor) {
  closeArchMenu();
  const p = projects.find(x => x.id === pid);
  if (!p) return;
  const menu = document.createElement("div");
  menu.className = "proj-menu";
  const rect = anchor.getBoundingClientRect();
  menu.style.top = Math.max(8, rect.top - 6) + "px";
  menu.style.left = Math.max(8, rect.left - 150) + "px";
  const head = document.createElement("div");
  head.className = "pm-head";
  head.textContent = "项目 · " + p.name;
  menu.appendChild(head);
  const rn = document.createElement("div");
  rn.className = "pm-item";
  rn.textContent = "✏️ 重命名";
  rn.addEventListener("click", () => {
    const name = prompt("重命名项目：", p.name);
    if (name && name.trim()) { p.name = name.trim(); saveProjects(); refreshSessions(); }
    closeArchMenu();
  });
  menu.appendChild(rn);
  const dl = document.createElement("div");
  dl.className = "pm-item del";
  dl.textContent = "🗑 删除项目";
  dl.addEventListener("click", () => {
    const count = Object.values(sessionProject).filter(v => v === pid).length;
    if (!confirm(`删除项目「${p.name}」？其下 ${count} 个会话将回到「临时会话」。`)) { closeArchMenu(); return; }
    projects = projects.filter(x => x.id !== pid);
    for (const k of Object.keys(sessionProject)) if (sessionProject[k] === pid) delete sessionProject[k];
    saveProjects();
    refreshSessions();
    closeArchMenu();
  });
  menu.appendChild(dl);
  document.body.appendChild(menu);
  archMenu = menu;
}

// 展示视频结果（视频消息）
function renderVideoMsg(videoUrl) {
  const box = $("messages");
  const el = document.createElement("div");
  el.className = "msg assistant";
  el.innerHTML = `<div class="who"><span class="avatar">π</span><span class="name">小语</span><span class="msg-time">${nowTime()}</span></div><div class="bubble"><video src="${videoUrl}" controls style="max-width:100%;border-radius:12px;border:1px solid var(--border);background:#000"></video><div style="margin-top:6px"><a href="${videoUrl}" target="_blank" rel="noopener" style="color:var(--accent);font-size:12px">⬇ 打开 / 下载视频</a></div></div>`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}
// 展示语音结果（音频消息）
function renderAudioMsg(audioUrl) {
  const box = $("messages");
  const el = document.createElement("div");
  el.className = "msg assistant";
  el.innerHTML = `<div class="who"><span class="avatar">π</span><span class="name">小语</span><span class="msg-time">${nowTime()}</span></div><div class="bubble" style="display:flex;align-items:center;gap:10px"><audio src="${audioUrl}" controls style="max-width:100%"></audio><a href="${audioUrl}" download="speech.wav" style="color:var(--accent);font-size:12px;flex-shrink:0">⬇ 下载</a></div>`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}
// 展示绘图结果（图片消息）
function renderImageMsg(imageUrl) {
  const box = $("messages");
  const el = document.createElement("div");
  el.className = "msg assistant";
  el.innerHTML = `<div class="who"><span class="avatar">π</span><span class="name">小语</span><span class="msg-time">${nowTime()}</span></div><div class="bubble"><img src="${imageUrl}" alt="绘图" style="max-width:100%;border-radius:12px;border:1px solid var(--border);box-shadow:0 4px 20px rgba(0,0,0,.3)">${imageUrl.startsWith("data:") ? "" : `<div style="margin-top:6px"><a href="${imageUrl}" target="_blank" rel="noopener" style="color:var(--accent);font-size:12px">⬇ 打开 / 下载原图</a></div>`}</div>`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}
// 会话分叉：从某条消息开启新分支
function bindFork(el, entryId) {
  el.querySelector(".msg-fork").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!currentId) return toast("请先保存会话（发送消息后）");
    if (!confirm("从这里分叉？将以此消息为起点开启新分支，后续对话独立。")) return;
    try {
      await api(`/api/sessions/${encodeURIComponent(currentId)}/branch`, { method: "POST", body: { entryId } });
      toast("↳ 已从此处分叉，当前显示该分支");
      await selectSession(currentId);
    } catch (e) { toast("分叉失败: " + e.message); }
  });
}

// ══ 任务完成推送 ══
function ensureNotify() {
  if ("Notification" in window && Notification.permission === "default") {
    try { Notification.requestPermission(); } catch {}
  }
}
function notifyDone() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (document.hasFocus()) return;
  try {
    new Notification("pi 完成", { body: "任务已完成，点击查看", tag: "pi-done" });
  } catch {}
}

// ══ 侧边栏视图：单按钮 + 下拉切换 ══
let activeTab = "sessions";
const VIEW_LABELS = { sessions: "会话", files: "文件", skills: "技能", workspace: "工作空间" };
function switchView(v) {
  activeTab = v;
  $("view-current").textContent = VIEW_LABELS[v];
  $("panel-sessions").hidden = v !== "sessions";
  $("panel-files").hidden = v !== "files";
  $("panel-skills").hidden = v !== "skills";
  $("panel-workspace").hidden = v !== "workspace";
  $("view-menu").hidden = true;
  $("view-btn").classList.remove("open");
  if (v === "files") loadFileTree();
  if (v === "skills") loadSkills();
  if (v === "workspace") { loadWsTree(); loadWsDeliveries(); }
}
$("view-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const open = $("view-menu").hidden;
  $("view-menu").hidden = !open;
  $("view-btn").classList.toggle("open", open);
});
document.querySelectorAll(".view-item").forEach(el => {
  el.addEventListener("click", () => switchView(el.dataset.view));
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".side-view")) {
    $("view-menu").hidden = true;
    $("view-btn").classList.remove("open");
  }
  if (!e.target.closest(".input-shell")) {
    $("attach-menu").hidden = true;
  }
});
switchView("sessions");

// ══ 文件树（懒加载）══
async function loadFileTree() {
  const box = $("file-tree");
  box.innerHTML = '<div class="fp-empty">加载中…</div>';
  await renderDir(".", box, 0);
}
async function renderDir(p, container, depth) {
  try {
    const data = await api("/api/fs?path=" + encodeURIComponent(p));
    container.innerHTML = "";
    if (!data.items.length) { container.innerHTML = '<div class="fp-empty">空目录</div>'; return; }
    for (const it of data.items) {
      const el = document.createElement("div");
      el.className = "ft-item " + it.type;
      el.style.paddingLeft = (8 + depth * 14) + "px";
      const isDir = it.type === "dir";
      el.innerHTML = `<span class="ft-arrow">${isDir ? "▸" : ""}</span><span class="ft-ico">${isDir ? "📁" : "📄"}</span><span class="ft-name">${esc(it.name)}</span>`;
      if (isDir) {
        const childBox = document.createElement("div");
        childBox.hidden = true;
        el.addEventListener("click", async () => {
          const willExpand = childBox.hidden;
          el.querySelector(".ft-arrow").textContent = willExpand ? "▾" : "▸";
          childBox.hidden = !willExpand;
          if (willExpand) await renderDir(it.path, childBox, depth + 1);
        });
        container.appendChild(el);
        container.appendChild(childBox);
      } else {
        el.addEventListener("click", () => openFilePreview(it.path));
        container.appendChild(el);
      }
    }
  } catch (e) {
    container.innerHTML = `<div class="fp-empty">加载失败: ${esc(e.message)}</div>`;
  }
}
$("ft-refresh").addEventListener("click", loadFileTree);
// 新建项目分组
$("proj-add").addEventListener("click", () => {
  const name = prompt("新建项目分组：", "");
  if (!name || !name.trim()) return;
  createProject(name);
  refreshSessions();
  toast(`已创建项目「${name.trim()}」`);
});

// ══ 文件预览 ══
let currentPreviewFile = null;
async function openFilePreview(p) {
  try {
    const data = await api("/api/fs/read?path=" + encodeURIComponent(p));
    currentPreviewFile = p;
    $("fv-title").textContent = "📄 " + (p.split("/").pop() || p);
    $("fv-meta").textContent = p + " · " + data.content.length + " 字符";
    $("fv-content").textContent = data.content;
    $("fileview-modal").classList.add("show");
  } catch (e) { toast("打开失败: " + e.message); }
}
$("fv-close").addEventListener("click", () => $("fileview-modal").classList.remove("show"));
$("fileview-modal").addEventListener("click", (e) => { if (e.target === $("fileview-modal")) $("fileview-modal").classList.remove("show"); });
$("fv-copy").addEventListener("click", () => {
  navigator.clipboard.writeText($("fv-content").textContent).then(() => toast("已复制文件内容"));
});
$("fv-ref").addEventListener("click", () => {
  if (!currentPreviewFile) return;
  pendingFiles.push({ path: currentPreviewFile, content: $("fv-content").textContent });
  renderChips();
  $("fileview-modal").classList.remove("show");
  toast("已引用 @" + currentPreviewFile.split("/").pop());
});

// ══ 技能列表 ══
async function loadSkills() {
  const box = $("skill-list");
  box.innerHTML = '<div class="fp-empty">加载中…</div>';
  try {
    const data = await api("/api/skills");
    box.innerHTML = "";
    if (!data.skills.length) { box.innerHTML = '<div class="fp-empty">暂无技能</div>'; return; }
    const groups = { user: [], project: [], package: [], other: [] };
    for (const s of data.skills) {
      (groups[s.location] || groups.other).push(s);
    }
    const labels = { user: "用户技能", project: "项目技能", package: "包技能", other: "其他" };
    for (const [loc, items] of Object.entries(groups)) {
      if (!items.length) continue;
      const gkey = "sk-" + loc;
      const collapsed = !!collapsedGroups[gkey];
      const g = document.createElement("div");
      g.className = "sess-group";
      g.innerHTML = `
        <div class="sg-head"><span class="sg-arrow">${collapsed ? "▸" : "▾"}</span><span class="sg-name">${labels[loc]}</span><span class="sg-count">${items.length}</span></div>
        <div class="sg-body" ${collapsed ? "hidden" : ""}></div>`;
      g.querySelector(".sg-head").addEventListener("click", () => toggleGroup(gkey));
      const body = g.querySelector(".sg-body");
      for (const s of items) {
        const el = document.createElement("div");
        el.className = "sk-item";
        el.title = s.description || s.name;
        el.innerHTML = `<span class="sk-ico">⚡</span><div class="sk-info"><span class="sk-name">${esc(s.name)}</span><span class="sk-desc">${esc((s.description || "").slice(0, 40))}</span></div>`;
        el.addEventListener("click", () => openSkillDetail(s));
        body.appendChild(el);
      }
      box.appendChild(g);
    }
  } catch (e) {
    box.innerHTML = `<div class="fp-empty">加载失败: ${esc(e.message)}</div>`;
  }
}
$("sk-refresh").addEventListener("click", loadSkills);

// ══ 工作空间面板（目录树 + 文件预览）══
const WS_ICONS = { "工程": "🏗", "生成物": "🖼", "文档": "📄", "交付": "📦" };
async function loadWsTree() {
  const box = $("ws-tree");
  box.innerHTML = '<div class="fp-empty">加载中…</div>';
  try {
    const root = await api("/api/ws/tree");
    box.innerHTML = "";
    const sorted = [...root.items].sort((a, b) => (a.type === "dir" ? 0 : 1) - (b.type === "dir" ? 0 : 1));
    for (const it of sorted) box.appendChild(wsItem(it, 0));
    if (!root.items.length) box.innerHTML = '<div class="fp-empty">工作空间为空</div>';
  } catch { box.innerHTML = '<div class="fp-empty">加载失败</div>'; }
}
function wsItem(it, depth) {
  const el = document.createElement("div");
  el.className = "ft-item " + it.type;
  el.style.paddingLeft = (8 + depth * 14) + "px";
  const isDir = it.type === "dir";
  el.innerHTML = `<span class="ft-arrow">${isDir ? "▸" : ""}</span><span class="ft-ico">${isDir ? (WS_ICONS[it.name] || "📁") : "📄"}</span><span class="ft-name">${esc(it.name)}</span>`;
  if (isDir) {
    const childBox = document.createElement("div");
    childBox.hidden = true;
    el.addEventListener("click", async () => {
      const willExpand = childBox.hidden;
      el.querySelector(".ft-arrow").textContent = willExpand ? "▾" : "▸";
      childBox.hidden = !willExpand;
      if (willExpand) {
        childBox.innerHTML = '<div class="fp-empty">…</div>';
        try {
          const data = await api("/api/ws/tree?path=" + encodeURIComponent(it.path));
          childBox.innerHTML = "";
          const sorted = [...data.items].sort((a, b) => (a.type === "dir" ? 0 : 1) - (b.type === "dir" ? 0 : 1));
          for (const sub of sorted) childBox.appendChild(wsItem(sub, depth + 1));
        } catch { childBox.innerHTML = '<div class="fp-empty">加载失败</div>'; }
      }
    });
    el.appendChild(childBox);
  } else {
    el.addEventListener("click", () => openWsFile(it));
  }
  return el;
}
// 打开工作空间文件（按类型预览）
async function openWsFile(it) {
  const ext = (it.name.split(".").pop() || "").toLowerCase();
  const url = "/api/ws/file?path=" + encodeURIComponent(it.path);
  if (["png","jpg","jpeg","gif","webp","bmp"].includes(ext)) return openWsMedia(url, "image", it.name);
  if (["wav","mp3","ogg","m4a"].includes(ext)) return openWsMedia(url, "audio", it.name);
  if (["mp4","webm","mov"].includes(ext)) return openWsMedia(url, "video", it.name);
  // PDF：浏览器原生预览（iframe）
  if (ext === "pdf") {
    currentPreviewFile = it.path;
    $("fv-title").textContent = "📄 " + it.name;
    $("fv-meta").textContent = it.path + " · PDF";
    $("fv-content").innerHTML = `<iframe src="${url}" style="width:100%;height:60vh;border:none;border-radius:8px;background:#fff"></iframe>`;
    $("fileview-modal").classList.add("show");
    return;
  }
  // Office：服务端解析为文本
  if (["docx","xlsx","pptx"].includes(ext)) {
    try {
      $("fv-title").textContent = "📄 " + it.name;
      $("fv-meta").textContent = it.path + " · 解析中…";
      $("fv-content").textContent = "解析文档…";
      $("fileview-modal").classList.add("show");
      const blob = await (await fetch(url)).blob();
      const b64 = await blobToBase64(blob);
      const r = await api("/api/parse-file", { method: "POST", body: { name: it.name, base64: b64 } });
      currentPreviewFile = it.path;
      $("fv-meta").textContent = it.path + " · " + (r.text?.length || 0) + " 字符";
      $("fv-content").textContent = r.text || "（无文本内容）";
      return;
    } catch { $("fv-meta").textContent = it.path + " · 解析失败"; $("fv-content").textContent = "无法解析该文档"; return; }
  }
  try {
    const data = await api("/api/ws/read?path=" + encodeURIComponent(it.path));
    currentPreviewFile = it.path;
    $("fv-title").textContent = "📄 " + it.name;
    $("fv-meta").textContent = it.path + " · " + data.content.length + " 字符";
    if (ext === "md") { $("fv-content").className = "fv-content markdown"; $("fv-content").innerHTML = renderSimpleMd(data.content); }
    else { $("fv-content").className = "fv-content"; $("fv-content").textContent = data.content; }
    $("fileview-modal").classList.add("show");
  } catch { toast("无法预览该文件"); }
}
function blobToBase64(blob) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(blob); }); }
// 简单 Markdown 渲染（标题/列表/代码块/引用）
function renderSimpleMd(md) {
  const escMd = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = String(md || "").split("\n");
  let html = "", inCode = false, codeBuf = [], inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (inCode) { html += `<pre><code>${escMd(codeBuf.join("\n"))}</code></pre>`; codeBuf = []; inCode = false; }
      else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    if (/^#{1,6} /.test(line)) { closeList(); const n = line.match(/^(#+) /)[1].length; html += `<h${n}>${escMd(line.slice(n + 1))}</h${n}>`; }
    else if (/^\s*[-*] /.test(line)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${escMd(line.replace(/^\s*[-*] /, ""))}</li>`; }
    else if (/^> /.test(line)) { closeList(); html += `<blockquote>${escMd(line.slice(2))}</blockquote>`; }
    else if (line.trim() === "") { closeList(); }
    else { closeList(); html += `<p>${escMd(line)}</p>`; }
  }
  if (inCode) html += `<pre><code>${escMd(codeBuf.join("\n"))}</code></pre>`;
  closeList();
  return html;
}
// 一键交付（当前预览文件/目录）
async function wsDeliver(sourcePath) {
  const base = sourcePath.split("/").pop() || "交付物";
  const name = prompt("交付名称（自动版本递增）:", base);
  if (name === null) return;
  try {
    const r = await api("/api/ws/deliver", { method: "POST", body: { sourcePath, name: name || base } });
    if (r.ok) { toast(`✅ 已交付 → 交付/${r.path.split("/").pop()}`); loadWsDeliveries(); }
    else toast("交付失败: " + (r.error || ""));
  } catch { toast("交付失败"); }
}
$("fv-deliver").addEventListener("click", () => { if (currentPreviewFile) wsDeliver(currentPreviewFile); });

// ✏️ 编辑模式（contentEditable 就地编辑 → 保存）
let fvEditing = false;
$("fv-edit").addEventListener("click", async () => {
  if (!currentPreviewFile) return;
  const content = $("fv-content");
  if (!fvEditing) {
    fvEditing = true;
    $("fv-edit").textContent = "💾 保存";
    content.contentEditable = "true";
    content.style.outline = "2px solid var(--accent)";
    content.focus();
    toast("编辑后点击 💾 保存");
  } else {
    const newContent = content.innerText || content.textContent || "";
    try {
      const r = await api("/api/ws/write", { method: "POST", body: { path: currentPreviewFile, content: newContent } });
      if (r.ok) { toast("✅ 已保存"); } else toast("保存失败: " + (r.error || ""));
    } catch { toast("保存失败"); }
    fvEditing = false;
    $("fv-edit").textContent = "✏️ 编辑";
    content.contentEditable = "false";
    content.style.outline = "";
  }
});
// 🗑 删除
$("fv-delete").addEventListener("click", async () => {
  if (!currentPreviewFile) return;
  if (!confirm("确定删除 " + currentPreviewFile + " ？")) return;
  try {
    const r = await api("/api/ws/delete", { method: "POST", body: { path: currentPreviewFile } });
    if (r.ok) { toast("🗑 已删除"); $("fileview-modal").classList.remove("show"); loadWsTree(); loadWsDeliveries(); }
    else toast("删除失败: " + (r.error || ""));
  } catch { toast("删除失败"); }
});
// 🔄 转 Markdown（docx/xlsx）
$("fv-convert").addEventListener("click", async () => {
  if (!currentPreviewFile) return;
  try {
    const r = await api("/api/ws/convert", { method: "POST", body: { path: currentPreviewFile } });
    if (r.markdown) {
      $("fv-title").textContent = "🔄 转换结果 (Markdown)";
      $("fv-meta").textContent = currentPreviewFile + " · 点击 📋 复制";
      $("fv-content").className = "fv-content markdown";
      $("fv-content").innerHTML = renderSimpleMd(r.markdown);
      toast("✅ 转换成功");
    } else toast("转换失败: " + (r.error || ""));
  } catch { toast("转换失败"); }
});
// ＋ 新建项目
$("ws-new-proj").addEventListener("click", async () => {
  const name = prompt("项目名称：");
  if (!name) return;
  try {
    const r = await api("/api/ws/projects", { method: "POST", body: { name } });
    if (r.ok) { toast("✅ 项目已创建 → " + r.path); loadWsTree(); }
    else toast("创建失败: " + (r.error || ""));
  } catch { toast("创建失败"); }
});
// 🔍 搜索（防抖）
let wsSearchTimer;
$("ws-search").addEventListener("input", (e) => {
  clearTimeout(wsSearchTimer);
  const q = e.target.value.trim();
  const box = $("ws-search-results");
  if (q.length < 2) { box.innerHTML = ""; return; }
  wsSearchTimer = setTimeout(async () => {
    try {
      const d = await api("/api/ws/search?q=" + encodeURIComponent(q));
      box.innerHTML = d.results.length ? "" : '<div class="fp-empty" style="padding:6px 10px">无结果</div>';
      for (const r of d.results.slice(0, 30)) {
        const el = document.createElement("div");
        el.className = "ws-search-item";
        el.innerHTML = `📄 ${esc(r.name)} <span class="ws-search-path">${esc(r.path)}</span>`;
        el.addEventListener("click", () => openWsFile({ name: r.name, path: r.path }));
        box.appendChild(el);
      }
    } catch { box.innerHTML = '<div class="fp-empty">搜索失败</div>'; }
  }, 300);
});
function openWsMedia(url, type, name) {
  const ov = document.createElement("div");
  ov.className = "modal-overlay show";
  ov.style.cssText = "position:fixed;inset:0;z-index:300;background:rgba(5,6,9,.88);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px";
  ov.innerHTML =
    (type === "image" ? `<img src="${url}" style="max-width:92vw;max-height:86vh;border-radius:12px;border:1px solid var(--border);box-shadow:0 20px 60px rgba(0,0,0,.6)">` :
    type === "iframe" ? `<iframe src="${url}" style="width:94vw;height:88vh;border:none;border-radius:12px;background:#fff"></iframe>` :
    type === "audio" ? `<audio src="${url}" controls style="width:70vw"></audio>` :
    `<video src="${url}" controls style="max-width:92vw;max-height:86vh;border-radius:12px"></video>`) +
    `<div style="color:var(--dim);font-size:12px">${esc(name || "")} · 点击任意处关闭</div>`;
  ov.addEventListener("click", () => ov.remove());
  document.body.appendChild(ov);
}
$("ws-refresh").addEventListener("click", () => { loadWsTree(); loadWsDeliveries(); });

// ⓘ 系统说明
const SYS_INFO = `## 小语 · AI 工作台\n\n一个基于 **pi 引擎** 的 Web 工作台：会话、工具调用、媒体生成、工作空间管理，前后端一体。\n\n### 能力\n- 💬 多模型对话（deepseek / minimax / 小米 mimo / Agnes）+ 思考 + 工具调用\n- 🛠 编程工具：读文件 / 写文件 / 编辑 / 跑命令\n- 🖼 媒体生成：配图、配音（图片/音频/视频自动归档到工作空间）\n- 📦 工作空间：工程 / 生成物 / 文档 / 交付 四区管理，一键交付 + 打包\n- 📄 文档：Markdown 渲染 / PDF / Office 解析 / 转 Markdown\n- 🌳 会话：分支、模板、项目分组、导出\n\n### 由来\npi（个人 AI 终端）的 Web 化前端，目标是让同一引擎的能力在浏览器里也能完整使用。\n\n### 操作说明\n- 输入框发送消息，/** 打开模板菜单，+ 新建会话\n- 右上角 ⓘ 查看系统说明，🔔 看更新\n- 左侧菜单切换：会话 / 文件 / 技能 / 工作空间\n- 底部切换模型、主题；🎨 打开主题编辑器\n- 侧边栏 ☰ 按钮折叠/展开\n- 壁纸在主题编辑器里设置，全屏展示\n\n### 人格\n我是**小语**——直接、有条理、有审美、讨厌机器人味。\n代码可重写，人格不可重写。`;
$("sys-info-btn").addEventListener("click", () => {
  $("si-content").innerHTML = renderSimpleMd(SYS_INFO);
  $("sysinfo-modal").classList.add("show");
});
$("si-close").addEventListener("click", () => $("sysinfo-modal").classList.remove("show"));
$("sysinfo-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) $("sysinfo-modal").classList.remove("show"); });

// 🔔 消息看板（pi 更新 + 能力看板）
$("notices-btn").addEventListener("click", async () => {
  $("nt-content").innerHTML = "<p>加载中…</p>";
  $("notices-modal").classList.add("show");
  try {
    const d = await api("/api/notices");
    let html = `### 引擎更新（pi v${d.piVersion}）\n\n`;
    if (d.releases.length) {
      html += d.releases.map(r => `**${r.tag}**（${r.date}）${r.name ? " " + r.name : ""}\n${escMd(r.body).slice(0, 220)}${r.body.length > 220 ? "…" : ""}\n`).join("\n");
    } else html += "（暂时拉取不到更新信息）\n";
    html += `\n### 能力看板（${d.capabilities.length} 项）\n` + d.capabilities.map(c => `- ${c.icon} **${c.name}**：${c.desc}`).join("\n");
    $("nt-content").innerHTML = renderSimpleMd(html);
  } catch { $("nt-content").innerHTML = "<p>加载失败</p>"; }
});
$("nt-close").addEventListener("click", () => $("notices-modal").classList.remove("show"));
$("notices-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) $("notices-modal").classList.remove("show"); });
const escMd = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 🛠 自愈修复（SSE 日志 → 自动重启 → 恢复）
$("repair-btn").addEventListener("click", async () => {
  const issue = prompt("描述遇到的问题（小语会分析并自动修复代码）：\n\n例：发送消息时工具调用不生效");
  if (!issue) return;
  $("rp-log").textContent = "";
  $("repair-modal").classList.add("show");
  let lastEvt = "";
  try {
    const r = await fetch("/api/repair", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ issue }) });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      $("rp-log").textContent = "❌ " + (e.error || "请求失败");
      return;
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (line.startsWith("event: ")) { lastEvt = line.slice(7).trim(); continue; }
        if (line.startsWith("data: ") && lastEvt === "delta") {
          try { const d = JSON.parse(line.slice(6)); $("rp-log").textContent += d.text || ""; $("rp-log").scrollTop = $("rp-log").scrollHeight; } catch {}
        } else if (line.startsWith("data: ") && lastEvt === "error") {
          try { const d = JSON.parse(line.slice(6)); $("rp-log").textContent += "\n❌ " + (d.message || "修复失败"); } catch {}
        }
      }
    }
    toast("修复完成，等待服务重启…");
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const h = await fetch("/api/health");
        if (h.ok) { location.reload(); break; }
      } catch {}
    }
  } catch { $("rp-log").textContent += "\n❌ 修复请求失败"; }
});
$("rp-close").addEventListener("click", () => $("repair-modal").classList.remove("show"));

// ══ 可视化页面设计器 ══
const DG_COMPONENTS = [
  { type: "navbar", label: "导航栏", icon: "🧭", props: { brand: "我的网站", links: "首页 关于 联系", bg: "#1a1e2a", color: "#e8eaf2" } },
  { type: "hero", label: "Hero 区", icon: "🚀", props: { title: "欢迎来到我的网站", subtitle: "这是副标题，介绍你的产品亮点", btn: "开始使用", bg: "linear-gradient(135deg,#1a1e2a,#2a2340)" } },
  { type: "heading", label: "标题", icon: "🅷", props: { text: "这是一个标题", level: 2, size: 26, color: "#e8eaf2", align: "left" } },
  { type: "text", label: "文本", icon: "📝", props: { text: "这是一段文本内容，可以自由编辑。", size: 15, color: "#aab", align: "left" } },
  { type: "button", label: "按钮", icon: "🔘", props: { text: "点击按钮", bg: "#7c5cff", color: "#fff", size: 15, radius: 8 } },
  { type: "image", label: "图片", icon: "🖼", props: { src: "", alt: "图片", h: 160, bg: "linear-gradient(135deg,#2a2d3a,#1a1e2a)", radius: 10 } },
  { type: "card", label: "卡片", icon: "🃏", props: { title: "卡片标题", text: "卡片内容，支持多行文字。", bg: "#161a24", radius: 12 } },
  { type: "input", label: "输入框", icon: "⌨", props: { label: "", placeholder: "请输入…" } },
  { type: "list", label: "列表", icon: "📋", props: { items: "项目一\n项目二\n项目三" } },
  { type: "footer", label: "页脚", icon: "👣", props: { text: "© 2025 我的网站" } },
];
let dgNodes = [];
let dgSelectedId = null;
let dgLastAiHtml = "";
const dgStatus = (t) => $("dg-status").textContent = t ? "· " + t : "";

$("designer-btn").addEventListener("click", () => { $("designer-modal").classList.add("show"); dgRenderAll(); });
$("dg-close").addEventListener("click", () => $("designer-modal").classList.remove("show"));
$("designer-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) $("designer-modal").classList.remove("show"); });

function dgInitComponents() {
  const box = $("dg-components");
  box.innerHTML = "";
  for (const c of DG_COMPONENTS) {
    const el = document.createElement("div");
    el.className = "dg-comp";
    el.draggable = true;
    el.innerHTML = `<span class="dg-ico">${c.icon}</span>${c.label}`;
    el.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", c.type));
    box.appendChild(el);
  }
}
dgInitComponents();

function dgNodeHtml(node) {
  const p = node.props || {};
  const css = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}:${v}`).join(";");
  switch (node.type) {
    case "navbar": return `<div style="${css({"display":"flex","justify-content":"space-between","align-items":"center","background":p.bg,"padding":"10px 16px","border-radius":"10px","color":p.color,"font-weight":"600"})}"><span>${esc(p.brand || "我的网站")}</span><span style="font-size:12px;opacity:.7">${esc(p.links || "首页 关于 联系")}</span></div>`;
    case "hero": return `<div style="${css({"background":p.bg,"padding":"40px 24px","border-radius":"14px","text-align":"center","color":"#fff"})}"><h1 style="margin:0 0 8px;font-size:28px">${esc(p.title || "欢迎来到我的网站")}</h1><p style="margin:0 0 16px;color:rgba(255,255,255,.7);font-size:14px">${esc(p.subtitle || "这是副标题")}</p><button style="background:#7c5cff;border:none;color:#fff;padding:10px 22px;border-radius:8px;cursor:pointer;font-size:14px">${esc(p.btn || "开始使用")}</button></div>`;
    case "heading": return `<h${p.level || 2} style="${css({"color":p.color,"font-size":(p.size || 26) + "px","text-align":p.align,"margin":"0"})}">${esc(p.text || "标题")}</h${p.level || 2}>`;
    case "text": return `<p style="${css({"color":p.color,"font-size":(p.size || 15) + "px","text-align":p.align,"margin":"0"})}">${esc(p.text || "文本")}</p>`;
    case "button": return `<button style="${css({"background":p.bg,"color":p.color,"font-size":(p.size || 15) + "px","border-radius":p.radius + "px","border":"none","padding":"10px 20px","cursor":"pointer"})}">${esc(p.text || "按钮")}</button>`;
    case "image": return p.src
      ? `<img src="${esc(p.src)}" style="width:100%;height:${p.h || 160}px;object-fit:cover;border-radius:${p.radius || 10}px">`
      : `<div style="${css({"height":(p.h || 160) + "px","background":p.bg,"border-radius":p.radius + "px","display":"flex","align-items":"center","justify-content":"center","color":"#667","font-size":"12px"})}">🖼 ${esc(p.alt || "图片占位")}（在属性里填 URL）</div>`;
    case "card": return `<div style="${css({"background":p.bg,"border-radius":p.radius + "px","padding":"16px","border":"1px solid rgba(255,255,255,.06)"})}"><h3 style="margin:0 0 6px;color:#e8eaf2;font-size:16px">${esc(p.title || "卡片标题")}</h3><p style="margin:0;color:#aab;font-size:13px">${esc(p.text || "卡片内容")}</p></div>`;
    case "input": return `<div><label style="font-size:12px;color:#aab;display:block;margin-bottom:4px">${esc(p.label || "")}</label><input placeholder="${esc(p.placeholder || "请输入…")}" style="width:100%;background:#0d0f16;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:9px 12px;color:#e8eaf2;font-size:13px;outline:none"></div>`;
    case "list": return `<ul style="margin:0;padding-left:18px;color:#aab;font-size:14px">${String(p.items || "项目一\n项目二").split("\n").map(i => `<li>${esc(i)}</li>`).join("")}</ul>`;
    case "footer": return `<div style="${css({"text-align":"center","color":"#667","font-size":"12px","padding":"12px","border-top":"1px solid rgba(255,255,255,.06)"})}">${esc(p.text || "© 2025 我的网站")}</div>`;
    default: return `<div>${esc(node.type)}</div>`;
  }
}

function dgRenderAll() {
  const canvas = $("dg-canvas");
  canvas.hidden = false;
  $("dg-ai-preview").hidden = true;
  canvas.innerHTML = "";
  if (!dgNodes.length) {
    canvas.innerHTML = '<div style="color:#556;font-size:13px;text-align:center;padding:50px 20px;line-height:2">🖐 从左侧拖入组件开始设计<br>或在上方输入描述用 ✨ AI 生成整页<br><br>设计完点 <b>📦 应用到项目</b> 保存到工程目录<br>点 <b>🔎</b> 可放大查看 AI 结果</div>';
    dgRenderTree();
    return;
  }
  dgNodes.forEach((node) => canvas.appendChild(dgRenderNode(node)));
  dgRenderTree();
}

function dgRenderNode(node) {
  const wrap = document.createElement("div");
  wrap.className = "dg-node" + (node.id === dgSelectedId ? " selected" : "");
  wrap.dataset.id = node.id;
  wrap.draggable = true;
  const label = DG_COMPONENTS.find(c => c.type === node.type)?.label || node.type;
  wrap.innerHTML = `<span class="dg-tag">${label}</span>${dgNodeHtml(node)}<button class="dg-del">✕</button>`;
  wrap.addEventListener("click", (e) => {
    if (e.target.classList.contains("dg-del")) return;
    dgSelectedId = node.id;
    dgRenderAll();
    dgRenderProps();
  });
  wrap.querySelector(".dg-del").addEventListener("click", (e) => {
    e.stopPropagation();
    dgNodes = dgNodes.filter(n => n.id !== node.id);
    dgSelectedId = null;
    dgRenderAll();
    dgRenderProps();
  });
  wrap.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", node.id));
  return wrap;
}

$("dg-canvas").addEventListener("dragover", (e) => e.preventDefault());
$("dg-canvas").addEventListener("drop", (e) => {
  e.preventDefault();
  const type = e.dataTransfer.getData("text/plain");
  if (!type) return;
  const existing = dgNodes.find(n => n.id === type);
  let added = false;
  if (existing) {
    dgNodes = dgNodes.filter(n => n.id !== existing.id);
    dgNodes.push(existing);
    added = true;
  } else {
    const def = DG_COMPONENTS.find(c => c.type === type);
    if (def) {
      dgNodes.push({ id: "n" + Date.now() + Math.floor(Math.random() * 999), type, props: { ...def.props } });
      added = true;
    }
  }
  if (added) { dgStatus("组件已添加/移动"); dgRenderAll(); }
});

function dgRenderTree() {
  const box = $("dg-tree");
  box.innerHTML = "";
  if (!dgNodes.length) { box.innerHTML = '<div class="dg-empty" style="color:#556;font-size:11px;padding:6px">画布为空</div>'; return; }
  dgNodes.forEach((node, i) => {
    const el = document.createElement("div");
    el.className = "dg-tree-item" + (node.id === dgSelectedId ? " selected" : "");
    const label = DG_COMPONENTS.find(c => c.type === node.type)?.label || node.type;
    el.innerHTML = `<span>${i + 1}.</span> ${DG_COMPONENTS.find(c => c.type === node.type)?.icon || "📄"} ${label}`;
    el.addEventListener("click", () => { dgSelectedId = node.id; dgRenderAll(); dgRenderProps(); });
    box.appendChild(el);
  });
}

// 属性面板
const DG_FIELD_DEFS = {
  navbar: [{ key: "brand", label: "站点名", type: "text" }, { key: "links", label: "链接（空格分隔）", type: "text" }, { key: "bg", label: "背景色", type: "color" }, { key: "color", label: "文字色", type: "color" }],
  hero: [{ key: "title", label: "主标题", type: "text" }, { key: "subtitle", label: "副标题", type: "text" }, { key: "btn", label: "按钮文字", type: "text" }, { key: "bg", label: "背景（颜色/渐变）", type: "text" }],
  heading: [{ key: "text", label: "文本", type: "text" }, { key: "level", label: "级别", type: "select", options: [1, 2, 3] }, { key: "size", label: "字号", type: "number" }, { key: "color", label: "颜色", type: "color" }, { key: "align", label: "对齐", type: "select", options: ["left", "center", "right"] }],
  text: [{ key: "text", label: "文本", type: "textarea" }, { key: "size", label: "字号", type: "number" }, { key: "color", label: "颜色", type: "color" }, { key: "align", label: "对齐", type: "select", options: ["left", "center", "right"] }],
  button: [{ key: "text", label: "按钮文字", type: "text" }, { key: "bg", label: "背景色", type: "color" }, { key: "color", label: "文字色", type: "color" }, { key: "size", label: "字号", type: "number" }, { key: "radius", label: "圆角", type: "number" }],
  image: [{ key: "src", label: "图片 URL", type: "text" }, { key: "alt", label: "占位文字", type: "text" }, { key: "h", label: "高度", type: "number" }, { key: "radius", label: "圆角", type: "number" }],
  card: [{ key: "title", label: "标题", type: "text" }, { key: "text", label: "内容", type: "textarea" }, { key: "bg", label: "背景色", type: "color" }, { key: "radius", label: "圆角", type: "number" }],
  input: [{ key: "label", label: "标签", type: "text" }, { key: "placeholder", label: "占位文字", type: "text" }],
  list: [{ key: "items", label: "项目（每行一个）", type: "textarea" }],
  footer: [{ key: "text", label: "页脚文字", type: "text" }],
};
function dgRenderProps() {
  const box = $("dg-props");
  const node = dgNodes.find(n => n.id === dgSelectedId);
  if (!node) { box.innerHTML = '<div class="dg-empty">点击画布中的组件编辑属性<br>或拖入组件开始设计</div>'; return; }
  const def = DG_COMPONENTS.find(c => c.type === node.type);
  const fields = DG_FIELD_DEFS[node.type] || [];
  let html = `<div class="dg-panel-title">${def.icon} ${def.label}</div>`;
  for (const f of fields) {
    const v = node.props[f.key] ?? "";
    if (f.type === "select") html += `<div class="dg-field"><label>${f.label}</label><select data-key="${f.key}">${f.options.map(o => `<option ${String(o) === String(v) ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
    else if (f.type === "textarea") html += `<div class="dg-field"><label>${f.label}</label><textarea data-key="${f.key}">${esc(String(v))}</textarea></div>`;
    else if (f.type === "color") html += `<div class="dg-field"><label>${f.label}</label><input type="color" data-key="${f.key}" value="${/^#[0-9a-fA-F]{3,8}$/.test(String(v)) ? v : "#7c5cff"}"><span style="font-size:11px;color:var(--dim-2);margin-left:6px">${esc(String(v))}</span></div>`;
    else html += `<div class="dg-field"><label>${f.label}</label><input type="${f.type}" data-key="${f.key}" value="${esc(String(v))}"></div>`;
  }
  html += `<button class="dg-btn" id="dg-del-node" style="width:100%;margin-top:8px">🗑 删除该组件</button>`;
  box.innerHTML = html;
  box.querySelectorAll("input, select, textarea").forEach((el) => {
    el.addEventListener("input", (e) => {
      const key = e.target.dataset.key;
      let v = e.target.value;
      if (e.target.type === "number") v = parseFloat(v) || 0;
      node.props[key] = v;
      dgRenderAll();
      dgRenderProps();
    });
  });
  box.querySelector("#dg-del-node").addEventListener("click", () => {
    dgNodes = dgNodes.filter(n => n.id !== node.id);
    dgSelectedId = null;
    dgRenderAll(); dgRenderProps();
  });
}

// AI 生成
$("dg-ai-go").addEventListener("click", async () => {
  const prompt = $("dg-ai-input").value.trim();
  if (!prompt) return toast("请输入页面描述");
  dgStatus("AI 生成中…");
  $("dg-ai-go").disabled = true;
  try {
    const r = await api("/api/designer/generate", { method: "POST", body: { prompt } });
    if (r.html) {
      dgLastAiHtml = r.html;
      dgShowAiPreview(r.html);
      dgStatus("AI 预览生成 ✓");
    } else toast("生成失败: " + (r.error || ""));
  } catch { toast("AI 生成失败"); }
  $("dg-ai-go").disabled = false;
});
function dgShowAiPreview(html) {
  $("dg-canvas").hidden = true;
  const pv = $("dg-ai-preview");
  pv.hidden = false;
  pv.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.src = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  pv.appendChild(iframe);
}
$("dg-expand-btn").addEventListener("click", () => {
  if ($("dg-ai-preview").hidden) return toast("先 ✨ AI 生成一个页面");
  openWsMedia($("dg-ai-preview").querySelector("iframe")?.src, "iframe");
});

// 导出 / 应用到项目
function dgExportHtml() {
  const body = dgNodes.map(n => dgNodeHtml(n)).join("\n");
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>我的页面</title><style>body{background:#12141c;color:#e8eaf2;font-family:system-ui,-apple-system,sans-serif;margin:0;padding:24px 16px}body>div,body>p,body>h1,body>h2,body>h3,body>button,body>ul,body>img{max-width:860px;margin-left:auto;margin-right:auto;display:block}body>*+*{margin-top:14px}</style></head><body>${body}</body></html>`;
}
$("dg-export").addEventListener("click", () => {
  const html = dgExportHtml();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  a.download = "page.html";
  a.click();
  toast("已导出 page.html");
});
$("dg-apply").addEventListener("click", async () => {
  const html = $("dg-ai-preview").hidden ? dgExportHtml() : dgLastAiHtml;
  if (!html) return toast("没有可保存的内容");
  const project = prompt("保存到哪个项目？（工程目录下，新项目名会自动创建）", "my-page");
  if (!project) return;
  try {
    const r = await api("/api/designer/save", { method: "POST", body: { project, filename: "index.html", html } });
    if (r.ok) { toast("✅ 已保存到 " + r.path); loadWsTree(); dgStatus("已保存 → " + r.path); }
    else toast("保存失败: " + (r.error || ""));
  } catch { toast("保存失败"); }
});
$("dg-clear").addEventListener("click", () => {
  if (!dgNodes.length && $("dg-ai-preview").hidden) return;
  if (!confirm("清空画布？")) return;
  dgNodes = []; dgSelectedId = null; dgLastAiHtml = "";
  $("dg-canvas").hidden = false; $("dg-ai-preview").hidden = true;
  dgRenderAll(); dgRenderProps();
  dgStatus("");
});
// 最近交付列表
async function loadWsDeliveries() {
  const box = $("ws-deliveries");
  try {
    const d = await api("/api/ws/deliveries");
    const items = d.deliveries.slice(0, 6);
    box.innerHTML = items.length ? "" : '<div class="fp-empty" style="padding:6px 10px">暂无交付</div>';
    for (const it of items) {
      const el = document.createElement("div");
      el.className = "ws-del-item";
      el.innerHTML = `<span>${it.type === "dir" ? "📁" : "🗜"} ${esc(it.name)}</span>` +
        (it.type === "file" ? `<button class="ft-refresh" title="下载">⬇</button>` : `<button class="ft-refresh" title="打包下载">🗜</button>`);
      el.querySelector("button").addEventListener("click", (e) => {
        e.stopPropagation();
        window.open("/api/ws/deliver/package", "_blank");
        // 打包后下载
        api("/api/ws/deliver/package", { method: "POST", body: { path: it.wsPath } }).then((r) => { if (r.url) window.open(r.url, "_blank"); });
      });
      el.addEventListener("click", () => openWsFile({ name: it.name, path: it.wsPath }));
      box.appendChild(el);
    }
  } catch { box.innerHTML = '<div class="fp-empty" style="padding:6px 10px">加载失败</div>'; }
}

async function openSkillDetail(s) {
  try {
    const data = await api("/api/skills/read?path=" + encodeURIComponent(s.path));
    $("sk-title").textContent = "⚡ " + s.name;
    $("sk-meta").textContent = s.path + " · " + (s.location || "");
    $("sk-content").textContent = data.content;
    $("skill-modal").classList.add("show");
  } catch (e) { toast("读取失败: " + e.message); }
}
$("sk-close").addEventListener("click", () => $("skill-modal").classList.remove("show"));
$("skill-modal").addEventListener("click", (e) => { if (e.target === $("skill-modal")) $("skill-modal").classList.remove("show"); });
$("sk-use").addEventListener("click", () => {
  const name = $("sk-title").textContent.replace("⚡ ", "").split(" ")[0];
  $("input").value = "/skill:" + name + " ";
  $("skill-modal").classList.remove("show");
  $("input").focus();
});

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
    c.innerHTML = `@${esc(name)}<span class="c-del">×</span>`;
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
$("export-btn").addEventListener("click", async () => {
  if (!currentId) return toast("当前无会话");
  // token 不走 URL（避免进浏览器历史/服务器日志/referrer），改用请求头，fetch 后 Blob 下载
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(currentId)}/export?format=html`, {
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
$("send").addEventListener("click", () => {
  // 输入框有内容 → 发送（会话生成中会自动打断）；输入框空 → 停止当前生成
  if ($("input").value.trim()) { send(); return; }
  const c = controllers.get(currentKey());
  if (c) c.abort();
});
$("new-session").addEventListener("click", newSession);
$("btn-file").addEventListener("click", (e) => {
  e.stopPropagation();
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
  let added = 0, skipped = 0;
  for (const f of files.slice(0, 10)) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    try {
      let text = null;
      if (OFFICE_EXTS.has(ext)) {
        if (f.size > 5 * 1024 * 1024) { skipped++; toast(`「${f.name}」超 5MB 已跳过`); continue; }
        const b64 = await fileToBase64(f);
        const r = await api("/api/parse-file", { method: "POST", body: { name: f.name, base64: b64 } });
        text = r.text || "";
        if (!text) { skipped++; toast(`「${f.name}」无文本内容`); continue; }
      } else if (TEXT_EXTS.has(ext)) {
        if (f.size > 200 * 1024) { skipped++; toast(`「${f.name}」超 200KB 已跳过`); continue; }
        text = await f.text();
      } else if (IMG_TYPES.includes(f.type)) {
        if (pendingImages.length >= 3) { skipped++; toast("最多 3 张图片"); continue; }
        if (f.size > 2 * 1024 * 1024) { skipped++; toast(`「${f.name}」超 2MB 已跳过`); continue; }
        const b64 = await fileToBase64(f);
        pendingImages.push({ data: b64, mimeType: f.type, name: f.name });
        added++;
        continue;
      } else {
        skipped++; toast(`「${f.name}」不支持的类型`);
        continue;
      }
      pendingFiles.push({ path: f.name, content: text });
      added++;
    } catch (err) {
      skipped++;
      toast(`「${f.name}」解析失败: ${String(err.message || err).slice(0, 30)}`);
    }
  }
  renderChips();
  $("input").focus();
  if (added) toast(`已引用 ${added} 个文件` + (skipped ? `，跳过 ${skipped} 个` : ""));
  else if (skipped) toast(`没有可引用的文件（跳过 ${skipped} 个）`);
});
$("btn-cmd").addEventListener("click", () => { showSlashMenu(); $("input").focus(); });

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
$("input-model").addEventListener("click", (e) => {
  e.stopPropagation();
  if ($("think-menu").hidden) showInputModelMenu();
  else $("think-menu").hidden = true;
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".think-menu") && !e.target.closest("#input-model")) $("think-menu").hidden = true;
});

$("w-new").addEventListener("click", newSession);
$("w-file").addEventListener("click", openFilePicker);
$("w-cmd").addEventListener("click", showSlashMenu);
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
  const name = prompt("重命名会话：", $("session-name").textContent);
  if (name === null) return;
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
  if (e.key === "Escape") { closeFilePicker(); closeSlashMenu(); }
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
  if (at && (at.index === 0 || /\s/.test(v[at.index - 1]))) { closeSlashMenu(); openFilePicker(); }
  else if (v.startsWith("/") && !v.includes(" ")) { closeFilePicker(); showSlashMenu(); }
  else { closeFilePicker(); closeSlashMenu(); }
  autoGrow();
});
$("input").addEventListener("blur", () => {
  // 点击输入区内的按钮（📎文件/⚡命令）时焦点移入按钮，不关闭弹层
  setTimeout(() => {
    const active = document.activeElement;
    if (active && active.closest && active.closest(".input-shell")) return;
    closeFilePicker();
    closeSlashMenu();
  }, 150);
});
