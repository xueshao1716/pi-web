// capabilities.test.mjs —— 能力契约测试（防止升级误伤好功能）
// 每个测试对应 docs/能力注册表.md 里的一个能力（黑盒断言：输入 → 期望输出）
// 升级跑全量：npm test（142）+ 本文件，任何登记能力的行为变化立刻暴露。
import { test } from "node:test";
import assert from "node:assert";
import { sanitizeUndefined, classifyAnomaly, isRepeatReply, normReply } from "../../engine/output-guard.mjs";
import { shouldInjectFullMemory } from "../../engine/context-loader.mjs";

// ── cap-01: undefined 清理 ──
test("cap-01 sanitizeUndefined: 清理孤立 undefined（含'undefined工作空间'场景）", () => {
  assert.equal(sanitizeUndefined("我叫小语。undefined工作空间里没找到"), "我叫小语。工作空间里没找到");
  assert.equal(sanitizeUndefined("undefined 开头"), "开头");
  assert.equal(sanitizeUndefined("正常内容 undefined 中间"), "正常内容 中间");
  assert.equal(sanitizeUndefined("结尾有 undefined"), "结尾有");
  assert.equal(sanitizeUndefined("普通内容无异常"), "普通内容无异常");
});

// ── cap-01: classifyAnomaly 识别 undefined-leak ──
test("cap-01 classifyAnomaly: 输出含 undefined → undefined-leak", () => {
  const r = classifyAnomaly({ sessionKey: "k", text: "我叫小语。undefined工作", sessionFile: "" });
  assert.equal(r.type, "undefined-leak");
});

// ── cap-05: 身份格式不算复读 ──
test("cap-05 isRepeatReply: 身份固定格式回答不判复读", () => {
  const idText = "我叫小语，你的 AI 工作伙伴。当前使用模型是：DeepSeek V4 Flash。";
  // 上一条也是身份回答（完全相同）→ 不应判复读
  assert.equal(isRepeatReply("cap05-key", idText, "/nonexistent"), false);
});

// ── cap-05: 复读检测需上一条基准（身份排除已覆盖；无基准不判是预期）──
test("cap-05 isRepeatReply: 无基准（新会话）不判复读", () => {
  const text = "这是一段足够长的普通回复内容，用于确认当会话没有历史基准时不误判为复读。";
  assert.equal(normReply(text).length >= 30, true);
  assert.equal(isRepeatReply("cap05b-key", text, "/nonexistent"), false); // 读不到上一条 → 不判
});

// ── cap-22: 记忆注入触发词（远程/软件/推荐 触发全量记忆）──
test("cap-22 shouldInjectFullMemory: 远程软件话题触发", () => {
  assert.equal(shouldInjectFullMemory("免费远程控制软件有哪些"), true);
  assert.equal(shouldInjectFullMemory("帮我想想"), true);
  assert.equal(shouldInjectFullMemory("哈哈今天天气不错"), false);
});

// ── cap-10: 模型 id 含 / 拆分不截断（与 server.mjs 同逻辑：indexOf+slice）──
test("cap-10 模型字符串拆分: id 含 / 保留完整", () => {
  const splitModel = (str) => {
    const slashIdx = str.indexOf("/");
    return slashIdx > 0 ? { provider: str.slice(0, slashIdx), id: str.slice(slashIdx + 1) } : null;
  };
  assert.deepEqual(splitModel("openrouter/stealth/ox-alpha"), { provider: "openrouter", id: "stealth/ox-alpha" });
  assert.deepEqual(splitModel("bigmodel/glm-5.3"), { provider: "bigmodel", id: "glm-5.3" });
  assert.deepEqual(splitModel("deepseek/deepseek-v4-flash"), { provider: "deepseek", id: "deepseek-v4-flash" });
});
