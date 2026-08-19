// ══ Reasonix 机制落地（esengine/DeepSeek-Reasonix 借鉴，2026-08-19）══
// 三个纯函数/常量：工具结果压缩 / NEEDS_PRO 自报升级 / scavenge 工具调用捞回。
// 纯逻辑模块：不依赖 server.mjs 内部符号，可单测、可复用。

// ① turn-end 工具结果压缩（P3）：超长工具结果只保留头尾+省略提示，后续轮次省 token；
//    会话文件原文不动（审计无损），仅喂模型时压缩。
export const TURN_END_RESULT_CAP = 9000;   // 超过此字符数（≈3000-4500 token）触发
export const TURN_END_RESULT_EDGE = 3000;  // 保留头尾各多少字符
export function shrinkToolResult(text) {
  if (!text || text.length <= TURN_END_RESULT_CAP) return text;
  return text.slice(0, TURN_END_RESULT_EDGE)
    + `\n\n…[结果过长已压缩：原文 ${text.length} 字符，保留头尾各 ${TURN_END_RESULT_EDGE} 字符，如需完整内容可重新读取]…\n\n`
    + text.slice(-TURN_END_RESULT_EDGE);
}

// ② NEEDS_PRO 自报升级（P3）：模型认为任务超纲时输出 <<<NEEDS_PRO[: 原因]>>> 首行
//    → 系统用 pro 模型重试一次。纯自报、无静默升级。
export const NEEDS_PRO_RE = /^<<<\s*NEEDS_PRO(?:\s*:\s*([^>]{1,120}))?\s*>>>/;

// ③ scavenge（P2 修复管线）：DeepSeek 实证故障——工具调用 JSON 偶发被放进 reasoning_content，
//    final message 无 tool_calls。无 tool_calls 且有思考时，扫描思考捞回合法工具调用。
//    校验：name 必须在工具集 + arguments 是对象 + 每轮每工具限 1 次（防重复捞/防思考示例误捞）。
export function scavengeToolCalls(thinking, toolDefs, seenCalls) {
  if (!thinking || !toolDefs) return [];
  const names = new Set(toolDefs.map(t => t.function?.name).filter(Boolean));
  const found = [];
  const patterns = [
    /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/g,
    /\{\s*"function"\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}\s*\}/g,
    /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"parameters"\s*:\s*(\{[\s\S]*?\})\s*\}/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(thinking)) && found.length < 3) {
      const name = m[1];
      if (!names.has(name)) continue; // 工具名必须合法，防误捞思考里的示例
      let args = {};
      try { args = JSON.parse(m[2]); } catch { continue; }
      if (typeof args !== "object" || Array.isArray(args)) continue;
      const sig = name + ":" + JSON.stringify(args);
      if (seenCalls.get(sig)) continue; // 每轮每工具一次，防重复捞
      seenCalls.set(sig, 1); // 标记已捞，同 sig 后续跳过（含嵌套格式内外层重复）
      found.push({ id: "scavenged-" + name + "-" + (found.length + 1), name, args });
      if (found.length >= 3) break;
    }
    if (found.length >= 3) break;
  }
  return found;
}
