import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  compactViewFromSummary,
  compactKeepArchive,
  appendArchiveJsonl,
  projectMessagesForModel,
} from "../../engine/yuanshu-compact.mjs";

test("compactViewFromSummary：模型面是摘要+近尾，archive 仍是原文", () => {
  const history = [
    { role: "user", content: "旧1" },
    { role: "assistant", content: "旧2" },
    { role: "user", content: "新1" },
    { role: "assistant", content: "新2" },
  ];
  const { view, archive, hiddenCount } = compactViewFromSummary(history, "早前在谈路径", { keep: 2 });
  assert.equal(archive, history);
  assert.equal(hiddenCount, 2);
  assert.equal(view[0].role, "system");
  assert.match(view[0].content, /早前对话摘要/);
  assert.match(view[0].content, /早前在谈路径/);
  assert.equal(view[1].content, "新1");
  assert.equal(view[2].content, "新2");
  assert.equal(history[0].content, "旧1");
});

test("compactKeepArchive：压缩函数替换数组时原文还在 archive", async () => {
  const history = [
    { role: "user", content: "aaaaaaaaaa" },
    { role: "assistant", content: "bbbbbbbbbb" },
    { role: "user", content: "keep-me" },
  ];
  const r = await compactKeepArchive(history, async (h) => [
    { role: "system", content: "【早前对话摘要】\n摘要" },
    h[h.length - 1],
  ]);
  assert.equal(r.compacted, true);
  assert.equal(r.archive.length, 3);
  assert.equal(r.archive[0].content, "aaaaaaaaaa");
  assert.equal(r.view[0].content, "【早前对话摘要】\n摘要");
  assert.equal(r.view.at(-1).content, "keep-me");
  const same = await compactKeepArchive(history, async (h) => h);
  assert.equal(same.compacted, false);
  assert.equal(same.view, history);
});

test("appendArchiveJsonl 追加丢掉的消息，不改主文件", () => {
  const dir = mkdtempSync(join(tmpdir(), "ys-compact-"));
  const live = join(dir, "sess.jsonl");
  const arch = join(dir, "sess.archive.jsonl");
  writeFileSync(live, "{\"type\":\"message\",\"id\":\"keep\"}\n");
  appendArchiveJsonl(arch, [{ type: "message", id: "old1" }, { type: "message", id: "old2" }]);
  appendArchiveJsonl(arch, [{ type: "message", id: "old3" }]);
  const dumped = readFileSync(arch, "utf8");
  assert.match(dumped, /old1/);
  assert.match(dumped, /old3/);
  assert.equal(readFileSync(live, "utf8").includes("old1"), false);
  rmSync(dir, { recursive: true, force: true });
});

test("projectMessagesForModel：有 compaction 时模型看不到 hidden 原文", () => {
  const entries = [
    { type: "message", id: "a", message: { role: "user", content: "旧" }, surfaceHidden: true },
    { type: "compaction", id: "c1", summary: "谈过路径", firstKeptEntryId: "b" },
    { type: "message", id: "b", message: { role: "user", content: "新" } },
  ];
  const view = projectMessagesForModel(entries);
  assert.ok(view.some((m) => /早前对话摘要/.test(m.content) && /谈过路径/.test(m.content)));
  assert.ok(view.some((m) => m.content === "新"));
  assert.ok(!view.some((m) => m.content === "旧"));
});
