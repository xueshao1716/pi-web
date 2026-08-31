const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(location.search).get("token") || localStorage.getItem("pi_web_token") || "";
const STORE_KEY = "pi_image_studio_v1";
const state = { works: [], reference: null, style: "", preset: "", models: [] };

const PRESETS = {
  poster: { name: "视觉海报", prompt: "主题视觉海报，明确的中心主体，强烈视觉焦点，适合品牌传播，预留标题与文案空间" },
  product: { name: "产品视觉", prompt: "高端产品商业摄影，真实材质，精细棚拍布光，克制背景，广告级质感" },
  illustration: { name: "叙事插画", prompt: "富有故事感的主题插画，清晰前中后景，细腻笔触，完整环境叙事" },
  portrait: { name: "人物创作", prompt: "人物主题肖像，五官自然，姿态有张力，真实光影，背景服务于人物情绪" },
  logo: { name: "标志探索", prompt: "简洁独特的品牌标志概念，纯色背景，矢量感，清晰轮廓，高识别度，无 mockup" },
};

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}), Authorization: `Bearer ${token}` };
  if (opts.body && typeof opts.body !== "string") { headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(opts.body); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || 210000);
  try {
    const r = await fetch(path, { ...opts, headers, signal: controller.signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

function hasImage(m) {
  const c = m.capabilities;
  return Array.isArray(c) ? c.includes("image") : !!c?.image;
}
function selectedModel() {
  try { return JSON.parse($("model").value); } catch { return null; }
}
function setStatus(text = "", error = false) {
  $("generate-status").textContent = text;
  $("generate-status").classList.toggle("error", error);
}
function finalPrompt() {
  const raw = $("prompt").value.trim();
  const negative = $("negative").value.trim();
  return [raw, state.style, negative ? `避免出现：${negative}` : ""].filter(Boolean).join("，").slice(0, 1800);
}
function saveDraft() {
  const data = {
    project: $("project-name").value,
    prompt: $("prompt").value,
    negative: $("negative").value,
    size: $("size").value,
    count: $("count").value,
    style: state.style,
    preset: state.preset,
    works: state.works.slice(0, 20),
  };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch {}
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    if (d.project) $("project-name").value = d.project;
    if (d.prompt) $("prompt").value = d.prompt;
    if (d.negative) $("negative").value = d.negative;
    if (d.size) $("size").value = d.size;
    if (d.count) $("count").value = d.count;
    state.style = d.style || ""; state.preset = d.preset || "";
    state.works = Array.isArray(d.works) ? d.works.filter(w => w?.url).slice(0, 20) : [];
  } catch {}
  document.querySelectorAll("[data-preset]").forEach(b => b.classList.toggle("on", b.dataset.preset === state.preset));
  document.querySelectorAll("[data-style]").forEach(b => b.classList.toggle("on", b.dataset.style === state.style));
  syncText(); renderWorks();
}
function syncText() {
  $("prompt-count").textContent = `${$("prompt").value.length} / 1600`;
  $("canvas-title").textContent = $("project-name").value.trim() || "未命名创作";
}
function renderWorks() {
  const grid = $("art-grid");
  $("empty-canvas").hidden = state.works.length > 0;
  $("work-count").textContent = `${state.works.length} 个作品`;
  grid.innerHTML = state.works.map((w, i) => `<article class="art-card">
    <div class="art-image" data-view="${i}"><img src="${escapeAttr(w.url)}" alt="生成作品"><span class="art-index">#${String(state.works.length - i).padStart(2,"0")}</span></div>
    <div class="art-info"><p>${escapeHtml(w.prompt || "")}</p><div class="art-actions"><a href="${escapeAttr(w.url)}" target="_blank" rel="noopener">打开原图</a><button data-use="${i}">作为参考</button></div></div>
  </article>`).join("");
  grid.querySelectorAll("[data-view]").forEach(el => el.onclick = () => openLightbox(state.works[+el.dataset.view]));
  grid.querySelectorAll("[data-use]").forEach(el => el.onclick = async () => useAsReference(state.works[+el.dataset.use]));
}
function escapeHtml(v) { return String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function escapeAttr(v) { return escapeHtml(v); }
function openLightbox(work) {
  $("lightbox-image").src = work.url; $("lightbox-caption").textContent = work.prompt || ""; $("lightbox").hidden = false;
}

async function fileToReference(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("请选择图片文件");
  if (file.size > 5 * 1024 * 1024) throw new Error("参考图不能超过 5MB");
  const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
  setReference(String(dataUrl), file.name);
}
function setReference(dataUrl, name = "参考图") {
  state.reference = { dataUrl, base64: dataUrl.split(",")[1] || dataUrl, name };
  $("reference-preview").src = dataUrl; $("reference-preview").hidden = false; $("reference-empty").hidden = true;
  $("reference-actions").hidden = false; $("reference-name").textContent = name;
}
function clearReference() {
  state.reference = null; $("reference-preview").src = ""; $("reference-preview").hidden = true; $("reference-empty").hidden = false; $("reference-actions").hidden = true; $("reference-file").value = "";
}
async function useAsReference(work) {
  try {
    setStatus("正在读取作品作为参考图…");
    const r = await fetch(work.url); const blob = await r.blob();
    await fileToReference(new File([blob], "画布作品.png", { type: blob.type || "image/png" }));
    setStatus("已设为参考图，可继续进行图生图");
  } catch { setStatus("该图片无法读取为参考图，可先下载后上传", true); }
}

async function loadModels() {
  try {
    const d = await api("/api/models", { timeout: 20000 });
    state.models = (d.models || []).filter(m => hasImage(m) && !/video/i.test(m.id));
    const select = $("model"); select.innerHTML = "";
    const groups = Object.groupBy ? Object.groupBy(state.models, m => m.provider) : state.models.reduce((a,m)=>((a[m.provider] ||= []).push(m),a),{});
    for (const [provider, models] of Object.entries(groups)) {
      const group = document.createElement("optgroup"); group.label = provider;
      for (const m of models) { const op = document.createElement("option"); op.value = JSON.stringify({ provider:m.provider, modelId:m.id }); op.textContent = m.name || m.id; group.append(op); }
      select.append(group);
    }
    if (!state.models.length) select.innerHTML = '<option value="">暂无图像模型</option>';
    $("connection").textContent = `已连接 · ${state.models.length} 个绘图模型`;
  } catch (e) {
    $("connection").textContent = token ? "连接失败" : "请先登录主工作台";
    $("model").innerHTML = '<option value="">模型加载失败</option>';
    setStatus(e.message, true);
  }
}

async function polishPrompt() {
  const raw = $("prompt").value.trim();
  if (!raw) return setStatus("先写一句你想画什么", true);
  const btn = $("polish"); btn.disabled = true; btn.textContent = "补全中…";
  try {
    const r = await fetch("/api/chat", { method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`,"x-pi-test":"1"}, body:JSON.stringify({ fresh:true, message:`把下面的图像创意扩写成一段可直接用于 AI 生图的中文提示词。保留原意，补足主体、环境、构图、镜头、光线、色彩、材质；控制在180字内；不要解释，只输出提示词：\n${raw}` }) });
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
    const reader = r.body.getReader(), dec = new TextDecoder(); let buffer = "", text = "";
    while (true) { const {value,done}=await reader.read(); if(done) break; buffer += dec.decode(value,{stream:true}); let cut; while((cut=buffer.indexOf("\n\n"))>=0){const block=buffer.slice(0,cut);buffer=buffer.slice(cut+2);if(block.includes("event: delta")){const line=block.split("\n").find(x=>x.startsWith("data:"));try{text += JSON.parse(line.slice(5).trim()).text || ""}catch{}}} }
    if (text.trim()) { $("prompt").value = text.trim().slice(0,1600); syncText(); saveDraft(); }
  } catch (e) { setStatus(`智能补全失败：${e.message}`, true); }
  finally { btn.disabled=false; btn.textContent="✨ 智能补全"; }
}

async function generate() {
  const model = selectedModel(), prompt = finalPrompt();
  if (!model) return setStatus("请选择绘图模型", true);
  if (!prompt) return setStatus("请先描述要生成的画面", true);
  const count = +$("count").value || 1, btn = $("generate");
  btn.disabled = true; setStatus(`正在生成 ${count} 张作品，完成后会自动入库…`);
  const body = { ...model, prompt, size:$("size").value };
  if (state.reference?.base64) body.image = state.reference.base64;
  const results = await Promise.allSettled(Array.from({length:count}, () => api("/api/image", { method:"POST", body })));
  const now = new Date().toISOString(); let ok = 0;
  for (const r of results) if (r.status === "fulfilled" && r.value?.image) { state.works.unshift({ url:r.value.image, prompt, model:`${model.provider}/${model.modelId}`, at:now }); ok++; }
  state.works = state.works.slice(0,20); renderWorks(); saveDraft(); btn.disabled=false;
  if (ok) setStatus(`完成 ${ok}/${count} 张 · 已保存到工作空间与本地画布`); else setStatus(`生成失败：${results[0]?.reason?.message || "上游未返回图片"}`, true);
}

function bind() {
  $("project-name").oninput = () => { syncText(); saveDraft(); };
  $("prompt").oninput = () => { syncText(); saveDraft(); };
  $("negative").oninput = saveDraft; $("size").onchange = saveDraft; $("count").onchange = saveDraft;
  document.querySelectorAll("[data-preset]").forEach(btn => btn.onclick = () => {
    state.preset = btn.dataset.preset; document.querySelectorAll("[data-preset]").forEach(b => b.classList.toggle("on", b === btn));
    const p = PRESETS[state.preset]; $("project-name").value = p.name; if (!$("prompt").value.trim()) $("prompt").value = p.prompt; syncText(); saveDraft();
  });
  document.querySelectorAll("[data-style]").forEach(btn => btn.onclick = () => {
    state.style = state.style === btn.dataset.style ? "" : btn.dataset.style;
    document.querySelectorAll("[data-style]").forEach(b => b.classList.toggle("on", b.dataset.style === state.style)); saveDraft();
  });
  document.querySelectorAll("[data-quick]").forEach(btn => btn.onclick = () => { $("prompt").value=btn.dataset.quick;syncText();saveDraft(); });
  $("polish").onclick = polishPrompt; $("generate").onclick = generate;
  $("reference-drop").onclick = () => $("reference-file").click();
  $("reference-file").onchange = async e => { try { await fileToReference(e.target.files[0]); setStatus("参考图已加入"); } catch(err){setStatus(err.message,true)} };
  for (const ev of ["dragenter","dragover"]) $("reference-drop").addEventListener(ev,e=>{e.preventDefault();$("reference-drop").style.borderColor="var(--studio-accent)"});
  $("reference-drop").addEventListener("dragleave",()=>$("reference-drop").style.borderColor="");
  $("reference-drop").addEventListener("drop",async e=>{e.preventDefault();$("reference-drop").style.borderColor="";try{await fileToReference(e.dataTransfer.files[0])}catch(err){setStatus(err.message,true)}});
  $("remove-reference").onclick = clearReference;
  $("clear-board").onclick = () => { if(confirm("清空当前画布中的历史作品？工作空间里的原图不会删除。")){state.works=[];renderWorks();saveDraft()} };
  $("lightbox-close").onclick = () => $("lightbox").hidden=true; $("lightbox").onclick=e=>{if(e.target===$("lightbox"))$("lightbox").hidden=true};
}

bind(); loadDraft(); loadModels();
