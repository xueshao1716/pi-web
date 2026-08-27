/**
 * pi-51relay — 注册 51relay.com 中转到 pi 引擎（真实 pi TUI / agent 会话可用）
 *
 * 用 pi.registerProvider 把 51relay 的两个协议通道注册进 pi：
 *   - oai-relay     ：gpt-5.5 / gpt-5.6 等（openai-completions，/v1/chat/completions）
 *   - claude-relay  ：claude-*（anthropic-messages，/v1/messages）
 *
 * 密钥从 ~/.pi/agent/auth.json 读取（不硬编码、不入库），与 pi-web 的
 * models-store 同一把 key。模型清单写死（非密钥），可按需增减。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BASE = "https://www.51relay.com";

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

// OpenAI 系：gpt-5.x 走 reasoning_effort，max_tokens 字段为 max_completion_tokens
const GPT_COMPAT = {
  supportsReasoningEffort: true,
  maxTokensField: "max_completion_tokens",
} as const;
const GPT_TLM = {
  off: null, minimal: null, low: "low", medium: "medium",
  high: "high", xhigh: "xhigh", max: "max",
} as const;

// Claude 系：anthropic-messages（思考格式由 pi 原生 anthropic 处理）
const CLAUDE_COMPAT = {} as const;

export default function (pi: ExtensionAPI): void {
  let auth: Record<string, { key?: string }> = {};
  try {
    auth = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".pi", "agent", "auth.json"), "utf8")) || {};
  } catch {}

  // ── OpenAI 侧：gpt-5.5 / 5.6（后端顶配主力）──
  const oaiKey = auth["oai-relay"]?.key;
  if (oaiKey) {
    pi.registerProvider("oai-relay", {
      name: "51relay · OpenAI",
      baseUrl: BASE,
      apiKey: oaiKey,
      api: "openai-completions",
      models: [
        { id: "gpt-5.6",     name: "GPT-5.6",     reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 16384, compat: GPT_COMPAT, thinkingLevelMap: GPT_TLM },
        { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 16384, compat: GPT_COMPAT, thinkingLevelMap: GPT_TLM },
        { id: "gpt-5.5",     name: "GPT-5.5",     reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 16384, compat: GPT_COMPAT, thinkingLevelMap: GPT_TLM },
        { id: "gpt-5.4",     name: "GPT-5.4",     reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 16384, compat: GPT_COMPAT, thinkingLevelMap: GPT_TLM },
        { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 128000, maxTokens: 8192, compat: GPT_COMPAT, thinkingLevelMap: GPT_TLM },
      ],
    });
  }

  // ── Claude 侧 ──
  const claudeKey = auth["claude-relay"]?.key;
  if (claudeKey) {
    pi.registerProvider("claude-relay", {
      name: "51relay · Claude",
      baseUrl: BASE,
      apiKey: claudeKey,
      api: "anthropic-messages",
      models: [
        { id: "claude-sonnet-5", name: "Claude Sonnet 5", reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 8192, compat: CLAUDE_COMPAT },
        { id: "claude-opus-4-8", name: "Claude Opus 4.8", reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 16384, compat: CLAUDE_COMPAT },
        { id: "claude-opus-4-6", name: "Claude Opus 4.6", reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 16384, compat: CLAUDE_COMPAT },
        { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", reasoning: true, input: ["text"], cost: ZERO_COST, contextWindow: 200000, maxTokens: 4096, compat: CLAUDE_COMPAT },
      ],
    });
  }
}
