// ===== code-mode.mjs —— Code Mode SDK（dsh PTC/Code Mode 设计沉淀）=====
// 职责：
//   1. buildSdkText()：把工具绑定清单生成"面向模型的 SDK 描述"（TS 函数签名风格）
//   2. runCodeTool()：run_code 工具定义（注册进 ToolRegistry，模型即可自动使用）
//   3. codeChat()：便捷入口 —— 引擎循环里挂 run_code 工具，模型写程序→执行→反馈
//
// 核心思想（来自 dsh）：工具不再是"一步一步的 tool call"，而是暴露成程序里的异步绑定
//   （$tools.bash()），模型写一段程序用顶层 await/return 组合多步操作，一次运行完成。

export function createCodeMode(options = {}) {
  const runtime = options.runtime;
  if (!runtime) throw new Error("createCodeMode 需要 runtime");

  // ── 1. SDK 描述（给模型看：绑定签名 + 用法约定）──
  function buildSdkText() {
    const lines = [
      "可用绑定（程序里通过 $tools.<name>(...) 调用，全部返回 Promise，可顶层 await）：",
    ];
    for (const [name, b] of Object.entries(runtime.bindings)) {
      const sig = b.args ? `$tools.${name}(${b.args})` : `$tools.${name}()`;
      lines.push(`- ${sig} — ${b.description || ""}`);
    }
    lines.push("");
    lines.push("程序规则：");
    lines.push("1. 程序是 async 函数体：支持顶层 await、const/let、return 最终结果");
    lines.push("2. 每个绑定调用都返回 { text, isError? }（isError=true 表示失败，text 为错误信息）");
    lines.push("3. 用 console.log() 输出过程日志；return 的值作为最终结果返回");
    lines.push("4. 一次程序 = 一轮完整任务编排，避免拆成多次往返");
    return lines.join("\n");
  }

  // ── 2. run_code 工具定义（注册进 ToolRegistry）──
  function runCodeToolDef() {
    return {
      name: "run_code",
      description:
        "写一段 JavaScript 程序编排多步操作并执行，适合需要按顺序组合多个工具、或对结果做中间处理的场景。\n" +
        buildSdkText(),
      parameters: {
        type: "object",
        properties: {
          program: { type: "string", description: "JavaScript 程序（async 函数体）" },
        },
        required: ["program"],
      },
      async handler(args) {
        const r = await runtime.run({ program: String(args?.program || "") });
        if (r.error) return { text: `run_code 失败 [${r.error.kind}]: ${r.error.message}`, isError: true };
        let out = "";
        if (r.logs?.length) out += "── 程序日志 ──\n" + r.logs.join("\n") + "\n";
        if (r.value !== undefined) out += "── 返回值 ──\n" + (typeof r.value === "string" ? r.value : JSON.stringify(r.value, null, 2));
        return { text: out || "(程序无输出)" };
      },
    };
  }

  return { buildSdkText, runCodeToolDef, runtime };
}

export default createCodeMode;
