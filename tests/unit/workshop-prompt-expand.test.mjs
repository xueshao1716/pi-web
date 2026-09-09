import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseExpandJson,
  expandWorkshopPrompt,
  fallbackExpand,
  EXPAND_SKILLS,
  loadExpandSkillHint,
  handleExpandPrompt,
} from "../../engine/workshop-prompt-expand.mjs";

test("parseExpandJson 抽出 prompt 和字段", () => {
  const r = parseExpandJson('废话{"prompt":"雨夜里女孩等车","fields":{"subject":"女孩","scene":"公交站"}}尾巴');
  assert.equal(r.prompt, "雨夜里女孩等车");
  assert.equal(r.fields.subject, "女孩");
  assert.equal(r.fields.scene, "公交站");
});

test("模型给出完整 JSON 时用模型稿", async () => {
  const r = await expandWorkshopPrompt({
    kind: "image",
    idea: "雨中等公交的女孩",
    chat: async () => ({ text: '{"prompt":"雨夜里一位二十出头的女孩站在站台檐下，校服外套肩头深了一块，远处车灯拉成长条。写实摄影，半身，窗灯冷白。","fields":{"subject":"女孩","bg":"公交站"}}' }),
  });
  assert.match(r.prompt, /女孩|站台|车灯/);
  assert.equal(r.source, "model");
  assert.equal(r.fields.subject, "女孩");
});

test("模型胡话时走规则扩写，不能交空白", async () => {
  const r = await expandWorkshopPrompt({
    kind: "video",
    idea: "韩立转身遁入夜色",
    chat: async () => ({ text: "I cannot help with that" }),
  });
  assert.equal(r.source, "fallback");
  assert.match(r.prompt, /韩立/);
  assert.match(r.prompt, /夜色|转身/);
});

test("规则扩写至少保住用户原句", () => {
  const img = fallbackExpand("image", "一只橘猫蹲在屋顶");
  assert.match(img.prompt, /橘猫/);
  const vid = fallbackExpand("video", "韩立转身遁入夜色");
  assert.match(vid.prompt, /韩立/);
  assert.match(vid.prompt, /【物理】/);
  assert.ok(!vid.prompt.includes("里最清楚的那一拍"));
});

test("对话类一句话规则扩写要用过肩正反打，不能禁第二个人", () => {
  const r = fallbackExpand("video", "两人在茶馆对谈，一问一答");
  assert.match(r.prompt, /茶馆|对谈/);
  assert.match(r.prompt, /过肩|正反打/);
  assert.match(r.prompt, /口型/);
  assert.ok(!r.prompt.includes("无多余人物"));
});

test("大话西游对白不能只贴原句当万能镜头，要有人和衣服和动作", () => {
  const r = fallbackExpand("video", "大话西游经典场景，牛是牛妈生的，人是人妈生的");
  assert.match(r.prompt, /至尊宝|紫霞/);
  assert.match(r.prompt, /白衣|紫衣|披帛|束发/);
  assert.match(r.prompt, /口型|对白/);
  assert.match(r.prompt, /过肩|正反打/);
  assert.match(r.prompt, /【物理】/);
  assert.match(r.prompt, /牛是牛妈生的|人是人妈生的/);
  assert.ok(!r.prompt.includes("里最清楚的那一拍"), "记忆点不许拿原句糊弄");
  assert.ok(!r.prompt.includes("镜头跟住主体，动作一次做完"), "不许万能跟拍空话");
  assert.match(String(r.fields.subject || ""), /至尊宝|紫霞/);
  assert.ok(r.fields.action);
  assert.ok(r.fields.scene);
});

test("server 挂上工坊智能填充接口", () => {
  const src = readFileSync(new URL("../../server.mjs", import.meta.url), "utf8");
  assert.ok(src.includes("/api/workshop/expand-prompt"));
  assert.ok(src.includes("handleExpandPrompt"));
});

test("出图填充绑万像技能，视频填充绑 Seedance/SHORTFORM", () => {
  assert.deepEqual(EXPAND_SKILLS.image, ["wanxiang-portrait", "wanxiang-design"]);
  assert.deepEqual(EXPAND_SKILLS.video, ["seedance-25", "shortform-genesis"]);
  assert.ok(!EXPAND_SKILLS.image.includes("prompt-architect"), "架构师会反问，不能拿来直接填");
});

test("loadExpandSkillHint 把技能正文拼进 hint", () => {
  const r = loadExpandSkillHint("image", {
    readSkill: (name) => name === "wanxiang-portrait" ? "五要素必须填：主体、服饰、构图、光影、风格" : "",
  });
  assert.deepEqual(r.names, ["wanxiang-portrait"]);
  assert.match(r.hint, /wanxiang-portrait/);
  assert.match(r.hint, /五要素/);
});

