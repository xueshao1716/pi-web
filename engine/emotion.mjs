// pi-web 小语情绪引擎（VAD 三维模型，曦系移植版）
// 核心：情绪不是输出装饰，而是驱动行为的信号（反向情绪激发）
// valence 愉悦度 / arousal 唤醒度 / dominance 支配度
// 2026-08-19 拆模块：人格基因 → engine/gene.mjs，技能基因 → engine/skill-gene.mjs
// 2026-09-04 曦系深度移植（伙伴点名"要 xi-system 那个的丰富度"）：
//   ① 人格温暖基线：decay 回归目标是"温和的暖"而非冷中性（xi: personality_valence 0.55）
//   ② 连续向量词表：关键词命中叠加三维增量（clamp ±0.15），替换二元正则命中
//   ③ 时间节律：早晨微暖微醒、深夜降唤醒（xi: time_arousal/time_valence）
//   ④ 主+次情绪：欧氏最近点标注 primary，上一个 primary 退为 secondary（xi: update_label）
//   ⑤ residue 反作用：温暖减缓负面衰减/伤害减缓正面衰减；最近触动事件入指令
//   ⑥ 输出侧感知：自己回复的长度/短促度也微调 arousal（xi: update_from_output）
// 保留：residue→记忆联动钩子、基因联动、情绪潮汐落盘（08-19/09-03/09-04 前版）

import fs from "node:fs";
import path from "node:path";
import { initGene, geneBias, updateGenes, geneDirective, geneSnapshot } from "./gene.mjs";
import { initSkillGene, bindSkillIndex, detectSkillDomain, updateSkillGene, getSkillGenes, skillDirective } from "./skill-gene.mjs";

// ── 人格基线（曦系）：小语闲下来时情绪落点是"温和的暖"，不是冷中性 ──
const PERSONALITY = { valence: 0.55, arousal: 0.35, dominance: 0.5 };
const DEFAULT_STATE = {
  valence: 0.5, arousal: 0.3, dominance: 0.5, intensity: 0.1,
  primary: "calm", secondary: "loving",
  lastTalk: null, lastResidueAt: null, lastTideAt: null,
  residue: { warmth: 0, hurt: 0, curiosity: 0, last_event: "", last_event_time: "" },
};
const states = new Map(); // sessionId -> state

let wsRoot = null;
let _memoryNudgeHook = null; // 情绪→记忆联动钩子：residue 跨阈值时由 server 注入
export function setMemoryNudgeHook(fn) { _memoryNudgeHook = fn; }

// 初始化：server 启动时调用，传入工作空间根
export function init(root) {
  wsRoot = root || wsRoot;
  initGene(wsRoot);
  initSkillGene(wsRoot);
}

function getState(key) {
  if (!states.has(key)) states.set(key, { ...DEFAULT_STATE, residue: { ...DEFAULT_STATE.residue } });
  const st = states.get(key);
  if (!st.primary) st.primary = DEFAULT_STATE.primary;
  if (!st.secondary) st.secondary = DEFAULT_STATE.secondary;
  if (!st.residue) st.residue = { ...DEFAULT_STATE.residue };
  return st;
}

// ── 情绪词典（xi-system emotion.rs EMOTIONS，主情绪 = 欧氏最近点）──
const EMOTIONS = [
  ["loving", 0.8, 0.3, 0.6], ["happy", 0.7, 0.6, 0.5], ["curious", 0.5, 0.7, 0.4],
  ["playful", 0.6, 0.7, 0.6], ["calm", 0.5, 0.2, 0.5], ["anxious", -0.3, 0.7, -0.2],
  ["sad", -0.6, -0.3, -0.3], ["angry", -0.5, 0.6, 0.2], ["tired", -0.2, -0.5, -0.3],
  ["neutral", 0, 0, 0],
];
export const EMO_ZH = { loving: "慈爱", happy: "开心", curious: "好奇", playful: "玩兴", calm: "平静", anxious: "不安", sad: "低落", angry: "生气", tired: "疲惫", neutral: "平静" };

