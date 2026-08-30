// ===== unified-tools.mjs —— 统一工具集（schema + 执行器，从 server.mjs 抽离）=====
// 大脑可移植的关键一步：工具不再长在 HTTP 服务里。
// server.mjs 通过 createUnifiedToolExecutor(deps) 注入上下文（工作目录/路径安全/技能/时间引擎），
// 无头入口（bin/pi-agent.mjs）注入另一套上下文即可复用全部工具逻辑与安全防线。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { httpJsonFetch } from "../http.mjs";
import {
  matchDenyRule, isProtectedPath, DANGEROUS_CMD_RE, PI_CMDS, INTERACTIVE_CMD_RE,
} from "./security.mjs";

// ── 工具 schema（OpenAI function 格式）──
export const BASE_TOOL_SCHEMAS = [
  { type: "function", function: { name: "bash", description: "运行 shell 命令（Windows cmd），如 dir、node、python、git", parameters: { type: "object", properties: { command: { type: "string", description: "要运行的命令" } }, required: ["command"] } } },
  { type: "function", function: { name: "read", description: "读取文件内容（工作空间内相对路径，或磁盘上的绝对路径如 D:/proj/file.json）", parameters: { type: "object", properties: { path: { type: "string", description: "文件路径" } }, required: ["path"] } } },
  { type: "function", function: { name: "write", description: "写入文件（自动创建目录）", parameters: { type: "object", properties: { path: { type: "string", description: "文件路径（相对工作空间）" }, content: { type: "string", description: "文件内容" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "edit", description: "用精确文本替换修改文件（先 read 再 edit）", parameters: { type: "object", properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } }, required: ["path", "oldText", "newText"] } } },
  { type: "function", function: { name: "web_search", description: "联网搜索（Bing，无需 key）。查询资料、最新信息、验证事实时使用。返回前 5 条结果标题+摘要+链接", parameters: { type: "object", properties: { query: { type: "string", description: "搜索关键词（中文/英文均可）" } }, required: ["query"] } } },
];

// ── 纯工具函数 ──
export function stripHtml(s) { return String(s).replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim(); }
export function atobSafe(s) { return Buffer.from(String(s).trim(), "base64").toString("utf8"); }

// Windows 内联代码改写：node -e / python -c 的多行或引号嵌套代码在 cmd 下会被拆坏
// （典型错误：SyntaxError: unterminated string literal / "const ^^^^）
// 改写为写临时文件再执行。返回 {file, code, interp} 或 null（无需改写）
export function rewriteInlineCode(cmd) {
  const nodeM = cmd.match(/^\s*(?:node|nodejs|bun|deno)\s+(-e|--eval|--print)\s+(.+)$/s);
  const pyM = cmd.match(/^\s*(?:python|python3|py)\s+-c\s+(.+)$/s);
  if (!nodeM && !pyM) return null;
  const isNode = !!nodeM;
  const raw = (nodeM ? nodeM[2] : pyM[1]).trim();
  // 提取引号内的代码：支持双引号或单引号包裹
  let code = null;
  const dq = raw.match(/^"([\s\S]*?)"\s*$/);
  const sq = raw.match(/^'([\s\S]*?)'\s*$/);
  if (dq) code = dq[1];
  else if (sq) code = sq[1];
  else code = raw; // 无引号包裹（少见）
  // 是否需要改写：含换行 或 内部引号与包裹引号冲突
  const hasNewline = /\n/.test(code);
  const nestedQuote = dq ? /[\\"']/.test(code) : sq ? /["']/.test(code) : true;
  if (!hasNewline && !nestedQuote) return null; // 简单命令直接用
  const tmp = path.join(os.tmpdir(), `pi-inline-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${isNode ? "js" : "py"}`);
  return { file: tmp, code, interp: isNode ? (process.env.npm_node || process.execPath || "node") : "python" };
}

// ── Web 搜索：Bing 网页搜索（免费无 key）。返回结构化结果列表 ──
export async function webSearchTool(query, httpFetch = httpJsonFetch) {
  try {
    const q = encodeURIComponent(String(query || "").slice(0, 200));
    const r = await httpFetch(`https://www.bing.com/search?q=${q}&count=5`, {
      method: "GET", timeout: 20000,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" },
    });
    if (!r || !r.ok) return `（搜索请求失败: HTTP ${r?.status || "?"}）`;
    const html = await r.text();
    const results = [];
    // Bing 结果块：<li class="b_algo">…<h2><a href="...">标题</a></h2>…<p class="b_lineclamp…">摘要</p>
    const re = /<li class="b_algo"[^>]*>([\s\S]*?)(?=<li class="b_algo"|<\/ol>|$)/g;
    let m;
    while ((m = re.exec(html))) {
      const block = m[1];
      const a = block.match(/<h2[^>]*>.*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const p = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
      if (!a) continue;
      const title = stripHtml(a[2]).slice(0, 120);
      let url = a[1].trim().replace(/&amp;/g, "&");
      // Bing 跳转链接：/ck/a 里的 u=a1…参数是 base64 编码的真实地址（如 aHR0cHM6…），解码还原
      const um = url.match(/[?&]u=a1([^&]+)/);
      if (um) {
        const enc = um[1].replace(/\+/g, " ");
        try {
          // 先试 base64（Bing 的 u 参数格式）
          const b64 = atobSafe(enc);
          if (/^https?:\/\//.test(b64)) url = b64;
          else url = decodeURIComponent(enc);
        } catch { try { url = decodeURIComponent(enc); } catch {} }
      }
      const snippet = p ? stripHtml(p[1]).slice(0, 200) : "";
      if (title) results.push({ title, url, snippet });
    }
    if (!results.length) return "（搜索无结果，可尝试换关键词）";
    return results.slice(0, 5).map((x, i) => `${i + 1}. ${x.title}\n   ${x.url}\n   ${x.snippet}`).join("\n");
  } catch (e) {
    return `（搜索失败: ${String(e?.message || e).slice(0, 100)}）`;
  }
}

// ── 统一工具执行器工厂 ──
// deps:
//   cwd          () => string              bash 工作目录（如 CONFIG.cwd）
//   safePath     (p) => absPath|null       工作空间路径安全检查（wsSafePath）
//   activateSkill(name) => toolResult      activate_skill 技能加载（可选）
//   timeEngine   () => engine|null         time_task 时间引擎（可选）
//   httpFetch    (url, opts)               web_search 用的 HTTP 客户端（可选，默认 engine/http）
//   onLog        (msg) => void             日志回调（可选，默认 console.log）
export function createUnifiedToolExecutor(deps = {}) {
  const getCwd = deps.cwd || (() => process.cwd());
  const safePath = deps.safePath || ((p) => path.resolve(getCwd(), p || ""));
  const activateSkill = deps.activateSkill || (() => ({ text: "技能系统未接入", isError: true }));
  const getTimeEngine = deps.timeEngine || (() => null);
  const httpFetch = deps.httpFetch || httpJsonFetch;
  const onLog = deps.onLog || ((msg) => console.log(msg));

  return async function executeUnifiedTool(name, args) {
    try {
      // 外部注册的自定义工具（2026-08-22）：dsh_task 等 pi 格式工具的统一兜底执行入口
      if (deps.extraExecutors?.[name]) {
        const r = await deps.extraExecutors[name](args);
        return typeof r === "object" && r !== null && "text" in r ? r : { text: String(r ?? "") };
      }
      if (name === "think") {
        // 外部思考草稿：只记录返回给前端展示，不执行、不落盘（调试用）
        const content = String(args?.content || "").trim();
        if (!content) return { text: "（空思考）", isError: true };
        return { text: "✅ 思考已记录（调试草稿，仅本次会话内存可见，不落盘）", think: content };
      }

      if (name === "time_task") {
        try {
          const timeEngine = getTimeEngine();
          if (!timeEngine) return { text: "时间引擎未初始化", isError: true };
          const a = String(args?.action || "");
          if (a === "register") {
            const r = timeEngine.register(args);
            if (r.error) return { text: `注册失败：${r.error}`, isError: true };
            return { text: `✅ 定时任务已注册（id=${r.id}）：${args.type} ${args.at}${args.day ? " 周" + args.day : ""}${args.date ? " " + args.date : ""} → ${String(args.prompt || "").slice(0, 60)}` };
          }
          if (a === "list") {
            const ts = timeEngine.list();
            if (!ts.length) return { text: "暂无定时任务" };
            return { text: "当前定时任务：\n" + ts.map(t => `  [${t.id}] ${t.type} ${t.at}${t.day ? " 周" + t.day : ""}${t.date ? " " + t.date : ""} | 已跑${t.runs}次 | ${String(t.prompt).slice(0, 40)}`).join("\n") };
          }
          if (a === "remove") {
            const r = timeEngine.remove(String(args?.id || ""));
            return r.removed ? { text: `✅ 已删除定时任务 ${args.id}` } : { text: `未找到任务 ${args.id}`, isError: true };
          }
          return { text: "未知 action（register/list/remove）", isError: true };
        } catch (e) { return { text: "time_task 异常: " + String(e?.message || e).slice(0, 100), isError: true }; }
      }
      if (name === "activate_skill") {
        return activateSkill(args?.skill);
      }
      if (name === "bash") {
        const cmd = String(args?.command || "").trim();
        if (!cmd) return { text: "空命令", isError: true };
        // User 层 deny：宪法红线硬拦截（先于内置默认层检查）
        const deny = matchDenyRule(cmd);
        if (deny) {
          return { text: `⛔ 拒绝执行 [宪法规则 ${deny.id}]：该命令命中硬性红线（${deny.re.source.slice(0, 60)}…）。\n这是代码级拦截，不是建议——如需执行请联系伙伴人工操作。`, isError: true };
        }
        // 危险命令拦截（防 prompt injection / 幻觉触发不可逆操作）
        if (DANGEROUS_CMD_RE.test(cmd)) return { text: "⚠️ 拒绝执行：该命令可能造成不可逆数据丢失", isError: true };
        // 交互命令防护：pi / node / python 等命令若被模型幻觉出无效子命令，会进入交互模式挂起直到超时
        const piM = cmd.match(/^\s*pi(?:\s+([a-zA-Z-]+))?/);
        if (piM) {
          const sub = piM[1] || "";
          if (sub && !PI_CMDS.has(sub) && !sub.startsWith("--")) {
            return { text: `⚠️ "pi ${sub}" 不是有效命令（pi 支持: install/remove/update/list/config/auth）。\n正确用法：\n- 查看已安装包: pi list\n- 安装: pi install <source>\n- 卸载: pi remove <source>\n请改用正确的命令，或先运行 "pi --help" 查看完整用法。`, isError: true };
          }
        }
        // 其他常见的无输出交互命令直接拦截（避免挂起）：
        if (INTERACTIVE_CMD_RE.test(cmd)) return { text: `⚠️ 拒绝执行交互式命令（${cmd.slice(0, 40)}），可能挂起等待输入`, isError: true };
        // Windows cmd 引号问题修复：node -e / python -c 内联代码含换行或嵌套引号时，cmd 会拆坏代码（典型错误 "const ^^^^"）
        // 自动改写为「写临时文件再执行」，让模型的内联脚本稳定运行，消除工具重试循环的根源
        const fixed = rewriteInlineCode(cmd);
        if (fixed) {
          onLog(`[tools] 内联代码改写: ${cmd.slice(0, 60)}... -> ${fixed.file}`);
          try { fs.writeFileSync(fixed.file, fixed.code, "utf8"); } catch {}
        }
        const cleanup = fixed ? (() => { try { fs.unlinkSync(fixed.file); } catch {} }) : null;
        // 异步执行，避免阻塞事件循环（同步 execFileSync 会让整个服务器卡住）
        // 非零退出码也返回输出（如 grep 无匹配、git status 非干净状态），让模型自行判断；仅超时/被 kill 视为异常
        // 注意：改写后的内联代码必须绕过 cmd（cmd 会把带引号的绝对路径与 cwd 拼接，导致 MODULE_NOT_FOUND），直接 execFile 解释器
        const run = fixed
          ? new Promise((resolve, reject) => {
              execFile(fixed.interp, [fixed.file], { encoding: "buffer", timeout: 300000, cwd: getCwd(), windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, out, errOut) => {
                if (err && err.killed) reject(err);
                else resolve({ stdout: out, stderr: errOut, exitCode: err?.code ?? 0 });
              });
            })
          : new Promise((resolve, reject) => {
              execFile(process.env.ComSpec || "cmd.exe", ["/c", cmd], { encoding: "buffer", timeout: 300000, cwd: getCwd(), windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, out, errOut) => {
                if (err && err.killed) reject(err);
                else resolve({ stdout: out, stderr: errOut, exitCode: err?.code ?? 0 });
              });
            });
        try {
          const { stdout, stderr, exitCode } = await run;
          cleanup?.();
          let text = stdout.toString("utf8");
          if (/\uFFFD/.test(text)) {
            try { text = new TextDecoder("gbk").decode(stdout); } catch {}
          }
          if (stderr && stderr.length) {
            let es = stderr.toString("utf8");
            if (/\uFFFD/.test(es)) { try { es = new TextDecoder("gbk").decode(stderr); } catch {} }
            text += (text ? "\n" : "") + es;
          }
          const exitMark = exitCode ? `\n[退出码 ${exitCode}]` : "";
          return { text: (text.replace(/\r\n/g, "\n") || "(无输出)") + exitMark, isError: exitCode ? true : false };
        } catch (e) {
          cleanup?.();
          // 命令执行超时/被 kill：明确告知（之前 60s 超时对大任务不够，已提到 300s）
          const msg = String(e?.message || e);
          const reason = e?.killed || /timeout|killed/i.test(msg) ? "执行超过 5 分钟被终止" : "执行失败";
          return { text: `命令${reason}: ${msg.slice(0, 200)}`, isError: true };
        }
      }
      if (name === "read") {
        let p = safePath(args?.path);
        if (!p) {
          // 2026-08-30 read 放宽：工作空间外的磁盘绝对路径允许只读（与 bash 实际能力对齐）。
          // 原先一刀切拒绝且误报「文件不存在」——pi-web 自身源码在 D:/pi-web（工作空间 D:/pi-workspace 外），
          // 模型读不到被迫绕道 bash。相对路径 ../ 越界仍然拒绝（保留目录穿越防护）；写/编辑仍严格限工作空间。
          const raw = String(args?.path || "");
          if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith("\\\\")) {
            try {
              const real = fs.realpathSync(path.resolve(raw)); // 不存在会 throw → 保持拒绝
              if (fs.statSync(real).isFile()) p = real;
            } catch {}
          }
        }
        if (!p || !fs.existsSync(p)) return { text: `文件不存在或不可读: ${args?.path}（read 支持工作空间内相对路径与磁盘绝对路径；写操作仅限工作空间内）`, isError: true };
        if (fs.statSync(p).isDirectory()) return { text: "这是一个目录，请指定文件", isError: true };
        // 二进制/图片文件不能按 utf8 硬读（2026-08-24 修复"read 一直失败"）
        const ext = path.extname(p).toLowerCase();
        const IMG = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".ico"];
        const BIN = [".pdf", ".wasm", ".zip", ".gz", ".mp3", ".mp4", ".wav", ".webm", ".exe", ".dll", ".apk", ".ttf", ".woff2"];
        const kb = Math.round(fs.statSync(p).size / 1024);
        if (IMG.includes(ext)) {
          return { text: `[图片文件] ${path.basename(p)} · ${kb}KB。文本通道无法读取像素内容；如需看图：①让用户直接在界面看；②换支持视觉的模型后以附件方式传入；③用 bash + python PIL 提取尺寸/主色等元信息`, isError: false };
        }
        if (BIN.includes(ext)) {
          return { text: `[二进制文件] ${path.basename(p)} · ${kb}KB（${ext}），不以文本读取。如需内容请用对应工具（如 pdftotext/ffmpeg/unzip）`, isError: false };
        }
        const c = fs.readFileSync(p, "utf8");
        return { text: c.slice(0, 50000), isError: false };
      }
      if (name === "write") {
        const p = safePath(args?.path);
        if (!p) return { text: "路径越权", isError: true };
        if (isProtectedPath(p)) return { text: `⛔ 拒绝写入 [仓库法律]：${args?.path} 是受保护文件（人格/宪法/凭据），只读不写`, isError: true };
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const content = String(args?.content ?? "");
        fs.writeFileSync(p, content, "utf8");
        return { text: `✅ 已写入 ${args?.path}（${content.length} 字符）`, isError: false };
      }
      if (name === "edit") {
        const p = safePath(args?.path);
        if (!p || !fs.existsSync(p)) return { text: `文件不存在: ${args?.path}`, isError: true };
        if (isProtectedPath(p)) return { text: `⛔ 拒绝修改 [仓库法律]：${args?.path} 是受保护文件（人格/宪法/凭据），只读不写`, isError: true };
        const c = fs.readFileSync(p, "utf8");
        const oldT = String(args?.oldText ?? "");
        if (!c.includes(oldT)) return { text: "未找到 oldText 片段（可能已修改）", isError: true };
        fs.writeFileSync(p, c.replace(oldT, String(args?.newText ?? "")), "utf8");
        return { text: `✅ 已修改 ${args?.path}`, isError: false };
      }
      if (name === "web_search") {
        const r = await webSearchTool(args?.query, httpFetch);
        return { text: r, isError: r.startsWith("（搜索") || r.startsWith("(") ? true : false };
      }
      return { text: `未知工具: ${name}`, isError: true };
    } catch (e) {
      return { text: `工具执行失败: ${String(e?.message || e).slice(0, 200)}`, isError: true };
    }
  };
}
