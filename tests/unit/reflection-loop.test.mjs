// 反思闭环四件事：
//   ① 会话正文进材料（此前只给开场 60 字 → 反思只能谈后端）
//   ② 上次行动清单与兑现情况喂回下一次
//   ③ 复盘结尾的行动清单落成承诺账（不再写完就没）
//   ④ 技能提案按名字去重（同一个 daily-retrospective 被提过两次）
// 运行：node --test tests/unit/reflection-loop.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  sessionDigest, collectTimeTaskBrief, buildTimeTaskPrompt,
  parseReflectionActions, recordReflectionActions, collectReflectionCommitments, REFLECTION_SOURCE,
} from "../../engine/time-task-run.mjs";
import { loadPromises, closePromise } from "../../engine/promises.mjs";
import { initEvolutionApi, nudgeSkill, listSkillNudges } from "../../engine/evolution-api.mjs";

const roots = [];
function mkroot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "reflect-"));
  roots.push(d);
  fs.mkdirSync(path.join(d, "记忆"), { recursive: true });
  fs.mkdirSync(path.join(d, "工程", "经验库"), { recursive: true });
  return d;
}
const YMD = "2026-09-14";
const NOW = new Date(2026, 8, 15, 0, 0, 17); // 本地 09-15，复盘对象是 09-14

