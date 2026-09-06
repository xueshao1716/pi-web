import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChatSse, summarizeBench, judgeReply } from "../../bench/engine-bench-lib.mjs";

test("SSE 解析只收 delta 正文，并记下本轮主驾", () => {
  const raw = [
    "event: note",
    'data: {"text":"本轮主引擎 · 元枢"}',
    "",
    "event: think",
    'data: {"text":"先想想"}',
    "",
    "event: delta",
    'data: {"text":"北"}',
    "",
    "event: delta",
    'data: {"text":"京"}',
    "",
    "event: tool",
    'data: {"name":"read"}',
    "",
    "event: done",
    "data: {}",
    "",
  ].join("\n");
  const r = parseChatSse(raw);
  assert.equal(r.text, "北京");
  assert.equal(r.lead, "yuanshu");
  assert.equal(r.toolSeen, true);
  assert.ok(r.firstCharAt >= 0);
});

test("pi 主驾 note 要识别，空正文不能当过", () => {
  const r = parseChatSse('event: note\ndata: {"text":"本轮主引擎 · pi"}\n\nevent: done\ndata: {}\n\n');
  assert.equal(r.lead, "pi");
  assert.equal(r.text, "");
  assert.equal(judgeReply("A2", ""), false);
  assert.equal(judgeReply("A2", "北京"), true);
});

test("汇总按引擎和题组出分数", () => {
  const s = summarizeBench([
    { engine: "yuanshu", group: "问答", pass: true, ms: 100, leadOk: true },
    { engine: "yuanshu", group: "问答", pass: false, ms: 200, leadOk: true },
    { engine: "pi", group: "问答", pass: true, ms: 50, leadOk: true },
    { engine: "pi", group: "问答", pass: true, ms: 150, leadOk: false },
  ]);
  assert.equal(s.yuanshu.passed, 1);
  assert.equal(s.yuanshu.total, 2);
  assert.equal(s.pi.passed, 1);
  assert.equal(s.pi.leadMismatch, 1);
  assert.equal(s.yuanshu.byGroup["问答"], "1/2");
});