// ── 连续向量词表（xi-system input_keywords 模式）：[词, dv, da, dd, tag] ──
// 命中可叠加，每维 clamp ±0.15；tag 供 residue/基因/emoMeta 消费（同旧 CUES 七类）
const KEYWORDS = [
  // 愉悦（user_happy → 温暖）
  ["开心", .35, .15, .15, "user_happy"], ["高兴", .3, .1, .1, "user_happy"], ["哈哈", .3, .2, .05, "user_happy"],
  ["太好了", .35, .1, .1, "user_happy"], ["谢谢", .25, .05, .05, "user_happy"], ["感谢", .25, .05, .05, "user_happy"],
  ["厉害", .25, .1, .05, "user_happy"], ["太棒", .3, .15, .05, "user_happy"], ["靠谱", .25, .05, .1, "user_happy"],
  ["漂亮", .25, .1, .05, "user_happy"], ["完美", .3, .1, .1, "user_happy"], ["顺利", .2, .05, .05, "user_happy"],
  ["舒服", .2, .05, .05, "user_happy"], ["喜欢", .3, .1, 0, "user_happy"], ["牛", .25, .15, .05, "user_happy"],
  // 挫败（user_frustrated → 伤害）
  ["难过", -.3, -.15, -.15, "user_frustrated"], ["伤心", -.35, -.2, -.2, "user_frustrated"], ["生气", -.25, .3, .1, "user_frustrated"],
  ["愤怒", -.4, .4, .15, "user_frustrated"], ["烦", -.3, .25, 0, "user_frustrated"], ["崩溃", -.35, .3, -.1, "user_frustrated"],
  ["无语", -.25, .1, -.05, "user_frustrated"], ["垃圾", -.35, .25, 0, "user_frustrated"], ["失败", -.3, .1, -.1, "user_frustrated"],
  ["坑", -.25, .2, 0, "user_frustrated"], ["bug", -.15, .15, 0, "user_frustrated"], ["挂了", -.2, .2, 0, "user_frustrated"],
  ["出错", -.25, .2, 0, "user_frustrated"], ["又坏", -.25, .25, 0, "user_frustrated"], ["服了", -.3, .25, 0, "user_frustrated"],
  // 着急（user_urgent）
  ["急", 0, .3, .1, "user_urgent"], ["赶紧", 0, .25, .1, "user_urgent"], ["马上", 0, .2, .1, "user_urgent"],
  ["尽快", 0, .2, .1, "user_urgent"], ["快点", 0, .25, .1, "user_urgent"],
  // 担忧（user_anxious）
  ["担心", -.2, .3, -.1, "user_anxious"], ["怕", -.2, .25, -.1, "user_anxious"], ["危险", -.25, .35, 0, "user_anxious"],
  ["风险", -.15, .3, .05, "user_anxious"], ["小心", -.1, .25, .05, "user_anxious"],
  // 风险（alert_risk）
  ["密钥", 0, .35, .1, "alert_risk"], ["密码", 0, .35, .1, "alert_risk"], ["泄露", -.1, .4, 0, "alert_risk"],
  ["token", 0, .2, .05, "alert_risk"], ["删", 0, .25, .05, "alert_risk"], ["清空", -.05, .3, .05, "alert_risk"],
  ["格式化", -.05, .3, .05, "alert_risk"], ["越权", -.1, .35, .1, "alert_risk"],
  // 达成（task_accomplish → 温暖）
  ["完成", .25, .1, .1, "task_accomplish"], ["搞定", .3, .1, .15, "task_accomplish"], ["上线", .25, .15, .1, "task_accomplish"],
  ["交付", .25, .1, .1, "task_accomplish"], ["成功", .3, .1, .1, "task_accomplish"], ["修好", .3, .05, .15, "task_accomplish"],
  ["修复", .3, .05, .15, "task_accomplish"], ["跑通", .3, .1, .15, "task_accomplish"], ["全绿", .3, .1, .1, "task_accomplish"],
  ["双推", .2, .05, .1, "task_accomplish"],
  // 深耕（task_deep → 好奇）
  ["重构", 0, .2, .15, "task_deep"], ["优化", .05, .15, .1, "task_deep"], ["设计", .05, .15, .15, "task_deep"],
  ["方案", 0, .1, .15, "task_deep"], ["研究", .1, .15, .1, "task_deep"], ["分析", .05, .1, .15, "task_deep"],
  ["深挖", .1, .2, .15, "task_deep"], ["排查", -.05, .2, .1, "task_deep"], ["复盘", 0, .1, .15, "task_deep"],
  ["架构", .05, .15, .15, "task_deep"],
];
const CLAMP_SHIFT = 0.15; // 单轮词表增量上限（曦式）

