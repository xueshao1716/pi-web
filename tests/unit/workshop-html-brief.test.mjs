import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  inferVerb,
  fillHtmlBrief,
  formatHtmlBriefBlock,
  lintDeckBrief,
} from "../../engine/workshop-html-brief.mjs";
import { fallbackExpand, expandWorkshopPrompt } from "../../engine/workshop-prompt-expand.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("inferVerb：主题句要抽出一个可验收的动词，闲聊也有兜底", () => {
  assert.equal(inferVerb("岩层下面还有苔藓和花"), "揭示");
  assert.equal(inferVerb("Q3 产品复盘对照去年"), "对照");
  assert.ok(/^[\u4e00-\u9fff]{2,8}$/.test(inferVerb("嗯")), "空主题也要给默认动词");
});

test("fillHtmlBrief：六项齐全，技术栈必须是自包含 HTML 不能抄 Tailwind", () => {
  const b = fillHtmlBrief({ theme: "Q3 产品复盘", pages: 8, themeKey: "navy" });
  for (const k of ["scope", "structure", "material", "verb", "stack", "accept"]) {
    assert.ok(String(b[k] || "").trim(), `缺 ${k}`);
  }
  assert.match(b.verb, /^[\u4e00-\u9fff]{2,8}$/);
  assert.match(b.stack, /自包含|零 CDN|零外链/);
  assert.ok(!/Tailwind|Inter/.test(b.stack) || /禁止/.test(b.stack), "栈里若提到 Tailwind/Inter 必须是禁止");
  assert.match(b.accept, new RegExp(b.verb));
});

test("formatHtmlBriefBlock 必须点名动词，生成提示才能检查", () => {
  const block = formatHtmlBriefBlock(fillHtmlBrief({ theme: "岩层", verb: "揭示" }));
  assert.match(block, /动词/);
  assert.match(block, /揭示/);
  assert.match(block, /范围|结构|材质|技术栈|验收/);
});

test("html 扩写走六项 brief，不能交空白", async () => {
  const fb = fallbackExpand("html", "Q3 产品复盘汇报");
  assert.match(fb.prompt, /复盘/);
  assert.match(fb.fields.verb, /^[\u4e00-\u9fff]{2,8}$/);
  const r = await expandWorkshopPrompt({
    kind: "html",
    idea: "岩层下的花",
    chat: async () => ({ text: "nope" }),
  });
  assert.equal(r.source, "fallback");
  assert.equal(r.kind, "html");
  assert.ok(r.fields.verb);
});

test("deck.json 缺动词要记 warn，旧作品不当 error", () => {
  const miss = lintDeckBrief({ slides: [] });
  assert.ok(miss.some((i) => i.rule === "verb" && i.severity === "warn"));
  const ok = lintDeckBrief({ verb: "对照", slides: [] });
  assert.equal(ok.length, 0);
});

test("ppt-html 执行提示和技能必须吃 brief，表单能填动词", () => {
  const ws = readFileSync(join(ROOT, "engine", "workshop.mjs"), "utf8");
  assert.ok(ws.includes("formatHtmlBriefBlock") || ws.includes("fillHtmlBrief"), "生成设计稿必须灌 brief");
  assert.ok(ws.includes("verb"), "请求体要接动词");
  const view = readFileSync(join(ROOT, "frontend", "src", "components", "WorkshopView.tsx"), "utf8");
  assert.ok(view.includes("verb"), "表单要有动词");
  assert.ok(view.includes("PromptSmartFill") || view.includes("智能填充"), "设计稿也要能一句话扩写");
  const skill = readFileSync(join(process.env.USERPROFILE || process.env.HOME || "", ".agents", "skills", "ppt-html", "SKILL.md"), "utf8");
  assert.match(skill, /动词/);
  assert.match(skill, /零外部依赖|零 CDN|禁止 CDN/);
});
