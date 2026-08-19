// ══ 隔离子任务执行器（P2，2026-08-19）══
// 多 agent 本质（Reasonix 观点）：子代理是"隔离上下文 + 成本分级 + 结构化回传"的执行器，不是协调原语。
// 设计：
//   - 独立上下文：只带 task + 最小 context，不污染主 agent 上下文
//   - flash 优先：成本分级（子任务不值得用 pro）
//   - 结构化回传：模型输出 { result, evidence, confidence } JSON，主 agent 只收结论不读过程
// 依赖注入：复用 HttpModelAdapter（httpFetch/authReader/modelReader/resolveAuth 由宿主注入）

import { HttpModelAdapter } from "./model-adapter.mjs";

let _adapter = null;
let _getDefaultModel = () => null;
let _getFlashModel = () => null;

export function initSubagent({ httpFetch, authReader, modelReader, resolveAuth, getDefaultModel, getFlashModel }) {
  _adapter = new HttpModelAdapter({ httpFetch, authReader, modelReader, resolveAuth });
  if (getDefaultModel) _getDefaultModel = getDefaultModel;
  if (getFlashModel) _getFlashModel = getFlashModel;
}

/**
 * 派发一个隔离子任务。
 * @param {object} p
 * @param {string} p.task        子任务描述（要做什么、输出什么结论）
 * @param {string[]} [p.context] 最小上下文（只放必要信息，避免上下文膨胀）
 * @param {object} [p.model]     指定模型（缺省 flash → default）
 * @param {number} [p.timeoutMs] 超时
 * @returns {Promise<{done:true,result:string,evidence:string[],confidence:number,model:object}|{done:false,error:string,raw?:string,model?:object}>}
 */
export async function spawnSubagent({ task, context = [], model, timeoutMs = 120000 }) {
  const m = model || _getFlashModel() || _getDefaultModel();
  if (!m || !_adapter) return { done: false, error: "subagent 未初始化或无可用模型" };
  const SYSTEM = "你是一个专精单任务的小助手。只完成交给你的任务，不要扩展、不要闲聊。\n" +
    "输出必须严格为 JSON 对象（不要输出任何其他文字）：\n" +
    "{\"result\": \"任务结论（字符串）\", \"evidence\": [\"关键证据1\", \"关键证据2\"], \"confidence\": 0到1的数字}";
  const messages = [
    { role: "system", content: SYSTEM },
    ...(context || []).map(c => ({ role: "user", content: c })),
    { role: "user", content: task },
  ];
  let r;
  try {
    r = await _adapter.chat(m, messages, { params: { temperature: 0.3 }, maxTokens: 2000, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { done: false, error: String(e?.message || e).slice(0, 150), model: m };
  }
  if (r.error || !r.text) return { done: false, error: r.error || "无回复", model: m };
  // 解析结构化输出（宽容：找第一个 { } 块）
  let parsed = null;
  try {
    const match = String(r.text).match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  } catch {}
  if (!parsed || parsed.result === undefined) {
    return { done: false, error: "输出不是预期 JSON 结构", raw: String(r.text).slice(0, 300), model: m };
  }
  return {
    done: true,
    result: String(parsed.result),
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map(String) : [],
    confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    model: m,
  };
}
