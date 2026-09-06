// ===== tool-scheduler.mjs —— 工具调度器（dsh 调度思想落地）=====
// 设计（对应 docs/dsh-design-notes.md 亮点 2）：
//   - 排他调用（工具注册时 parallel:false）形成屏障：屏障前的并行组全部完成后才执行它，
//     它完成后再放行后续并行组 —— 前后调用绝不与它重叠。
//   - 并行调用使用有界滚动池：并发上限 maxParallel，超出排队；分发可重叠，
//     但结果严格按模型调用顺序收集（保序）。
//   - Abort 语义不撒谎：已启动的调用排空（drain）等待完成；未启动的补合成错误结果，
//     保证消息序列完整（回放有效）。调度器本身不伪造结果。
//
// 用法：
//   const results = await scheduleToolCalls({ toolCalls, tools, onTool, onToolEnd, signal, maxParallel });
//   results: [{ id, name, args, out }] —— 与 toolCalls 同序。

export const ABORTED_MARKER = "[系统提示] 工具调用已中止（未执行）";

export async function scheduleToolCalls({
  toolCalls = [],
  tools = null,
  onTool = null,
  onToolEnd = null,
  signal = null,
  maxParallel = 4,
} = {}) {
  const results = [];
  let i = 0;
  const n = toolCalls.length;
  while (i < n) {
    // 找连续可并行段 [i, j)：遇到排他调用即结束（排他调用单独成屏障）
    let j = i;
    while (j < n && !isExclusive(toolCalls[j], tools)) j++;
    if (j === i) {
      // 屏障：单独执行排他调用
      results.push(await runOne(toolCalls[i], { tools, onTool, onToolEnd, signal }));
      i++;
    } else {
      const seg = toolCalls.slice(i, j);
      const done = await runParallel(seg, { tools, onTool, onToolEnd, signal, maxParallel });
      results.push(...done);
      i = j;
    }
  }
  return results;
}

// ── 并行段：有界滚动池 + 结果保序 ──
async function runParallel(seg, ctx) {
  const out = new Array(seg.length); // 按下标写，天然保序
  let cursor = 0;
  async function worker() {
    while (cursor < seg.length) {
      const idx = cursor++;
      const tc = seg[idx];
      if (ctx.signal?.aborted) {
        // 未启动 → 补合成错误结果（不执行）
        out[idx] = abortedResult(tc, ctx);
        continue;
      }
      out[idx] = await runOne(tc, ctx);
    }
  }
  const poolSize = Math.max(1, Math.min(ctx.maxParallel || 4, seg.length));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return out;
}

// ── 单个调用 ──
async function runOne(tc, { tools, onTool, onToolEnd, signal }) {
  let args = {};
  try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
  const fnName = tc.function?.name || "";
  if (signal?.aborted) {
    const out = { text: ABORTED_MARKER, isError: true };
    if (onToolEnd) onToolEnd(tc.id, fnName, args, out);
    return { id: tc.id, name: fnName, args, out };
  }
  if (onTool) onTool(tc.id, fnName, args);
  const out = await (tools ? tools.execute(fnName, args, { signal }) : { text: `未知工具: ${fnName}`, isError: true });
  if (onToolEnd) onToolEnd(tc.id, fnName, args, out);
  return { id: tc.id, name: fnName, args, out };
}

function abortedResult(tc, ctx) {
  let args = {};
  try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
  const fnName = tc.function?.name || "";
  const out = { text: ABORTED_MARKER, isError: true };
  if (ctx.onToolEnd) ctx.onToolEnd(tc.id, fnName, args, out);
  return { id: tc.id, name: fnName, args, out };
}

// ── 排他判定：工具注册时 parallel:false → 屏障 ──
function isExclusive(tc, tools) {
  const name = tc.function?.name;
  if (!name || !tools?.getDef) return false;
  const def = tools.getDef(name);
  return def?.parallel === false;
}

export default scheduleToolCalls;
