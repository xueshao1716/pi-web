import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  initYuanshuWorkmem,
  safePlanId,
  writePlanFile,
  readPlanPack,
  formatPlanPrompt,
  planFilesExecutor,
  PLAN_FILES_SCHEMA,
} from "../../engine/yuanshu-workmem.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function tmpRoot() {
  return mkdtempSync(join(tmpdir(), "ys-workmem-"));
}

test("safePlanId 拒绝路径穿越", () => {
  assert.equal(safePlanId("../etc/passwd"), "etc_passwd");
  assert.equal(safePlanId("sess-1"), "sess-1");
  assert.ok(!safePlanId("a/b\\c").includes("/") && !safePlanId("a/b\\c").includes("\\"));
});

test("task_plan 覆盖，findings/progress 追加，会话互不覆盖", () => {
  const root = tmpRoot();
  initYuanshuWorkmem(root);
  writePlanFile("s1", "task_plan", "- [ ] 一\n- [ ] 二");
  writePlanFile("s1", "findings", "决定用 flash");
  writePlanFile("s1", "findings", "路径在 工程/");
  writePlanFile("s1", "progress", "read 失败", { failed: true });
  writePlanFile("s2", "task_plan", "别人的计划");
  const a = readPlanPack("s1");
  const b = readPlanPack("s2");
  assert.match(a.plan, /一/);
  assert.ok(!/一/.test(a.plan.split("一")[0] + "x") || a.plan.includes("[ ] 一"));
  writePlanFile("s1", "task_plan", "- [x] 一");
  assert.equal(readPlanPack("s1").plan.includes("二"), false);
  assert.match(readPlanPack("s1").findings, /flash/);
  assert.match(readPlanPack("s1").findings, /工程/);
  assert.match(readPlanPack("s1").progress, /失败|FAIL|失败/);
  assert.match(b.plan, /别人的计划/);
  assert.equal(b.findings, "");
  rmSync(root, { recursive: true, force: true });
});

test("formatPlanPrompt：有文件灌尾段，任务句才催写，闲聊不灌", () => {
  const root = tmpRoot();
  initYuanshuWorkmem(root);
  assert.equal(formatPlanPrompt("empty", { message: "嗯" }), "");
  assert.match(formatPlanPrompt("empty", { message: "做个长视频分镜" }), /plan_files/);
  writePlanFile("s1", "task_plan", "- [ ] 出片");
  const blob = formatPlanPrompt("s1", { message: "嗯" });
  assert.match(blob, /task_plan/);
  assert.match(blob, /出片/);
  rmSync(root, { recursive: true, force: true });
});

test("plan_files 执行器按 file 分流，穿越会话 id 只能写进清洗后的目录", () => {
  const root = tmpRoot();
  initYuanshuWorkmem(root);
  const exec = planFilesExecutor("sess-ok");
  assert.equal(exec({ file: "task_plan", content: "- [ ] A" }).isError, false);
  assert.equal(exec({ file: "findings", content: "发现A" }).isError, false);
  assert.match(readFileSync(join(root, "sess-ok", "task_plan.md"), "utf8"), /A/);
  assert.match(readPlanPack("sess-ok").findings, /发现A/);
  const bad = planFilesExecutor("../etc/passwd")({ file: "task_plan", content: "hack" });
  assert.equal(bad.isError, false);
  assert.match(readFileSync(join(root, "etc_passwd", "task_plan.md"), "utf8"), /hack/);
  rmSync(root, { recursive: true, force: true });
});

test("主工具表和接缝必须挂上 plan_files", () => {
  assert.equal(PLAN_FILES_SCHEMA.function.name, "plan_files");
  const server = readFileSync(join(ROOT, "server.mjs"), "utf8");
  assert.ok(server.includes("PLAN_FILES_SCHEMA") || server.includes("plan_files"), "plan_files 必须进 UNIFIED_TOOLS");
  const chat = readFileSync(join(ROOT, "engine", "unified-chat.mjs"), "utf8");
  assert.ok(chat.includes("yuanshu:prompt:plan"), "开轮接缝必须灌工作记忆");
  assert.ok(chat.includes("sessionId"), "接缝 ctx 要带 sessionId");
});
