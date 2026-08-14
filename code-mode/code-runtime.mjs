// ===== code-runtime.mjs —— CodeRuntime（dsh CodeRuntime 设计沉淀）=====
// 职责：对宿主提供的一组异步绑定，运行一段模型编写的程序，报告 { value, logs, error? }。
//   绑定 = { name: { description, exec(args) } }，exec 由宿主注入（pi-web 注入 executeUnifiedTool）。
//   程序在 worker_threads 里执行（见 code-worker.mjs），天然隔离宿主模块。
// 错误分类（CodeRunFailure 正交 kind）：parse / runtime / timeout / overflow / terminated
//   与 dsh 一致：所有失败都通过 resolve 的 error 字段报告，只有误用时才 reject。

import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, "code-worker.mjs");

export class CodeRuntime {
  constructor(options = {}) {
    this.id = options.id || "worker-thread";
    this.name = options.name || "Worker 线程后端";
    this.version = "1.0.0";
    this.language = "typescript"; // 与 dsh 一致：Code Mode SDK 呈现的语言
    this.isolation = "worker-thread";
    // 绑定执行器：name → async (args) => { text, isError? }，由宿主注入
    this.executor = options.executor || (async (name, args) => ({ text: `未注册绑定: ${name}`, isError: true }));
    // 可用绑定清单：name → { description, args? }
    this.bindings = options.bindings || {};
    this.defaultTimeout = options.timeoutMs || 60000;
    this.maxLogs = options.maxLogs || 500;
  }

  // run({ program, bindings?, timeoutMs? }) → Promise<{ value, logs, error? }>
  run(request = {}) {
    const program = String(request.program || "");
    if (!program.trim()) return Promise.resolve({ value: undefined, logs: [], error: { kind: "parse", message: "程序为空" } });
    const timeoutMs = request.timeoutMs || this.defaultTimeout;
    // 本次运行可临时覆盖绑定（默认用 this.bindings）
    const bindings = request.bindings || this.bindings;

    return new Promise((resolve) => {
      const worker = new Worker(WORKER_PATH, {
        workerData: { program, bindingNames: Object.keys(bindings), maxLogs: this.maxLogs },
      });
      const timer = setTimeout(() => {
        worker.terminate().catch(() => {});
        resolve({ value: undefined, logs: collectedLogs, error: { kind: "timeout", message: `程序执行超过 ${Math.round(timeoutMs / 1000)}s，已终止` } });
      }, timeoutMs);

      const collectedLogs = [];
      const pendingCalls = new Map();

      worker.on("message", async (msg) => {
        if (!msg) return;
        if (msg.type === "call") {
          const { id, name, args } = msg;
          const binding = bindings[name];
          let result;
          try {
            if (!binding) result = { text: `未知绑定: ${name}`, isError: true };
            else {
              const exec = binding.exec || this.executor.bind(null, name);
              const out = await exec(args);
              result = typeof out === "string" ? { text: out } : (out || { text: "(无输出)" });
            }
          } catch (e) {
            result = { text: `绑定 ${name} 执行异常: ${String(e?.message || e).slice(0, 300)}`, isError: true };
          }
          // 结果回传（统一 text 字符串 + isError 标记，worker 侧包装为 { text, isError }）
          const payload = typeof result === "string" ? result : (result.text ?? JSON.stringify(result));
          worker.postMessage({ type: "call-result", id, ok: !result.isError, value: String(payload).slice(0, 50000), isError: !!result.isError });
        } else if (msg.type === "done") {
          clearTimeout(timer);
          worker.terminate().catch(() => {});
          collectedLogs.push(...(msg.logs || []));
          resolve({ value: msg.value, logs: collectedLogs.slice(0, this.maxLogs), error: msg.error || undefined });
        }
      });

      worker.on("error", (err) => {
        clearTimeout(timer);
        worker.terminate().catch(() => {});
        resolve({ value: undefined, logs: collectedLogs, error: { kind: "runtime", message: "worker 错误: " + String(err?.message || err).slice(0, 300) } });
      });

      worker.on("exit", (code) => {
        clearTimeout(timer);
        // 正常 done 已 resolve；这里是异常退出兜底
        if (code !== 0) {
          resolve({ value: undefined, logs: collectedLogs, error: { kind: "terminated", message: `worker 异常退出 (code ${code})` } });
        }
      });
    });
  }

  // 工具定义形式（注册进 ToolRegistry 的 run_code 工具）
  toolDef() {
    const bindingList = Object.entries(this.bindings)
      .map(([n, b]) => `  ${n}(${b.args || "..."}) — ${b.description || ""}`)
      .join("\n");
    return {
      name: "run_code",
      description:
        "写一段 JavaScript 程序编排多步操作并执行。程序体内可用顶层 await 和 return，可用的工具绑定：\n" +
        (bindingList || "  (无)") +
        "\n程序示例：\nconst r = await $tools.bash('dir'); console.log(r); return r;",
      parameters: {
        type: "object",
        properties: {
          program: { type: "string", description: "要执行的 JavaScript 程序（async 函数体，顶层 await/return 可用）" },
        },
        required: ["program"],
      },
    };
  }
}

export default CodeRuntime;
