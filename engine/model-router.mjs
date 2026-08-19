// ══ 模型路由层（2026-08-19 拆模块：从 server.mjs 抽出 + 修正 pro/flash 同源问题）══
// 职责：429 降级状态 / 默认模型兜底 / 任务复杂度分类 / Auto 路由 / pro 候选。
// 纯逻辑模块：modelList/defaultModel 通过 initModelRouter 注入 getter（避免值拷贝 stale）。

let _getModelList = () => [];
let _getDefaultModel = () => null;
let _configModel = ""; // CONFIG.model（显式指定默认模型时不用 Auto）

export function initModelRouter({ getModelList, getDefaultModel, configModel = "" }) {
  if (getModelList) _getModelList = getModelList;
  if (getDefaultModel) _getDefaultModel = getDefaultModel;
  _configModel = configModel || "";
}

// ── opencode-go 429 自动降级 ──
// 现象：opencode-go 周额度耗尽（GoUsageLimitError 429）时，默认/Auto 路由仍优先 opencode-go → 持续 429。
// 修复：探测到 429 后 30 分钟内自动避开 opencode-go，落到实测可用通道，定期重探恢复。
let ocGoBlockedUntil = 0;
const OCGO_BLOCK_MS = 30 * 60 * 1000;
export function isOcGoBlocked() { return Date.now() < ocGoBlockedUntil; }
export function markOcGoBlocked(detail) {
  if (Date.now() < ocGoBlockedUntil) return; // 已标记，不重复刷日志
  ocGoBlockedUntil = Date.now() + OCGO_BLOCK_MS;
  console.log(`[pi-web] ⛔ opencode-go 429 → 标记不可用 ${OCGO_BLOCK_MS / 60000} 分钟（${String(detail || "").slice(0, 60)}）`);
}
// opencode-go 候选（blocked 期间返回 undefined，让路由落到下一顺位）
export function ocGoCandidate(re) {
  return isOcGoBlocked() ? undefined : _getModelList().find(m => m.provider === "opencode-go" && re.test(m.id));
}

// defaultModel 兜底（blocked 且 defaultModel 恰为 opencode-go 时换可用通道）
// ⚠️ 成本策略（2026-08-19 用户定）：deepseek 官方涨价贵不用——降级链全走 token 计划免费通道
export function pickFallbackDefault() {
  const defaultModel = _getDefaultModel();
  if (defaultModel && !(defaultModel.provider === "opencode-go" && isOcGoBlocked())) return defaultModel;
  return _getModelList().find(m => m.provider === "aliyun-bailian" && /qwen3\.8-max/i.test(m.id))
    || _getModelList().find(m => m.provider === "xiaomi-token-plan-cn" && /mimo-v2\.5$/i.test(m.id))
    || _getModelList().find(m => m.provider === "sensenova" && /flash-lite/i.test(m.id))
    || _getModelList().find(m => m.provider === "nvidia" && /gemma-3-12b/i.test(m.id))
    || _getModelList().find(m => m.provider === "volces-ark" && /ark-code/i.test(m.id))
    || defaultModel;
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

// flash 主力候选：千问（免费 token 计划主力）→ ocGo flash → mimo → sensenova → ark
function flashCandidate() {
  return _getModelList().find(m => m.provider === "aliyun-bailian" && /qwen3\.8-max/i.test(m.id))
    || ocGoCandidate(/deepseek-v4-flash/i)
    || _getModelList().find(m => m.provider === "xiaomi-token-plan-cn" && /mimo-v2\.5$/i.test(m.id))
    || _getModelList().find(m => m.provider === "sensenova" && /flash-lite/i.test(m.id))
    || _getModelList().find(m => m.provider === "volces-ark" && /ark-code/i.test(m.id))
    || pickFallbackDefault();
}
// pro 候选（复杂任务 / NEEDS_PRO 升级共用）：
// ⚠️ 2026-08-19 修正：千问不再作为 pro（它已是 flash 主力）——否则"升级"是假升级。
//   真 pro = ocGo deepseek-v4-pro（8/23 套餐恢复后）→ mimo-pro → ark（thinking 空回复，末位）。
export function routeProCandidate() {
  return ocGoCandidate(/deepseek-v4-pro/i)
    || _getModelList().find(m => m.provider === "xiaomi-token-plan-cn" && /mimo-v2\.5-pro/i.test(m.id))
    || _getModelList().find(m => m.provider === "volces-ark" && /ark-code/i.test(m.id));
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
    // 无可用 pro（ocGo 429 中、mimo-pro/ark 不可用）→ 回落 flash 主力并播报真实原因，不假装升级
    const flash = flashCandidate();
    return { model: flash, level: "complex", score: cl.score, reasons: [...cl.reasons, "pro 暂不可用(ocGo 429)，回落主力模型"], auto: true };
  }
  return { model: flashCandidate(), level: cl.level, score: cl.score, reasons: cl.reasons, auto: true };
}
