// 定时任务执行材料：注入昨日会话/记忆，只给只读工具，禁止模型交填空框架
import fs from "node:fs";
import path from "node:path";
import { splitLogBlocks } from "./memory-facts.mjs";

const READ_TOOLS = new Set(["read", "web_search", "search_files"]);
const CLIP_CAP = 6000;

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function ymdOf(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function yesterdayYmd(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return ymdOf(d);
}

export function toLocalYmd(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return ymdOf(d);
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function formatSession(s) {
  const name = String(s?.name || "未命名").slice(0, 40);
  const preview = String(s?.preview || "").replace(/\s+/g, " ").slice(0, 80);
  return preview ? `- ${name}｜${preview}` : `- ${name}`;
}

function clipMemoryLog(wsRoot, ymd) {
  const fp = path.join(wsRoot, "记忆", "记忆日志.md");
  if (!fp || !fs.existsSync(fp)) return "";
  let raw = "";
  try { raw = fs.readFileSync(fp, "utf8"); } catch { return ""; }
  const hits = splitLogBlocks(raw).blocks.filter((b) => b.includes(ymd) && !/^- status:\s*superseded\b/m.test(b));
  return hits.join("\n\n").slice(0, CLIP_CAP);
}

export function collectTimeTaskBrief({ wsRoot, sessions = [], now = new Date() } = {}) {
  const ymd = yesterdayYmd(now);
  const list = Array.isArray(sessions) ? sessions : [];
  const matched = list.filter((s) => toLocalYmd(s.updatedAt || s.createdAt) === ymd);
  const sessionLines = matched.slice(0, 12).map(formatSession);
  const recentLines = matched.length ? [] : list.slice(0, 8).map(formatSession);
  return {
    ymd,
    sessionLines,
    recentLines,
    memoryClip: clipMemoryLog(wsRoot, ymd),
  };
}

export function buildTimeTaskPrompt(task, brief = {}) {
  const ymd = brief.ymd || "";
  const sessions = (brief.sessionLines || []).join("\n") || "（记录里没有昨日会话）";
  const recent = (brief.recentLines || []).length
    ? `\n【近期会话（非昨日，仅参考）】\n${brief.recentLines.join("\n")}\n`
    : "";
  const memory = brief.memoryClip || "（记录里没有昨日记忆日志）";
  return `${task?.prompt || "对前一日工作与成长复盘"}
（定时任务到点触发，直接写完整复盘，不要反问。）

复盘对象日期：${ymd}
【昨日会话】
${sessions}
${recent}【昨日记忆日志摘录】
${memory}

硬约束：
- 必须根据上方真实材料写完整复盘，禁止输出填空框架/占位符（如「列出昨天完成的3-5件」）。
- 禁止声称无法读取聊天记录或工作数据；材料不够就写「记录里没有」。
- 表格必须有数据行，没有事实就不要建空表。
- 需要细节可 read 记忆.md、记忆/记忆日志.md 或会话文件；不要 bash/write。`;
}

export function composeTimeTaskMessages(task, ctx) {
  return [{ role: "user", content: buildTimeTaskPrompt(task, collectTimeTaskBrief(ctx)) }];
}

export function timeTaskReadTools(all = []) {
  return (Array.isArray(all) ? all : []).filter((t) => READ_TOOLS.has(t?.function?.name || t?.name));
}
