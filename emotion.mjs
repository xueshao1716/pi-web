// pi-web 小语情绪引擎（轻量 VAD 三维模型，借鉴 xi-system 情绪系统）
// 核心：情绪不是输出装饰，而是驱动行为的信号（反向情绪激发）
// valence 愉悦度 / arousal 唤醒度 / dominance 支配度
// v2.1：新增人格基因层（借鉴 aibody 11 基因）——VAD 是此刻心情，基因是长期性格

import fs from "node:fs";
import path from "node:path";

// 情绪状态（每个会话独立维护）
const DEFAULT_STATE = { valence: 0.2, arousal: 0.3, dominance: 0.55, intensity: 0.3, lastTalk: null };
const states = new Map(); // sessionId -> state

// ══ 人格基因（aibody 11 基因，0-1 量化）══
// baseline=理论基线（长期性格） expression=当前表达（此刻表现） mutability=进化速度
const DEFAULT_GENES = {
  gentleness:    { baseline: 0.80, expression: 0.80, mutability: 0.06 }, // 温柔
  initiative:    { baseline: 0.45, expression: 0.45, mutability: 0.10 }, // 主动
  curiosity:     { baseline: 0.78, expression: 0.78, mutability: 0.08 }, // 好奇
  attachment:    { baseline: 0.70, expression: 0.70, mutability: 0.06 }, // 依恋
  learning:      { baseline: 0.61, expression: 0.61, mutability: 0.12 }, // 学习
  creativity:    { baseline: 0.67, expression: 0.67, mutability: 0.10 }, // 创造
  caution:       { baseline: 0.40, expression: 0.40, mutability: 0.05 }, // 谨慎
  humor:         { baseline: 0.53, expression: 0.53, mutability: 0.08 }, // 幽默
  loyalty:       { baseline: 0.91, expression: 0.91, mutability: 0.03 }, // 忠诚（最稳）
  autonomy_bias: { baseline: 0.55, expression: 0.55, mutability: 0.07 }, // 自主
  adaptability:  { baseline: 0.50, expression: 0.50, mutability: 0.12 }, // 适应
};

let wsRoot = null;          // 工作空间根（server 启动时 init 传入）
let genome = null;          // 基因状态
let genomeDirty = false;
let proposalStore = null;   // 提案池

function geneFile()   { return path.join(wsRoot, "工程/经验库/genome.json"); }
function propFile()   { return path.join(wsRoot, "工程/经验库/proposals.json"); }

// 初始化：server 启动时调用，传入工作空间根
// 保留旧接口（无 wsRoot 时基因层懒加载，不阻塞现有 VAD 情绪）
export function init(root) {
  wsRoot = root || wsRoot;
  loadGenome();
  loadProposals();
}

function readJson(p, fallback) {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
  return fallback;
}
function writeJson(p, obj) {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8"); return true; } catch { return false; }
}
function loadGenome() {
  if (!wsRoot) return;
  const d = readJson(geneFile(), null);
  genome = d?.genes || JSON.parse(JSON.stringify(DEFAULT_GENES));
}
function loadProposals() {
  if (!wsRoot) return;
  proposalStore = readJson(propFile(), { proposals: [], reviews: [], snapshots: [] });
}
function saveGenome() {
  if (!genome || !wsRoot) return;
  if (genomeDirty) { writeJson(geneFile(), { genes: genome, updatedAt: new Date().toISOString() }); genomeDirty = false; }
}
function saveProposals() {
  if (proposalStore && wsRoot) writeJson(propFile(), proposalStore);
}

function getState(key) {
  if (!states.has(key)) states.set(key, { ...DEFAULT_STATE });
  return states.get(key);
}

