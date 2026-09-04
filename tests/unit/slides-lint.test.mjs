// slides-lint 单测：8 条规则逐条触发 + 好页面零告警 + deck 汇总
import test from "node:test";
import assert from "node:assert/strict";
import { lintPage, lintDeck, contrastHex } from "../../engine/slides-lint-core.mjs";

const theme = ":root,body.theme-x{--bg:#0B1F3A;--fg:#EAF2FF;--accent:#4F8CFF;}";

function page(extra = "") {
  return `<html><head><style>body{width:1280px;height:720px;}
  .cover-title{font-size:88px;font-weight:700} .page-title{font-size:44px}
  .body{font-size:16px} .cap{font-size:14px} .num{font-size:104px} .sec{font-size:220px}
  ${extra}</style></head><body><div class="slide" data-field="t">标题<span data-field="s">副</span></div></body></html>`;
}

test("好页面：零 error", () => {
  const r = lintPage(page(), theme);
  assert.equal(r.filter(i => i.severity === "error").length, 0, JSON.stringify(r));
});

test("R7 缺画布 / R6 外链资源", () => {
  const bad = "<html><style>.t{font-size:16px}</style><body><img src=\"https://cdn.example.com/x.png\"></body></html>";
  const rules = lintPage(bad, theme).map(i => i.rule);
  assert.ok(rules.includes("canvas"), "应报缺画布");
  assert.ok(rules.includes("external"), "应报外链");
  assert.ok(rules.some(i => i === "external" && lintPage(bad, theme).find(x => x.rule === "external").severity === "error"));
});

test("R1 小字号 + R8 标题过小", () => {
  const bad = page(".tiny{font-size:11px} .page-title{font-size:24px}");
  const r = lintPage(bad, theme);
  assert.ok(r.some(i => i.rule === "min-font"));
  assert.ok(r.some(i => i.rule === "title-size"));
});

test("R2 阶梯混乱：相邻差 <8% 的对超限", () => {
  const bad = page(".a{font-size:16px}.b{font-size:17px}.c{font-size:18px}.d{font-size:19px}.e{font-size:44px}.f{font-size:88px}");
  assert.ok(lintPage(bad, theme).some(i => i.rule === "ladder"));
});

test("R4 要点超载 + R5 无 data-field", () => {
  const bad = `<style>body{width:1280px;height:720px}.p{font-size:16px}</style><ul>${"<li>要点</li>".repeat(9)}</ul>`;
  const r = lintPage(bad, theme);
  assert.ok(r.some(i => i.rule === "bullets"));
  assert.ok(r.some(i => i.rule === "data-field"));
});

test("R3 对比度：低对比主题报 error", () => {
  const lowTheme = ":root{--bg:#777777;--fg:#888888;--accent:#4F8CFF;}";
  const r = lintPage(page(), lowTheme);
  const c = r.find(i => i.rule === "contrast" && i.severity === "error");
  assert.ok(c, "fg/bg 对比 1.16 应报 error");
});

test("contrastHex 黑白≈21，同色=1", () => {
  assert.ok(contrastHex("#000000", "#FFFFFF") > 20);
  assert.equal(contrastHex("#123456", "#123456"), 1);
});

test("lintDeck 汇总：errors 聚合与 ok 判定", () => {
  const good = page();
  const bad = "<html><style>.t{font-size:16px}</style><body><script src=\"https://x.com/a.js\"></script></body></html>";
  const r = lintDeck([{ file: "pages/a.html", html: good }, { file: "pages/b.html", html: bad }], theme);
  assert.equal(Object.keys(r.perPage).length, 2);
  assert.ok(r.errors >= 2, "bad 页至少画布+外链两个 error");
  assert.equal(r.ok, false);
});
