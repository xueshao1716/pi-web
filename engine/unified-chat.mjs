// engine/unified-chat.mjs —— 统一对话通道（2026-08-20 从 server.mjs 拆出）
// unifiedChat/handleUnifiedChat：对话 + 工具循环 + 思考 + 媒体 + 压缩 + 重试 + 任务进度
// 依赖注入：initUnifiedChat({ executeUnifiedTool, findKeyByEntry, readJsonFile, getModelList, getDefaultModel, authPath, modelsPath, cwd })
import fs from "node:fs";
import path from "node:path";
import { json, readBody } from "./http-utils.mjs";
import { markModelBlocked, isAuthErrorStatus, pickFallbackDefault, pickFallbackExcluding, routeProCandidate } from "./model-router.mjs";
import { classifyAnomaly, recordReply } from "./output-guard.mjs";
import { shrinkToolResult, NEEDS_PRO_RE, scavengeToolCalls } from "./reasonix-tools.mjs";
import { extractMessages, extractText } from "./session-utils.mjs";
import { createSseWriter } from "./sse.mjs";
import { httpJsonFetch } from "./http.mjs";
import { createGateway } from "./gateway.mjs";
import { CodeRuntime } from "../code-mode/code-runtime.mjs";
import { createCodeMode } from "../code-mode/code-mode.mjs";
import { detectMediaIntents, extractMediaPrompt, generateMediaAsync } from "./media-api.mjs";
import { saveArtifact } from "./workspace-api.mjs";
import { directChat, maybeCompactHistory } from "./model-client.mjs";
import { readEntriesFromFile } from "./session-files.mjs";
import { jitRulesForPath, loadProjectRules, loadMemory, shouldInjectFullMemory, setLastUserQuery } from "./context-loader.mjs";
import { resolveAuth } from "./dsh-keys.mjs";
import { policyDecide } from "./dsh-keys.mjs";

let _executeUnifiedTool = null, _findKeyByEntry = null, _readJsonFile = null, _getModelList = () => [], _getDefaultModel = () => null, _authPath = "", _modelsPath = "", _cwd = "", _piPackage = "", _unifiedTools = [], _getAgentDir = null;
export function initUnifiedChat({ executeUnifiedTool = null, findKeyByEntry = null, readJsonFile = null, getModelList = null, getDefaultModel = null, authPath = "", modelsPath = "", cwd = "", piPackage = "", UNIFIED_TOOLS = [], getAgentDir = null } = {}) {
  _executeUnifiedTool = executeUnifiedTool; _findKeyByEntry = findKeyByEntry; _readJsonFile = readJsonFile;
  if (getModelList) _getModelList = getModelList; if (getDefaultModel) _getDefaultModel = getDefaultModel;
  _authPath = authPath; _modelsPath = modelsPath; _cwd = cwd; _piPackage = piPackage; _unifiedTools = UNIFIED_TOOLS;
  if (getAgentDir) _getAgentDir = getAgentDir;
}

