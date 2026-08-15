// ══ 专项工作台模块（从 server.mjs 拆出：新专项功能在此扩展，不再塞 server.mjs）══
// 设计：依赖注入（ctx 由 server.mjs 提供），无反向 import，避免循环依赖
// 新增专项（文章/视频）：照 handleWorkshopPpt 复制，改 skill 名 + 表单字段 + 产物后缀即可
import path from "node:path";
import fs from "node:fs";

// 工作台独立页映射（可直达 URL）
export const WORKSHOP_PAGES = {
  "/workspace": "workspace.html",
  "/workshop": "workshop.html",
  "/workshop/modelbench": "workshop-modelbench.html",
  "/workshop/ppt": "workshop-ppt.html",
  "/workshop/designer": "workshop-designer.html",
  "/workshop/wanxiang": "workshop-wanxiang.html",
  "/workshop/novel": "workshop-novel.html",
  "/workshop/refine": "workshop-refine.html",
  "/workshop/article": "workshop-article.html",
  "/workshop/video": "workshop-video.html",
  "/workshop/omega": "workshop-omega.html",
};

// 按技能名找文件路径（供注入 agent 自行 read SKILL.md）
export async function findSkillPath(ctx, name) {
  try {
    const loader = new ctx.DefaultResourceLoader({ cwd: ctx.CONFIG.cwd, agentDir: ctx.getAgentDir() });
    await loader.reload();
    const { skills } = loader.getSkills();
    const s = (skills || []).find(x => x.name === name);
    if (s?.filePath) return s.filePath;
  } catch {}
  // 回退：pi-web 内置技能（skills/ 目录，不在 pi 引擎加载器扫描范围）
  try {
    const builtin = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "skills", name, "SKILL.md");
    if (fs.existsSync(builtin)) return builtin;
  } catch {}
  return "";
}

