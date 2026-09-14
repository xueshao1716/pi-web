// 文件写队列（engine/file-lock.mjs）
//
// 这里要澄清一个我一开始搞错的前提：元枢自己的 edit 是 `readFileSync → replace →
// writeFileSync`，中间没有 await，**单线程下本来就原子**——实测并发两次 edit 两个改动都在。
// 真正存在的窗口在**跨实现**：Pi 的 edit 用 fs/promises，读写之间有真 await，
// 而它有自己的一套 withFileMutationQueue、元枢什么都没有，两套互不相通。
// 所以正确做法是共用 Pi 那把队列，而不是另造一把。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  initFileLock, withFileLock, canonicalFilePath, usingSharedFileQueue, activeFileLockCount,
} from "../../engine/file-lock.mjs";
import { createUnifiedToolExecutor } from "../../engine/tools/unified-tools.mjs";
import { safeJoin } from "../../engine/tools/security.mjs";
import { CONFIG } from "../../config.mjs";

function tmpdir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `yuanshu-lock-${tag}-`));
}

/** 取 Pi 的共享队列；拿不到就返回 null（本机没装 Pi 时测试跳过）。 */
async function piQueue() {
  try {
    if (!CONFIG.piPackage) return null;
    const mod = await import(pathToFileURL(CONFIG.piPackage).href);
    return typeof mod.withFileMutationQueue === "function" ? mod.withFileMutationQueue : null;
  } catch { return null; }
}

