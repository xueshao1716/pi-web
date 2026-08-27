// ══ 小说工坊·书架式创作系统（2026-08-27 收编 novel-studio 数据契约，React 统一）══
// 数据：PI_NOVELS_DIR（默认 D:/pi-workspace/novels）每本书一个子目录：
//   meta.json + chapters/第NNN章.md + truth/{canon.md,current_state.json,pending_hooks.json,chapter_summaries.json}
// 写作：pi-web 统一 agent 管道（Auto 路由/模型管理复用）+ novel-forge-v10 技能 + 真相文件注入（长篇一致性）
// 与 handleWorkshopNovel（一次性写第1章即弃）的区别：作品永久沉淀、第N章递进、页内阅读
import path from "node:path";
import fs from "node:fs";
import { findSkillPath } from "./workshop.mjs";

export function novelsDir() {
  return process.env.PI_NOVELS_DIR || "D:\\pi-workspace\\novels";
}

const TRUTH_FILES = ["canon.md", "current_state.json", "pending_hooks.json", "chapter_summaries.json"];
const GENRES = ["xianxia", "urban", "scifi", "history", "mystery"];

// id 只允许 中文/字母/数字/下划线/连字符 —— 防目录穿越
function safeId(id) {
  const s = String(id || "");
  return /^[\w\u4e00-\u9fff-]{1,80}$/.test(s) ? s : "";
}
function safeName(n) {
  return String(n || "").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 40) || "未命名";
}

function readJson(f, fallback) {
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fallback; }
}

// ── 书架列表 ──
export function listBooks(dir = novelsDir()) {
  const out = [];
  try {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const bd = path.join(dir, d.name);
      const meta = readJson(path.join(bd, "meta.json"), {});
      let chapters = 0;
      try {
        chapters = fs.readdirSync(path.join(bd, "chapters")).filter(f => /^第\d+章\.md$/.test(f)).length;
      } catch {}
      out.push({
        id: d.name,
        title: meta.title || d.name,
        genre: meta.genre || "xianxia",
        protagonist: meta.protagonist || "",
        status: meta.status || "draft",
        narrator: meta.narrator || "第三人称",
        chapters,
        createdAt: meta.createdAt || "",
      });
    }
  } catch {}
  out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return out;
}

