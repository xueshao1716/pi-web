// AIBody 的「土壤」：五个状态提供者的真实读数（engine/aibody-soil.mjs）
//
// 起因：这五项里原本有三项是**写死的字符串**（identity / governance / genes 的 summary），
// 只有 count 是真的；memory 只证明文件存在。而它们每轮都会被拼进 directive 交给模型，
// 于是模型被告知"固定记忆已接入"，不管是否属实。
//
// 这里的规矩：**每一项都要能被真实读到；读不到就返回 null**，由 policy 标 not_observed。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createSoilReader } from "../../engine/aibody-soil.mjs";
import { providerState, PROVIDERS } from "../../engine/aibody-runtime-policy.mjs";

function tmpdir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `yuanshu-soil-${tag}-`));
}

/** 造一个可控的 emotion 假体：只实现土壤用到的那两个方法。 */
function fakeEmotion({ genome = null, snapshots = {} } = {}) {
  return {
    getGenome: () => genome,
    getSnapshot: key => snapshots[key] ?? null,
  };
}

test("identity：读真实人格附录文件的大小与更新时间，不是「元枢主角色：小语」这句常量", () => {
  const agentDir = tmpdir("id");
  try {
    fs.writeFileSync(path.join(agentDir, "APPEND_SYSTEM.md"), "x".repeat(2048));
    const soil = createSoilReader({ agentDir, cwd: agentDir, emotion: fakeEmotion() })({});
    assert.ok(soil.identity, "有文件就该观测到");
    assert.match(soil.identity.summary, /APPEND_SYSTEM\.md/);
    assert.match(soil.identity.summary, /2\.0KB/);
    assert.equal(soil.identity.details.bytes, 2048);
    assert.ok(soil.identity.details.updatedAt, "要带真实更新时间");
  } finally { fs.rmSync(agentDir, { recursive: true, force: true }); }
});

test("identity：没有文件就返回 null（not_observed），不编一句「身份已加载」", () => {
  const agentDir = tmpdir("id-empty");
  try {
    const soil = createSoilReader({ agentDir, cwd: agentDir, emotion: fakeEmotion() })({});
    assert.equal(soil.identity, null);
  } finally { fs.rmSync(agentDir, { recursive: true, force: true }); }
});

test("genes：报真实条数与**真实漂移**，而不是「已加载」这种空话", () => {
  const genome = { genes: {
    curiosity: { expression: 0.6, baseline: 0.6 },     // 不漂
    gentleness: { expression: 0.2, baseline: 0.7 },    // 漂 0.5
    learning: { expression: 0.9, baseline: 0.5 },      // 漂 0.4
  }, proposals: [], reviews: [], snapshots: [{}] };
  const soil = createSoilReader({ agentDir: "", cwd: "", emotion: fakeEmotion({ genome }) })({});
  assert.ok(soil.genes);
  assert.match(soil.genes.summary, /3 个基因/);
  assert.match(soil.genes.summary, /2 个偏离基线/);
  assert.deepEqual(soil.genes.details.drifted.sort(), ["gentleness", "learning"]);
  assert.equal(soil.genes.details.count, 3);
  assert.equal(soil.genes.details.snapshots, 1);
});

test("genes：全部贴近基线时也要如实说，不虚报漂移", () => {
  const genome = { genes: { a: { expression: 0.5, baseline: 0.5 } }, proposals: [], reviews: [], snapshots: [] };
  const soil = createSoilReader({ agentDir: "", cwd: "", emotion: fakeEmotion({ genome }) })({});
  assert.match(soil.genes.summary, /均贴近基线/);
  assert.deepEqual(soil.genes.details.drifted, []);
});

test("emotion：只认**本会话**的观测；没聊过的会话返回 null，不拿别的会话凑数", () => {
  const snapshots = { "sess-talked": { lastTalk: Date.now() - 3600_000, primary: "happy", secondary: "calm", intensity: 0.8 } };
  const emotion = fakeEmotion({ snapshots });
  const soil = createSoilReader({ agentDir: "", cwd: "", emotion });

  const me = soil({ sessionId: "sess-talked" }).emotion;
  assert.ok(me, "本会话有观测就该报");
  assert.match(me.summary, /happy/);
  assert.match(me.summary, /0\.8/);

  assert.equal(soil({ sessionId: "someone-else" }).emotion, null, "别的会话的状态不能算我的观测");
  assert.equal(soil({}).emotion, null, "没有 sessionId 就不该猜");
  // getSnapshot 对未知会话会造默认态返回 → 不能被它骗过去
  const defaultish = fakeEmotion({ snapshots: { unknown: { lastTalk: null, primary: "平静" } } });
  assert.equal(createSoilReader({ agentDir: "", cwd: "", emotion: defaultish })({ sessionId: "unknown" }).emotion, null,
    "lastTalk 为空说明从未真观测到");
});

