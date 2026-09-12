// OpenHands AgentDelegate 精简版：主循环可派 flash 子代理，只回收结论。
import { spawnSubagent } from "./subagent.mjs";

export const DELEGATE_TASK_TOOL = {
  type: "function",
  function: {
    name: "delegate_task",
    description: "把独立调研/对比/摘要派给廉价 flash 子代理。只回收 JSON 结论，不带回过程。不要用它写文件、跑命令或出视频。",
    parameters: {
      type: "object",
      properties: {
        task: { type: "string", description: "子任务：要做什么、输出什么结论" },
        context: { type: "array", items: { type: "string" }, description: "最小必要上下文，不要贴整段历史" },
        role: { type: "string", enum: ["analyst", "planner", "reviewer"], description: "有限职责标签，仅用于记录与路由" },
      },
      required: ["task"],
    },
  },
};

export async function execDelegateTask(args = {}, ctx = {}) {
  const task = String(args?.task || "").trim();
  if (!task) return { text: "delegate_task 需要 task", isError: true };
  const context = Array.isArray(args.context) ? args.context.map(String).slice(0, 8) : [];
  const r = await spawnSubagent({
    task,
    context,
    role: args.role || ctx.role || "analyst",
    // 关联身份和取消信号只能来自宿主执行上下文，不能由模型参数伪造。
    sessionId: ctx.sessionId || "",
    runId: ctx.runId || "",
    signal: ctx.signal,
    onEvent: ctx.onEvent,
    aibodyContext: ctx.aibodyContext,
    model: args.model || ctx.model,
    timeoutMs: args.timeoutMs || ctx.timeoutMs,
  });
  if (!r?.done) return { text: `子任务失败：${r?.error || "未知错误"}`, isError: true, subagentRunId: r?.subagentRunId, cancelled: r?.cancelled };
  const evidence = (r.evidence || []).slice(0, 6).join("；");
  return {
    text: `【子代理结论】${r.result}\n证据：${evidence || "无"}\n把握：${r.confidence}`,
    isError: false,
    subagentRunId: r.subagentRunId,
  };
}