// ── 创建新书（骨架：meta + 真相文件 + chapters/）──
export function createBook(body, dir = novelsDir()) {
  const title = String(body?.title || "").trim();
  if (!title) return { error: "缺少书名" };
  const genre = GENRES.includes(body?.genre) ? body.genre : "xianxia";
  const protagonist = String(body?.protagonist || "").trim().slice(0, 200);
  const setting = String(body?.setting || "").trim().slice(0, 500);
  const narrator = String(body?.narrator || "第三人称").trim().slice(0, 12);
  const id = safeName(title) + "-" + Date.now().toString(36);
  const bd = path.join(dir, id);
  fs.mkdirSync(path.join(bd, "chapters"), { recursive: true });
  fs.mkdirSync(path.join(bd, "truth"), { recursive: true });
  const meta = { title, genre, protagonist, setting, narrator, status: "draft", createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(bd, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  const truth = {
    "canon.md": `# 硬事实库（不可违背）\n\n## 主角\n- ${protagonist || "（待定）"}\n\n## 世界\n- ${setting || "（待定）"}\n`,
    "current_state.json": JSON.stringify({ locations: {}, characters: {}, status: "第一章待写" }, null, 2),
    "pending_hooks.json": JSON.stringify([], null, 2),
    "chapter_summaries.json": JSON.stringify([], null, 2),
  };
  for (const [name, content] of Object.entries(truth)) {
    fs.writeFileSync(path.join(bd, "truth", name), content, "utf8");
  }
  return { ok: true, id, ...meta };
}

// ── 作品详情（meta + 章节列表 + 真相摘要）──
export function bookDetail(id, dir = novelsDir()) {
  const sid = safeId(id);
  if (!sid) return { error: "非法作品 id" };
  const bd = path.join(dir, sid);
  if (!fs.existsSync(bd)) return { error: "作品不存在" };
  const meta = readJson(path.join(bd, "meta.json"), {});
  const chapters = [];
  try {
    for (const f of fs.readdirSync(path.join(bd, "chapters"))) {
      const m = f.match(/^(第(\d+)章)\.md$/);
      if (!m) continue;
      const st = fs.statSync(path.join(bd, "chapters", f));
      chapters.push({ file: f, no: parseInt(m[2], 10), size: st.size, mtimeMs: st.mtimeMs });
    }
  } catch {}
  chapters.sort((a, b) => a.no - b.no);
  // 真相摘要：canon 原文截断 + 结构化文件解析
  let truthBrief = {};
  try {
    truthBrief.canon = fs.readFileSync(path.join(bd, "truth", "canon.md"), "utf8").slice(0, 600);
    truthBrief.state = readJson(path.join(bd, "truth", "current_state.json"), {});
    truthBrief.hooks = readJson(path.join(bd, "truth", "pending_hooks.json"), []);
    truthBrief.summaries = readJson(path.join(bd, "truth", "chapter_summaries.json"), []);
  } catch {}
  const nextCh = chapters.length ? Math.max(...chapters.map(c => c.no)) + 1 : 1;
  return { id: sid, meta, chapters, truth: truthBrief, nextCh };
}

// ── 读章节正文 ──
export function readChapter(id, file, dir = novelsDir()) {
  const sid = safeId(id);
  const sf = /^第\d+章\.md$/.test(String(file || "")) ? String(file) : "";
  if (!sid || !sf) return { error: "非法参数" };
  const f = path.join(novelsDir(), sid, "chapters", sf);
  if (!f.startsWith(path.join(dir, sid))) return { error: "非法路径" };
  if (!fs.existsSync(f)) return { error: "章节不存在" };
  return { ok: true, file: sf, content: fs.readFileSync(f, "utf8") };
}

// ── SSE 续写下章（agent 管道 + v10 技能 + 真相文件）──
export async function handleBookWrite(ctx, res, body) {
  const { CONFIG, SESSIONS_DIR, defaultModel, createSessionAgent, SessionManager, sseWrite, json } = ctx;
  const sid = safeId(body?.id);
  if (!sid) return json(res, 400, { error: "缺少或非法作品 id" });
  const outline = String(body?.outline || "").trim().slice(0, 800);
  const detail = bookDetail(sid);
  if (detail.error) return json(res, 404, { error: detail.error });
  const { meta } = detail;
  const chNo = detail.nextCh;
  const chName = `第${String(chNo).padStart(3, "0")}章.md`;
  const bd = path.join(novelsDir(), sid);

  const skillPath = await findSkillPath(ctx, "novel-forge-v10");
  if (!skillPath) return json(res, 500, { error: "未找到 novel-forge-v10 技能" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache",
    Connection: "keep-alive", "X-Accel-Buffering": "no",
  });
  const write = (event, data) => { try { sseWrite(res, event, data); } catch {} };

  // 真相文件注入（连续性铁律依据；超长截断防 prompt 爆炸）
  let truthText = "";
  try {
    const parts = [];
    for (const name of TRUTH_FILES) {
      const p = path.join(bd, "truth", name);
      if (fs.existsSync(p)) parts.push(`【${name}】\n` + fs.readFileSync(p, "utf8").slice(0, 2500));
    }
    truthText = parts.join("\n\n");
  } catch {}

  write("note", { text: `📖 开始创作《${meta.title}》第 ${chNo} 章（${meta.genre} · ${meta.narrator}）…` });
  const sm = SessionManager.create(CONFIG.cwd, SESSIONS_DIR);
  let agent = null;
  let timer = null;
  let finished = false;
  let unsub = null;
  const finish = async () => {
    if (finished) return;
    finished = true;
    try { unsub?.(); } catch {}
    clearTimeout(timer);
    // 兜底查产物：真相文件可能还没更新，但章节正文在就算成功
    const chPath = path.join(bd, "chapters", chName);
    if (fs.existsSync(chPath)) {
      const st = fs.statSync(chPath);
      write("file", { name: chName, path: path.relative("D:/pi-workspace", chPath).replace(/\\/g, "/"), size: st.size });
      write("note", { text: `✅ 第 ${chNo} 章完成：novels/${sid}/chapters/${chName}` });
      write("done", { ok: true, chapter: chName, no: chNo });
    } else {
      write("note", { text: "⚠️ 写作流程结束，但未检测到章节文件，请查看过程输出" });
      write("done", { ok: false });
    }
    try { res.end(); } catch {}
    try { agent?.dispose?.(); } catch {}
  };
  try {
    agent = await createSessionAgent(sm, defaultModel);
    unsub = agent.subscribe((ev) => {
      try {
        if (ev.type === "message_update" && ev.assistantMessageEvent?.type === "text_delta") {
          write("delta", { text: ev.assistantMessageEvent.delta });
        } else if (ev.type === "tool_execution_start") {
          write("tool", { name: ev.toolName, args: ev.args, id: ev.toolCallId });
        } else if (ev.type === "tool_execution_end") {
          const text = Array.isArray(ev.result?.content) ? ev.result.content.map(c => c.text || "").join("") : "";
          write("tool_end", { name: ev.toolName, id: ev.toolCallId, isError: !!ev.isError, output: text.slice(0, 500) });
        }
      } catch {}
    });
    const workDirUri = bd.split("\\").join("/");
    const skillUri = skillPath.split("\\").join("/");
    const prompt = `你是 novel-forge-v10 技能的执行者。为书架中的既有作品续写第 ${chNo} 章。项目已初始化（5 层基础与真相文件见下），**不要重做产品化/世界观构建**，直接执行本章循环（快照→生成→免疫→审计→修改）。

## 作品档案
- 书名：《${meta.title}》（${meta.genre}题材）
- 主角：${meta.protagonist || "（见真相文件）"}
- 世界观：${meta.setting || "（见真相文件）"}
- 叙事人称铁律：${meta.narrator || "第三人称"}（全篇严禁偏离）

## 本章大纲/要求
${outline || "（无指定——先读 outline.md 按既定伏笔网络自然推进；若也没有则读技能文件后自行规划本章再写）"}

## 真相文件（连续性铁律，写作时逐条对照）
${truthText || "（空——按档案自建）"}

## 执行步骤
1. 先 read 技能文件掌握完整技法与审计标准：${skillUri}
2. read 项目内 truth/ 全部真相文件与 outline.md（若存在）
3. 写第 ${chNo} 章 → 用 write 工具保存到 ${workDirUri}/chapters/${chName}
   - 开头前 20% 必须即时张力（重大事件/冲突/危机），禁天气描写、日常流程、回顾上章、缓慢铺垫
   - 行动中开场(In Media Res)或对话冲突开场；每句对话有目的、有锋芒、有潜台词
   - 章末必有钩子（揭示/危机/反转/伏笔引爆/两难/新威胁 任一）
   - 去 AI 味：禁「不禁/倘若/弥漫着/宛如/恰似/瞳孔骤缩/倒吸一口凉气/空气凝固」；人称代词节制（每段≤2 个，用名字/身份/动作交替指代）
4. 更新真相文件（用 edit/write）：current_state.json（状态推进）、pending_hooks.json（新增/回收伏笔）、chapter_summaries.json（追加本章 3 句梗概）；canon.md 若产生新硬事实则补充
5. 回复格式：一句话本章梗概 + 新增/回收的伏笔编号

注意：所有文件操作必须在 ${workDirUri} 目录内完成。`;
    timer = setTimeout(finish, 15 * 60 * 1000);
    await agent.prompt(prompt);
    await finish();
  } catch (e) {
    finished = true;
    clearTimeout(timer);
    write("error", { message: String(e?.message || e).slice(0, 300) });
    try { res.end(); } catch {}
    try { agent?.dispose?.(); } catch {}
  }
}
