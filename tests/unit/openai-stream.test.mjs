// 统一通道必须按 token 往前端推，不能等整段 JSON 做完再一次性蹦出来。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import {
  createChatStreamAccumulator,
  consumeOpenAIStreamLine,
  readOpenAIChatStream,
} from "../../engine/openai-stream.mjs";
import { httpRawFetch } from "../../engine/http.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sse(delta) {
  return `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`;
}

function streamFrom(parts) {
  return new ReadableStream({
    start(c) {
      const enc = new TextEncoder();
      for (const p of parts) c.enqueue(typeof p === "string" ? enc.encode(p) : p);
      c.close();
    },
  });
}

test("SSE 正文按块累加，不是等 [DONE] 才有字", () => {
  const acc = createChatStreamAccumulator();
  const a = consumeOpenAIStreamLine(sse({ content: "先" }).trim(), acc);
  const b = consumeOpenAIStreamLine(sse({ content: "画" }).trim(), acc);
  assert.equal(a.text, "先");
  assert.equal(b.text, "画");
  assert.equal(acc.message().content, "先画");
  const done = consumeOpenAIStreamLine("data: [DONE]", acc);
  assert.equal(done.done, true);
});

test("思考 token 走 reasoning_content，工具参数碎片能拼回去", () => {
  const acc = createChatStreamAccumulator();
  consumeOpenAIStreamLine(sse({ reasoning_content: "我先想" }).trim(), acc);
  consumeOpenAIStreamLine(sse({
    tool_calls: [{ index: 0, id: "c1", type: "function", function: { name: "bash", arguments: "" } }],
  }).trim(), acc);
  consumeOpenAIStreamLine(sse({
    tool_calls: [{ index: 0, function: { arguments: '{"command":"ls"}' } }],
  }).trim(), acc);
  const msg = acc.message();
  assert.equal(msg.reasoning_content, "我先想");
  assert.equal(msg.tool_calls[0].function.name, "bash");
  assert.equal(msg.tool_calls[0].function.arguments, '{"command":"ls"}');
});

test("跨 chunk 的半行 JSON 等拼齐才解析", async () => {
  const texts = [];
  const body = streamFrom([
    'data: {"choices":[{"delta":{"content":"边',
    '做"}}]}\n\ndata: [DONE]\n\n',
  ]);
  const r = await readOpenAIChatStream(body, { onDelta: (t) => texts.push(t) });
  assert.deepEqual(texts, ["边做"]);
  assert.equal(r.message.content, "边做");
});

test("上游误开 stream 仍回整段 JSON 时，也能抽出正文", async () => {
  const texts = [];
  const body = streamFrom([JSON.stringify({
    choices: [{ message: { content: "整段回来", reasoning_content: "想过了" } }],
  })]);
  const r = await readOpenAIChatStream(body, { onDelta: (t) => texts.push(t) });
  assert.deepEqual(texts, ["整段回来"]);
  assert.equal(r.message.reasoning_content, "想过了");
});

test("httpRawFetch 在服务端写完之前就能读到第一段（证明没有先缓冲整包）", async () => {
  const { srv, base } = await new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(sse({ content: "第一口" }));
      setTimeout(() => { res.write("data: [DONE]\n\n"); res.end(); }, 400);
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
  try {
    const t0 = Date.now();
    const r = await httpRawFetch(`${base}/s`, { timeout: 5000 });
    assert.equal(r.ok, true);
    let firstAt = 0;
    const out = await readOpenAIChatStream(r.body, {
      onDelta: () => { if (!firstAt) firstAt = Date.now(); },
    });
    assert.equal(out.message.content, "第一口");
    assert.ok(firstAt > 0 && firstAt - t0 < 250, `第一口必须在服务端收尾前到达，实际 ${firstAt - t0}ms`);
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test("unifiedChat 必须开 stream:true，边到边推 onDelta，完成不得再整段 push 一遍", () => {
  const src = readFileSync(join(ROOT, "engine", "unified-chat.mjs"), "utf8");
  const start = src.indexOf("export async function unifiedChat");
  const end = src.indexOf("\nexport async function handleUnifiedChat");
  const fn = src.slice(start, end > start ? end : undefined);
  assert.ok(/stream:\s*true|stream:\s*wantStream/.test(fn), "请求体必须默认开 SSE stream");
  assert.ok(!/stream:\s*false/.test(fn), "禁止再写死非流式");
  assert.ok(fn.includes("readOpenAIChatStream") || fn.includes("onDelta"), "读流时要把 token 立刻 onDelta");

  const hStart = src.indexOf("export async function handleUnifiedChat");
  const h = src.slice(hStart);
  assert.ok(h.includes("onThinkEnd") || /think_end/.test(h), "思考结束单独发 think_end");
  const thinkLine = h.split("\n").find(l => l.includes("onThink:") && l.includes("writer.push"));
  if (thinkLine) {
    assert.ok(!thinkLine.includes("think_end"), "每个思考 token 不得立刻 think_end，否则思考块会闪一下就收起");
  }
  assert.ok(/if\s*\(\s*!result\.streamed\s*\)/.test(h) || /if\s*\(\s*!result\?\.streamed/.test(h), "已经流过的正文不得在 done 前再整段 push");
});
