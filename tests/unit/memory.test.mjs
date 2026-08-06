// memory.mjs 单元测试
// 运行：node --test tests/unit/memory.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { autoMemorize, loadRecentMemory, appendState } from "../../memory.mjs";

// 临时工作空间（隔离测试，不碰真实记忆）
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "piweb-mem-test-"));
const ws = tmp;

describe("memory.mjs 记忆系统", () => {
  test("autoMemorize 检测到偏好并写入记忆日志", () => {
    const r = autoMemorize(ws, {
      userMsg: "记住，以后做网页统一用深色科技风",
      assistantMsg: "好的，已记住这个设计偏好",
    });
    assert.equal(r.wrote, true, "应写入记忆");
    const log = fs.readFileSync(path.join(ws, "记忆", "记忆日志.md"), "utf8");
    assert.ok(log.includes("偏好"), "日志应包含偏好标记");
  });

  test("autoMemorize 纯闲聊不写入（无重要信号）", () => {
    const r = autoMemorize(ws, { userMsg: "你好", assistantMsg: "你好呀" });
    assert.equal(r.wrote, false, "纯闲聊不应写入记忆");
  });

  test("loadRecentMemory 读取最近条目", () => {
    autoMemorize(ws, { userMsg: "新项目完成交付", assistantMsg: "已交付" });
    const rec = loadRecentMemory(ws, 5);
    assert.ok(rec.length >= 1, "应读取到记忆条目");
    assert.ok(rec[0].startsWith("### "), "条目格式应为 ### 开头");
  });

  test("appendState 追加到固定记忆的当前状态节", () => {
    // 先建一个固定记忆文件
    const fixed = path.join(ws, "记忆.md");
    fs.writeFileSync(fixed, "# 固定记忆\n\n## 红线\n- 不改人格\n");
    const ok = appendState(ws, "测试状态行");
    assert.equal(ok, true);
    const s = fs.readFileSync(fixed, "utf8");
    assert.ok(s.includes("当前状态"), "应创建当前状态节");
    assert.ok(s.includes("测试状态行"), "应包含追加的状态行");
  });

  test("appendState 同内容不重复追加", () => {
    const fixed = path.join(ws, "记忆.md");
    appendState(ws, "唯一标记XYZ");
    appendState(ws, "唯一标记XYZ");
    const s = fs.readFileSync(fixed, "utf8");
    const count = (s.match(/唯一标记XYZ/g) || []).length;
    assert.ok(count <= 1, `同内容不应重复（实际 ${count} 次）`);
  });
});

// 清理
test.after(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});
