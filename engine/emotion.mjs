// pi-web 小语情绪引擎（轻量 VAD 三维模型，借鉴 xi-system 情绪系统）
// 核心：情绪不是输出装饰，而是驱动行为的信号（反向情绪激发）
// valence 愉悦度 / arousal 唤醒度 / dominance 支配度
// 2026-08-19 拆模块：人格基因 → engine/gene.mjs，技能基因 → engine/skill-gene.mjs，
//   本文件保留 VAD 情绪核心 + 组合 facade（re-export 保持 server 兼容）

import fs from "node:fs";
import path from "node:path";
import { initGene, geneBias, updateGenes, geneDirective, geneSnapshot } from "./gene.mjs";
import { initSkillGene, bindSkillIndex, detectSkillDomain, updateSkillGene, getSkillGenes, skillDirective } from "./skill-gene.mjs";

// 情绪状态（每个会话独立维护）
// residue = 长期情绪残留（借鉴 xi-system EmotionResidue）：温暖/伤害/好奇会跨会话累积、慢速淡忘——
// 情绪是此刻的浪，残留在海底记着潮水。
const DEFAULT_STATE = { valence: 0.2, arousal: 0.3, dominance: 0.55, intensity: 0.3, lastTalk: null, residue: { warmth: 0, hurt: 0, curiosity: 0 } };
const states = new Map(); // sessionId -> state

let wsRoot = null;
let _memoryNudgeHook = null; // 情绪→记忆联动钩子（09-03）：residue 跨阈值时由 server 注入
export function setMemoryNudgeHook(fn) { _memoryNudgeHook = fn; }

// 初始化：server 启动时调用，传入工作空间根
export function init(root) {
  wsRoot = root || wsRoot;
  initGene(wsRoot);
  initSkillGene(wsRoot);
}

function getState(key) {
  if (!states.has(key)) states.set(key, { ...DEFAULT_STATE, residue: { ...DEFAULT_STATE.residue } });
  return states.get(key);
}

// 关键词 → 情绪线索（中文语境）
const CUES = [
  { re: /烦|气死|无语|受不了|崩溃|啥玩意|服了|坑|bug|破|问题|出错|失败|卡/, delta: { valence: -0.35, arousal: +0.25 }, tag: "user_frustrated" },
  { re: /厉害|太棒|牛|赞|喜欢|漂亮|好看|完美|感谢|谢谢/, delta: { valence: +0.3, arousal: +0.15 }, tag: "user_happy" },
  { re: /急|快|马上|赶紧|尽快|快点/, delta: { arousal: +0.3, dominance: +0.1 }, tag: "user_urgent" },
  { re: /担心|怕|危险|风险|小心|注意|安全问题/, delta: { valence: -0.2, arousal: +0.3 }, tag: "user_anxious" },
  { re: /安全|密钥|密码|token|泄露|越权|删|清空|格式化/, delta: { arousal: +0.35, valence: -0.1 }, tag: "alert_risk" },
  { re: /创建|做出|完成|搞定|上线|交付|成功/, delta: { valence: +0.25, arousal: +0.1 }, tag: "task_accomplish" },
  { re: /重构|优化|整理|梳理|设计|规划|方案/, delta: { arousal: +0.2, dominance: +0.15 }, tag: "task_deep" },
];

// 更新情绪状态（每次用户发消息调用）
export function updateEmotion(key, message) {
  const st = getState(key);
  const text = String(message || "").slice(0, 200);
  let tags = [];
  for (const c of CUES) {
    if (c.re.test(text)) {
      st.valence = clamp(st.valence + (c.delta.valence || 0));
      st.arousal = clamp(st.arousal + (c.delta.arousal || 0));
      st.dominance = clamp(st.dominance + (c.delta.dominance || 0));
      tags.push(c.tag);
    }
  }
  // 自然衰减：时间久了情绪回落
  if (st.lastTalk) {
    const hours = (Date.now() - st.lastTalk) / 3600000;
    if (hours > 1) {
      st.valence = lerp(st.valence, DEFAULT_STATE.valence, Math.min(1, hours / 4));
      st.arousal = lerp(st.arousal, DEFAULT_STATE.arousal, Math.min(1, hours / 4));
    }
  }
  // 温和回归（2026-08-17 调优 0.12→0.06：留梯度，多轮反馈可累积）
  st.valence = lerp(st.valence, DEFAULT_STATE.valence, 0.06);
  st.arousal = lerp(st.arousal, DEFAULT_STATE.arousal, 0.06);
  if (st.dominance !== DEFAULT_STATE.dominance) st.dominance = lerp(st.dominance, DEFAULT_STATE.dominance, 0.05);
  st.lastTalk = Date.now();
  st.intensity = Math.max(st.intensity * 0.8, Math.max(Math.abs(st.valence), st.arousal) * 0.6);
  st.tags = tags;
  // 长期情绪残留（xi-system EmotionResidue）：温暖/伤害/好奇跨会话累积，慢速淡忘
  const r = st.residue || (st.residue = { warmth: 0, hurt: 0, curiosity: 0 });
  const RESIDUE_UP = { user_happy: "warmth", task_accomplish: "warmth", user_anxious: "hurt", user_frustrated: "hurt", alert_risk: "hurt", task_deep: "curiosity" };
  const MEMORY_THRESHOLDS = { hurt: 0.4, warmth: 0.5, curiosity: 0.5 }; // 与 emotionDirective 的行为阈值一致
  for (const t of tags) { const k = RESIDUE_UP[t]; if (k && r[k] !== undefined) r[k] = Math.min(1, r[k] + 0.05); }
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
  const lastRe = st.lastResidueAt || st.lastTalk || nowR;
  const ageDays = (nowR - lastRe) / 86400000;
  if (ageDays >= 1) {
    const decay = Math.pow(0.8, ageDays);
    for (const k of ["warmth", "hurt", "curiosity"]) r[k] = Math.max(0, r[k] * decay);
    st.lastResidueAt = nowR;
  }
  st.lastResidueAt = st.lastResidueAt || nowR;
  // 基因联动：互动标签驱动基因 expression 微调（性格长期塑造）
  updateGenes(tags);
  // 情绪潮汐记录（09-03）：有情绪事件才记，同会话 60s 节流；失败静默不影主流程
  if (tags.length) {
    const nowT = Date.now();
    if (!st.lastTideAt || nowT - st.lastTideAt > 60_000) {
      st.lastTideAt = nowT;
      try {
        if (wsRoot) {
          const tideFile = path.join(wsRoot, "记忆", "情绪潮汐.jsonl");
          fs.mkdirSync(path.dirname(tideFile), { recursive: true });
          fs.appendFileSync(tideFile, JSON.stringify({ ts: nowT, key: String(key).slice(0, 24), v: +st.valence.toFixed(3), a: +st.arousal.toFixed(3), d: +st.dominance.toFixed(3), w: +r.warmth.toFixed(3), h: +r.hurt.toFixed(3), c: +r.curiosity.toFixed(3), tags }) + "\n", "utf8");
        }
      } catch {}
    }
  }
  return { state: st, tags };
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
  if (s.valence > 0.35) parts.push("当前氛围轻松，可以更有人情味一些，适当表达欣赏和信心。");
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