export async function unifiedChat(model, messages, opts = {}) {
  const auth = _readJsonFile(_authPath);
  const key = auth[model.provider]?.key;
  if (!key) return { error: `无 ${model.provider} 的 key` };
  const resolved = resolveAuth(model.provider);
  const store = _readJsonFile(_modelsPath);
  const mdef = (store[model.provider]?.models || []).find(m => m.id === model.id)
    || _getModelList().find(m => m.provider === model.provider && m.id === model.id);
  const baseUrl = resolved?.baseUrl || mdef?.baseUrl || model.baseUrl;
  if (!baseUrl) return { error: "无 baseUrl" };
  const base = (baseUrl || "").replace(/\/+$/, "");
  const baseNoV1 = base.endsWith("/v1") ? base.slice(0, -3) : base;
  const history = [...messages];
  // 2026-08-21 修复：anthropic 协议端点（glm-5.3 等）不支持 pi 的工具格式（直测 422/400）——不传 tools 做纯对话
  // 或模型声明 compat.supportsTools:false 时同样不传
  const noTools = mdef?.api === "anthropic-messages" || mdef?.compat?.supportsTools === false;
  const toolDefs = opts.tools === false || noTools ? undefined : (opts.tools || _unifiedTools);
  // 官方理念：按模型声明的 reasoning/compat/thinkingLevelMap 统一适配（不按厂商特判）
  const isReasoning = mdef?.reasoning === true || model.reasoning === true;
  const compat = mdef?.compat || model.compat || {};
  const thinkingLevelMap = mdef?.thinkingLevelMap || model.thinkingLevelMap || null;
  // 思考模型：映射 pi thinking level → provider 参数（默认 high）；不支持时降级
  let thinkingParam = null;
  if (isReasoning) {
    const mapped = thinkingLevelMap?.["high"];
    if (mapped !== null && mapped !== false && mapped !== undefined) thinkingParam = mapped;
    else if (compat.supportsReasoningEffort !== false) thinkingParam = "high";
  }
  const buildBody = (withThinking) => {
    const body = {
      model: model.id,
      messages: history,
      ...(toolDefs ? { tools: toolDefs, tool_choice: "auto" } : {}),
      stream: false,
      max_tokens: Math.min(mdef?.maxTokens || 8192, 8192),
    };
    // 模型参数（借鉴 Open WebUI 参数面板）：temperature / top_p 可调
    if (opts.params) {
      if (typeof opts.params.temperature === "number" && opts.params.temperature >= 0 && opts.params.temperature <= 2) body.temperature = opts.params.temperature;
      if (typeof opts.params.top_p === "number" && opts.params.top_p > 0 && opts.params.top_p <= 1) body.top_p = opts.params.top_p;
    }
    if (withThinking && thinkingParam !== null) body.reasoning_effort = thinkingParam;
    return body;
  };
  const mkReq = (u, withThinking) => httpJsonFetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(buildBody(withThinking)),
    timeout: 300000, // 思考模型多轮工具调用可能很慢（每轮 30-60s），120s 不够
  });
  let usedThinking = thinkingParam !== null;
  let turn = 0;
  const jitInjected = new Set(); // 本会话 JIT 目录规则已注入集合（每目录一次）
  const seenCalls = new Map();
  while (turn < 20) {
    turn++;
    // 客户端已断开 → 立即停止（打断场景：前端 abort 后不再继续消耗模型调用）
    if (opts.signal?.aborted) return { aborted: true };
    let r;
    // 自动重试：网络错误/5xx 重试最多 2 次
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        r = await mkReq(`${baseNoV1}/v1/chat/completions`, usedThinking);
        if (r.status === 404) r = await mkReq(`${baseNoV1}/chat/completions`, usedThinking);
        if (!r.ok && r.status >= 500 && attempt === 0) { await new Promise(x => setTimeout(x, 1500)); continue; }
        break;
      } catch (e) {
        if (attempt === 0 && !/timeout/i.test(String(e?.message || ""))) { await new Promise(x => setTimeout(x, 1500)); continue; }
        throw e;
      }
    }
    // 模型不接受 reasoning_effort → 去掉思考参数重试（统一降级，非厂商特判）
    if (!r.ok && usedThinking && (r.status === 400 || r.status === 422)) {
      usedThinking = false;
      r = await mkReq(`${baseNoV1}/v1/chat/completions`, false);
      if (r.status === 404) r = await mkReq(`${baseNoV1}/chat/completions`, false);
    }
    if (!r.ok) {
      const errBody = await r.text().catch(() => "");
      // 健康冷却（2026-08-20 泛化）：401/402/403/429/529 标记 30 分钟，Auto 路由与兜底链自动避开该模型
      if (isAuthErrorStatus(r.status)) markModelBlocked(model, { reason: `HTTP ${r.status} ${String(errBody).slice(0, 60)}` });
      else if (model.provider === "opencode-go" && /GoUsageLimit/i.test(errBody)) markModelBlocked(model, { reason: errBody });
      return { error: `HTTP ${r.status}: ${String(errBody).slice(0, 150)}` };
    }
    const data = await r.json();
    const msg = data.choices?.[0]?.message || {};
    const tcs = msg.tool_calls;
    if (tcs && tcs.length && toolDefs) {
      history.push({ role: "assistant", content: msg.content || null, tool_calls: tcs });
      for (const tc of tcs) {
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
        const fnName = tc.function?.name || "";
        // 声明式策略拦截（Gemini Policy Engine 借鉴）：deny 规则（隧道/密钥/危险操作）→ 拦截并注入引导
        const pd = policyDecide(fnName, args);
        if (pd.decision === "deny") {
          if (opts.onTool) opts.onTool(tc.id, fnName, args);
          const guide = `[系统拦截] ${pd.note}`;
          history.push({ role: "tool", tool_call_id: tc.id, content: guide });
          if (opts.onToolEnd) opts.onToolEnd(tc.id, fnName, args, { text: guide, isError: true });
          continue;
        }
        // 重复检测：相同工具+相同参数连续 3 次 → 中断（防死循环）
        // 失败重试（isError）不算死循环——模型在环境问题（网络/权限）下合理重试，但连续 5 次失败也停，避免无限空转
        const sig = fnName + ":" + JSON.stringify(args);
        seenCalls.set(sig, (seenCalls.get(sig) || 0) + 1);
        if (opts.onTool) opts.onTool(tc.id, fnName, args);
        const out = await _executeUnifiedTool(fnName, args);
        // JIT 上下文（Gemini 借鉴）：read/write/edit 带 path 时注入该目录链 GEMINI.md 约定（每目录每会话一次）
        if (fnName === "read" || fnName === "write" || fnName === "edit") {
          try {
            const jits = jitRulesForPath(args.path);
            if (jits.length) {
              const key = jits[0].slice(0, 30);
              if (!jitInjected.has(key)) {
                jitInjected.add(key);
                out.text = `[该目录约定 GEMINI.md]\n${jits.join("\n")}\n\n---\n${out.text}`;
              }
            }
          } catch {}
        }
        const failed = out.isError === true;
        if (!failed && seenCalls.get(sig) >= 3) {
          return { error: "模型工具调用陷入循环，已中断（建议换一种方式提问）" };
        }
        if (failed && seenCalls.get(sig) >= 5) {
          // 失败重试 5 次仍不行：作为工具结果注入，让模型看到失败原因并换策略（而非继续空转）
          out.text = `[系统提示] 工具 ${fnName} 已连续失败 5 次（最近错误：${String(out.text || "").slice(0, 100)}）。请换一种方式完成任务，不要重复相同的失败操作。`;
        }
        if (opts.onToolEnd) opts.onToolEnd(tc.id, fnName, args, out);
        history.push({ role: "tool", tool_call_id: tc.id, content: out.text });
      }
      continue;
    }
    // ══ P2 scavenge（Reasonix 借鉴，2026-08-19）：无 tool_calls 但思考里捞到合法工具调用 → 执行（带策略拦截）
    const scavenged = tcs?.length ? [] : scavengeToolCalls(msg.reasoning_content || "", toolDefs, seenCalls);
    if (scavenged.length) {
      history.push({ role: "assistant", content: msg.content || null, tool_calls: scavenged.map(s => ({ id: s.id, type: "function", function: { name: s.name, arguments: JSON.stringify(s.args) } })) });
      for (const s of scavenged) {
        seenCalls.set(s.name + ":" + JSON.stringify(s.args), 1);
        const pd = policyDecide(s.name, s.args);
        if (pd.decision === "deny") {
          const guide = `[系统拦截] ${pd.note}`;
          if (opts.onTool) opts.onTool(s.id, s.name, s.args);
          history.push({ role: "tool", tool_call_id: s.id, content: guide });
          if (opts.onToolEnd) opts.onToolEnd(s.id, s.name, s.args, { text: guide, isError: true });
          continue;
        }
        if (opts.onTool) opts.onTool(s.id, s.name, s.args);
        const out = await _executeUnifiedTool(s.name, s.args);
        if (opts.onToolEnd) opts.onToolEnd(s.id, s.name, s.args, out);
        history.push({ role: "tool", tool_call_id: s.id, content: out.text });
      }
      continue;
    }
    const content = String(msg.content || "").trim();
    let think = String(msg.reasoning_content || "").trim();
    let text = content;
    if (/<think>[\s\S]*?<\/think>/.test(content)) {
      const m = content.match(/<think>([\s\S]*?)<\/think>/);
      if (!think) think = String(m?.[1] || "").trim();
      text = content.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
    }
    return { think, text: text || null, history };
  }
  // 超过轮数上限：尽量返回中间结果（不直接丢错误）
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "assistant" && m.content && !m.tool_calls) {
      return { text: String(m.content), partial: true };
    }
  }
  return { error: "工具调用超过 20 轮，已停止（任务过于复杂或陷入循环）" };
}

