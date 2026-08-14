// ===== chat.js（从 app.js 拆分，全局作用域，保持原逻辑不变）=====
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
    renderWelcome();
    await refreshSessions();
    // 刷新后自动恢复上次打开的会话（避免回主界面重新找）
    const lastSid = localStorage.getItem("pi_last_session");
    if (lastSid && sessions.some(s => s.id === lastSid)) selectSession(lastSid);
    else refreshEmotion(); // 无恢复会话时初始化情绪指示器
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
  // 会话级模型优先：当前会话自己切过模型则显示它，否则用全局默认
  const cur = (currentId && sessionModels[currentId]) || (data.current ? `${data.current.provider}/${data.current.id}` : "");
  if (cur && [...sel.options].some(o => o.value === cur)) {
    sel.value = cur;
    window.currentModelKey = cur;
  }
  // 用 onchange 而非 addEventListener：populateModels 会被多次调用，避免监听器重复叠加
  // 关键：程序赋值 sel.value 会触发 change → 必须用标志位跳过，否则刷新页面就自动切模型+注入上下文同步
  let suppress = true;
  sel.onchange = () => {
    if (suppress) { suppress = false; return; }
    switchModel(sel.selectedOptions[0].dataset.provider, sel.selectedOptions[0].dataset.modelId);
  };
  setTimeout(() => { suppress = false; }, 300);
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
    // 新会话（currentId=null）切模型：不更新全局，只记 pending，发送时创建会话并应用
    if (!currentId) {
      window.pendingModel = `${provider}/${modelId}`;
      $("input-model-name").textContent = modelId;
      const data = await api("/api/models");
      modelList = data.models; populateModels(data); updateFooter();
      toast(`新会话将使用 → ${provider}/${modelId}`);
      return;
    }
    await api("/api/model", { method: "POST", body: { provider, modelId, sessionId: currentId } });
    // 记录当前会话的模型（切换会话时恢复各自模型）
    if (currentId) {
      sessionModels[currentId] = `${provider}/${modelId}`;
      try { localStorage.setItem("pi_session_models", JSON.stringify(sessionModels)); } catch {}
    }
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
  // 重建前保存滚动位置，重建后恢复（避免全量 innerHTML 重建时列表跳到顶部）
  const scrollParent = list.closest?.(".side-body") || list;
  const savedScroll = scrollParent.scrollTop;
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
  // 恢复滚动位置（若内容变化导致超出则钳制到最大）
  requestAnimationFrame(() => {
    scrollParent.scrollTop = Math.min(savedScroll, scrollParent.scrollHeight);
  });
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
    if (!await appConfirm(`删除会话「${s.name}」？`)) return;
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
let currentLeafId = null; // 当前会话的分叉叶子（分叉后置位；普通会话为 null = 显示全部）
// 渲染会话消息（含工具卡片/思考块），供加载与缓存复用
// 文件卡片（聊天界面可见、可下载）；图片类型直接显示缩略图
function addFileMsg(file, role) {
  const box = $("messages");
  // 钉钉式：同一角色连续的文件消息合并到上一个文件组（头像只出现一次，文件卡片紧凑排列）
  const last = box.lastElementChild;
  if (last && last.classList.contains("msg") && last.dataset.role === role && last.classList.contains("file-group")) {
    const groupBody = last.querySelector(".fc-group-body");
    if (groupBody) {
      groupBody.appendChild(buildFileCard(file, role));
      box.scrollTop = box.scrollHeight;
      return;
    }
  }
  // 新文件组（一条消息，含头像 + 多个文件卡片）
  const el = document.createElement("div");
  el.className = "msg " + (role === "user" ? "user" : "assistant") + " file-group";
  el.dataset.role = role;
  el.innerHTML = `<div class="who"><span class="avatar">${role === "user" ? "你" : "π"}</span><span class="name">${role === "user" ? "你" : "小语"}</span><span class="msg-time">${nowTime()}</span></div>
    <div class="fc-group-body"></div>`;
  el.querySelector(".fc-group-body").appendChild(buildFileCard(file, role));
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

// 构建单个文件卡片（钉钉样式：图标+文件名+大小+下载）
function buildFileCard(file, role) {
  const isImg = (file.mime || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name || "");
  const dlUrl = "/api/ws/file?path=" + encodeURIComponent(file.path || "") + "&token=" + encodeURIComponent(token) + "&download=1";
  const previewUrl = "/api/ws/file?path=" + encodeURIComponent(file.path || "") + "&token=" + encodeURIComponent(token);
  const icon = isImg ? "🖼" : (file.mime || "").startsWith("audio/") ? "🎵" : (file.mime || "").startsWith("video/") ? "🎬" : "📄";
  const size = file.size ? (file.size > 1048576 ? (file.size / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(file.size / 1024)) + "KB") : "";
  const card = document.createElement("div");
  card.className = "file-card" + (isImg ? " img-card" : "");
  if (isImg) {
    card.innerHTML = `<img src="${previewUrl}" alt="${esc(file.name || "图片")}" loading="lazy" style="max-width:220px;max-height:160px;border-radius:8px;cursor:zoom-in;display:block;object-fit:cover">
      <div class="fc-name-row" title="${esc(file.name || "图片")}">${esc(file.name || "图片")}</div>
      <div class="fc-meta-row"><span class="fc-meta">${esc(size || "")}</span><a class="fc-dl" href="${dlUrl}" download>⬇ 下载</a></div>`;
    card.querySelector("img").addEventListener("click", (e) => { e.stopPropagation(); openWsMedia(previewUrl, "image", file.name); });
  } else {
    card.innerHTML = `<span class="fc-icon">${icon}</span>
      <span class="fc-info"><span class="fc-name">${esc(file.name || "文件")}</span><span class="fc-meta">${esc(size || "")}</span></span>
      <a class="fc-dl" href="${dlUrl}" download>⬇ 下载</a>`;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".fc-dl")) return;
      openWsMedia(previewUrl, "file", file.name);
    });
  }
  return card;
}