test("memory：报真实大小、条目数与更新时间，而不是「文件存在」这一条", () => {
  const cwd = tmpdir("mem");
  try {
    fs.writeFileSync(path.join(cwd, "记忆.md"), "# 一\n内容\n## 二\n内容\n### 三\n内容\n");
    const soil = createSoilReader({ agentDir: "", cwd, emotion: fakeEmotion() })({});
    assert.ok(soil.memory);
    assert.match(soil.memory.summary, /固定记忆/);
    assert.equal(soil.memory.details.sections, 3, "标题层级都算条目");
    assert.ok(soil.memory.details.bytes > 0);
    assert.ok(soil.memory.details.updatedAt);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test("memory：没有记忆文件就是 null", () => {
  const cwd = tmpdir("mem-empty");
  try {
    assert.equal(createSoilReader({ agentDir: "", cwd, emotion: fakeEmotion() })({}).memory, null);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test("governance：报真实待批提案数，而不是「保持人工确认」这句常量", () => {
  const genome = {
    genes: { a: { expression: 0.5, baseline: 0.5 } },
    proposals: [{ gene: "gentleness", status: "pending" }, { gene: "learning", status: "pending" }, { gene: "x", status: "approved" }],
    reviews: [{}, {}],
    snapshots: [],
  };
  const soil = createSoilReader({ agentDir: "", cwd: "", emotion: fakeEmotion({ genome }) })({});
  assert.match(soil.governance.summary, /2 条人格\/基因提案待人工确认/);
  assert.equal(soil.governance.details.pending, 2);
  assert.equal(soil.governance.details.reviewed, 2);
  assert.deepEqual(soil.governance.details.geneNames.sort(), ["gentleness", "learning"]);
});

test("governance：没有待批提案时如实说 0，而不是笼统的「保持确认」", () => {
  const genome = { genes: { a: { expression: 0.5, baseline: 0.5 } }, proposals: [], reviews: [], snapshots: [] };
  const soil = createSoilReader({ agentDir: "", cwd: "", emotion: fakeEmotion({ genome }) })({});
  assert.match(soil.governance.summary, /无待批提案/);
  assert.equal(soil.governance.details.pending, 0);
});

test("单项抛异常不能拖垮整块土壤（policy 是整体 try/catch 的）", () => {
  const broken = {
    getGenome: () => { throw new Error("基因系统炸了"); },
    getSnapshot: () => { throw new Error("情绪系统炸了"); },
  };
  const cwd = tmpdir("broken");
  try {
    fs.writeFileSync(path.join(cwd, "记忆.md"), "# 一\n");
    const soil = createSoilReader({ agentDir: "", cwd, emotion: broken })({ sessionId: "s" });
    assert.equal(soil.genes, null, "炸掉的那项降级为 null");
    assert.equal(soil.emotion, null);
    assert.equal(soil.governance, null);
    assert.ok(soil.memory, "其它项必须照常读到——一项坏掉不能把整块土壤变成 unavailable");
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test("接进 policy 后：读不到就是 not_observed，不再冒充 observed", () => {
  const soil = createSoilReader({ agentDir: "", cwd: "", emotion: fakeEmotion() });
  const state = providerState(soil, { sessionId: "s" });
  assert.deepEqual(Object.keys(state).sort(), [...PROVIDERS].sort(), "五项都要在");
  for (const key of PROVIDERS) {
    assert.equal(state[key].status, "not_observed", `${key} 读不到就该是 not_observed`);
    assert.equal(state[key].summary, "未观测");
  }
});

// ── A：土壤要接回**主角色**（原先只传给子智能体）──
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

test("A：directive 真的会进 system prompt（runtime 段本来就是个空口子）", async () => {
  const { assembleYuanshuSystem } = await import("../../engine/yuanshu-seams.mjs");
  const sections = assembleYuanshuSystem({ runtime: "【AIBody 运行协调】模式=builder" }, null, {});
  assert.match(sections.runtime, /AIBody 运行协调/, "runtime 段必须原样保留");
  const { assemblePrompt } = await import("../../engine/yuanshu-prompt.mjs");
  assert.match(assemblePrompt(sections), /AIBody 运行协调/, "它必须真的出现在拼好的 system 里");
});

test("A：两条路径都把 directive 交给主角色", () => {
  const server = read("server.mjs");
  assert.match(server, /aibodyTurn\?\.directive/, "Pi 路径要把它注入主角色上下文");
  const chat = read("engine", "unified-chat.mjs");
  assert.match(chat, /runtime: runContext\?\.aibodyContext\?\.strategy/, "兜底路径要把它放进 runtime 段");
  // 不能再只给子智能体
  const subagent = read("engine", "subagent.mjs");
  assert.match(subagent, /aibodyContext/, "子智能体那条路要保留");
});

test("A：AIBody 记录的 engine 用真实观测值，且声明在 attach 之前（否则 TDZ）", () => {
  const server = read("server.mjs");
  assert.match(server, /engine: observedEngine/, "attach 必须记录真实引擎，不能硬编码 yuanshu");
  assert.ok(!/engine:\s*"yuanshu",\s*\n\s*source:\s*"chat"/.test(server), "不该再有硬编码");
  const decl = server.indexOf("const observedEngine =");
  const attach = server.indexOf("const aibodyTurn = aibodyHost.attach");
  assert.ok(decl > 0 && attach > 0, "两处都应存在");
  assert.ok(decl < attach, "observedEngine 必须先声明——放在 attach 之后会 TDZ 崩（踩过一次）");
});
