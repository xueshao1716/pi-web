# Task for reviewer

你是资深产品设计总监。只读审计 D:/pi-web 当前 React 前端整体 UI，重点看 frontend/src/AppLayout.tsx、styles.css、components、pages，并尽可能用本地 http://127.0.0.1:8787 做真实浏览器视觉检查（可读取 D:/pi-web/.token，仅用于本机鉴权，禁止在输出中泄露）。不要运行 Impeccable detector，不要修改任何文件。独立判断：1) 视觉语言是否像同一产品；2) 哪些页面最难看/最影响观感；3) 信息层级、排版、密度、色彩、组件一致性、空状态、移动端；4) 给出按收益排序的页面整治优先级；5) 2-3个可保留的优点。输出具体到页面/组件/类名或文件。

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