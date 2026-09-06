import test from "node:test";
import assert from "node:assert/strict";
import { readSubscriptionText } from "../../engine/subscription-reminder.mjs";

test("目录占用订阅追踪路径时不尝试读取并返回空文本", () => {
  const calls = [];
  const fakeFs = {
    existsSync: () => true,
    statSync: () => ({ isFile: () => false }),
    readFileSync: () => { calls.push("read"); return "unexpected"; },
  };

  assert.equal(readSubscriptionText("D:/workspace/文档/平台订阅费用追踪.md", fakeFs), "");
  assert.deepEqual(calls, []);
});
