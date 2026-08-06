// ===== designer.js（设计器已迁移独立页 /workshop/designer，此处保留主页引用的技能详情/最近交付功能）=====
// 可视化页面设计器完整逻辑见 public/workshop-designer.html
$("designer-btn").addEventListener("click", () => {
  const t = new URLSearchParams(location.search).get("token") || localStorage.getItem("pi_web_token") || "";
  const sep = t ? "?token=" + encodeURIComponent(t) : "";
  location.href = "/workshop/designer" + sep;
});

// ══ 最近交付列表（工作空间面板）══
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

// ══ 技能详情弹窗 ══
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
