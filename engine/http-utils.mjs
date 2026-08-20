// engine/http-utils.mjs —— HTTP 通用工具（2026-08-20 从 server.mjs 拆出）
// json()/readBody()：纯 node res/req 操作，无外部依赖，全库 300+ 调用点零改动
export function json(res, code, obj) {
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