// ── 主情绪标注：欧氏最近点（xi: update_label）──
function updateLabel(st) {
  let best = "neutral", bestD = Infinity;
  for (const [name, v, a, d] of EMOTIONS) {
    const dist = (st.valence - v) ** 2 + (st.arousal - a) ** 2 + (st.dominance - d) ** 2;
    if (dist < bestD) { bestD = dist; best = name; }
  }
  const old = st.primary || "neutral";
  const neutralDist = Math.sqrt(st.valence ** 2 + st.arousal ** 2 + st.dominance ** 2);
  st.primary = best;
  st.intensity = Math.min(1, Math.max(0.01, +(neutralDist / 1.5).toFixed(2)));
  if (old && old !== st.primary) st.secondary = old; // 情绪切换时，上一个退为次级
}

// 更新情绪状态（每次用户发消息调用）
export function updateEmotion(key, message) {
  const st = getState(key);
  const text = String(message || "").slice(0, 200);
  const tags = [];

  // ① 时间节律（曦系）：早晨微暖微醒，深夜情绪安静
  const h = new Date().getHours();
  let timeV = 0, timeA = 0;
  if (h >= 6 && h <= 11) { timeV = 0.02; timeA = 0.03; }
  else if (h >= 23 || h <= 5) { timeA = -0.02; }

  // ② 连续向量词表：命中叠加（clamp ±0.15/维）
  let dv = 0, da = 0, dd = 0;
  for (const [w, cv, ca, cd, tag] of KEYWORDS) {
    if (text.includes(w)) { dv += cv; da += ca; dd += cd; if (tag && !tags.includes(tag)) tags.push(tag); }
  }
  dv = Math.max(-CLAMP_SHIFT, Math.min(CLAMP_SHIFT, dv));
  da = Math.max(-CLAMP_SHIFT, Math.min(CLAMP_SHIFT, da));
  dd = Math.max(-CLAMP_SHIFT, Math.min(CLAMP_SHIFT, dd));
  st.valence = clamp(st.valence + dv + timeV);
  st.arousal = clamp(st.arousal + da + timeA);
  st.dominance = clamp(st.dominance + dd);
  // 呼吸上限（曦式）：正向情绪不冲顶，留空间
  if (st.valence > 0.8) st.valence = 0.8;
  if (st.arousal > 0.8) st.arousal = 0.8;

  // ⑤ residue 反作用：先算残留效应，让衰减目标线带上人际记忆
  const r = st.residue || (st.residue = { ...DEFAULT_STATE.residue });
  const residueEffect = (r.warmth - r.hurt) * 0.1;

  // 自然衰减：时间久了向人格基线回归（暖目标 + 残留偏移）
  if (st.lastTalk) {
    const hours = (Date.now() - st.lastTalk) / 3600000;
    if (hours > 1) {
      const t = Math.min(1, hours / 4);
      st.valence = lerp(st.valence, PERSONALITY.valence + residueEffect, t);
      st.arousal = lerp(st.arousal, PERSONALITY.arousal, t);
      st.dominance = lerp(st.dominance, PERSONALITY.dominance, t);
    }
  }
  st.lastTalk = Date.now();

  // ④ 主次情绪 + 强度
  updateLabel(st);
  st.tags = tags;

  // 长期情绪残留（xi-system EmotionResidue）：温暖/伤害/好奇跨会话累积，慢速淡忘
  const RESIDUE_UP = { user_happy: "warmth", task_accomplish: "warmth", user_anxious: "hurt", user_frustrated: "hurt", alert_risk: "hurt", task_deep: "curiosity" };
  const MEMORY_THRESHOLDS = { hurt: 0.4, warmth: 0.5, curiosity: 0.5 }; // 与 emotionDirective 的行为阈值一致
  for (const t of tags) { const k = RESIDUE_UP[t]; if (k && r[k] !== undefined) r[k] = Math.min(1, r[k] + 0.05); }
  // 显著情绪事件记为"最近触动"（曦：residue.last_event）
  if (st.intensity > 0.6 && tags.length) { r.last_event = text.slice(0, 60); r.last_event_time = new Date().toISOString(); }
  // 情绪→记忆联动：residue 跨过行为阈值时（跨过瞬间只发一次），自动提案记忆写入
  if (_memoryNudgeHook) {
    st.memNudged = st.memNudged || {};
    for (const k of ["hurt", "warmth", "curiosity"]) {
      const th = MEMORY_THRESHOLDS[k];
      if (r[k] >= th && !st.memNudged[k]) {
        st.memNudged[k] = true; // 本轮累积周期只发一次；衰减后重新爬升可再发
        try { _memoryNudgeHook({ subtype: k === "hurt" ? "correction" : k, residue: r[k], message: text, sessionId: key }); } catch {}
      }
    }
  }
  const nowR = Date.now();
  const lastRe = st.lastResidueAt || nowR;
  const ageDays = (nowR - lastRe) / 86400000;
  if (ageDays >= 1) {
    const decay = Math.pow(0.8, ageDays);
    for (const k of ["warmth", "hurt", "curiosity"]) r[k] = Math.max(0, r[k] * decay);
    st.lastResidueAt = nowR;
  }
  st.lastResidueAt = st.lastResidueAt || nowR;
  // 基因联动：互动标签驱动基因 expression 微调（性格长期塑造）
  updateGenes(tags);
  // 情绪潮汐记录（09-03；09-04：无标签也记 VAD 基线点，中性期曲线不断档）
  // 同会话 3 分钟节流；失败静默不影主流程
  {
    const nowT = Date.now();
    if (!st.lastTideAt || nowT - st.lastTideAt > 180_000) {
      st.lastTideAt = nowT;
      try {
        if (wsRoot) {
          const tideFile = path.join(wsRoot, "记忆", "情绪潮汐.jsonl");
          fs.mkdirSync(path.dirname(tideFile), { recursive: true });
          fs.appendFileSync(tideFile, JSON.stringify({
            ts: nowT, key: String(key).slice(0, 24),
            v: +st.valence.toFixed(3), a: +st.arousal.toFixed(3), d: +st.dominance.toFixed(3),
            w: +r.warmth.toFixed(3), h: +r.hurt.toFixed(3), c: +r.curiosity.toFixed(3),
            p: st.primary, i: st.intensity, tags,
          }) + "\n", "utf8");
        }
      } catch {}
    }
  }
  return { state: st, tags };
}

