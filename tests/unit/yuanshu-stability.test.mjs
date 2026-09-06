// 元枢循环再稳：空回合有界重试、截断 tool JSON 立刻停、工具执行吃 abort
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_EMPTY_TURN_RETRIES,
  EMPTY_TURN_ERROR,
  TRUNCATED_TOOL_ERROR,
  isEmptyAssistantTurn,
  emptyTurnDecision,
  inspectToolCalls,
  execFileAbortable,
} from "../../engine/yuanshu-stability.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");

test("空回合：无工具且无正文才算空", () => {
  assert.equal(isEmptyAssistantTurn({ text: "", hasTools: false }), true);
  assert.equal(isEmptyAssistantTurn({ text: "  ", hasTools: false }), true);
  assert.equal(isEmptyAssistantTurn({ text: "你好", hasTools: false }), false);
  assert.equal(isEmptyAssistantTurn({ text: "", hasTools: true }), false);
});

test("空回合：同一模型最多重试 3 次，第 3 次空才耗尽", () => {
  assert.equal(MAX_EMPTY_TURN_RETRIES, 3);
  assert.equal(emptyTurnDecision(1), "retry");
  assert.equal(emptyTurnDecision(2), "retry");
  assert.equal(emptyTurnDecision(3), "exhausted");
  assert.equal(emptyTurnDecision(4), "exhausted");
});

test("inspectToolCalls：合法调用放行", () => {
  const r = inspectToolCalls([
    { id: "1", function: { name: "read", arguments: '{"path":"a.txt"}' } },
  ]);
  assert.equal(r.truncated, false);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].function.name, "read");
});

test("inspectToolCalls：arguments 截断成半截 JSON 必须标 truncated", () => {
  const r = inspectToolCalls([
    { id: "1", function: { name: "write", arguments: '{"path":"a.html","content":"<div' } },
  ]);
  assert.equal(r.truncated, true);
  assert.equal(r.calls.length, 0);
});

test("inspectToolCalls：缺 name / 缺 function 也算截断", () => {
  assert.equal(inspectToolCalls([{ id: "1", function: { arguments: "{}" } }]).truncated, true);
  assert.equal(inspectToolCalls([{ id: "1" }]).truncated, true);
});

test("execFileAbortable：abort 必须杀掉已启动的子进程", async () => {
  const ac = new AbortController();
  const started = Date.now();
  const p = execFileAbortable(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], {
    timeout: 300000,
    windowsHide: true,
    signal: ac.signal,
  });
  setTimeout(() => ac.abort(), 80);
  await assert.rejects(p, (e) => e?.aborted === true || e?.killed === true || /abort/i.test(String(e?.message || e)));
  assert.ok(Date.now() - started < 8000, "断开后不能再等满超时");
});

test("unifiedChat 必须接上空回合重试、截断停、工具 abort", () => {
  const chat = read("engine", "unified-chat.mjs");
  const loop = read("engine", "yuanshu-loop.mjs");
  const tools = read("engine", "tools", "unified-tools.mjs");
  const sched = read("engine", "tool-scheduler.mjs");
  assert.ok(chat.includes("inspectToolCalls") && chat.includes("TRUNCATED_TOOL_ERROR"), "截断 tool JSON 必须立刻停");
  assert.ok(chat.includes("emptyTurnDecision") && chat.includes("EMPTY_TURN_ERROR"), "空回合必须有界重试");
  assert.ok(chat.includes("result.empty") || chat.includes("empty: true"), "空回合耗尽要标 empty 给外层兑底");
  assert.ok(loop.includes("execute(name, args,") && loop.includes("signal"), "工具轮要把 abort 传进执行器");
  assert.ok(sched.includes("execute(fnName, args") && sched.includes("signal"), "调度器必须把 signal 传给 execute");
  assert.ok(tools.includes("execFileAbortable"), "bash 必须走可中止的 exec");
});
