// turn-memory.mjs 测试：对话收尾的记忆结算（引擎无关）
//
// 背景：这段逻辑原先只写在 server.mjs 的 Pi 分支 try 里，而 Pi 分支位于 handleChat
// 的 return 之后 → yuanshu(unified) 与 dsh 静默不写记忆。而引擎目录声明的恰恰相反。
// 这里锁住三件事：① 只认本轮新追加的助手回复；② 中止轮次不得复用上一轮文本；
// ③ 各类信号该落的记忆文件真的要落。
// 运行：node --test tests/unit/turn-memory.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readAppendedAssistantText, settleTurnMemory } from "../../engine/turn-memory.mjs";
import { memoryPaths, listSnapshots } from "../../engine/memory.mjs";
import { promisePaths, loadPromises } from "../../engine/promises.mjs";

const cleanups = [];
function mk() { const d = fs.mkdtempSync(path.join(os.tmpdir(), "yuanshu-tm-")); cleanups.push(d); return d; }
function mkSession() {
  const d = mk();
  const file = path.join(d, "s.jsonl");
  fs.writeFileSync(file, "");
  return file;
}
const line = (role, text) => JSON.stringify({ type: "message", message: { role, content: [{ type: "text", text }] } }) + "\n";
const entryOf = (file) => ({ sm: { sessionFile: file } });
const append = (file, role, text) => fs.appendFileSync(file, line(role, text));
const sizeOf = (file) => fs.statSync(file).size;
const readOr = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
const settle = (ws, file, message, bytesBefore) =>
  settleTurnMemory({ wsRoot: ws, entry: entryOf(file), message, bytesBefore, log: () => {} });

describe("只读本轮追加的那段字节", () => {
  test("没有新字节时返回空", () => {
    const f = mkSession();
    append(f, "assistant", "上一轮的回复");
    assert.equal(readAppendedAssistantText(f, sizeOf(f)), "");
  });

  test("只有用户消息时不返回上一轮的助手文本（中止轮次的关键防线）", () => {
    const f = mkSession();
    append(f, "assistant", "上一轮的回复");
    const mark = sizeOf(f);
    append(f, "user", "新问题");
    assert.equal(readAppendedAssistantText(f, mark), "", "偏移之前的内容一律不算");
    append(f, "assistant", "新回复");
    assert.equal(readAppendedAssistantText(f, mark), "新回复");
  });

  test("忽略 user / toolResult，坏行跳过，多条助手回复取最后一条", () => {
    const f = mkSession();
    fs.appendFileSync(f, line("user", "问") + "{不是 json\n");
    fs.appendFileSync(f, JSON.stringify({ type: "message", message: { role: "toolResult", content: [{ type: "text", text: "工具输出" }] } }) + "\n");
    append(f, "assistant", "先答一版");
    append(f, "assistant", "最终回复");
    assert.equal(readAppendedAssistantText(f, 0), "最终回复");
  });

  test("文件不存在返回空而不抛", () => {
    assert.equal(readAppendedAssistantText(path.join(mk(), "nope.jsonl"), 0), "");
  });
});

describe("结算：不该写的时候绝不写", () => {
  test("本轮没有助手回复 → 不结算，且不动记忆日志", async () => {
    const ws = mk(); const f = mkSession();
    append(f, "assistant", "上一轮的回复");
    const mark = sizeOf(f);
    append(f, "user", "这轮中止了");
    const r = await settle(ws, f, "这轮中止了", mark);
    assert.equal(r.settled, false);
    assert.match(String(r.reason), /无助手回复/);
    assert.equal(readOr(memoryPaths(ws).log), "", "中止轮次不得把上一轮回复记进记忆");
  });

  test("没有会话文件 → 不结算", async () => {
    const r = await settleTurnMemory({ wsRoot: mk(), entry: {}, message: "x", log: () => {} });
    assert.equal(r.settled, false);
    assert.match(String(r.reason), /无会话文件/);
  });

  test("纯闲聊不写流水账（结算执行了，但信号不命中）", async () => {
    const ws = mk(); const f = mkSession();
    const mark = sizeOf(f);
    append(f, "assistant", "嗯嗯，今天天气不错");
    const r = await settle(ws, f, "你好", mark);
    assert.equal(r.settled, true);
    assert.equal(readOr(memoryPaths(ws).log), "", "闲聊不该进流水账");
  });
});

