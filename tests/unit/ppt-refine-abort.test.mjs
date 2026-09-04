// ppt-refine：客户端断开必须停掉 agent，finish 只走一次
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attachSseAbort } from "../../engine/ppt-refine.mjs";

test("attachSseAbort：req close 触发 stop，且只触发一次", () => {
  const req = new EventEmitter();
  let n = 0;
  const release = attachSseAbort(req, () => { n++; });
  req.emit("close");
  req.emit("close");
  assert.equal(n, 1);
  release();
});

test("attachSseAbort：主动 release 后 close 不再 stop", () => {
  const req = new EventEmitter();
  let n = 0;
  const release = attachSseAbort(req, () => { n++; });
  release();
  req.emit("close");
  assert.equal(n, 0);
});
