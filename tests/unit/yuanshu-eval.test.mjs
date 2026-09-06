import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_CATALOG, describePair } from "../../engine/engine-pair.mjs";
import { runYuanshuEval, formatYuanshuEval } from "../../engine/yuanshu-eval.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("元枢评测绳必须出分数，不能再靠感觉说稳了", async () => {
  const r = await runYuanshuEval();
  assert.ok(r.total >= 12, `评测集太瘦：${r.total}`);
  assert.equal(r.failed, 0, `失败：${JSON.stringify(r.failures)}`);
  assert.equal(r.score, 1);
  assert.ok(r.byTag.stability?.total >= 3, "要量稳定性");
  assert.ok(r.byTag.protocol?.total >= 2, "要量工作协议");
  assert.ok(r.byTag.memory?.total >= 2, "要量记忆连续性");
  assert.ok(r.byTag.tools?.total >= 2, "要量工具轮");
  assert.match(formatYuanshuEval(r), /元枢评测 \d+\/\d+/);
});

test("目录不能再写没有评测绳；引擎页要看见分数", async () => {
  assert.ok(!ENGINE_CATALOG.yuanshu.cannot.some((s) => /没有独立评测绳/.test(s)));
  assert.ok(ENGINE_CATALOG.yuanshu.can.some((s) => /评测/.test(s)));
  const d = await describePair();
  assert.ok(d.eval && d.eval.total >= 12 && d.eval.score === 1, "pair 接口要带评测数字");
  const page = readFileSync(join(ROOT, "frontend", "src", "pages", "Engine.tsx"), "utf8");
  assert.ok(page.includes("eval") && (page.includes("评测") || page.includes("评测绳")), "引擎页要显示分数");
});
