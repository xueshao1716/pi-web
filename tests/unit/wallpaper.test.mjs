import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { wallpaperCssImage } from "../../frontend/src/theme/wallpaper.mjs";
import { initThemePrefs, loadThemePrefs, saveThemePrefs } from "../../engine/theme-prefs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");

test("渐变壁纸不能包进 url()，否则 CSS 非法、点预设等于没设", () => {
  const g = "linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 100%)";
  assert.equal(wallpaperCssImage(g), g);
  assert.ok(!wallpaperCssImage(g).startsWith("url("));
});

test("图片 URL / data URL 才包 url()", () => {
  assert.equal(wallpaperCssImage("https://ex.com/a.png"), 'url("https://ex.com/a.png")');
  assert.ok(wallpaperCssImage("data:image/png;base64,abc").startsWith("url("));
});

test("空壁纸返回空串", () => {
  assert.equal(wallpaperCssImage(""), "");
  assert.equal(wallpaperCssImage(null), "");
});

test("主题页和布局必须用共享壁纸函数，禁止一律 url(${wallpaper})", () => {
  const themes = read("frontend", "src", "pages", "Themes.tsx");
  const layout = read("frontend", "src", "AppLayout.tsx");
  assert.ok(themes.includes("persistWallpaper"), "Themes 必须 persistWallpaper（写本地并 apply）");
  assert.ok(layout.includes("applyWallpaper"), "AppLayout 必须走共享 applyWallpaper");
  assert.ok(!themes.includes("url(${wallpaper})"), "Themes 不得把渐变包进 url()");
  assert.ok(!layout.includes("url(${w})"), "AppLayout 不得把渐变包进 url()");
});

test("有壁纸时 CSS 必须让画布半透明，否则实底会把壁纸盖死", () => {
  const css = read("frontend", "src", "styles.css");
  assert.ok(css.includes("body.has-wallpaper"), "必须有 has-wallpaper 状态");
  assert.ok(css.includes("body.has-wallpaper .col-canvas"), "中栏画布必须让壁纸透出来");
});

test("只改主题/主色时不得把已保存的壁纸写成空", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-theme-prefs-"));
  try {
    initThemePrefs(join(dir, "theme-prefs.json"));
    saveThemePrefs({ theme: "mist", accent: "#5468ff", wallpaper: "linear-gradient(90deg,#000,#111)" });
    saveThemePrefs({ theme: "ink", accent: "#8b7cf6" });
    const after = loadThemePrefs();
    assert.equal(after.theme, "ink");
    assert.equal(after.wallpaper, "linear-gradient(90deg,#000,#111)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("显式传空壁纸才清除", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-theme-prefs-"));
  try {
    initThemePrefs(join(dir, "theme-prefs.json"));
    saveThemePrefs({ theme: "mist", wallpaper: "https://ex.com/a.png" });
    saveThemePrefs({ theme: "mist", wallpaper: "" });
    assert.equal(loadThemePrefs().wallpaper, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ThemeApi.save 不得把省略的 wallpaper 默认成空串写进请求体", () => {
  const api = read("frontend", "src", "api.ts");
  const block = api.split("export const ThemeApi")[1]?.split("export const ")[0] || "";
  assert.ok(block.includes("wallpaper !== undefined") || block.includes("wallpaper != null"), "未传 wallpaper 时不得写进 body");
  assert.ok(!block.includes("wallpaper: string = ''") && !block.includes('wallpaper: string = ""'), "不得默认 wallpaper 为空串");
});

test("ThemeSwitcher 拉服务端偏好必须应用壁纸", () => {
  const src = read("frontend", "src", "components", "ThemeSwitcher.tsx");
  assert.ok(src.includes("d.wallpaper"), "GET theme-prefs 的 wallpaper 必须落到本地并 apply");
});
