import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDirectChatBody } from "../../engine/model-client.mjs";

test("关闭思考时请求带 thinking disabled，避免 GLM-5 先想半分钟", () => {
  const body = buildDirectChatBody({
    modelId: "glm-5.3-flash",
    messages: [{ role: "user", content: "hi" }],
    maxTokens: 1600,
    thinking: false,
  });
  assert.equal(body.model, "glm-5.3-flash");
  assert.equal(body.stream, false);
  assert.equal(body.max_tokens, 1600);
  assert.deepEqual(body.thinking, { type: "disabled" });
});

test("默认直调不塞 thinking 字段，聊天通道保持原样", () => {
  const body = buildDirectChatBody({
    modelId: "agnes-2.5-flash",
    messages: [],
    maxTokens: 8192,
  });
  assert.equal(body.thinking, undefined);
});
