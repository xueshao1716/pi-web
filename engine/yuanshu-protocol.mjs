// 元枢工作协议：给能力，自己判断、做完、汇报。密钥仍由宿主代持。
import { shouldInjectFullMemory } from "./context-loader.mjs";
import { sessionContinuityNote } from "./yuanshu-session.mjs";

export const YUANSHU_PROTOCOL = `【元枢工作协议】
你独立干活：自己判断怎么做，自己做完，自己汇报结果。宿主给工具和密文通道，不替你做决定。
1. 顺序：计划 → 动手 → 验收。汇报时说清楚做了什么、产物在哪、还有什么没做。
2. 出片/出图/配音优先 generate_video / generate_image / generate_tts（list_channels 看通道）。对话里有播放器，路径写进回复就会播；要本机打开、复制到交付或分享目录，你看着办。
3. 技能摘要对得上就 activate_skill 再做，对不上按你的判断做。
4. 多步可用 todo_write；可分派的调研用 delegate_task。
5. 密钥由宿主代持（auth.json / .token 里没有你能用的明文）。缺字段宿主会补，你接着干，把结果说清楚。
6. 独白/剧本/创作：先按判断写，假设写进汇报。搜两轮锁不到人就动手，不要连搜百科。
7. 本会话历史已在上下文。问记忆先看历史和记忆目录，需要细节再 read 记忆.md，不要 bash 扫盘，也不要说记忆断了。`;

export function matchSkillsForTask(message, skills = [], limit = 3) {
  const msg = String(message || "");
  if (!msg.trim() || msg.length < 2 || /^(嗯|好|哦|哈|啊|继续|谢谢)$/.test(msg.trim())) return [];
  const scored = [];
  for (const s of skills || []) {
    const name = String(s.name || "");
    const desc = String(s.desc || "");
    let score = 0;
    if (msg.includes(name)) score += 5;
    for (const tok of name.split(/[-_]/)) {
      if (tok.length >= 4 && msg.toLowerCase().includes(tok.toLowerCase())) score += 2;
    }
    for (const tok of desc.split(/[\s,，、/]/)) {
      if (tok.length >= 2 && msg.includes(tok)) score += 2;
    }
    if (/视频|分镜|出片|短片/.test(msg) && /video|视频|seedance|aigc|分镜/.test(`${name}${desc}`)) score += 4;
    if (/图|海报|写真|配图/.test(msg) && /image|图|写真|海报|wanxiang/.test(`${name}${desc}`)) score += 3;
    if (/小说|连载|故事/.test(msg) && /novel|小说|forge/.test(`${name}${desc}`)) score += 3;
    if (score) scored.push({ name, desc, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function formatSkillIndexPrompt(list) {
  if (!Array.isArray(list) || !list.length) return "";
  return `技能库（${list.length} 个）：对得上就 activate_skill 加载全文，对不上按你的判断做。\n${list.map((s) => `- ${s.name}：${String(s.desc || "").slice(0, 90)}`).join("\n")}`;
}

export function buildYuanshuContext({ message, skills = [], experience = [], fullMemory = [], todos = "", hist = [] } = {}) {
  const out = [YUANSHU_PROTOCOL, sessionContinuityNote(hist)];
  const skillText = formatSkillIndexPrompt(skills);
  if (skillText) out.push(skillText);
  const matched = matchSkillsForTask(message, skills);
  if (matched.length) {
    out.push(`本轮任务可能匹配技能：${matched.map((s) => s.name).join("、")}。对得上就 activate_skill，对不上按你的判断继续。`);
  }
  if (todos) out.push(String(todos));
  if (shouldInjectFullMemory(message)) {
    if (Array.isArray(experience)) out.push(...experience);
    if (Array.isArray(fullMemory)) out.push(...fullMemory);
  }
  return out;
}

const MEDIA_PROBE = /\/v1\/videos|agnes-ai\.com|images\/generations|\/v3\/images|generateImage|\/api\/media|\/api\/image/i;

export function coachToolFailure(name, args = {}, out = {}) {
  const next = { ...out, text: String(out?.text || ""), isError: out?.isError === true };
  const cmd = String(args?.command || args?.cmd || "");
  if (name === "generate_video" && next.isError) {
    next.text = `${next.text}\n[宿主] 缺字段已可由宿主补。你接着判断：重试 generate_video，或换做法，做完汇报。`;
    return next;
  }
  if ((name === "generate_image" || name === "generate_tts") && next.isError) {
    next.text = `${next.text}\n[宿主] ${name} 这条通道还在。你判断下一步，做完汇报。`;
    return next;
  }
  if ((name === "bash" || name === "dsh") && MEDIA_PROBE.test(cmd) && next.isError) {
    next.text = `${next.text}\n[宿主] 上游 API 由 generate_video / generate_image / generate_tts 代持密钥。你也可以换做法，做完汇报。`;
    return next;
  }
  return next;
}
