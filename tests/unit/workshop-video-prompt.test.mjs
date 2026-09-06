import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVideoPrompt, VIDEO_SCENES } from "../../frontend/src/lib/video-prompt.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("自定义格子精简档仍要留下主体动作场景，不能丢规格", () => {
  const p = buildVideoPrompt({
    subject: "韩立",
    action: "转身遁入夜色",
    scene: "空旷山道",
    lighting: "冷月光",
    camera: "缓推近",
    style: "电影感写实",
    quality: "720P 清晰",
    constraint: "无字幕无BGM无变形",
    seconds: "10",
    frame: "16:9",
    richness: "lite",
  });
  assert.match(p, /韩立/);
  assert.match(p, /转身遁入夜色/);
  assert.match(p, /空旷山道/);
  assert.match(p, /冷月光/);
  assert.match(p, /缓推近/);
  assert.match(p, /无字幕|无BGM/);
  assert.match(p, /10/);
  assert.match(p, /16:9/);
});

test("标准档按起承转合写时间轴，不复印万能公式", () => {
  const p = buildVideoPrompt({
    subject: "女主",
    action: "抬头看雨",
    scene: "老巷",
    lighting: "霓虹湿地面",
    camera: "跟拍",
    style: "雨巷电影感",
    quality: "720P",
    constraint: "无烧录字幕",
    seconds: "10",
    frame: "9:16",
    richness: "standard",
    beats: "0-2秒 起：驻足。2-5秒 承：抬头。5-8秒 转：看雨。8-10秒 合：迈步离开",
    memory: "第6秒：雨丝打在睫毛上",
  });
  assert.match(p, /总览/);
  assert.match(p, /0-2|起/);
  assert.match(p, /记忆|第6秒/);
  assert.match(p, /锁定|约束/);
  assert.match(p, /9:16/);
  assert.ok(!p.includes("万能公式"), "标准档禁止再贴一遍格子");
  assert.ok(!p.includes("停在一个可读画面"), "禁止程序空话收尾");
});

test("仙侠镜头卡必须有衣服料子、灯的形制、雾怎么走，不能只写青衣修士", () => {
  const card = VIDEO_SCENES.xianxia;
  const blob = JSON.stringify(card);
  assert.match(blob, /交领|洗白|旧玉/);
  assert.match(blob, /豆油灯|石龛/);
  assert.match(blob, /贴地|山雾/);
  const p = buildVideoPrompt({ sceneKey: "xianxia", richness: "standard" });
  assert.match(p, /交领|洗白|旧玉/);
  assert.match(p, /0-2/);
  assert.match(p, /记忆|第\d秒/);
  assert.ok(!p.includes("万能公式"));
});

test("场景模板覆盖短视频钩子和电影感", () => {
  const keys = Object.keys(VIDEO_SCENES);
  assert.ok(keys.includes("hook"));
  assert.ok(keys.includes("cinematic"));
  assert.ok(VIDEO_SCENES.hook.frame === "9:16");
  assert.ok(VIDEO_SCENES.cinematic.frame === "16:9");
});

test("工坊提示词面板默认走标准档，把镜头卡交给生成器", () => {
  const panel = readFileSync(join(ROOT, "frontend", "src", "components", "VideoPrompt.tsx"), "utf8");
  assert.ok(panel.includes('useState') && panel.includes("standard"), "默认标准档");
  assert.ok(panel.includes("sceneKey"), "生成时要带镜头卡");
  assert.ok(!panel.includes("万能公式 ·"), "界面别再把检查单当标题");
});
