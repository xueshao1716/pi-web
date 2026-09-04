// distill-theme-core 单测：颜色解析/HSL/对比度 → 分类规则 → CSS 生成结构
import test from "node:test";
import assert from "node:assert/strict";
import { parseColor, toHex, hsl, contrast, extractTokens, classifyColors, buildThemeCss, slugify } from "../../engine/distill-theme-core.mjs";

test("颜色解析：hex3/hex8/rgb/hsl 与 HSL 往返", () => {
  assert.equal(toHex(parseColor("#4f8cff")), "#4F8CFF");
  assert.equal(toHex(parseColor("#4f8cff80")).slice(0, 7), "#4F8CFF");
  assert.equal(toHex(parseColor("rgb(79,140,255)")), "#4F8CFF");
  const p = parseColor("hsl(120,50%,40%)");
  const { h, s, l } = hsl(p);
  assert.ok(Math.abs(h - 120) < 2 && Math.abs(s - 0.5) < 0.02 && Math.abs(l - 0.4) < 0.02);
});

test("对比度：黑白 > 灰白", () => {
  const black = parseColor("#000000"), gray = parseColor("#888888"), white = parseColor("#FFFFFF");
  assert.ok(contrast(black, white) > contrast(gray, white));
});

test("extractTokens 收集 style 块与内联样式", () => {
  const html = `<html><head><style>
    body { background:#0B1F3A; color:#EAF2FF; font-family:"PingFang SC",sans-serif; }
    .btn { background:#4F8CFF; border-radius:14px; }
    .card { background:rgba(234,242,255,.06); border-radius:14px; font-family:Georgia,serif; }
  </style></head><body><div style="color:#D9B36C">x</div></body></html>`;
  const t = extractTokens(html);
  const keys = t.colors.map(c => c[0]);
  assert.ok(keys.includes("#0b1f3a") && keys.includes("#4f8cff") && keys.includes("#d9b36c"));
  assert.ok(t.fonts.length >= 2);
  assert.ok(t.radii.some(r => r[0] === "14px"));
});

test("classifyColors：暗底页面 → bg/fg 对比大，accent 高饱和", () => {
  const html = `<style>
    body { background:#0B1F3A; color:#EAF2FF; }
    .muted { color:rgba(234,242,255,.62); }
    .a { color:#4F8CFF; } .b { background:#4F8CFF; }
    .c { border-color:#D9B36C; } .btn { background:#4F8CFF; }
    .t2 { color:#D9B36C; }
  </style>`;
  const cls = classifyColors(extractTokens(html).colors);
  assert.equal(cls.bg, "#0B1F3A");
  assert.equal(cls.bgIsDark, true);
  assert.ok(contrast(parseColor(cls.fg), parseColor(cls.bg)) > 5, "fg 与 bg 对比度应大");
  assert.notEqual(cls.accent, cls.bg);
  assert.equal(cls.accent, "#4F8CFF");
});

test("classifyColors：空输入走安全默认", () => {
  const cls = classifyColors([]);
  assert.ok(cls.bg && cls.fg && cls.accent);
});

test("buildThemeCss：结构与 ppt-html 模板同构（作用域类/变量/版式类齐全）", () => {
  const css = buildThemeCss("stripe", "条纹蓝", { bg: "#0B1F3A", fg: "#EAF2FF", accent: "#635BFF", accent2: "#D9B36C", bgIsDark: true }, 'system-ui,"PingFang SC",sans-serif');
  for (const needle of ["body.theme-stripe", "--bg:", "--accent:", ".cover-title", ".big-num", ".sec-num", ".accent-bar", "radial-gradient"]) {
    assert.ok(css.includes(needle), `缺 ${needle}`);
  }
  assert.ok(!css.includes("${"), "不应残留模板占位");
});

test("slugify：域名/中文清洗", () => {
  assert.equal(slugify("stripe.com"), "stripe-com");
  assert.equal(slugify("蓝金商务"), "蓝金商务");
  assert.equal(slugify("!!!"), "distilled");
});
