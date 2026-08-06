// ══ 专项工作台模块（从 server.mjs 拆出：新专项功能在此扩展，不再塞 server.mjs）══
// 设计：依赖注入（ctx 由 server.mjs 提供），无反向 import，避免循环依赖
// 新增专项（文章/视频）：照 handleWorkshopPpt 复制，改 skill 名 + 表单字段 + 产物后缀即可
import path from "node:path";
import fs from "node:fs";

// 工作台独立页映射（可直达 URL）
export const WORKSHOP_PAGES = {
  "/workshop": "workshop.html",
  "/workshop/ppt": "workshop-ppt.html",
  "/workshop/designer": "workshop-designer.html",
  "/workshop/article": "workshop-article.html",
  "/workshop/video": "workshop-video.html",
};

// 按技能名找文件路径（供注入 agent 自行 read SKILL.md）
export async function findSkillPath(ctx, name) {
  try {
    const loader = new ctx.DefaultResourceLoader({ cwd: ctx.CONFIG.cwd, agentDir: ctx.getAgentDir() });
    await loader.reload();
    const { skills } = loader.getSkills();
    const s = (skills || []).find(x => x.name === name);
    return s?.filePath || "";
  } catch { return ""; }
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
1. 先 read 技能文件了解完整流程：${path.join(skillPath, "SKILL.md").replace(/\\/g, "/")}
   （以及 references/ppt_structure_guide.md 的 JSON 格式规范，如果它在技能目录下）
2. 按七角色协作生成结构化内容（metadata + slides），产出 JSON 文件
3. 调用技能脚本生成 .pptx：
   python ${path.join(skillPath, "scripts", "generate_pptx.py").replace(/\\/g, "/")} --input <你的JSON路径> --output ${path.join(workDir, "presentation.pptx").replace(/\\/g, "/")}
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
