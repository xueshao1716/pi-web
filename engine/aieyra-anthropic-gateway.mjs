// Aieyra -> Anthropic Messages 适配层
// 仅供本机 Claude Code 使用：默认绑定 127.0.0.1，不保存密钥、不把密钥写入 Claude 配置。
import fs from "node:fs";
import os from "node:os";
import http from "node:http";

const AIEYRA_PROVIDERS = new Set(["aieyra-gpt", "aieyra-grok", "aieyra-claude", "aieyra-gemini"]);
const DEFAULT_PORT = Number(process.env.AIEYRA_GATEWAY_PORT || 8916);
const LOCAL_TOKEN = process.env.AIEYRA_GATEWAY_TOKEN || "local-aieyra-gateway";
const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || `${os.homedir()}/.pi/agent`;
const AUTH_PATH = process.env.AIEYRA_AUTH_PATH || `${AGENT_DIR}/auth.json`;
const MODELS_PATH = process.env.AIEYRA_MODELS_PATH || `${AGENT_DIR}/models-store.json`;

function readJson(path) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch { return {}; }
}

function modelEntries(models = readJson(MODELS_PATH)) {
  return Object.entries(models).flatMap(([provider, cfg]) =>
    AIEYRA_PROVIDERS.has(provider) ? (cfg?.models || []).map(m => ({ ...m, provider })) : []
  );
}

/** Resolve the public gateway name: aieyra-gpt/gpt-5.5. */
export function resolveAieyraRoute(modelName, models = readJson(MODELS_PATH)) {
  const slash = String(modelName || "").indexOf("/");
  if (slash <= 0) return null;
  const provider = String(modelName).slice(0, slash);
  const model = String(modelName).slice(slash + 1);
  if (!AIEYRA_PROVIDERS.has(provider) || !model) return null;
  const found = (models[provider]?.models || []).some(m => m.id === model);
  return found ? { provider, model } : null;
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter(x => x?.type === "text").map(x => x.text || "").join("");
}

function toolResultContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content ?? "");
  return content.map(x => x?.type === "text" ? x.text || "" : JSON.stringify(x)).join("");
}

/** Convert Anthropic Messages request to OpenAI Chat Completions shape. */
export function anthropicToOpenAI(request) {
  const messages = [];
  if (request?.system) messages.push({ role: "system", content: textOf(request.system) });
  for (const original of request?.messages || []) {
    const content = Array.isArray(original.content) ? original.content : [{ type: "text", text: String(original.content ?? "") }];
    const toolResults = content.filter(x => x?.type === "tool_result");
    const normal = content.filter(x => x?.type === "text" || x?.type === "image");
    if (original.role === "user" && toolResults.length) {
      for (const item of toolResults) messages.push({ role: "tool", tool_call_id: item.tool_use_id, content: toolResultContent(item.content) });
      const remaining = normal.map(x => x.type === "text" ? { type: "text", text: x.text || "" } : x);
      if (remaining.some(x => x.type === "text" && x.text)) messages.push({ role: "user", content: remaining.length === 1 ? remaining[0].text : remaining });
      continue;
    }
    const toolUses = content.filter(x => x?.type === "tool_use");
    const text = normal.filter(x => x.type === "text").map(x => x.text || "").join("");
    if (original.role === "assistant" && toolUses.length) {
      const msg = { role: "assistant", content: text || null, tool_calls: toolUses.map(x => ({ id: x.id, type: "function", function: { name: x.name, arguments: JSON.stringify(x.input ?? {}) } })) };
      messages.push(msg);
    } else if (normal.length || text || !toolUses.length) {
      messages.push({ role: original.role, content: normal.length === 1 && normal[0].type === "text" ? text : normal.length ? normal : text });
    }
  }
  const result = {
    model: String(request?.model || "").split("/").slice(1).join("/"),
    messages,
    max_tokens: Math.max(1, Number(request?.max_tokens || 8192)),
    stream: !!request?.stream,
  };
  if (request?.temperature != null) result.temperature = request.temperature;
  if (Array.isArray(request?.tools) && request.tools.length) {
    result.tools = request.tools.map(t => ({ type: "function", function: { name: t.name, description: t.description || "", parameters: t.input_schema || { type: "object", properties: {} } } }));
  }
  if (request?.tool_choice) {
    if (request.tool_choice.type === "auto") result.tool_choice = "auto";
    else if (request.tool_choice.type === "any") result.tool_choice = "required";
    else if (request.tool_choice.type === "tool") result.tool_choice = { type: "function", function: { name: request.tool_choice.name } };
  }
  return result;
}

