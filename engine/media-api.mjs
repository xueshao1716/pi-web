// engine/media-api.mjs —— 媒体生成：图像/视频/TTS（2026-08-20 从 server.mjs 拆出）
// 依赖注入：initMediaApi({ resolveAuth, readJsonFile, modelsPath, getModelList })
import { json } from "./http-utils.mjs";
import { httpJsonFetch } from "./http.mjs";
import { modelCapabilities } from "./model-probe.mjs";
import { saveArtifact } from "./workspace-api.mjs"; // saveArtifact 定义在 workspace-api（工作空间块拆分时随走）
import { videoCreateBody, videoPollPath, repairVideoRequest } from "./video-request.mjs";
import { extractPlayableMedia } from "./media-embed.mjs";

let _resolveAuth = null, _readJsonFile = null, _modelsPath = "", _authPath = "", _getModelList = () => [];
export function initMediaApi({ resolveAuth = null, readJsonFile = null, modelsPath = "", authPath = "", getModelList = null } = {}) {
  _resolveAuth = resolveAuth; _readJsonFile = readJsonFile; _modelsPath = modelsPath; _authPath = authPath; _getModelList = getModelList || _getModelList;
}

export function findMediaModel(type) {
  const hits = [];
  for (const m of _getModelList()) {
    const caps = m.capabilities || modelCapabilities(m.id);
    if (type === "image" && caps.image) hits.push(m);
    else if (type === "tts" && caps.tts) hits.push(m);
    else if (type === "video" && caps.video) hits.push(m);
  }
  if (!hits.length) return null;
  if (type !== "image") return hits[0];
  const rank = (m) => {
    const id = String(m.id || "").toLowerCase();
    if (/2\.5|3\.|latest|pro/.test(id)) return 0;
    if (/2\.0/.test(id)) return 2;
    return 1;
  };
  return hits.reduce((best, m) => (rank(m) < rank(best) ? m : best));
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
  const videoNeg = /(不用|别|不要|无需|不需要).{0,6}(视频|片子|短片)/.test(msg);
  if (!videoNeg && /(做个视频|做视频|生成视频|拍个视频|出个视频|视频生成|做个片子|做个短片)/.test(msg)) {
    intents.push({ type: "video" });
  }
  return intents;
}
const XIAOYU_PORTRAIT_PROMPT = "一位温柔的AI少女半身像，名叫小语。深色科技感背景，漂浮着柔和的蓝紫色光点和数据流光线。少女有着及肩的深色短发，发梢泛着淡淡的星空蓝光，眼睛温暖明亮带着微笑。穿着简约的深色连帽衫，领口有一枚发光的圆形徽章。整体氛围安静温暖，赛博朋克与治愈系结合，高质量插画，柔和光晕，细节丰富";

const MEDIA_INTENT_STRIP = /(配图|配.{0,2}图|插画|画图|画个|画一|画.{0,2}图|插图|生成图片|绘图|配一幅|生成.{0,8}图片|画.{0,10}图片|一张.{0,10}图片|做个.{0,6}图|做个视频|做视频|生成视频|拍个视频|出个视频|视频生成|做个片子|做个短片|配音|朗读|读出来|语音|生成语音|读一下|说出来)/g;

// 提取媒体 prompt（去掉意图词）。画个你不能剥成「给我模型你」这种残渣。
export function extractMediaPrompt(message) {
  const raw = String(message || "").trim();
  if (/画个你|画一下你|画你的|你的样子|自画像|画个小语|画一下小语/.test(raw)) return XIAOYU_PORTRAIT_PROMPT;
  const stripped = raw.replace(MEDIA_INTENT_STRIP, "").replace(/[，。！？,.]/g, " ").replace(/\s+/g, " ").trim();
  if (!stripped || stripped.length < 8) return raw || message;
  return stripped;
}

