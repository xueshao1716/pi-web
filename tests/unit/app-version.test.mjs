import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("APP_VERSION 与 CHANGELOG 最新一条一致，且能从仓库根读到日志", () => {
  const src = fs.readFileSync(path.join(ROOT, "engine", "unified-chat.mjs"), "utf8");
  const cl = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
  const ver = src.match(/APP_VERSION = "([^"]+)"/)[1];
  assert.ok(cl.includes(`## [${ver}]`), `CHANGELOG 必须有 ## [${ver}]`);
  assert.ok(src.includes('path.join(import.meta.dirname, "..", "CHANGELOG.md")'), "看板必须读仓库根 CHANGELOG.md");
});
