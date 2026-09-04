// workshop-novel 数据层单测：书架 CRUD + 防穿越（临时目录，不碰真实 novels/）
import { test, describe, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 每个用例独立临时目录
let tmp = "";
process.env.PI_NOVELS_DIR = "";
const mod = await import("../../engine/workshop-novel.mjs");
const src = fs.readFileSync(new URL("../../engine/workshop-novel.mjs", import.meta.url), "utf8");

test("novelsDir 不写死 D 盘路径，env 优先、否则工作空间/novels", () => {
  assert.ok(!src.includes("D:\\\\pi-workspace\\\\novels"), "不得硬编码 D:\\\\pi-workspace\\\\novels");
  assert.ok(!src.includes("D:/pi-workspace/novels"), "不得硬编码 D:/pi-workspace/novels");
  const custom = path.join(os.tmpdir(), "pi-novels-custom");
  const prev = process.env.PI_NOVELS_DIR;
  process.env.PI_NOVELS_DIR = custom;
  assert.equal(mod.novelsDir(), custom);
  if (prev === undefined) delete process.env.PI_NOVELS_DIR;
  else process.env.PI_NOVELS_DIR = prev;
  const viaRoot = mod.resolveNovelsDir({ env: {}, wsRoot: "E:\\ws" });
  assert.equal(viaRoot, path.join("E:\\ws", "novels"));
  const viaHome = mod.resolveNovelsDir({ env: {}, wsRoot: "" });
  assert.equal(viaHome, path.join(os.homedir(), "pi-workspace", "novels"));
});

describe("workshop-novel 数据层", () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novel-test-"));
    process.env.PI_NOVELS_DIR = tmp;
  });
  after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });

  test("createBook 建骨架（meta+truth+chapters）", () => {
    const r = mod.createBook({ title: "测试之书", genre: "scifi", protagonist: "陈默", setting: "末世废土", narrator: "第一人称" });
    assert.ok(r.ok && r.id);
    const bd = path.join(tmp, r.id);
    assert.ok(fs.existsSync(path.join(bd, "meta.json")));
    assert.ok(fs.existsSync(path.join(bd, "chapters")));
    for (const f of ["canon.md", "current_state.json", "pending_hooks.json", "chapter_summaries.json"]) {
      assert.ok(fs.existsSync(path.join(bd, "truth", f)), f);
    }
    const meta = JSON.parse(fs.readFileSync(path.join(bd, "meta.json"), "utf8"));
    assert.equal(meta.title, "测试之书");
    assert.equal(meta.narrator, "第一人称");
  });

  test("createBook 缺书名报错 / 非法题材回退 xianxia", () => {
    assert.ok(mod.createBook({ title: "" }).error);
    const r = mod.createBook({ title: "题材兜底", genre: "hacker" });
    assert.ok(r.ok);
    const meta = JSON.parse(fs.readFileSync(path.join(tmp, r.id, "meta.json"), "utf8"));
    assert.equal(meta.genre, "xianxia");
  });

  test("listBooks 按 createdAt 倒序、章节数正确", () => {
    mod.createBook({ title: "旧书" });
    const r2 = mod.createBook({ title: "新书" });
    // 给新书写一章
    fs.writeFileSync(path.join(tmp, r2.id, "chapters", "第001章.md"), "# 一", "utf8");
    const list = mod.listBooks();
    assert.equal(list.length, 2);
    assert.equal(list[0].title, "新书");
    assert.equal(list[0].chapters, 1);
    assert.equal(list[1].chapters, 0);
  });

  test("bookDetail 返回章节列表与 nextCh", () => {
    const r = mod.createBook({ title: "详情书" });
    const bd = path.join(tmp, r.id, "chapters");
    fs.writeFileSync(path.join(bd, "第001章.md"), "a", "utf8");
    fs.writeFileSync(path.join(bd, "第003章.md"), "b", "utf8"); // 故意跳号
    fs.writeFileSync(path.join(bd, "乱入.txt"), "c", "utf8");
    const d = mod.bookDetail(r.id);
    assert.equal(d.chapters.length, 2);
    assert.deepEqual(d.chapters.map(c => c.no), [1, 3]);
    assert.equal(d.nextCh, 4); // 取最大编号+1
    assert.ok(d.truth.canon.includes("硬事实"));
  });

  test("readChapter 读正文；非法 id/file 被拒（防穿越）", () => {
    const r = mod.createBook({ title: "阅读书" });
    fs.writeFileSync(path.join(tmp, r.id, "chapters", "第001章.md"), "正文内容", "utf8");
    const ok = mod.readChapter(r.id, "第001章.md");
    assert.equal(ok.content, "正文内容");
    // 目录穿越
    assert.ok(mod.readChapter("../etc", "第001章.md").error || !mod.readChapter("..\\..\\x", "第001章.md").ok);
    assert.ok(mod.readChapter(r.id, "../../../secret.md").error);
    assert.ok(mod.readChapter(r.id, "../../meta.json").error);
    assert.ok(mod.readBook === undefined); // 不存在的导出不应存在（防拼写漂移）
  });

  test("listBooks/bookDetail 对不存在目录返回空/错误，不抛异常", () => {
    process.env.PI_NOVELS_DIR = path.join(tmp, "不存在");
    assert.deepEqual(mod.listBooks(), []);
    assert.ok(mod.bookDetail("任何").error);
    process.env.PI_NOVELS_DIR = tmp;
  });
});
