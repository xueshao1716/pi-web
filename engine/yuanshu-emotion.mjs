// 元枢自己的 VAD 情绪接线：开轮注入、收轮推 SSE。不走 pi SDK 的 nextTurn。
import { updateEmotion, updateFromOutput, emotionPrompt, recordFeeling, getSnapshot } from "./emotion.mjs";

const recent = new Map();

function sessionKey(id) {
  return String(id || "new");
}

export function beginYuanshuEmotion(sessionId, message, history = []) {
  const key = sessionKey(sessionId);
  const msg = String(message || "");
  const prev = recent.get(key);
  const now = Date.now();
  if (!prev || prev.msg !== msg || now - prev.at > 10000) {
    updateEmotion(key, msg);
    recent.set(key, { msg, at: now });
  }
  const prompt = emotionPrompt(key, msg);
  if (!prompt) return history;
  if (history.some((m) => m?.role === "system" && /情绪语境/.test(String(m.content || "")))) return history;
  return [{ role: "system", content: prompt }, ...history];
}

export function endYuanshuEmotion(sessionId, message, text, writer) {
  const key = sessionKey(sessionId);
  updateFromOutput(key, text);
  recordFeeling(key, message);
  const state = getSnapshot(key);
  if (state && writer && typeof writer.push === "function") {
    writer.push("emotion", { state });
  }
  return state;
}
