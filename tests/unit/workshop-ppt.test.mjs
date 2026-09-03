// PPT 工作室核心逻辑单测：slides 校验 / slides JSON 探测 / 历史记录（fs 内存桩）
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSlides, findSlidesJson, appendHistory, PPT_LAYOUTS } from "../../engine/workshop-ppt-core.mjs";

function normPath(p) { return String(p).replace(/\\/g, "/"); }
function memFs() {
  const files = new Map();
  return {
    files,
    existsSync: p => files.has(normPath(p)),
    readFileSync: p => { const k = normPath(p); if (!files.has(k)) throw new Error("ENOENT"); return files.get(k); },
    writeFileSync: (p, c) => files.set(normPath(p), String(c)),
    mkdirSync: () => {},
    renameSync: (a, b) => { const ka = normPath(a), kb = normPath(b); const v = files.get(ka); files.delete(ka); if (v !== undefined) files.set(kb, v); },
    readdirSync: dir => {
      const pre = normPath(dir).replace(/\/$/, "") + "/";
      const set = new Set();
      for (const k of files.keys()) { if (k.startsWith(pre)) set.add(k.slice(pre.length).split("/")[0]); }
      return [...set];
    },
    statSync: p => ({ isFile: () => files.has(normPath(p)) }),
  };
}

const OK_SLIDES = [
  { layout: "TitleSlide", title: "封面", content: [] },
  { layout: "BulletList", title: "要点页", content: ["要点一", "要点二"] },
];

test("validateSlides：合法通过", () => {
  const r = validateSlides(OK_SLIDES);
  assert.equal(r.ok, true);
});

test("validateSlides：非法形状全部拒绝", () => {
  assert.equal(validateSlides(null).ok, false);
  assert.equal(validateSlides("x").ok, false);
  assert.equal(validateSlides([]).ok, false, "空 slides");
  assert.equal(validateSlides([{ title: "t", content: [] }]).ok, false, "缺 layout");
  assert.equal(validateSlides([{ layout: "EvilLayout", title: "t", content: [] }]).ok, false, "layout 白名单外");
  assert.equal(validateSlides([{ layout: "TitleSlide", title: "", content: [] }]).ok, false, "title 空");
  assert.equal(validateSlides([{ layout: "TitleSlide", title: "t", content: "x" }]).ok, false, "content 非数组");
  assert.equal(validateSlides([{ layout: "TitleSlide", title: "t", content: [123] }]).ok, false, "要点非字符串");
  assert.equal(validateSlides(OK_SLIDES.slice(0, 1).concat(new Array(60).fill(OK_SLIDES[1]))).ok, false, "超页数上限");
});

test("PPT_LAYOUTS：与 generate_pptx.py 白名单一致", () => {
  assert.deepEqual([...PPT_LAYOUTS].sort(), [
    "BlankSlide", "BulletList", "ContentWithCaption", "SectionHeader", "TitleAndContent", "TitleSlide", "TwoColumnText",
  ].sort());
});

test("findSlidesJson：挑出含 slides 的 json，跳过其他", () => {
  const f = memFs();
  const dir = "/ws/workshop-out/ppt-x";
  f.files.set(normPath(dir + "/config.json"), JSON.stringify({ model: "gpt" }));
  f.files.set(normPath(dir + "/ppt_data.json"), JSON.stringify({ metadata: {}, slides: OK_SLIDES }));
  const hit = findSlidesJson(dir, f);
  assert.ok(hit && hit.endsWith("ppt_data.json"));
  assert.equal(findSlidesJson(dir, memFs()), null, "目录为空");
});

test("appendHistory：追加 + 最新在前 + 裁剪到 50 条", () => {
  const f = memFs();
  const p = "/ws/workshop-out/ppt-history.json";
  for (let i = 0; i < 55; i++) appendHistory(p, { id: "n" + i }, f);
  const d = JSON.parse(f.files.get(normPath(p)));
  assert.equal(d.entries.length, 50);
  assert.equal(d.entries[0].id, "n54", "最新在前");
  assert.equal(d.version, 1);
});
