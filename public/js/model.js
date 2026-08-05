// ===== model.js（从 app.js 拆分，全局作用域，保持原逻辑不变）=====
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
        if (!await appConfirm(`删除 ${p.provider} 的 API 配置？`, "删除配置")) return;
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

