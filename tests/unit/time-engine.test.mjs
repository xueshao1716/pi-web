// 任务中心 v2 测试：状态机 / queueId 执行身份 / 运行历史 / stop 语义 / once 自动 done / 旧格式迁移
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createTimeEngine } from "../../engine/time-engine.mjs";

function tmpEngine(runner) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "piweb-tasks-"));
  const file = path.join(dir, "time-tasks.json");
  const te = createTimeEngine(runner, { file });
  return { te, file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("注册默认 active；pause/resume/archive 状态机与非法转换", async () => {
  const { te, cleanup } = tmpEngine(null);
  const r = te.register({ type: "daily", at: "09:00", prompt: "测试" });
  assert.ok(r.id);
  assert.equal(te.list()[0].state, "active");
  assert.equal(te.pause(r.id).state, "paused");
  // paused 不允许再 pause
  assert.ok(te.pause(r.id).error);
  assert.equal(te.resume(r.id).state, "active");
  assert.equal(te.archive(r.id).state, "archived");
  // archived 是终态
  assert.ok(te.resume(r.id).error);
  cleanup();
});

test("paused 任务不触发调度；runNow 手动执行记录 ok 历史 + queueId", async () => {
  let calls = 0;
  const { te, cleanup } = tmpEngine(async () => { calls++; return "任务输出内容"; });
  const r = te.register({ type: "daily", at: "23:59", prompt: "测试" });
  te.pause(r.id);
  await te.check(); // paused：不触发
  assert.equal(calls, 0);
  const rn = await te.runNow(r.id);
  assert.ok(rn.queueId, "手动执行应返回 queueId");
  assert.equal(calls, 1);
  const t = te.find(r.id);
  assert.equal(t.history.length, 1);
  assert.equal(t.history[0].status, "ok");
  assert.equal(t.history[0].queueId, rn.queueId);
  assert.match(t.history[0].result, /任务输出内容/);
  assert.equal(t.runs, 1);
  cleanup();
});

test("runner 抛错 → error 历史含原因", async () => {
  const { te, cleanup } = tmpEngine(async () => { throw new Error("网络炸了"); });
  const r = te.register({ type: "daily", at: "23:59", prompt: "x" });
  await te.runNow(r.id);
  const h = te.find(r.id).history[0];
  assert.equal(h.status, "error");
  assert.match(h.result, /网络炸了/);
  cleanup();
});

test("stop 拿到业务确认；runner 结束后该次标记 stopped", async () => {
  let resolveRun;
  const gate = new Promise(res => { resolveRun = res; });
  const { te, cleanup } = tmpEngine(async () => { await gate; return "晚到的结果"; });
  const r = te.register({ type: "daily", at: "23:59", prompt: "x" });
  const runP = te.runNow(r.id).catch(() => {});
  await new Promise(res => setTimeout(res, 50)); // 等 runner 进入
  const stopR = te.stopRun(r.id);
  assert.equal(stopR.stopped, true);
  assert.ok(stopR.queueId);
  resolveRun();
  await runP;
  const t = te.find(r.id);
  assert.ok(t.history.some(h => h.status === "stopped"), "应有 stopped 投影");
  // 未在执行的任务 stop 返回未执行
  assert.equal(te.stopRun(r.id).stopped, false);
  cleanup();
});

test("once 任务执行后自动转 done；旧格式文件自动迁移补 state", async () => {
  const { te, file, cleanup } = tmpEngine(async () => "done 输出");
  // 预置旧格式（无 state/history 字段）
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ tasks: [{ id: "legacy1", type: "daily", at: "09:00", prompt: "旧任务", created: new Date().toISOString(), lastRun: null, runs: 0 }] }));
  delete te._loaded; // 无缓存概念，直接重新 load
  te.start();
  te.stop();
  const legacy = te.find("legacy1");
  assert.equal(legacy.state, "active", "旧格式迁移补 active");

  const today = new Date().toISOString().slice(0, 10);
  const r = te.register({ type: "once", date: today, at: "23:58", prompt: "一次性" });
  await te.runNow(r.id);
  assert.equal(te.find(r.id).state, "done");
  cleanup();
});

test("isDue 对非 active 状态直接返回 false", () => {
  const { te, cleanup } = tmpEngine(null);
  const r = te.register({ type: "daily", at: "09:00", prompt: "x" });
  const t = te.find(r.id);
  const noon = new Date("2026-08-25T01:00:00Z"); // 本地 09:00 视时区而定，用 _isDue 内部 hm 匹配 at
  t.at = `${String(noon.getHours()).padStart(2, "0")}:${String(noon.getMinutes()).padStart(2, "0")}`;
  assert.equal(te._isDue(t, noon), true);
  te.pause(r.id);
  assert.equal(te._isDue(te.find(r.id), noon), false);
  cleanup();
});
