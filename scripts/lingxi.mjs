#!/usr/bin/env node
// ══════════════════════════════════════════════════════════
// scripts/lingxi.mjs —— 灵犀 CLI（小语侧快速记灵感用）
// 用法：
//   node scripts/lingxi.mjs add --source xiaoyu --text "意外灵感内容"
//   node scripts/lingxi.mjs add --source user   --text "伙伴口述的灵感"
//   node scripts/lingxi.mjs list [--source user|xiaoyu] [--status new|adopted|archived]
// ══════════════════════════════════════════════════════════
import { listLingXi, addLingXi } from "../engine/lingxi.mjs";

const WS_ROOT = process.env.WS_ROOT || "D:/pi-workspace";
const [cmd, ...rest] = process.argv.slice(2);

function arg(name) {
  const i = rest.indexOf("--" + name);
  return i >= 0 ? rest[i + 1] : undefined;
}

if (cmd === "add") {
  const r = addLingXi(WS_ROOT, { text: arg("text"), source: arg("source") || "xiaoyu" });
  if (r.error) { console.error("✗ " + r.error); process.exit(1); }
  console.log(`✓ 已记灵犀 [${r.entry.source}] ${r.entry.id}`);
} else if (cmd === "list") {
  const entries = listLingXi(WS_ROOT, { source: arg("source"), status: arg("status") });
  const label = { user: "伙伴", xiaoyu: "小语", new: "待过", adopted: "已采纳", archived: "已归档" };
  if (!entries.length) { console.log("（空）"); process.exit(0); }
  for (const e of entries) {
    console.log(`[${label[e.source]}·${label[e.status] || e.status}] ${e.ts.slice(0, 16).replace("T", " ")}  ${e.text.replace(/\n/g, " ").slice(0, 80)}  #${e.id.slice(0, 8)}`);
  }
} else {
  console.log('用法: node scripts/lingxi.mjs add --source xiaoyu --text "..." | list [--source] [--status]');
}
