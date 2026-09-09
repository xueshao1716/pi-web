// ===== unified-chat-tools.test.mjs —— 统一对话通道工具开关与参数修复单测 =====
// 背景（2026-08-31）：wawazz-claude（anthropic-messages）被 8-21 glm-5.3 补丁一刀切 noTools；
// 且 wawazz 中转返回的 tool_calls.arguments 带 "{}" 脏前缀（'{}{"path":...}'），JSON.parse 直接失败。
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeToolCallList, repairToolArgs, modelAllowsTools, createRunHistorySnapshot, restoreRunHistorySnapshot } from "../../engine/unified-chat.mjs";

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

test("运行历史快照：保留系统提示与工具尾部，恢复时不重复追加用户消息", () => {
  const history = [
    { role: "system", content: "系统规则" },
    { role: "user", content: "需求" },
    { role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "read", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "t1", content: "完成" },
  ];
  const snapshot = createRunHistorySnapshot(history, { turn: 2, maxMessages: 4 });
  assert.equal(snapshot.v, 1);
  assert.equal(snapshot.turn, 2);
  assert.deepEqual(restoreRunHistorySnapshot(snapshot), history);
  assert.ok(JSON.stringify(snapshot).length < 10_000);
});

test("恢复后的备用模型不得重新携带旧快照", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const source = readFileSync(join(root, "engine", "unified-chat.mjs"), "utf8");
  assert.match(source, /chatOpts\.resumeToolPlan = null;\s*chatOpts\.resumeSnapshot = null;\s*chatOpts\.resumeCheckpointKind = null/);
  assert.match(source, /resumeSnapshot: null, resumeCheckpointKind: null, resumeToolPlan: null/);
});