// ══ Gateway 2.0：插件化引擎（dsh 设计沉淀——模型/工具/存储/循环全是可替换插件）══
let gateway = null;
let codeRuntime = null;
let codeMode = null;
const ENGINE_TOOL_NAMES = ["bash", "read", "write", "edit", "web_search"];
export function engineCurrentModel() {
  return { id: _getDefaultModel()?.id || _getModelList()[0]?.id || "", provider: _getDefaultModel()?.provider || _getModelList()[0]?.provider || "", baseUrl: _getDefaultModel()?.baseUrl || _getModelList()[0]?.baseUrl };
}
export async function initEngine() {
  if (gateway) return gateway;
  // CodeRuntime 绑定：直接映射到现有工具执行链（含宪法 deny 红线）
  codeRuntime = new CodeRuntime({
    bindings: Object.fromEntries(ENGINE_TOOL_NAMES.map((n) => [n, { description: toolBindingDesc(n), args: toolBindingArgs(n), exec: async (args) => _executeUnifiedTool(n, toolBindingArgsObj(n, args)) }])),
  });
  codeMode = createCodeMode({ runtime: codeRuntime });
  // Gateway：注入宿主能力（httpFetch / auth / 工具执行链 / 模型）
  gateway = await createGateway({
    httpFetch: httpJsonFetch,
    authReader: () => _readJsonFile(_authPath),
    modelReader: () => _readJsonFile(_modelsPath),
    resolveAuth: (provider) => resolveAuth(provider),
    defaultExecutor: (name, args) => _executeUnifiedTool(name, args),
    getModel: engineCurrentModel,
    sessionDir: path.join((_getAgentDir ? _getAgentDir() : ""), "engine-sessions"),
  });
  // 注册 run_code 工具（Code Mode 作为引擎的一个普通工具，体现插件化）
  gateway.tools.register(codeMode.runCodeToolDef());
  console.log(`[engine] Gateway 2.0 就绪：适配器=${gateway.adapter.id} 工具=${gateway.tools.names().join(",")} 存储=${gateway.store.id} 循环=${gateway.loop.id}`);
  return gateway;
}
export function toolBindingDesc(name) {
  return { bash: "运行 shell 命令（Windows cmd），如 dir、node、python、git", read: "读取工作空间内文件内容", write: "写入文件（自动创建目录）", edit: "用精确文本替换修改文件（先 read 再 edit）", web_search: "联网搜索（Bing，无需 key）" }[name] || name;
}
export function toolBindingArgs(name) {
  return { bash: "command", read: "path", write: "path, content", edit: "path, oldText, newText", web_search: "query" }[name] || "...";
}
export function toolBindingArgsObj(name, args) {
  return { bash: { command: args?.[0] }, read: { path: args?.[0] }, write: { path: args?.[0], content: args?.[1] }, edit: { path: args?.[0], oldText: args?.[1], newText: args?.[2] }, web_search: { query: args?.[0] } }[name] || {};
}

