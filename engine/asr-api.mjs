// engine/asr-api.mjs —— 语音转文字（ASR）API（2026-08-22 Phase2 收尾）
// 链路：前端 MediaRecorder 录音 → base64 → POST /api/asr → 小米 token-plan 网关
//       mimo-v2.5-asr（免费通道，实测可用）→ 返回 { text }
// 注意：网关要求 input_audio 消息不能带 text 部分（prompt 由网关注入），否则 400。
import { json } from "./http-utils.mjs";

let _resolveAuth = null;
let _readJsonFile = null;
let _modelsPath = "";
let _httpJsonFetch = null;

export function initAsrApi({ resolveAuth, readJsonFile, modelsPath, httpJsonFetch }) {
  _resolveAuth = resolveAuth || _resolveAuth;
  _readJsonFile = readJsonFile || _readJsonFile;
  _modelsPath = modelsPath || _modelsPath;
  _httpJsonFetch = httpJsonFetch || _httpJsonFetch;
}

const PROVIDER = "xiaomi-token-plan-cn";
const MODEL = "mimo-v2.5-asr";
const DEFAULT_BASE = "https://token-plan-cn.xiaomimimo.com/v1";
// 上游网关（mimo-v2.5-asr）只接受 wav/mp3（webm 会被拒："must be one of: wav, mp3"）；
// 前端负责把 MediaRecorder 产物转成 WAV 再发
const ALLOWED_FORMATS = new Set(["wav", "mp3"]);
const MAX_AUDIO_MB = 12;

function resolveBase() {
  try {
    const store = _readJsonFile(_modelsPath) || {};
    for (const m of store[PROVIDER]?.models || []) {
      if ((m.id === MODEL || m.id?.startsWith?.(MODEL)) && m.baseUrl) return String(m.baseUrl).replace(/\/+$/, "");
    }
  } catch {}
  return DEFAULT_BASE;
}

export async function handleAsr(res, body) {
  const data = String(body?.data || "");
  const format = String(body?.format || "webm").toLowerCase().replace(/^audio\//, "").replace(/^x-m4a$/, "m4a");
  if (!data) return json(res, 400, { error: "缺少音频数据（data: base64 字符串）" });
  if (!ALLOWED_FORMATS.has(format)) return json(res, 400, { error: `不支持的音频格式 ${format}（可选：${[...ALLOWED_FORMATS].join("/")}）` });
  if (data.length > MAX_AUDIO_MB * 1024 * 1024 * 1.37) return json(res, 413, { error: `音频过大（上限 ${MAX_AUDIO_MB}MB）` });

  const resolved = _resolveAuth?.(PROVIDER);
  if (!resolved?.key) return json(res, 503, { error: `ASR 未配置：${PROVIDER} 缺少 API Key` });

  const url = `${resolveBase()}/chat/completions`;
  const payload = {
    model: MODEL,
    messages: [{
      role: "user",
      // ⚠️ 网关约定：只传 audio，不带 text part（"text prompt is injected by the gateway"）
      content: [{ type: "input_audio", input_audio: { data, format } }],
    }],
  };
  try {
    const r = await _httpJsonFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resolved.key}` },
      body: JSON.stringify(payload),
      timeout: 120000,
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return json(res, 502, { error: `ASR 上游失败 ${r.status}: ${txt.slice(0, 200)}` });
    }
    const d = await r.json();
    const text = d?.choices?.[0]?.message?.content || "";
    if (!text) return json(res, 502, { error: "ASR 未返回文本" });
    return json(res, 200, { text: String(text).trim(), model: MODEL, provider: PROVIDER });
  } catch (e) {
    return json(res, 500, { error: `ASR 失败: ${String(e?.message || e).slice(0, 200)}` });
  }
}
