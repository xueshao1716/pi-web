// ppt-html 路径：模板目录可配置；本地 HTML 白名单禁止前缀穿越
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePptHtmlTemplates, isInsideSafeHtmlDir } from "../../engine/ppt-html-paths.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("模板目录优先读 PPT_HTML_TEMPLATES，否则用 ~/.agents/skills/ppt-html/templates", () => {
  assert.equal(
    resolvePptHtmlTemplates({ env: { PPT_HTML_TEMPLATES: "D:/custom/templates" }, homedir: "C:/Users/nobody" }),
    path.resolve("D:/custom/templates"),
  );
  assert.equal(
    resolvePptHtmlTemplates({ env: {}, homedir: "C:/Users/nobody" }),
    path.join("C:/Users/nobody", ".agents", "skills", "ppt-html", "templates"),
  );
});

test("engine 里 ppt-html 模板路径不得写死本机用户目录", () => {
  for (const rel of ["engine/distill-theme.mjs", "engine/ppt-refine.mjs", "engine/workshop.mjs"]) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.ok(!src.includes("C:/Users/xuexiaofeng"), `${rel} 仍硬编码本机路径`);
    assert.ok(
      src.includes("resolvePptHtmlTemplates") || src.includes("readThemeCss"),
      `${rel} 必须走 ppt-html-paths`,
    );
  }
});

test("isInsideSafeHtmlDir：认 workshop-out/tmp 下的 html，拒绝前缀冒充和穿越", () => {
  const ws = path.join(os.tmpdir(), "pi-ws-safe");
  assert.equal(isInsideSafeHtmlDir(ws, "workshop-out/foo.html"), true);
  assert.equal(isInsideSafeHtmlDir(ws, "tmp/bar.html"), true);
  assert.equal(isInsideSafeHtmlDir(ws, "workshop-out-evil/x.html"), false);
  assert.equal(isInsideSafeHtmlDir(ws, "workshop-out/../secret.html"), false);
  assert.equal(isInsideSafeHtmlDir(ws, "engine/x.html"), false);
  assert.equal(isInsideSafeHtmlDir(ws, "workshop-out/x.css"), false);
});
