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
  "/workshop/image": "workshop-image.html",
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
  // 回退：多目录搜索（pi 引擎扫描范围外的地方装技能）——技能仓库可能新增，候选逐个探测
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1"));
  const os = await import("node:os");
  const fallbackDirs = [
    path.join(here, "skills"),                            // pi-web 内置 engine/skills/
    path.join(os.homedir(), ".agents", "skills"),          // 用户级 .agents/skills/（ppt-generator 等在这）
    process.env.PI_SKILL_EXTRA_DIR || "",                  // 外部扩展点
    "D:\\novel-forge-v10\\novel-forge-v10",               // novel-forge v10 仓库（独立 clone）
  ].filter(Boolean);
  for (const dir of fallbackDirs) {
    try {
      const p = path.join(dir, name, "SKILL.md");
      if (fs.existsSync(p)) return p;
      // 技能目录可能就是 SKILL.md 直接放根（如 novel-forge-v10）
      if (path.basename(dir) === name && fs.existsSync(path.join(dir, "SKILL.md"))) return path.join(dir, "SKILL.md");
    } catch {}
  }
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
    const id = Date.now().toString(36);
    // ⚠️ Windows 下中文路径会被 bash/python 子进程编码打乱(GBK/UTF-8) → 脚本写不出产物。
    // 工作目录改用纯 ascii(不掺中文'工程'/主题名)，产物留在 workshop-out(能被资产库扫到，不被 _ 前缀排除)。
    const workDir = path.join(WS_ROOT, "workshop-out", `ppt-${id}`);
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
      // 产物留在 ascii 工作区 workshop-out（能被 scanRecentArtifacts 扫到），不回迁避免中文编码风险
      if (file) {
        // 不再回迁到中文'工程'目录（易踩 GBK/UTF-8 编码），产物 path 就是 workshop-out 相对路径
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
