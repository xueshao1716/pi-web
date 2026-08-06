// pi-web 记忆服务：三层记忆统一管理（固定记忆 + 记忆日志 + 自动沉淀）
// 借鉴 xi-system 记忆理念：重要信息自动写入、跨会话长期有效
import fs from "node:fs";
import path from "node:path";
import { syncMemoryToTui } from "./memory-sync.mjs";

// 记忆文件位置
export function memoryPaths(wsRoot) {
  return {
    fixed: path.join(wsRoot, "记忆.md"),          // 固定记忆（约定/偏好/状态）
    log: path.join(wsRoot, "记忆", "记忆日志.md"),  // 记忆日志（按时间追加，自动记录重要事件）
  };
}

// 自动记忆：对话完成后调用，把本轮重要信息写入记忆日志
// 重要信息检测：用户表达偏好/约定/项目进展/关键决策
export function autoMemorize(wsRoot, { userMsg = "", assistantMsg = "", files = [] } = {}) {
  try {
    const paths = memoryPaths(wsRoot);
    fs.mkdirSync(path.dirname(paths.log), { recursive: true });
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    // 检测值得记忆的内容
    const userText = String(userMsg || "").slice(0, 500);
    const assistText = String(assistantMsg || "").slice(0, 800);
    const notes = [];
    // 用户偏好/约定信号
    const prefRe = /以后|记住|我习惯|我喜欢|用这个|就按|规则|约定|偏好|改成|统一用/g;
    if (prefRe.test(userText)) notes.push("用户表达了偏好/约定");
    // 新项目/交付信号
    const projRe = /创建|新建|交付|完成|搞定|上线|做好/g;
    if (projRe.test(userText) || projRe.test(assistText)) notes.push("有项目/交付活动");
    // 文件产物
    if (files.length) notes.push(`交付文件: ${files.map(f => f.name).slice(0, 3).join(", ")}`);
    if (!notes.length) return { wrote: false, reason: "无重要信息" };

    // 从 assistant 回复提取要点（前几行，跳过占位文本）
    const skipRe = /^（(交付文件|本轮生成的文件|本轮产生的文件)）/;
    const head = assistText.split("\n").filter(l => l.trim() && !l.trim().startsWith("```") && !skipRe.test(l.trim())).slice(0, 3).join(" ").slice(0, 150);
    const entry = `### ${stamp}\n- ${notes.join("；")}\n${head ? `- 要点：${head}\n` : ""}`;
    let log = "";
    try { log = fs.readFileSync(paths.log, "utf8"); } catch {}
    fs.writeFileSync(paths.log, log + entry + "\n", "utf8");
    return { wrote: true, note: entry };
  } catch { return { wrote: false }; }
}

// 加载记忆日志最近条目（供对话上下文参考）
export function loadRecentMemory(wsRoot, max = 10) {
  try {
    const paths = memoryPaths(wsRoot);
    if (!fs.existsSync(paths.log)) return [];
    const raw = fs.readFileSync(paths.log, "utf8");
    const blocks = raw.split(/\n### /).filter(b => b.trim());
    return blocks.slice(-max).map(b => (b.startsWith("### ") ? b : "### " + b).trim());
  } catch { return []; }
}

// 更新固定记忆的"当前状态"节（追加一行状态，按日期分组）
export function appendState(wsRoot, line) {
  try {
    const paths = memoryPaths(wsRoot);
    if (!fs.existsSync(paths.fixed)) return false;
    let s = fs.readFileSync(paths.fixed, "utf8");
    const today = new Date().toISOString().slice(0, 10);
    const marker = `## 当前状态（${today}）`;
    if (s.includes(marker)) {
      // 已有今日节 → 在节内末尾追加（内容去重）
      const idx = s.indexOf(marker);
      const nextIdx = s.indexOf("\n## ", idx + marker.length);
      const endIdx = nextIdx > 0 ? nextIdx : s.length;
      const section = s.slice(idx, endIdx);
      if (!section.includes(line.slice(0, 30))) {
        const newSection = section.replace(/\n*$/, "") + `\n- ${line}\n`;
        s = s.slice(0, idx) + newSection + s.slice(endIdx);
      }
    } else {
      // 无今日节 → 追加到文件末尾
      s = s.replace(/\n*$/, "") + `\n\n${marker}\n- ${line}\n`;
    }
    fs.writeFileSync(paths.fixed, s, "utf8");
    // 同步到 TUI（两端记忆相通）
    try { syncMemoryToTui(); } catch {}
    return true;
  } catch { return false; }
}
