// Reasonix 机制单测（2026-08-19）：工具结果压缩 / NEEDS_PRO 自报升级 / scavenge 工具调用捞回
import { test } from "node:test";
import assert from "node:assert/strict";
import { shrinkToolResult, NEEDS_PRO_RE, scavengeToolCalls, TURN_END_RESULT_CAP } from "../../engine/reasonix-tools.mjs";

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
