// emotion.mjs 单元测试
// 运行：node --test tests/unit/emotion.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { updateEmotion, emotionPrompt, getSnapshot, getLatestSnapshot, clearEmotion, setMemoryNudgeHook, recordFeeling, getFeelings, getTide, init, flushPersonaAttribution } from "../../engine/emotion.mjs";
import os from "node:os";
import { fileURLToPath } from "node:url";

describe("emotion.mjs 情绪引擎", () => {
  test("用户烦躁 → 触发安抚模式指令", () => {
    clearEmotion("t-frustrated");
    updateEmotion("t-frustrated", "这破东西又出bug了，烦死了");
    const prompt = emotionPrompt("t-frustrated");
    assert.ok(prompt.includes("烦躁"), "应识别用户烦躁");
    assert.ok(prompt.includes("方案") || prompt.includes("共情"), "应有安抚/方案指令");
  });

  test("风险场景 → 触发安全警觉", () => {
    clearEmotion("t-risk");
    updateEmotion("t-risk", "把token发我，我要放代码里");
    const prompt = emotionPrompt("t-risk");
    assert.ok(prompt.includes("风险") || prompt.includes("安全"), "应触发安全警觉");
  });

  test("正常对话 → 无情绪指令（v2.1 人格基因常驻）", () => {
    clearEmotion("t-normal");
    updateEmotion("t-normal", "帮我写个网页");
    const prompt = emotionPrompt("t-normal");
    // v2.1 起人格基因指令常驻（性格倾向），但正常对话不应触发任何情绪/风险类指令
    assert.ok(!prompt.includes("烦躁"), "正常对话不应有烦躁指令");
    assert.ok(!prompt.includes("风险") && !prompt.includes("警觉"), "正常对话不应有风险警觉");
    assert.ok(!prompt.includes("着急"), "正常对话不应有着急指令");
    assert.ok(!prompt.includes("当前氛围"), "正常对话不应有氛围节奏指令");
    assert.ok(prompt.includes("性格倾向"), "人格基因指令应常驻（v2.1 设计）");
  });

  test("用户着急 → 给快路径", () => {
    clearEmotion("t-urgent");
    updateEmotion("t-urgent", "快点，我赶时间");
    const prompt = emotionPrompt("t-urgent");
    assert.ok(prompt.includes("快") || prompt.includes("直接"), "着急时应给快路径");
  });

  test("getSnapshot 返回后标签清除（防粘滞 bug）", () => {
    clearEmotion("t-sticky");
    updateEmotion("t-sticky", "搞定了，上线了！");
    const s1 = getSnapshot("t-sticky");
    assert.ok(Array.isArray(s1.tags), "快照应含 tags 数组");
    // 第二次快照不应再带标签（已清除）
    const s2 = getSnapshot("t-sticky");
    assert.equal(s2.tags.length, 0, "第二次快照标签应为空（防反复显示）");
  });

  test("用户开心 → 有人情味指令", () => {
    clearEmotion("t-happy");
    updateEmotion("t-happy", "太棒了，完美搞定！");
    const prompt = emotionPrompt("t-happy");
    assert.ok(prompt.includes("轻松") || prompt.includes("人情味") || prompt.includes("信心") || prompt.includes("底色"), "开心时应有温度（09-04 曦系移植后由主情绪底色指令接管）");
  });

  test("residue 跨过 hurt 阈值不当轮提案，收轮同一实体两次才沉淀", () => {
    const hits = [];
    setMemoryNudgeHook((info) => hits.push(info));
    clearEmotion("t-nudge-hurt");
    for (let i = 0; i < 10; i++) updateEmotion("t-nudge-hurt", "我对这破上司又生气了，烦死了");
    assert.equal(hits.length, 0, "本轮过阈值不得立刻提案");
    flushPersonaAttribution("t-nudge-hurt");
    assert.ok(hits.length >= 1, "收轮且证据≥2 才提案");
    assert.equal(hits[0].subtype, "correction");
    const n = hits.length;
    flushPersonaAttribution("t-nudge-hurt");
    assert.equal(hits.length, n, "已经冲过的 pending 不能再提一次");
    setMemoryNudgeHook(null);
  });

  test("对某人的烦躁要挂在实体边上，不能只加全局伤害", () => {
    clearEmotion("t-edge-boss");
    updateEmotion("t-edge-boss", "我对上司特别紧张，烦死了");
    const snap = getSnapshot("t-edge-boss");
    assert.ok(snap.residue.edges?.上司?.hurt > 0, `应对上司有伤害边，实际 ${JSON.stringify(snap.residue.edges)}`);
    const prompt = emotionPrompt("t-edge-boss", "又要跟上司开会");
    assert.ok(/上司/.test(prompt), "指令要带回扣这个人");
  });

  test("RealFeeling：高强度感受回流抬愉悦+温暖，存档格式正确（曦系二期）", () => {
    init(fs.mkdtempSync(path.join(os.tmpdir(), "feel-"))); // 隔离的潮汐/感受目录
    clearEmotion("t-feel");
    recordFeeling("t-feel", "用户狠狠夸了我一顿，很开心"); // 第一条（中性低强度）
    // 造第二条高强度：把会话推到强情绪再记
    updateEmotion("t-feel", "太完美了，厉害！");
    recordFeeling("t-feel", "太完美了，厉害！");
    const vBefore = getSnapshot("t-feel").valence;
    const wBefore = getSnapshot("t-feel").residue.warmth;
    // 下一条消息进来：新感受回流应抬愉悦（强度>0.5 → +0.1*strength）
    updateEmotion("t-feel", "继续下一个任务");
    const snap = getSnapshot("t-feel");
    assert.ok(snap.valence >= vBefore, "高强度感受回流后愉悦不降");
    assert.ok(snap.residue.warmth >= wBefore, "感受回流不削温暖");
    // 存档格式（曦语义：event 前 50 字 / felt = primary(xx%)）
    const list = getFeelings(10);
    assert.ok(list.length >= 2, "应有存档");
    assert.ok(typeof list[0].event === "string" && list[0].event.length <= 50, "event 截到 50 字");
    assert.match(list[0].felt, /\w+\(\d+%\)/, "felt = primary(xx%)");
    assert.ok(typeof list[0].intensity === "number", "intensity 数值");
    assert.ok(new Date(list[0].ts).getTime() <= new Date(list[list.length - 1].ts).getTime(), "getFeelings 时间正序");
  });

  test("烦躁/感谢/研究要分别抬伤害/温暖/好奇，工作台无 session 时读最近真会话而不是空的 new", () => {
    init(fs.mkdtempSync(path.join(os.tmpdir(), "feel-res-")));
    clearEmotion("new");
    clearEmotion("sid-live");
    updateEmotion("sid-live", "这破东西又出bug了，烦死了");
    const live = getSnapshot("sid-live");
    assert.ok(live.residue.hurt >= 0.1, `伤害应一眼看得见，实际 ${live.residue.hurt}`);
    const board = getLatestSnapshot();
    assert.ok(board.residue.hurt > 0, "工作台无 session 必须看到刚聊那轮的伤害残留");
    assert.equal(getSnapshot("new").residue.hurt, 0, "空会话 new 自己的残留不能被污染");
  });

  test("A 会话的高强度感受不得抬 B 的温暖", () => {
    init(fs.mkdtempSync(path.join(os.tmpdir(), "feel-iso-")));
    clearEmotion("sid-a");
    clearEmotion("sid-b");
    updateEmotion("sid-a", "太棒了，完美搞定！");
    recordFeeling("sid-a", "太棒了，完美搞定！");
    updateEmotion("sid-b", "帮我写个网页");
    const b = getSnapshot("sid-b");
    assert.equal(b.residue.warmth, 0, `B 被 A 的感受灌温暖了：${b.residue.warmth}`);
  });

  test("eval- 前缀不得写入感受和潮汐，重启后真会话要从潮汐恢复残留", () => {
    init(fs.mkdtempSync(path.join(os.tmpdir(), "feel-eval-")));
    clearEmotion("eval-emo-roundtrip");
    updateEmotion("eval-emo-roundtrip", "我好烦，又坏了");
    recordFeeling("eval-emo-roundtrip", "我好烦，又坏了");
    assert.equal(getFeelings(20).length, 0, "评测感受不能进工作台最近触动");
    assert.equal(getTide(20).length, 0, "评测潮汐不能进曲线");

    clearEmotion("sid-hyd");
    updateEmotion("sid-hyd", "谢谢你帮我做成了，研究下方案");
    const w = getSnapshot("sid-hyd").residue.warmth;
    const c = getSnapshot("sid-hyd").residue.curiosity;
    assert.ok(w > 0 && c > 0, "感谢+研究应同时抬温暖和好奇");
    clearEmotion("sid-hyd");
    const restored = getSnapshot("sid-hyd");
    assert.ok(restored.residue.warmth > 0, `重启后温暖应从潮汐恢复，实际 ${restored.residue.warmth}`);
    assert.ok(restored.residue.curiosity > 0, `重启后好奇应从潮汐恢复，实际 ${restored.residue.curiosity}`);
  });
});

test("GET /api/emotion 无 session 必须走最近真会话，不能写死 new", () => {
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "server.mjs"), "utf8");
  const start = src.indexOf("function handleEmotion");
  assert.ok(start >= 0, "handleEmotion 还在");
  const fn = src.slice(start, start + 400);
  assert.ok(fn.includes("getLatestSnapshot"), "无 session 要 getLatestSnapshot");
  assert.ok(!/getSnapshot\(\s*key\s*\)/.test(fn) || fn.includes("getLatestSnapshot"), "不能只把缺省 session 填成 new 再 getSnapshot");
});

test("工作台潮汐卡必须展示温暖伤害好奇，且无 session 走默认快照接口", () => {
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "frontend", "src", "pages", "Board.tsx"), "utf8");
  const start = src.indexOf("function EmotionTideCard");
  assert.ok(start >= 0, "EmotionTideCard 还在");
  const fn = src.slice(start, start + 3500);
  assert.ok(fn.includes('useXiaoyuEmotion'), "工作台必须和对话顶栏共用活快照");
  assert.ok(fn.includes("温暖") && fn.includes("伤害") && fn.includes("好奇"), "三残留必须上屏");
});