describe("结算：该落的记忆真的落", () => {
  test("用户偏好信号 → 记忆日志", async () => {
    const ws = mk(); const f = mkSession();
    const mark = sizeOf(f);
    append(f, "assistant", "好的，按这个来");
    await settle(ws, f, "记住，以后都用这个方案", mark);
    assert.match(readOr(memoryPaths(ws).log), /偏好/);
  });

  test("助手许下的延迟承诺 → 承诺账（pending，不自动结清）", async () => {
    const ws = mk(); const f = mkSession();
    const mark = sizeOf(f);
    append(f, "assistant", "好的，我明天给你补个测试。");
    const r = await settle(ws, f, "帮我看下", mark);
    assert.equal(r.added, 1);
    const list = loadPromises(ws);
    assert.equal(list.length, 1);
    assert.equal(list[0].status, "pending", "入库只能是 pending，结清必须显式");
    assert.match(list[0].text, /补个测试/);
    assert.ok(fs.existsSync(promisePaths(ws).file));
  });

  test("纠正句式 → 纠正记忆", async () => {
    const ws = mk(); const f = mkSession();
    const mark = sizeOf(f);
    append(f, "assistant", "明白了");
    await settle(ws, f, "不要再写大文件了", mark);
    const text = readOr(path.join(ws, "记忆", "纠正记忆.md"));
    assert.match(text, /不要再写大文件/);
  });

  test("纠正口头语不记账（别客气/别担心不是纠正）", async () => {
    const ws = mk(); const f = mkSession();
    const mark = sizeOf(f);
    append(f, "assistant", "好");
    await settle(ws, f, "别再客气了", mark);
    assert.equal(readOr(path.join(ws, "记忆", "纠正记忆.md")), "");
  });

  test("用户偏好习惯 → 关系记忆", async () => {
    const ws = mk(); const f = mkSession();
    const mark = sizeOf(f);
    append(f, "assistant", "记下了");
    await settle(ws, f, "我习惯用深色主题", mark);
    assert.match(readOr(path.join(ws, "记忆", "关系记忆.md")), /深色主题/);
  });

  test("每 20 轮快照计数：第 20 轮落一份并把计数归零", async () => {
    const ws = mk(); const f = mkSession();
    const tick = path.join(ws, "记忆", "快照", ".tick");
    fs.mkdirSync(path.dirname(tick), { recursive: true });
    fs.writeFileSync(tick, "19");
    const mark = sizeOf(f);
    append(f, "assistant", "好的");
    await settle(ws, f, "记住，以后都这样", mark);
    assert.equal(fs.readFileSync(tick, "utf8"), "0", "第 20 轮后计数应归零");
    assert.equal(listSnapshots(ws).length, 1, "第 20 轮应落一份快照");
  });

  test("计数未满 20 轮时不落快照，只递增", async () => {
    const ws = mk(); const f = mkSession();
    const tick = path.join(ws, "记忆", "快照", ".tick");
    fs.mkdirSync(path.dirname(tick), { recursive: true });
    fs.writeFileSync(tick, "3");
    const mark = sizeOf(f);
    append(f, "assistant", "好的");
    await settle(ws, f, "记住，以后都这样", mark);
    assert.equal(fs.readFileSync(tick, "utf8"), "4");
    assert.equal(listSnapshots(ws).length, 0);
  });
});

test.after(() => {
  for (const d of cleanups) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
});
