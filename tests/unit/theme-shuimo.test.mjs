// 水墨 / 竹影：色板、生成器、apply 必须同源挂上 data-theme
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "frontend", "src");
const read = (...parts) => readFileSync(join(SRC, ...parts), "utf8");

test("水墨竹影进入色板、种子、主题页，apply 写入 data-theme", () => {
  const palettes = read("theme", "palettes.ts");
  const generate = read("theme", "generate.mjs");
  const apply = read("theme", "apply.ts");
  const themes = read("pages", "Themes.tsx");
  const switcher = read("components", "ThemeSwitcher.tsx");
  for (const id of ["shuimo", "bamboo"]) {
    assert.ok(palettes.includes(`id: '${id}'`), `色板缺少 ${id}`);
    assert.ok(generate.includes(`${id}:`), `生成器缺少 ${id} 种子`);
    assert.ok(apply.includes(`'${id}'`), `applyThemeVars 必须给 ${id} 写 data-theme`);
  }
  assert.ok(themes.includes("label: '水墨'"), "主题页必须有水墨");
  assert.ok(themes.includes("label: '竹影'"), "主题页必须有竹影");
  assert.ok(switcher.includes("applyThemeVars"), "ThemeSwitcher 必须走 apply 同源，避免 data-theme 列表分叉");
});