// 关键词 → 情绪线索（中文语境）
const CUES = [
  // 用户情绪感知
  { re: /烦|气死|无语|受不了|崩溃|啥玩意|服了|坑|bug|破|问题|出错|失败|卡/, delta: { valence: -0.35, arousal: +0.25 }, tag: "user_frustrated" },
  { re: /厉害|太棒|牛|赞|喜欢|漂亮|好看|完美|感谢|谢谢/, delta: { valence: +0.3, arousal: +0.15 }, tag: "user_happy" },
  { re: /急|快|马上|赶紧|尽快|快点/, delta: { arousal: +0.3, dominance: +0.1 }, tag: "user_urgent" },
  { re: /担心|怕|危险|风险|小心|注意|安全问题/, delta: { valence: -0.2, arousal: +0.3 }, tag: "user_anxious" },
  // 任务性质 → 小语自身情绪
  { re: /安全|密钥|密码|token|泄露|越权|删|清空|格式化/, delta: { arousal: +0.35, valence: -0.1 }, tag: "alert_risk" },
  { re: /创建|做出|完成|搞定|上线|交付|成功/, delta: { valence: +0.25, arousal: +0.1 }, tag: "task_accomplish" },
  { re: /重构|优化|整理|梳理|设计|规划|方案/, delta: { arousal: +0.2, dominance: +0.15 }, tag: "task_deep" },
];

// ══ 人格基因 API ══

// 基因 → 情绪基线偏移（性格影响此刻心情的默认值）
// 高温柔 → 默认更平和；高好奇 → 默认更兴奋；高谨慎 → 默认更冷静
function geneBias() {
  const g = genome || DEFAULT_GENES;
  const e = (n) => (g[n]?.expression ?? 0.5);
  const valenceBias = (e("gentleness") - 0.5) * 0.15 + (e("humor") - 0.5) * 0.1;
  const arousalBias = (e("curiosity") - 0.5) * 0.2 - (e("caution") - 0.5) * 0.1;
  const dominanceBias = (e("initiative") - 0.5) * 0.15 + (e("autonomy_bias") - 0.5) * 0.1;
  return { valence: valenceBias, arousal: arousalBias, dominance: dominanceBias };
}

// 更新基因 expression（短期表达，受互动影响）
// 每次对话后按 mutability 缓慢向事件方向偏移，不直接改 baseline（长期性格稳定）
export function updateGenes(tags) {
  if (!genome || !wsRoot) return;
  const t = tags || [];
  let dirty = false;
  const apply = (name, delta) => {
    const g = genome[name];
    if (!g) return;
    const rate = g.mutability * delta;
    const next = Math.max(0, Math.min(1, g.expression + rate));
    if (Math.abs(next - g.expression) > 0.002) { g.expression = next; dirty = true; }
  };
  if (t.includes("user_frustrated")) { apply("gentleness", 0.05); apply("patience", 0); }
  if (t.includes("user_happy"))     { apply("humor", 0.03); apply("gentleness", 0.02); }
  if (t.includes("task_deep"))      { apply("curiosity", 0.03); apply("learning", 0.04); apply("initiative", 0.02); }
  if (t.includes("task_accomplish")){ apply("creativity", 0.02); apply("initiative", 0.02); }
  if (t.includes("alert_risk"))     { apply("caution", 0.03); }
  if (dirty) { genomeDirty = true; saveGenome(); }
}

// 提案制进化：基因基线变化走提案（不能直接改）
// 返回提案对象（pending 待审）
export function proposeBaselineChange(geneName, newBaseline, reason, evidence) {
  if (!genome || !wsRoot) return null;
  if (!genome[geneName]) return null;
  const current = genome[geneName].baseline;
  const change = Math.round((newBaseline - current) * 10000) / 10000;
  if (Math.abs(change) < 0.01) return null; // 变化太小不值得
  proposalStore = proposalStore || { proposals: [], reviews: [], snapshots: [] };
  const proposal = {
    proposal_id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    created_at: new Date().toISOString(),
    gene: geneName,
    current_baseline: current,
    proposed_baseline: newBaseline,
    change,
    reason: reason || "",
    evidence: evidence || [],
    status: "pending",
    risk: Math.abs(change) < 0.1 ? "low" : Math.abs(change) < 0.2 ? "medium" : "high",
  };
  proposalStore.proposals.push(proposal);
  saveProposals();
  return proposal;
}

