// 模型路由层单测（2026-08-19 拆模块；08-20 健康冷却泛化 + 千问下架链路更新验证）
import { test } from "node:test";
import assert from "node:assert/strict";
import { initModelRouter, classifyTaskComplexity, routeForAuto, routeProCandidate, isAutoModel, isOcGoBlocked, markOcGoBlocked, ocGoCandidate, pickFallbackDefault, markModelBlocked, isModelBlocked, resetModelHealth, pickFallbackExcluding } from "../../engine/model-router.mjs";

// 构造假模型池（2026-08-20 链路：商汤主力 / nvidia 换 llama / 千问已下架移除）
const makePool = () => [
  { provider: "sensenova", id: "sensenova-6.7-flash-lite" },
  { provider: "xiaomi-token-plan-cn", id: "mimo-v2.5" },
  { provider: "xiaomi-token-plan-cn", id: "mimo-v2.5-pro" },
  { provider: "opencode-go", id: "deepseek-v4-flash" },
  { provider: "opencode-go", id: "deepseek-v4-pro" },
  { provider: "volces-ark", id: "ark-code-latest" },
  { provider: "nvidia", id: "meta/llama-3.1-8b-instruct" },
];
let pool = makePool();
let def = pool[0];
initModelRouter({ getModelList: () => pool, getDefaultModel: () => def, configModel: "" });

// ── 复杂度分类 ──
test("分类: 简单问候 → simple", () => {
  assert.equal(classifyTaskComplexity("你好").level, "simple");
  assert.equal(classifyTaskComplexity("谢谢").level, "simple");
});
test("分类: 复杂编码任务 → complex", () => {
  const r = classifyTaskComplexity("请帮我重构整个项目的架构，设计跨模块的缓存策略，并编写单元测试和集成测试。这是一个代码库级的改造，需要逐步分析、深入研究和详细说明。");
  assert.equal(r.level, "complex");
  assert.ok(r.score >= 3);
});

// ── pro ≠ flash（假升级是 bug）──
test("路由修正: 复杂任务 pro 与简单任务 flash 是不同模型", () => {
  const complex = routeForAuto("请重构整个项目的架构，设计跨模块缓存策略，编写单元测试，代码库级改造，详细分析研究部署集成");
  const simple = routeForAuto("你好");
  assert.ok(complex.model, "复杂任务应有模型");
  assert.ok(simple.model, "简单任务应有模型");
  const proId = `${complex.model.provider}/${complex.model.id}`;
  const flashId = `${simple.model.provider}/${simple.model.id}`;
  console.log(`  [路由] complex→${proId} | simple→${flashId}`);
  assert.notEqual(proId, flashId, "pro 与 flash 必须是不同模型");
});

// ── 429 交互 ──
test("429 标记: ocGo 被隔离后 pro 候选回落", () => {
  markOcGoBlocked("test 429");
  assert.equal(isOcGoBlocked(), true);
  assert.equal(ocGoCandidate(/deepseek-v4-pro/i), undefined, "ocGo 应被隔离");
  const pro = routeProCandidate();
  assert.ok(pro, "应有 pro 候选");
  assert.notEqual(pro.provider, "opencode-go", "429 期间 pro 不该是 ocGo");
  console.log(`  [429] pro 候选→${pro.provider}/${pro.id}`);
});

test("isAutoModel: auto 识别", () => {
  assert.equal(isAutoModel({ provider: "auto", id: "auto" }), true);
  assert.equal(isAutoModel({ provider: "sensenova", id: "sensenova-6.7-flash-lite" }), false);
});

// ── 通用健康冷却（2026-08-20）──
test("健康冷却: 商汤主力 403 → flash 自动绕开，落到下一顺位", () => {
  resetModelHealth();
  const st = pool[0];
  markModelBlocked(st, { reason: "HTTP 403 Access denied" });
  assert.equal(isModelBlocked(st), true);
  const r = routeForAuto("你好");
  const chosen = `${r.model.provider}/${r.model.id}`;
  console.log(`  [403] 商汤冷却后 simple→${chosen}`);
  assert.notEqual(chosen, "sensenova/sensenova-6.7-flash-lite", "403 的商汤应被绕开");
  assert.equal(chosen, "opencode-go/deepseek-v4-flash", "落到免费链下一顺位 ocGo flash");
});

test("健康冷却: pro 链同样过滤冷却模型", () => {
  markOcGoBlocked("test"); // ocGo 整体冷却
  const ark = pool.find((m) => m.provider === "volces-ark");
  markModelBlocked(ark, { reason: "HTTP 429" });
  const pro = routeProCandidate(); // ocGo 冷却 + ark 冷却 → 无 pro 可用
  assert.equal(pro, undefined, "ocGo 429 + ark 冷却 → 无 pro 可用");
});

test("排除兜底: pickFallbackExcluding 绝不返回被排除的模型", () => {
  const excl = pool.find((m) => m.provider === "sensenova");
  const fb = pickFallbackExcluding(excl);
  if (fb) assert.notEqual(`${fb.provider}/${fb.id}`, "sensenova/sensenova-6.7-flash-lite", "兜底不可回到被排除模型");
});

test("健康冷却: resetModelHealth 清零后商汤恢复主力", () => {
  resetModelHealth();
  assert.equal(isModelBlocked(pool[0]), false);
  const r = routeForAuto("你好");
  assert.equal(`${r.model.provider}/${r.model.id}`, "sensenova/sensenova-6.7-flash-lite");
});
