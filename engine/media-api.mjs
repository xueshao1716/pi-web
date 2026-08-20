// engine/media-api.mjs —— 媒体生成：图像/视频/TTS（2026-08-20 从 server.mjs 拆出）
// 依赖注入：initMediaApi({ resolveAuth, readJsonFile, modelsPath, getModelList })
import { json } from "./http-utils.mjs";
import { httpJsonFetch } from "./http.mjs";
import { modelCapabilities } from "./model-probe.mjs";
import { saveArtifact } from "./workspace-api.mjs"; // saveArtifact 定义在 workspace-api（工作空间块拆分时随走）

let _resolveAuth = null, _readJsonFile = null, _modelsPath = "", _authPath = "", _getModelList = () => [];
export function initMediaApi({ resolveAuth = null, readJsonFile = null, modelsPath = "", authPath = "", getModelList = null } = {}) {
  _resolveAuth = resolveAuth; _readJsonFile = readJsonFile; _modelsPath = modelsPath; _authPath = authPath; _getModelList = getModelList || _getModelList;
}

export function findMediaModel(type) {
  for (const m of _getModelList()) {
    const caps = m.capabilities || modelCapabilities(m.id);
    if (type === "image" && caps.image) return m;
    if (type === "tts" && caps.tts) return m;
    if (type === "video" && caps.video) return m;
  }
  return null;
}
// 检测消息中的媒体意图（支持多意图：配图+配音同时）
export function detectMediaIntents(message) {
  const intents = [];
  const msg = String(message || "");
  // 否定检测：明确说不要图/不要语音时绝不触发（“不用配图”“别画”“不需要语音”等）
  const negated = /(不用|别|不要|无需|不需要|别配|不配|不用画|别画|不需要配).{0,6}(图|画|图片|配图|配音|语音)/.test(msg);
  // 强指令词：明确的祈使动词，任意位置都触发（如“配图”“画图”“生成图片”）
  const STRONG = /(配图|画图|画个|画一|插画|生成图片|绘图|配一幅|做个.{0,4}(图|插画)|配个图)/;
  // 弱意图词：可能误触发的模糊表达，仅在前 30 字内触发（指令通常在开头）
  const WEAK = /(画.{0,8}(图|图片)|生成.{0,6}(图|图片)|一张.{0,8}(图|图片)|配.{0,3}(图|图片)|插图|配图)/;
  if (!negated && (STRONG.test(msg) || (msg.slice(0, 30).match(WEAK)))) intents.push({ type: "image" });
  const ttsNeg = /(不用|别|不要|无需|不需要).{0,6}(朗读|配音|语音|读出来)/.test(msg);
  if (!ttsNeg && /(配音|朗读|读出来|生成语音|配个音|读一下|配个音)/.test(msg)) intents.push({ type: "tts" });
  return intents;
}
// 提取媒体 prompt（去掉意图词）
export function extractMediaPrompt(message) {
  return String(message || "")
    .replace(/(配图|配.{0,2}图|插画|画图|画个|画一|画.{0,2}图|插图|生成图片|绘图|配一幅|生成.{0,8}图片|画.{0,10}图片|一张.{0,10}图片|做个.{0,6}图|配音|朗读|读出来|语音|生成语音|读一下|说出来)/g, "")
    .replace(/[，。！？,.]/g, " ")
    .trim() || message;
}
// 异步生成媒体（与主模型并行）
export async function generateMediaAsync(intent, prompt) {
  try {
    if (intent.type === "image") {
      const m = findMediaModel("image");
      if (!m) { console.log(`[pi-web] 媒体: 无 image 模型`); return null; }
      const url = await generateImage(m.provider, m.id, prompt);
      console.log(`[pi-web] 媒体 image: ${url ? "成功" : "失败"} prompt=${String(prompt).slice(0,30)}`);
      return url ? { type: "image", url, model: `${m.provider}/${m.id}` } : null;
    }
    if (intent.type === "tts") {
      const url = await generateTTS(prompt);
      console.log(`[pi-web] 媒体 tts: ${url ? "成功" : "失败"}`);
      return url ? { type: "audio", url, model: "xiaomi-token-plan-cn/mimo-v2.5-tts" } : null;
    }
  } catch (e) { console.log(`[pi-web] 媒体异常: ${String(e?.message||e).slice(0,80)}`); return null; }
  return null;
}
// TTS：mimo-tts 走 chat/completions（内容放 assistant 消息），返回音频 data URL
export async function generateTTS(text) {
  try {
    const provider = "xiaomi-token-plan-cn";
    const resolved = _resolveAuth(provider);
    if (!resolved) return null;
    const base = (resolved.baseUrl || "https://token-plan-cn.xiaomimimo.com/v1").replace(/\/+$/, "");
    const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
    const r = await httpJsonFetch(`${baseNoV1}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resolved.key}` },
      body: JSON.stringify({
        model: "mimo-v2.5-tts",
        messages: [
          { role: "assistant", content: String(text).slice(0, 2000) },
          { role: "user", content: "请朗读以上内容" },
        ],
        max_tokens: 500,
      }),
      timeout: 90000,
    });
    if (!r.ok) return null;
    const data = await r.json();
    const audio = data.choices?.[0]?.message?.audio?.data;
    if (!audio) return null;
    return `data:audio/wav;base64,${audio}`;
  } catch { return null; }
}