// ── canonicalFilePath ──
test("canonicalFilePath：归一化 . 与 ..，且不抛异常", () => {
  const dir = tmpdir("canon");
  try {
    const f = path.join(dir, "a.txt");
    fs.writeFileSync(f, "x");
    assert.equal(canonicalFilePath(path.join(dir, ".", "a.txt")), canonicalFilePath(f));
    assert.equal(canonicalFilePath(path.join(dir, "sub", "..", "a.txt")), canonicalFilePath(f));
    assert.equal(canonicalFilePath(""), path.resolve(""));
    assert.equal(canonicalFilePath(null), path.resolve(""));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("canonicalFilePath：符号链接与真实路径落到同一个键", t => {
  const dir = tmpdir("symlink");
  try {
    const real = path.join(dir, "real");
    fs.mkdirSync(real);
    fs.writeFileSync(path.join(real, "f.txt"), "x");
    let link = path.join(dir, "link");
    try { fs.symlinkSync(real, link, "junction"); }
    catch { t.skip("本机不允许创建符号链接（需要开发者模式）"); return; }
    assert.equal(
      canonicalFilePath(path.join(link, "f.txt")),
      canonicalFilePath(path.join(real, "f.txt")),
      "通过符号链接访问必须与真实路径共用一把锁",
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("canonicalFilePath：文件还不存在时，向上找最近存在的祖先做 realpath", t => {
  const dir = tmpdir("missing");
  try {
    const real = path.join(dir, "real");
    fs.mkdirSync(real);
    let link = path.join(dir, "link");
    try { fs.symlinkSync(real, link, "junction"); }
    catch { t.skip("本机不允许创建符号链接（需要开发者模式）"); return; }
    // 目标文件尚不存在（write 会创建它）
    assert.equal(
      canonicalFilePath(path.join(link, "new.txt")),
      canonicalFilePath(path.join(real, "new.txt")),
      "不存在的文件也要穿过符号链接指向同一个键，否则 write 会绕过锁",
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── 自带队列（Pi 队列不可用时的退路）──
test("自带队列：同一路径串行，不交错", async () => {
  initFileLock({});
  assert.equal(usingSharedFileQueue(), false, "未注入时应走自带实现");
  const dir = tmpdir("serial");
  try {
    const f = path.join(dir, "f.txt");
    const order = [];
    await Promise.all([
      withFileLock(f, async () => { order.push("a-start"); await new Promise(r => setImmediate(r)); order.push("a-end"); }),
      withFileLock(f, async () => { order.push("b-start"); order.push("b-end"); }),
    ]);
    assert.deepEqual(order, ["a-start", "a-end", "b-start", "b-end"], "第二个必须等第一个结束");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("自带队列：不同路径并行，互不阻塞", async () => {
  initFileLock({});
  const dir = tmpdir("parallel");
  try {
    const order = [];
    await Promise.all([
      withFileLock(path.join(dir, "a.txt"), async () => { order.push("a-start"); await new Promise(r => setTimeout(r, 20)); order.push("a-end"); }),
      withFileLock(path.join(dir, "b.txt"), async () => { order.push("b-start"); order.push("b-end"); }),
    ]);
    assert.deepEqual(order, ["a-start", "b-start", "b-end", "a-end"], "不同文件不该互相排队");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("自带队列：抛异常也要释放，且队列自清理", async () => {
  initFileLock({});
  const dir = tmpdir("throw");
  try {
    const f = path.join(dir, "f.txt");
    await assert.rejects(() => withFileLock(f, async () => { throw new Error("boom"); }), /boom/);
    // 释放了才会走到这里
    const r = await withFileLock(f, async () => "after");
    assert.equal(r, "after", "抛异常后锁必须释放");
    assert.equal(activeFileLockCount(), 0, "队列必须自清理，不能长跑泄漏");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── 委托给 Pi 的共享队列 ──
test("注入 Pi 队列后走共享实现；传非函数安全退回", async () => {
  const calls = [];
  initFileLock({ withFileMutationQueue: async (p, fn) => { calls.push(p); return fn(); } });
  assert.equal(usingSharedFileQueue(), true);
  await withFileLock("/x/y.txt", async () => "ok");
  assert.deepEqual(calls, ["/x/y.txt"], "必须委托给注入的队列");
  initFileLock({ withFileMutationQueue: 42 });
  assert.equal(usingSharedFileQueue(), false, "非函数必须被忽略而不是崩");
  initFileLock({});
});

// ── 关键：跨实现交错 ──
// 时序要用门控钉死，否则证明不了任何东西：先让 Pi 风格变更**读完**并挂在 await 上，
// 再让元枢 edit 进来。只有这时"共用队列"才有话可说。
async function crossEngineRace({ shareQueue, shared, dir, file, exec }) {
  fs.writeFileSync(file, "A\nB\n");
  let readDone;
  const readGate = new Promise(r => { readDone = r; });
  const piStyleMutation = () => shared(file, async () => {
    const c = fs.readFileSync(file, "utf8");   // ← 先读
    readDone();
    await new Promise(r => setTimeout(r, 40)); // ← 交错窗口（Pi 的 edit 就是 await read/write）
    fs.writeFileSync(file, c.replace("B", "B1")); // ← 用陈旧内容写回
  });
  const mutation = piStyleMutation();
  await readGate;                    // 确保 Pi 那侧已经读过
  const editResult = await exec("edit", { path: "f.txt", oldText: "A", newText: "A1" });
  await mutation;
  return { editResult, final: fs.readFileSync(file, "utf8") };
}

test("共用 Pi 队列时，元枢 edit 与 Pi 风格的异步变更不会互相覆盖", async t => {
  const shared = await piQueue();
  if (!shared) { t.skip("本机拿不到 Pi 的 withFileMutationQueue"); return; }
  initFileLock({ withFileMutationQueue: shared });
  assert.equal(usingSharedFileQueue(), true);

  const dir = tmpdir("shared");
  t.after(() => { fs.rmSync(dir, { recursive: true, force: true }); initFileLock({}); });
  const file = path.join(dir, "f.txt");
  const exec = createUnifiedToolExecutor({ cwd: () => dir, safePath: p => safeJoin(dir, p) });

  const { editResult, final } = await crossEngineRace({ shareQueue: true, shared, dir, file, exec });
  assert.equal(editResult.isError, false, `元枢 edit 应成功: ${editResult.text}`);
  assert.equal(final, "A1\nB1\n", `两个改动都必须保留（共用队列的意义），实际: ${JSON.stringify(final)}`);
});

test("未共用队列时，同样的交错确实会丢改动（证明共用不是多此一举）", async t => {
  const shared = await piQueue();
  if (!shared) { t.skip("本机拿不到 Pi 的 withFileMutationQueue"); return; }
  // 故意不注入：元枢走自带队列，Pi 风格变更走 Pi 的队列 → 两把互不相通的锁
  initFileLock({});

  const dir = tmpdir("noshare");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "f.txt");
  const exec = createUnifiedToolExecutor({ cwd: () => dir, safePath: p => safeJoin(dir, p) });

  const { final } = await crossEngineRace({ shareQueue: false, shared, dir, file, exec });
  assert.equal(final, "A\nB1\n", `两把独立的锁挡不住跨实现交错，A1 应被覆盖，实际: ${JSON.stringify(final)}`);
});

// ── executor 侧的行为 ──
test("edit：oldText 对不上当前内容时如实失败，绝不盲写", async () => {
  initFileLock({});
  const dir = tmpdir("stale");
  try {
    const file = path.join(dir, "f.txt");
    fs.writeFileSync(file, "X\nB\n");   // 文件已被（外部/另一次修改）改过
    const exec = createUnifiedToolExecutor({ cwd: () => dir, safePath: p => safeJoin(dir, p) });
    const r = await exec("edit", { path: "f.txt", oldText: "A", newText: "A1" });
    assert.equal(r.isError, true, "oldText 不存在时必须失败");
    assert.match(r.text, /未找到 oldText/);
    assert.equal(fs.readFileSync(file, "utf8"), "X\nB\n", "失败时绝不能改动文件");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("edit：锁内重读，不会拿锁外的陈旧内容去替换", async () => {
  initFileLock({});
  const dir = tmpdir("reread");
  try {
    const file = path.join(dir, "f.txt");
    fs.writeFileSync(file, "A\nB\n");
    const exec = createUnifiedToolExecutor({ cwd: () => dir, safePath: p => safeJoin(dir, p) });
    // 先排队一次会改动文件的锁内操作，再让 edit 进入——edit 必须在锁内读到最新内容
    await withFileLock(file, async () => { fs.writeFileSync(file, "A\nB2\n"); });
    const r = await exec("edit", { path: "f.txt", oldText: "B2", newText: "B3" });
    assert.equal(r.isError, false, `应基于锁内重读到的最新内容修改: ${r.text}`);
    assert.equal(fs.readFileSync(file, "utf8"), "A\nB3\n");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("write：与 edit 共用同一把锁，写不会被读-改-写穿插", async () => {
  initFileLock({});
  const dir = tmpdir("write");
  try {
    const file = path.join(dir, "f.txt");
    const exec = createUnifiedToolExecutor({ cwd: () => dir, safePath: p => safeJoin(dir, p) });
    const order = [];
    await Promise.all([
      withFileLock(file, async () => { order.push("lock-start"); await new Promise(r => setImmediate(r)); order.push("lock-end"); }),
      exec("write", { path: "f.txt", content: "written" }).then(() => order.push("write-done")),
    ]);
    assert.deepEqual(order, ["lock-start", "lock-end", "write-done"], "write 必须排在锁之后");
    assert.equal(fs.readFileSync(file, "utf8"), "written");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
