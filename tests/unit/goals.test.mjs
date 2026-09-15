// goals.mjs 测试：跨轮目标的持久化与三重闸门
//
// 被锁的契约（借自 dsh-goal-round-driver，但元枢把自动推进改成默认关）：
//   闸门① 回合上限到顶自动 blocked，不再"再来一轮"
//   闸门② 同一 (goalId, revision, round) 只驱动一次
//   闸门③ 一轮出错立刻解除，不带着错误继续转
//   另外：complete/blocked 只接受人类输入；会话恢复后回到未武装态
// 运行：node --test tests/unit/goals.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createGoal, armGoal, pauseGoal, noteGoalError, settleGoal, disarmAllGoals,
  claimGoalRound, activeGoal, listGoals, goalPrompt, goalPaths, DEFAULT_MAX_ROUNDS,
  advanceGoalTurn,
} from "../../engine/goals.mjs";

const cleanups = [];
function ws() { const d = fs.mkdtempSync(path.join(os.tmpdir(), "yuanshu-goal-")); cleanups.push(d); return d; }
const mk = (w, over = {}) => {
  const r = createGoal(w, { objective: "把记忆模块的重复条目清干净", ...over });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.goal;
};

describe("新建目标：建了不等于开始跑", () => {
  test("默认是 paused（未武装），默认不自动推进", () => {
    const w = ws();
    const g = mk(w);
    assert.equal(g.status, "paused", "建目标不该直接开跑");
    assert.equal(g.autoAdvance, false, "个人伙伴的默认值不该是无人看管自转");
    assert.equal(activeGoal(w), null);
    assert.equal(goalPrompt(w), "", "未武装时不该占上下文");
  });

  test("目标太短被拒", () => {
    const w = ws();
    assert.equal(createGoal(w, { objective: "改" }).ok, false);
  });

  test("回合上限有界（不能设成无限）", () => {
    const w = ws();
    const g = mk(w, { maxRounds: 100000 });
    assert.ok(g.maxRounds <= 200, `上限应被夹住，实际 ${g.maxRounds}`);
    assert.equal(mk(ws()).maxRounds, DEFAULT_MAX_ROUNDS);
  });
});

describe("只有人类能武装、能结清", () => {
  test("armGoal 拒绝模型来源", () => {
    const w = ws(); const g = mk(w);
    const r = armGoal(w, g.id, { origin: "model" });
    assert.equal(r.ok, false);
    assert.match(String(r.reason), /人类/);
    assert.equal(activeGoal(w), null, "被拒后不该真的武装起来");
  });

  test("人类武装后才进活动态", () => {
    const w = ws(); const g = mk(w);
    assert.equal(armGoal(w, g.id, { origin: "human" }).ok, true);
    assert.equal(activeGoal(w)?.id, g.id);
    assert.match(goalPrompt(w), /进行中的目标/);
  });

  test("模型自己宣布完成不算数", () => {
    const w = ws(); const g = mk(w);
    armGoal(w, g.id, { origin: "human" });
    const r = settleGoal(w, g.id, { status: "complete", origin: "model", evidence: "我做完了" });
    assert.equal(r.ok, false);
    assert.match(String(r.reason), /人类/);
    assert.equal(activeGoal(w)?.id, g.id, "目标应仍在活动态");
  });

  test("人类结清可带证据，空证据留痕为 null", () => {
    const w = ws(); const g = mk(w);
    armGoal(w, g.id, { origin: "human" });
    assert.equal(settleGoal(w, g.id, { status: "complete", origin: "human", evidence: "记忆/记忆日志.md 已去重 3 条" }).ok, true);
    const done = listGoals(w).find((x) => x.id === g.id);
    assert.equal(done.status, "complete");
    assert.match(String(done.evidence), /记忆日志/);
    assert.equal(activeGoal(w), null);
  });

  test("受阻也归人类判，且要写原因", () => {
    const w = ws(); const g = mk(w);
    armGoal(w, g.id, { origin: "human" });
    assert.equal(settleGoal(w, g.id, { status: "blocked", origin: "model", reason: "我卡住了" }).ok, false);
    assert.equal(settleGoal(w, g.id, { status: "blocked", origin: "human", reason: "缺凭据，等你提供" }).ok, true);
    assert.match(String(listGoals(w).find((x) => x.id === g.id).blockedReason), /缺凭据/);
  });

  test("系统暂停必须给原因（失败要可见）", () => {
    const w = ws(); const g = mk(w);
    armGoal(w, g.id, { origin: "human" });
    assert.equal(pauseGoal(w, g.id, { origin: "model" }).ok, false, "系统暂停不写原因应被拒");
    assert.equal(pauseGoal(w, g.id, { origin: "model", reason: "用户发新消息了" }).ok, true);
  });
});

describe("闸门①：回合上限", () => {
  test("到顶自动转 blocked，不再放行下一轮", () => {
    const w = ws();
    const g = mk(w, { maxRounds: 3 });
    armGoal(w, g.id, { origin: "human" });
    for (let i = 1; i <= 3; i++) {
      const r = claimGoalRound(w, g.id);
      assert.equal(r.ok, true, `第 ${i} 轮应放行：${JSON.stringify(r)}`);
      assert.equal(r.round, i);
    }
    const over = claimGoalRound(w, g.id);
    assert.equal(over.ok, false);
    assert.equal(over.reason, "round-limit");
    const after = listGoals(w).find((x) => x.id === g.id);
    assert.equal(after.status, "blocked", "到顶应自动转 blocked");
    assert.match(String(after.blockedReason), /回合上限/);
  });
});

