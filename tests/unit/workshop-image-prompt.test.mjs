import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { composeImagePrompt, composeImageShot, IMAGE_GRAMMARS, IMAGE_EXAMPLES } from "../../frontend/src/lib/image-prompt.mjs";

test("人像提示词是可拍段落，不是顿号标签堆", () => {
  const p = composeImagePrompt({
    ptype: "真人",
    gender: "女性",
    age: 28,
    face: "鹅蛋脸",
    look: "眉眼细长，发丝贴着颈侧",
    skintone: "瓷白",
    height: 168,
    weight: 52,
    body: "沙漏形",
    expression: "浅笑，视线看镜头",
    outfit: "深色有领上衣",
    shot: "半身特写",
    angle: "平视",
    pose: "双肩放松，一手搭在椅背",
    lighting: "窗边柔光",
    mood: "唯美朦胧",
    style: "自然光写实主义",
    bg: "纯白背景",
    tech: ["超清画质高细节"],
  });
  assert.match(p, /女性/);
  assert.match(p, /窗边柔光/);
  assert.match(p, /深色有领上衣/);
  assert.ok(!p.startsWith("真人，女性，28岁"), "禁止把五要素顿号串直接丢给模型");
  assert.ok(p.includes("。") || p.includes("，"), "要成句");
  assert.ok(!p.includes("porcelain_tone"), "出图框不要实验室色号");
});

test("构图骨架是拍法不是故事，至少十种，不能写死发冠和民国袄", () => {
  const keys = Object.keys(IMAGE_GRAMMARS);
  assert.ok(keys.length >= 10, `骨架太少：${keys.join(",")}`);
  assert.ok(keys.includes("free"), "默认要有自由骨架");
  const blob = JSON.stringify(IMAGE_GRAMMARS);
  assert.ok(!blob.includes("大发冠"), "古风故事不该写进骨架");
  assert.ok(!blob.includes("民国风味"), "情绪故事不该写进骨架");
  assert.ok(!blob.includes("流体金属"), "概念故事不该写进骨架");
  for (const g of Object.values(IMAGE_GRAMMARS)) {
    assert.equal(g.look || "", "", `${g.name} 不该预填外貌`);
    assert.equal(g.outfit || "", "", `${g.name} 不该预填服装`);
  }
});

test("示例成稿单独收着，点骨架不能覆盖已填外貌服装", () => {
  assert.ok(IMAGE_EXAMPLES.gufeng);
  assert.match(String(IMAGE_EXAMPLES.gufeng.outfit || ""), /发冠|珠宝/);
  const panel = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "frontend", "src", "components", "WanXiang.tsx"), "utf8");
  assert.match(panel, /构图骨架/);
  assert.match(panel, /示例成稿/);
  assert.match(panel, /useState(?:<SceneKey>)?\('free'\)/);
  assert.ok(panel.includes("pickGrammar"), "点骨架走 pickGrammar");
  const grammarFn = panel.slice(panel.indexOf("pickGrammar"), panel.indexOf("pickExample") === -1 ? panel.length : panel.indexOf("pickExample"));
  assert.ok(!grammarFn.includes("setLook"), "骨架不许把外貌改成示例里的脸");
  assert.ok(!grammarFn.includes("setOutfit"), "骨架不许把衣服改成示例里的袄");
});

test("古风衣服配高对比单灯，光影要带上宫廷金，不能只剩下拉里的戏剧聚光", () => {
  const shot = composeImageShot(IMAGE_GRAMMARS.chiaroscuro, {
    outfit: "华丽繁复垂坠大发冠，珠宝流苏",
    bg: "古风宫廷背景",
  });
  assert.match(shot.lighting, /金|宫廷|暖/);
  assert.match(shot.lighting, /聚光|单灯|切开/);
  assert.ok(shot.lighting.length > 4, "光影必须是现写的句子");
});

test("绘图光影风格能手改，填充不必白名单", () => {
  const panel = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "frontend", "src", "components", "WanXiang.tsx"), "utf8");
  const grammarFn = panel.slice(panel.indexOf("pickGrammar"), panel.indexOf("pickExample"));
  assert.match(grammarFn, /composeImageShot/);
  const fill = panel.slice(panel.indexOf("onFilled"));
  assert.ok(!fill.includes("['窗边柔光'"), "填充光影不要白名单");
  assert.match(panel, /光影[\s\S]{0,200}<input/);
});