// 绘图：返回图片数据（供 handleChat 绘图模型通道复用）
export async function generateImage(provider, modelId, prompt, size) {
  const resolved = _resolveAuth(provider);
  if (!resolved) return null;
  const baseUrl = resolved.baseUrl || (_readJsonFile(_modelsPath)[provider]?.models || []).find(m => m.id === modelId)?.baseUrl;
  const key = resolved.key;
  const base = (baseUrl || "").replace(/\/+$/, "");
  const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
  const mkReq = (u) => httpJsonFetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: modelId, prompt, n: 1, size: size || "1024x1024" }),
    timeout: 180000,
  });
  let r = await mkReq(`${baseNoV1}/v1/images/generations`);
  if (!r.ok) r = await mkReq(`${baseNoV1}/images/generations`);
  if (!r.ok) r = await mkReq(`${baseNoV1}/v3/images/generations`); // 火山方舟规划版等 v3 endpoint
  if (!r.ok) return null;
  const data = await r.json();
  const item = data.data?.[0];
  if (!item) return null;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item.url) return item.url;
  return null;
}

export async function handleImage(res, body) {
  const { provider, modelId, prompt, size, image } = body || {};
  if (!provider || !modelId || !prompt) return json(res, 400, { error: "缺少 provider / modelId / prompt" });
  const resolved = _resolveAuth(provider);
  if (!resolved) return json(res, 400, { error: `${provider} 未配置 API Key（模型管理中添加）` });
  const baseUrl = resolved.baseUrl || (_readJsonFile(_modelsPath)[provider]?.models || []).find(m => m.id === modelId)?.baseUrl;
  const key = resolved.key;
  const base = (baseUrl || "").replace(/\/+$/, "");
  const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
  // 阿里云百炼 wan 系列图像：/api/v1/services/aigc/multimodal-generation/generation
  if (provider === "aliyun-bailian" && /^wan\d/.test(modelId || "")) {
    const sizeMap = { "1024x1024": "1024*1024", "832x1472": "720*1280", "736x1312": "720*1280", "720x1280": "720*1280", "1920x1920": "1024*1024" };
    const sz = sizeMap[size] || "1024*1024";
    try {
      const host = (baseUrl || "").includes("maas.aliyuncs.com") ? baseUrl.replace(/\/compatible-mode\/v1.*$/, "") : "";
      const apiBase = host || "https://token-plan.cn-beijing.maas.aliyuncs.com";
      const mkReq = (u) => httpJsonFetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: modelId,
          input: { messages: [{ role: "user", content: [{ text: prompt }] }] },
          parameters: { size: sz, n: 1 },
        }),
        timeout: 180000,
      });
      let r = await mkReq(`${apiBase}/api/v1/services/aigc/multimodal-generation/generation`);
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return json(res, 502, { error: `aliyun 绘图失败 ${r.status}: ${txt.slice(0, 150)}` });
      }
      const data = await r.json();
      const img = data?.output?.choices?.[0]?.message?.content?.find?.((c) => c?.image)?.image;
      if (!img) return json(res, 500, { error: "aliyun 绘图接口未返回图片" });
      return json(res, 200, { image: img });
    } catch (e) {
      json(res, 500, { error: String(e?.message || e).slice(0, 200) });
    }
    return;
  }
  // minimax 专属：/v1/image_generation + aspect_ratio + image_urls 响应
  if (provider === "minimax") {
    const ratioMap = { "1024x1024": "1:1", "832x1472": "9:16", "1472x832": "16:9", "1024x1792": "9:16", "1792x1024": "16:9" };
    const aspect_ratio = ratioMap[size] || (size === "1024x1024" ? "1:1" : "9:16");
    try {
      const mkReq = (u) => httpJsonFetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: modelId, prompt, aspect_ratio, response_format: "url" }),
        timeout: 180000,
      });
      let r = await mkReq(`${baseNoV1}/v1/image_generation`);
      if (!r.ok) r = await mkReq(`${baseNoV1}/image_generation`);
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return json(res, 502, { error: `minimax 绘图失败 ${r.status}: ${txt.slice(0, 150)}` });
      }
      const data = await r.json();
      const urls = data?.data?.image_urls;
      if (Array.isArray(urls) && urls.length) return json(res, 200, { image: urls[0] });
      return json(res, 500, { error: "minimax 绘图接口未返回图片" });
    } catch (e) {
      json(res, 500, { error: String(e?.message || e).slice(0, 200) });
    }
    return;
  }
  // ModelScope 专属：异步任务模式（提交 → 轮询 /v1/tasks/{id} → 取 output_images）
  if (provider === "modelscope") {
    const sizeMap = { "1024x1024": "1024x1024", "832x1472": "720x1280", "736x1312": "720x1280", "720x1280": "720x1280", "1920x1920": "1024x1024" };
    const sz = sizeMap[size] || "1024x1024";
    try {
      const mkReq = (u, body) => httpJsonFetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-ModelScope-Async-Mode": "true" },
        body: JSON.stringify(body || {}),
        timeout: 60000,
      });
      let r = await mkReq(`${baseNoV1}/v1/images/generations`, { model: modelId, prompt, n: 1, size: sz });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return json(res, 502, { error: `modelscope 提交失败 ${r.status}: ${txt.slice(0, 150)}` });
      }
      const { task_id } = await r.json();
      if (!task_id) return json(res, 500, { error: "modelscope 未返回 task_id" });
      // 轮询任务状态（约 14s 成功，最多 90s；官方示例 5s 间隔）
      for (let i = 0; i < 18; i++) {
        await new Promise(res => setTimeout(res, 5000));
        const q = await httpJsonFetch(`${baseNoV1}/v1/tasks/${encodeURIComponent(task_id)}`, {
          headers: { Authorization: `Bearer ${key}`, "X-ModelScope-Task-Type": "image_generation" }, timeout: 30000,
        });
        if (!q.ok) continue;
        const t = await q.json();
        if (t.task_status === "SUCCEED") {
          const imgUrl = t.output_images?.[0];
          if (imgUrl) return json(res, 200, { image: imgUrl }); // output_images 是可直接访问的图片 URL（前端 <img> 直接加载）
          return json(res, 500, { error: "modelscope 任务成功但无图片" });
        }
        if (t.task_status === "FAILED") {
          return json(res, 500, { error: "modelscope 任务失败: " + String(t.message || "未知").slice(0, 120) });
        }
      }
      return json(res, 504, { error: "modelscope 任务超时（90s）" });
    } catch (e) {
      json(res, 500, { error: String(e?.message || e).slice(0, 200) });
    }
    return;
  }
  // Cloudflare Workers AI 专属：POST /accounts/{id}/ai/run/@cf/... 返回 { result.image } base64
  if (provider === "cloudflare-ai") {
    // account_id 从 auth.json 的额外字段取（同 provider 配置里 account_id）
    const auth = _readJsonFile(_authPath);
    const accountId = auth["cloudflare-ai"]?.account_id || process.env.CLOUDFLARE_ACCOUNT_ID || "";
    if (!accountId) return json(res, 400, { error: "cloudflare-ai 未配置 account_id（模型管理中添加）" });
    const sizeMap = { "1024x1024": [512, 512], "832x1472": [512, 896], "736x1312": [512, 896], "720x1280": [512, 896], "1920x1920": [768, 768] };
    // 默认 512x512 省免费额度（10k Neurons/天，1024 大图一张就顶一天）
    const [w, h] = sizeMap[size] || [512, 512];
    // 原始二进制返回的模型（phoenix 等）：响应直接是图片字节，不是 JSON base64
    const rawBinary = /leonardo\/phoenix/.test(modelId || "");
    // FLUX.2 系列：要求 multipart/form-data 输入（prompt 字段），不是纯 JSON；且 multipart 需精确字节 → 也走二进制通道
    const useMultipart = /flux-2/.test(modelId || "");
    const rawChannel = rawBinary || useMultipart;
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${modelId}`;
      const jsonBody = JSON.stringify({ prompt, width: w, height: h, steps: 4 });
      let body = jsonBody;
      let headers = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
      if (useMultipart) {
        const boundary = "----piwebcf" + Math.floor(Math.random() * 1e9);
        body = `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n--${boundary}--\r\n`;
        headers = { "Content-Type": `multipart/form-data; boundary=${boundary}`, Authorization: `Bearer ${key}` };
      }
      if (rawChannel) {
        // 二进制模型：原生 fetch 直接拿 buffer（旧 python 中转 + base64 方案已移除）
        const r = await httpBufferFetch(url, { method: "POST", headers, body, timeout: 180000 });
        if (r.status >= 300) return json(res, 502, { error: `cloudflare 绘图失败 ${r.status}` });
        const buf = r.buffer();
        if (!buf || !buf.length) return json(res, 500, { error: "cloudflare 未返回图片数据" });
        // 部分模型（FLUX.2）响应是 JSON {result:{image: b64}}，需要解包；纯二进制模型（phoenix）直接用
        try {
          const parsed = JSON.parse(buf.toString("utf8"));
          const inner = parsed?.result?.image;
          if (typeof inner === "string") return json(res, 200, { image: `data:image/jpeg;base64,${inner}` });
        } catch {}
        return json(res, 200, { image: `data:image/jpeg;base64,${buf.toString("base64")}` });
      }
      const r = await httpJsonFetch(url, {
        method: "POST",
        headers,
        body,
        timeout: 180000,
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return json(res, 502, { error: `cloudflare 绘图失败 ${r.status}: ${txt.slice(0, 150)}` });
      }
      const data = await r.json();
      const b64 = data?.result?.image;
      if (!b64) return json(res, 500, { error: "cloudflare 未返回图片数据" });
      return json(res, 200, { image: `data:image/jpeg;base64,${b64}` });
    } catch (e) {
      json(res, 500, { error: String(e?.message || e).slice(0, 200) });
    }
    return;
  }
  try {
    // 火山方舟 seedream 5.0：最小 3686400 像素，但保留宽高比（1:1/9:16/16:9）
    let effSize = size || "1024x1024";
    if (provider === "volces-ark" && /seedream/i.test(modelId || "")) {
      // 按比例映射且面积 ≥3686400：1:1→1920x1920；9:16→1440x2560(面积3686400)；16:9→2560x1440
      const ratioMap = {
        "1024x1024": "1920x1920",   // 1:1
        "832x1472": "1440x2560",    // 9:16 竖图
        "736x1312": "1440x2560",    // 9:16
        "720x1280": "1440x2560",    // 9:16
        "1472x832": "2560x1440",    // 16:9 横图
      };
      effSize = ratioMap[effSize] || (effSize.includes("x") ? effSize : "1920x1920");
    }
    const mkReq = (u) => httpJsonFetch(u, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, prompt, n: 1, size: effSize, ...(image ? { image } : {}) }),
      timeout: 180000,
    });
    let r = await mkReq(`${baseNoV1}/v1/images/generations`);
    if (!r.ok) r = await mkReq(`${baseNoV1}/images/generations`);
    if (!r.ok) r = await mkReq(`${baseNoV1}/v3/images/generations`); // 火山方舟规划版等 v3 endpoint
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return json(res, 502, { error: `绘图接口调用失败 ${r.status}: ${txt.slice(0, 150)}` });
    }
    const data = await r.json();
    const item = data.data?.[0];
    if (!item) return json(res, 500, { error: "绘图接口未返回图片" });
    if (item.b64_json) return json(res, 200, { image: `data:image/png;base64,${item.b64_json}` });
    if (item.url) return json(res, 200, { image: item.url });
    return json(res, 500, { error: "绘图接口未返回可用图片数据" });
  } catch (e) {
    json(res, 500, { error: String(e?.message || e).slice(0, 800) });
  }
}

// 出图后自动落盘到本地（生成物/图片/日期），返回本地 URL——稳定展示 + 留档
// 避免第三方 OSS 链接不稳定导致页面图不展示
export async function handleImageWithSave(res, req, body) {
  // 2026-08-20 改造：不再覆盖模块级 json（ESM 只读绑定）——传 fakeRes 给 handleImage，捕获其输出
  let payload = null;
  const fakeRes = {
    writeHead(code) { payload = payload || { code }; },
    end(data) { if (!payload) payload = { code: 200 }; try { payload.obj = JSON.parse(data); } catch { payload.obj = { raw: String(data) }; } },
  };
  try {
    await handleImage(fakeRes, body);
  } catch (e) {
    payload = { code: 500, obj: { error: String(e?.message || e).slice(0, 200) } };
  }
  // 成功出图 → 落盘本地，覆盖返回
  if (payload && payload.code === 200 && payload.obj?.image) {
    const saved = await saveArtifact({ type: "image", url: payload.obj.image }).catch(() => null);
    if (saved) payload.obj.image = saved;
    // 相对路径补全为绝对 URL（按实际访问 Host，本地/公网都可用）——修复"每次手动拼 127.0.0.1:8787"的坑
    if (typeof payload.obj.image === "string" && payload.obj.image.startsWith("/")) {
      const host = req?.headers?.host || "127.0.0.1:8787";
      const proto = req?.headers?.["x-forwarded-proto"]?.startsWith("https") ? "https" : "http";
      payload.obj.image = `${proto}://${host}${payload.obj.image}`;
    }
  }
  // 统一输出（只发一次）
  try { json(res, payload?.code || 500, payload?.obj || { error: "未知错误" }); } catch {}
}


