// engine/http-utils.mjs —— HTTP 通用工具（2026-08-20 从 server.mjs 拆出）
// json()/readBody()：纯 node res/req 操作，无外部依赖，全库 300+ 调用点零改动

// P1 错误响应脱敏：移除可能泄露密钥/内部路径/上游错误详情的内容
const SENSITIVE_RE = /(?:sk-[a-zA-Z0-9]{8,}|Bearer\s+[^\s]{8,}|api[_-]?key[=:]\s*\S+|token[=:]\s*\S+|password[=:]\s*\S+|-----BEGIN\s+\w+\s+PRIVATE\s+KEY)/gi;
function sanitizeError(msg) {
  if (typeof msg !== "string") return msg;
  return msg.replace(SENSITIVE_RE, "[REDACTED]").slice(0, 500);
}

function sanitizeErrorValue(value) {
  if (typeof value === "string") return sanitizeError(value);
  if (Array.isArray(value)) return value.map(sanitizeErrorValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeErrorValue(child)]));
  }
  return value;
}

export function json(res, code, obj) {
  // error 可能是字符串或嵌套对象；统一脱敏其所有文本字段，避免上游详情夹带凭据。
  if (obj && Object.prototype.hasOwnProperty.call(obj, "error")) {
    obj = { ...obj, error: sanitizeErrorValue(obj.error) };
  }
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

export function readBody(req, maxMB = 2) {
  return new Promise((resolve, reject) => {
    let data = "";
    const max = maxMB * 1024 * 1024;
    req.on("data", (c) => { data += c; if (data.length > max) { reject(new Error(`body too large (limit ${maxMB}MB)`)); req.destroy(); } });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });
}
