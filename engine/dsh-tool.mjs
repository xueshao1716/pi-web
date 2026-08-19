// ===== dsh-tool.mjs —— dsh（DeepSeek Harness）执行臂工具（从 server.mjs 抽离）=====
// 模式：pi 主引擎（规划/对话/记忆/验收）→ 派单 dsh 执行（代码/沙箱/工作流）→ 结果回 pi 验收交付。
// 通过工厂注入宿主上下文：cwd / piPackage（typebox 解析基准）/ loadSkillIndex / skillsDir。

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

// 结构化回传协议：从 dsh headless 输出中容错提取 JSON 块（结果+步骤+工具+元数据）
// headless 是黑盒（事件不落盘、stderr 空），只能让模型按协议自报过程，解析失败则回退纯文本
export function extractStructuredOut(text) {
  if (!text) return { ok: false, raw: text || "" };
  const isValid = (d) => d && typeof d === "object" && "result" in d; // 协议强制：必须含 result
  // 1) 优先取 ```json 代码块
  const jb = String(text).match(/```json\s*([\s\S]*?)```/);
  if (jb) {
    try { const d = JSON.parse(jb[1]); if (isValid(d)) return { ok: true, data: d, raw: text }; } catch {}
  }
  // 2) 从后往前扫所有 {，取第一个含 result 的完整 JSON 块（避免命中嵌套的 meta 对象）
  const s = String(text);
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] !== "{") continue;
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === "{") depth++;
      else if (s[j] === "}") {
        depth--;
        if (depth === 0) {
          try {
            const d = JSON.parse(s.slice(i, j + 1));
            if (isValid(d)) return { ok: true, data: d, raw: text };
          } catch {}
          break;
        }
      }
    }
  }
  return { ok: false, raw: text };
}

