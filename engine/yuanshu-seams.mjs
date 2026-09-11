// 元枢循环接缝：插件贡献能力，主聊天仍是 unifiedChat（不是 Gateway 循环）
import { buildYuanshuSections } from "./yuanshu-prompt.mjs";

export const SEAM_PROMPT = "prompt-section";

export function promptTimeText(now = new Date()) {
  const t = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const p = (n) => String(n).padStart(2, "0");
  const d = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
  return `当前时间：${d}（周${["日", "一", "二", "三", "四", "五", "六"][t.getDay()]}）。涉及时间/日期/定时/时效判断以此为准。`;
}

export function promptPersonaText(model) {
  if (!model?.id) return "";
  return `本轮由 ${model.provider} 通道的 ${model.id} 模型驱动，运行在元枢工作台（助手角色：小语）。用户问及你的模型/版本/能力时，以此如实回答；不要自称其他产品名。`;
}

export function mergeContributedSections(base = {}, contribs = []) {
  const next = { ...base };
  for (const c of contribs) {
    const id = String(c?.section || "").trim();
    const text = String(c?.text || "").trim();
    if (!id || !text) continue;
    if (c.replace || !String(next[id] || "").trim()) next[id] = text;
    else next[id] = `${String(next[id]).trim()}\n${text}`;
  }
  return next;
}

export function collectPromptContributions(registry, ctx = {}) {
  if (!registry || typeof registry.list !== "function") return [];
  const out = [];
  for (const p of registry.list()) {
    const svc = registry.get(p.id);
    if (!svc || svc.seam !== SEAM_PROMPT || typeof svc.contribute !== "function") continue;
    let text = "";
    try { text = String(svc.contribute(ctx) || "").trim(); } catch {}
    if (!text) continue;
    out.push({ seam: SEAM_PROMPT, section: svc.section, text, replace: !!svc.replace, id: p.id });
  }
  return out;
}

export async function registerPromptSection(registry, {
  id, name, section, contribute, replace = false, deps = [],
} = {}) {
  if (!registry?.load) throw new Error("需要 PluginRegistry");
  await registry.load({
    id,
    name: name || id,
    deps,
    mount: () => ({ seam: SEAM_PROMPT, section, contribute, replace }),
  });
  return id;
}

export function assembleYuanshuSystem(baseOpts = {}, registry = null, ctx = {}) {
  const merged = mergeContributedSections(
    buildYuanshuSections(baseOpts),
    collectPromptContributions(registry, ctx),
  );
  if (!String(merged.time || "").trim()) merged.time = promptTimeText(ctx.now);
  if (!String(merged.persona || "").trim()) {
    const persona = promptPersonaText(ctx.model);
    if (persona) merged.persona = persona;
  }
  return merged;
}
