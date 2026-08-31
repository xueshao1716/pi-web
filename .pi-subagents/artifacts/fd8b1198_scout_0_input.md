# Task for scout

只读设计 D:/pi-web 的持久化 Run + durable event log + SSE cursor 恢复改造。基于现有 server.mjs、engine/session-bus.mjs、session-manager/unified-chat、frontend api/ChatArea，明确最小可分阶段落地方案，使任务与浏览器 HTTP 连接解耦、断开不 abort、事件有 runId/seq 可重放、显式 stop 才 abort。必须兼容现有会话 JSONL 和多端。不要修改文件。输出：现状准确 seam、建议模块/API/数据格式、迁移步骤、竞态/清理/重启限制、测试矩阵。

---
**Output:**
Write your findings to exactly this path: D:\pi-web\.pi-subagents\artifacts\outputs\fd8b1198\context.md
This path is authoritative for this run.
Ignore any other output filename or output path mentioned elsewhere, including output destinations in the base agent prompt, system prompt, or task instructions.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```