function parseArguments(value) {
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

/** Convert an OpenAI non-stream response to Anthropic Message response. */
export function openAIToAnthropic(data) {
  const choice = data?.choices?.[0] || {};
  const msg = choice.message || {};
  const content = [];
  if (msg.content) content.push({ type: "text", text: String(msg.content) });
  for (const call of msg.tool_calls || []) {
    const fn = call.function || {};
    content.push({ type: "tool_use", id: call.id || `tool_${content.length}`, name: fn.name || "unknown", input: parseArguments(fn.arguments) });
  }
  const finish = choice.finish_reason;
  const stopReason = finish === "tool_calls" || (msg.tool_calls || []).length ? "tool_use" : finish === "length" ? "max_tokens" : "end_turn";
  const usage = data?.usage || {};
  return {
    id: data?.id || `msg_${Date.now()}`,
    type: "message", role: "assistant", model: data?.model || "unknown", content,
    stop_reason: stopReason, stop_sequence: null,
    usage: { input_tokens: usage.prompt_tokens || 0, output_tokens: usage.completion_tokens || 0 },
  };
}

/** Convert one OpenAI stream chunk to Anthropic content deltas. */
export function openAIChunkToAnthropic(chunk, state = {}) {
  const choice = chunk?.choices?.[0] || {};
  const delta = choice.delta || {};
  const events = [];
  if (delta.content) events.push({ type: "content_block_delta", index: state.contentIndex ?? 0, delta: { type: "text_delta", text: delta.content } });
  if (delta.tool_calls) {
    for (const call of delta.tool_calls) {
      const index = (state.toolIndex ?? 0) + (call.index || 0);
      if (!state.toolStarted) {
        state.toolStarted = true; state.contentIndex = index;
        events.push({ type: "content_block_start", index, content_block: { type: "tool_use", id: call.id || `tool_${index}`, name: call.function?.name || "unknown", input: {} } });
      }
      if (call.function?.arguments) events.push({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: call.function.arguments } });
    }
  }
  if (choice.finish_reason) state.finishReason = choice.finish_reason;
  return events;
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function fetchUpstream(url, options) {
  return fetch(url, options);
}

function findModel(provider, id, models) {
  return (models[provider]?.models || []).find(m => m.id === id) || { id, provider, maxTokens: 8192 };
}

function authFor(provider, auth) {
  const item = auth[provider] || {};
  return { key: item.key, baseUrl: String(item.baseUrl || "https://token.aieyra.cn").replace(/\/+$/, "") };
}

function authorized(req, token = LOCAL_TOKEN) {
  const value = req.headers.authorization || "";
  return value === `Bearer ${token}`;
}

function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8 * 1024 * 1024) throw new Error("request body too large");
  }
  return JSON.parse(body || "{}");
}

