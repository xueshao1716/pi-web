// engine/yuanshu-loop.mjs —— 元枢主循环的工具轮（调度器 + Code Mode 挂载）
// Gateway 的 StandardAgentLoop 仍是旁路演示；真正长的是 unifiedChat 这条。
import { scheduleToolCalls, ABORTED_MARKER } from "./tool-scheduler.mjs";
import { policyDecide as defaultPolicy } from "./dsh-keys.mjs";
import { wrapUntrusted } from "./prompt-security.mjs";
import { jitRulesForPath as defaultJit } from "./context-loader.mjs";
import { coachToolFailure } from "./yuanshu-protocol.mjs";
import { recordStuckEvent, detectStuck } from "./yuanshu-stuck.mjs";
import { coachSearchRound } from "./yuanshu-session.mjs";

const handlers = Object.create(null);

export function registerYuanshuExecutor(name, fn) {
  if (name && typeof fn === "function") handlers[name] = fn;
}

export function yuanshuExecutor(name) {
  return handlers[name] || null;
}

export function toolCallLoopKey(name, args) {
  const n = String(name || "");
  const a = args && typeof args === "object" ? args : {};
  const body = String(a.content || a.new_string || a.newString || "");
  const filePath = String(a.path || "");
  const cmd = String(a.command || a.cmd || "");
  if ((n === "write" || n === "edit") && (/<svg[\s>]/i.test(body) || /\.svg$/i.test(filePath))) return `${n}:draw`;
  if ((n === "bash" || n === "dsh") && /images\/generations|\/v3\/images|绘图模型|generateImage/i.test(cmd)) return `${n}:draw`;
  return `${n}:${JSON.stringify(a)}`;
}

export function attachYuanshuCodeTool(tools, codeMode) {
  if (!Array.isArray(tools) || !codeMode?.runCodeToolDef) return tools;
  const def = codeMode.runCodeToolDef();
  if (def?.handler) registerYuanshuExecutor("run_code", (args) => def.handler(args));
  if (tools.some((t) => (t.function?.name || t.name) === "run_code")) return tools;
  tools.push({
    type: "function",
    function: {
      name: def.name || "run_code",
      description: def.description || "",
      parameters: def.parameters || { type: "object", properties: {} },
    },
  });
  return tools;
}

function exclusiveDef(name) {
  if (name === "write" || name === "edit" || name === "bash" || name === "run_code" || name === "dsh_task" || name === "delegate_task") {
    return { parallel: false };
  }
  return { parallel: true };
}

export async function runYuanshuToolRound({
  toolCalls = [],
  history = [],
  execute,
  signal,
  onTool,
  onToolEnd,
  seenCalls = new Map(),
  jitInjected = new Set(),
  spill = (_n, t) => t,
  policyDecide = defaultPolicy,
  jitForPath = defaultJit,
  stuckEvents = [],
} = {}) {
  const tools = {
    getDef: exclusiveDef,
    execute: async (name, args) => {
      const pd = policyDecide(name, args);
      if (pd?.decision === "deny") return { text: `[系统拦截] ${pd.note}`, isError: true, denied: true };
      const raw = await execute(name, args, { signal });
      const out = raw && typeof raw === "object" ? raw : { text: String(raw || ""), isError: true };
      if ((name === "read" || name === "write" || name === "edit") && args?.path) {
        try {
          const jits = jitForPath(args.path) || [];
          if (jits.length) {
            const key = String(jits[0]).slice(0, 30);
            if (!jitInjected.has(key)) {
              jitInjected.add(key);
              out.text = `[该目录约定 GEMINI.md]\n${jits.join("\n")}\n\n---\n${out.text}`;
            }
          }
        } catch {}
      }
      const searchCount = 1 + (stuckEvents || []).filter((e) => e.name === "web_search").length;
      return coachSearchRound(name, searchCount, coachToolFailure(name, args, out));
    },
  };

  const results = await scheduleToolCalls({
    toolCalls,
    tools,
    onTool,
    onToolEnd,
    signal,
    maxParallel: 4,
  });

  const searches = results.filter((r) => r.name === "web_search");
  if (searches.length >= 2) {
    const last = searches[searches.length - 1];
    last.out = coachSearchRound("web_search", searches.length, last.out || { text: "" });
  }

  for (const item of results) {
    const { id, name, args, out } = item;
    const text = String(out?.text || "");
    const denied = !!out?.denied || text.startsWith("[系统拦截]");
    const aborted = text === ABORTED_MARKER;
    if (!denied && !aborted) {
      const sig = toolCallLoopKey(name, args);
      seenCalls.set(sig, (seenCalls.get(sig) || 0) + 1);
      const failed = out?.isError === true;
      if (!failed && seenCalls.get(sig) >= 3) {
        history.push({ role: "tool", tool_call_id: id, content: wrapUntrusted(name, spill(name, text)) });
        return { history, stop: { error: "模型工具调用陷入循环，已中断（建议换一种方式提问）" } };
      }
      if (failed && seenCalls.get(sig) >= 5) {
        out.text = `[系统提示] 工具 ${name} 已连续失败 5 次（最近错误：${text.slice(0, 100)}）。请换一种方式完成任务，不要重复相同的失败操作。`;
      }
      stuckEvents.push(recordStuckEvent(name, args, out));
      const stuck = detectStuck(stuckEvents);
      if (stuck) {
        out.text = `${out?.text || text}\n[宿主纠偏] ${stuck.hint}`;
        history.push({ role: "tool", tool_call_id: id, content: wrapUntrusted(name, spill(name, out.text)) });
        return { history, stop: { error: stuck.hint } };
      }
    }
    history.push({ role: "tool", tool_call_id: id, content: wrapUntrusted(name, spill(name, out?.text)) });
  }
  return { history };
}