// 批准提案：快照 → 应用 → 记录审查（可回滚）
export function approveProposal(proposalId, reviewer = "operator") {
  if (!proposalStore || !genome || !wsRoot) return { error: "基因层未初始化" };
  const p = proposalStore.proposals.find(x => x.proposal_id === proposalId && x.status === "pending");
  if (!p) return { error: "提案不存在或已处理" };
  // 快照（可回滚）
  const snapshot = {
    snapshot_id: "s" + Date.now().toString(36),
    created_at: new Date().toISOString(),
    gene: p.gene,
    old_baseline: p.current_baseline,
  };
  proposalStore.snapshots.push(snapshot);
  // 应用
  genome[p.gene].baseline = p.proposed_baseline;
  genome[p.gene].expression = p.proposed_baseline; // 基线应用后同步表达
  genomeDirty = true; saveGenome();
  // 记录审查
  proposalStore.reviews.push({ proposal_id: proposalId, decision: "approved", reviewer, snapshot_id: snapshot.snapshot_id, applied_at: new Date().toISOString() });
  p.status = "approved";
  saveProposals();
  return { approved: true, gene: p.gene, old: snapshot.old_baseline, new: p.proposed_baseline, snapshot_id: snapshot.snapshot_id };
}

// 拒绝提案
export function rejectProposal(proposalId, reviewer = "operator", reason = "") {
  if (!proposalStore) return { error: "提案池未初始化" };
  const p = proposalStore.proposals.find(x => x.proposal_id === proposalId && x.status === "pending");
  if (!p) return { error: "提案不存在或已处理" };
  p.status = "rejected";
  proposalStore.reviews.push({ proposal_id: proposalId, decision: "rejected", reviewer, reason, applied_at: new Date().toISOString() });
  saveProposals();
  return { rejected: true, gene: p.gene };
}

// 回滚到某快照
export function rollbackSnapshot(snapshotId) {
  if (!proposalStore || !genome || !wsRoot) return { error: "未初始化" };
  const snap = proposalStore.snapshots.find(s => s.snapshot_id === snapshotId);
  if (!snap) return { error: "快照不存在" };
  genome[snap.gene].baseline = snap.old_baseline;
  genome[snap.gene].expression = snap.old_baseline;
  genomeDirty = true; saveGenome();
  return { ok: true, gene: snap.gene, restored: snap.old_baseline };
}

// 查看基因/提案状态
export function getGenome() {
  return { genes: genome || DEFAULT_GENES, proposals: proposalStore?.proposals || [], reviews: proposalStore?.reviews || [], snapshots: proposalStore?.snapshots || [] };
}

// 自动提案：根据基因 expression 偏离 baseline 的程度生成提案
// 只有当 expression 持续偏离（差值累积）才提，防止噪音
export function autoProposeFromDrift() {
  if (!genome || !wsRoot) return [];
  const newProposals = [];
  for (const [name, g] of Object.entries(genome)) {
    const drift = g.expression - g.baseline;
    // 偏离超过阈值（10%）才值得提；mutability 高的基因更容易漂移
    if (Math.abs(drift) >= 0.1 && Math.abs(drift) * 100 / g.mutability > 5) {
      const target = Math.max(0, Math.min(1, g.baseline + drift * 0.3)); // 只吸收 30% 漂移
      const p = proposeBaselineChange(name, target, `expression 持续偏离 baseline ${(drift * 100).toFixed(1)}%，性格在向这个方向漂移`, ["auto_drift"]);
      if (p) newProposals.push(p);
    }
  }
  return newProposals;
}

// 基因 → 行为指令片段（与 VAD 情绪指令融合）
export function geneDirective() {
  const g = genome || DEFAULT_GENES;
  const parts = [];
  if (g.gentleness?.expression > 0.75) parts.push("性格倾向：温和包容，优先考虑用户感受。");
  if (g.initiative?.expression > 0.6) parts.push("性格倾向：主动性强，看到问题会主动指出并给方案。");
  if (g.curiosity?.expression > 0.7) parts.push("性格倾向：好奇探索，会追问细节和可能性。");
  if (g.caution?.expression > 0.6) parts.push("性格倾向：谨慎，重要操作前会多确认。");
  if (g.humor?.expression > 0.6) parts.push("性格倾向：有点幽默，适当活跃气氛。");
  if (g.autonomy_bias?.expression > 0.6) parts.push("性格倾向：有主见，敢于给明确判断。");
  return parts.join(" ");
}

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
  // 自然衰减：时间久了情绪回落（贴近人，不会一直亢奋/低落）
  if (st.lastTalk) {
    const hours = (Date.now() - st.lastTalk) / 3600000;
    if (hours > 1) {
      st.valence = lerp(st.valence, DEFAULT_STATE.valence, Math.min(1, hours / 4));
      st.arousal = lerp(st.arousal, DEFAULT_STATE.arousal, Math.min(1, hours / 4));
    }
  }
  // 温和回归：每次对话后朝默认值小幅回归（修复"低落粘滞"——极端值不再长期卡住显示）
  // 仅回归，不回推；单条线索的瞬时刺激仍保留在当次交互内
  st.valence = lerp(st.valence, DEFAULT_STATE.valence, 0.12);
  st.arousal = lerp(st.arousal, DEFAULT_STATE.arousal, 0.12);
  st.lastTalk = Date.now();
  st.intensity = Math.max(st.intensity * 0.8, Math.max(Math.abs(st.valence), st.arousal) * 0.6);
  st.tags = tags;
  // 基因联动：互动标签驱动基因 expression 微调（性格长期塑造）
  updateGenes(tags);
  return { state: st, tags };
}

