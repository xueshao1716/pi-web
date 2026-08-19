// ══ 模型路由层（2026-08-19 拆模块：从 server.mjs 抽出 + 修正 pro/flash 同源问题）══
// 职责：模型健康冷却（429/402/403 通用）/ 默认模型兜底 / 任务复杂度分类 / Auto 路由 / pro 候选。
// 纯逻辑模块：modelList/defaultModel 通过 initModelRouter 注入 getter（避免值拷贝 stale）。

let _getModelList = () => [];
let _getDefaultModel = () => null;
let _configModel = ""; // CONFIG.model（显式指定默认模型时不用 Auto）

export function initModelRouter({ getModelList, getDefaultModel, configModel = "" }) {
  if (getModelList) _getModelList = getModelList;
  if (getDefaultModel) _getDefaultModel = getDefaultModel;
  _configModel = configModel || "";
}

// ── 模型健康冷却（原 opencode-go 429 机制的泛化，2026-08-20）──
// 任何 provider 的 401/402/403/429/529 错误都可标记；冷却期内候选链自动避开。
// 典型场景：千问 token 计划 403 → 不标记的话每次简单任务都先撞一次墙再靠复读守卫救。
const modelBlockedUntil = new Map(); // "provider/id" → { until, reason }
let ocGoBlockedUntil = 0; // opencode-go 走全 provider 屏蔽（它的 flash/pro 都在同一套餐里）
const BLOCK_MS_DEFAULT = 30 * 60 * 1000;

export function modelKey(m) { return m ? `${m.provider}/${m.id}` : ""; }
export function isModelBlocked(m) {
  if (!m) return false;
  if (m.provider === "opencode-go" && Date.now() < ocGoBlockedUntil) return true;
  const cur = modelBlockedUntil.get(modelKey(m));
  return !!(cur && Date.now() < cur.until);
}
export function markModelBlocked(m, { ms = BLOCK_MS_DEFAULT, reason = "" } = {}) {
  if (!m) return;
  if (m.provider === "opencode-go") { // 兼容旧语义：ocGo 标记即整个 provider 冷却
    if (Date.now() < ocGoBlockedUntil) return;
    ocGoBlockedUntil = Date.now() + ms;
    console.log(`[router] ⛔ opencode-go 冷却 ${ms / 60000} 分钟（${String(reason).slice(0, 60)}）`);
    return;
  }
  const key = modelKey(m);
  const cur = modelBlockedUntil.get(key);
  if (cur && Date.now() < cur.until) return; // 已标记，不重复刷日志
  modelBlockedUntil.set(key, { until: Date.now() + ms, reason });
  console.log(`[router] ⛔ ${key} 冷却 ${ms / 60000} 分钟（${String(reason).slice(0, 60)}）`);
}
// 重置全部健康状态（模型清单刷新/重新探测后调用，给所有模型一次新机会）
export function resetModelHealth() {
  modelBlockedUntil.clear();
  ocGoBlockedUntil = 0;
}

// ── opencode-go 兼容导出（server.mjs 既有调用点继续可用）──
export function isOcGoBlocked() { return Date.now() < ocGoBlockedUntil; }
export function markOcGoBlocked(detail) { markModelBlocked({ provider: "opencode-go", id: "any" }, { reason: detail }); }
// opencode-go 候选（blocked 期间返回 undefined，让路由落到下一顺位）
export function ocGoCandidate(re) {
  return isOcGoBlocked() ? undefined : _getModelList().find(m => m.provider === "opencode-go" && re.test(m.id));
}

// 按 provider+正则找模型，跳过冷却中的（候选链统一走这个，健康过滤不再散落各处）
function findLive(provider, re) {
  const m = _getModelList().find(x => x.provider === provider && re.test(x.id));
  return m && !isModelBlocked(m) ? m : undefined;
}
// 候选链最终兜底：默认模型 → 清单里第一个活着的 → null（绝不返回 undefined）

// defaultModel 兜底（blocked 且 defaultModel 恰为 opencode-go 时换可用通道）
// ⚠️ 成本策略（2026-08-19 用户定）：deepseek 官方涨价贵不用——降级链全走 token 计划免费通道
// 2026-08-20：候选链全部改为 findLive（跳过冷却中的模型），末位兜底从「裸 defaultModel」改为「活的模型」
export function pickFallbackDefault() {
  const defaultModel = _getDefaultModel();
  if (defaultModel && !isModelBlocked(defaultModel)) return defaultModel;
  // ⚠️ 2026-08-19 用户指令：mimo（xiaomi-token-plan-cn）从自动路由摘除，只留千问→商汤→NVIDIA→ark
  return findLive("aliyun-bailian", /qwen3\.8-max/i)
    || findLive("sensenova", /flash-lite/i)
    || findLive("nvidia", /gemma-3-12b/i)
    || findLive("volces-ark", /ark-code/i)
    || defaultModel; // 全部冷却时仍返回 defaultModel（宁可重试已知模型，不可无模型可用）
}

// ⚠️ 2026-08-19 修复：复读守卫的兜底必须**排除出问题的模型**（否则千问复读→兜底还是千问，切换无效）。
// 2026-08-20 修正残留：末位兜底 pickFallbackDefault() 也可能返回被排除模型——现在全链过滤。
export function pickFallbackExcluding(excludeModel) {
  const excludeKey = modelKey(excludeModel);
  const cands = [
    findLive("sensenova", /flash-lite/i),
    findLive("nvidia", /gemma-3-12b/i),
    findLive("volces-ark", /ark-code/i),
  ].filter(Boolean).filter(m => modelKey(m) !== excludeKey);
  if (cands[0]) return cands[0];
  const fb = pickFallbackDefault();
  return fb && modelKey(fb) !== excludeKey ? fb : null;
}

