# Task for reviewer

你负责独立的机械/UI证据审计，不得读取或参考 Assessment A。目标 D:/pi-web/frontend/src。只读，不修改项目文件。必须：1) 运行 `node C:/Users/xuexiaofeng/.pi/agent/skills/impeccable/scripts/detect.mjs --json frontend/src`，记录总数、规则、文件位置、可能误报；2) 尝试真实浏览器检查本地 http://127.0.0.1:8787，覆盖至少桌面 1440x900 与手机 390x844，尽量查看 chat、models、themes、system、apps 页面。可读取 D:/pi-web/.token 仅在本地浏览器登录，禁止输出 token。优先用已有 Playwright/Chrome；若浏览器不可用，明确说明证据缺口；3) 报告布局溢出、层级、可读性、触控、状态、控制台错误；4) 不做设计方向判断，只交证据。不要运行任何写操作或 git 修改。

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