// ══ 消息看板：pi 更新 + 能力看板 ══
const APP_VERSION = "2.5.0"; // pi-web 正式版本（每次发版 bump + 记入 CHANGELOG.md + 资源戳 v= 与 sw.js CACHE 同步）
const CAPABILITIES = [
  { icon: "💬", name: "多模型对话", desc: "deepseek / 小米 mimo / Agnes，思考 + 工具调用" },
  { icon: "🛠", name: "编程工具", desc: "读文件 / 写文件 / 编辑 / 跑命令（与 TUI 同一引擎）" },
  { icon: "🧠", name: "思考块", desc: "reasoning 思考过程内联显示" },
  { icon: "🖼", name: "媒体生成", desc: "配图 / 配音 / 视频，自动落盘到工作空间" },
  { icon: "📦", name: "工作空间", desc: "分类视图（工程/文档/生成物/交付）+ 全屏浏览 + 树状连接线" },
  { icon: "📤", name: "一键交付", desc: "智能文件交付：关键词匹配 + 类型过滤 + 去重，钉钉式文件组" },
  { icon: "📎", name: "文件传输", desc: "断点续传 / 签名下载 / 图片缩略图 / 拖放文件" },
  { icon: "🧠", name: "记忆系统", desc: "固定记忆 + 记忆日志自动沉淀 + 经验库（跨会话长期有效）" },
  { icon: "❤️", name: "情绪引擎", desc: "VAD 三维情绪感知，对话自适应语气与节奏" },
  { icon: "🧬", name: "进化系统", desc: "经验自动归纳加载，越用越懂你的习惯" },
  { icon: "📡", name: "外网分享", desc: "share_project 一键分享，稳定域名 + 自动复制目录" },
  { icon: "🔍", name: "文件搜索", desc: "search_files 按关键词/类型精准定位" },
  { icon: "🌳", name: "会话分支", desc: "分支切换、模板、项目分组、导出" },
  { icon: "🎨", name: "主题系统", desc: "霓虹主题 + 全屏壁纸 + 侧边栏透明" },
  { icon: "👤", name: "人格小语", desc: "直接、有条理、有审美、讨厌机器人味" },
];
// 更新看板缓存：GitHub API 无 token 限流 60 次/时，缓存 6h 缓解 403（限流期不再反复拉取）
const NOTICES_TTL = 6 * 3600 * 1000;
let noticesCache = null;
let noticesCacheAt = 0;
export async function handleNotices(res) {
  let releases;
  const now = Date.now();
  if (noticesCache && now - noticesCacheAt < NOTICES_TTL) {
    releases = noticesCache;
  } else {
    releases = [];
    try {
      const py = `import urllib.request, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
try:
    req = urllib.request.Request("https://api.github.com/repos/earendil-works/pi/releases?per_page=8", headers={"User-Agent":"pi-web","Accept":"application/vnd.github+json"})
    data = json.loads(urllib.request.urlopen(req, timeout=20).read())
    for r in data:
        print(json.dumps({"tag": r.get("tag_name",""), "name": r.get("name",""), "date": (r.get("published_at") or "")[:10], "body": (r.get("body") or "")[:300]}, ensure_ascii=False))
except Exception as e:
    print("ERR:" + str(e))`;
      const out = await new Promise((resolve, reject) => execFile("python", ["-c", py], { timeout: 30000, windowsHide: true, encoding: "utf8" }, (err, stdout) => err ? reject(err) : resolve(stdout)));
      for (const line of out.trim().split("\n").filter(Boolean)) {
        if (line.startsWith("ERR:")) { console.log("[pi-web] GitHub 拉取失败:", line.slice(4).slice(0, 60)); continue; }
        try { releases.push(JSON.parse(line)); } catch {}
      }
    } catch {}
    // 失败也缓存（空列表），限流期不反复打 GitHub
    noticesCache = releases;
    noticesCacheAt = now;
    console.log(`[pi-web] 更新看板缓存刷新（${releases.length} 条 release，缓存 ${NOTICES_TTL/3600000}h）`);
  }
  let piVersion = "?";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(_piPackage), "..", "package.json"), "utf8"));
    piVersion = pkg.version || "?";
  } catch {}
  // pi-web 自身更新日志（CHANGELOG.md 最近 5 个版本，每个最多 6 行）
  let changelog = [];
  try {
    const cl = fs.readFileSync(path.join(__dirname, "CHANGELOG.md"), "utf8");
    const blocks = [...cl.matchAll(/##\s+\[?v?([\d.]+)\]?[^\n]*\n([\s\S]*?)(?=\n##\s|\s*$)/g)];
    changelog = blocks.slice(0, 5).map(b => ({ version: b[1], lines: b[2].trim().split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#")).slice(0, 6) }));
  } catch {}
  json(res, 200, { releases, piVersion, capabilities: CAPABILITIES, appVersion: APP_VERSION, changelog });
}

// SSE 心跳：每 20s 发注释行保持连接活跃（对抗公网隧道/代理的 idle 超时）

// 统一通道：所有模型走 unifiedChat（对话 + 工具 + 思考 + 媒体 + 压缩 + 重试）
export async function handleUnifiedChat(res, entry, message, sessionId, params, signal, writer, thinkOn, taskKey) {
  const taskId = taskKey || sessionId;
  // 修复 B：兕底通道用安全模型（opencode-go 429 标记期间避开，不撞额度墙）
  const chatModel = pickFallbackDefault();
  writer = writer || createSseWriter(res);
  touchTask(taskId, { stage: "处理中" });
  let hist = [];
  try {
    const file = entry.sm.sessionFile;
    if (file && fs.existsSync(file)) hist = extractMessages(readEntriesFromFile(file)).slice(-20);
  } catch {}
  const mediaIntents = detectMediaIntents(message);
  const mediaPromise = mediaIntents.length
    ? Promise.all(mediaIntents.map(it => generateMediaAsync(it, extractMediaPrompt(message))))
    : Promise.resolve([]);
  const onToolStart = (id, name, args) => { touchTask(taskId, { stage: "执行工具", toolName: name }); writer.push("tool", { name, args, id }); };
  const onToolEnd = (id, name, args, out) => {
    touchTask(taskId, { stage: "工具完成", toolName: name });
    const text = out?.text || "";
    writer.push("tool_end", { name, id, isError: out?.isError === true, output: text.slice(0, 2000) });
  };
  let history = [...hist.map(h => ({ role: h.role, content: h.role === "tool" ? shrinkToolResult(h.text) : h.text })), { role: "user", content: message }];
  // 外部思考调试：注入引导语 + think 工具（默认关，本次请求开启时生效）
  if (thinkOn) {
    history = [{ role: "system", content: THINK_PROMPT }, ...history];
  }
  // 注入项目规则（.pi-rules.md，借鉴 Windsurf rules），确保不挤占历史上下文
  const rules = loadProjectRules();
  if (rules.length) history = [{ role: "system", content: rules.join("\n") }, ...history];
  // dsh time-context 借鉴：每轮注入当前时间（agent 时间感知，涉及时效/定时判断不靠猜）
  try {
    const t = new Date();
    const d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
    history.unshift({ role: "system", content: `【时间上下文】当前时间：${d}（周${["日","一","二","三","四","五","六"][t.getDay()]}）。涉及时间/日期/定时/时效判断以此为准。` });
  } catch {}
  // 条件注入全量记忆/经验/日志（任务型消息才带）：人格保底用常驻索引，干活时全量
  if (shouldInjectFullMemory(message)) {
    setLastUserQuery(message); // 供记忆关键词召回检索
    const fullMem = loadMemory();
    if (fullMem.length) history = [...fullMem.map(c => ({ role: "system", content: c })), ...history];
  }
  history = await maybeCompactHistory(history, chatModel);
  // Plan 模式（unifiedChat 兕底路径）：工具定义层过滤为只读（read/web_search）——模型只能请求只读工具，无写路径
  // 注意：thinkOn=false 时 toolDefs 为 undefined（unifiedChat 内部才默认 UNIFIED_TOOLS），必须显式构建只读集，否则拦截被短路
  const isPlanLock = !!entry.planPending;
  const toolDefs = thinkOn ? [..._unifiedTools, THINK_TOOL] : undefined;
  if (isPlanLock) {
    const base = toolDefs || _unifiedTools;
    const locked = base.filter(t => t.function?.name === "read" || t.function?.name === "web_search");
    writer.push("note", { text: "🔒 规划模式（工具级只读）· 批准后恢复写/执行" });
    console.log(`[plan] unifiedChat 工具级只读生效 → ${locked.map(t => t.function.name).join(", ")}`);
    return await runLockedChat(locked);
  }
  async function runLockedChat(locked) {
    // history 末条已是 handleChat 改写后的规划指令消息（含需求），直接复用；只传只读工具定义
    const result = await unifiedChat(chatModel, history, { onTool: onToolStart, onToolEnd, params, signal, tools: locked });
    if (!result || result.error) {
      clearTask(taskId, "error"); writer.push("error", { message: result?.error || "模型未返回内容" }); return;
    }
    if (result.aborted || signal?.aborted) { clearTask(taskId, "aborted"); return; }
    const text = result.text;
    if (!text) { writer.push("error", { message: "模型未返回内容" }); return; }
    try { entry.sm.appendMessage({ role: "user", content: [{ type: "text", text: message }] }); entry.sm.appendMessage({ role: "assistant", content: [{ type: "text", text }] }); } catch {}
    if (entry.agent) { try { entry.agent.dispose(); } catch {} entry.agent = null; }
    if (result.think) { writer.push("think", { text: result.think }); writer.push("think_end", {}); }
    writer.push("delta", { text });
    writer.push("done", { sessionId });
    clearTask(taskId, "done");
  }
  const result = await unifiedChat(chatModel, history, { onTool: onToolStart, onToolEnd, params, signal, tools: toolDefs });
  if (!result || result.error) {
    clearTask(taskId, "error");
    writer.push("error", { message: result?.error || "模型未返回内容，请稍后重试" });
    return;
  }
  // 客户端已断开 → 不写会话、不发 SSE（避免半截结果污染会话文件）
  if (result.aborted || signal?.aborted) { clearTask(taskId, "aborted"); return; }
  if (result.aborted || signal?.aborted) return;
  let text = result.text;
  if (!text) { writer.push("error", { message: "模型未返回内容，请稍后重试" }); return; }
  // ══ NEEDS_PRO 自报升级（Reasonix P3，2026-08-19）：模型认为任务超纲 → 用 pro 模型重试一次（纯自报、无静默升级）
  const proMatch = NEEDS_PRO_RE.exec(text || "");
  if (proMatch) {
    const proModel = routeProCandidate();
    if (proModel && (proModel.provider !== chatModel.provider || proModel.id !== chatModel.id)) {
      writer.push("note", { text: `🚀 模型自报任务超纲，升级 ${proModel.provider}/${proModel.id} 重试${proMatch[1] ? `（原因：${proMatch[1].trim()}）` : ""}…` });
      const proResult = await unifiedChat(proModel, history, { onTool: onToolStart, onToolEnd, params, signal, tools: toolDefs });
      if (proResult?.text && !proResult.error) {
        const proTxt = String(proResult.text).trim();
        if (!NEEDS_PRO_RE.test(proTxt)) {
          text = proTxt;
          result.think = proResult.think || result.think;
          console.log(`[pi-web] NEEDS_PRO 升级成功: ${proModel.provider}/${proModel.id}`);
        }
      }
    }
  }
  // 输出质量守卫（2026-08-19 机制化）：兑底通道统一检测 空回复/纯思考/复读 → 自动切 fallback 重试
  const rkU = sessionId || _findKeyByEntry(entry) || "new";
  const anomaly = classifyAnomaly({ sessionKey: rkU, text, think: result.think || "", sessionFile: entry.sm?.sessionFile });
  if (anomaly.type !== "none") {
    console.log(`[pi-web] 输出守卫(${anomaly.type}): ${chatModel.provider}/${chatModel.id} ${anomaly.reason} → 自动切换重试`);
    const fbModel = pickFallbackExcluding(chatModel);
    if (fbModel) {
      writer.push("note", { text: `⚠️ ${anomaly.reason}，自动切换 ${fbModel.provider}/${fbModel.id} 重试…` });
      const fb = await directChat(fbModel, message);
      if (fb?.text) {
        text = fb.text;
        recordReply(rkU, text);
      } else {
        writer.push("note", { text: "⚠️ 输出守卫触发，但备用模型也无回复（请手动切换模型或重试）" });
      }
    } else {
      writer.push("note", { text: `⚠️ ${anomaly.reason}，且无可用备用通道（全链冷却），请稍后重试或手动切换模型` });
    }
  } else {
    recordReply(rkU, text);
  }
  try {
    entry.sm.appendMessage({ role: "user", content: [{ type: "text", text: message }] });
    entry.sm.appendMessage({ role: "assistant", content: [{ type: "text", text }] });
  } catch {}
  if (entry.agent) { try { entry.agent.dispose(); } catch {} entry.agent = null; }
  if (!entry.sm.getSessionName()) { try { entry.sm.appendSessionInfo(message.slice(0, 24)); } catch {} }
  if (result.think) { writer.push("think", { text: result.think }); writer.push("think_end", {}); }
  writer.push("delta", { text });
  const mediaResults = await mediaPromise;
  for (const mr of mediaResults) {
    if (!mr) continue;
    if (mr.url) mr.url = await saveArtifact(mr);
    writer.push("media", mr);
  }
  writer.push("done", { sessionId });
  clearTask(taskId, "done");
  console.log(`[pi-web] 统一通道: ${chatModel.provider}/${chatModel.id}`);
}

// ============================================================
// Agent 活动事件环（借鉴 dsh 轨迹设计：小语在干嘛，前端实时可见）
// 内存环：保留最近 200 条，不持久化（历史仍在 session 文件）
// ============================================================
const agentEventRing = [];
const AGENT_EVENT_MAX = 200;

// ── 任务进度快照：前端息屏/断线/刷新后，可查"任务是否还在跑、跑到哪一步" ──
// 内存 Map（sessionId → 快照）；任务结束保留 60s 供前端查"刚结束"，之后自动清除
const taskProgress = new Map();
export function touchTask(sessionId, patch = {}) {
  if (!sessionId) return;
  const t = taskProgress.get(sessionId) || { sessionId, status: "running", stage: "处理中", startedAt: Date.now() };
  Object.assign(t, patch, { updatedAt: Date.now() });
  taskProgress.set(sessionId, t);
}
export function clearTask(sessionId, status = "done") {
  if (!sessionId) return;
  const t = taskProgress.get(sessionId);
  if (!t) return;
  t.status = status;
  t.updatedAt = Date.now();
  setTimeout(() => { taskProgress.delete(sessionId); }, 60000); // 60s 后清除，前端可查"刚结束"
}

export function handleAgentEventIn(req, res, body) {
  if (!body || !body.type) return json(res, 400, { error: "bad event" });
  const ev = {
    agent: body.agent || "小语",
    type: String(body.type).replace(/^pi\//, ""),
    data: body.data || {},
    ts: body.ts || new Date().toISOString(),
  };
  agentEventRing.push(ev);
  if (agentEventRing.length > AGENT_EVENT_MAX) agentEventRing.shift();
  return json(res, 200, { ok: true });
}

export function handleAgentEventOut(res) {
  return json(res, 200, { events: agentEventRing.slice(-80) });
}
