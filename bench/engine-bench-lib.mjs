// 元枢 vs pi 横评：同一条 /api/chat SSE，只比主驾循环，不比 Gateway 旁路。
export const NATIVE_PROVIDERS = new Set([
  "deepseek", "openai", "openrouter", "anthropic", "google", "qwen", "xai", "moonshotai",
  "moonshotai-cn", "together", "mistral", "nvidia", "opencode-go", "opencode", "openai-codex",
  "zai", "zai-coding-cn", "xiaomi", "xiaomi-token-plan-cn", "xiaomi-token-plan-ams",
  "xiaomi-token-plan-sgp", "qwen-token-plan-cn", "qwen-token-plan-individual", "qwen-token-plan",
  "minimax", "minimax-cn", "kimi-coding", "github-copilot", "groq", "fireworks", "cerebras",
]);

export const CASES = [
  { id: "A1", group: "问答", msg: "1+1等于几？只回答数字" },
  { id: "A2", group: "问答", msg: "中国的首都是哪座城市？只回答城市名" },
  { id: "A3", group: "问答", msg: "标准大气压下水的沸点是多少摄氏度？只回答数字" },
  { id: "B1", group: "指令", msg: "只回答两个字母：OK。不要任何其他内容。" },
  { id: "B2", group: "指令", msg: '只输出一个 JSON 对象（不要 markdown 代码块）：{"a":1}' },
  { id: "B3", group: "指令", msg: "用恰好五个字描述太阳" },
  { id: "C1", group: "工具", msg: "读取 D:/pi-web/bench/fixture.txt 的内容，告诉我里面的标记词是什么。只回答标记词。" },
  { id: "C2", group: "工具", msg: "用 bash 执行 echo yuanshu-bench-echo 并把输出原样告诉我。只回答输出内容。" },
  { id: "D1", group: "稳定", msg: "读取 C:/definitely/not/exist-9527.txt 这个文件" },
  { id: "D2", group: "稳定", msg: "1234567890乘以987654321等于多少？只回答数字结果" },
];

export function judgeReply(id, text) {
  const r = String(text || "");
  if (id === "A1") return /\b2\b/.test(r.replace(/２/g, "2"));
  if (id === "A2") return r.includes("北京");
  if (id === "A3") return /100/.test(r);
  if (id === "B1") return r.trim() === "OK";
  if (id === "B2") {
    try {
      const j = JSON.parse(r.trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
      return j.a === 1;
    } catch { return false; }
  }
  if (id === "B3") {
    const s = r.trim().replace(/[。！？，,\s*]/g, "");
    return s.length >= 4 && s.length <= 8 && /太阳|日|恒星|光/.test(s);
  }
  if (id === "C1") return /BENCH-MARKER-9527/.test(r);
  if (id === "C2") return /yuanshu-bench-echo/.test(r);
  if (id === "D1") return r.trim().length > 0 && !/ECONNREFUSED|server crashed/i.test(r);
  if (id === "D2") {
    const n = r.replace(/\s|,/g, "");
    return /121932631/.test(n) || /1[,.]?219?.?3/.test(n);
  }
  return false;
}

export function parseChatSse(raw) {
  const textChunks = [];
  let lead = "";
  let toolSeen = false;
  let firstCharAt = -1;
  let evt = "";
  let offset = 0;
  for (const line of String(raw || "").split(/\r?\n/)) {
    offset += line.length + 1;
    if (line.startsWith("event:")) { evt = line.slice(6).trim(); continue; }
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    let ev = {};
    try { ev = JSON.parse(payload); } catch { continue; }
    if (evt === "note" && ev.text) {
      if (/主引擎 · 元枢/.test(ev.text)) lead = "yuanshu";
      else if (/主引擎 · pi/.test(ev.text)) lead = "pi";
      else if (/主引擎 · dsh/.test(ev.text)) lead = "dsh";
    } else if (evt === "delta" && ev.text) {
      if (firstCharAt < 0) firstCharAt = offset;
      textChunks.push(ev.text);
    } else if (evt === "tool") {
      toolSeen = true;
    }
  }
  return { text: textChunks.join(""), lead, toolSeen, firstCharAt };
}

export function pickNativeModel(modelsPayload) {
  const list = Array.isArray(modelsPayload?.models) ? modelsPayload.models : [];
  const cur = modelsPayload?.current;
  if (cur?.provider && NATIVE_PROVIDERS.has(cur.provider) && cur.id !== "auto") {
    return { provider: cur.provider, id: cur.id };
  }
  const hit = list.find((m) => m?.provider && m?.id && NATIVE_PROVIDERS.has(m.provider) && m.id !== "auto");
  return hit ? { provider: hit.provider, id: hit.id } : null;
}

export function summarizeBench(rows) {
  const out = {};
  for (const id of ["yuanshu", "pi"]) {
    const rs = rows.filter((r) => r.engine === id);
    const byGroup = {};
    for (const g of ["问答", "指令", "工具", "稳定"]) {
      const gs = rs.filter((r) => r.group === g);
      byGroup[g] = `${gs.filter((r) => r.pass && r.leadOk !== false).length}/${gs.length}`;
    }
    const passed = rs.filter((r) => r.pass && r.leadOk !== false).length;
    out[id] = {
      passed,
      total: rs.length,
      score: rs.length ? Number((passed / rs.length).toFixed(4)) : 0,
      byGroup,
      avgMs: rs.length ? Math.round(rs.reduce((s, r) => s + (r.ms || 0), 0) / rs.length) : 0,
      leadMismatch: rs.filter((r) => r.leadOk === false).length,
    };
  }
  return out;
}