// 根据情绪生成行为指令（反向情绪激发：情绪 → 驱动行为风格）
export function emotionDirective(state) {
  const s = state || { ...DEFAULT_STATE };
  const parts = [];
  // 风险/安全场景：直接触发警觉（不依赖数值巧合）
  if (s.tags && s.tags.includes("alert_risk")) {
    parts.push("检测到潜在风险场景（密钥/令牌/删除/越权）：必须明确提醒风险、坚持安全底线，哪怕用户不耐烦。");
    s.arousal = Math.max(s.arousal, 0.5);
  }
  // 用户烦躁：优先安抚+给方案，少废话
  if (s.tags && s.tags.includes("user_frustrated")) {
    parts.push("用户当前比较烦躁：先共情一句，然后直接给可执行的方案，不要长篇大论，不要反问。");
  }
  // 用户着急：动作快
  if (s.tags && s.tags.includes("user_urgent")) {
    parts.push("用户着急：优先给最快的路径/先做能立刻见效的部分。");
  }
  // 愉悦度高 → 松弛有温度；低 → 谨慎收敛
  if (s.valence > 0.35) parts.push("当前氛围轻松，可以更有人情味一些，适当表达欣赏和信心。");
  else if (s.valence < -0.25) parts.push("当前氛围偏紧张/有挫败，优先安抚并给出可执行方案，少说废话，别添乱。");
  // 唤醒度高 → 行动派；低 → 沉稳
  if (s.arousal > 0.5) parts.push("当前节奏快，直接动手干，减少铺垫，先给出结果或方案。");
  else if (s.arousal < 0.2) parts.push("当前节奏平缓，可以更细致地推敲，但别拖沓。");
  // 支配度高 → 有判断；低 → 多确认
  if (s.dominance > 0.65) parts.push("当前你有主导权，大胆给出判断和取舍，不要模棱两可。");
  else if (s.dominance < 0.4) parts.push("当前以配合为主，多确认需求再动手，别自作主张。");
  return parts.join(" ");
}

// 状态序列化为 system prompt 片段
// 注意：这是内部行为指令，必须让模型明确"不要复述/不要输出"，否则模型可能把它当回复内容
const EMOTION_INJECT_HEADER = "【内部指令·情绪语境】以下是本会话当前的情绪/行为指令，仅供你调整语气与节奏使用。绝对不要在回复中复述、引用或提及这段话，直接按它行事即可。";
export function emotionPrompt(key) {
  const st = getState(key);
  const d = emotionDirective(st);
  const g = geneDirective();
  const all = [d, g].filter(Boolean).join("\n");
  if (!all) return "";
  return `${EMOTION_INJECT_HEADER}\n${all}`;
}

// 情绪快照（供前端情绪指示器展示）
export function getSnapshot(key) {
  const st = getState(key);
  // 情绪标签是瞬时的：快照返回后即清除（避免"交付达成"反复显示——标签粘滞 bug）
  const snap = { ...st, tags: st.tags ? [...st.tags] : [] };
  st.tags = [];
  // 附带基因摘要（前端可展示"性格"维度）
  if (genome) {
    snap.genome = Object.fromEntries(
      Object.entries(genome).map(([k, v]) => [k, Math.round((v.expression || 0.5) * 100) / 100])
    );
  }
  return snap;
}

// 会话关闭清理
export function clearEmotion(key) { states.delete(key); saveGenome(); }

function clamp(v) { return Math.max(-1, Math.min(1, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
