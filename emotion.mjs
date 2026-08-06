// pi-web 小语情绪引擎（轻量 VAD 三维模型，借鉴 xi-system 情绪系统）
// 核心：情绪不是输出装饰，而是驱动行为的信号（反向情绪激发）
// valence 愉悦度 / arousal 唤醒度 / dominance 支配度

// 情绪状态（每个会话独立维护）
const DEFAULT_STATE = { valence: 0.2, arousal: 0.3, dominance: 0.55, intensity: 0.3, lastTalk: null };
const states = new Map(); // sessionId -> state

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

// 更新情绪状态（每次用户发消息调用）
export function updateEmotion(key, message) {
  const st = getState(key);
  const text = String(message || "").slice(0, 200);
  let tags = [];
  for (const c of CUES) {
    if (c.re.test(text)) {
      st.valence = clamp(st.valence + c.delta.valence);
      st.arousal = clamp(st.arousal + c.delta.arousal);
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
  st.lastTalk = Date.now();
  st.intensity = Math.max(st.intensity * 0.8, Math.max(Math.abs(st.valence), st.arousal) * 0.6);
  st.tags = tags;
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
export function emotionPrompt(key) {
  const st = getState(key);
  const d = emotionDirective(st);
  if (!d) return "";
  return `【当前情绪语境】${d}`;
}

// 情绪快照（供前端情绪指示器展示）
export function getSnapshot(key) {
  const st = getState(key);
  // 情绪标签是瞬时的：快照返回后即清除（避免"交付达成"反复显示——标签粘滞 bug）
  const snap = { ...st, tags: st.tags ? [...st.tags] : [] };
  st.tags = [];
  return snap;
}

// 会话关闭清理
export function clearEmotion(key) { states.delete(key); }

function clamp(v) { return Math.max(-1, Math.min(1, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