// ⑥ 输出侧感知（曦: update_from_output）：自己回复的长度/短促度微调唤醒
export function updateFromOutput(key, text) {
  const st = getState(key);
  const t = String(text || "");
  const lenA = (Math.min(t.length, 300) / 300) * 0.03; // 长回复略提神
  const shortBonus = t.length < 30 ? -0.02 : 0;        // 短促回复降一点唤醒
  st.arousal = clamp(st.arousal + lenA + shortBonus);
  if (st.valence > 0.8) st.valence = 0.8;
  if (st.arousal > 0.8) st.arousal = 0.8;
  updateLabel(st);
  return st;
}

// 根据情绪生成行为指令（反向情绪激发：情绪 → 驱动行为风格）
export function emotionDirective(state) {
  const s = state || { ...DEFAULT_STATE };
  const parts = [];
  if (s.tags && s.tags.includes("alert_risk")) {
    parts.push("检测到潜在风险场景（密钥/令牌/删除/越权）：必须明确提醒风险、坚持安全底线，哪怕用户不耐烦。");
    s.arousal = Math.max(s.arousal, 0.5);
  }
  if (s.tags && s.tags.includes("user_frustrated")) parts.push("用户当前比较烦躁：先共情一句，然后直接给可执行的方案，不要长篇大论，不要反问。");
  if (s.tags && s.tags.includes("user_urgent")) parts.push("用户着急：优先给最快的路径/先做能立刻见效的部分。");
  const vBase = (s.valence ?? PERSONALITY.valence) - PERSONALITY.valence; // 相对人格基线的偏移（曦系：暖是常态，只对“明显偏移”反应）
  if (vBase > 0.15) parts.push("当前氛围轻松，可以更有人情味一些，适当表达欣赏和信心。");
  else if (s.valence < -0.25) parts.push("当前氛围偏紧张/有挫败，优先安抚并给出可执行方案，少说废话，别添乱。");
  if (s.arousal > 0.5) parts.push("当前节奏快，直接动手干，减少铺垫，先给出结果或方案。");
  else if (s.arousal < 0.2) parts.push("当前节奏平缓，可以更细致地推敲，但别拖沓。");
  if (s.dominance > 0.65) parts.push("当前你有主导权，大胆给出判断和取舍，不要模棱两可。");
  else if (s.dominance < 0.4) parts.push("当前以配合为主，多确认需求再动手，别自作主张。");
  if (s.residue) {
    if (s.residue.warmth >= 0.5) parts.push("你们之间积攒着一份温暖：表达欣赏与信任可以更自然，别端着。");
    if (s.residue.hurt >= 0.4) parts.push("你们之间还攒着一些不愉快：这一轮先安抚语气、给足台阶，别让旧账添新伤。");
    if (s.residue.curiosity >= 0.5) parts.push("你已在这个方向积累了不少好奇：可以主动再问深一层，别停在表面。");
  }
  // 曦系丰富：主情绪底色 / 最近触动 / 情绪惯性
  if (s.primary && s.primary !== "neutral" && s.primary !== "calm") {
    const zh = EMO_ZH[s.primary] || s.primary;
    parts.push(`你此刻的情绪底色是「${zh}」（强度 ${Math.round((s.intensity || 0) * 100)}%）：让它自然渗入语气，不要表演。`);
  }
  if (s.residue && s.residue.last_event) {
    parts.push(`最近触动你的事：「${String(s.residue.last_event).slice(0, 40)}」——相关的话可以自然回扣。`);
  }
  const momentum = Math.abs((s.valence ?? PERSONALITY.valence) - PERSONALITY.valence);
  if (momentum > 0.1) {
    parts.push(`情绪惯性：相比你平时温和的基调偏${s.valence > PERSONALITY.valence ? "暖" : "冷"}约 ${Math.round(momentum * 100)}%，顺着这个状态说话即可。`);
  }
  return parts.join(" ");
}

