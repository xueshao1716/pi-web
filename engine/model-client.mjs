// engine/model-client.mjs —— 直调模型客户端（2026-08-20 从 server.mjs 拆出）
// directChat/handleThink/handleDirectChat/maybeCompactHistory：绕过 agent 直调接口 + 思考调试 + 历史压缩
// 依赖注入：initModelClient({ readJsonFile, writeJsonFile, authPath, modelsPath, resolveAuth, getModelList, getDefaultModel, httpJsonFetch, markModelBlocked, isAuthErrorStatus, unifiedChat, detectMediaIntents, generateMediaAsync, extractMediaPrompt, extractMessages, readEntriesFromFile, createSseWriter, json })
import fs from "node:fs";
import { json } from "./http-utils.mjs";
import { markModelBlocked, isAuthErrorStatus } from "./model-router.mjs";
import { httpJsonFetch } from "./http.mjs";
import { extractMessages } from "./session-utils.mjs";

let _readJsonFile = null, _writeJsonFile = null, _authPath = "", _modelsPath = "", _resolveAuth = null, _getModelList = () => [], _getDefaultModel = () => null,
    _unifiedChat = null, _detectMediaIntents = () => [], _generateMediaAsync = async () => null, _extractMediaPrompt = () => "", _readEntriesFromFile = () => [], _createSseWriter = null;
export function initModelClient({ readJsonFile = null, writeJsonFile = null, authPath = "", modelsPath = "", resolveAuth = null, getModelList = null, getDefaultModel = null, unifiedChat = null, detectMediaIntents = null, generateMediaAsync = null, extractMediaPrompt = null, readEntriesFromFile = null, createSseWriter = null } = {}) {
  _readJsonFile = readJsonFile; _writeJsonFile = writeJsonFile; _authPath = authPath; _modelsPath = modelsPath; _resolveAuth = resolveAuth;
  if (getModelList) _getModelList = getModelList; if (getDefaultModel) _getDefaultModel = getDefaultModel; if (unifiedChat) _unifiedChat = unifiedChat;
  if (detectMediaIntents) _detectMediaIntents = detectMediaIntents; if (generateMediaAsync) _generateMediaAsync = generateMediaAsync; if (extractMediaPrompt) _extractMediaPrompt = extractMediaPrompt;
  if (readEntriesFromFile) _readEntriesFromFile = readEntriesFromFile; if (createSseWriter) _createSseWriter = createSseWriter;
}

// 直调模型接口拿文本（绕过 agent，稳定快速）
export async function directChat(model, message, history = []) {
  try {
    const auth = _readJsonFile(_authPath);
    const key = auth[model.provider]?.key;
    if (!key) return null;
    const resolved = _resolveAuth(model.provider);
    const store = _readJsonFile(_modelsPath);
    const mdef = (store[model.provider]?.models || []).find(m => m.id === model.id)
      || _getModelList().find(m => m.provider === model.provider && m.id === model.id);
    const baseUrl = resolved?.baseUrl || mdef?.baseUrl || model.baseUrl;
    if (!baseUrl) return null;
    const base = (baseUrl || "").replace(/\/+$/, "");
    const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
    const messages = [...history, { role: "user", content: message }];
    const apiType = mdef?.api || "openai-completions";
    // openai-responses 类型（grok/gpt-5.6-luna 等）：用 /responses 端点，input 数组格式
    if (apiType === "openai-responses") {
      const mkResp = (u) => httpJsonFetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: model.id, input: message, max_output_tokens: Math.min(mdef?.maxTokens || 8192, 8192) }),
        timeout: 120000,
      });
      let rr = await mkResp(`${baseNoV1}/v1/responses`);
      if (rr.status === 404) rr = await mkResp(`${baseNoV1}/responses`);
      if (!rr.ok) {
        if (isAuthErrorStatus(rr.status)) markModelBlocked(model, { reason: `HTTP ${rr.status} (responses)` });
        return null;
      }
      const rd = await rr.json();
      // responses 格式：output[] 里 message 类型取 text
      const textParts = (rd.output || [])
        .filter(o => o.type === "message" && Array.isArray(o.content))
        .flatMap(o => o.content.filter(c => c.type === "output_text").map(c => c.text || ""));
      const reasoningParts = (rd.output || [])
        .filter(o => o.type === "reasoning" && Array.isArray(o.summary))
        .flatMap(o => o.summary.filter(c => c.type === "summary_text").map(c => c.text || ""));
      let text = textParts.join("").trim();
      let think = reasoningParts.join("").trim();
      if (!text && think) { text = think; think = ""; }
      return { think, text: text || null };
    }
    const mkReq = (u) => httpJsonFetch(u, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model.id, messages, stream: false, max_tokens: Math.min(mdef?.maxTokens || 8192, 8192) }),
      timeout: 120000,
    });
    let r = await mkReq(`${baseNoV1}/v1/chat/completions`);
    if (r.status === 404) r = await mkReq(`${baseNoV1}/chat/completions`);
    if (!r.ok) {
      if (isAuthErrorStatus(r.status)) markModelBlocked(model, { reason: `HTTP ${r.status} (directChat)` });
      return null;
    }
    const data = await r.json();
    const msg = data.choices?.[0]?.message || {};
    const content = msg.content || "";
    const raw = content.trim();
    let think = (msg.reasoning_content || "").trim();
    let text = raw;
    if (!text && think) {
      // 推理模型把回答全放 reasoning_content（如 opencode-go 的 deepseek 风格）——content 为空时回退
      text = think;
      think = "";
    }
    if (/<think>[\s\S]*?<\/think>/.test(raw)) {
      const m = raw.match(/<think>([\s\S]*?)<\/think>/);
      if (!think) think = (m?.[1] || "").trim();
      text = raw.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
    }
    return { think, text: text || null };
  } catch (e) {
    if (e && /timeout/i.test(String(e?.message || ""))) return { timeout: true };
    return null;
  }
}

