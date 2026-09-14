// watchdog 回滚归因契约（2026-09-14）
// 背景：watchdog.cjs 连续崩溃达阈值会把 server.mjs 换成旧的 server.mjs.bak-*，
// 属于「静默降级」。2026-09-14 真机事故：全局依赖 @earendil-works/pi-coding-agent
// 被一次中断的安装删掉，服务启动即 ERR_UNSUPPORTED_DIR_IMPORT 崩溃 —— 与 server.mjs
// 代码无关。若当时 watchdog 在跑，刚修好的 server.mjs 会被旧备份覆盖。
// 本测试锁住「只回滚能归因到 server.mjs 自身的崩溃」这一契约。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { decideRollback, ROLLBACK_AFTER } = require("../../watchdog.cjs");

// 本次事故的真实崩溃文本
const REAL_INCIDENT = `node:internal/modules/esm/resolve:259
    throw new ERR_UNSUPPORTED_DIR_IMPORT(path, basePath, String(resolved));
Error [ERR_UNSUPPORTED_DIR_IMPORT]: Directory import 'D:\\pi-web' is not supported resolving ES modules imported from D:\\pi-web\\server.mjs`;

test("环境类崩溃（本次事故原文）→ 拒绝回滚，不许动 server.mjs", () => {
  const v = decideRollback({ syntaxOk: true, crashText: REAL_INCIDENT, crashCount: 3, rollbackDone: false });
  assert.equal(v.rollback, false, `环境类崩溃不得回滚，实际 reason=${v.reason}`);
  assert.match(v.reason, /环境\/依赖类/);
});

test("依赖缺失 / OOM / ENOENT 一律拒绝回滚", () => {
  const cases = [
    "Error: Cannot find module '@earendil-works/pi-coding-agent'",
    "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory",
    "Error: ENOENT: no such file or directory, open 'D:\\pi-web\\.token'",
    "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'typebox'",
  ];
  for (const text of cases) {
    const v = decideRollback({ syntaxOk: true, crashText: text, crashCount: 5, rollbackDone: false });
    assert.equal(v.rollback, false, `不应回滚: ${text.slice(0, 60)} → ${v.reason}`);
  }
});

test("server.mjs 语法错 → 回滚（即便崩溃文本里夹杂环境类字样）", () => {
  const v = decideRollback({ syntaxOk: false, crashText: "SyntaxError: Missing catch or finally\nCannot find module 'x'", crashCount: 3, rollbackDone: false });
  assert.equal(v.rollback, true, "语法坏掉的文件必须回滚");
  assert.match(v.reason, /语法/);
});

test("server.mjs 运行时 JS 错 → 回滚", () => {
  const v = decideRollback({ syntaxOk: true, crashText: "ReferenceError: taskProgress is not defined\n    at handleChat (D:\\pi-web\\server.mjs:1886:20)", crashCount: 3, rollbackDone: false });
  assert.equal(v.rollback, true, "ReferenceError 属于 server.mjs 自身问题，应回滚");
  assert.match(v.reason, /运行时报错/);
});

test("崩溃次数未达阈值 → 不回滚", () => {
  for (let n = 0; n < ROLLBACK_AFTER; n++) {
    const v = decideRollback({ syntaxOk: false, crashText: "SyntaxError: x", crashCount: n, rollbackDone: false });
    assert.equal(v.rollback, false, `crashCount=${n} 时不应回滚`);
  }
  assert.equal(decideRollback({ syntaxOk: false, crashText: "SyntaxError: x", crashCount: ROLLBACK_AFTER, rollbackDone: false }).rollback, true);
});

test("已回滚过 → 不重复回滚", () => {
  const v = decideRollback({ syntaxOk: false, crashText: "SyntaxError: x", crashCount: 99, rollbackDone: true });
  assert.equal(v.rollback, false);
  assert.match(v.reason, /已回滚过/);
});

test("依赖缺失连带抛 JS 错名 → 仍拒绝回滚（环境否决必须优先于代码错名）", () => {
  // 真实形态：模块加载失败常连带抛 TypeError/ReferenceError，
  // 若只看 JS 错名就会误判成 server.mjs 的锅 → 把好文件换成旧备份。
  const text = [
    "Error: Cannot find module 'typebox'",
    "    at Module._resolveFilename (node:internal/modules/cjs/loader:1)",
    "TypeError: Cannot read properties of undefined (reading 'Type')",
  ].join("\n");
  const v = decideRollback({ syntaxOk: true, crashText: text, crashCount: 4, rollbackDone: false });
  assert.equal(v.rollback, false, "依赖缺失的连锁错误不得触发回滚");
});

test("无法归因的崩溃文本 → 默认拒绝回滚（宁可不修也不降级）", () => {
  const v = decideRollback({ syntaxOk: true, crashText: "server 退出 code=1 signal=null", crashCount: 9, rollbackDone: false });
  assert.equal(v.rollback, false, "归因不明时不得静默降级 server.mjs");
  assert.match(v.reason, /无法归因/);
});
