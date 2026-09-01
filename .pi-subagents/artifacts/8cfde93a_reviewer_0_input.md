# Task for reviewer

只读审查 D:/pi-web 当前工作区，不修改文件，也不要调用模型请求。审查本次修复目标：1) frontend/src/components/ChatArea.tsx 将聊天无事件看门狗从90秒改为10分钟，且不会误伤普通接口；2) engine/run-manager.mjs 在 executeChat 返回后发 session_updated，server.mjs 接到现有会话总线，供其他前端刷新；3) ChatArea 流式期间过滤 IndexedDB draft，避免实时流与草稿重复渲染 bash。读取 git diff（只关注 engine/run-manager.mjs、server.mjs、frontend/src/components/ChatArea.tsx、tests/unit/frontend-structure.test.mjs、tests/unit/run-manager.test.mjs），检查事件顺序、异常路径、React 渲染逻辑和未提交改动边界。输出 PASS 或 Critical/Important/Minor 具体文件行号。

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