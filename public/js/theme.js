// ===== theme.js（从 app.js 拆分，全局作用域，保持原逻辑不变）=====
// ══ 主题系统 ══
const VAR_MAP = {
  accent:"--accent", accent2:"--accent-2", deep:"--accent-deep",
  bg:"--bg", sidebar:"--sidebar", panel:"--panel", panel2:"--panel-2",
  border:"--border", text:"--text", dim:"--dim", dim2:"--dim-2",
  green:"--green", red:"--red", yellow:"--yellow",
  toolBash:"--tool-bash", toolRead:"--tool-read", toolWrite:"--tool-write",
  toolEdit:"--tool-edit", toolTodo:"--tool-todo", toolThink:"--tool-think",
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
    toolGlob: "#38bdf8", toolGrep: "#38bdf8", toolThink: "#c084fc",
    glow,
  };
}
const THEMES = {
  // AI 原生：中性炭黑底 + 单一靛蓝强调，克制辉光，高级感（源自 UI/UX Pro Max ai-native-ui 设计智能）
  ai:      { label:"AI 原生", vars: makeVars("#7c8cf8","#9aa8ff","#5a67e0","#0b0b0d","#0f0f13","#141419","#1a1a20","#26262e","#ececf2","#90909f","#5d5d6b", 0.3) },
  // 拟态：浅色单色系 + 柔和双阴影（Neumorphism，源自 UI/UX Pro Max 风格库）
  neu:     { label:"拟态",   vars: makeVars("#6b7fd7","#8a9bf0","#5567c4","#e4e9f0","#dfe4ec","#e4e9f0","#dfe4ec","#d3d8e2","#3d4756","#7a8494","#a5aebe", 0) },
  // 液态玻璃：深色底 + 彩色光斑背景 + 高光玻璃面板（Liquid Glass, Apple 2024 风）
  liquid:  { label:"液态玻璃", vars: makeVars("#6ea8ff","#a78bfa","#4f7ddb","#080d1a","#10182c","#141e36","#1a2540","#2a3858","#eef3ff","#93a4c8","#5f6f8f", 0.5) },
  linear:  { label:"Linear 精密", vars: makeVars("#5e6ad2","#828fff","#4c56b0","#010102","#0f1011","#141516","#18191a","#23252a","#f7f8f8","#8a8f98","#62666d", 0.2) },
  ops:     { label:"运维控制台", vars: makeVars("#2596be","#4fb8dc","#1a708f","#0f1118","#12151d","#171b25","#1c2130","#2a3145","#e4e9f2","#8b93a8","#565f75", 0.35) },
  apple:   { label:"苹果风", vars: makeVars("#0071e3","#5aa7f0","#0055b3","#f5f5f7","#f8f8fa","#ffffff","#f0f0f2","#d9d9de","#1d1d1f","#6e6e73","#86868b", 0.15) },
  quantum: { label:"量子引擎", vars: makeVars("#23e6ff","#6f8bff","#0d7ff2","#05070e","#070b16","#0b1120","#0e1628","#1d2b4a","#e8f0ff","#8ba0c8","#47597c", 0.9) },
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

const TOOL_VAR = { bash:"toolBash", read:"toolRead", write:"toolWrite", edit:"toolEdit", glob:"toolRead", grep:"toolRead", rg:"toolRead", todo:"toolTodo", think:"toolThink" };
const TOOL_ICONS = { bash: "$", read: "R", write: "W", edit: "E", glob: "G", grep: "g", rg: "g", think: "🧠" };

// 自定义主题：localStorage（读取时净化：只保留预定义键 + 合法 hex，防旧数据/恶意写入内联注入）
function sanitizeThemeVars(vars) {
  const out = {};
  for (const [k, v] of Object.entries(THEMES.violet.vars)) {
    if (typeof vars?.[k] === "string" && /^#[0-9a-fA-F]{6}$/.test(vars[k])) out[k] = vars[k];
  }
  return out;
}
function loadCustomThemes() {
  try {
    const raw = JSON.parse(localStorage.getItem("pi_custom_themes") || "{}");
    const clean = {};
    for (const [name, t] of Object.entries(raw)) {
      if (t && typeof t === "object" && (t.vars || t)) clean[name] = { vars: sanitizeThemeVars(t.vars || t) };
    }
    return clean;
  } catch { return {}; }
}
function saveCustomThemes() {
  try { localStorage.setItem("pi_custom_themes", JSON.stringify(customThemes)); } catch {}
}
let customThemes = loadCustomThemes();

// v1.8.0 主题默认值迁移：量子引擎设为默认（一次性标记，之后用户手动切换不受影响）
try {
  if (!localStorage.getItem("pi_theme_v180")) {
    localStorage.setItem("pi_theme", "neu");
    localStorage.setItem("pi_theme_v180", "1");
  }
  // v1.8.1 迁移：默认主题升级为 AI 原生；仅迁移未手动选过 / 仍停留在 quantum 的用户
  if (!localStorage.getItem("pi_theme_v181")) {
    const prev = localStorage.getItem("pi_theme");
    if (!prev || prev === "quantum") localStorage.setItem("pi_theme", "ai");
    localStorage.setItem("pi_theme_v181", "1");
  }
  // v1.8.2 迁移：拟态设为默认（用户最喜欢的风格）；仅迁移仍在 quantum / ai 的用户
  if (!localStorage.getItem("pi_theme_v182")) {
    const prev = localStorage.getItem("pi_theme");
    if (!prev || prev === "quantum" || prev === "ai") localStorage.setItem("pi_theme", "neu");
    localStorage.setItem("pi_theme_v182", "1");
  }
} catch {}

let currentTheme = localStorage.getItem("pi_theme") || "neu";
if (!THEMES[currentTheme] && !THEMES_CODEX[currentTheme] && !currentTheme.startsWith("custom:")) currentTheme = "neu";

// ── 深色/浅色一键切换："明暗槽位"记录各自侧最近选的主题 ──
// 点切换按钮 = 在当前明暗侧与另一侧槽位主题之间往返；手动选主题自动更新所属槽位。
const DARK_DEFAULT = "quantum", LIGHT_DEFAULT = "neu";
function isThemeKeyValid(key) {
  return !!key && (!!THEMES[key] || !!THEMES_CODEX[key] || (key.startsWith("custom:") && !!customThemes[key.slice(7)]));
}
function hexLuminance(hex) {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex || "");
  if (!m) return 1; // 非法值按浅色处理（安全侧）
  const [r, g, b] = m.slice(1).map(h => parseInt(h, 16) / 255);
  return 0.2126 * (r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4))
       + 0.7152 * (g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4))
       + 0.0722 * (b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4));
}
function isLightTheme(key) { return hexLuminance(getThemeVars(key).bg) > 0.3; }
let darkSlot = localStorage.getItem("pi_theme_dark") || DARK_DEFAULT;
let lightSlot = localStorage.getItem("pi_theme_light") || LIGHT_DEFAULT;
if (!isThemeKeyValid(darkSlot)) darkSlot = DARK_DEFAULT;
if (!isThemeKeyValid(lightSlot)) lightSlot = LIGHT_DEFAULT;
// 首次使用（无槽位记录）时用当前主题补位，保证第一下切换就能往返
if (!localStorage.getItem("pi_theme_dark") && !isLightTheme(currentTheme)) darkSlot = currentTheme;
if (!localStorage.getItem("pi_theme_light") && isLightTheme(currentTheme)) lightSlot = currentTheme;

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
  document.documentElement.dataset.theme = key; // 组件级主题覆盖层的挂载点（quantum.css）
  if (save) {
    localStorage.setItem("pi_theme", key);
    // 手动选主题时同步更新所属明暗槽位（下次一键切换回到这一侧时恢复该主题）
    if (isLightTheme(key)) { lightSlot = key; localStorage.setItem("pi_theme_light", key); }
    else { darkSlot = key; localStorage.setItem("pi_theme_dark", key); }
  }
  renderSwatches();
  syncEditor();
  syncToggleBtn();
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
    el.querySelector(".t-del").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!await appConfirm(`删除自定义主题「${name}」？`, "删除主题")) return;
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
  // 上限保护：最多 20 个自定义主题（每个含完整变量组，占用 localStorage）
  const customCount = Object.keys(customThemes).length;
  if (!customThemes[name] && customCount >= 20) return toast("⚠️ 最多 20 个自定义主题，请先删除部分");
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
      // 安全导入：只接受预定义颜色键 + 合法 hex（其余一律丢弃，堵属性注入）
      const src = j.vars || j;
      const vars = { ...THEMES.violet.vars };
      for (const [k] of Object.entries(THEMES.violet.vars)) {
        if (typeof src[k] === "string" && /^#[0-9a-fA-F]{6}$/.test(src[k])) vars[k] = src[k];
      }
      const name = (j.name || file.name.replace(/\.json$/i, "")).trim() || "导入的主题";
      customThemes[name] = { vars };
      saveCustomThemes();
      editDirty = false;
      applyTheme("custom:" + name);
      renderThemeLists();
      toast(`已导入主题「${name}」（已过滤非法颜色值）`);
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

// ── 深色/浅色一键切换按钮 ──
function syncToggleBtn() {
  const el = $("theme-toggle");
  if (!el) return;
  const nowLight = isLightTheme(currentTheme);
  el.textContent = nowLight ? "🌙" : "☀️"; // 显示"点击后将切换到的模式"
  el.title = nowLight ? "切换到深色主题" : "切换到浅色主题";
}
function toggleDarkLight() {
  const nowLight = isLightTheme(currentTheme);
  const target = nowLight ? darkSlot : lightSlot;
  // 兜底：目标槽与当前相同（极端情况），改切同侧默认
  applyTheme(target === currentTheme ? (nowLight ? DARK_DEFAULT : LIGHT_DEFAULT) : target);
}
$("theme-toggle").addEventListener("click", toggleDarkLight);

renderSwatches();
applyTheme(currentTheme, false);
renderThemeLists();
syncToggleBtn();