describe("闸门②：单轮预约不重复驱动", () => {
  test("同一轮不会驱动两次", () => {
    const w = ws(); const g = mk(w, { maxRounds: 5 });
    armGoal(w, g.id, { origin: "human" });
    assert.equal(claimGoalRound(w, g.id).round, 1);
    const again = claimGoalRound(w, g.id, { round: 1 });
    assert.equal(again.ok, false, "第 1 轮已预约过");
    assert.match(String(again.reason), /已预约/);
  });

  test("revision 不匹配时本轮作废（目标被改过）", () => {
    const w = ws(); const g = mk(w, { maxRounds: 5 });
    armGoal(w, g.id, { origin: "human" });
    const cur = listGoals(w).find((x) => x.id === g.id);
    const stale = claimGoalRound(w, g.id, { revision: cur.revision - 1 });
    assert.equal(stale.ok, false);
    assert.match(String(stale.reason), /revision/);
    assert.equal(claimGoalRound(w, g.id, { revision: cur.revision }).ok, true, "revision 对了应放行");
  });

  test("未武装的目标不驱动", () => {
    const w = ws(); const g = mk(w);
    const r = claimGoalRound(w, g.id);
    assert.equal(r.ok, false);
    assert.match(String(r.reason), /不在活动态/);
  });
});

describe("闸门③：错误即解除", () => {
  test("一轮出错后目标回到 paused 并记下原因", () => {
    const w = ws(); const g = mk(w);
    armGoal(w, g.id, { origin: "human" });
    claimGoalRound(w, g.id);
    noteGoalError(w, g.id, "模型 429");
    const after = listGoals(w).find((x) => x.id === g.id);
    assert.equal(after.status, "paused");
    assert.match(String(after.blockedReason), /本轮出错已停止/);
    assert.match(String(after.blockedReason), /429/);
    assert.equal(activeGoal(w), null);
  });
});

describe("会话恢复：回到未武装态，必须人类重新确认", () => {
  test("disarmAllGoals 把活动目标全部暂停", () => {
    const w = ws();
    const a = mk(w, { objective: "第一个目标要做完" });
    armGoal(w, a.id, { origin: "human" });
    assert.equal(activeGoal(w)?.id, a.id);
    const r = disarmAllGoals(w, { reason: "会话恢复后需人类重新确认" });
    assert.equal(r.disarmed, 1);
    assert.equal(activeGoal(w), null, "重启不该自动续跑");
    assert.equal(goalPrompt(w), "");
  });
});

describe("注入提示词", () => {
  test("含目标、轮次进度与「不要相信早前叙述」的纪律", () => {
    const w = ws(); const g = mk(w, { maxRounds: 8 });
    armGoal(w, g.id, { origin: "human" });
    claimGoalRound(w, g.id);
    const p = goalPrompt(w);
    assert.match(p, /把记忆模块的重复条目清干净/);
    assert.match(p, /第 1\/8 轮/);
    assert.match(p, /不要相信早前叙述/);
    assert.match(p, /你自己宣布完成不算数/);
  });

  test("开着自动推进时如实标注", () => {
    const w = ws(); const g = mk(w, { autoAdvance: false });
    armGoal(w, g.id, { origin: "human", autoAdvance: true });
    assert.match(goalPrompt(w), /自动推进已开/);
  });
});

describe("每轮推进一步（接线点）", () => {
  test("无活动目标时不注入、不推进", () => {
    const w = ws();
    mk(w); // 建了但没武装
    const t = advanceGoalTurn(w);
    assert.equal(t.ok, false);
    assert.equal(t.prompt, "", "没武装就不该占上下文");
  });

  test("活动目标每调一次推进一轮，prompt 反映新轮号", () => {
    const w = ws(); const g = mk(w, { maxRounds: 4 });
    armGoal(w, g.id, { origin: "human" });
    const t1 = advanceGoalTurn(w);
    assert.equal(t1.ok, true);
    assert.equal(t1.round, 1);
    assert.match(t1.prompt, /第 1\/4 轮/);
    const t2 = advanceGoalTurn(w);
    assert.equal(t2.round, 2);
    assert.match(t2.prompt, /第 2\/4 轮/);
  });

  test("到顶后不再注入（闸门①在接线点上也要生效）", () => {
    const w = ws(); const g = mk(w, { maxRounds: 2 });
    armGoal(w, g.id, { origin: "human" });
    assert.equal(advanceGoalTurn(w).ok, true);
    assert.equal(advanceGoalTurn(w).ok, true);
    const over = advanceGoalTurn(w);
    assert.equal(over.ok, false);
    assert.equal(over.prompt, "");
    assert.equal(listGoals(w).find((x) => x.id === g.id).status, "blocked");
  });
});

test.after(() => {
  for (const d of cleanups) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
});
