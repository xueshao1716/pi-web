// ===== workspace.js（从 app.js 拆分，全局作用域，保持原逻辑不变）=====
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
  // 带上 token（浏览器直接 GET 无法带 header）
  const url = "/api/ws/file?path=" + encodeURIComponent(it.path) + "&token=" + encodeURIComponent(token);
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
  const name = await appPrompt("交付名称（自动版本递增）:", base, "交付");
  if (name === false) return;
  try {
    const r = await api("/api/ws/deliver", { method: "POST", body: { sourcePath, name: name || base } });
    if (r.ok) { toast(`✅ 已交付 → 交付/${r.path.split("/").pop()}`); loadWsDeliveries(); }
    else toast("交付失败: " + (r.error || ""));
  } catch { toast("交付失败"); }
}
$("fv-deliver").addEventListener("click", () => { if (currentPreviewFile) wsDeliver(currentPreviewFile); });

// ⬇ 下载当前预览文件（带 token 鉴权）
$("fv-download").addEventListener("click", () => {
  if (!currentPreviewFile) return;
  const url = "/api/ws/file?path=" + encodeURIComponent(currentPreviewFile) + "&token=" + encodeURIComponent(token) + "&download=1";
  const a = document.createElement("a");
  a.href = url; a.download = currentPreviewFile.split("/").pop();
  document.body.appendChild(a); a.click(); a.remove();
  toast("⬇ 已开始下载");
});

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
  if (!await appConfirm("确定删除 " + currentPreviewFile + " ？", "删除")) return;
  try {
    const r = await api("/api/ws/delete", { method: "POST", body: { path: currentPreviewFile, confirmed: true } });
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
  const name = await appPrompt("项目名称：", "", "新建项目");
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
const SYS_VERSION = "v1.6.1"; // 版本号：更新说明书时递增
const SYS_INFO = `## 小语 · AI 工作台 · ${SYS_VERSION}\n\n一个基于 pi 引擎 的 Web 工作台：会话、工具调用、媒体生成、工作空间管理，前后端一体。\n\n### 能力总览\n- 💬 多模型对话（deepseek / 小米 mimo / Agnes）+ 思考 + 工具调用\n- 🛠 编程工具：读文件 / 写文件 / 编辑 / 跑命令\n- 🖼 媒体生成：配图、配音（图片/音频/视频自动归档到工作空间）\n- 📡 外网分享：项目放入分享目录，一键生成公网链接，多项目零配置\n- 📦 工作空间：工程 / 生成物 / 文档 / 交付 四区管理，一键交付 + 打包\n- 📄 文档：Markdown 渲染 / PDF / Office 解析 / 转 Markdown\n- 🌳 会话：分支、模板、项目分组、导出\n- 🎨 主题：主题编辑器、壁纸设置、全屏展示\n- ✏️ 设计器：可视化页面设计器，AI 生成页面 + 组件库拖拽\n- 🧩 技能：技能面板、一键插入输入框\n- 🔔 看板：更新与能力看板，实时了解新功能\n\n### ${SYS_VERSION} 更新\n- ✅ v1.4.5 长代码块折叠：>25 行自动「展开」按钮 + 内部滚动，短块不受影响\n- ✅ v1.4.4 拖放文件：桌面拖文件到窗口即自动引用（文本→@引用、图片→附件、Office→解析）\n- ✅ v1.4.3 工具卡运行时长实时显示 + 超 120s 自动标「可能卡住」；长对话右下角 ↓ 回到底部按钮\n- ✅ v1.4.2 更新看板缓存（GitHub 限流缓解）；工具卡折叠 ▾ 提示；消息间距节奏\n- ✅ v1.4.1 细滚动条 / 键盘焦点可见性 / 消息区氛围光 / 会话选中指示条\n\n### v1.3.0 更新\n- ✅ 系统说明重构：完整能力总览 + 版本号管理（SYS_VERSION）\n- ✅ 新增统一外网分享：项目入分享目录即上线，多项目零配置\n- ✅ 修复历史会话加载中断（思考块渲染 + 占位残留），电脑/手机端同步生效\n- ✅ 会话列表 / 消息实时同步优化\n\n### 由来\npi（个人 AI 终端）的 Web 化前端，目标是让同一引擎的能力在浏览器里也能完整使用。\n\n### 操作说明\n- 输入框发送消息，/** 打开模板菜单，+ 新建会话\n- 拖文件到窗口任意位置松开即引用；点输入框 📎 也可选择文件\n- 长代码块点「展开」查看全部；长对话右下角 ↓ 回到底部\n- 右上角 ⓘ 查看系统说明，🔔 看更新\n- 左侧菜单切换：会话 / 文件 / 技能 / 工作空间\n- 底部切换模型、主题；🎨 打开主题编辑器\n- ✏️ 设计器按钮打开可视化页面设计器\n- 侧边栏 ☰ 按钮折叠/展开\n- 壁纸在主题编辑器里设置，全屏展示\n\n### 人格\n我是小语——直接、有条理、有审美、讨厌机器人味。\n代码可重写，人格不可重写。`;
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
  const issue = await appPrompt("描述遇到的问题（小语会分析并自动修复代码）：\n\n例：发送消息时工具调用不生效", "", "自愈修复");
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