export async function generateVideo(provider, modelId, prompt, body = {}) {
  const resolved = _resolveAuth(provider);
  if (!resolved) return { error: `${provider} 未配置 API Key` };
  const baseUrl = resolved.baseUrl || (_readJsonFile(_modelsPath)[provider]?.models || []).find(m => m.id === modelId)?.baseUrl;
  const key = resolved.key;
  const base = (baseUrl || "").replace(/\/+$/, "");
  const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
  try {
    // Agnes 官方：POST /v1/videos 创建任务（旧路径 /video/generations 会 403）
    const bodyObj = { model: modelId, prompt };
    if (body?.width) bodyObj.width = +body.width;
    if (body?.height) bodyObj.height = +body.height;
    if (body?.num_frames) bodyObj.num_frames = +body.num_frames;
    if (body?.frame_rate) bodyObj.frame_rate = +body.frame_rate;
    if (body?.image) bodyObj.image = body.image;
    const createR = await httpJsonFetch(`${baseNoV1}/v1/videos`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(bodyObj), timeout: 60000,
    });
    if (!createR.ok) { const t = await createR.text().catch(() => ""); return { error: `视频任务创建失败 ${createR.status}: ${t.slice(0, 150)}` }; }
    const created = await createR.json();
    const taskId = created.task_id || created.id || created.video_id || created.data?.task_id;
    if (!taskId) return { error: "视频接口未返回任务 ID" };
    for (let i = 0; i < 36; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        // Agnes 官方：GET /agnesapi?video_id= 查询（旧路径 /videos/generations 404）
        const qR = await httpJsonFetch(`${baseNoV1}/agnesapi?video_id=${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${key}` }, timeout: 20000,
        });
        if (!qR.ok) continue;
        const q = await qR.json();
        const url = q.url || q.video_url || q.output?.url || q.data?.url || q.data?.video_url || q.metadata?.url;
        if (url) return { video: url, task_id: taskId };
        if (q.status === "failed" || q.state === "failed" || q.internal_status === "failed") return { error: "视频生成失败" };
      } catch {}
    }
    return { error: "视频生成超时（180s）", task_id: taskId };
  } catch (e) { return { error: String(e?.message || e).slice(0, 150) }; }
}

// POST /api/media —— 视频生成
export async function handleMedia(res, body) {
  const { provider, modelId, prompt } = body || {};
  if (!provider || !modelId || !prompt) return json(res, 400, { error: "缺少参数" });
  const r = await generateVideo(provider, modelId, prompt, body);
  if (r.video) return json(res, 200, { video: r.video, task_id: r.task_id });
  return json(res, 500, { error: r.error || "视频生成失败" });
}
