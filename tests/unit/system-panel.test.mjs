import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { systemInfo } from "../../engine/system-panel.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRODUCT_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8")).version;

// 契约变更（2026-09-14）：版本唯一来源是仓库根 version.json。
// 以前这里扫 package.json，于是系统页显示壳版本 0.2.4、看板显示产品版本 2.7.1，
// 两个数字都叫「版本」——用户看到的就是"版本号一直不动"。现在两边同源。
test("系统信息只报 version.json 的版本，不受运行时目录/工作区 package.json 干扰", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yuanshu-system-info-"));
  const agentDir = path.join(root, "agent");
  const wsRoot = path.join(root, "workspace");
  fs.mkdirSync(agentDir);
  fs.mkdirSync(wsRoot);
  // 就算这两处放了别的版本号，也不能影响展示——否则又会出现同一系统两个「版本」
  fs.writeFileSync(path.join(agentDir, "package.json"), JSON.stringify({ version: "9.9.9" }));
  fs.writeFileSync(path.join(wsRoot, "package.json"), JSON.stringify({ version: "0.2.3" }));
  try {
    const info = systemInfo(wsRoot, agentDir);
    assert.equal(info.version, PRODUCT_VERSION, "必须与 version.json 一致");
    assert.notEqual(info.version, "9.9.9", "不得被运行时目录的 package.json 覆盖");
    assert.notEqual(info.version, "0.2.3", "不得被工作区的 package.json 覆盖");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("version.json 读不到时才回退扫 package.json（老安装可能没这文件）", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yuanshu-system-info-"));
  const agentDir = path.join(root, "agent");
  const wsRoot = path.join(root, "workspace");
  fs.mkdirSync(agentDir);
  fs.mkdirSync(wsRoot);
  fs.writeFileSync(path.join(wsRoot, "package.json"), JSON.stringify({ version: "0.2.3" }));
  try {
    // 用假的 fs 让 version.json 读失败，验证回退链仍然存在
    const real = fs.readFileSync;
    const fakeFs = {
      ...fs,
      readFileSync: (p, ...rest) => {
        if (String(p).endsWith("version.json")) throw new Error("ENOENT");
        return real(p, ...rest);
      },
    };
    assert.equal(systemInfo(wsRoot, agentDir, fakeFs).version, "0.2.3", "回退链要能读到工作区版本");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
