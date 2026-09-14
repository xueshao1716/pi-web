// activity-rhythm.mjs 测试：从真实时间戳观测作息/节律
// 运行：node --test tests/unit/activity-rhythm.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readActivityRhythm, rhythmPhrase, RHYTHM_LIMITS } from "../../engine/activity-rhythm.mjs";
import { promptTimeText } from "../../engine/yuanshu-seams.mjs";

const cleanups = [];
function mk() { const d = fs.mkdtempSync(path.join(os.tmpdir(), "yuanshu-rhythm-")); cleanups.push(d); return d; }
function ws() { const d = mk(); fs.mkdirSync(path.join(d, "记忆"), { recursive: true }); return d; }

// 用本地时间构造，再转 ISO——断言与机器时区无关
function iso(dayOffset, hour, minute = 0) {
  const d = new Date(2026, 8, 14, hour, minute, 0, 0);
  d.setDate(d.getDate() - dayOffset);
  return d.toISOString();
}
/** 会话文件名格式：2026-09-14T06-00-00.000Z_<uuid>.jsonl（UTC，冒号换成连字符） */
function writeSessions(dir, stamps) {
  fs.mkdirSync(dir, { recursive: true });
  stamps.forEach((s, i) => fs.writeFileSync(path.join(dir, `${s.replace(/:/g, "-")}_sess${i}.jsonl`), ""));
}
function writeLog(wsRoot, lines) {
  fs.writeFileSync(path.join(wsRoot, "记忆", "记忆日志.md"), lines.join(""));
}
const logLine = (day, hour) => `### 2026-09-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:05\n- 要点：某条目\n`;

describe("作息观测：样本不足就不观测", () => {
  test("会话少于下限返回 null，而不是编一句作息", () => {
    const w = ws(); const sd = mk();
    writeSessions(sd, Array.from({ length: RHYTHM_LIMITS.MIN_SAMPLES - 1 }, (_, i) => iso(i % 5, 10 + (i % 8))));
    assert.equal(readActivityRhythm(w, { now: new Date(2026, 8, 14, 14, 0), sessionDir: sd }), null);
  });

  test("什么目录都不存在也不抛错", () => {
    assert.equal(readActivityRhythm(mk(), { now: new Date() }), null);
  });
});

describe("作息观测：窗口与节律", () => {
  test("活跃窗口覆盖九成记录，深夜少数派被排除在外", () => {
    const w = ws(); const sd = mk();
    const stamps = [];
    for (let d = 1; d <= 10; d++) for (let h = 10; h <= 21; h++) stamps.push(iso(d, h)); // 120 条（都在 now 之前）
    for (let d = 0; d < 5; d++) stamps.push(iso(d, 3));                                  // 5 条凌晨 3 点
    writeSessions(sd, stamps);
    const r = readActivityRhythm(w, { now: new Date(2026, 8, 14, 14, 0), sessionDir: sd });
    assert.ok(r, "样本充足应给出读数");
    assert.equal(r.samples, 125);
    // 20、21 点各占一成活动，属于"通常活跃"，不能被 80% 阈值切掉
    assert.equal(r.activeStart, 10);
    assert.equal(r.activeEnd, 21);
    assert.equal(r.lateNight, 5);
    assert.ok(r.coverage >= 0.85, `覆盖率应达标，实际 ${r.coverage}`);
    assert.equal(r.nowInWindow, true);
    assert.equal(r.isLateNight, false);
  });

  test("当天轮次按本地日期统计", () => {
    const w = ws(); const sd = mk();
    const stamps = [];
    for (let h = 10; h <= 19; h++) stamps.push(iso(0, h));
    for (let d = 1; d <= 5; d++) for (let h = 10; h <= 19; h++) stamps.push(iso(d, h));
    writeSessions(sd, stamps);
    const r = readActivityRhythm(w, { now: new Date(2026, 8, 14, 22, 0), sessionDir: sd });
    assert.equal(r.todayCount, 10, `应只数当天的，实际 ${r.todayCount}`);
  });

  test("脏文件名被跳过，不丢掉整份作息", () => {
    const w = ws(); const sd = mk();
    const stamps = [];
    for (let d = 1; d <= 6; d++) for (let h = 9; h <= 20; h++) stamps.push(iso(d, h));
    writeSessions(sd, stamps);
    for (const junk of ["notes.jsonl", "backup-old.jsonl", "2026-09-14.jsonl", "readme.md"]) fs.writeFileSync(path.join(sd, junk), "");
    const r = readActivityRhythm(w, { now: new Date(2026, 8, 14, 14, 0), sessionDir: sd });
    assert.equal(r.samples, 72);
  });

  test("记忆日志标题也可作为时间轴来源（没有会话目录时）", () => {
    const w = ws();
    const lines = [];
    for (let d = 0; d < 12; d++) for (let h = 11; h <= 18; h++) lines.push(logLine(14 - d, h));
    writeLog(w, lines);
    const r = readActivityRhythm(w, { now: new Date(2026, 8, 14, 23, 30) });
    assert.ok(r, "只靠日志也应能观测");
    assert.equal(r.activeStart, 11);
    assert.equal(r.activeEnd, 18);
  });
});

