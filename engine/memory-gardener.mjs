// ══════════════════════════════════════════════════════════
// engine/memory-gardener.mjs —— 记忆园丁（规则化安全版）
// MyAgents「记忆园丁 + 精确回执」思想的安全落地：定期扫描记忆，
// 检测【重复/流水账条目】【固定记忆过时的「当前状态」节堆积】【记忆日志膨胀】，
// 产出健康报告 + 人工处理建议。只报告、绝不自动改记忆——
// 记忆是重要资产，任何变更走人工/提案审批（零污染原则，正对用户「禁止流水账式重复条目」）。
// 用法：scanMemoryHealth(wsRoot) 纯函数（可单测）；gardenMemory(wsRoot) 供 time-engine 定时调用。
// ══════════════════════════════════════════════════════════
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { memoryPaths } from "./memory.mjs";

const DAY = 24 * 60 * 60 * 1000;
const STALE_DAYS = 7; // 「当前状态」节超过 7 天视作过时，建议归档
const LOG_BLOAT = 400; // 记忆日志超过该条数建议归档早期历史

// 记忆日志条目以 "### 日期 时间" 开头
function parseLog(raw) {
  return raw.split(/\n###\s/).filter(b => b.trim())
    .map(b => (b.startsWith("### ") ? b : "### " + b).trim());
}

export function scanMemoryHealth(wsRoot) {
  const report = { totalEntries: 0, duplicates: [], staleSections: { total: 0, staleCount: 0, staleDates: [] }, recommendations: [] };
  try {
    const paths = memoryPaths(wsRoot);

    // 1) 记忆日志：重复/流水账检测（要点行前 40 字去空白作 key，同 key 多次 = 疑似重复）
    if (existsSync(paths.log)) {
      const blocks = parseLog(readFileSync(paths.log, "utf8"));
      report.totalEntries = blocks.length;
      const keyCount = {};
      for (const b of blocks) {
        const line = (b.split("\n").find(l => l.includes("要点：")) || b);
        const key = line.trim().replace(/\s+/g, "").slice(0, 40);
        if (!key) continue;
        (keyCount[key] = keyCount[key] || []).push(b);
      }
      for (const [key, arr] of Object.entries(keyCount)) {
        if (arr.length > 1) {
          report.duplicates.push({
            key, count: arr.length,
            dates: arr.map(b => (b.match(/###\s*([\d-]+)/)?.[1] || "")).filter(Boolean),
          });
        }
      }
    }

    // 2) 固定记忆：过时的「当前状态」节堆积检测
    if (existsSync(paths.fixed)) {
      const raw = readFileSync(paths.fixed, "utf8");
      const dates = [...raw.matchAll(/##\s*当前状态（([\d-]+)）/g)].map(m => m[1]);
      if (dates.length > 1) {
        const times = dates.map(d => new Date(d).getTime()).sort((a, b) => b - a);
        const newest = times[0];
        const stale = dates.filter(d => (newest - new Date(d).getTime()) / DAY > STALE_DAYS);
        report.staleSections = { total: dates.length, staleCount: stale.length, staleDates: stale };
      }
    }

    // 3) 建议（只报告，不自动改）
    if (report.duplicates.length) report.recommendations.push(`发现 ${report.duplicates.length} 组疑似重复/流水账记忆条目（记忆日志），建议人工合并。`);
    if (report.staleSections.staleCount) report.recommendations.push(`固定记忆有 ${report.staleSections.staleCount} 个超过 ${STALE_DAYS} 天的过时「当前状态」节，建议归档到历史或精简。`);
    if (report.totalEntries > LOG_BLOAT) report.recommendations.push(`记忆日志已达 ${report.totalEntries} 条，建议归档最早历史条目。`);
  } catch (e) {
    report.error = String(e?.message || e);
  }
  return report;
}

// 园丁执行入口（供 time-engine 定时调用）：返回健康摘要，绝不动记忆内容
export function gardenMemory(wsRoot) {
  const r = scanMemoryHealth(wsRoot);
  if (r.error) return { ok: false, error: r.error };
  return { ok: true, totalEntries: r.totalEntries, duplicates: r.duplicates.length, staleSections: r.staleSections.staleCount, recommendations: r.recommendations };
}

// 固定记忆/记忆日志的绝对路径暴露（供 API 挂载用）
export function gardenerPaths(wsRoot) { return memoryPaths(wsRoot); }