// dsh 引擎入口：Windows 无 dsh.exe（只有 dsh.cmd shim）——直接 spawn node 执行真实 bin.js，
// 避免 shell 注入风险（task 是模型生成的，经 shell 拼接有命令注入面）
function makeResolveDshBin() {
  let cache = null;
  return function resolveDshBin() {
    if (cache) return cache;
    try {
      const cands = [
        path.join(process.env.APPDATA || "", "npm", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
        path.join(process.env.ProgramFiles || "", "nodejs", "node_modules", "npm", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
      ];
      for (const c of cands) {
        if (fs.existsSync(c)) { cache = c; return c; }
      }
    } catch {}
    return "dsh"; // 回退：让系统 PATH 尝试（类 Unix 环境 dsh 在 PATH 中）
  };
}

export function createDshTool({ cwd, piPackage, loadSkillIndex, skillsDir, onLog = (m) => console.log(m) }) {
  let toolDef = null;
  // dsh 并发控制：默认最多 6 个同时跑（用户定），硬上限 15，防后台进程堆积憋死电脑
  // 可通过环境变量 PI_DSH_MAX 调整；总进程数 = dsh 并发 + 系统 node 基础进程
  let active = 0;
  const max = Math.min(parseInt(process.env.PI_DSH_MAX || "6", 10), 15);
  const resolveDshBin = makeResolveDshBin();

  // dsh 技能上下文：渐进式披露技能库，让 dsh 学会按技能执行
  // dsh headless 自带 read 工具，可直接读 skills/<name>/SKILL.md 全文
  function skillContext() {
    try {
      const list = loadSkillIndex();
      if (!list?.length) return "";
      const dir = String(skillsDir).replace(/\\/g, "/");
      return `\n\n【pi-web 技能库（${list.length} 个，渐进式披露）】\n用户任务匹配以下任一技能时，**必须先用 read 工具读取技能文件全文，再严格按技能指令执行**（禁止自行简化/缩写/改写技能步骤）：\n${list.map((s) => `- ${s.name}：${String(s.desc).slice(0, 120)}`).join("\n")}\n技能文件位置：${dir}/<技能名>/SKILL.md（绝对路径，直接 read）`;
    } catch { return ""; }
  }

  async function initDshTool() {
    if (toolDef) return toolDef;
    try {
      const { createRequire } = await import("node:module");
      const req2 = createRequire(piPackage);
      const { Type } = req2("typebox");
      toolDef = {
        name: "dsh_task",
        label: "dsh 引擎执行（代码/沙箱/工作流）",
        description: "把子任务派单给 DeepSeek Harness（dsh）引擎独立执行。dsh 擅长：安全执行模型编写的代码（Code Mode）、沙箱内跑程序、复杂多步数据处理/工作流编排。当你（pi）需要执行一段生成的代码/脚本、在沙箱环境跑程序、或做多步数据处理时，把任务完整描述给它，拿到结果后由你验收并交付。日常文件读写/搜索/简单命令用自带工具，不要滥用。",
        promptSnippet: "需要安全执行代码/沙箱/多步工作流时，用 dsh_task 派单给 dsh 引擎，拿到结果后验收交付",
        promptGuidelines: [
          "Use dsh_task when a subtask needs: executing model-written code safely (Code Mode), sandboxed program runs, or multi-step data processing.",
          "Write a complete, self-contained task description — dsh runs as an independent session without conversation history.",
          "After dsh returns, YOU verify the result (re-read/check outputs) before presenting it to the user.",
          "Do NOT use it for simple file ops or one-line commands. Do NOT chain multiple dsh_task calls in one turn.",
        ],
        parameters: Type.Object({
          task: Type.String({ description: "派单给 dsh 的完整任务描述（自包含：目标/输入/期望输出/约束）" }),
        }),
        async execute(toolCallId, params, signal, onUpdate, ctx) {
          const task = String(params?.task || "").trim();
          if (!task) return { content: [{ type: "text", text: "缺少任务描述" }] };
          // 并发控制：达到上限（默认 6）拒绝新任务，让 pi 稍后重试
          if (active >= max) return { content: [{ type: "text", text: `⚠️ dsh 引擎已达并发上限（${active}/${max}）。请稍后重试，或改用自带工具完成。` }] };
          // 清理残留：先回收异常退出/超时遗留的 dsh headless 进程（防内存堆积）
          try {
            execFile("powershell", ["-NoProfile", "-Command",
              "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'dsh.*headless' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
            ], { timeout: 8000, windowsHide: true }, () => {});
          } catch {}
          active++;
          if (onUpdate) onUpdate({ type: "status", content: [{ type: "text", text: `⏳ 已派单 dsh 引擎执行（冷启动约 5-20s，当前并发 ${active}/${max}）…` }] });
          try {
            // 结构化协议：要求 dsh 末尾输出 JSON（结果+步骤+工具+元数据），pi 容错解析后基于轨迹验收
            const structReq = "\n\n【输出格式要求（必须严格遵守）】\n执行完成后，在回复末尾单独输出一个 JSON 块（直接以 { 开头，不要放在代码块里，JSON 前后不要有其他文字）：\n{\"result\":\"给用户的最终结论(简洁)\",\"steps\":[\"关键步骤1\",\"关键步骤2\"],\"tools\":[\"工具名: 说明\"],\"meta\":{\"duration\":\"估算耗时\",\"files\":[\"涉及的文件路径\"]}}\nJSON 必须合法，步骤和工具如实填写。";
            const out = await new Promise((resolve) => {
              execFile(process.execPath, [resolveDshBin(), "--profile", "headless", task + skillContext() + structReq], {
                cwd, encoding: "utf8", timeout: 180000, windowsHide: true, maxBuffer: 8 * 1024 * 1024,
              }, (err, stdout) => resolve({ ok: !err, out: String(stdout || "").trim(), err: String(err?.message || "").slice(0, 200) }));
            });
            const text = (out.out || "").trim();
            const parsed = extractStructuredOut(text);
            if (parsed.ok && parsed.data) {
              const d = parsed.data;
              const parts = [];
              parts.push(`【dsh 执行结果】${String(d.result || text).slice(0, 1000)}`);
              if (Array.isArray(d.steps) && d.steps.length) parts.push(`【执行步骤】\n${d.steps.map((s, i) => `${i + 1}. ${String(s).slice(0, 200)}`).join("\n").slice(0, 1500)}`);
              if (Array.isArray(d.tools) && d.tools.length) parts.push(`【工具调用】${d.tools.map(String).join("；").slice(0, 800)}`);
              if (d.meta && typeof d.meta === "object") {
                const m = [];
                if (d.meta.duration) m.push(`耗时 ${d.meta.duration}`);
                if (Array.isArray(d.meta.files) && d.meta.files.length) m.push(`文件 ${d.meta.files.join(", ").slice(0, 300)}`);
                if (m.length) parts.push(`【元数据】${m.join("；")}`);
              }
              parts.push(`【原始输出】${(text || "（dsh 无输出）").slice(0, 2000)}`);
              return { content: [{ type: "text", text: out.ok ? parts.join("\n\n") : `【dsh 执行失败】${out.err}\n\n${parts.join("\n\n")}` }] };
            }
            // 未按协议输出：回退纯文本（不编造轨迹）
            const t2 = (text || "（dsh 无输出）").slice(0, 4000);
            return { content: [{ type: "text", text: out.ok ? `【dsh 执行结果】\n${t2}` : `【dsh 执行失败】${out.err}\n${t2}` }] };
          } catch (e) {
            return { content: [{ type: "text", text: `dsh 调用异常: ${String(e?.message || e).slice(0, 200)}` }] };
          } finally {
            active--; // 无论成败都释放并发额度
          }
        },
      };
    } catch (e) {
      onLog(`[dsh] 工具初始化失败: ${String(e?.message || e).slice(0, 100)}`);
    }
    return toolDef;
  }

  return { initDshTool };
}

export default createDshTool;
