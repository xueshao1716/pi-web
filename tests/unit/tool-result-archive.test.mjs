// 工具结果压缩的回读契约（借 NVlabs/SoL-Pi 的纪律：省下的必须是"重复"，不能是"证据"）
//
// 原问题：shrinkToolResult 砍掉中间段后只说"如需完整内容可重新读取"，
// 却没给路径、没给 id、中间段也没有任何归档——模型无从照做；
// 而报错常出现在中段，丢了就是永久丢失。
//
// 现在要求三件事都能回答：原件在哪、怎么逐字回读、失败信号有没有被省掉。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { shrinkToolResult, TURN_END_RESULT_CAP } from "../../engine/reasonix-tools.mjs";
import {
  initToolResultArchive, archiveToolResult, toolResultId, toolResultArchivePath,
  countTextLines, toolResultArchiveRoot,
} from "../../engine/tool-result-archive.mjs";

function withTempArchive(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yuanshu-tr-archive-"));
  initToolResultArchive({ root });
  try { return fn(root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

/**
 * 造一份超长日志，且把失败行**精确放在会被省略的中段**。
 * 这点必须算准：头尾各保留约 3000 字符、每行约 79 字符，所以头约 38 行、尾约 38 行；
 * 400 行时中段是 ~39..361 行。放进第 200 行左右才真的会被砍掉。
 * （第一版把失败放在 head 之后、filler 之前，结果被推到了保留的尾部，测试前提就不成立。）
 */
function logWithMiddleFailure(totalLines = 400, failureAt = 200) {
  const line = i => `[build] 行 ${String(i).padStart(4, "0")} ${"·".repeat(50)}`;
  const lines = Array.from({ length: totalLines }, (_, i) => line(i));
  lines[failureAt] = "FAILED tests/unit/thing.test.mjs";
  lines[failureAt + 1] = "AssertionError: expected 1 to equal 2";
  lines[failureAt + 2] = "  at thing.test.mjs:42:7";
  return lines.join("\n");
}

test("归档关闭时如实说「未归档」，绝不写做不到的「可重新读取」", () => {
  initToolResultArchive({}); // 关闭
  const r = shrinkToolResult("x".repeat(TURN_END_RESULT_CAP + 5000));
  assert.match(r, /原件未归档/, "必须明说没归档");
  assert.ok(!/可重新读取/.test(r), "不能再说「可重新读取」这种空头承诺");
  assert.match(r, /请重新执行该命令/, "要给一条真能做的替代动作");
});

test("归档后给出可执行指针：路径真实存在，且内容与原文逐字节一致", () => {
  withTempArchive(() => {
    const original = logWithMiddleFailure();
    const r = shrinkToolResult(original);
    const m = r.match(/原件已归档：(.+)/);
    assert.ok(m, `应给出归档路径，实际:\n${r}`);
    const file = m[1].trim();
    assert.ok(path.isAbsolute(file), "必须是绝对路径，模型才能直接用");
    assert.ok(fs.existsSync(file), `归档文件必须真实存在: ${file}`);
    assert.equal(fs.readFileSync(file, "utf8"), original, "归档内容必须与原文逐字节一致");
    assert.match(r, /read 工具读该文件/, "要给出可执行的回读方式");
    assert.match(r, /sed -n/, "给一条现成的命令更保险");
  });
});

test("内容寻址稳定：同一份原文反复压缩只归档一次，且路径不变", () => {
  withTempArchive(root => {
    const original = "y".repeat(TURN_END_RESULT_CAP + 1000);
    const first = shrinkToolResult(original).match(/原件已归档：(.+)/)[1].trim();
    const second = shrinkToolResult(original).match(/原件已归档：(.+)/)[1].trim();
    assert.equal(first, second, "同一内容必须得到同一个地址（否则每次投影都变，指针失效）");
    assert.equal(fs.readdirSync(root).length, 1, "只应有一个归档文件");
  });
});

test("被省略的中段里的失败信号必须摘出来，不能被静默丢掉", () => {
  withTempArchive(() => {
    const r = shrinkToolResult(logWithMiddleFailure());
    assert.match(r, /省略段含疑似失败信号/, "中段有失败信号就必须提示");
    assert.match(r, /FAILED tests\/unit\/thing\.test\.mjs/, "要把失败行原文摘出来");
    assert.match(r, /AssertionError/, "断言失败也要摘出来");
    assert.match(r, /L\d+:/, "要带原文行号，方便回读定位");
    assert.match(r, /不要当成成功/, "要说清这不是成功");
  });
});

test("中段没有失败信号时不误报", () => {
  withTempArchive(() => {
    const clean = Array.from({ length: 500 }, (_, i) => `[build] line ${i} all good`).join("\n");
    const r = shrinkToolResult(clean);
    assert.ok(!/失败信号/.test(r), `不该误报失败:\n${r.slice(0, 300)}`);
  });
});

test("头尾按整行截断，不把一行切成半句", () => {
  withTempArchive(() => {
    const lines = Array.from({ length: 600 }, (_, i) => `line-${String(i).padStart(4, "0")}-${"z".repeat(30)}`);
    const r = shrinkToolResult(lines.join("\n"));
    const head = r.split("…[工具结果过长已压缩")[0];
    // 头部的最后一行必须是完整的一行（切分后 head 尾部带着分隔用的换行，先 trim）
    const lastHeadLine = head.trimEnd().split("\n").filter(Boolean).pop();
    assert.match(lastHeadLine, /^line-\d{4}-z{30}$/, `头部最后一行应是完整行: ${JSON.stringify(lastHeadLine)}`);
  });
});

test("退化情形：整个结果只有一行时仍保留头尾，并说明边界未按整行对齐", () => {
  withTempArchive(() => {
    const oneLine = "A".repeat(TURN_END_RESULT_CAP + 9000);
    const r = shrinkToolResult(oneLine);
    assert.ok(r.startsWith("A".repeat(100)), "头部不能为空");
    assert.ok(r.endsWith("A".repeat(100)), "尾部不能为空");
    assert.match(r, /边界未按整行对齐/, "要如实说明这是退化情形");
  });
});

test("归档被篡改时拒绝复用，宁可报未归档也不让对不上号的副本冒充原件", () => {
  withTempArchive(root => {
    const original = "q".repeat(TURN_END_RESULT_CAP + 500);
    const saved = archiveToolResult(original);
    assert.ok(saved, "首次归档应成功");
    fs.writeFileSync(saved.file, "TAMPERED");
    const again = archiveToolResult(original);
    assert.equal(again, null, "size/hash 对不上必须拒绝，而不是把被改过的文件当原件");
  });
});

test("归档目录与 id 的边界", () => {
  withTempArchive(root => {
    assert.equal(toolResultArchiveRoot(), root);
    const id = toolResultId("hello");
    assert.match(id, /^tr_[a-f0-9]{24}$/);
    assert.equal(toolResultId("hello"), id, "内容寻址必须确定性");
    assert.notEqual(toolResultId("hello!"), id);
    // 越界 id 不得拼出路径
    assert.equal(toolResultArchivePath("../../etc/passwd"), "");
    assert.equal(toolResultArchivePath("tr_zzzz"), "");
    assert.ok(toolResultArchivePath(id).endsWith(`${id}.txt`));
  });
});

test("行数统计与结尾换行的处理", () => {
  assert.equal(countTextLines(""), 0);
  assert.equal(countTextLines("a"), 1);
  assert.equal(countTextLines("a\n"), 1);
  assert.equal(countTextLines("a\nb"), 2);
  assert.equal(countTextLines("a\nb\n"), 2);
});