// POST /api/think —— 双模型流水线：用指定模型先推理
export async function handleThink(res, body) {
  const { provider, modelId, message } = body || {};
  if (!provider || !modelId || !message) return json(res, 400, { error: "缺少 provider / modelId / message" });
  const store = _readJsonFile(_modelsPath);
  const resolved = _resolveAuth(provider);
  if (!resolved) return json(res, 400, { error: `${provider} 未配置 API Key（模型管理中添加）` });
  const mdef = (store[provider]?.models || []).find(m => m.id === modelId);
  if (!mdef) return json(res, 404, { error: `模型 ${provider}/${modelId} 未找到` });
  const baseUrl = resolved.baseUrl || mdef.baseUrl;
  const key = resolved.key;
  const apiType = mdef.api || "openai-completions";
  try {
    let data, modelName;
    if (apiType === "anthropic-messages") {
      const r = await httpJsonFetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: modelId, max_tokens: Math.min(mdef.maxTokens || 8192, 8192), messages: [{ role: "user", content: message }] }),
        timeout: 180000,
      });
      if (!r.ok) { const txt = await r.text().catch(() => ""); return json(res, 502, { error: `思考模型调用失败 ${r.status}: ${txt.slice(0, 150)}` }); }
      data = await r.json();
      modelName = data.model || modelId;
      const blocks = data.content || [];
      const thinking = blocks.filter(b => b.type === "thinking").map(b => b.text || "").join("");
      const content = blocks.filter(b => b.type === "text").map(b => b.text || "").join("");
      const text = (thinking || content || "").trim();
      if (!text) return json(res, 500, { error: "思考模型未返回内容" });
      return json(res, 200, { text, model: modelName, reasoning: !!thinking });
    }
    const base = (baseUrl || "").replace(/\/+$/, "");
    const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
    const mkReq = (u) => httpJsonFetch(u, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: message }], stream: false, max_tokens: Math.min(mdef.maxTokens || 8192, 8192) }),
      timeout: 120000,
    });
    let r = await mkReq(`${baseNoV1}/v1/chat/completions`);
    if (r.status === 404) r = await mkReq(`${baseNoV1}/chat/completions`);
    if (!r.ok) { const txt = await r.text().catch(() => ""); return json(res, 502, { error: `思考模型调用失败 ${r.status}: ${txt.slice(0, 150)}` }); }
    data = await r.json();
    modelName = data.model || modelId;
    const msg = data.choices?.[0]?.message || {};
    const reasoning = msg.reasoning_content || "";
    const content = msg.content || "";
    let text = (reasoning || content || "").trim();
    if (!reasoning && /<think>/.test(text)) { text = text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim() || text; }
    if (!text) return json(res, 500, { error: "思考模型未返回内容" });
    json(res, 200, { text, model: modelName, reasoning: !!reasoning });
  } catch (e) {
    json(res, 500, { error: String(e?.message || e).slice(0, 200) });
  }
}

