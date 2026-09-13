// 元枢会话连续性：打断也留痕，有历史就不许装新开。

export function sessionContinuityNote(hist = []) {
  const n = Array.isArray(hist) ? hist.length : 0;
  if (n > 0) return "【本会话】上面是本会话已有对话，不是新开的。接着做，做完汇报。";
  return "【本会话】这是本会话第一条。跨会话细节看记忆目录或 read 记忆.md，不要 bash 扫盘，也不要说记忆系统坏了。";
}

export function coachSearchRound(name, count, out = {}) {
  const next = { ...out, text: String(out?.text || ""), isError: out?.isError === true };
  if (name !== "web_search" || Number(count) < 2) return next;
  if (!/不要再连搜|按判断写/.test(next.text)) {
    next.text += "\n[宿主] 搜了两轮还锁不到就按判断写，把假设写进汇报，不要再连搜。";
  }
  return next;
}

export function abortedAssistantText(result) {
  const t = String(result?.text || "").trim();
  return t || "（本轮已停止）";
}

export function persistYuanshuUser(sm, message) {
  if (!sm?.appendMessage) return;
  sm.appendMessage({ role: "user", content: [{ type: "text", text: String(message || "") }] });
}

export function persistYuanshuAssistant(sm, text, mediaItems = []) {
  if (!sm?.appendMessage) return;
  const body = typeof text === "string" ? [{ type: "text", text }] : text;
  sm.appendMessage({ role: "assistant", content: Array.isArray(body) ? body : [{ type: "text", text: String(text || "") }] });
  void mediaItems;
}

// Persist the model/tool exchange that happened after the current user turn.
// Unified chat keeps this transcript in memory, but the session file used to
// receive only the final prose. That made the next turn lose the actual
// command output (and made a resumed task look like a fresh conversation).
export function persistYuanshuToolTrace(sm, history = []) {
  if (!sm?.appendMessage || !Array.isArray(history)) return;
  let userIndex = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "user") { userIndex = i; break; }
  }
  if (userIndex < 0) return;
  const seen = new Set();
  const persistedResults = new Set();
  for (const message of history.slice(userIndex + 1)) {
    if (message?.role !== "assistant" || !Array.isArray(message.tool_calls) || !message.tool_calls.length) continue;
    const calls = message.tool_calls.filter(c => c?.id && c?.function?.name);
    if (!calls.length || calls.some(c => seen.has(c.id))) continue;
    const blocks = [];
    if (typeof message.content === "string" && message.content.trim()) blocks.push({ type: "text", text: message.content });
    for (const call of calls) {
      blocks.push({ type: "toolCall", id: String(call.id), name: String(call.function.name), arguments: String(call.function.arguments || "{}") });
      seen.add(call.id);
    }
    try { sm.appendMessage({ role: "assistant", content: blocks }); } catch {}
    for (const result of history) {
      if (result?.role !== "tool" || !result.tool_call_id || !seen.has(result.tool_call_id) || persistedResults.has(result.tool_call_id)) continue;
      try {
        sm.appendMessage({ role: "toolResult", toolCallId: String(result.tool_call_id), isError: !!result.isError, content: [{ type: "text", text: String(result.content || "") }] });
        persistedResults.add(result.tool_call_id);
      } catch {}
    }
  }
}