// 渲染消息里的图片附件（base64 data URI 直显，点击放大 / 可下载）
function addImageMsg(img, role) {
  const box = $("messages");
  const el = document.createElement("div");
  el.className = "msg " + (role === "user" ? "user" : "assistant");
  const raw = img.data || "";
  const dataUri = raw.startsWith("data:") ? raw : `data:${img.mimeType || "image/png"};base64,${raw}`;
  el.innerHTML = `<div class="who"><span class="avatar">${role === "user" ? "你" : "π"}</span><span class="name">${role === "user" ? "你" : "小语"}</span><span class="msg-time">${nowTime()}</span></div>
    <div class="file-card img-card">
      <img src="${dataUri}" alt="图片" loading="lazy" style="max-width:320px;max-height:240px;border-radius:10px;cursor:zoom-in;display:block;object-fit:cover">
      <div class="fc-name-row">图片</div>
      <div class="fc-meta-row"><a class="fc-dl" href="${dataUri}" download>⬇ 下载</a></div>
    </div>`;
  const imgEl = el.querySelector("img");
  imgEl.addEventListener("click", (e) => {
    e.stopPropagation();
    const w = window.open();
    if (w) { w.document.write(`<body style="margin:0;background:#111"><img src="${dataUri}" style="max-width:100%;display:block"></body>`); w.document.close(); }
  });
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

// 刷新当前会话消息（文件上传后调用）
async function refreshMessages() {
  if (!currentId) return;
  const data = await api(`/api/sessions/${encodeURIComponent(currentId)}/messages`).catch(() => null);
  if (!data) return;
  clearMessages();
  renderMessages(data.messages);
  const w = $("messages").querySelector(".welcome");
  if (w) w.remove();
}

// 断流恢复：轮询服务端任务状态，任务结束后拉历史刷新界面（息屏/断线场景，不丢工作状态）
async function pollTaskAndRecover(taskKey, { maxWait = 300000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxWait) {
    let t = null;
    try { t = await api(`/api/tasks/active?taskKey=${encodeURIComponent(taskKey)}`); } catch {}
    if (!t || !t.active) {
      // 任务已结束 → 拉历史刷新界面，恢复最新状态
      if (currentId) {
        await refreshMessages().catch(() => {});
        toast("✅ 任务已完成，已恢复最新状态");
        setStatus("就绪");
      }
      return { recovered: true };
    }
    // 还在跑：保持 busy 状态，继续等（每 5s 查一次）
    if (currentId) setStatus(`任务继续中…（${t.stage || "处理中"}）`, "busy");
    await new Promise(r => setTimeout(r, 5000));
  }
  return { recovered: false };
}

// 息屏/切后台恢复可见：当前流在跑但长时间无事件（可能已断），主动查任务状态恢复
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    const key = currentKey();
    const st = streams.get(key);
    if (!st || st.done) return;
    const tk = st.taskKey || (key.startsWith("__new__") ? null : key);
    if (!tk) return;
    if (Date.now() - (st.lastEventAt || 0) > 30000) {
      pollTaskAndRecover(tk).catch(() => {});
    }
  });
}

function renderMessages(msgs) {
  histMsgs = msgs || [];
  histLoaded = Math.min(HIST_PAGE, histMsgs.length);
  renderHistoryWindow();
}

