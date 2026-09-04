// gallery-core 单测：扫描收录 / 倒序 / 空目录跳过 / 路径穿越拒绝 / readDeck 全页内容
import test from "node:test";
import assert from "node:assert/strict";
import { scanGallery, readDeck } from "../../engine/gallery-core.mjs";

function memFs(files) {
  return {
    existsSync: (p) => { const k = norm(p); return files[k] != null || Object.keys(files).some(x => x.startsWith(k + "/")); },
    statSync: (p) => ({ mtimeMs: files[norm(p)]?.mtime ?? 0, isDirectory: () => false }),
    readdirSync: (p, opt) => {
      const key = norm(p);
      if (opt?.withFileTypes) {
        const dirs = new Set(Object.keys(files).filter(k => k.startsWith(key + "/")).map(k => k.slice(key.length + 1).split("/")[0]));
        return [...dirs].map(n => ({ name: n, isDirectory: () => true }));
      }
      const set = new Set(Object.keys(files).filter(k => k.startsWith(key + "/")).map(k => k.slice(key.length + 1).split("/")[0]));
      return [...set];
    },
    readFileSync: (p) => { const f = files[norm(p)]; if (f == null) throw new Error("nofile"); return typeof f === "string" ? f : f.data; },
  };
}
const norm = (p) => String(p).replace(/\\/g, "/").replace(/^([A-Za-z]:)?\/?/, "");

test("scanGallery 收录 deck 与 pptx，按时间倒序", () => {
  const out = "ws/workshop-out";
  const f = memFs({
    [`${out}/ppthtml-aaa/deck.json`]: JSON.stringify({ metadata: { title: "π 的奇妙世界", themeKey: "navy" }, slides: [{ file: "pages/page-01.html" }, { file: "pages/page-02.html" }] }),
    [`${out}/ppthtml-aaa/pages/page-01.html`]: "<h1>π 的奇妙世界</h1>",
    [`${out}/ppthtml-aaa/pages/page-02.html`]: "<h2>第 2 页</h2>",
    [`${out}/ppthtml-bbb/pages/page-01.html`]: "<h1>无清单作品</h1>", // deck.json 缺失，兜底扫 pages
    [`${out}/ppthtml-bbb`]: { mtime: 999 }, // 目录本身带 mtime
    [`${out}/ppt-old/presentation.pptx`]: "binary",
    [`${out}/ppt-empty/other.txt`]: "x", // 无 pptx 不收录
    [`${out}/ppthtml-hollow/pages/`]: "", // 目录占位（无 html）
  });
  const items = scanGallery(out, f);
  assert.equal(items.length, 3);
  assert.equal(items[0].id, "ppthtml-bbb"); // mtime 999 最新
  assert.equal(items[0].kind, "deck");
  assert.equal(items[0].pages, 1);
  assert.equal(items[0].title, "无清单作品");
  assert.equal(items.find(i => i.id === "ppthtml-aaa").pages, 2);
  assert.equal(items.find(i => i.id === "ppt-old").kind, "pptx");
});

test("readDeck 返回全部页面内容；路径穿越/越界被拒", () => {
  const out = "ws/workshop-out";
  const f = memFs({
    [`${out}/ppthtml-aaa/deck.json`]: JSON.stringify({ slides: [{ file: "pages/page-01.html", title: "封面", layout: "cover" }] }),
    [`${out}/ppthtml-aaa/pages/page-01.html`]: "<body class='theme-navy'>x</body>",
  });
  const ok = readDeck(out, "workshop-out/ppthtml-aaa", f);
  assert.equal(ok.pages.length, 1);
  assert.equal(ok.pages[0].title, "封面");
  assert.ok(ok.pages[0].html.includes("theme-navy"));
  assert.equal(readDeck(out, "workshop-out/../evil", f), null, "穿越拒绝");
  assert.equal(readDeck(out, "somewhere-else/ppthtml-aaa", f), null, "越出 outRoot 拒绝");
  assert.equal(readDeck(out, "workshop-out/不存在", f), null);
});

test("readDeck 宽容解析：deck.json 的 file 不带 pages/ 前缀也能找到", () => {
  const out = "ws/workshop-out";
  const f = memFs({
    [`${out}/ppthtml-ccc/deck.json`]: JSON.stringify({ slides: [{ file: "page-01.html", title: "封面" }] }),
    [`${out}/ppthtml-ccc/pages/page-01.html`]: "<body>real</body>",
  });
  const r = readDeck(out, "workshop-out/ppthtml-ccc", f);
  assert.ok(r, "应解析成功");
  assert.equal(r.pages[0].file, "pages/page-01.html");
  assert.ok(r.pages[0].html.includes("real"));
});
