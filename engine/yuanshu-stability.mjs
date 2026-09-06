// 元枢循环稳法（对照 Goose 空回合 / 截断 tool JSON，OpenHands 工具硬中止）
import { execFile } from "node:child_process";

export const MAX_EMPTY_TURN_RETRIES = 3;
export const EMPTY_TURN_ERROR = "模型空回复，已重试仍无正文";
export const TRUNCATED_TOOL_ERROR = "工具调用被截断（多半是输出超长），请把任务拆小再试";

export function isEmptyAssistantTurn({ text = "", hasTools = false } = {}) {
  return !hasTools && !String(text || "").trim();
}

export function emptyTurnDecision(emptyCount) {
  const n = Number(emptyCount) || 0;
  return n < MAX_EMPTY_TURN_RETRIES ? "retry" : "exhausted";
}

function repairArgs(s) {
  if (typeof s !== "string" || !s) return s;
  try { JSON.parse(s); return s; } catch {}
  let out = s;
  while (/^\{\s*\}\s*(?=\{)/.test(out)) out = out.replace(/^\{\s*\}\s*/, "");
  try { JSON.parse(out); return out; } catch { return s; }
}

export function inspectToolCalls(rawTcs) {
  if (!Array.isArray(rawTcs) || !rawTcs.length) return { calls: [], truncated: false };
  const calls = [];
  let truncated = false;
  for (const tc of rawTcs) {
    if (!tc || typeof tc !== "object" || !tc.function || typeof tc.function !== "object" || !tc.function.name) {
      truncated = true;
      continue;
    }
    const repaired = repairArgs(String(tc.function.arguments ?? "{}"));
    try {
      JSON.parse(repaired || "{}");
      calls.push({
        id: tc.id,
        type: "function",
        function: { name: tc.function.name, arguments: repaired || "{}" },
      });
    } catch {
      truncated = true;
    }
  }
  return { calls, truncated };
}

export function execFileAbortable(file, args = [], options = {}) {
  const { signal, ...rest } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error("aborted");
      err.killed = true;
      err.aborted = true;
      reject(err);
      return;
    }
    const child = execFile(file, args, rest, (err, stdout, stderr) => {
      try { signal?.removeEventListener?.("abort", onAbort); } catch {}
      if (signal?.aborted || err?.killed) {
        const e = err || new Error("aborted");
        e.killed = true;
        e.aborted = true;
        reject(e);
        return;
      }
      resolve({ stdout, stderr, exitCode: err?.code ?? 0 });
    });
    const onAbort = () => {
      try { child.kill(); } catch {}
    };
    try { signal?.addEventListener?.("abort", onAbort, { once: true }); } catch {}
  });
}
