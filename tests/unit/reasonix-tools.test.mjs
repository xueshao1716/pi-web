// Reasonix 机制单测（2026-08-19）：工具结果压缩 / NEEDS_PRO 自报升级 / scavenge 工具调用捞回
import { test } from "node:test";
import assert from "node:assert/strict";
import { shrinkToolResult, NEEDS_PRO_RE, scavengeToolCalls, TURN_END_RESULT_CAP, projectToolResult, countProjection, resetProjectionCounts, FULL_SENDS } from "../../engine/reasonix-tools.mjs";

/** 造一个确定会长于阈值的工具结果。 */
const longOutput = tag => `${tag}\n${"z".repeat(TURN_END_RESULT_CAP + 500)}`;

const TOOLS = [
  { type: "function", function: { name: "bash", parameters: { type: "object" } } },
  { type: "function", function: { name: "read", parameters: { type: "object" } } },
  { type: "function", function: { name: "write", parameters: { type: "object" } } },
];

// ── ① 工具结果压缩 ──
test("shrinkToolResult: 短结果不动", () => {
  const s = "ok".repeat(100);
  assert.equal(shrinkToolResult(s), s);
});

test("shrinkToolResult: 超长结果保留头尾+省略标记", () => {
  const long = "x".repeat(TURN_END_RESULT_CAP + 5000);
  const r = shrinkToolResult(long);
  assert.ok(r.length < TURN_END_RESULT_CAP, `压缩后应小于阈值 (${r.length})`);
  assert.ok(r.includes("结果过长已压缩"), "应含压缩标记");
  assert.ok(r.startsWith("x".repeat(3000)), "应保留头部");
  assert.ok(r.endsWith("x".repeat(3000)), "应保留尾部");
});

// ── ①b 大结果先发全文 N 次再压缩（借 SoL-Pi 的 FULL_SENDS）──
// 为什么：模型可能**还在用**这个结果，一出现就砍掉会饿死正在读它的模型。
test("长结果前 FULL_SENDS 次投影是全文，之后才压缩", () => {
  resetProjectionCounts();
  const tool = { id: "t-full", output: longOutput("first") };
  for (let i = 1; i <= FULL_SENDS; i++) {
    assert.equal(projectToolResult(tool), tool.output, `第 ${i} 次投影必须仍是全文`);
  }
  const shrunk = projectToolResult(tool);
  assert.notEqual(shrunk, tool.output, `第 ${FULL_SENDS + 1} 次起必须压缩`);
  assert.match(shrunk, /工具结果过长已压缩/);
  assert.ok(shrunk.length < tool.output.length);
});

test("短结果不受计数影响，永远原样", () => {
  resetProjectionCounts();
  const tool = { id: "t-short", output: "ok" };
  for (let i = 0; i < FULL_SENDS + 5; i++) assert.equal(projectToolResult(tool), "ok");
  assert.equal(countProjection(tool, "ok"), 1, "短结果不该被计入投影跟踪");
});

test("计数按 tool_call_id 区分，互不影响", () => {
  resetProjectionCounts();
  const a = { id: "t-a", output: longOutput("A") };
  const b = { id: "t-b", output: longOutput("B") };
  for (let i = 1; i <= FULL_SENDS; i++) projectToolResult(a); // a 用满全文额度
  assert.equal(projectToolResult(b), b.output, "b 是第一次投影，不该被 a 的计数牵连");
  assert.notEqual(projectToolResult(a), a.output, "a 额度已用完，应压缩");
});

test("没有 tool_call_id 时退回内容寻址：同一份内容共享计数", () => {
  resetProjectionCounts();
  const text = longOutput("no-id");
  const first = { output: text };
  const second = { output: text };
  for (let i = 1; i <= FULL_SENDS; i++) projectToolResult(first);
  assert.notEqual(projectToolResult(second), text, "同一内容应是同一个计数，额度已用完");
});

