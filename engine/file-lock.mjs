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
//
// ── 两层锁，职责不同 ──
//   第一层（本进程）：与 Pi 共用 withFileMutationQueue，挡住"元枢 edit × Pi edit"交错。
//   第二层（跨进程）：锁文件 + O_EXCL，挡住 dsh 子智能体、headless 入口、外部脚本。
// 顺序是先本进程后跨进程：本进程那把不涉及 I/O、先拿更省事。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

let _sharedQueue = null;
let _lockDir = "";
let _waitMs = 0;   // 0 = 用 LOCK_WAIT_MS 默认值

// 默认锁目录与工具结果归档同源（agent 目录下），这样**不 init 的进程也会落到同一个地方**——
// 跨进程锁的价值就在于两边必须同意锁在哪，不能各用各的默认值。
export function defaultLockDir() {
  return path.join(os.homedir(), ".pi", "agent", "yuanshu-locks");
}

export function lockDir() {
  return _lockDir || defaultLockDir();
}

/**
 * 注入 Pi 的 withFileMutationQueue（server.mjs 在导入 Pi 包时顺手拿）。
 * 传非函数视同未注入，不抛——拿不到就退回自带实现，不能让写入路径崩掉。
 */
export function initFileLock({ withFileMutationQueue = null, dir = "", waitMs = 0 } = {}) {
  _sharedQueue = typeof withFileMutationQueue === "function" ? withFileMutationQueue : null;
  if (dir) _lockDir = String(dir);
  _waitMs = Number(waitMs) > 0 ? Number(waitMs) : 0;
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
 * 串行化同一个文件上的写操作。
 * 第一层：本进程（优先 Pi 的共享队列，拿不到用自带实现）。
 * 第二层：跨进程锁文件（挡住 dsh 子智能体 / headless 入口 / 外部脚本）。
 * 任一层拿不到跨进程锁都会**如实失败**，而不是无锁硬写。
 */
export async function withFileLock(filePath, work, options = {}) {
  const runInProcess = () => (_sharedQueue
    ? _sharedQueue(String(filePath), () => withCrossProcessLock(filePath, work, options))
    : withOwnFileQueue(filePath, () => withCrossProcessLock(filePath, work, options)));
  return runInProcess();
}

// ── 跨进程锁 ────────────────────────────────────────────────
// 用锁文件 + O_EXCL（各平台都原子）而不是 flock：Node 核心没有 flock，
// 依赖第三方 native 模块又会给"零构建安装链路"添麻烦。
export const LOCK_STALE_MS = 30_000;   // 超过这个岁数就认为持有者已经死了
export const LOCK_WAIT_MS = 15_000;    // 等锁上限；超了就如实失败
const LOCK_POLL_MIN_MS = 40;
const LOCK_POLL_MAX_MS = 160;

export class FileLockTimeoutError extends Error {
  constructor(target, holder) {
    super(`等锁超时：另一个进程正在写这个文件${holder ? `（pid ${holder.pid}，${holder.at}）` : ""}，请稍后重试`);
    this.name = "FileLockTimeoutError";
    this.code = "ELOCKTIMEOUT";
    this.holder = holder || null;
    this.target = target;
  }
}

/** 锁文件路径：按 canonical 路径取哈希，避免把锁文件写到用户目录里去。 */
export function crossProcessLockPath(filePath) {
  const key = canonicalFilePath(filePath);
  const digest = crypto.createHash("sha256").update(key, "utf8").digest("hex").slice(0, 32);
  return path.join(lockDir(), `${digest}.lock`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readHolder(lockFile) {
  try {
    const j = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    return { pid: Number(j.pid) || 0, host: String(j.host || ""), at: String(j.at || ""), target: String(j.target || "") };
  } catch { return null; }
}

/** 同机同 pid 是否还活着。跨机（host 不同）无法判断，只能靠岁数。 */
function holderAlive(holder) {
  if (!holder?.pid) return false;
  if (holder.host && holder.host !== os.hostname()) return true;
  try { process.kill(holder.pid, 0); return true; }
  catch (e) { return e?.code === "EPERM"; } // EPERM = 存在但无权限，算活着
}

/**
 * 是否可接管。**注意"读不出元数据"不等于"持有者死了"**：
 * 加锁是先 openSync(wx) 创建、后写元数据，两步之间别的进程会看到一个空锁文件。
 * 第一版把空文件判成陈旧并删掉，结果两个进程同时持锁——多进程测试当场抓到。
 * 所以元数据缺失一律按"正在初始化"处理，只有够老（或同机 pid 确实不在）才接管。
 */
function lockIsStale(lockFile, holder, staleMs) {
  let age = Infinity;
  try { age = Date.now() - fs.statSync(lockFile).mtimeMs; } catch { return true; } // 锁文件没了
  if (age > staleMs) return true;
  if (!holder) return false;
  return !holderAlive(holder);
}

function tryAcquire(lockFile, target) {
  let fd;
  try {
    fd = fs.openSync(lockFile, "wx", 0o600);   // O_CREAT|O_EXCL|O_WRONLY，各平台原子
  } catch (error) {
    if (error?.code === "EEXIST") return { ok: false };
    throw error;
  }
  try {
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname(), at: new Date().toISOString(), target }));
  } finally {
    fs.closeSync(fd);
  }
  return { ok: true };
}

/**
 * 跨进程互斥。拿不到锁超时后**抛 FileLockTimeoutError**，交给上层如实告诉用户；
 * 绝不在没拿到锁的情况下闷头写——那正是要防的事。
 */
export async function withCrossProcessLock(targetPath, work, { waitMs = 0, staleMs = LOCK_STALE_MS } = {}) {
  const budget = waitMs > 0 ? waitMs : (_waitMs > 0 ? _waitMs : LOCK_WAIT_MS);
  const lockFile = crossProcessLockPath(targetPath);
  fs.mkdirSync(path.dirname(lockFile), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + budget;
  let lastHolder = null;

  for (;;) {
    if (tryAcquire(lockFile, targetPath).ok) break;

    const holder = readHolder(lockFile);
    lastHolder = holder || lastHolder;
    // 陈旧接管：持有者可能崩了。删掉再抢——抢仍然是 O_EXCL 原子，
    // 两个进程同时判定陈旧也只有一个能创建成功。
    if (lockIsStale(lockFile, holder, staleMs)) {
      try { fs.unlinkSync(lockFile); } catch {}
      continue;                       // 立刻重抢，不睡
    }
    if (Date.now() >= deadline) throw new FileLockTimeoutError(targetPath, holder);
    await sleep(LOCK_POLL_MIN_MS + Math.floor(Math.random() * (LOCK_POLL_MAX_MS - LOCK_POLL_MIN_MS)));
  }

  try {
    return await work();
  } finally {
    // 只删自己创建的：万一被陈旧接管过，别把新持有者的锁删了
    const holder = readHolder(lockFile);
    if (!holder || (holder.pid === process.pid && holder.host === os.hostname())) {
      try { fs.unlinkSync(lockFile); } catch {}
    }
  }
}

/** 供测试观察自带队列的状态。 */
export function activeFileLockCount() {
  return queueTails.size;
}