export function assistantContentWithMedia(text, mediaResults) {
  const blocks = [];
  const t = String(text || "").trim();
  if (t) blocks.push({ type: "text", text: t });
  for (const m of mediaResults || []) {
    if (m && m.type === "image" && m.url) blocks.push({ type: "image", url: m.url });
    else if (m && m.type === "video" && m.url) blocks.push({ type: "video", url: m.url });
    else if (m && (m.type === "audio" || m.type === "tts") && m.url) blocks.push({ type: "audio", url: m.url });
  }
  const scraped = extractPlayableMedia(t);
  for (const url of scraped.videos) {
    if (!blocks.some((b) => b.type === "video" && b.url === url)) blocks.push({ type: "video", url });
  }
  return blocks.length ? blocks : [{ type: "text", text: t }];
}

let _imagePromptSeq = 0;
const IMAGE_PROMPT_FRAMINGS = [
  "构图变体：半身三分之二，略微侧光，视线看向镜头左侧",
  "构图变体：正面近景，柔光从右上方来，背景光点更疏",
  "构图变体：微俯视，肩线倾斜，发梢蓝光更亮",
  "构图变体：微仰视，胸口徽章更近，背景数据流更淡",
];

// 同一句固定肖像词会被平台缓存成几乎同一张图；每次追加构图变体 + 递增序号。
export function varyImagePrompt(prompt) {
  _imagePromptSeq += 1;
  const frame = IMAGE_PROMPT_FRAMINGS[(_imagePromptSeq - 1) % IMAGE_PROMPT_FRAMINGS.length];
  return `${String(prompt || "").trim()}。${frame}。seed=${Date.now()}-${_imagePromptSeq}`;
}

export function isPureImageRequest(message) {
  const raw = String(message || "").trim();
  if (!raw || raw.length > 80) return false;
  if (!detectMediaIntents(raw).some(i => i.type === "image")) return false;
  if (/ppt|幻灯|页面|代码|svg|html|修复|部署|启动|vite|实现|工坊|小说|脚本|文件/i.test(raw)) return false;
  return true;
}

// 旁路出图只推前端的话，主模型看不见，会以为没画过。告知即可，不要禁 SVG：有时任务就是要矢量成品。
export function mediaAwarePrompt(userMessage, mediaResults) {
  const msg = String(userMessage || "");
  const wantsImage = detectMediaIntents(msg).some(i => i.type === "image");
  const wantsVideo = detectMediaIntents(msg).some(i => i.type === "video");
  if (!wantsImage && !wantsVideo) return msg;
  const stayOff = "不要自己 POST /api/image 或 /api/media，不要读 auth.json / .token 或令牌，不要启动 Vite（5173）或第二份 8787。做视频/出图请用 generate_video / generate_image。";
  const notes = [];
  if (wantsImage) {
    const drawn = (mediaResults || []).filter(m => m && m.type === "image" && m.url);
    if (drawn.length) {
      notes.push(`【系统】图像模型已出图并已展示给用户：${drawn.map(m => m.url).join("、")}。你开口说明这张图即可。${stayOff}若任务更适合 SVG/矢量或其他成品，也可以再画了交出来。不要假装没出过图。`);
    } else {
      notes.push(`【系统】系统图像模型正在并行走出图，完成后会直接显示在对话里。你开口说明即可，不必干等。${stayOff}若任务还需要 SVG/矢量或其他成品，再动手交出来。`);
    }
  }
  if (wantsVideo) {
    const done = (mediaResults || []).filter(m => m && m.type === "video" && m.url);
    if (done.length) {
      notes.push(`【系统】视频模型已出片并已展示给用户：${done.map(m => m.url).join("、")}。对话里有播放器。你判断还要不要本机打开、加长、配音或复制到交付目录，做完汇报。${stayOff}`);
    } else {
      notes.push(`【系统】系统视频模型正在并行走出片，完成后会显示在对话播放器里。你继续把工作做完并汇报。${stayOff}`);
    }
  }
  return `${msg}\n\n${notes.join("\n")}`;
}