test("仓库里的万像/Seedance 技能填充时读得到", () => {
  const img = loadExpandSkillHint("image");
  assert.ok(img.names.includes("wanxiang-portrait"), img.names.join(","));
  assert.ok(img.names.includes("wanxiang-design"), img.names.join(","));
  const vid = loadExpandSkillHint("video");
  assert.ok(vid.names.includes("seedance-25"), vid.names.join(","));
  assert.ok(vid.names.includes("shortform-genesis"), vid.names.join(","));
});

test("模型扩写必须看见技能 hint，不能只拿空 HINT", async () => {
  let seen = "";
  const r = await expandWorkshopPrompt({
    kind: "video",
    idea: "韩立转身遁入夜色",
    skillHint: "【技能 seedance-25】四层：总览、时间轴、锁定、规格",
    chat: async (_msg, opts) => {
      seen = String(opts?.systemHint || "");
      return { text: '{"prompt":"【总览】韩立转身遁入夜色","fields":{"subject":"韩立"}}' };
    },
  });
  assert.equal(r.source, "model");
  assert.match(seen, /seedance-25/);
  assert.match(seen, /四层/);
});

test("handleExpandPrompt 回传所用模型和技能，并限短输出", async () => {
  const flash = { provider: "agnes", id: "agnes-2.5-flash", name: "Flash", capabilities: { text: true } };
  const pro = { provider: "agnes", id: "agnes-2.5-pro", name: "Pro", capabilities: { text: true } };
  let captured = null;
  const chunks = [];
  const res = {
    writeHead() {},
    end(s) { chunks.push(s); },
  };
  await handleExpandPrompt({
    defaultModel: pro,
    getModelList: () => [pro, flash],
    directChat: async (model, msg, hist, opts) => {
      captured = { model, msg, opts };
      return { text: '{"prompt":"雨夜里女孩等车，写实半身。","fields":{"look":"女孩"}}' };
    },
    readSkill: (name) => name === "wanxiang-portrait" ? "写真五要素" : "平面三维坐标",
  }, res, { kind: "image", idea: "雨中等公交的女孩" });
  const body = JSON.parse(chunks.join("") || "{}");
  assert.equal(body.ok, true);
  assert.equal(body.model, "agnes/agnes-2.5-flash");
  assert.ok(body.skills.includes("wanxiang-portrait"));
  assert.ok(body.skills.includes("wanxiang-design"));
  assert.equal(captured.model, flash);
  assert.match(String(captured.opts?.systemHint || ""), /写真五要素|三维坐标|wanxiang/);
  assert.ok((captured.opts?.maxTokens || 0) <= 2048, "填充不许开 8192 空转");
  assert.equal(captured.opts?.thinking, false, "GLM-5 默认开思考，填充必须关掉否则 30s 前端先超时");
  assert.ok((captured.opts?.timeout || 0) <= 15000 && (captured.opts?.timeout || 0) >= 8000, "模型预算须短于前端 30s");
});

test("技能 hint 只带精要，不能把整份 SKILL.md 塞进 system", () => {
  const huge = `${"核心约束：主体完整。\n".repeat(80)}${"x".repeat(20000)}`;
  const r = loadExpandSkillHint("image", { readSkill: () => huge });
  assert.ok(r.names.includes("wanxiang-portrait"));
  assert.ok(r.hint.length < 2200, `hint 太长 ${r.hint.length}`);
  assert.match(r.hint, /核心约束|主体/);
});

test("模型卡住时立刻走规则兜底，不能把前端拖到请求超时", { timeout: 500 }, async () => {
  const t0 = Date.now();
  const r = await expandWorkshopPrompt({
    kind: "image",
    idea: "一个身材曲线迷人的美女跳病友舞",
    chatTimeoutMs: 40,
    chat: () => new Promise(() => {}),
  });
  assert.ok(Date.now() - t0 < 400, `等了 ${Date.now() - t0}ms`);
  assert.equal(r.source, "fallback");
  assert.match(r.prompt, /病友舞|美女/);
});

test("前端填充能选文本模型，并把 model 发给接口", () => {
  const fill = readFileSync(new URL("../../frontend/src/components/PromptSmartFill.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../../frontend/src/api.ts", import.meta.url), "utf8");
  assert.ok(fill.includes("WorkshopModelPicker") || fill.includes("useWorkshopModel"), "填充旁必须能选文本模型");
  assert.match(fill, /expandPrompt\([\s\S]*model/);
  assert.match(fill, /skills|带了|用了/);
  assert.match(fill, /规则扩写/);
  assert.match(api, /expandPrompt:[\s\S]*model\??/);
});
