// 自愈提示词不得写死本机 D:\\pi-web，仓库根从模块位置派生
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot } from "../../engine/self-heal.mjs";

const src = fs.readFileSync(new URL("../../engine/self-heal.mjs", import.meta.url), "utf8");

test("self-heal 源码不含硬编码 D:\\pi-web", () => {
  assert.ok(!src.includes("D:\\\\pi-web"), "提示词不得写死 D:\\\\pi-web");
  assert.ok(!src.includes("D:/pi-web"), "提示词不得写死 D:/pi-web");
  assert.ok(src.includes("repoRoot()"), "修复范围必须用 repoRoot()");
});

test("repoRoot 指向仓库根（self-heal 的上一级）", () => {
  const expected = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  assert.equal(path.resolve(repoRoot()), expected);
  assert.ok(fs.existsSync(path.join(repoRoot(), "server.mjs")));
});
