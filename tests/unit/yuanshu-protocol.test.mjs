import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  YUANSHU_PROTOCOL,
  formatSkillIndexPrompt,
  buildYuanshuContext,
  coachToolFailure,
} from "../../engine/yuanshu-protocol.mjs";
import { loadSkillIndex } from "../../engine/context-loader.mjs";
import { repairVideoRequest } from "../../engine/video-request.mjs";
import { leadNote } from "../../engine/engine-pair.mjs";
import { runYuanshuToolRound } from "../../engine/yuanshu-loop.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("元枢工作协议必须点名宿主工具，禁止翻密钥和猜 API", () => {
  assert.match(YUANSHU_PROTOCOL, /generate_video/);
  assert.match(YUANSHU_PROTOCOL, /计划/);
  assert.match(YUANSHU_PROTOCOL, /验收|汇报/);
  assert.match(YUANSHU_PROTOCOL, /auth\.json|\.token/);
  assert.match(YUANSHU_PROTOCOL, /activate_skill/);
  assert.match(YUANSHU_PROTOCOL, /独立|判断/);
  assert.doesNotMatch(YUANSHU_PROTOCOL, /适配器未就绪/);
  assert.doesNotMatch(YUANSHU_PROTOCOL, /禁止.*播放器|禁止 start/);
});

test("buildYuanshuContext 每轮都带协议和技能目录，任务句才带经验/记忆", () => {
  const skills = [{ name: "aigc-video-production", desc: "视频创作" }];
  const idle = buildYuanshuContext({ message: "嗯", skills, experience: ["【经验】x"], fullMemory: ["【记忆】y"] });
  assert.ok(idle.some(s => s.includes("generate_video")));
  assert.ok(idle.some(s => s.includes("aigc-video-production")));
  assert.ok(!idle.some(s => s.includes("【经验】")));
  const task = buildYuanshuContext({ message: "做个视频", skills, experience: ["【经验】x"], fullMemory: ["【记忆】y"] });
  assert.ok(task.some(s => s.includes("【经验】")));
  assert.ok(task.some(s => s.includes("【记忆】")));
});

test("formatSkillIndexPrompt 空列表不占坑", () => {
  assert.equal(formatSkillIndexPrompt([]), "");
  assert.match(formatSkillIndexPrompt([{ name: "seedance-25", desc: "即梦视频" }]), /seedance-25/);
});

test("loadSkillIndex 必须扫到仓库 skills/，不能只看空的 engine/skills", () => {
  const names = loadSkillIndex().map(s => s.name);
  assert.ok(names.includes("aigc-video-production"), "仓库技能库必须进索引");
  assert.ok(names.includes("seedance-25"));
});

test("repairVideoRequest：缺 mode 就补 text，已经有合法 mode 不再空转", () => {
  const fixed = repairVideoRequest("agnes-video-2.5-flash", "GPT-6", {}, "视频任务创建失败 400: mode is required");
  assert.equal(fixed.mode, "text");
  assert.equal(repairVideoRequest("agnes-video-2.5-flash", "x", { mode: "text" }, "mode is required"), null);
});

test("coachToolFailure：视频失败和 bash 探 API 都要给出宿主下一步", () => {
  const v = coachToolFailure("generate_video", { prompt: "x" }, { text: "mode is required", isError: true });
  assert.match(v.text, /generate_video/);
  assert.match(v.text, /判断|汇报|宿主/);
  const b = coachToolFailure("bash", { command: "curl https://apihub.agnes-ai.com/v1/videos" }, { text: "ok", isError: false });
  assert.equal(b.isError, false);
  const b2 = coachToolFailure("bash", { command: "curl /v1/videos" }, { text: "失败", isError: true });
  assert.match(b2.text, /generate_video/);
});

test("leadNote 非原生通道不当成适配器坏了", () => {
  const n = leadNote({ lead: "yuanshu", deferred: "pi", reason: "non-native" });
  assert.match(n, /元枢/);
  assert.match(n, /自制循环/);
  assert.doesNotMatch(n, /未就绪/);
  assert.equal(leadNote({ lead: "pi", deferred: null, reason: "primary" }), "本轮主引擎 · pi");
});

test("runYuanshuToolRound 失败结果要经过纠偏教练", async () => {
  const history = [];
  await runYuanshuToolRound({
    toolCalls: [{ id: "1", type: "function", function: { name: "generate_video", arguments: "{\"prompt\":\"x\"}" } }],
    history,
    execute: async () => ({ text: "视频任务创建失败 400: mode is required", isError: true }),
    policyDecide: () => ({ decision: "allow" }),
    jitForPath: () => [],
  });
  assert.match(String(history[0].content), /不要.*bash|宿主/i);
});

test("handleUnifiedChat 必须常驻元枢协议和技能目录", () => {
  const src = readFileSync(join(ROOT, "engine", "unified-chat.mjs"), "utf8");
  const start = src.indexOf("export async function handleUnifiedChat");
  const fn = src.slice(start, start + 9000);
  assert.ok(fn.includes("buildYuanshuContext") || fn.includes("YUANSHU_PROTOCOL"), "元枢每轮必须注入工作协议");
  assert.ok(fn.includes("loadSkillIndex"), "元枢必须看见技能目录");
});

test("generateVideo 创建失败必须走 repair 再试一次", () => {
  const src = readFileSync(join(ROOT, "engine", "media-api.mjs"), "utf8");
  const start = src.indexOf("export async function startVideoJob");
  const fn = src.slice(start, src.indexOf("export async function handleMedia", start));
  assert.ok(fn.includes("repairVideoRequest"), "缺字段由宿主补，不要丢回给模型猜");
});
