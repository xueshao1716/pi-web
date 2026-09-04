// ══ 会话解析纯函数（2026-08-19 拆模块：从 server.mjs 抽出）══
// extractMessages / extractText / extractImages / extractFiles —— 无 server 内部依赖，可单测可复用。

// 从消息 content 提取文本（type: text 的块）
export function extractText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter(b => b.type === "text").map(b => b.text || "").join("");
  }
  return "";
}

// 从消息 content 提取图片附件（type: image 的块）——base64 过大（>2.5MB）的省略，避免传输过重
export function extractImages(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter(b => b.type === "image" && b.data && b.mimeType && b.data.length <= 2.5 * 1024 * 1024)
    .map(b => ({ data: b.data, mimeType: b.mimeType }));
}

// 从消息 content 提取文件附件（type: file 的块）
export function extractFiles(content) {
  if (!Array.isArray(content)) return [];
  return content.filter(b => b.type === "file").map(b => ({ name: b.name, path: b.path, size: b.size, mime: b.mime }));
}

export function resolveLeafId(entries, leafId) {
  const ids = new Set((entries || []).filter(e => e?.type === "message" && e.id).map(e => e.id));
  if (leafId && ids.has(leafId)) return leafId;
  for (let i = (entries || []).length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e?.type === "message" && e.id) return e.id;
  }
  return null;
}

export function windowMessages(messages, tail) {
  const list = Array.isArray(messages) ? messages : [];
  const n = Number(tail);
  if (!Number.isFinite(n) || n <= 0 || list.length <= n) {
    return { messages: list, truncated: false, total: list.length };
  }
  return { messages: list.slice(-n), truncated: true, total: list.length };
}

// 从会话 entries 中提取消息（供历史渲染；指定 leafId 时只返回该分支路径上的消息）
export function extractMessages(entries, leafId) {
  // 若指定 leafId：只返回该分支路径上的消息（沿 parentId 回溯）
  const byId = new Map(entries.filter(e => e.id).map(e => [e.id, e]));
  const pathIds = new Set();
  if (leafId && byId.has(leafId)) {
    let cur = byId.get(leafId);
    while (cur) { pathIds.add(cur.id); cur = cur.parentId && byId.get(cur.parentId) ? byId.get(cur.parentId) : null; }
  }
  // 第一遍：收集 toolResult（可能出现在 assistant 之后）
  const toolResults = new Map();
  for (const e of entries) {
    if (e.type !== "message" || !e.message) continue;
    const m = e.message;
    if (m.role === "toolResult" && m.toolCallId) {
      toolResults.set(m.toolCallId, { output: extractText(m.content), isError: !!m.isError });
    }
  }
  const out = [];
  for (const e of entries) {
    if (e.type !== "message") continue;
    if (leafId && !pathIds.has(e.id)) continue;
    const m = e.message;
    if (!m) continue;
    if (m.role === "user") {
      const text = extractText(m.content);
      const files = extractFiles(m.content);
      const images = extractImages(m.content);
      if (text || files.length || images.length) out.push({ role: "user", text, files, images, ts: e.timestamp, id: e.id });
    } else if (m.role === "assistant") {
      const text = extractText(m.content);
      const files = extractFiles(m.content);
      const images = extractImages(m.content);
      const tools = [];
      let think = "";
      if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b.type === "toolCall" && b.id && b.name) {
            const r = toolResults.get(b.id) || {};
            tools.push({ id: b.id, name: b.name, args: b.arguments || null, output: r.output || "", isError: !!r.isError });
          } else if (b.type === "thinking" && (b.thinking || b.text)) {
            think += (b.thinking || b.text || "");
          }
        }
      }
      if (text || files.length || images.length || tools.length || think) out.push({ role: "assistant", text, files, images, tools, think, ts: e.timestamp, id: e.id });
    }
  }
  return out;
}
