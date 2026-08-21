// ===== workspace.js（从 app.js 拆分，全局作用域，保持原逻辑不变）=====
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
// ══ 工作空间面板（目录树 + 文件预览）══
const WS_ICONS = { "工程": "🏗", "生成物": "🖼", "文档": "📄", "交付": "📦", "外网分享": "📡", "收发文件": "📥" };
// 分类定义：顶层面板按工作区分类分区展示（借鉴 VS Code/飞书云文档）
const WS_CATEGORIES = [
  { name: "工程", icon: "🏗", match: (n) => n === "工程" },
  { name: "文档", icon: "📄", match: (n) => n === "文档" },
  { name: "生成物", icon: "🖼", match: (n) => n === "生成物" },
  { name: "交付", icon: "📦", match: (n) => n === "交付" },
  { name: "外网分享", icon: "📡", match: (n) => n === "外网分享" },
  { name: "收发文件", icon: "📥", match: (n) => n === "收发文件" },
];
function wsGroup(gkey) {
  const collapsed = !!collapsedGroups[gkey];
  const g = document.createElement("div");
  g.className = "sess-group";
  g.innerHTML = `
    <div class="sg-head"><span class="sg-arrow">${collapsed ? "▸" : "▾"}</span><span class="sg-name"></span><span class="sg-count"></span></div>
    <div class="sg-body" ${collapsed ? "hidden" : ""}></div>`;
  g.querySelector(".sg-head").addEventListener("click", () => toggleGroup(gkey));
  return g;
}
async function loadWsTree() {
  const box = $("ws-tree");
  box.innerHTML = '<div class="fp-empty">加载中…</div>';
  try {
    const root = await api("/api/ws/tree");
    box.innerHTML = "";
    const dirs = root.items.filter(i => i.type === "dir");
    const files = root.items.filter(i => i.type === "file");
    let rendered = 0;
    // 1. 按分类分组展示（工程/文档/生成物/交付/外网分享/收发文件）
    for (const cat of WS_CATEGORIES) {
      const items = dirs.filter(d => cat.match(d.name));
      if (!items.length) continue;
      const g = wsGroup("ws-" + cat.name);
      g.querySelector(".sg-name").textContent = cat.icon + " " + cat.name;
      g.querySelector(".sg-count").textContent = items.length;
      const body = g.querySelector(".sg-body");
      for (const it of items) body.appendChild(wsItem(it, 0));
      box.appendChild(g);
      rendered++;
    }
    // 2. 其他散目录（非分类的顶层目录）
    const otherDirs = dirs.filter(d => !WS_CATEGORIES.some(c => c.match(d.name)));
    if (otherDirs.length) {
      const g = wsGroup("ws-其他");
      g.querySelector(".sg-name").textContent = "📁 其他";
      g.querySelector(".sg-count").textContent = otherDirs.length;
      const body = g.querySelector(".sg-body");
      for (const it of otherDirs) body.appendChild(wsItem(it, 0));
      box.appendChild(g);
      rendered++;
    }
    // 3. 根目录散文件
    if (files.length) {
      const g = wsGroup("ws-根文件");
      g.querySelector(".sg-name").textContent = "📄 根目录文件";
      g.querySelector(".sg-count").textContent = files.length;
      const body = g.querySelector(".sg-body");
      for (const it of files) body.appendChild(wsItem(it, 0));
      box.appendChild(g);
      rendered++;
    }
    if (!rendered) box.innerHTML = '<div class="fp-empty">工作空间为空</div>';
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
    el.addEventListener("click", async (e) => {
      // 阻止冒泡：点击子目录时不能触发父目录的展开/收起
      e.stopPropagation();
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
    el.addEventListener("click", (e) => { e.stopPropagation(); openWsFile(it); });
  }
  return el;
}
// 打开工作空间文件（按类型预览）
async function openWsFile(it) {
  const ext = (it.name.split(".").pop() || "").toLowerCase();
  // 带上 token（浏览器直接 GET 无法带 header）
  const url = apiUrl("/api/ws/file?path=") + encodeURIComponent(it.path) + "&token=" + encodeURIComponent(token);
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
  const url = apiUrl("/api/ws/file?path=") + encodeURIComponent(currentPreviewFile) + "&token=" + encodeURIComponent(token) + "&download=1";
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
$("ws-git-btn").addEventListener("click", () => openGit("status"));

// ⓘ 系统说明
const SYS_VERSION = "v2.2.0"; // 版本号：更新说明书时递增
const SYS_INFO = `## 小语 · AI 工作台 · ${SYS_VERSION}\n\n一个基于 pi 引擎 的 Web 工作台：会话、工具调用、媒体生成、工作空间管理，前后端一体。\n\n### 能力总览\n- 💬 多模型对话（deepseek / 小米 mimo / Agnes）+ 思考 + 工具调用\n- 🛠 编程工具：读文件 / 写文件 / 编辑 / 跑命令\n- 🖼 媒体生成：配图、配音（图片/音频/视频自动归档到工作空间）\n- 📡 外网分享：项目放入分享目录，一键生成公网链接，多项目零配置\n- 📦 工作空间：工程 / 生成物 / 文档 / 交付 四区管理，一键交付 + 打包\n- 📄 文档：Markdown 渲染 / PDF / Office 解析 / 转 Markdown\n- 🌳 会话：分支、模板、项目分组、导出\n- 🎨 主题：主题编辑器、壁纸设置、全屏展示\n- ✏️ 设计器：可视化页面设计器，AI 生成页面 + 组件库拖拽\n- 🧩 技能：技能面板、一键插入输入框\n- 🔔 看板：更新与能力看板，实时了解新功能\n- 🧠 跨会话记忆：固定记忆/日志/纠正/关系记忆，新会话自动加载\n- 🧹 摘要式压缩：/compact 长对话一键压成结构化摘要，支持 focus 定向\n- 📐 Plan Mode：/plan 先只读规划再执行，任务更可控\n- 🎛 两阶段引导：首轮最小工具集锚定，智能展开完整能力\n- 📊 实时吞吐：TPS 仪表 + 上下文占用进度条（footer 状态栏）\n- 🔀 双引擎：pi + dsh 协作，研究/编码/建站任务可派给 dsh 执行\n\n### ${SYS_VERSION} 更新\n- ✅ v2.1.0 摘要式压缩（/compact + focus 定向 + 六类结构化摘要，Claude Code 借鉴）\n- ✅ v2.1.0 Plan Mode（/plan 只读规划 → /plan accept 批准执行 / cancel 取消）\n- ✅ v2.1.0 两阶段引导（首轮最小工具集锚定后自动展开完整工具集）\n- ✅ v2.1.0 实时 TPS 仪表 + 上下文占用进度条（footer 状态栏）\n- ✅ v2.1.0 跨会话记忆自动加载（固定记忆/日志/纠正/关系）\n- ✅ v2.0.0 文件系统体系：智能交付（关键词/类型/去重）、断点续传、签名下载、图片缩略图、钉钉式文件组、树状连接线
- ✅ v2.2.0 智能路由主力升级小米 mimo（免费·100万上下文·工具调用正常）+ 记忆注入修复（失忆问题）+ 自我改进提案 + 隐私合规
- ✅ v2.0.0 记忆系统闭环：固定记忆 + 记忆日志自动沉淀 + 经验库（跨会话长期有效）
- ✅ v2.0.0 情绪引擎：VAD 三维情绪感知，对话自适应语气节奏
- ✅ v2.0.0 外网分享根治：share_project 一键分享稳定域名，严禁模型碰隧道
- ✅ v2.0.0 工作空间分类视图 + 全屏浏览 + 侧边栏拖拽调宽
- ✅ v1.9.3 主题编辑器手机端布局优化（两列网格/壁纸行换行/编辑区紧凑）\n- ✅ v1.9.2 情绪指示器只留 emoji 圆形胶囊（修手机端顶栏超边）\n- ✅ v1.9.1 修复手机端聊天记录刷不全（缓存对比 bug + 懒加载按钮兜底）\n- ✅ v1.9.0 情绪指示器：顶栏实时显示小语情绪状态（🛡/🔥/😌/🧘），对话自动更新\n- ✅ v1.8.0 量子引擎主题：深空科技风（网格背景/霓虹发光/玻璃面板），主题菜单首个色板一键切换\n- ✅ v1.7.2 主页减负：移除 ✏️ 设计器按钮（手机端拥挤），入口在工作台 🧰 首页卡片\n- ✅ v1.4.5 长代码块折叠：>25 行自动「展开」按钮 + 内部滚动，短块不受影响\n- ✅ v1.4.4 拖放文件：桌面拖文件到窗口即自动引用（文本→@引用、图片→附件、Office→解析）\n- ✅ v1.4.3 工具卡运行时长实时显示 + 超 120s 自动标「可能卡住」；长对话右下角 ↓ 回到底部按钮\n- ✅ v1.4.2 更新看板缓存（GitHub 限流缓解）；工具卡折叠 ▾ 提示；消息间距节奏\n- ✅ v1.4.1 细滚动条 / 键盘焦点可见性 / 消息区氛围光 / 会话选中指示条\n\n### v1.3.0 更新\n- ✅ 系统说明重构：完整能力总览 + 版本号管理（SYS_VERSION）\n- ✅ 新增统一外网分享：项目入分享目录即上线，多项目零配置\n- ✅ 修复历史会话加载中断（思考块渲染 + 占位残留），电脑/手机端同步生效\n- ✅ 会话列表 / 消息实时同步优化\n\n### 由来\npi（个人 AI 终端）的 Web 化前端，目标是让同一引擎的能力在浏览器里也能完整使用。\n\n### 操作说明\n- 输入框发送消息，/** 打开模板菜单，+ 新建会话\n- 拖文件到窗口任意位置松开即引用；点输入框 📎 也可选择文件\n- 长代码块点「展开」查看全部；长对话右下角 ↓ 回到底部\n- 右上角 ⓘ 查看系统说明，🔔 看更新\n- 左侧菜单切换：会话 / 文件 / 技能 / 工作空间\n- 底部切换模型、主题；🎨 打开主题编辑器\n- ✏️ 设计器：工作台 🧰 首页「页面设计器」卡片进入（/workshop/designer 可直达）\n- 侧边栏 ☰ 按钮折叠/展开\n- 壁纸在主题编辑器里设置，全屏展示\n\n### 人格\n我是小语——直接、有条理、有审美、讨厌机器人味。\n代码可重写，人格不可重写。`;

$("si-close").addEventListener("click", () => $("sysinfo-modal").classList.remove("show"));
$("sysinfo-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) $("sysinfo-modal").classList.remove("show"); });

// 📋 关于 · 能力 · 更新（合并原系统说明 + 更新看板）
$("mm-notices").addEventListener("click", async () => {
  $("more-menu").hidden = true;
  $("notices-modal").querySelector(".modal-head span").textContent = "📋 关于 · 能力 · 更新";
  $("notices-modal").classList.add("show");
  // 顶部更新状态条（含执行按钮，一眼可见）
  const updBar = document.createElement("div");
  updBar.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;margin-bottom:12px;border:1px solid var(--border);border-radius:10px;background:color-mix(in srgb, var(--accent) 6%, var(--panel))";
  updBar.innerHTML = `<span style="font-size:12.5px;color:var(--dim)">更新状态加载中…</span><button class="theme-new-btn" onclick="__checkUpdate()">🔧 检查 / 执行更新</button>`;
  $("nt-content").appendChild(updBar);
  window.__checkUpdate = async () => {
    const btn = updBar.querySelector("button");
    const st = updBar.querySelector("span");
    if (btn) { btn.disabled = true; btn.textContent = "⏳ 检查中…"; }
    try {
      const d2 = await api("/api/update/check");
      const fe2 = d2.upToDate ? `✅ 前端最新（${d2.local}）` : `⬆ 前端落后 ${d2.behind} 提交（${d2.local} → ${d2.remote}）`;
      const en2 = d2.engineOutdated ? `⬆ 引擎有新版：${d2.engineLocal} → ${d2.engineLatest}` : `✅ 引擎最新（${d2.engineLocal || "?"}）`;
      if (st) st.textContent = fe2 + " · " + en2;
      if (d2.upToDate && !d2.engineOutdated) {
        await appConfirm(`✅ 全部最新\n\n${fe2}\n${en2}`, "检查更新");
        return;
      }
      const ok = await appConfirm(`⬆ 检测到更新！\n\n${fe2}\n${en2}\n\n确定执行更新？（前端 git pull + 引擎升级 + 重启）`, "检查更新");
      if (!ok) return;
      const r = await api("/api/update/apply", { method: "POST", body: { engine: d2.engineOutdated } });
      await appConfirm(r.message || "更新完成", "更新");
      setTimeout(() => location.reload(), 10000);
    } catch (e) {
      if (st) st.textContent = "检查更新失败：" + (e.message || e);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "🔧 检查 / 执行更新"; }
    }
  };
  try {
    const d = await api("/api/notices");
    let html = `\n\n### 🚀 pi-web v${d.appVersion}\n\n`;
    if (d.changelog && d.changelog.length) {
      html += d.changelog.map(c => `**v${c.version}**\n${c.lines.map(l => l.replace(/^[-*]\s*/, "- ")).join("\n") || "（无明细）"}\n`).join("\n");
    } else html += "（暂无更新记录）\n";
    html += `\n---\n\n### 引擎更新（pi v${d.piVersion}）\n\n`;
    if (d.releases.length) {
      html += d.releases.map(r => `**${r.tag}**（${r.date}）${r.name ? " " + r.name : ""}\n${escMd(r.body).slice(0, 220)}${r.body.length > 220 ? "…" : ""}\n`).join("\n");
    } else html += "（暂时拉取不到更新信息）\n";
    html += `\n### 能力看板（${d.capabilities.length} 项）\n` + d.capabilities.map(c => `- ${c.icon} **${c.name}**：${c.desc}`).join("\n");
    $("nt-content").innerHTML = renderSimpleMd(SYS_INFO + html);
    $("nt-content").prepend(updBar);
    // 加载完成后面板前移
    window.__checkUpdate();
  } catch { $("nt-content").innerHTML = renderSimpleMd(SYS_INFO); $("nt-content").prepend(updBar); }
});
$("nt-close").addEventListener("click", () => $("notices-modal").classList.remove("show"));
$("notices-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) $("notices-modal").classList.remove("show"); });
const escMd = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ⋯ 更多菜单开关
$("more-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("more-menu").hidden = !$("more-menu").hidden;
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".tool-more")) $("more-menu").hidden = true;
});

// ⬆ 更新执行（从「关于·能力·更新」看板的立即更新链接触发）
if (new URLSearchParams(location.search).get("action") === "update") {
  (async () => {
    try {
      const d = await api("/api/update/check");
      const fePart = d.upToDate ? `✅ 前端最新（${d.local}）` : `⬆ 前端落后 ${d.behind} 提交（${d.local} → ${d.remote}）`;
      const engPart = d.engineOutdated
        ? `⬆ 引擎有新版：${d.engineLocal} → ${d.engineLatest}`
        : `✅ 引擎最新（${d.engineLocal || "?"}）`;
      if (d.upToDate && !d.engineOutdated) {
        await appConfirm(`✅ 全部最新\n\n${fePart}\n${engPart}`, "检查更新");
        return;
      }
      const ok = await appConfirm(`⬆ 检测到更新！\n\n${fePart}\n${engPart}\n\n确定执行更新？（前端 git pull + 引擎升级 + 重启）`, "检查更新");
      if (!ok) return;
      const r = await api("/api/update/apply", { method: "POST", body: { engine: d.engineOutdated } });
      await appConfirm(r.message || "更新完成", "更新");
      setTimeout(() => location.reload(), 10000);
    } catch (e) {
      await appConfirm("检查更新失败：" + (e.message || e), "检查更新");
    }
  })();
}

// 🛠 自愈修复（SSE 日志 → 自动重启 → 恢复）
$("mm-repair").addEventListener("click", async () => {
  $("more-menu").hidden = true;
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


// ══ 工作空间全屏浏览（保留侧边栏，全屏查看文件）══
$("ws-full-btn").addEventListener("click", openWsFull);
$("wsfull-close").addEventListener("click", () => $("wsfull-modal").classList.remove("show"));
$("wsfull-modal").addEventListener("click", (e) => { if (e.target === $("wsfull-modal")) $("wsfull-modal").classList.remove("show"); });

let wsFullCurrent = null; // 当前预览的文件路径

function openWsFull() {
  $("wsfull-modal").classList.add("show");
  loadWsFullTree("");
  $("wsfull-search").value = "";
  $("wsfull-search").focus();
  const el = $("wsfull-tree");
  el.innerHTML = '<div class="fp-empty">加载中…</div>';
}

async function loadWsFullTree(path) {
  const box = $("wsfull-tree");
  box.innerHTML = '<div class="fp-empty">…</div>';
  try {
    const data = await api("/api/ws/tree?path=" + encodeURIComponent(path || ""));
    box.innerHTML = "";
    const sorted = [...data.items].sort((a, b) => (a.type === "dir" ? 0 : 1) - (b.type === "dir" ? 0 : 1));
    for (const it of sorted) box.appendChild(wsFullItem(it, 0));
    if (!sorted.length) box.innerHTML = '<div class="fp-empty">空</div>';
  } catch { box.innerHTML = '<div class="fp-empty">加载失败</div>'; }
}

function wsFullItem(it, depth) {
  const el = document.createElement("div");
  el.className = "ft-item " + it.type;
  el.style.paddingLeft = (8 + depth * 14) + "px";
  const isDir = it.type === "dir";
  el.innerHTML = `<span class="ft-arrow">${isDir ? "▸" : ""}</span><span class="ft-ico">${isDir ? (WS_ICONS[it.name] || "📁") : "📄"}</span><span class="ft-name">${esc(it.name)}</span>`;
  if (isDir) {
    const childBox = document.createElement("div");
    childBox.hidden = true;
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const willExpand = childBox.hidden;
      el.querySelector(".ft-arrow").textContent = willExpand ? "▾" : "▸";
      childBox.hidden = !willExpand;
      if (willExpand) {
        childBox.innerHTML = '<div class="fp-empty">…</div>';
        try {
          const data = await api("/api/ws/tree?path=" + encodeURIComponent(it.path));
          childBox.innerHTML = "";
          const sorted = [...data.items].sort((a, b) => (a.type === "dir" ? 0 : 1) - (b.type === "dir" ? 0 : 1));
          for (const sub of sorted) childBox.appendChild(wsFullItem(sub, depth + 1));
        } catch { childBox.innerHTML = '<div class="fp-empty">加载失败</div>'; }
      }
    });
    el.appendChild(childBox);
  } else {
    el.addEventListener("click", (e) => { e.stopPropagation(); previewWsFull(it); });
  }
  return el;
}

async function previewWsFull(it) {
  wsFullCurrent = it;
  const url = apiUrl("/api/ws/file?path=") + encodeURIComponent(it.path) + "&token=" + encodeURIComponent(token);
  const ext = (it.name.split(".").pop() || "").toLowerCase();
  const ph = $("wsfull-ph"), pv = $("wsfull-preview");
  ph.hidden = true; pv.hidden = false;
  $("wsfull-info").textContent = it.path + " · " + fmtSize(it.size || 0);
  $("wsfull-dl").hidden = false;
  $("wsfull-deliver").hidden = false;
  if (["png","jpg","jpeg","gif","webp","bmp"].includes(ext)) {
    pv.innerHTML = `<img src="${url}" alt="${esc(it.name)}">`;
  } else if (["mp4","webm","mov"].includes(ext)) {
    pv.innerHTML = `<video src="${url}" controls style="max-width:100%;max-height:70vh"></video>`;
  } else if (["mp3","wav","m4a"].includes(ext)) {
    pv.innerHTML = `<audio src="${url}" controls></audio>`;
  } else if (ext === "pdf") {
    pv.innerHTML = `<iframe src="${url}"></iframe>`;
  } else {
    try {
      const d = await api("/api/ws/read?path=" + encodeURIComponent(it.path));
      const txt = String(d.content || "").slice(0, 20000);
      const isMd = ext === "md";
      pv.innerHTML = isMd ? `<div class="markdown">${renderSimpleMd ? renderSimpleMd(txt) : "<pre>"+esc(txt)+"</pre>"}</div>` : `<pre>${esc(txt)}</pre>`;
    } catch {
      pv.innerHTML = `<div class="fp-empty">无法预览（二进制文件），点击下载</div>`;
    }
  }
}
$("wsfull-dl").addEventListener("click", () => {
  if (!wsFullCurrent) return;
  const url = apiUrl("/api/ws/file?path=") + encodeURIComponent(wsFullCurrent.path) + "&token=" + encodeURIComponent(token) + "&download=1";
  window.open(url, "_blank");
});
$("wsfull-deliver").addEventListener("click", async () => {
  if (!wsFullCurrent) return;
  const r = await api("/api/ws/deliver", { method: "POST", body: { path: wsFullCurrent.path } });
  if (r.ok) toast("✅ 已交付 → " + r.path);
  else toast("交付失败: " + (r.error || ""));
});
// 搜索
$("wsfull-search").addEventListener("input", debounce(async (e) => {
  const q = e.target.value.trim();
  if (!q) { loadWsFullTree(""); return; }
  const box = $("wsfull-tree");
  box.innerHTML = '<div class="fp-empty">搜索中…</div>';
  try {
    const d = await api("/api/ws/search?q=" + encodeURIComponent(q));
    box.innerHTML = "";
    for (const r of (d.results || []).slice(0, 30)) {
      const el = document.createElement("div");
      el.className = "ft-item file";
      el.innerHTML = `📄 <span class="ft-name">${esc(r.name)}</span> <span class="ws-search-path" style="font-size:10px;color:var(--dim-2)">${esc(r.path)}</span>`;
      el.addEventListener("click", () => previewWsFull(r));
      box.appendChild(el);
    }
    if (!d.results || !d.results.length) box.innerHTML = '<div class="fp-empty">无结果</div>';
  } catch { box.innerHTML = '<div class="fp-empty">搜索失败</div>'; }
}, 300));

// ══ 全屏侧边栏拖拽调宽（记住用户偏好）══
(function () {
  const resizer = $("wsfull-resizer");
  if (!resizer) return;
  let startX = 0, startW = 0, dragging = false;
  const side = () => document.querySelector(".wsfull-side");
  const WSFULL_W_KEY = "pi_wsfull_side_w";
  // 恢复记忆的宽度
  try {
    const saved = parseInt(localStorage.getItem(WSFULL_W_KEY) || "280", 10);
    if (saved >= 160 && saved <= 600) side().style.width = saved + "px";
  } catch {}
  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    resizer.classList.add("dragging");
    startX = e.clientX;
    startW = side().offsetWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const w = Math.min(600, Math.max(160, startW + (e.clientX - startX)));
    side().style.width = w + "px";
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    try { localStorage.setItem(WSFULL_W_KEY, String(side().offsetWidth)); } catch {}
  });
})();