// ══ 历史消息窗口渲染（借鉴 agegr/pi-web chat-lazy-load）══
// 尾部窗口渲染 + 顶部哨兵 + 滚动加载更早 + 滚动锚定（保持距底部距离，插入旧消息不跳动）
const HIST_PAGE = 60;
let histMsgs = [];
let histLoaded = 0;
let histBusy = false;

function renderHistoryWindow() {
  const box = $("messages");
  box.innerHTML = "";
  if (histLoaded < histMsgs.length) {
    const s = document.createElement("div");
    s.className = "lazy-more";
    s.id = "lazy-more";
    s.textContent = `↑ 加载更早消息（还有 ${histMsgs.length - histLoaded} 条）`;
    box.appendChild(s);
  }
  renderChunk(histMsgs.slice(-histLoaded));
  box.scrollTop = box.scrollHeight;
}

// 加载更早一批（滚动触发 / 哨兵按钮点击共用）
function loadOlderHistory() {
  const box = $("messages");
  if (histBusy || histLoaded >= histMsgs.length) return;
  if (render.assistantEl) return; // 流式进行中
  histBusy = true;
  const dist = box.scrollHeight - box.scrollTop; // 锚定：保持距底部距离
  histLoaded = Math.min(histMsgs.length, histLoaded + HIST_PAGE);
  renderHistoryWindow();
  box.scrollTop = Math.max(0, box.scrollHeight - dist);
  setTimeout(() => { histBusy = false; }, 120);
}

// 渲染一批历史消息（思考合并逻辑原样保留）
function renderChunk(list) {
  let thinkBuf = "";
  let thinkN = 0;
  const flush = () => {
    if (thinkN > 0) {
      appendExternalThink(thinkN > 1 ? `思考过程（${thinkN} 轮）` : "思考过程", thinkBuf);
      thinkBuf = ""; thinkN = 0;
    }
  };
  for (const m of list) {
    if (m.role === "user") { flush(); addUserMsg(m.text, m.id); if (Array.isArray(m.files)) m.files.forEach(f => addFileMsg(f, "user")); if (Array.isArray(m.images)) m.images.forEach(img => addImageMsg(img, "user")); }
    else if (m.role === "assistant") {
      if (m.think && m.think.trim()) { thinkBuf += (thinkBuf ? "\n\n" : "") + m.think; thinkN++; }
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
      if (m.text) { flush(); addAssistantMsg(m.text, m.ts, m.id); }
      if (Array.isArray(m.files)) m.files.forEach(f => addFileMsg(f, "assistant"));
      if (Array.isArray(m.images)) m.images.forEach(img => addImageMsg(img, "assistant"));
    }
  }
  flush();
}

// 滚动到顶加载更早消息（流式进行中不重建，避免打断进行中的视图）
(function initLazyHistory() {
  const box = $("messages");
  if (!box) return;
  box.addEventListener("scroll", () => {
    if (histBusy || histLoaded >= histMsgs.length) return;
    if (render.assistantEl) return; // 流式进行中
    if (box.scrollTop < 100) loadOlderHistory();
  }, { passive: true });
  // 哨兵按钮点击加载（手机端上滑触发不可靠时的兜底入口）
  box.addEventListener("click", (e) => {
    if (e.target && e.target.id === "lazy-more") loadOlderHistory();
  });
})();

// 同步模型下拉为指定会话的模型（会话切过则用它，否则用全局默认）
function syncModelSelectForSession(id) {
  const sel = $("model-select");
  if (!sel || !sel.options.length) return;
  const saved = (id && sessionModels[id]) || window.currentModelKey || (sel.options[0] ? sel.options[0].value : "");
  if (id && sessionModels[id]) {
    if ([...sel.options].some(o => o.value === sessionModels[id])) {
      sel.value = sessionModels[id];
      window.currentModelKey = sessionModels[id];
      const opt = sel.selectedOptions[0];
      if (opt) $("input-model-name").textContent = opt.dataset.modelId || "";
      // 刷新后第一次打开：确保后端 agent 也用对模型（切过去，幂等）
      const [provider, modelId] = sessionModels[id].split("/");
      api("/api/model", { method: "POST", body: { provider, modelId, sessionId: id } }).catch(() => {});
    }
  }
}

