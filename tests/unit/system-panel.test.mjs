import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { systemInfo } from "../../engine/system-panel.mjs";

test("系统信息在 Pi 用户目录没有 package.json 时回退到工作区版本", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yuanshu-system-info-"));
  const agentDir = path.join(root, "agent");
  const wsRoot = path.join(root, "workspace");
  fs.mkdirSync(agentDir);
  fs.mkdirSync(wsRoot);
  fs.writeFileSync(path.join(wsRoot, "package.json"), JSON.stringify({ version: "0.2.3" }));
  try {
    assert.equal(systemInfo(wsRoot, agentDir).version, "0.2.3");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("系统信息优先使用运行时目录中的版本", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yuanshu-system-info-"));
  const agentDir = path.join(root, "agent");
  const wsRoot = path.join(root, "workspace");
  fs.mkdirSync(agentDir);
  fs.mkdirSync(wsRoot);
  fs.writeFileSync(path.join(agentDir, "package.json"), JSON.stringify({ version: "9.9.9" }));
  fs.writeFileSync(path.join(wsRoot, "package.json"), JSON.stringify({ version: "0.2.3" }));
  try {
    assert.equal(systemInfo(wsRoot, agentDir).version, "9.9.9");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
