// engine/dsh-keys.mjs —— dsh 执行臂 + 双引擎密钥 + 声明式策略引擎（2026-08-20 从 server.mjs 拆出）
// 依赖注入：initDshKeys({ dshWebPort, readJsonFile, writeJsonFile, authPath, modelsPath, ModelRuntime, refreshModelList })
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { json, readBody } from "./http-utils.mjs";
import { probeModelCapabilities, modelCapabilities } from "./model-probe.mjs";

// 支持的 provider 清单（模型管理下拉）；随块从 server.mjs 迁入
const SUPPORTED_PROVIDERS = ["deepseek", "openai", "openrouter", "anthropic", "google", "qwen", "xai", "moonshotai", "zai", "together", "mistral", "modelscope", "cloudflare-ai"];
let _port = 3080, _readJsonFile = null, _writeJsonFile = null, _authPath = "", _modelsPath = "", _ModelRuntime = null, _refreshModelList = null;
let _setModelList = () => {}, _getDefaultModel = () => null, _setDefaultModel = () => {}, _setModelRuntime = () => {}, _getModelRuntime = () => null, _keepModels = new Set(), _resetHealth = () => {};
export function initDshKeys({ dshWebPort = 3080, readJsonFile = null, writeJsonFile = null, authPath = "", modelsPath = "", ModelRuntime = null, refreshModelList = null, supportedProviders = [], setModelList = null, getDefaultModel = null, setDefaultModel = null, setModelRuntime = null, getModelRuntime = null, keepModels = new Set(), resetModelHealth = null } = {}) {
  _port = dshWebPort; _readJsonFile = readJsonFile; _writeJsonFile = writeJsonFile; _authPath = authPath; _modelsPath = modelsPath; _ModelRuntime = ModelRuntime; _refreshModelList = refreshModelList;
  if (setModelList) _setModelList = setModelList; if (getDefaultModel) _getDefaultModel = getDefaultModel; if (setDefaultModel) _setDefaultModel = setDefaultModel;
  if (setModelRuntime) _setModelRuntime = setModelRuntime; if (getModelRuntime) _getModelRuntime = getModelRuntime; _keepModels = keepModels; if (resetModelHealth) _resetHealth = resetModelHealth; 
}

export const KNOWN_PROVIDERS = new Set(["deepseek", "openai", "openrouter", "anthropic", "google", "qwen", "xai", "moonshotai", "zai", "together", "mistral", "opencode-go"]);

