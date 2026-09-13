import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initImproveApi, openImprovements, getImprovementDiagnostics, setImprovementStatus } from "../../engine/improve-api.mjs";

function fixture(rows) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yuanshu-improve-"));
  const file = path.join(root, "工程", "经验库", "improvements.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");
  initImproveApi({ root });
  return root;
}

test("普通改进提案只显示 status=open，进化与 nudge 提案不混入", () => {
  fixture([
    { id: "imp-1", kind: "weakness", status: "open", priority: 8, title: "稳定性" },
    { id: "evo-1", kind: "evolution", state: "open", title: "进化" },
    { id: "nudge-1", kind: "skill-nudge", state: "open", title: "技能沉淀" },
  ]);
  assert.deepEqual(openImprovements().map(item => item.id), ["imp-1"]);
});

test("提案诊断明确告知各类待处理数量", () => {
  fixture([
    { id: "imp-1", kind: "efficiency", status: "open", priority: 7, title: "省钱" },
    { id: "evo-1", kind: "evolution", state: "open", title: "进化" },
    { id: "mem-1", kind: "memory-nudge", state: "open", title: "记忆" },
    { id: "imp-2", kind: "weakness", status: "dismissed", title: "旧" },
  ]);
  assert.deepEqual(getImprovementDiagnostics(), {
    total: 4,
    open: 3,
    openImprovements: 1,
    openEvolution: 1,
    openSkillNudge: 0,
    openMemoryNudge: 1,
  });
});

test("改进提案状态接口不会误改进化提案", () => {
  fixture([{ id: "evo-1", kind: "evolution", state: "open", title: "进化" }]);
  assert.deepEqual(setImprovementStatus("evo-1", "dismissed"), { error: "不是普通改进提案" });
});