/** 造一个最小可解析的会话文件。 */
function sessionFile(root, entries) {
  const f = path.join(root, `sess-${Math.random().toString(36).slice(2, 8)}.jsonl`);
  fs.writeFileSync(f, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return f;
}
let seq = 0;
const msg = (role, text, at) => {
  const id = `e${++seq}`;
  return { type: "message", id, parentId: null, timestamp: at.toISOString(), message: { role, content: [{ type: "text", text }] } };
};

describe("① 会话正文进材料", () => {
  test("只取目标日期的用户/助手正文，工具调用不入正文", () => {
    const root = mkroot();
    const y = new Date(2026, 8, 14, 10, 0, 0);
    const old = new Date(2026, 8, 12, 10, 0, 0);
    const f = sessionFile(root, [
      msg("user", "给我做一个大话西游二创剧本", y),
      msg("assistant", "剧本已写好，落在 文档/大话西游.md", new Date(2026, 8, 14, 10, 5, 0)),
      msg("user", "这是前天的，不该进", old),
      { type: "message", id: "t1", timestamp: new Date(2026, 8, 14, 10, 6, 0).toISOString(), message: { role: "toolResult", content: [{ type: "text", text: "巨大的工具输出" }] } },
    ]);
    const d = sessionDigest(f, YMD);
    assert.match(d, /用户：给我做一个大话西游二创剧本/);
    assert.match(d, /小语：剧本已写好/);
    assert.ok(!d.includes("这是前天的"), "非目标日期不该进");
    assert.ok(!d.includes("巨大的工具输出"), "工具结果不该进正文");
  });

  test("预算受控：超预算就停", () => {
    const root = mkroot();
    const f = sessionFile(root, Array.from({ length: 30 }, (_, i) => msg("user", `第${i}条`.repeat(60), new Date(2026, 8, 14, 9, i))));
    const d = sessionDigest(f, YMD, 500);
    assert.ok(d.length <= 620, `预算应受控，实际 ${d.length}`);
  });

  test("文件不存在返回空而不抛", () => {
    assert.equal(sessionDigest(path.join(mkroot(), "nope.jsonl"), YMD), "");
  });

  test("brief 把正文带上，prompt 里能看见", () => {
    const root = mkroot();
    const y = new Date(2026, 8, 14, 15, 0, 0);
    const f = sessionFile(root, [msg("user", "帮我把 PPT 改一版", y), msg("assistant", "改好了，18 页", new Date(2026, 8, 14, 15, 2, 0))]);
    const brief = collectTimeTaskBrief({
      wsRoot: root, now: NOW,
      sessions: [{ name: "PPT 改版", file: f, updatedAt: y.toISOString(), preview: "帮我把 PPT 改一版" }],
    });
    assert.match(brief.sessionBodies, /帮我把 PPT 改一版/);
    const prompt = buildTimeTaskPrompt({ prompt: "自我反思" }, brief);
    assert.match(prompt, /昨日会话正文/);
    assert.match(prompt, /18 页/);
  });
});

describe("② 上次兑现喂回下一次", () => {
  test("反思产生的承诺按 source 挑出来，含挂了多久", () => {
    const root = mkroot();
    recordReflectionActions(root, "```json\n{\"actions\":[{\"text\":\"统一 dsh CLI 入口版本\"}]}\n```", { now: new Date(2026, 8, 12, 0, 0, 5) });
    const c = collectReflectionCommitments(root);
    assert.equal(c.open.length, 1);
    assert.match(c.open[0].text, /统一 dsh CLI/);
    assert.match(c.open[0].phrase, /天前/);
  });

  test("已结清的带证据一起回给下一次", () => {
    const root = mkroot();
    recordReflectionActions(root, "```json\n{\"actions\":[{\"text\":\"把快照堆积清掉\"}]}\n```", { now: new Date(2026, 8, 12, 0, 0, 5) });
    const id = loadPromises(root)[0].id;
    closePromise(root, id, { status: "kept", evidence: "回收 90.1MB" });
    const c = collectReflectionCommitments(root);
    assert.equal(c.open.length, 0);
    assert.equal(c.closed.length, 1);
    assert.match(String(c.closed[0].evidence), /90\.1MB/);
    const brief = collectTimeTaskBrief({ wsRoot: root, now: NOW, sessions: [] });
    assert.match(brief.commitments, /已结清/);
    assert.match(brief.commitments, /90\.1MB/);
  });

  test("没有历史清单时明确写「还没有」", () => {
    const brief = collectTimeTaskBrief({ wsRoot: mkroot(), now: NOW, sessions: [] });
    assert.match(brief.commitments, /还没有历史行动清单/);
  });

  test("别处产生的承诺不会混进反思的清单", () => {
    const root = mkroot();
    fs.writeFileSync(path.join(root, "记忆", "承诺兑现.json"), JSON.stringify([
      { id: "p_other", at: new Date(2026, 8, 13).toISOString(), sessionId: "某会话", text: "我明天给你补个测试", due: null, status: "pending" },
    ]));
    assert.equal(collectReflectionCommitments(root).open.length, 0);
  });
});

describe("③ 行动清单落成承诺", () => {
  test("解析最后一个 json 块（模型常先给示例）", () => {
    const out = "前言\n```json\n{\"actions\":[{\"text\":\"示例不该生效\"}]}\n```\n正文\n```json\n{\"actions\":[{\"text\":\"先统一 CLI 入口版本\"},{\"text\":\"查社区插件有没有 rc.2 适配\"}]}\n```";
    const a = parseReflectionActions(out);
    assert.equal(a.length, 2);
    assert.match(a[0].text, /统一 CLI/);
  });

  test("没有块 / 坏 JSON / 太短的条目不采纳", () => {
    assert.deepEqual(parseReflectionActions("就是一段普通复盘"), []);
    assert.deepEqual(parseReflectionActions("```json\n{坏\n```"), []);
    assert.deepEqual(parseReflectionActions("```json\n{\"actions\":[{\"text\":\"嗯\"}]}\n```"), []);
  });

  test("写进承诺账：pending + source=reflect，且不自动结清", () => {
    const root = mkroot();
    const r = recordReflectionActions(root, "```json\n{\"actions\":[{\"text\":\"统一 dsh CLI 入口版本\"},{\"text\":\"给高频模式留一笔灵感\"}]}\n```", { taskId: "0ff41abf", now: new Date(2026, 8, 15, 0, 0, 17) });
    assert.equal(r.ok, true);
    assert.equal(r.added, 2);
    const list = loadPromises(root);
    assert.equal(list.length, 2);
    assert.ok(list.every((p) => p.status === "pending"), "入库只能是 pending——结清要人工");
    assert.ok(list.every((p) => p.sessionId === REFLECTION_SOURCE));
    assert.equal(list[0].taskId, "0ff41abf");
  });

  test("重复行动按要点去重（每天复盘不会把同一件事堆成 N 条）", () => {
    const root = mkroot();
    const body = "```json\n{\"actions\":[{\"text\":\"统一 dsh CLI 入口版本\"}]}\n```";
    recordReflectionActions(root, body, { now: new Date(2026, 8, 14, 0, 0, 5) });
    const again = recordReflectionActions(root, body, { now: new Date(2026, 8, 15, 0, 0, 5) });
    assert.equal(again.added, 0);
    assert.equal(loadPromises(root).length, 1);
  });

  test("没有行动清单是无操作，不写空条目", () => {
    const root = mkroot();
    const r = recordReflectionActions(root, "这次只写了复盘正文", { now: NOW });
    assert.equal(r.ok, false);
    assert.equal(r.added, 0);
    assert.equal(loadPromises(root).length, 0);
  });

  test("due 非法就置空，不塞一个假日期", () => {
    const root = mkroot();
    recordReflectionActions(root, "```json\n{\"actions\":[{\"text\":\"查一下社区包\",\"due\":\"不是日期\"}]}\n```", { now: NOW });
    assert.equal(loadPromises(root)[0].due, null);
  });
});

describe("prompt 契约", () => {
  test("明确要求覆盖会话侧，并要求结尾附行动 JSON", () => {
    const p = buildTimeTaskPrompt({ prompt: "自我反思" }, { ymd: YMD, sessionLines: [], memoryClip: "" });
    assert.match(p, /必须覆盖会话侧/);
    assert.match(p, /不能只谈引擎\/后端/);
    assert.match(p, /actions/);
    assert.match(p, /承诺账/);
  });

  test("有上次清单时要求先交代兑现", () => {
    const p = buildTimeTaskPrompt({ prompt: "自我反思" }, { ymd: YMD, sessionLines: [], memoryClip: "", commitments: "仍挂着（1）：\n- 2 天前：统一 CLI" });
    assert.match(p, /先逐条交代兑现/);
    assert.match(p, /统一 CLI/);
  });
});

describe("④ 技能提案按名字去重", () => {
  function setupNudge() {
    const root = mkroot();
    const prompts = path.join(root, "prompts");
    const skills = path.join(root, "skills");
    fs.mkdirSync(prompts, { recursive: true });
    fs.mkdirSync(skills, { recursive: true });
    initEvolutionApi({
      root, prompts, skills,
      getDefaultModel: () => ({ provider: "x", id: "y" }),
      chat: async () => ({ text: JSON.stringify({ skip: false, name: "daily-retrospective", description: "每日复盘的做法", skill: "---\nname: daily-retrospective\n---\n" + "步骤：".repeat(40) }) }),
    });
    return { root, skills };
  }

  test("第一次提案成功，同名第二次被挡（不再堆重复 open）", async () => {
    const { root } = setupNudge();
    const a = await nudgeSkill({ label: "自我反思", result: "复盘正文".repeat(40), trigger: "time-task" });
    assert.equal(a.ok, true);
    const b = await nudgeSkill({ label: "自我反思", result: "另一天的复盘正文".repeat(30), trigger: "time-task" });
    assert.equal(b.skip, true);
    assert.match(String(b.reason), /同名技能提案已存在/);
    assert.equal(listSkillNudges().length, 1);
    assert.ok(fs.existsSync(path.join(root, "工程", "经验库", "improvements.jsonl")));
  });

  test("结果太短仍然先挡掉（不浪费一次评估）", async () => {
    setupNudge();
    const r = await nudgeSkill({ label: "自我反思", result: "太短", trigger: "time-task" });
    assert.equal(r.skip, true);
    assert.match(String(r.reason), /太短/);
  });
});

test.after(() => {
  for (const d of roots) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
});
