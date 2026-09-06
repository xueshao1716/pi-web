// engine/engine-pair.mjs —— 主次引擎对（后台持久化，下一条消息生效）
// 元枢是自己的引擎胚子；pi / dsh 是可替换适配器，不是永久双核。
import fs from "node:fs";
import { atomicWriteJson } from "./atomic-io.mjs";

export const ENGINE_CATALOG = {
  yuanshu: {
    id: "yuanshu",
    label: "元枢",
    canLead: true,
    desc: "自制对话循环，最终要长成的引擎",
    intro: "自制对话循环。记忆、出图、规划、空回合重试和工具中止都挂在这条上，最终要自己当家。",
    can: ["任意 OpenAI 兼容通道，含非 SDK 原生", "工具调度：只读可并行、写互斥", "空回复重试后再兑底；断连杀掉 bash / dsh"],
    cannot: ["还不是默认主驾，炸了仍靠次席或 pi 兑底", "任务跟 HTTP 绑死，刷新会掐掉这一轮", "没有独立评测绳，Gateway 插件循环仍是演示"],
  },
  pi: {
    id: "pi",
    label: "pi",
    canLead: true,
    desc: "pi SDK 官方 agent 管线",
    intro: "pi SDK 官方 agent 管线，现默认主驾。会话 JSONL 也是它的格式，人还是小语。",
    can: ["SDK 原生通道上的完整 agent 生命周期", "现网默认主驾，会话文件与官方工具链", "失败时兑底到次引擎（默认元枢）"],
    cannot: ["非原生通道会兑底元枢，不能硬开智谱/商汤", "记忆、出图、规划不在这条循环里长", "厂商适配器，可卸，不是永久双核"],
  },
  dsh: {
    id: "dsh",
    label: "dsh",
    canLead: true,
    desc: "DeepSeek Harness 对话适配器（厂商，可卸）",
    intro: "DeepSeek Harness 的一轮 headless 适配器，兼执行臂。不是第二套自制循环。",
    can: ["主驾一轮自包含 headless 对话", "dsh_task 派代码 / 沙箱 / 多步工作流", "客户端断开可杀掉 dsh 子进程"],
    cannot: ["不是完整多轮大脑，不接记忆 / 出图 / 规划主循环", "依赖本机 dsh 安装和 DeepSeek 额度", "厂商可卸，不能冒充元枢"],
  },
};

export const DEFAULT_PAIR = { primary: "pi", secondary: "yuanshu" };

let _file = "";

export function initEnginePair(file) {
  _file = file || "";
}

export function normalizePair(obj) {
  const primary = String(obj?.primary || DEFAULT_PAIR.primary);
  const secondary = String(obj?.secondary || DEFAULT_PAIR.secondary);
  if (!ENGINE_CATALOG[primary] || !ENGINE_CATALOG[secondary]) throw new Error("未知引擎");
  if (primary === secondary) throw new Error("主次不能相同");
  return { primary, secondary };
}

export function loadEnginePair() {
  try {
    if (_file && fs.existsSync(_file)) {
      return normalizePair(JSON.parse(fs.readFileSync(_file, "utf8")));
    }
  } catch {}
  return { ...DEFAULT_PAIR };
}

export function saveEnginePair(obj) {
  const pair = normalizePair(obj);
  if (_file) {
    try { atomicWriteJson(_file, pair); } catch {}
  }
  return pair;
}

export function swapEnginePair() {
  const cur = loadEnginePair();
  return saveEnginePair({ primary: cur.secondary, secondary: cur.primary });
}

export function resolveLead(pair, ctx = {}) {
  const p = (() => {
    try { return normalizePair(pair); } catch { return { ...DEFAULT_PAIR }; }
  })();
  if (ctx.forceYuanshu) {
    return { lead: "yuanshu", wanted: p.primary, deferred: p.primary === "yuanshu" ? null : p.primary, reason: "force" };
  }
  // 非 SDK 原生通道只逼 pi agent 兑底；dsh / 元枢有自己的通道，不受模型下拉绑架
  if (ctx.nativeChannel === false && p.primary === "pi") {
    return { lead: "yuanshu", wanted: p.primary, deferred: "pi", reason: "non-native" };
  }
  const prim = ENGINE_CATALOG[p.primary];
  if (prim?.canLead) return { lead: p.primary, wanted: p.primary, deferred: null, reason: "primary" };
  const sec = ENGINE_CATALOG[p.secondary];
  const lead = sec?.canLead ? p.secondary : "yuanshu";
  return { lead, wanted: p.primary, deferred: p.primary, reason: "cannot-lead" };
}

export function leadNote(decision) {
  const names = { yuanshu: "元枢", pi: "pi", dsh: "dsh" };
  const lead = names[decision?.lead] || decision?.lead || "元枢";
  if (decision?.reason === "non-native") return `本轮主引擎 · ${lead}（该通道走自制循环）`;
  if (decision?.deferred) {
    const other = names[decision.deferred] || decision.deferred;
    return `本轮主引擎 · ${lead}（${other} 主驾让路）`;
  }
  return `本轮主引擎 · ${lead}`;
}

export function describePair(pair = loadEnginePair(), ctx = {}) {
  const p = (() => { try { return normalizePair(pair); } catch { return { ...DEFAULT_PAIR }; } })();
  const decision = resolveLead(p, ctx);
  return {
    ...p,
    catalog: Object.values(ENGINE_CATALOG),
    lead: decision.lead,
    deferred: decision.deferred,
    reason: decision.reason,
  };
}
