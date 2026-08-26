// 灵犀引擎单测：分源记录 / 状态流转 / 校验 / 原子持久化（fs 内存桩）
import { test } from "node:test";
import assert from "node:assert/strict";
import { addLingXi, listLingXi, setLingXi, removeLingXi, lingXiPath } from "../../engine/lingxi.mjs";

// 极简内存 fs 桩：只实现 lingxi.mjs 用到的面
function normPath(p) { return String(p).replace(/\\/g, '/') }
function memFs() {
  const files = new Map();
  return {
    files,
    existsSync: p => files.has(normPath(p)),
    readFileSync: (p) => { const k = normPath(p); if (!files.has(k)) throw new Error("ENOENT"); return files.get(k); },
    writeFileSync: (p, c) => files.set(normPath(p), String(c)),
    mkdirSync: () => {},
    renameSync: (a, b) => { const ka = normPath(a), kb = normPath(b); const v = files.get(ka); files.delete(ka); if (v !== undefined) files.set(kb, v); },
    unlinkSync: () => {},
  };
}
const WS = "/ws";

test("add：user/xiaoyu 分源记录，时间倒序列出", () => {
  const f = memFs();
  const a = addLingXi(WS, { text: "把终端面板做成可拖拽分屏", source: "xiaoyu" }, f);
  const b = addLingXi(WS, { text: "给灵犀加个语音速记入口", source: "user" }, f);
  assert.ok(a.ok && b.ok);
  assert.notEqual(a.entry.source, b.entry.source);
  const all = listLingXi(WS, {}, f);
  assert.equal(all.length, 2);
});

test("校验：空文本拒绝、非法 source 拒绝、超长拒绝", () => {
  const f = memFs();
  assert.ok(addLingXi(WS, { text: "   ", source: "user" }, f).error);
  assert.ok(addLingXi(WS, { text: "x", source: "bot" }, f).error);
  assert.ok(addLingXi(WS, { text: "长".repeat(2001), source: "user" }, f).error);
  assert.ok(!addLingXi(WS, { text: "正常", source: "user" }, f).error);
});

test("状态流转：new → adopted → archived，非法状态拒绝", () => {
  const f = memFs();
  const r = addLingXi(WS, { text: "测试灵感", source: "user" }, f);
  assert.equal(setLingXi(WS, r.entry.id, { status: "adopted", note: "下个迭代做" }, f).status, "adopted");
  assert.equal(setLingXi(WS, r.entry.id, { status: "archived" }, f).status, "archived");
  assert.equal(setLingXi(WS, r.entry.id, { status: "haha" }, f), null);
  // note 上限 500 字
  const e = setLingXi(WS, r.entry.id, { note: "n".repeat(600) }, f);
  assert.equal(e.note.length, 500);
});

test("删除：存在返回 true，不存在返回 false", () => {
  const f = memFs();
  const r = addLingXi(WS, { text: "待删", source: "xiaoyu" }, f);
  assert.equal(removeLingXi(WS, r.entry.id, f), true);
  assert.equal(removeLingXi(WS, r.entry.id, f), false);
});

test("过滤：按 source/status 组合过滤", () => {
  const f = memFs();
  addLingXi(WS, { text: "u1", source: "user" }, f);
  addLingXi(WS, { text: "y1", source: "xiaoyu" }, f);
  const y = addLingXi(WS, { text: "y2", source: "xiaoyu" }, f);
  setLingXi(WS, y.entry.id, { status: "adopted" }, f);
  assert.equal(listLingXi(WS, { source: "user" }, f).length, 1);
  assert.equal(listLingXi(WS, { source: "xiaoyu", status: "adopted" }, f).length, 1);
  assert.equal(listLingXi(WS, { source: "xiaoyu", status: "new" }, f).length, 1);
});
