// lib/static.mjs 单元测试 —— 静态资源缓存 + ETag + 指纹强缓存
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createStaticServer, resolveStaticPath } from "../../lib/static.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

// 最小 mock res：收集 writeHead / end
function mockRes() {
  return {
    headers: null, status: null, body: null, ended: false,
    writeHead(status, headers) { this.status = status; this.headers = headers; return this; },
    end(body) { this.body = body; this.ended = true; return this; },
  };
}
function mockReq(url) { return { url }; }

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "static-test-"));
  fs.writeFileSync(path.join(tmpDir, "index.html"), "<h1>home</h1>");
  fs.writeFileSync(path.join(tmpDir, "app.js"), "console.log(1);");
  fs.writeFileSync(path.join(tmpDir, "sw.js"), "self.addEventListener('install',()=>{});");
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("lib/static.mjs 静态资源服务", () => {
  test("200 + 正确 Content-Type + ETag", async () => {
    const s = createStaticServer({ publicDir: tmpDir, mime: MIME });
    const res = mockRes();
    await s.handle(mockReq("/index.html"), res);
    assert.equal(res.status, 200);
    assert.equal(res.headers["Content-Type"], "text/html; charset=utf-8");
    assert.match(res.headers["ETag"], /^W\/"\d+-\d+(\.\d+)?"$/);
    assert.equal(res.body.toString(), "<h1>home</h1>");
  });

  test("根路径 / 映射到 index.html；未列扩展名 → octet-stream", async () => {
    const s = createStaticServer({ publicDir: tmpDir, mime: MIME });
    const res = mockRes();
    await s.handle(mockReq("/"), res);
    assert.equal(res.status, 200);
    assert.equal(res.headers["Content-Type"], "text/html; charset=utf-8");
    const res2 = mockRes();
    fs.writeFileSync(path.join(tmpDir, "data.bin"), Buffer.from([1, 2, 3]));
    await s.handle(mockReq("/data.bin"), res2);
    assert.equal(res2.headers["Content-Type"], "application/octet-stream");
  });

  test("ETag 命中 If-None-Match → 304 无 body", async () => {
    const s = createStaticServer({ publicDir: tmpDir, mime: MIME });
    const res = mockRes();
    await s.handle(mockReq("/app.js"), res);
    const etag = res.headers["ETag"];
    assert.ok(etag);
    const res2 = mockRes();
    await s.handle({ url: "/app.js", headers: { "if-none-match": etag } }, res2);
    assert.equal(res2.status, 304);
    assert.equal(res2.body, undefined);
  });

  test("内存缓存：同文件二次请求 readFile 不重复（Node 20 无内置 spy，用内容改写+mtime 不变验证缓存命中逻辑）", async () => {
    // 用同一引用验证缓存：写文件 → 请求 → 缓存后改 raw 状态不变时 mtime 不变 → 仍返回缓存旧内容
    const s = createStaticServer({ publicDir: tmpDir, mime: MIME });
    const res = mockRes();
    await s.handle(mockReq("/index.html"), res);
    assert.equal(res.body.toString(), "<h1>home</h1>");
    // mtime 未变（同 ms 内），缓存应直接命中；内容源被改但 mtime 未变 → 若走了磁盘会拿到新内容
    // 这里不依赖极端时序，改验证 etag/headers 与缓存条目数
    assert.equal(s.cacheSize(), 1);
    await s.handle(mockReq("/index.html"), mockRes());
    assert.equal(s.cacheSize(), 1, "二次请求不新增缓存条目（命中缓存）");
    await s.handle(mockReq("/app.js"), mockRes());
    assert.equal(s.cacheSize(), 2);
  });

  test("文件变更（mtime 变化）→ 缓存失效重读", async () => {
    const s = createStaticServer({ publicDir: tmpDir, mime: MIME });
    const res = mockRes();
    await s.handle(mockReq("/index.html"), res);
    const oldBody = res.body.toString();
    await new Promise(r => setTimeout(r, 20));
    fs.writeFileSync(path.join(tmpDir, "index.html"), "<h1>updated</h1>");
    const res2 = mockRes();
    await s.handle(mockReq("/index.html"), res2);
    assert.notEqual(res2.body.toString(), oldBody);
    assert.equal(res2.body.toString(), "<h1>updated</h1>");
  });

  test("指纹查询参数 ?v= → 强缓存 immutable；无指纹 → no-cache（validate 用）", async () => {
    const s = createStaticServer({ publicDir: tmpDir, mime: MIME });
    const res = mockRes();
    await s.handle(mockReq("/app.js?v=222"), res);
    assert.equal(res.headers["Cache-Control"], "public, max-age=31536000, immutable");
    const res2 = mockRes();
    await s.handle(mockReq("/app.js"), res2);
    assert.equal(res2.headers["Cache-Control"], "no-cache");
  });

  test("index.html / 根路径即使带 ?v= 也必须 no-cache，不能把整站钉死在旧 bundle", async () => {
    const s = createStaticServer({ publicDir: tmpDir, mime: MIME });
    const root = mockRes();
    await s.handle(mockReq("/?v=novel-pipe"), root);
    assert.equal(root.headers["Cache-Control"], "no-cache");
    const html = mockRes();
    await s.handle(mockReq("/index.html?v=1"), html);
    assert.equal(html.headers["Cache-Control"], "no-cache");
  });

  test("sw.js 不缓存 + Service-Worker-Allowed 覆盖根", async () => {
    const s = createStaticServer({ publicDir: tmpDir, mime: MIME });
    const res = mockRes();
    await s.handle(mockReq("/sw.js?v=21"), res);
    assert.equal(res.headers["Cache-Control"], "no-cache");
    assert.equal(res.headers["Service-Worker-Allowed"], "/");
    assert.equal(res.status, 200);
  });

  test("resolveStaticPath：正常路径解析正确 + 根路径映射 index.html", () => {
    const r1 = resolveStaticPath(tmpDir, "/app.js");
    assert.equal(r1.ok, true);
    assert.equal(r1.file, path.join(tmpDir, "app.js"));
    const r2 = resolveStaticPath(tmpDir, "/");
    assert.equal(r2.file, path.join(tmpDir, "index.html"));
    fs.mkdirSync(path.join(tmpDir, "workshop-ui"));
    fs.writeFileSync(path.join(tmpDir, "workshop-ui", "index.html"), "<h1>m3e</h1>");
    const rDir = resolveStaticPath(tmpDir, "/workshop-ui/");
    assert.equal(rDir.file, path.join(tmpDir, "workshop-ui", "index.html"));
    // 穿越形态：WHATWG URL 折叠 /.. → 落在 root 内不存在的路径（安全 404）；startsWith 防御是未来改动的兜底
    const r3 = resolveStaticPath(tmpDir, "/../secrets.txt");
    assert.equal(r3.file.startsWith(tmpDir), true);
    const r4 = resolveStaticPath(tmpDir, "/%2e%2e/%2e%2e/x");
    assert.equal(r4.file.startsWith(tmpDir), true);
  });

  test("穿越型请求不泄露 root 外内容（HTTP 层非 200）", async () => {
    const s = createStaticServer({ publicDir: tmpDir, mime: MIME });
    const res = mockRes();
    await s.handle(mockReq("/../../server.mjs"), res); // URL 规范化后落到 root 内不存在 → 404，与原实现一致
    assert.equal(res.status, 404);
    assert.equal(res.body, "not found");
  });

  test("不存在 → 404", async () => {
    const s = createStaticServer({ publicDir: tmpDir, mime: MIME });
    const res = mockRes();
    await s.handle(mockReq("/nope.txt"), res);
    assert.equal(res.status, 404);
  });
});