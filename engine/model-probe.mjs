// ===== model-probe.mjs —— 模型能力探测与发现（从 server.mjs 抽离）=====
// 职责：能力推断（id 关键字）/ 真实 API 探测（chat/tts/image，带 24h TTL 缓存）/ 自定义 provider 模型发现。
// 纯逻辑 + engine/http 客户端，无 server 依赖。

import { httpJsonFetch } from "./http.mjs";

// 按模型 id 关键字推断能力（查档案兜底，不靠真实探测）
export function modelCapabilities(id) {
  const caps = { chat: true, image: false, video: false, tts: false, asr: false };
  if (/image/i.test(id)) { caps.image = true; caps.chat = false; }
  if (/video/i.test(id)) { caps.video = true; caps.chat = false; }
  if (/tts/i.test(id)) { caps.tts = true; caps.chat = false; }
  if (/asr/i.test(id)) { caps.asr = true; caps.chat = false; }
  return caps;
}

// 添加时实际探测模型能力（无关键字模型逐个验证：chat / image / tts）
// 探测缓存：一次探测 = 3 个真实 API 请求（chat×2 + image），50 模型的 provider 就是 150 次。
// 进程内 TTL 缓存（24h）——refreshModelList 反复触发/重复添加不再重复烧请求。
const probeCache = new Map(); // `${baseNoV1}|${modelId}` → { caps, at }
const PROBE_CACHE_TTL = 24 * 3600 * 1000;

export async function probeModelCapabilities(baseNoV1, key, modelId) {
  const cacheKey = `${baseNoV1}|${modelId}`;
  const hit = probeCache.get(cacheKey);
  if (hit && Date.now() - hit.at < PROBE_CACHE_TTL) return hit.caps;
  const caps = { chat: false, image: false, video: false, tts: false, asr: false };
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  try {
    const r = await httpJsonFetch(`${baseNoV1}/v1/chat/completions`, {
      method: "POST", timeout: 10000, headers,
      body: JSON.stringify({ model: modelId, max_tokens: 5, messages: [{ role: "user", content: "hi" }] }),
    });
    if (r.ok) caps.chat = true;
  } catch {}
  // TTS 探测：不发畸形消息（避免部分 API 封禁 key），复用正常 chat 请求检查响应中的 audio 字段
  try {
    const r = await httpJsonFetch(`${baseNoV1}/v1/chat/completions`, {
      method: "POST", timeout: 10000, headers,
      body: JSON.stringify({ model: modelId, max_tokens: 5, messages: [{ role: "user", content: "hi" }] }),
    });
    if (r.ok) {
      const d = await r.json();
      if (d.choices?.[0]?.message?.audio?.data) caps.tts = true;
    }
  } catch {}
  try {
    const r = await httpJsonFetch(`${baseNoV1}/v1/images/generations`, {
      method: "POST", timeout: 10000, headers,
      body: JSON.stringify({ model: modelId, prompt: "test", n: 1 }),
    });
    if (r.ok) caps.image = true;
  } catch {}
  probeCache.set(cacheKey, { caps, at: Date.now() });
  return caps;
}

// 自定义 provider 模型发现：直调 openai 兼容 /v1/models，并探测能力
// oldCaps：上次已探测的能力表（重复添加时复用，跳过逐模型 API 探测）
export async function discoverCustomModels(base, apiKey, oldCaps = new Map()) {
  const mk = (u) => httpJsonFetch(u, { headers: { "Authorization": `Bearer ${apiKey}` }, timeout: 20000 });
  const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
  for (const u of [`${baseNoV1}/v1/models`, `${base}/models`]) {
    try {
      const r = await mk(u);
      if (!r.ok) continue;
      const data = await r.json();
      const list = data.data || data.models || [];
      if (!list.length) continue;
      const models = [];
      for (const m of list) {
        if (typeof m.id !== "string") continue;
        const model = { id: m.id, name: m.name || m.id, api: "openai-completions", baseUrl: baseNoV1, provider: "", reasoning: true, input: ["text"], contextWindow: 128000, maxTokens: 32768 };
        if (/(image|video|tts|asr)/i.test(m.id)) model.capabilities = modelCapabilities(m.id);
        else model.capabilities = oldCaps.get(m.id) || await probeModelCapabilities(baseNoV1, apiKey, m.id);
        models.push(model);
      }
      return models;
    } catch {}
  }
  return null;
}