describe("数据源污染回归锁", () => {
  test("情绪感受.jsonl 不再被当作作息数据源", () => {
    // 2026-09-07 单日 578 条、间隔中位数 60 秒——那是定时任务跑出来的，
    // 不是人的活动。拿它算作息会得出"3:00–9:00 全 60 条"这种假结论。
    const w = ws();
    const rows = [];
    for (let i = 0; i < 500; i++) {
      const d = new Date(2026, 8, 7, 3, i % 60, 0); // 全部落在本地 3 点
      rows.push(JSON.stringify({ ts: d.toISOString(), key: "batch", event: "批量任务", felt: "calm(50%)", intensity: 0.5 }));
    }
    fs.writeFileSync(path.join(w, "记忆", "情绪感受.jsonl"), rows.join("\n") + "\n");
    const r = readActivityRhythm(w, { now: new Date(2026, 8, 14, 14, 0) });
    assert.equal(r, null, "500 条批量记录不足以构成作息——该文件已被刻意排除");
  });

  test("读数只含时间统计，不含任何文件名/正文", () => {
    const w = ws(); const sd = mk();
    const stamps = [];
    for (let d = 1; d <= 6; d++) for (let h = 9; h <= 20; h++) stamps.push(iso(d, h));
    writeSessions(sd, stamps);
    fs.writeFileSync(path.join(sd, "2026-09-10T01-00-00.000Z_秘密文件名.jsonl"), "");
    const r = readActivityRhythm(w, { now: new Date(2026, 8, 14, 14, 0), sessionDir: sd });
    assert.ok(!JSON.stringify(r).includes("秘密文件名"), "作息读数只能含时间统计");
  });
});

describe("作息措辞", () => {
  test("深夜且不在活跃窗口时提示深夜", () => {
    const w = ws(); const sd = mk();
    const stamps = [];
    for (let d = 0; d < 8; d++) for (let h = 10; h <= 21; h++) stamps.push(iso(d, h));
    for (let d = 0; d < 4; d++) stamps.push(iso(d, 3));
    writeSessions(sd, stamps);
    const now = new Date(2026, 8, 14, 3, 0);
    const r = readActivityRhythm(w, { now, sessionDir: sd });
    const phrase = rhythmPhrase(r, now);
    assert.match(phrase, /活跃/);
    assert.match(phrase, /深夜/);
  });

  test("正常时段不提示深夜", () => {
    const w = ws(); const sd = mk();
    const stamps = [];
    for (let d = 0; d < 8; d++) for (let h = 10; h <= 21; h++) stamps.push(iso(d, h));
    writeSessions(sd, stamps);
    const now = new Date(2026, 8, 14, 14, 0);
    const r = readActivityRhythm(w, { now, sessionDir: sd });
    const phrase = rhythmPhrase(r, now);
    assert.match(phrase, /今天已经聊过/);
    assert.ok(!phrase.includes("深夜"));
  });

  test("未观测到作息时措辞为空（不编）", () => {
    assert.equal(rhythmPhrase(null), "");
  });

  test("promptTimeText 接入作息后出现作息段，未接入时保持原样", () => {
    const withR = promptTimeText(new Date(2026, 8, 14, 3, 0), { since: new Date(2026, 8, 14, 2, 0).getTime(), rhythm: { activeStart: 10, activeEnd: 21, spanDays: 8, samples: 96, todayCount: 3, lateNightRatio: 0.04, nowInWindow: false, isLateNight: true } });
    assert.match(withR, /（作息）/);
    assert.match(withR, /深夜/);
    const without = promptTimeText(new Date(2026, 8, 14, 3, 0), { since: new Date(2026, 8, 14, 2, 0).getTime() });
    assert.ok(!without.includes("（作息）"), "没给读数就不要出现作息段");
  });
});

test.after(() => {
  for (const d of cleanups) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
});