export const ROUTER_AUTO = { provider: "auto", id: "auto" };
export function isAutoModel(m) { return !!m && (m.provider === "auto" || m.id === "auto" || m.id === "auto-smart"); }

// 复杂/简单任务关键词表（可扩展；命中均带权重，取累计分与阈值比较）
const ROUTER_COMPLEX_PATTERNS = [
  { w: 2, re: /(重构|重写|架构|设计方案?|系统设计|代码库级|跨模块|多文件|多个文件|整个项目|从零(搭建|实现|开发))/i, label: "代码库级" },
  { w: 2, re: /(单元测试|集成测试|测试用例|调试|排错|性能优化|安全审查|代码审查|评审)/i, label: "测试/审查" },
  { w: 2, re: /(迁移|升级改造|协议|算法|并发|分布式|高可用|缓存策略)/i, label: "深度技术" },
  { w: 1, re: /(实现|开发|编写|构建|搭建|部署|集成|对接)/i, label: "开发" },
  { w: 1, re: /(分析|设计|规划|评估|调研|研究|梳理|总结)/i, label: "分析" },
  { w: 1, re: /(请逐步|一步一步|分步骤|详细说明|深入研究)/i, label: "要求细致" },
  { w: 1, re: /```[\s\S]{200,}```/, label: "大段代码" }, // 大段代码块 = 编码任务
];
const ROUTER_SIMPLE_PATTERNS = [
  { w: 2, re: /^(你好|hi|hello|在吗|早|晚上好|嗨|谢谢|感谢|再见|拜拜)/i, label: "问候" },
  { w: 1, re: /(闲聊|随便聊聊|讲个笑话|笑话|天气|几点|现在几点|周末)/i, label: "闲聊" },
  { w: 1, re: /^(解释|介绍一下|什么是|什么叫|能不能|请问|翻译|帮我算)/, label: "轻问答" },
  { w: 1, re: /^.{0,30}$/, label: "短消息" }, // 极短消息按简单处理（修饰词少，多为闲聊/快问快答）
];
// 任务复杂度分类（规则评分，可解释、零成本、可调阈值）
export function classifyTaskComplexity(text) {
  const t = String(text || "").trim();
  let score = 0; const reasons = [];
  if (t.length > 400) { score += 3; reasons.push("长任务"); }
  else if (t.length > 150) { score += 1; reasons.push("较长"); }
  for (const p of ROUTER_COMPLEX_PATTERNS) { if (p.re.test(t)) { score += p.w; reasons.push(p.label || p.re.source.slice(0, 18)); } }
  for (const p of ROUTER_SIMPLE_PATTERNS) { if (p.re.test(t)) { score -= p.w; reasons.push("-" + (p.label || p.re.source.slice(0, 12))); } }
  const complex = score >= 3;
  return { level: complex ? "complex" : "simple", score, reasons: reasons.slice(0, 5) };
}

// flash 主力候选：千问（免费 token 计划主力）→ ocGo flash → sensenova → ark（mimo 已摘除）
function flashCandidate() {
  return findLive("aliyun-bailian", /qwen3\.8-max/i)
    || ocGoCandidate(/deepseek-v4-flash/i)
    || findLive("sensenova", /flash-lite/i)
    || findLive("volces-ark", /ark-code/i)
    || pickFallbackDefault();
}
// pro 候选（复杂任务 / NEEDS_PRO 升级共用）：
// ⚠️ 2026-08-19 修正：千问不再作为 pro（它已是 flash 主力）——否则"升级"是假升级。
//   真 pro = ocGo deepseek-v4-pro（8/23 套餐恢复后）→ ark（thinking 空回复，末位）。（mimo-pro 已摘除）
export function routeProCandidate() {
  return ocGoCandidate(/deepseek-v4-pro/i)
    || findLive("volces-ark", /ark-code/i);
}

// Auto 路由：按复杂度选 flash/pro。
// 显式配置了 CONFIG.model → 不用 Auto，直接用该默认模型；PI_AUTO_ROUTE=0 可关。
export function routeForAuto(text) {
  if (_configModel) return { model: _getDefaultModel(), level: "simple", score: 0, reasons: ["显式默认模型"], auto: false };
  const cl = classifyTaskComplexity(text);
  if (process.env.PI_AUTO_ROUTE === "0") {
    return { model: _getDefaultModel(), level: "simple", score: 0, reasons: ["已关闭(PI_AUTO_ROUTE=0)"], auto: false };
  }
  if (cl.level === "complex") {
    const pro = routeProCandidate();
    if (pro) return { model: pro, level: "complex", score: cl.score, reasons: cl.reasons, auto: true };
    // 无可用 pro（ocGo 429 中、ark 不可用）→ 回落 flash 主力并播报真实原因，不假装升级
    const flash = flashCandidate();
    return { model: flash, level: "complex", score: cl.score, reasons: [...cl.reasons, "pro 暂不可用(ocGo 429)，回落主力模型"], auto: true };
  }
  return { model: flashCandidate(), level: cl.level, score: cl.score, reasons: cl.reasons, auto: true };
}