// ══ PPT 工作室：创建独立 agent → 注入 ppt-generator 技能指令 → 七角色生成 JSON → 脚本产 .pptx → SSE 流式 ══
export async function handleWorkshopPpt(ctx, res, body) {
  const { CONFIG, SESSIONS_DIR, defaultModel, createSessionAgent, SessionManager, scanRecentArtifacts, sseWrite, json, getAgentDir, DefaultResourceLoader, WS_ROOT } = ctx;
  const theme = String(body?.theme || "").trim();
  if (!theme) return json(res, 400, { error: "缺少主题" });
  const pages = Math.min(Math.max(parseInt(body?.pages, 10) || 10, 3), 25);
  const style = String(body?.style || "专业商务").slice(0, 20);
  const audience = String(body?.audience || "").slice(0, 40);
  const skillPath = await findSkillPath(ctx, "ppt-generator");
  if (!skillPath) return json(res, 500, { error: "未找到 ppt-generator 技能" });
  // findSkillPath 返回 SKILL.md 文件路径（loader 的 filePath 是文件）→ skillDir 才是技能根目录
  const skillDir = path.dirname(skillPath);
  res.writeHead(200, {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache",
    Connection: "keep-alive", "X-Accel-Buffering": "no",
  });
  const write = (event, data) => { try { sseWrite(res, event, data); } catch {} };
  write("note", { text: `📊 开始制作 PPT「${theme}」（${pages} 页 · ${style}）…` });
  const sm = SessionManager.create(CONFIG.cwd, SESSIONS_DIR);
  let agent = null;
  let timer = null;
  try {
    agent = await createSessionAgent(sm, defaultModel);
    write("note", { text: "🧠 已启动七角色协作流程（主题→模板→内容→配图→润色→构建）…" });
    const unsub = agent.subscribe((ev) => {
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
    const workDir = path.join(WS_ROOT, "工程", `PPT-${theme.slice(0, 16)}-${Date.now().toString(36)}`);
    fs.mkdirSync(workDir, { recursive: true });
    const prompt = `你是 ppt-generator 技能的执行者。用户通过「PPT 工作室」提交了表单，请按技能流程**跳过用户确认环节，直接完整执行**：

用户需求：
- 主题：${theme}
- 目标受众：${audience || "（未指定，按通用场景）"}
- 页数：约 ${pages} 页
- 风格：${style}

执行要求：
1. 先 read 技能文件了解完整流程：${skillPath.replace(/\\/g, "/")}
   （以及 references/ppt_structure_guide.md 的 JSON 格式规范，如果它在技能目录下）
2. 按七角色协作生成结构化内容（metadata + slides），产出 JSON 文件
3. 调用技能脚本生成 .pptx：
   python ${path.join(skillDir, "scripts", "generate_pptx.py").replace(/\\/g, "/")} --input <你的JSON路径> --output ${path.join(workDir, "presentation.pptx").replace(/\\/g, "/")}
4. 确认 .pptx 已生成（用 bash 检查文件存在和大小），然后回复一句话总结：主题、页数、文件位置

注意：产物 .pptx 必须生成在 ${workDir.replace(/\\/g, "/")} 目录内。JSON 中间文件可留在同目录。`;
    // 超时兜底（生成可能较慢，给 10 分钟）
    let finished = false;
    const finish = async () => {
      if (finished) return;
      finished = true;
      try { unsub(); } catch {}
      // 扫描产物：工作空间最近 5 分钟的 .pptx
      let file = null;
      try {
        const arts = scanRecentArtifacts(5 * 60 * 1000, 20);
        file = arts.find(a => a.path.toLowerCase().endsWith(".pptx")) || null;
      } catch {}
      // 兜底：直接查本轮工作目录的 presentation.pptx（scan 可能因目录/时间窗漏扫）
      if (!file) {
        try {
          const direct = path.join(workDir, "presentation.pptx");
          if (fs.existsSync(direct)) {
            const st = fs.statSync(direct);
            file = { name: "presentation.pptx", path: path.relative(WS_ROOT, direct).replace(/\\/g, "/"), size: st.size, mime: "", mtimeMs: st.mtimeMs };
          }
        } catch {}
      }
      if (file) {
        write("file", file);
        write("note", { text: `✅ PPT 已生成：${file.name}（${(file.size / 1024).toFixed(0)} KB）` });
      } else {
        write("note", { text: "⚠️ 生成流程结束，但未在工作空间检测到 .pptx 产物，请查看上方过程输出" });
      }
      write("done", { ok: !!file, file });
      try { res.end(); } catch {}
      try { agent?.dispose?.(); } catch {}
    };
    timer = setTimeout(finish, 10 * 60 * 1000);
    await agent.prompt(prompt);
    clearTimeout(timer);
    await finish();
  } catch (e) {
    clearTimeout(timer);
    write("error", { message: String(e?.message || e).slice(0, 200) });
    try { agent?.dispose?.(); } catch {}
    try { res.end(); } catch {}
  }
}

// ══ 小说工作室：创建独立 agent → 注入 novel-forge-v10 技能 → 建项目+真相文件 → 写第一章 → SSE ══
export async function handleWorkshopNovel(ctx, res, body) {
  const { CONFIG, SESSIONS_DIR, defaultModel, createSessionAgent, SessionManager, scanRecentArtifacts, sseWrite, json, getAgentDir, DefaultResourceLoader, WS_ROOT } = ctx;
  const genre = String(body?.genre || "xianxia").trim();
  const title = String(body?.title || "").trim();
  if (!title) return json(res, 400, { error: "缺少书名" });
  const protagonist = String(body?.protagonist || "").trim();
  const setting = String(body?.setting || "").trim();
  const chapters = Math.min(Math.max(parseInt(body?.chapters, 10) || 1, 1), 10);
  const skillPath = await findSkillPath(ctx, "novel-forge-v10");
  if (!skillPath) return json(res, 500, { error: "未找到 novel-forge-v10 技能" });
  const skillDir = path.dirname(skillPath);
  res.writeHead(200, {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache",
    Connection: "keep-alive", "X-Accel-Buffering": "no",
  });
  const write = (event, data) => { try { sseWrite(res, event, data); } catch {} };
  write("note", { text: `📖 开始创作《${title}》（${genre}题材 · 目标${chapters}章）…` });
  const sm = SessionManager.create(CONFIG.cwd, SESSIONS_DIR);
  let agent = null;
  let timer = null;
  try {
    agent = await createSessionAgent(sm, defaultModel);
    write("note", { text: "🧠 已启动 novel-forge v10 流程（产品化→5层构建→真相文件→编辑部写作）…" });
    const unsub = agent.subscribe((ev) => {
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
    const safeTitle = title.replace(/[\/:*?"<>|\s]+/g, "-").slice(0, 20);
    const workDir = path.join(WS_ROOT, "工程", `小说-${safeTitle}-${Date.now().toString(36)}`);
    fs.mkdirSync(workDir, { recursive: true });
    const prompt = `你是 novel-forge-v10 技能的执行者。用户通过「小说工作室」提交了表单，请按 v10 流程**跳过用户确认环节，直接完整执行**：

用户需求：
- 书名：《${title}》
- 题材：${genre}（可选 xianxia/urban/horror/scifi）
- 主角设定：${protagonist || "（未指定，自行设计）"}
- 世界背景：${setting || "（未指定，按题材常规设计）"}
- 本次先写第 1 章

执行要求：
1. 先 read 技能文件了解完整流程：${skillPath.split("\\").join("/")}
2. 在 ${workDir.split("\\").join("/")} 建项目结构：
   - TRUTH/ 真相文件（先建 canon.md 硬事实 + character_matrix.json + pending_hooks.json 等）
   - outline.md（大纲 + 伏笔规划）
   - chapters/ 目录
3. 按 v10 流程写第 1 章：编辑部角色（IDEA→EXEC→审计）→ 写入 chapters/第001章.md
4. 写完后更新真相文件（状态/伏笔/摘要）
5. 回复：书名、题材、主角、章节文件位置、一句话梗概

注意：产物必须在 ${workDir.split("\\").join("/")} 目录内，章节保存为 chapters/第001章.md。`;
    let finished = false;
    const finish = async () => {
      if (finished) return;
      finished = true;
      try { unsub(); } catch {}
      let file = null;
      try {
        const arts = scanRecentArtifacts(5 * 60 * 1000, 30);
        file = arts.find(a => /第001章|chapters.*\.md/i.test(a.path)) || arts.find(a => a.path.includes(safeTitle)) || null;
      } catch {}
      // 兜底：直接查本轮 workDir 的章节文件
      if (!file) {
        try {
          const ch = path.join(workDir, "chapters", "第001章.md");
          if (fs.existsSync(ch)) {
            const st = fs.statSync(ch);
            file = { name: "第001章.md", path: path.relative(WS_ROOT, ch).replace(/\\/g, "/"), size: st.size, mime: "", mtimeMs: st.mtimeMs };
          }
        } catch {}
      }
      if (file) {
        write("file", file);
        write("note", { text: `✅ 第 1 章已生成：${file.path}` });
      } else {
        write("note", { text: "⚠️ 写作流程结束，但未检测到章节文件，请查看上方过程输出" });
      }
      write("done", { ok: !!file, file });
      try { res.end(); } catch {}
      try { agent?.dispose?.(); } catch {}
    };
    timer = setTimeout(finish, 10 * 60 * 1000);
    await agent.prompt(prompt);
    clearTimeout(timer);
    await finish();
  } catch (e) {
    clearTimeout(timer);
    write("error", { message: String(e?.message || e).slice(0, 200) });
    try { agent?.dispose?.(); } catch {}
    try { res.end(); } catch {}
  }
}
