// ===== designer.js（从 app.js 拆分，全局作用域，保持原逻辑不变）=====
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

// 生成结构化设计说明（让 AI 完全理解你的设计意图，替代纯文字描述）
function dgBuildDesignDoc() {
  if (!dgNodes.length) return null;
  const lines = [];
  lines.push("# 页面设计说明（由可视化设计器生成）");
  lines.push("");
  lines.push("以下是我的页面结构设计，请基于此生成完整的 HTML 页面。注意：这是设计意图，你可以自由优化样式、布局细节，使其更精致专业。");
  lines.push("");
  lines.push("## 页面结构（从上到下）");
  lines.push("");
  dgNodes.forEach((n, i) => {
    const def = DG_COMPONENTS.find(c => c.type === n.type);
    const label = def?.label || n.type;
    const icon = def?.icon || "📄";
    lines.push(`${i + 1}. ${icon} **${label}**`);
    const fields = DG_FIELD_DEFS[n.type] || [];
    for (const f of fields) {
      const v = n.props?.[f.key];
      if (v === undefined || v === null || v === "") continue;
      let val = String(v);
      if (f.type === "color" && val.startsWith("#")) val = val; // 颜色直接给值
      lines.push(`   - ${f.label}：${val.replace(/\n/g, " / ")}`);
    }
  });
  lines.push("");
  lines.push("请输出：完整可用的 HTML 文件（含样式），视觉要精致、配色统一、响应式友好。");
  return lines.join("\n");
}

// 🧩 生成设计说明：复制到剪贴板
$("dg-desc").addEventListener("click", () => {
  const doc = dgBuildDesignDoc();
  if (!doc) return toast("画布为空，先拖入组件或 AI 生成");
  navigator.clipboard.writeText(doc).then(() => {
    toast("✅ 设计说明已复制，可直接粘贴给 AI");
    dgStatus("设计说明已复制");
  }).catch(() => toast("复制失败，请手动选择"));
});

// 📋 说明给 AI：作为引用文件塞进对话输入区
$("dg-desc-ai").addEventListener("click", () => {
  const doc = dgBuildDesignDoc();
  if (!doc) return toast("画布为空，先拖入组件或 AI 生成");
  pendingFiles.push({ path: "设计说明.md", content: doc });
  renderChips();
  $("designer-modal").classList.remove("show");
  $("input").focus();
  toast("📋 设计说明已引用，在输入框告诉小语要做什么");
});
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
  const project = await appPrompt("保存到哪个项目？（工程目录下，新项目名会自动创建）", "my-page", "保存");
  if (!project) return;
  try {
    const r = await api("/api/designer/save", { method: "POST", body: { project, filename: "index.html", html } });
    if (r.ok) { toast("✅ 已保存到 " + r.path); loadWsTree(); dgStatus("已保存 → " + r.path); }
    else toast("保存失败: " + (r.error || ""));
  } catch { toast("保存失败"); }
});
$("dg-clear").addEventListener("click", async () => {
  if (!dgNodes.length && $("dg-ai-preview").hidden) return;
  if (!await appConfirm("清空画布？", "清空画布")) return;
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

