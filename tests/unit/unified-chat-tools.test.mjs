// ===== unified-chat-tools.test.mjs —— 统一对话通道工具开关与参数修复单测 =====
// 背景（2026-08-31）：wawazz-claude（anthropic-messages）被 8-21 glm-5.3 补丁一刀切 noTools；
// 且 wawazz 中转返回的 tool_calls.arguments 带 "{}" 脏前缀（'{}{"path":...}'），JSON.parse 直接失败。
import { test } from "node:test";
import assert from "node:assert";
import { sanitizeToolCallList, repairToolArgs, modelAllowsTools } from "../../engine/unified-chat.mjs";

test("repairToolArgs：中转脏前缀修复", (t) => {
  t.test('"{}{...}" 拼接前缀 → 剥离为合法 JSON', () => {
    assert.equal(repairToolArgs('{}{"path": "/tmp/a.txt"}'), '{"path": "/tmp/a.txt"}');
    assert.deepEqual(JSON.parse(repairToolArgs('{}{"path": "/tmp/a.txt"}')), { path: "/tmp/a.txt" });
  });
  t.test("正常 JSON 原样保留", () => {
    assert.equal(repairToolArgs('{"a":1}'), '{"a":1}');
    assert.equal(repairToolArgs("{}"), "{}");
    assert.equal(repairToolArgs(""), "");
  });
  t.test("多重空对象前缀也能修", () => {
    assert.deepEqual(JSON.parse(repairToolArgs('{}{}{"x":2}')), { x: 2 });
  });
});

test("sanitizeToolCallList：arguments 经过脏前缀修复", () => {
  const out = sanitizeToolCallList([
    { id: "t1", function: { name: "read", arguments: '{}{"path": "/tmp/a.txt"}' } },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(JSON.parse(out[0].function.arguments), { path: "/tmp/a.txt" });
});

test("modelAllowsTools：工具开关判定", (t) => {
  t.test("anthropic-messages 默认不传 tools（glm-5.3 兼容保持）", () => {
    assert.equal(modelAllowsTools({ api: "anthropic-messages" }), false);
  });
  t.test("anthropic-messages + compat.supportsTools:true 显式开启（wawazz-claude）", () => {
    assert.equal(modelAllowsTools({ api: "anthropic-messages", compat: { supportsTools: true } }), true);
  });
  t.test("openai-completions 默认开启", () => {
    assert.equal(modelAllowsTools({ api: "openai-completions" }), true);
    assert.equal(modelAllowsTools({}), true);
    assert.equal(modelAllowsTools(null), true);
  });
  t.test("compat.supportsTools:false 一律关闭", () => {
    assert.equal(modelAllowsTools({ api: "openai-completions", compat: { supportsTools: false } }), false);
  });
});