// 主流大厂预设（OpenAI 兼容 /models 探测）：首次启动引导下拉框 + keys/apply 验证共用
export const PROVIDER_PRESETS = {
  deepseek:    { name: "DeepSeek 深度求索",     baseUrl: "https://api.deepseek.com" },
  openai:      { name: "OpenAI",                baseUrl: "https://api.openai.com/v1" },
  openrouter:  { name: "OpenRouter 聚合",        baseUrl: "https://openrouter.ai/api/v1" },
  anthropic:   { name: "Anthropic · Claude",    baseUrl: "https://api.anthropic.com/v1" },
  google:      { name: "Google · Gemini",        baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  qwen:        { name: "阿里云百炼 · Qwen",     baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  moonshotai:  { name: "Moonshot · Kimi",       baseUrl: "https://api.moonshot.cn/v1" },
  zai:         { name: "智谱 · GLM",            baseUrl: "https://api.z.ai/api/v1" },
  "volces-ark":{ name: "火山方舟 · Ark",       baseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
  xai:         { name: "xAI · Grok",            baseUrl: "https://api.x.ai/v1" },
  mistral:     { name: "Mistral",               baseUrl: "https://api.mistral.ai/v1" },
  together:    { name: "Together AI",           baseUrl: "https://api.together.xyz/v1" },
  sensenova:   { name: "商汤 · 日日新",         baseUrl: "https://api.sensenova.cn/v1" },
  modelscope:  { name: "魔搭 · ModelScope",     baseUrl: "https://api.modelscope.cn/v1" },
  "cloudflare-ai": { name: "Cloudflare Workers AI", baseUrl: "" },
};

// GET /api/keys/presets —— 首启引导下拉框数据（单一来源，前端不写死）
export function handleKeysPresets(res) {
  json(res, 200, { presets: PROVIDER_PRESETS });
}

// 解析 provider 的认证：优先 auth.json，其次环境变量（如 OPENROUTER_API_KEY）
export function resolveAuth(provider) {
  const auth = _readJsonFile(_authPath);
  if (auth[provider]?.key) return { key: auth[provider].key, baseUrl: auth[provider].baseUrl || "" };
  const envName = String(provider).toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_API_KEY";
  if (process.env[envName]) return { key: process.env[envName], baseUrl: "" };
  return null;
}

// 刷新内存模型列表（直接读 models-store.json——权威来源，且重建运行时让新 key 生效）
export async function refreshModelList() {
  try { _setModelRuntime(await _ModelRuntime.create()); } catch {}
  _resetHealth(); // 模型清单刷新 = 重新探测，冷却状态一并清零给所有模型新机会
  const store = _readJsonFile(_modelsPath);
  const authed = new Set(Object.keys(_readJsonFile(_authPath)));
  const all = [];
  // 原生 provider（pi 内置目录，如 xiaomi-token-plan-cn）——只取不在 store 里的（store 的保持自定义逻辑）
  try {
    for (const m of ((_getModelRuntime?.() || {}).getModels?.() || [])) {
      if (!authed.has(m.provider) || store[m.provider]) continue;
      all.push({
        provider: m.provider, id: m.id, name: m.name || m.id, api: m.api, baseUrl: m.baseUrl,
        reasoning: !!m.reasoning, contextWindow: m.contextWindow, input: m.input,
        compat: m.compat, thinkingLevelMap: m.thinkingLevelMap,
        capabilities: modelCapabilities(m.id),
      });
    }
  } catch {}
  // 自定义 / 既有 provider（store）
  for (const [provider, cfg] of Object.entries(store)) {
    if (!authed.has(provider)) continue;
    for (const m of (cfg.models || [])) {
      all.push({
        provider, id: m.id, name: m.name || m.id, api: m.api, baseUrl: m.baseUrl,
        reasoning: !!m.reasoning, contextWindow: m.contextWindow, input: m.input,
        compat: m.compat, thinkingLevelMap: m.thinkingLevelMap,
        capabilities: m.capabilities || modelCapabilities(m.id),
      });
    }
  }
  const list = all.filter(m => {
    if (["deepseek", "openai", "openrouter"].includes(m.provider)) return _keepModels.has(`${m.provider}/${m.id}`);
    return true;
  });
  _setModelList(list);
  const curDefault = _getDefaultModel();
  if (curDefault && !list.find(m => m.provider === curDefault.provider && m.id === curDefault.id)) {
    _setDefaultModel(list[0] || undefined);
  }
  console.log(`[pi-web] 模型刷新: ${list.length} 个（含 ${Object.keys(store).join(", ")}）`);
}

// GET /api/models/manage —— 只显示真正配置了 Key 的 provider
export async function handleModelsManage(res) {
  const auth = _readJsonFile(_authPath);
  const store = _readJsonFile(_modelsPath);
  const providers = Object.keys(store)
    .filter(p => auth[p]?.key)
    .map(p => ({
      provider: p,
      hasKey: !!auth[p],
      baseUrl: auth[p]?.baseUrl || "",
      modelCount: (store[p]?.models || []).length,
      capabilities: (store[p]?.models || []).reduce((acc, m) => { const c = m.capabilities || modelCapabilities(m.id); for (const k of Object.keys(acc)) if (c[k]) acc[k] = true; return acc; }, { chat: false, image: false, video: false, tts: false, asr: false }),
      models: (store[p]?.models || []).map(m => m.id).slice(0, 30),
    }));
  json(res, 200, { providers, supported: SUPPORTED_PROVIDERS });
}

// 模型能力探测与发现已抽到 engine/model-probe.mjs（modelCapabilities / probeModelCapabilities / discoverCustomModels）
// POST /api/models/add —— 添加（内置 provider 用 pi runtime；自定义 provider 直调探测）
export async function handleModelsAdd(res, body) {
  const { provider, apiKey, baseUrl, account_id, toDsh } = body || {};
  // ⚠️ 兼容字段名：前端 ModelManager 旧版传 key，后端规范是 apiKey——统一接收
  const key = apiKey || body?.key;
  if (!provider || !key) return json(res, 400, { error: "缺少 provider 或 API Key" });
  if (!/^[a-zA-Z0-9_-]+$/.test(provider)) return json(res, 400, { error: "provider 名称只能包含字母、数字、横线" });
  const auth = _readJsonFile(_authPath);
  auth[provider] = { type: "api_key", key, ...(baseUrl ? { baseUrl } : {}), ...(account_id ? { account_id } : {}) };
  _writeJsonFile(_authPath, auth);
  // Cloudflare Workers AI：非 OpenAI 风格，手动注册已知模型
  if (provider === "cloudflare-ai") {
    if (!account_id) {
      delete auth[provider]; _writeJsonFile(_authPath, auth);
      return json(res, 400, { error: "cloudflare-ai 需要填写 Account ID（Cloudflare 控制台 → Workers AI → REST API）" });
    }
    const store = _readJsonFile(_modelsPath);
    store[provider] = {
      models: [
        { id: "@cf/black-forest-labs/flux-1-schnell", name: "FLUX.1 Schnell", api: "openai-completions", baseUrl: "", provider: "", reasoning: false, input: ["text"], contextWindow: 8192, maxTokens: 8192, capabilities: { chat: false, image: true, video: false, tts: false, asr: false } },
      ],
      checkedAt: new Date().toISOString(),
    };
    _writeJsonFile(_modelsPath, store);
    console.log(`[pi-web] 模型添加成功: ${provider} 1 个（手动注册）`);
    await _refreshModelList();
    return json(res, 200, { ok: true, provider, models: store[provider].models, manual: true });
  }
  // 复用上次探测结果：同一 provider 重复添加时跳过逐模型 API 探测（配合 probeCache 双保险）
  const oldCaps = new Map(
    (_readJsonFile(_modelsPath)[provider]?.models || [])
      .filter((m) => m.capabilities && typeof m.capabilities.chat === "boolean")
      .map((m) => [m.id, m.capabilities])
  );
  try {
    let models = null;
    if (KNOWN_PROVIDERS.has(provider)) {
      const runtime = await _ModelRuntime.create({ authPath: _authPath, modelsPath: _modelsPath });
      runtime.setRuntimeApiKey(provider, key);
      const authCheck = await runtime.checkAuth(provider);
      if (authCheck && authCheck.status === "invalid") {
        delete auth[provider]; _writeJsonFile(_authPath, auth);
        return json(res, 401, { error: `API Key 无效：${authCheck.message || "认证失败"}` });
      }
      models = await runtime.getAvailable(provider);
      const base = (baseUrl || "").replace(/\/+$/, "");
      const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
      if (baseNoV1 && models?.length) {
        for (const m of models) {
          if (!/(image|video|tts|asr)/i.test(m.id)) m.capabilities = oldCaps.get(m.id) || await probeModelCapabilities(baseNoV1, key, m.id);
        }
      }
    } else {
      const base = (baseUrl || "").replace(/\/+$/, "");
      if (!base) return json(res, 400, { error: "自定义 provider 必须填写 Base URL" });
      models = await discoverCustomModels(base, key, oldCaps);
    }
    if (!models || !models.length) {
      delete auth[provider]; _writeJsonFile(_authPath, auth);
      return json(res, 404, { error: "该 Key 下未发现可用模型（请确认 Base URL 与接口协议正确）" });
    }
    const store = _readJsonFile(_modelsPath);
    store[provider] = { models, checkedAt: new Date().toISOString() };
    _writeJsonFile(_modelsPath, store);
    console.log(`[pi-web] 模型添加成功: ${provider} ${models.length} 个`);
    await _refreshModelList();
    // dsh 同步（可选）：写用户级环境变量 DEEPSEEK_API_KEY（新终端/进程生效）
    let dsh = false, dshNote = "";
    if (toDsh) {
      try {
        execFileSync("setx", ["DEEPSEEK_API_KEY", key], { windowsHide: true, timeout: 10000 });
        dsh = true; dshNote = "dsh 已同步（新开的终端/进程生效）";
      } catch (e) { dshNote = "dsh 同步失败：" + String(e?.message || e).slice(0, 80); }
    }
    json(res, 200, { ok: true, modelCount: models.length, models: models.map(m => m.id), dsh, dshNote });
  } catch (e) {
    const a2 = _readJsonFile(_authPath); delete a2[provider]; _writeJsonFile(_authPath, a2);
    console.log(`[pi-web] 模型添加失败: ${provider} → ${String(e?.message || e).slice(0, 100)}`);
    json(res, 500, { error: String(e?.message || e).slice(0, 200) });
  }
}

// ── dsh 引擎适配层：探测（安装/版本/密钥/web 前台在线）+ 一键拉起 web ──
// 背景：⇄ dsh 链接是硬编码 3080，dsh web 没起时点过去是死页——前端需要真实状态。
const DSH_WEB_PORT = 3080;
export function dshResolveBin() {
  const cands = [
    path.join(process.env.APPDATA || "", "npm", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
    path.join(process.env.ProgramFiles || "", "nodejs", "node_modules", "npm", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
  ];
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch {} }
  return null;
}
export async function handleDshStatus(res) {
  const bin = dshResolveBin();
  // web 前台探测：本地 3080 有响应即在线（不依赖 dsh 内部实现）
  let webUp = false;
  try {
    const r = await fetch(`http://127.0.0.1:${_port}/`, { signal: AbortSignal.timeout(1500) });
    webUp = r.status < 500;
  } catch {}
  // 密钥：进程 env → 注册表（与 dsh-tool 的 resolveDshEnv 同链路）
  let keyOk = !!process.env.DEEPSEEK_API_KEY;
  if (!keyOk) {
    try {
      const out = execFileSync("reg", ["query", "HKCU\\Environment", "/v", "DEEPSEEK_API_KEY"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
      keyOk = /DEEPSEEK_API_KEY\s+REG_SZ\s+.+/.test(out);
    } catch {}
  }
  if (!keyOk) { const a = _readJsonFile(_authPath); keyOk = !!a?.deepseek?.key; }
  json(res, 200, { installed: !!bin, bin, webUp, webPort: _port, keyOk });
}
export async function handleDshWebStart(res) {
  const bin = dshResolveBin();
  if (!bin) return json(res, 404, { error: "dsh 引擎未安装：npm i -g @deepseek-ai/dsh" });
  try {
    const probe = await fetch(`http://127.0.0.1:${_port}/`, { signal: AbortSignal.timeout(1500) });
    if (probe.status < 500) return json(res, 200, { ok: true, already: true, url: `http://127.0.0.1:${_port}` });
  } catch {}
  // detached 拉起：独立于 pi-web 生命周期，日志落 dsh-web.log 便于排查
  try {
    const { resolveDshEnv } = await import("./engine/dsh-tool.mjs");
    const logFd = fs.openSync(path.join(os.tmpdir(), "dsh-web.log"), "a");
    const child = spawn(process.execPath, [bin, "web"], {
      detached: true, stdio: ["ignore", logFd, logFd], windowsHide: true, env: resolveDshEnv(),
    });
    child.unref();
    try { fs.closeSync(logFd); } catch {}
  } catch (e) {
    return json(res, 500, { error: "dsh web 启动失败: " + String(e?.message || e).slice(0, 120) });
  }
  // 冷启动需要数秒：轮询最多 15s 等它上线
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const r = await fetch(`http://127.0.0.1:${_port}/`, { signal: AbortSignal.timeout(1000) });
      if (r.status < 500) return json(res, 200, { ok: true, url: `http://127.0.0.1:${_port}` });
    } catch {}
  }
  json(res, 202, { ok: true, pending: true, url: `http://127.0.0.1:${_port}`, note: "dsh web 启动中（冷启动较慢），稍后刷新即可" });
}

// ── 双引擎密钥：状态查询（pi auth.json + dsh DEEPSEEK_API_KEY）──
export function handleKeysStatus(res) {
  const auth = _readJsonFile(_authPath);
  const piProviders = Object.keys(auth).filter(k => auth[k]?.key);
  let dshKey = process.env.DEEPSEEK_API_KEY || "";
  if (!dshKey) {
    try {
      const out = execFileSync("reg", ["query", "HKCU\\Environment", "/v", "DEEPSEEK_API_KEY"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
      const m = out.match(/DEEPSEEK_API_KEY\s+REG_SZ\s+(.+)/);
      if (m) dshKey = m[1].trim();
    } catch {}
  }
  json(res, 200, { pi: piProviders, dsh: !!dshKey });
}

// ── 双引擎密钥：应用（pi 写 auth.json + 探测验证 + 刷新模型列表；可选 setx 同步 dsh）──
// ── 声明式策略引擎（Gemini Policy Engine 借鉴）：~/.piweb/policies.json ──
// 规则：tool(glob) + match(参数名→正则) → decision(allow/deny)；deny 优先；内置隧道/密钥/危险操作默认规则
let policiesCache = null, policiesMtime = 0;
export function loadPolicies() {
  try {
    const f = path.join(os.homedir(), ".piweb", "policies.json");
    const st = fs.statSync(f);
    if (st.mtimeMs !== policiesMtime || !policiesCache) {
      policiesCache = JSON.parse(fs.readFileSync(f, "utf8"));
      policiesMtime = st.mtimeMs;
    }
  } catch { policiesCache = { rules: [] }; }
  return policiesCache;
}
export function toolMatch(pat, name) {
  if (pat === "*" || pat === name) return true;
  if (pat.includes("*")) {
    const re = new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    return re.test(name);
  }
  return false;
}
// 匹配工具调用 → { decision, note }（deny 优先于 allow；无规则默认 allow）
export function policyDecide(tool, args) {
  const { rules = [] } = loadPolicies();
  let deny = null, allow = null;
  for (const r of rules) {
    if (!r.tool || !toolMatch(r.tool, tool)) continue;
    if (r.match) {
      let hit = true;
      for (const [k, re] of Object.entries(r.match)) {
        const v = String(args?.[k] ?? "");
        try { if (!new RegExp(re, "i").test(v)) { hit = false; break; } } catch { hit = false; break; }
      }
      if (!hit) continue;
    }
    if (r.decision === "deny") deny = r;
    else if (r.decision === "allow") allow = r;
  }
  if (deny) return { decision: "deny", note: deny.note || `工具 ${tool} 被策略禁止` };
  if (allow) return { decision: "allow", note: allow.note || "" };
  return { decision: "allow", note: "" };
}

export async function handleKeysApply(res, body) {
  const { provider, apiKey, baseUrl, toDsh } = body || {};
  if (!provider || !apiKey) return json(res, 400, { error: "缺少 provider 或 API Key" });
  if (!/^[a-zA-Z0-9_-]+$/.test(provider)) return json(res, 400, { error: "provider 名称只能包含字母、数字、横线" });
  // API Key 必须是纯 ASCII（复制时易混入 ×✕ 等符号，undici fetch 会报 ByteString 错）
  if (/[^\x20-\x7E]/.test(apiKey)) {
    return json(res, 400, { error: "API Key 包含特殊字符（复制时可能带入了 ×✕ 等符号），请从平台重新复制后重试" });
  }
  // ── 先验证、后写入：任何失败路径都不写 auth.json，杜绝假 key 污染 ──
  let models = null;
  if (KNOWN_PROVIDERS.has(provider)) {
    // 内置 provider：调真实 API 探测 key（/models 端点，OpenAI 兼容）
    let base = (baseUrl || "").replace(/\/+$/, "");
    try {
      const runtime = await _ModelRuntime.create({ authPath: _authPath, modelsPath: _modelsPath });
      if (!base) {
        // 预设优先，其次 pi 内置 provider 定义
        base = PROVIDER_PRESETS[provider]?.baseUrl || "";
        if (!base) {
          const prov = (runtime.getProviders?.() || []).find(p => p.id === provider);
          base = (prov?.baseUrl || "").replace(/\/+$/, "");
        }
      }
      if (!base) return json(res, 400, { error: `未找到 ${provider} 的 API 地址（请填写 Base URL）` });
      const probe = await fetch(base + "/models", {
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (probe.status === 401 || probe.status === 403) {
        return json(res, 401, { error: `API Key 无效（HTTP ${probe.status}），未写入配置` });
      }
      if (!probe.ok) return json(res, 502, { error: `API 探测失败（HTTP ${probe.status}），未写入配置` });
      models = await runtime.getAvailable(provider).catch(() => null);
      // ⚠️ 新装场景：store 尚无该 provider 模型定义时 getAvailable 返回空 → 用刚探测到的 /models 响应兜底建模型，杜绝"未发现可用模型"引导死路
      if (!models || !models.length) {
        try {
          const pj = await probe.json();
          models = (pj?.data || []).map(mm => ({ id: mm.id, name: mm.id || mm.id, input: ["text"], contextWindow: 128000 }))
            .filter(mm => typeof mm.id === "string" && mm.id.trim());
        } catch {}
        if (!models || !models.length) {
          try { models = await discoverCustomModels(base, apiKey); } catch { models = null; }
        }
      }
    } catch (e) {
      console.log(`[pi-web] keys/apply 探测失败: ${provider} → ${String(e?.message || e).slice(0, 120)}`);
      return json(res, 500, { error: `探测异常：${String(e?.message || e).slice(0, 120)}` });
    }
  } else {
    // 自定义 provider：discoverCustomModels 验证通过才写入
    const base = (baseUrl || "").replace(/\/+$/, "");
    if (!base) return json(res, 400, { error: "自定义 provider 必须填写 Base URL" });
    try { models = await discoverCustomModels(base, apiKey); }
    catch (e) { return json(res, 400, { error: `验证失败：${String(e?.message || e).slice(0, 120)}` }); }
  }
  if (!models || !models.length) {
    return json(res, 400, { error: "该 Key 下未发现可用模型（请确认 Base URL 与接口协议正确），未写入配置" });
  }
  // 验证全部通过：写入 auth.json
  const auth = _readJsonFile(_authPath);
  auth[provider] = { type: "api_key", key: apiKey, ...(baseUrl ? { baseUrl } : {}) };
  _writeJsonFile(_authPath, auth);
  const store = _readJsonFile(_modelsPath);
  store[provider] = { models, checkedAt: new Date().toISOString() };
  _writeJsonFile(_modelsPath, store);
  await _refreshModelList();
  // dsh 同步（可选）：写用户级环境变量 DEEPSEEK_API_KEY（新终端/新进程生效）
  let dshDone = false, dshNote = "";
  if (toDsh) {
    try {
      execFileSync("setx", ["DEEPSEEK_API_KEY", key], { windowsHide: true, timeout: 10000 });
      dshDone = true;
      dshNote = "dsh 已同步（新开的终端/进程生效）";
    } catch (e) {
      dshNote = "dsh 同步失败：" + String(e?.message || e).slice(0, 80);
    }
  }
  json(res, 200, { ok: true, pi: provider, dsh: dshDone, dshNote });
}