async function handleMessages(req, res, request, deps) {
  const route = resolveAieyraRoute(request.model, deps.models);
  if (!route) return json(res, 400, { type: "error", error: { type: "invalid_request_error", message: "model must be an available aieyra-<pool>/<model> name" } });
  const auth = authFor(route.provider, deps.auth);
  if (!auth.key) return json(res, 503, { type: "error", error: { type: "api_error", message: "Aieyra provider is not configured" } });
  const modelDef = findModel(route.provider, route.model, deps.models);
  const payload = anthropicToOpenAI(request);
  payload.max_tokens = Math.min(payload.max_tokens, Number(modelDef.maxTokens || 8192), 32768);
  const upstream = await deps.fetch(`${auth.baseUrl}/v1/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.key}` }, body: JSON.stringify(payload),
  });
  if (!upstream.ok) {
    const detail = (await upstream.text().catch(() => "")).slice(0, 400);
    return json(res, upstream.status >= 500 ? 502 : upstream.status, { type: "error", error: { type: "api_error", message: `Aieyra upstream HTTP ${upstream.status}: ${detail}` } });
  }
  if (!request.stream) return json(res, 200, openAIToAnthropic(await upstream.json()));

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const messageId = `msg_${Date.now()}`;
  writeSse(res, "message_start", { type: "message_start", message: { id: messageId, type: "message", role: "assistant", model: route.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } });
  const state = { contentIndex: 0, toolIndex: 0, toolStarted: false };
  let startedText = false;
  let outputTokens = 0;
  let buffer = "";
  const emitChunk = (chunk) => {
    const delta = chunk?.choices?.[0]?.delta || {};
    if (delta.content && !startedText) { startedText = true; writeSse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }); }
    for (const event of openAIChunkToAnthropic(chunk, state)) writeSse(res, event.type, event);
    if (delta.content) outputTokens++;
  };
  for await (const chunk of upstream.body) {
    buffer += Buffer.from(chunk).toString("utf8");
    const lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try { emitChunk(JSON.parse(data)); } catch {}
    }
  }
  if (buffer.startsWith("data:")) { try { const data = buffer.slice(5).trim(); if (data && data !== "[DONE]") emitChunk(JSON.parse(data)); } catch {} }
  if (startedText) writeSse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
  if (state.toolStarted) writeSse(res, "content_block_stop", { type: "content_block_stop", index: state.contentIndex });
  const stopReason = state.finishReason === "tool_calls" || state.toolStarted ? "tool_use" : state.finishReason === "length" ? "max_tokens" : "end_turn";
  writeSse(res, "message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: outputTokens } });
  writeSse(res, "message_stop", { type: "message_stop" });
  res.end();
}

export function createAieyraGatewayServer({ authPath = AUTH_PATH, modelsPath = MODELS_PATH, token = LOCAL_TOKEN, fetchImpl = fetch } = {}) {
  const deps = { auth: readJson(authPath), models: readJson(modelsPath), fetch: fetchImpl };
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
      if (req.method === "GET" && pathname === "/health") return json(res, 200, { ok: true });
      if (req.method === "GET" && pathname === "/v1/models") {
        if (!authorized(req, token)) return json(res, 401, { error: "unauthorized" });
        return json(res, 200, { object: "list", data: modelEntries(deps.models).map(m => ({ id: `${m.provider}/${m.id}`, object: "model", owned_by: m.provider })) });
      }
      if (req.method !== "POST" || pathname !== "/v1/messages") return json(res, 404, { error: "not found" });
      if (req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { type: "error", error: { type: "authentication_error", message: "invalid gateway token" } });
      const body = await readBody(req);
      return await handleMessages(req, res, body, deps);
    } catch (error) {
      if (!res.headersSent) json(res, 500, { type: "error", error: { type: "api_error", message: String(error?.message || error).slice(0, 200) } });
      else res.end();
    }
  });
  return { server, listen(port = DEFAULT_PORT, host = "127.0.0.1") { return new Promise(resolve => server.listen(port, host, () => resolve(server))); }, close() { return new Promise(resolve => server.close(resolve)); } };
}

if (process.argv[1] && process.argv[1].endsWith("aieyra-anthropic-gateway.mjs")) {
  const gateway = createAieyraGatewayServer();
  gateway.listen().then(() => console.log(`[aieyra-gateway] listening on http://127.0.0.1:${DEFAULT_PORT}`));
}