// 视频生成（任务式轮询）
// 直调通道：绕开 pi agent，直接调接口并维护会话历史
export async function handleDirectChat(res, entry, message, sessionId, writer) {
  writer = writer || _createSseWriter(res);
  let hist = [];
  try {
    const file = entry.sm.sessionFile;
    if (file && fs.existsSync(file)) hist = extractMessages(_readEntriesFromFile(file)).slice(-20);
  } catch {}
  const mediaIntents = _detectMediaIntents(message);
  const mediaPromise = mediaIntents.length
    ? Promise.all(mediaIntents.map(it => _generateMediaAsync(it, _extractMediaPrompt(message))))
    : Promise.resolve([]);
  const result = await directChat(_getDefaultModel(), message, hist.map(h => ({ role: h.role, content: h.text })));
  if (!result || result.timeout) {
    writer.push("error", { message: result?.timeout ? "模型响应超时（60s），请稍后重试" : "模型未返回内容，请稍后重试" });
    return;
  }
  const text = result.text;
  if (!text) { writer.push("error", { message: "模型未返回内容，请稍后重试" }); return; }
  try {
    entry.sm.appendMessage({ role: "user", content: [{ type: "text", text: message }] });
    entry.sm.appendMessage({ role: "assistant", content: [{ type: "text", text }] });
  } catch {}
  if (entry.agent) { try { entry.agent.dispose(); } catch {} entry.agent = null; }
  if (!entry.sm.getSessionName()) { try { entry.sm.appendSessionInfo(message.slice(0, 24)); } catch {} }
  if (result.think) { writer.push("think", { text: result.think }); writer.push("think_end", {}); }
  writer.push("delta", { text });
  const mediaResults = await mediaPromise;
  for (const mr of mediaResults) {
    if (!mr) continue;
    if (mr.url) mr.url = await saveArtifact(mr);  // 产物落盘 → 本地路径
    writer.push("media", mr);
  }
  writer.push("done", { sessionId });
  console.log(`[pi-web] 直调通道: ${_getDefaultModel().provider}/${_getDefaultModel().id}`);
}

// 上下文压缩 v2（借鉴 Claude Code 摘要式压缩）：历史超限时用模型生成"结构化摘要"替换旧消息
// 保留六类关键信息（Claude 同款：意图/技术概念/文件路径命令/错误修复/已完成/待办），支持定向焦点（/compact focus on X）
export async function maybeCompactHistory(history, model, focus = "") {
  const total = history.reduce((n, m) => n + String(m.content || "").length, 0);
  if (history.length < 12 || total < 80000) return history;
  const keep = history.slice(-10);
  const old = history.slice(0, -10);
  const oldText = old.map(m => `${m.role}: ${typeof m.content === "string" ? m.content.slice(0, 800) : "(工具调用)"}`).join("\n");
  const focusLine = focus ? `\n压缩焦点（请特别保留与以下主题相关的信息）：${focus}` : "";
  try {
    const summary = await _unifiedChat(model, `你是上下文压缩助手。以下是一段 AI 助手与用户的早期对话。请生成结构化摘要，按下列六类保留关键信息：
1. 用户请求与意图（保留具体需求）
2. 关键技术概念与决策
3. 文件/路径/命令（保留具体文件名、路径、命令）
4. 错误与修复方式
5. 已完成的关键操作
6. 待办事项与当前工作
要求：只留关键信息，总长不超过 500 字，按 1-6 编号要点输出。完整工具输出和中间推理不要保留。${focusLine}

对话记录：
${oldText.slice(0, 50000)}`, { tools: false });
    if (summary && summary.text) {
      return [{ role: "system", content: "【早前对话摘要】\n" + summary.text }, ...keep];
    }
  } catch {}
  return history;
}