async function selectSession(id) {
  currentId = id;
  try { localStorage.setItem("pi_last_session", id); } catch {}
  // 切换会话：同步模型下拉为该会话自己的模型（避免显示上一个会话的模型）
  syncModelSelectForSession(id);
  refreshEmotion(); // 切换会话同步情绪指示器
  currentLeafId = null; // 切换会话时重置分叉视图
  closeSidebar();
  renderSessions();
  const s = sessions.find(x => x.id === id);
  $("session-name").textContent = s ? s.name : "新会话";
  clearMessages();
  $("messages").innerHTML = '<div class="welcome" style="padding:60px 20px"><div class="sub">加载会话中…</div></div>';
  // ══ 会话缓存：同浏览器重复打开不再重新下载（localStorage，限文本消息防超容量）══
  const CACHE_KEY = "piweb_msgcache_" + id;
  let cacheUsed = false;
  let cacheUsedCount = 0; // 缓存命中时的条数（用于与新鲜数据对比，判断是否需要重渲）
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const c = JSON.parse(cached);
      if (c && Array.isArray(c.messages) && c.messages.length && Date.now() - (c.ts || 0) < 30 * 60 * 1000) {
        // 30 分钟内的缓存：先渲染（秒开），后台再校验更新
        renderMessages(c.messages);
        cacheUsed = true;
        cacheUsedCount = c.messages.length;
      }
    }
  } catch {}
  try {
    const data = await api(`/api/sessions/${encodeURIComponent(id)}/messages${currentLeafId ? "?leafId=" + encodeURIComponent(currentLeafId) : ""}`);
    // 缓存最新消息（仅文本，控制大小 ≤ 400KB）
    try {
      const slim = data.messages.map(m => ({ role: m.role, text: (m.text || "").slice(0, 2000), tools: m.tools, think: m.think, ts: m.ts, id: m.id }));
      if (JSON.stringify(slim).length < 400000) {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), messages: slim }));
      }
    } catch {}
    if (!cacheUsed) renderMessages(data.messages);
    else {
      // 缓存已显示，但服务端消息数与缓存命中时不同（有更新）→ 重渲
      // 修复：用缓存命中时的条数对比，不能用刚写入的新缓存（否则恒相等永不重渲）
      const fresh = data.messages.length;
      if (fresh !== cacheUsedCount) renderMessages(data.messages);
    }
  } catch {}
  // 移除“加载会话中…”占位
  const w = $("messages").querySelector(".welcome");
  if (w) w.remove();
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
  try { localStorage.removeItem("pi_last_session"); } catch {}  // 新建会话时不恢复旧会话
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
  renderWelcome();
  renderLatestNewStream(); // 若正在新建会话中，继续显示进度
  syncBusyUI();
  updateFooter();
  await refreshSessions();
  $("input").focus();
}
// 新会话引导界面：说明前端是什么、能干什么、怎么操作、当前模型
function renderWelcome() {
  const sel = $("model-select");
  const cur = sel.selectedOptions[0];
  const curModel = cur ? cur.dataset.provider + "/" + cur.dataset.modelId : "…";
  $("messages").innerHTML = `<div class="welcome" style="padding:56px 20px 24px">
    <div class="w-logo">语</div>
    <div class="big">小语 · AI 工作台</div>
    <div class="sub">基于 pi 引擎的 AI 工作伙伴 · 会话 / 工具 / 媒体 / 工作空间</div>
    <div class="w-model">当前模型：<b>${esc(curModel)}</b></div>
    <div class="w-feats">
      <span>💬 多模型对话</span><span>🛠 编程工具</span><span>🖼 媒体生成</span>
      <span>📦 工作空间</span><span>📄 文档解析</span><span>🌳 会话管理</span>
    </div>
    <div class="w-hint">直接输入问题开始对话 · <code>@</code> 引用文件 · <code>/</code> 查看命令</div>
    <div class="w-actions">
      <button id="w-new">＋ 新建会话</button>
      <button id="w-file">@ 引用文件</button>
      <button id="w-cmd">/ 斜杠命令</button>
    </div>
  </div>`;
  $("w-new").addEventListener("click", newSession);
  $("w-file").addEventListener("click", welcomeAt);
  $("w-cmd").addEventListener("click", welcomeSlash);
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
// 事件数组上限：防止长对话 events 无限累积占内存（重放视图只需最近的事件）
const MAX_EVENTS = 500;
function pushEvent(st, ev) {
  st.events.push(ev);
  if (st.events.length > MAX_EVENTS) st.events.splice(0, st.events.length - MAX_EVENTS);
}
function onDelta(sid, text) {
  const st = streams.get(sid);
  if (st) {
    st.text += text;
    pushEvent(st, { type: "delta", text });
  }
  // v2：工具阶段文字也实时渲染（不再压到任务结束）——干活时能看到实时描述
  if (sid === currentKey()) queueDelta(text);
}
function onThink(sid, text) {
  const st = streams.get(sid);
  if (st) { st.think += text; pushEvent(st, { type: "think", text }); }
  if (sid === currentKey()) queueThink(text);
}
function onThinkEnd(sid) {
  const st = streams.get(sid);
  if (st) pushEvent(st, { type: "think_end" });
  if (sid === currentKey()) endThinking();
}
function onTool(sid, name, argsText, toolCallId, rawArgs) {
  const st = streams.get(sid);
  if (st) {
    st.toolStarted = true;
    st.tools.set(toolCallId, { name, argsText, rawArgs, output: "", isError: false, done: false, start: performance.now() });
    st.toolOrder.push(toolCallId);
    pushEvent(st, { type: "tool", id: toolCallId, name, argsText, rawArgs });
  }
  if (sid === currentKey()) addTool(name, argsText, toolCallId, rawArgs);
}
function onToolOutput(sid, toolCallId, text) {
  const st = streams.get(sid);
  if (st && st.tools.has(toolCallId)) {
    st.tools.get(toolCallId).output = text || "";
    pushEvent(st, { type: "tool_output", id: toolCallId, text: text || "" });
  }
  if (sid === currentKey()) updateToolOutput(toolCallId, text);
}
function onToolEnd(sid, toolCallId, isError, output) {
  const st = streams.get(sid);
  if (st && st.tools.has(toolCallId)) {
    const t = st.tools.get(toolCallId);
    if (output) t.output = output;
    t.isError = !!isError; t.done = true;
    pushEvent(st, { type: "tool_end", id: toolCallId, isError: !!isError });
  }
  if (sid === currentKey()) { if (output) updateToolOutput(toolCallId, output); endTool(toolCallId, !!isError); }
}

// 切换/重建视图：把数据层某个会话的进行中状态完整渲染到 #messages
// includeUser=true 时先渲染用户消息（新会话无历史；历史会话的历史里已有）
function renderStreamView(sid, includeUser = false) {
  const st = streams.get(sid);
  if (!st) return;
  if (includeUser && st.userText) addUserMsg(st.userText);
  for (const ev of st.events) {
    switch (ev.type) {
      case "think": appendThinking(ev.text); break;
      case "think_end": endThinking(); break;
      case "tool": addTool(ev.name, ev.argsText, ev.id, ev.rawArgs); break;
      case "tool_output": updateToolOutput(ev.id, ev.text); break;
      case "tool_end": if (ev.output) updateToolOutput(ev.id, ev.output); endTool(ev.id, ev.isError); break;
      // v2：工具阶段的文字也实时渲染（与流式一致）
      case "delta": appendDelta(ev.text); break;
    }
  }
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
function endThinking() {
  if (render.thinkingEl) {
    render.thinkingEl.el.classList.add("collapsed");
    const p = render.thinkingEl.el.querySelector(".think-pulse");
    if (p) p.remove();
    render.thinkingEl = null;
  }
}

function addUserMsg(text, id) {
  const box = $("messages");
  const el = document.createElement("div");
  el.className = "msg user";
  el.style.setProperty("--i", box.children.length);
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
  el.style.setProperty("--i", box.children.length);
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
  // 长代码块展开/收起（md 里 >25 行自动加 is-long + 展开按钮）
  root.querySelectorAll(".code-expand").forEach(btn => {
    btn.addEventListener("click", () => {
      const wrap = btn.closest(".code-wrap");
      if (!wrap) return;
      const expanded = wrap.classList.toggle("expanded");
      btn.textContent = expanded ? "收起" : "展开";
    });
  });
}
function appendDelta(text) {
  const box = $("messages");
  if (!render.assistantEl) {
    const el = document.createElement("div");
    el.className = "msg assistant";
    // 入场动画序号（staggered reveal）
    el.style.setProperty("--i", box.children.length);
    el.innerHTML = `<div class="who"><span class="avatar">π</span><span class="name">小语</span><span class="msg-time">${nowTime()}</span></div><div class="bubble"></div>`;
    box.appendChild(el);
    render.assistantEl = { el, bubble: el.querySelector(".bubble") };
  }
  // 追加新文本节点（O(1)）。避免 textContent += 的 O(n²)：长文本下每次追加都重写全部内容导致卡顿
  const bubble = render.assistantEl.bubble;
  bubble.appendChild(document.createTextNode(text));
  // 定期合并文本节点，防止长回答节点数量爆炸（只合并文本节点，保留其他元素结构）
  if (bubble.childNodes.length > 400) {
    const texts = [...bubble.childNodes].filter(n => n.nodeType === Node.TEXT_NODE);
    const joined = texts.map(n => n.textContent).join("");
    texts.forEach(n => n.remove());
    if (joined) bubble.insertBefore(document.createTextNode(joined), bubble.firstChild);
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
  } else if (name === "think") {
    // 外部思考草稿：头部不堆内容，body 里展示完整草稿
    head += `<span class="t-name">think</span><span class="t-cmd" style="color:var(--dim)">思考草稿（调试）</span>`;
  } else if (argsText) {
    head += `<span class="t-name">${esc(name)}</span><span class="t-cmd">${esc(argsText)}</span>`;
  } else {
    head += `<span class="t-name">${esc(name)}</span>`;
  }
  head += `<span class="t-state"><span class="spinner" style="--tc:var(${colorVar})"></span>运行中</span>`;

  const el = document.createElement("div");
  el.className = "tool running" + (name === "think" ? " tool-think" : "");
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

  // think 草稿：把模型写进工具参数的内容直接展示为可折叠草稿块（默认展开）
  if (name === "think") {
    const draft = String((rawArgs && rawArgs.content) || argsText || "").trim();
    if (draft) {
      el.classList.add("expanded");
      const outEl = el.querySelector(".tool-out");
      outEl.className = "tool-out tool-think-out";
      outEl.innerHTML = `<div class="think-draft">${esc(draft)}</div><div class="think-note">🧠 思考草稿 · 仅本次会话内存可见，不落盘</div>`;
    }
  }

  const card = {
    el,
    outEl: el.querySelector(".tool-out"),
    durEl: el.querySelector(".t-dur"),
    sizeEl: el.querySelector(".t-size"),
    stateEl: el.querySelector(".t-state"),
    start: performance.now(),
    output: "",
    hasDiff: false,
    isThink: name === "think",
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
  if (card.isThink) { card.sizeEl.textContent = fmtSize(card.output.length); return; } // 思考草稿保持展示，不被结果覆盖
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
  if (card.output && !card.hasDiff && !card.isThink) {
    const shown = card.output.length > 4000 ? "…[已截断]…\n" + card.output.slice(-4000) : card.output;
    card.outEl.textContent = shown;
    card.el.classList.add("expanded");
  }
  if (card.hasDiff) card.el.classList.add("expanded");
}

// ══ 工具卡运行时长监控：running 卡片实时显示已用时长，超 120s 标「可能卡住」 ══
// （解决「bash 卡住但无提示」：旧逻辑看门狗因 hasRunning 跳过警告，卡住的卡片会无限转圈）
setInterval(() => {
  for (const card of render.toolEls.values()) {
    if (!card.el.classList.contains("running")) continue;
    const sec = Math.round((performance.now() - card.start) / 1000);
    card.durEl.textContent = "已运行 " + fmtDur(performance.now() - card.start);
    if (sec > 120 && !card.timeoutWarned) {
      card.timeoutWarned = true;
      card.el.classList.add("tool-timeout");
      card.stateEl.innerHTML = `<span style="color:var(--yellow)">⚠ 可能卡住</span>`;
      setStatus("工具可能卡住", "error");
    }
  }
}, 1000);

// ══ 回到底部按钮：滚动远离底部时出现，点击平滑回底（长对话便捷） ══
(function initScrollBottom() {
  const msgs = $("messages");
  const btn = $("scroll-bottom");
  if (!msgs || !btn) return;
  msgs.addEventListener("scroll", () => {
    const far = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight > 200;
    if (btn.hidden !== !far) btn.hidden = !far;
  }, { passive: true });
  btn.addEventListener("click", () => {
    msgs.scrollTo({ top: msgs.scrollHeight, behavior: "smooth" });
  });
})();

// ══ 简易 Markdown ══
function md(src) {
  let s = esc(src);
  const blocks = [];
  s = s.replace(/```([\w+-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const id = `__CB${blocks.length}__`;
    if (lang === "mermaid") {
      blocks.push(`<pre class="mermaid">${code}</pre>`);
    } else {
      const lineCount = (code.match(/\n/g) || []).length + 1;
      const isLong = lineCount > 25;
      blocks.push(`<div class="code-wrap${isLong ? " is-long" : ""}"><div class="code-head"><span class="lang">${lang || "code"}</span><span class="code-actions"><button class="copy-btn">复制</button>${isLong ? `<button class="code-expand">展开 ${lineCount} 行</button>` : ""}</span></div><pre><code class="language-${lang || ""}">${code.length > 100000 ? code.slice(0, 100000) + "\n…[内容过长已截断，共 " + Math.round(code.length / 1024) + "KB]…" : code}</code></pre></div>`);
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
    // SRI：防止 vendor 脚本被劫持后执行恶意代码（CSP 之外的第三道防线）
    s.integrity = "sha384-RH2xi4eIQ/gjtbs9fUXM68sLSi99C7ZWBRX1vDrVv6GQXRibxXLbwO2NGZB74MbU";
    s.crossOrigin = "anonymous";
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

// ══ 情绪指示器：把服务端 VAD 三维情绪映射成可见状态 ══
function emoMeta(s) {
  const v = s.valence || 0, a = s.arousal || 0;
  const tags = s.tags || [];
  if (tags.includes("alert_risk")) return { emoji: "🛡", label: "安全警觉", cls: "risk" };
  if (tags.includes("user_frustrated")) return { emoji: "🤝", label: "安抚模式", cls: "calm" };
  if (tags.includes("user_urgent")) return { emoji: "⚡", label: "快速响应", cls: "high" };
  if (tags.includes("user_anxious")) return { emoji: "🤗", label: "稳住局面", cls: "calm" };
  if (tags.includes("task_accomplish")) return { emoji: "🎉", label: "交付达成", cls: "high" };
  if (a >= 0.6 && v >= 0.4) return { emoji: "🔥", label: "兴奋", cls: "high" };
  if (a >= 0.6) return { emoji: "⚠", label: "警觉", cls: "risk" };
  if (v >= 0.4 && a <= 0.45) return { emoji: "😌", label: "平和", cls: "calm" };
  if (v <= 0.1) return { emoji: "🌧", label: "低落", cls: "low" };
  if (a >= 0.45 && v < 0.3) return { emoji: "🤨", label: "有压力", cls: "low" };
  return { emoji: "🧘", label: "专注", cls: "focus" };
}
async function refreshEmotion() {
  try {
    const s = await api("/api/emotion?session=" + encodeURIComponent(currentId || "new"));
    const m = emoMeta(s);
    window.emoState = { state: s, meta: m }; // 供右下角虚拟形象驱动表情
    $("emo-ico").textContent = m.emoji;
    // 悬停提示：情绪 + 人格基因摘要（性格维度）
    let title = "小语情绪：" + m.label;
    if (s.genome) {
      const g = s.genome;
      const top = Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const names = { gentleness: "温柔", initiative: "主动", curiosity: "好奇", attachment: "依恋", learning: "好学", creativity: "创造", caution: "谨慎", humor: "幽默", loyalty: "忠诚", autonomy_bias: "自主", adaptability: "适应" };
      title += "\n性格：" + top.map(([k, v]) => `${names[k] || k} ${Math.round(v * 100)}%`).join(" · ");
    }
    $("emo-pill").title = title;
    const pill = $("emo-pill");
    if (pill.dataset.emo !== m.cls) {
      pill.dataset.emo = m.cls;
      pill.classList.remove("pop"); void pill.offsetWidth; pill.classList.add("pop");
    }
  } catch {}
}

// ══ 发送（支持跨会话并发流式）══
const controllers = new Map(); // key -> AbortController（停止当前会话的生成）

function onNote(sid, text) {
  const st = streams.get(sid);
  if (st) { st.text += "\n" + text; pushEvent(st, { type: "delta", text: "\n" + text }); }
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
  st.taskKey = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
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
  refreshEmotion(); // 发送后立即反映情绪（风险/急躁等线索在服务端已更新）
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
          taskKey: st.taskKey,
          files: attachFiles,
          images: attachImages,
          fresh,
          params: window.piParams || undefined,
          think: window.externalThinkingOn === true,
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
    // 无事件 watchdog：90s 没有任何 SSE 事件且无工具在跑 → 提示可能卡住/断线
    let lastEvent = Date.now();
    let idleWarned = false;
    watchdogEpoch = epoch;
    watchdog = setInterval(() => {
      // 本看门狗已过期（被新流打断接管）→ 自毁
      if (watchdogEpoch !== epoch) { clearInterval(watchdog); watchdog = null; return; }
      const idle = (Date.now() - lastEvent) / 1000;
      const hasRunning = [...render.toolEls.values()].some(c => c.el.classList.contains("running"));
      // 推理模型首 token 延迟可能较长：90s 无事件才警告，且措辞中性
      if (idle > 90 && !idleWarned && !hasRunning) {
        idleWarned = true;
        if (currentKey() === key) {
          appendDelta(`\n\n⚠️ 已 ${Math.round(idle)}s 无新消息——模型可能在深度思考或网络不畅，可稍候或点「停止」重试`);
          setStatus(`等待响应 ${Math.round(idle)}s`, "error");
        }
      } else if (idleWarned && (idle <= 90 || hasRunning)) {
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
        st.lastEventAt = Date.now();
        let obj; try { obj = JSON.parse(data); } catch { continue; }
        // 注册表优先：自定义消息类型走渲染器（插件式扩展，不用改核心 switch）
        if (typeof dispatchRenderer === "function" && dispatchRenderer(ev, { ev, obj, key, sid: key })) {
          continue;
        }
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
          case "file":
            // 模型产出的文件附件 → 聊天界面直接展示文件卡片（而非只给链接）
            if (obj && obj.path) addFileMsg(obj, "assistant");
            break;
          case "image":
            // 会话里的图片附件 → 聊天界面直接显示
            if (obj && obj.data) addImageMsg(obj, "assistant");
            break;
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
              // 新会话应用切换时记的 pending 模型
              if (window.pendingModel) {
                const [pm, pmid] = window.pendingModel.split("/");
                sessionModels[obj.sessionId] = window.pendingModel;
                try { localStorage.setItem("pi_session_models", JSON.stringify(sessionModels)); } catch {}
                api("/api/model", { method: "POST", body: { provider: pm, modelId: pmid, sessionId: obj.sessionId } }).catch(() => {});
                window.pendingModel = null;
                const opt = [...$("model-select").options].find(o => o.value === sessionModels[obj.sessionId]);
                if (opt) $("input-model-name").textContent = opt.dataset.modelId || "";
              }
            }
            flushNow();
            done = true;
            break;
          case "error": appendDelta("\n\n[错误] " + (obj.message || "未知错误")); flushNow(); done = true; break;
        }
      }
    }
    // 收尾（仅当当前视图仍是本会话时操作 DOM）
    refreshEmotion(); // 对话结束同步情绪（完成/兴奋等线索已更新）
    if (currentKey() === key) {
      if (st.toolStarted) {
        // 工具任务：文字已实时流式渲染（v2），收尾统一走 Markdown 重渲
        if (render.assistantEl) {
          const bubble = render.assistantEl.bubble;
          const raw = bubble.innerText;
          if (raw.trim()) {
            bubble.innerHTML = md(raw);
            bindCopyButtons(render.assistantEl.el);
            renderMermaidBlocks(render.assistantEl.el);
            highlightBlocks(render.assistantEl.el);
          }
          bindMsgCopy(render.assistantEl.el);
        } else if (!render.toolOrder.length) {
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
        else {
          // 流中途断开：先查服务端任务是否还在跑（息屏/网络抖动场景，任务可能并未失败）
          const tk = st.taskKey || (key.startsWith("__new__") ? null : key);
          if (tk) {
            let t = null;
            try { t = await api(`/api/tasks/active?taskKey=${encodeURIComponent(tk)}`); } catch {}
            if (t && t.active) {
              appendDelta(`\n\n⚠️ 连接中断，任务仍在继续（${t.stage || "处理中"}${t.toolName ? "：" + t.toolName : ""}）…正在等待完成并自动恢复`);
              setStatus("任务继续中…", "busy");
              pollTaskAndRecover(tk).catch(() => {});
              return; // 消息已发出，不清输入框
            }
          }
          // 任务不在跑：把消息恢复到输入框，方便一键重发
          $("input").value = text;
          autoGrow();
          updateSendBtn();
          toast("连接中断，消息已恢复，可直接重发");
        }
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


// ══ 消息渲染注册表（借鉴官方 pi-web-ui 插件式渲染）══
// 新消息类型：registerMessageRenderer(type, handler) 一行注册，不用改核心 switch
// 已注册类型优先于 switch；核心 switch 保留为默认兜底
if (typeof registerMessageRenderer === "function") {
  // file：模型产出的文件附件 → 文件卡片
  registerMessageRenderer("file", ({ obj }) => {
    if (obj && obj.path) addFileMsg(obj, "assistant");
    return true;
  });
  // media：媒体路由结果 → 图片/音频渲染
  registerMessageRenderer("media", ({ obj, key }) => {
    if (currentKey() === key) {
      if (obj.type === "image") renderImageMsg(obj.url);
      else if (obj.type === "audio") renderAudioMsg(obj.url);
      else if (obj.type === "video") renderVideoMsg(obj.url);
    }
    return true;
  });
  // note：过程提示
  registerMessageRenderer("note", ({ obj, key }) => {
    onNote(key, obj.text || "");
    return true;
  });
  // error：错误提示
  registerMessageRenderer("error", ({ obj, key }) => {
    if (currentKey() === key) {
      appendDelta("\n\n[错误] " + (obj.message || "未知错误"));
      flushNow();
    }
    return true;
  });
  console.log("[registry] 已注册消息渲染器:", listRenderers().join(", "));
}
