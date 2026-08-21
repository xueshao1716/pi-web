// model-probe.mjs —— 模型通断探测（2026-08-21）
// 用户理念落地：模型故障（429/400/403）时，不再"固定链跳过冷却"，而是主动探测候选模型
// （轻量 ping max_tokens=1），直到拿到第一个可用的"好模型"顶上。
let _httpFetch = null;
let _authReader = null;   // () => auth.json 对象
let _modelsReader = null; // () => models-store 对象
let _getModelList = () => [];

export function initModelProbe({ httpFetch = null, authReader = null, modelsReader = null, getModelList = null } = {}) {
  if (httpFetch) _httpFetch = httpFetch;
  if (authReader) _authReader = authReader;
  if (modelsReader) _modelsReader = modelsReader;
  if (getModelList) _getModelList = getModelList;
}

/**
 * 探测单个模型连通性：轻量 ping（max_tokens=1）。
 * @returns {Promise<boolean>} 2xx 响应 = 可用
 */
export async function probeModel(model, { timeoutMs = 8000 } = {}) {
  if (!_httpFetch) return false;
  try {
    const auth = _authReader ? _authReader() : {};
    const key = auth[model?.provider]?.key;
    if (!key) return false;
    const store = _modelsReader ? _modelsReader() : {};
    const mdef = (store[model.provider]?.models || []).find((m) => m.id === model.id)
      || _getModelList().find((m) => m.provider === model.provider && m.id === model.id);
    const base = ((mdef?.baseUrl || model.baseUrl) || "").replace(/\/+$/, "");
    if (!base) return false;
    const url = /\/v1$/.test(base) ? base + "/chat/completions" : base + "/v1/chat/completions";
    await _httpFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model.id, messages: [{ role: "user", content: "ping" }], max_tokens: 1, stream: false }),
      timeout: timeoutMs,
    });
    return true; // httpJsonFetch 非 2xx 会抛，走到这里 = 可用
  } catch {
    return false;
  }
}

/**
 * 探测候选链，返回第一个可用的"好模型"（串行探测，命中即停）。
 * @param {Array} candidates 候选模型数组（含 provider/id/baseUrl）
 * @returns {Promise<object|null>}
 */
export async function pickHealthyModel(candidates = []) {
  for (const c of candidates) {
    if (!c) continue;
    if (await probeModel(c)) return c;
  }
  return null;
}
