// ===== file-lock.mjs —— 文件写操作的串行化（优先共用 Pi 的队列）=====
//
// ── 先把问题说准（第一版这里写错了，2026-09-14 实测纠正）──
// 我原先的理由是"两个会话并发 edit 同一文件会互相覆盖"。**这是错的**：
// 元枢自己的 edit 是 `readFileSync → replace → writeFileSync`，中间没有 await，
// Node 单线程下这段临界区本来就是原子的。实测并发两次 edit，两个改动都在。
//
// 真正存在的窗口在**跨实现**：Pi 的 edit 工具用 `fs/promises`，
// `await readFile` 与 `await writeFile` 之间是真 await，会被其它任务插进来。
// 而 Pi 有它自己的 `withFileMutationQueue`、元枢这边什么都没有——
// 两套互不相通，于是"元枢的 edit"与"Pi 的 edit"打同一个文件时可以交错，
// 后写的那次把前一次整段覆盖掉。
//
// 所以正确做法不是另造一把锁，而是**共用 Pi 已经有的那把**：
// Pi 从包根导出了 `withFileMutationQueue`（已实测 typeof === "function"）。
// 由 server.mjs 注入，两个引擎就落到同一个按文件的队列上。
//
// 拿不到 Pi 的队列时（版本漂移等）退回下面这份自带实现——它解决不了跨实现交错，
// 但至少把元枢自己的临界区显式化，不让"恰好没有 await"成为唯一的保障。
import fs from "node:fs";
import path from "node:path";

let _sharedQueue = null;

/**
 * 注入 Pi 的 withFileMutationQueue（server.mjs 在导入 Pi 包时顺手拿）。
 * 传非函数视同未注入，不抛——拿不到就退回自带实现，不能让写入路径崩掉。
 */
export function initFileLock({ withFileMutationQueue = null } = {}) {
  _sharedQueue = typeof withFileMutationQueue === "function" ? withFileMutationQueue : null;
}

/** 当前是否在用 Pi 的共享队列（用于自检与诊断）。 */
export function usingSharedFileQueue() {
  return _sharedQueue !== null;
}

const queueTails = new Map();

function isMissing(error) {
  return error?.code === "ENOENT" || error?.code === "ENOTDIR";
}

/**
 * 把路径归一化成锁键：真实路径 + 缺失段的拼接。
 * 比 Pi 的实现多走一步：**文件还不存在**时（write 会创建它）向上找到最近存在的祖先做
 * realpath，再把缺失段拼回来——否则 `symlink-dir/new.txt` 与真实路径会落到两把锁上。
 */
export function canonicalFilePath(filePath) {
  const resolved = path.resolve(String(filePath || ""));
  let current = resolved;
  const missing = [];
  for (;;) {
    try {
      return path.resolve(fs.realpathSync(current), ...missing);
    } catch (error) {
      if (!isMissing(error)) return resolved;
      const parent = path.dirname(current);
      if (parent === current) return resolved;
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}

/** 自带的按 canonical 路径串行队列（Pi 队列不可用时的退路）。 */
async function withOwnFileQueue(filePath, work) {
  const key = canonicalFilePath(filePath);
  const previous = queueTails.get(key) ?? Promise.resolve();
  let release;
  const owned = new Promise(resolve => { release = resolve; });
  const tail = previous.then(() => owned);
  queueTails.set(key, tail);

  await previous;
  try {
    return await work();
  } finally {
    release();
    if (queueTails.get(key) === tail) queueTails.delete(key);
  }
}

/**
 * 串行化同一个文件上的写操作。优先走 Pi 的共享队列（两个引擎同一把），
 * 拿不到时退回自带实现。
 */
export async function withFileLock(filePath, work) {
  if (_sharedQueue) return _sharedQueue(String(filePath), work);
  return withOwnFileQueue(filePath, work);
}

/** 供测试观察自带队列的状态。 */
export function activeFileLockCount() {
  return queueTails.size;
}
