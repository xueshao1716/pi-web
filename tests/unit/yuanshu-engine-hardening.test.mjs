import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("fallback keeps system and tool context without duplicating the current user", async () => {
  const { fallbackHistoryForDirectChat } = await import("../../engine/unified-chat.mjs");
  const history = [
    { role: "system", content: "workspace rules" },
    { role: "user", content: "inspect the task" },
    { role: "assistant", content: null, tool_calls: [{ id: "read-1", type: "function", function: { name: "read", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "read-1", content: "task evidence" },
    { role: "user", content: "continue" },
  ];
  const result = fallbackHistoryForDirectChat(history);
  assert.deepEqual(result, history.slice(0, -1));
  assert.equal(history.length, 5, "fallback must not mutate the live history");
  assert.deepEqual(fallbackHistoryForDirectChat(history.slice(0, -1)), history.slice(0, -1));
});

test("unified chat carries the approval callback into both tool-call paths", () => {
  const src = readFileSync(join(ROOT, "engine", "unified-chat.mjs"), "utf8");
  const loop = src.slice(src.indexOf("export async function unifiedChat"), src.indexOf("// \u2550\u2550 Gateway"));
  assert.equal((loop.match(/sandboxAsk:\s*opts\.sandboxAsk/g) || []).length, 2);
  const handle = src.slice(src.indexOf("export async function handleUnifiedChat"));
  assert.match(handle, /sandboxAsk:\s*approvalAsk/);
});

test("engine init failure is observable and retryable", () => {
  const src = readFileSync(join(ROOT, "engine", "unified-chat.mjs"), "utf8");
  const handle = src.slice(src.indexOf("export async function handleUnifiedChat"));
  assert.match(handle, /engineInitError/);
  assert.match(handle, /engine_init_failed/);
  assert.doesNotMatch(handle, /try\s*\{\s*await initEngine\(\);\s*\}\s*catch\s*\{\s*\}/);
  assert.match(src, /engineInitPromise/);
});

test("output guard fallback receives the current context and abort signal", () => {
  const src = readFileSync(join(ROOT, "engine", "unified-chat.mjs"), "utf8");
  const handle = src.slice(src.indexOf("export async function handleUnifiedChat"));
  assert.match(handle, /directChat\(fbModel, message, fallbackHistoryForDirectChat\(history\), \{ signal \}\)/);
});