test("不同内容即使都用满额度也各算各的", () => {
  resetProjectionCounts();
  assert.equal(projectToolResult({ id: "x1", output: longOutput("X1") }), longOutput("X1"));
  assert.equal(projectToolResult({ id: "x2", output: longOutput("X2") }), longOutput("X2"));
});

test("resetProjectionCounts 让额度归零", () => {
  resetProjectionCounts();
  const tool = { id: "t-reset", output: longOutput("R") };
  for (let i = 0; i <= FULL_SENDS; i++) projectToolResult(tool);
  assert.notEqual(projectToolResult(tool), tool.output, "额度应用完");
  resetProjectionCounts();
  assert.equal(projectToolResult(tool), tool.output, "重置后应重新发全文");
});

// ── ② NEEDS_PRO 自报升级 ──
test("NEEDS_PRO: 裸 marker 匹配", () => {
  assert.ok(NEEDS_PRO_RE.test("<<<NEEDS_PRO>>>"));
});

test("NEEDS_PRO: 带原因匹配", () => {
  const m = NEEDS_PRO_RE.exec("<<<NEEDS_PRO: 需要复杂数学推理>>>");
  assert.ok(m);
  assert.equal(m[1].trim(), "需要复杂数学推理");
});

test("NEEDS_PRO: 普通文本不匹配", () => {
  assert.ok(!NEEDS_PRO_RE.test("这是普通回复"));
  assert.ok(!NEEDS_PRO_RE.test("<<<NEEDS_PROX>>>"));
  assert.ok(!NEEDS_PRO_RE.test("  <<<NEEDS_PRO>>>")); // 必须首行（^锚定）
});

// ── ③ scavenge 工具调用捞回 ──
test("scavenge: 从思考里捞回合法工具调用", () => {
  const think = "我需要先看文件。{\"name\":\"read\",\"arguments\":{\"path\":\"a.txt\"}} 然后执行。";
  const seen = new Map();
  const r = scavengeToolCalls(think, TOOLS, seen);
  assert.equal(r.length, 1);
  assert.equal(r[0].name, "read");
  assert.deepEqual(r[0].args, { path: "a.txt" });
});

test("scavenge: function 嵌套格式也支持", () => {
  const think = '{"function":{"name":"bash","arguments":{"command":"ls"}}}';
  const r = scavengeToolCalls(think, TOOLS, new Map());
  assert.equal(r.length, 1);
  assert.equal(r[0].name, "bash");
});

test("scavenge: 工具名不合法跳过（防思考示例误捞）", () => {
  const think = '{"name":"hack_the_planet","arguments":{"x":1}}';
  const r = scavengeToolCalls(think, TOOLS, new Map());
  assert.equal(r.length, 0);
});

test("scavenge: 参数非对象跳过", () => {
  const think = '{"name":"bash","arguments":"not-an-object"}';
  const r = scavengeToolCalls(think, TOOLS, new Map());
  assert.equal(r.length, 0);
});

test("scavenge: 每轮每工具一次（防重复捞）", () => {
  const think = '{"name":"read","arguments":{"path":"a.txt"}} {"name":"read","arguments":{"path":"a.txt"}}';
  const seen = new Map();
  const r = scavengeToolCalls(think, TOOLS, seen);
  assert.equal(r.length, 1);
});

test("scavenge: 最多捞 3 个", () => {
  const think = '{"name":"bash","arguments":{"command":"a"}} {"name":"bash","arguments":{"command":"b"}} {"name":"bash","arguments":{"command":"c"}} {"name":"bash","arguments":{"command":"d"}}';
  const r = scavengeToolCalls(think, TOOLS, new Map());
  assert.ok(r.length <= 3);
});

test("scavenge: 空思考/无工具集返回空", () => {
  assert.equal(scavengeToolCalls("", TOOLS, new Map()).length, 0);
  assert.equal(scavengeToolCalls("anything", null, new Map()).length, 0);
});
