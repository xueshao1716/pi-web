// PPT 整份生成 SSE：客户端断开必须 abort agent（refine 已修，生成两条还漏）
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workshop = fs.readFileSync(path.join(ROOT, "engine", "workshop.mjs"), "utf8");
const server = fs.readFileSync(path.join(ROOT, "server.mjs"), "utf8");

test("workshop PPT 生成与设计稿生成都接 attachSseAbort，finish 会 abort agent", () => {
  assert.ok(workshop.includes("import { attachSseAbort }"), "必须从 ppt-refine 引入 attachSseAbort");
  assert.equal((workshop.match(/attachSseAbort\(req,/g) || []).length, 2, "pptx 与 html 两条生成 SSE 都必须挂断连");
  assert.ok(workshop.includes("agent?.abort"), "断开/超时必须 abort agent，不能只 dispose");
});

test("server 把 req 传给 PPT 生成 SSE，断连才能接到 close", () => {
  assert.ok(server.includes("handleWorkshopPpt({ ...wsCtx(), req }"), "pptx 生成必须传入 req");
  assert.ok(server.includes("handleWorkshopPptHtml({ ...wsCtx(), req }"), "html 设计稿生成必须传入 req");
});