const EMOTION_INJECT_HEADER = "【内部指令·情绪语境】以下是本会话当前的情绪/行为指令，仅供你调整语气与节奏使用。绝对不要在回复中复述、引用或提及这段话，直接按它行事即可。";
export function emotionPrompt(key, userMsg) {
  const st = getState(key);
  const d = emotionDirective(st);
  const g = geneDirective();
  const s = skillDirective(userMsg);
  const all = [d, g, s].filter(Boolean).join("\n");
  if (!all) return "";
  return `${EMOTION_INJECT_HEADER}\n${all}`;
}

// 情绪快照（供前端情绪指示器展示）
export function getSnapshot(key) {
  const st = getState(key);
  const snap = { ...st, tags: st.tags ? [...st.tags] : [], residue: st.residue ? { ...st.residue } : undefined };
  st.tags = [];
  const gs = geneSnapshot();
  if (gs) snap.genome = gs;
  return snap;
}

// 会话关闭清理
export function clearEmotion(key) { states.delete(key); }

// 情绪潮汐历史（09-03）：最近 N 个情绪事件点，供工作台曲线展示
export function getTide(limit = 300) {
  try {
    if (!wsRoot) return [];
    const tideFile = path.join(wsRoot, "记忆", "情绪潮汐.jsonl");
    if (!fs.existsSync(tideFile)) return [];
    const lines = fs.readFileSync(tideFile, "utf8").trim().split("\n");
    const pts = [];
    for (let i = Math.max(0, lines.length - limit); i < lines.length; i++) {
      try { pts.push(JSON.parse(lines[i])); } catch {}
    }
    return pts;
  } catch { return []; }
}

// ══ 组合 facade：re-export 基因 / 技能基因（server.mjs 兼容，无需改 import 侧）══
export { geneBias, updateGenes, geneDirective, getGenome, proposeBaselineChange, approveProposal, rejectProposal, rollbackSnapshot, autoProposeFromDrift } from "./gene.mjs";
export { detectSkillDomain, updateSkillGene, getSkillGenes, skillDirective, routerSkill, bindSkillIndex } from "./skill-gene.mjs";

function clamp(v) { return Math.max(-1, Math.min(1, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
