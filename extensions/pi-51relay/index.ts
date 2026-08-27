/**
 * pi-51relay — 把 51relay.com 中转接到 pi（社区标准做法：覆盖原生 provider 的 baseUrl）
 *
 * 思路（对应 Claude Code 设 ANTHROPIC_BASE_URL / OpenAI 设 OPENAI_BASE_URL）：
 *   - 覆盖 provider 名 "openai" → 指向 51relay，模型挂 gpt-5.5 / gpt-5.6 等
 *   - 覆盖 provider 名 "anthropic" → 指向 51relay，模型挂 claude-*
 * 这样 pi 用**原生 provider 的鉴权**（native auth 被 pi 识别），不踩
 * 「新建自定义 provider 报 Provider is not configured」的坑。
 * key 从 auth.json 读（与 pi-web 同一把），不硬编码。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BASE = "https://www.51relay.com";
const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

const GPT_COMPAT = {
  supportsReasoningEffort: true,
  supportsFinishReason: true,
  maxTokensField: "max_completion_tokens",
} as const;
const GPT_TLM = {
  off: null, minimal: null, low: "low", medium: "medium",
  high: "high", xhigh: "xhigh", max: "max",
} as const;

export default function (pi: ExtensionAPI): void {
  let auth: Record<string, { key?: string }> = {};
  try {
    auth = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".pi", "agent", "auth.json"), "utf8")) || {};
  } catch {}

  // ── 覆盖原生 openai：gpt-5.5 / 5.6（顶配）──
  const oaiKey = auth["oai-relay"]?.key;
  if (oaiKey) {
    pi.registerProvider("openai", {
      name: "51relay · OpenAI",
      baseUrl: BASE,
      apiKey: oaiKey,
      api: "openai-completions",
      models: [
        { id: "gpt-5.6",      name: "GPT-5.6",      reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 16384, compat: GPT_COMPAT, thinkingLevelMap: GPT_TLM },
        { id: "gpt-5.6-sol",  name: "GPT-5.6 Sol",  reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 16384, compat: GPT_COMPAT, thinkingLevelMap: GPT_TLM },
        { id: "gpt-5.5",      name: "GPT-5.5",      reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 16384, compat: GPT_COMPAT, thinkingLevelMap: GPT_TLM },
        { id: "gpt-5.4",      name: "GPT-5.4",      reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 16384, compat: GPT_COMPAT, thinkingLevelMap: GPT_TLM },
        { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 128000, maxTokens: 8192, compat: GPT_COMPAT, thinkingLevelMap: GPT_TLM },
      ],
    });
  }

  // ── 覆盖原生 anthropic：claude-* ──
  const claudeKey = auth["claude-relay"]?.key;
  if (claudeKey) {
    pi.registerProvider("anthropic", {
      name: "51relay · Claude",
      baseUrl: BASE,
      apiKey: claudeKey,
      api: "anthropic-messages",
      models: [
        { id: "claude-sonnet-5", name: "Claude Sonnet 5", reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 8192 },
        { id: "claude-opus-4-8", name: "Claude Opus 4.8", reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 16384 },
        { id: "claude-opus-4-6", name: "Claude Opus 4.6", reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 16384 },
        { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 4096 },
      ],
    });
  }
}