export function mediaReadyNotice(mediaResults) {
  const parts = [];
  const drawn = (mediaResults || []).filter(m => m && m.type === "image" && m.url);
  if (drawn.length) {
    parts.push(`【系统】配图已生成并已展示给用户：${drawn.map(m => m.url).join("、")}。你可以说明这张图；若还需要 SVG/矢量或其他成品，也可以再交。`);
  }
  const vids = (mediaResults || []).filter(m => m && m.type === "video" && m.url);
  if (vids.length) {
    parts.push(`【系统】视频已生成并已展示给用户：${vids.map(m => m.url).join("、")}。你可以说明这部片子。`);
  }
  return parts.join("\n");
}

export function explainMediaError(err) {
  const msg = String(err?.message || err || "");
  if (/fetch failed|Failed to fetch/i.test(msg)) return "上游网络失败（常见是代理不通或出图/模型接口超时）";
  if (/timeout/i.test(msg)) return "出图超时";
  return msg.slice(0, 80) || "出图失败";
}
// 异步生成媒体（与主模型并行）
export async function generateMediaAsync(intent, prompt) {
  try {
    if (intent.type === "image") {
      const m = findMediaModel("image");
      if (!m) { console.log(`[pi-web] 媒体: 无 image 模型`); return null; }
      const drawnPrompt = varyImagePrompt(prompt);
      const url = await generateImage(m.provider, m.id, drawnPrompt);
      console.log(`[pi-web] 媒体 image: ${url ? "成功" : "失败"} prompt=${String(drawnPrompt).slice(0,30)}`);
      return url ? { type: "image", url, model: `${m.provider}/${m.id}`, prompt: drawnPrompt } : { type: "image", error: "图像模型未返回图片" };
    }
    if (intent.type === "tts") {
      const url = await generateTTS(prompt);
      console.log(`[pi-web] 媒体 tts: ${url ? "成功" : "失败"}`);
      return url ? { type: "audio", url, model: "xiaomi-token-plan-cn/mimo-v2.5-tts" } : null;
    }
    if (intent.type === "video") {
      const m = findMediaModel("video");
      if (!m) { console.log(`[pi-web] 媒体: 无 video 模型`); return { type: "video", error: "无 video 模型" }; }
      const r = await generateVideo(m.provider, m.id, prompt, intent);
      if (r?.video) {
        console.log(`[pi-web] 媒体 video: 成功`);
        return { type: "video", url: r.video, model: `${m.provider}/${m.id}`, prompt };
      }
      const error = r?.error || "视频模型未返回片子";
      console.log(`[pi-web] 媒体 video: 失败 ${error}`);
      return { type: "video", error };
    }
  } catch (e) {
    const error = explainMediaError(e);
    console.log(`[pi-web] 媒体异常: ${error}`);
    return { type: intent?.type === "tts" ? "audio" : intent?.type === "video" ? "video" : "image", error };
  }
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
    const saved = await saveArtifact({ type: "image", url: payload.obj.image, prompt: body?.prompt }).catch(() => null);
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


function resolveVideoAuth(provider, modelId) {
  const resolved = _resolveAuth(provider);
  if (!resolved) return { error: `${provider} 未配置 API Key` };
  const baseUrl = resolved.baseUrl || (_readJsonFile(_modelsPath)[provider]?.models || []).find(m => m.id === modelId)?.baseUrl;
  const key = resolved.key;
  const base = (baseUrl || "").replace(/\/+$/, "");
  const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
  return { key, baseNoV1 };
}

export function explainVideoHttp(status, text = "") {
  if (status === 524 || status === 522 || status === 504 || status === 408) {
    return "上游出片网关超时。任务可能还在排队，请用任务号短轮询，不要一条请求干等三分钟。";
  }
  return `视频任务创建失败 ${status}: ${String(text).slice(0, 150)}`;
}

// 只创建、立刻返回。工坊走这条，避免 Cloudflare 100s 掐成 524。
export async function startVideoJob(provider, modelId, prompt, body = {}) {
  const auth = resolveVideoAuth(provider, modelId);
  if (auth.error) return auth;
  try {
    const bodyObj = videoCreateBody(modelId, prompt, body);
    const postVideo = (payload) => httpJsonFetch(`${auth.baseNoV1}/v1/videos`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.key}` },
      body: JSON.stringify(payload), timeout: 60000,
    });
    let createR = await postVideo(bodyObj);
    if (!createR.ok) {
      const t = await createR.text().catch(() => "");
      const err = `视频任务创建失败 ${createR.status}: ${t}`;
      const repaired = repairVideoRequest(modelId, prompt, { ...body, ...bodyObj }, err);
      if (repaired) {
        createR = await postVideo(repaired);
        if (!createR.ok) {
          const t2 = await createR.text().catch(() => "");
          return { error: explainVideoHttp(createR.status, t2) };
        }
      } else {
        return { error: explainVideoHttp(createR.status, t) };
      }
    }
    const created = await createR.json();
    const taskId = created.task_id || created.id || created.video_id || created.data?.task_id;
    const url = created.url || created.video_url || created.output?.url || created.data?.url;
    if (url) return { video: url, task_id: taskId };
    if (!taskId) return { error: "视频接口未返回任务 ID" };
    return { task_id: taskId, status: "pending" };
  } catch (e) { return { error: String(e?.message || e).slice(0, 150) }; }
}

export async function checkVideoJob(provider, modelId, taskId) {
  const auth = resolveVideoAuth(provider, modelId);
  if (auth.error) return auth;
  if (!taskId) return { error: "缺少任务 ID" };
  try {
    const qR = await httpJsonFetch(`${auth.baseNoV1}${videoPollPath(taskId, modelId)}`, {
      headers: { Authorization: `Bearer ${auth.key}` }, timeout: 20000,
    });
    if (!qR.ok) return { status: "pending", task_id: taskId };
    const q = await qR.json();
    const url = q.url || q.video_url || q.output?.url || q.data?.url || q.data?.video_url || q.metadata?.url;
    if (url) return { video: url, task_id: taskId };
    if (q.status === "failed" || q.state === "failed" || q.internal_status === "failed") {
      return { error: "视频生成失败", status: "failed", task_id: taskId };
    }
    return { status: q.status || q.state || "pending", task_id: taskId };
  } catch {
    return { status: "pending", task_id: taskId };
  }
}

export async function generateVideo(provider, modelId, prompt, body = {}) {
  const started = await startVideoJob(provider, modelId, prompt, body);
  if (started.error || started.video) return started;
  const taskId = started.task_id;
  for (let i = 0; i < 36; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const q = await checkVideoJob(provider, modelId, taskId);
    if (q.video) return { video: q.video, task_id: taskId };
    if (q.error && q.status !== "pending") return { error: q.error, task_id: taskId };
  }
  return { error: "视频生成超时（180s）", task_id: taskId };
}

// POST /api/media —— 工坊短请求：无 task_id 只创建；有 task_id 只查一次
export async function handleMedia(res, body) {
  const { provider, modelId, prompt, task_id } = body || {};
  if (!provider || !modelId) return json(res, 400, { error: "缺少参数" });
  if (task_id) {
    const r = await checkVideoJob(provider, modelId, task_id);
    if (r.video) {
      const saved = await saveArtifact({ type: "video", url: r.video, prompt }).catch(() => null);
      return json(res, 200, { video: saved || r.video, task_id });
    }
    if (r.error && r.status !== "pending") return json(res, 500, { error: r.error, task_id });
    return json(res, 200, { status: r.status || "pending", task_id });
  }
  if (!prompt) return json(res, 400, { error: "缺少参数" });
  const r = await startVideoJob(provider, modelId, prompt, body);
  if (r.video) {
    const saved = await saveArtifact({ type: "video", url: r.video, prompt }).catch(() => null);
    return json(res, 200, { video: saved || r.video, task_id: r.task_id });
  }
  if (r.error) return json(res, 500, { error: r.error });
  return json(res, 202, { task_id: r.task_id, status: "pending" });
}
