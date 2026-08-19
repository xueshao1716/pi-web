// 输出质量守卫（Output Guard）单元测试
// 覆盖：复读判定/短回复过滤/归一化/空回复/纯思考/文件基准恢复/记录
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fsx from "node:fs";
import p from "node:path";
import { bindOutputGuardDeps, classifyAnomaly, isRepeatReply, normReply, recordReply, lastReplyOf } from "../../engine/output-guard.mjs";

const LONG = "经验已沉淀（含证据字段）。这是测试用的长回复内容，用于验证复读检测的字节级对比逻辑。";

test("normReply: 去空白/尾部标点/截断", () => {
  assert.equal(normReply(" 好的 ，\n这是测试。  "), "好的，这是测试");
  assert.equal(normReply("内容一样。"), normReply("内容一样"));
  assert.equal(normReply("内容一样！"), normReply("内容一样"));
});

test("isRepeatReply: 复读命中（字节级相同）", () => {
  recordReply("s1", LONG);
  assert.equal(isRepeatReply("s1", LONG), true);
});

test("isRepeatReply: 归一化差异仍命中（尾部标点/空白）", () => {
  recordReply("s2", LONG);
  assert.equal(isRepeatReply("s2", LONG + "。 "), true);
});

test("isRepeatReply: 正常不同回复不误判", () => {
  recordReply("s3", LONG);
  assert.equal(isRepeatReply("s3", "这是完全不同的新回复，内容截然不同，讲的是另一件事。"), false);
});

test("isRepeatReply: 短回复(<30字符)不判，防误伤", () => {
  recordReply("s4", "好的");
  // 短回复不记录基准 → lastReplyOf 返回 null → 永远不判复读
  assert.equal(isRepeatReply("s4", "好的"), false);
  assert.equal(isRepeatReply("s4", "嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯"), false);
});

test("isRepeatReply: 无基准时（新会话/重启后无文件）不判", () => {
  assert.equal(isRepeatReply("nobody", LONG), false);
  assert.equal(isRepeatReply("nobody2", LONG, "D:/nonexistent/file.jsonl"), false);
});

test("classifyAnomaly: 正常输出 → none", () => {
  const r = classifyAnomaly({ sessionKey: "c1", text: LONG, think: "思考中…", sessionFile: "D:/nonexistent" });
  assert.equal(r.type, "none");
});

test("classifyAnomaly: 空回复 → empty", () => {
  const r = classifyAnomaly({ sessionKey: "c2", text: "", think: "", sessionFile: "D:/nonexistent" });
  assert.equal(r.type, "empty");
});

test("classifyAnomaly: 正文空但思考有料 → think-only", () => {
  const r = classifyAnomaly({ sessionKey: "c3", text: "", think: "用户问了个复杂问题，我需要逐步分析……（长思考）", sessionFile: "D:/nonexistent" });
  assert.equal(r.type, "think-only");
});

test("classifyAnomaly: 复读 → repeat", () => {
  recordReply("c4", LONG);
  const r = classifyAnomaly({ sessionKey: "c4", text: LONG, think: "", sessionFile: "D:/nonexistent" });
  assert.equal(r.type, "repeat");
});

test("classifyAnomaly: 纯标记文本（交付文件）→ marker（2026-08-19 修复）", () => {
  assert.equal(classifyAnomaly({ sessionKey: "c6", text: "（交付文件）", think: "", sessionFile: "D:/nonexistent" }).type, "marker");
  assert.equal(classifyAnomaly({ sessionKey: "c6", text: "交付文件", think: "", sessionFile: "D:/nonexistent" }).type, "marker");
  assert.equal(classifyAnomaly({ sessionKey: "c6", text: "（已交付）", think: "", sessionFile: "D:/nonexistent" }).type, "marker");
});

test("classifyAnomaly: 正常回复/短回复不误判为 marker", () => {
  assert.equal(classifyAnomaly({ sessionKey: "c7", text: "这是正常的长回复内容，包含实际信息。", think: "", sessionFile: "D:/nonexistent" }).type, "none");
  assert.equal(classifyAnomaly({ sessionKey: "c7", text: "好的", think: "", sessionFile: "D:/nonexistent" }).type, "none");
});

test("recordReply: <30 字符不记录基准", () => {
  recordReply("c5", "收到");
  assert.equal(lastReplyOf("c5", null), null);
});

test("bindOutputGuardDeps: 注入文件读取依赖后能恢复基准", () => {
  // 用真实临时文件模拟会话文件（lastReplyOf 有 fs.existsSync 检查，需真实路径）
  const tmp = p.join(os.tmpdir(), `oguard-${Date.now()}.jsonl`);
  fsx.writeFileSync(tmp, [
    JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "你好" }] } }),
    JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: LONG }] } }),
  ].join("\n"), "utf8");
  bindOutputGuardDeps({
    readEntriesFromFile: (f) => fsx.readFileSync(f, "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean),
    extractText: (content) => (Array.isArray(content) ? content.map(c => c.text || "").join("") : String(content || "")),
  });
  try {
    const base = lastReplyOf("fresh", tmp);
    assert.equal(base, normReply(LONG));
    assert.equal(isRepeatReply("fresh", LONG, tmp), true);
  } finally {
    try { fsx.unlinkSync(tmp); } catch {}
  }
});
