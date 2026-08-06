// pi-web ↔ TUI 记忆同步脚本
// 作用：把 pi-web 的记忆文件（记忆.md/记忆日志/经验库）同步到 TUI 项目级 APPEND_SYSTEM.md
// 这样 TUI 在 D:\pi-workspace 下运行时，加载同一份记忆，两端记忆相通
import fs from "node:fs";
import path from "node:path";

const WS = "D:/pi-workspace";
const OUT = path.join(WS, ".pi", "APPEND_SYSTEM.md");

function read(p) {
  try { return fs.readFileSync(p, "utf8").trim(); } catch { return ""; }
}

export function syncMemoryToTui() {
  try {
    const memory = read(path.join(WS, "记忆.md"));
    const log = read(path.join(WS, "记忆", "记忆日志.md"));
    const exp = read(path.join(WS, "工程", "经验库", "experience.md"));

    const expRecent = exp ? exp.split(/\n### /).slice(-6).map(b => "### " + b.trim()).join("\n") : "";

    const content = `# 小语 · 工作空间记忆（TUI 与 pi-web 共享）

> 本文件由记忆同步脚本自动生成，与 pi-web 共享同一份记忆。
> 修改请改源文件（记忆.md / 记忆日志.md / 经验库），勿直接编辑本文件。

## 固定记忆（记忆.md）

${memory || "（无）"}

## 最近记忆日志

${log ? log.split("\n### ").slice(-8).map(b => "### " + b.trim()).join("\n") : "（无）"}

## 经验库最近条目

${expRecent || "（无）"}
`;
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, content, "utf8");
    console.log(`[memory-sync] 已同步记忆到 TUI: ${OUT} (${content.length}B)`);
    return true;
  } catch (e) {
    console.log("[memory-sync] 同步失败:", String(e?.message || e).slice(0, 100));
    return false;
  }
}

// 直接运行则同步一次（node memory-sync.mjs）
const isMain = process.argv[1] && fs.existsSync(process.argv[1]) && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (isMain || process.env.MEMORY_SYNC_RUN) {
  syncMemoryToTui();
}
