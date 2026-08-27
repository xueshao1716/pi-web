// ══ SDK Provider 注册器（2026-08-27）：把 pi-web 自定义通道接入 pi 引擎 agent 体系 ══
// 背景：聊天走 unifiedChat 直发 HTTP（任意 OpenAI 兼容通道都行）；但真 agent 会话（专项工作台/
//       TUI/终端）由 pi SDK 驱动，只认 SDK 原生 provider 表——自定义中转（sensenova/volces/agnes/
//       whatstoken/bigmodel/aliyun 等）不在表内，agent 一律报「No API key found」，只能靠 deepseek
//       兜底（且 deepseek 余额不足时彻底哑火）。
// 方案：启动时把「已配 key + store 有 baseUrl 定义 + SDK 不认识」的 provider 用
//       ModelRuntime.registerProvider 动态注册进去——agent 与聊天同通道、同凭据。
import fs from "node:fs";

export function registerStoreProviders(modelRuntime, { storePath, authPath }) {
  let store = {};
  let auth = {};
  try { store = JSON.parse(fs.readFileSync(storePath, "utf8")) || {}; } catch {}
  try { auth = JSON.parse(fs.readFileSync(authPath, "utf8")) || {}; } catch {}

  // SDK 原生已认识的 provider 不重复注册
  let known = new Set();
  try {
    for (const m of modelRuntime.getModels()) known.add(m.provider);
  } catch {}

  const registered = [];
  for (const [provider, a] of Object.entries(auth)) {
    if (!a?.key || known.has(provider)) continue;
    const cfg = store[provider];
    const rawModels = cfg?.models || [];
    const models = rawModels.map(m => ({
      id: m.id,
      name: m.name || m.id,
      reasoning: !!m.reasoning,
      input: Array.isArray(m.input) && m.input.length ? m.input : ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || 128000,
      maxTokens: m.maxTokens || 8192,
    })).filter(m => m.id);
    // 只挑免费/已配 key 通道的代表模型，全量注册意义不大（agent 任务常用默认模型而已）
    const picked = models.filter(m => !/pro/i.test(m.id)).slice(0, 6);
    if (!picked.length || !(cfg?.baseUrl || a.baseUrl)) continue;

    const api = (cfg.api === "anthropic-messages" || cfg.protocol === "anthropic") ? "anthropic-messages" : "openai-completions";
    // SDK 不做 /v1 补全（聊天适配器会补并 404 回退，这里必须手动对齐 OpenAI 规范：baseUrl 需含版本段）
    let base = String(cfg.baseUrl || a.baseUrl || "").replace(/\/+$/, "");
    if (api === "openai-completions" && !/\/v\d+$/.test(base)) base += "/v1";
    try {
      modelRuntime.registerProvider(provider, {
        name: provider,
        baseUrl: base,
        apiKey: a.key,
        api,
        models: picked,
      });
      registered.push(provider);
    } catch (e) {
      console.log(`[sdk-providers] ${provider} 注册失败: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  if (registered.length) console.log(`[pi-web] agent 通道扩展注册: ${registered.join(", ")}`);
  return registered;
}
