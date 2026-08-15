// 时间引擎：时间感知 + 定时任务调度（一次性/每日/每周）
// 存储：~/.pi/agent/time-tasks.json（重启恢复）
// 调度：每 20s 检查一次到期任务，触发 runner(task)（防重入）
// 用法：
//   const te = createTimeEngine(runner);
//   te.start();                    // 启动调度循环
//   te.register({type:'daily', at:'09:00', prompt:'...'}) -> id
//   te.remove(id); te.list();
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

const TASKS_FILE = path.join(os.homedir(), ".pi", "agent", "time-tasks.json");
const CHECK_MS = 20_000; // 调度检查间隔

export function createTimeEngine(runner) {
  let tasks = [];
  let timer = null;
  let running = new Set(); // 正在执行的任务 id（防重入）

  function load() {
    try {
      if (fs.existsSync(TASKS_FILE)) {
        const d = JSON.parse(fs.readFileSync(TASKS_FILE, "utf8"));
        tasks = Array.isArray(d.tasks) ? d.tasks : [];
      }
    } catch { tasks = []; }
  }
  function save() {
    try {
      fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
      fs.writeFileSync(TASKS_FILE, JSON.stringify({ tasks, updatedAt: new Date().toISOString() }, null, 2));
    } catch {}
  }

  // 注册任务：type=once(需 date+at) / daily(at) / weekly(day+at, 周一=1)
  function register({ type = "daily", at = "09:00", day, date, prompt = "", label = "" }) {
    if (!prompt) return { error: "缺少任务描述 prompt" };
    if (!/^\d{2}:\d{2}$/.test(at)) return { error: "at 格式应为 HH:MM（如 09:00）" };
    const t = { id: randomUUID().slice(0, 8), type, at, day: day ?? null, date: date ?? null, prompt, label, created: new Date().toISOString(), lastRun: null, runs: 0 };
    if (type === "once" && !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return { error: "once 任务需要 date（YYYY-MM-DD）" };
    if (type === "weekly" && !(day >= 1 && day <= 7)) return { error: "weekly 任务需要 day（1-7，周一=1）" };
    tasks.push(t); save();
    return { id: t.id };
  }
  function remove(id) {
    const before = tasks.length;
    tasks = tasks.filter(t => t.id !== id);
    if (tasks.length !== before) save();
    return { removed: tasks.length !== before };
  }
  function list() { return tasks.map(t => ({ ...t })); }

  // 判断任务在 now 是否到期（含防重复：当天/本周已跑过则不再跑）
  function isDue(t, now) {
    const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (hm !== t.at) return false;
    const today = now.toISOString().slice(0, 10);
    const last = t.lastRun ? new Date(t.lastRun) : null;
    if (t.type === "once") {
      if (t.date !== today) return false;
      if (last) return false; // 一次性任务跑过即不再跑
      return true;
    }
    if (t.type === "daily") {
      if (last && last.toISOString().slice(0, 10) === today) return false;
      return true;
    }
    if (t.type === "weekly") {
      const dow = now.getDay() || 7; // 周日=7
      if (dow !== t.day) return false;
      const thisWeek = today; // 简化：本周内同一天已跑则不跑（lastRun 日期相同即视为本周）
      if (last && last.toISOString().slice(0, 10) === thisWeek) return false;
      return true;
    }
    return false;
  }

  async function check() {
    const now = new Date();
    for (const t of tasks) {
      if (running.has(t.id)) continue;
      if (isDue(t, now)) {
        running.add(t.id);
        try {
          if (runner) await runner({ ...t, firedAt: now.toISOString() });
        } catch (e) {
          console.log(`[time-engine] 任务 ${t.id} 执行失败: ${String(e?.message || e).slice(0, 150)}`);
        } finally {
          t.lastRun = now.toISOString();
          t.runs = (t.runs || 0) + 1;
          running.delete(t.id);
          save();
        }
      }
    }
    // 清理过期的 once 任务（日期 < 今天且没跑过）
    const today = now.toISOString().slice(0, 10);
    const before = tasks.length;
    tasks = tasks.filter(t => !(t.type === "once" && t.date < today));
    if (tasks.length !== before) save();
  }

  function start() {
    load();
    if (timer) return;
    console.log(`[time-engine] 时间引擎已启动（${tasks.length} 个定时任务，每 ${CHECK_MS / 1000}s 检查）`);
    timer = setInterval(check, CHECK_MS);
    check(); // 启动立即检查一次（补跑重启期间到点的任务）
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  return { start, stop, register, remove, list, check, _isDue: isDue, _file: TASKS_FILE };
}

// 时间感知文本：注入 system prompt，让模型知道"现在几点/今天几号/星期几"
export function nowContext() {
  const n = new Date();
  const cn = new Date(n.getTime() + 8 * 3600 * 1000); // 北京时间
  const y = cn.getUTCFullYear(), m = cn.getUTCMonth() + 1, d = cn.getUTCDate();
  const wd = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][cn.getUTCDay()];
  const hh = String(cn.getUTCHours()).padStart(2, "0"), mm = String(cn.getUTCMinutes()).padStart(2, "0");
  return `【当前时间】${y}年${m}月${d}日 ${wd} ${hh}:${mm}（北京时间）。涉及"现在几点/今天几号/星期几"等时间问题时直接使用以上时间。`;
}
