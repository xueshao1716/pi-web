// 元枢主循环：工具轮走调度器（abort/并行），run_code 进 UNIFIED_TOOLS
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ABORTED_MARKER } from "../../engine/tool-scheduler.mjs";
import {
  toolCallLoopKey,
  runYuanshuToolRound,
  attachYuanshuCodeTool,
} from "../../engine/yuanshu-loop.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function tc(name, args = {}, id = name) {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

test("toolCallLoopKey：画 SVG 算同一循环", () => {
  const a = toolCallLoopKey("write", { path: "a.svg", content: "<svg><rect/></svg>" });
  const b = toolCallLoopKey("write", { path: "b.svg", content: "<svg><circle/></svg>" });
  assert.equal(a, b);
});

test("runYuanshuToolRound：已 abort 的未启动工具不执行", async () => {
  const ran = [];
  const ac = new AbortController();
  ac.abort();
  const history = [];
  const r = await runYuanshuToolRound({
    toolCalls: [tc("read", { path: "a.txt" })],
    history,
    execute: async (name) => { ran.push(name); return { text: "ok" }; },
    signal: ac.signal,
    seenCalls: new Map(),
    policyDecide: () => ({ decision: "allow" }),
    jitForPath: () => [],
  });
  assert.equal(ran.length, 0);
  assert.equal(history[0].content, ABORTED_MARKER);
  assert.ok(!r.stop);
});

test("runYuanshuToolRound：策略 deny 不调用执行器", async () => {
  const ran = [];
  const history = [];
  await runYuanshuToolRound({
    toolCalls: [tc("bash", { command: "rm -rf /" })],
    history,
    execute: async (name) => { ran.push(name); return { text: "ok" }; },
    seenCalls: new Map(),
    policyDecide: () => ({ decision: "deny", note: "危险操作" }),
    jitForPath: () => [],
  });
  assert.equal(ran.length, 0);
  assert.match(String(history[0].content), /系统拦截/);
});

test("runYuanshuToolRound：相同成功调用 3 次停循环", async () => {
  const seenCalls = new Map();
  const history = [];
  const args = { path: "a.svg", content: "<svg></svg>" };
  for (let i = 0; i < 2; i++) {
    const r = await runYuanshuToolRound({
      toolCalls: [tc("write", args, `w${i}`)],
      history,
      execute: async () => ({ text: "ok" }),
      seenCalls,
      policyDecide: () => ({ decision: "allow" }),
      jitForPath: () => [],
    });
    assert.ok(!r.stop);
  }
  const third = await runYuanshuToolRound({
    toolCalls: [tc("write", args, "w3")],
    history,
    execute: async () => ({ text: "ok" }),
    seenCalls,
    policyDecide: () => ({ decision: "allow" }),
    jitForPath: () => [],
  });
  assert.match(third.stop?.error || "", /循环/);
});

test("attachYuanshuCodeTool 把 run_code 挂进工具表", () => {
  const tools = [];
  attachYuanshuCodeTool(tools, {
    runCodeToolDef: () => ({
      name: "run_code",
      description: "编排多步",
      parameters: { type: "object", properties: { program: { type: "string" } } },
      handler: async () => ({ text: "ok" }),
    }),
  });
  assert.equal(tools[0].function.name, "run_code");
  attachYuanshuCodeTool(tools, { runCodeToolDef: () => ({ name: "run_code", handler: async () => ({ text: "x" }) }) });
  assert.equal(tools.length, 1, "不得重复挂");
});

test("unifiedChat 工具轮必须走 runYuanshuToolRound；handleUnifiedChat 启动时 initEngine", () => {
  const src = readFileSync(join(ROOT, "engine", "unified-chat.mjs"), "utf8");
  const start = src.indexOf("export async function unifiedChat");
  const fn = src.slice(start, start + 9000);
  assert.ok(fn.includes("runYuanshuToolRound"), "主循环不能再手写串行 await execute");
  const h = src.slice(src.indexOf("export async function handleUnifiedChat"), src.indexOf("export async function handleUnifiedChat") + 2500);
  assert.ok(h.includes("initEngine"), "元枢开口先把自己的引擎热起来，run_code 才进主工具表");
});
