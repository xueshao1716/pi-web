import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleWsFile, handleWsDeliveries, initWorkspaceApi, localDayStamp, artifactBaseName, looksLikeImageBytes } from "../../engine/workspace-api.mjs";
import { readFileSync } from "node:fs";

function mockRes() {
  return {
    status: 0,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

test("handleWsFile：目录必须拒绝，不能进入 createReadStream", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-file-test-"));
  try {
    initWorkspaceApi({ wsRoot: root });
    const res = mockRes();
    const url = new URL(`http://localhost/api/ws/file?path=${encodeURIComponent(root)}`);

    await handleWsFile(res, { headers: {} }, url);

    assert.equal(res.status, 404);
    assert.deepEqual(JSON.parse(res.body), { error: "文件不存在" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("handleWsFile：HEAD 要回 200 头信息，不能 404 把播放器逼进重试刷", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-file-head-"));
  try {
    const file = path.join(root, "clip.mp4");
    fs.writeFileSync(file, Buffer.alloc(64, 1));
    initWorkspaceApi({ wsRoot: root });
    const res = mockRes();
    res.destroy = () => {};
    const url = new URL(`http://localhost/api/ws/file?path=${encodeURIComponent("clip.mp4")}`);
    await handleWsFile(res, { method: "HEAD", headers: {} }, url);
    assert.equal(res.status, 200);
    assert.match(String(res.headers?.["Content-Type"] || ""), /video\/mp4|octet-stream/);
    assert.equal(String(res.headers?.["Content-Length"]), "64");
    assert.equal(res.body, undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("server 路由表要把 HEAD /api/ws/file 接到同一 handler", () => {
  const server = readFileSync(new URL("../../server.mjs", import.meta.url), "utf8");
  assert.match(server, /\["HEAD",\s*"\/api\/ws\/file"/);
});

test("handleWsDeliveries：条目带 ISO mtime，供工作台判断今日交付", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-deliv-"));
  try {
    fs.mkdirSync(path.join(root, "交付"));
    fs.writeFileSync(path.join(root, "交付", "demo.txt"), "ok");
    initWorkspaceApi({ wsRoot: root });
    const res = mockRes();
    await handleWsDeliveries(res);
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.deliveries.length, 1);
    assert.equal(body.deliveries[0].name, "demo.txt");
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(body.deliveries[0].mtime), "mtime 必须是 ISO 时间");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("html/pdf 必须是浏览器能打开的 MIME，不能 octet-stream + nosniff 白屏", async () => {
  const { wsFileMime } = await import("../../engine/workspace-api.mjs");
  assert.match(wsFileMime(".html"), /text\/html/);
  assert.match(wsFileMime(".md"), /text\/plain|text\/markdown/);
  assert.match(wsFileMime(".pdf"), /application\/pdf/);
  assert.equal(wsFileMime(".bin"), "application/octet-stream");
});

test("交付目录有 index.html 时必须给出可点开的入口路径", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-deliv-html-"));
  try {
    const site = path.join(root, "交付", "崆峒山");
    fs.mkdirSync(site, { recursive: true });
    fs.writeFileSync(path.join(site, "index.html"), "<h1>ok</h1>");
    fs.writeFileSync(path.join(root, "交付", "说明.md"), "# hi");
    initWorkspaceApi({ wsRoot: root });
    const res = mockRes();
    await handleWsDeliveries(res);
    const body = JSON.parse(res.body);
    const dir = body.deliveries.find(d => d.name === "崆峒山");
    const md = body.deliveries.find(d => d.name === "说明.md");
    assert.ok(dir, "目录要出现在列表");
    assert.equal(dir.type, "dir");
    assert.match(dir.openPath.replace(/\\/g, "/"), /交付\/崆峒山\/index\.html/);
    assert.match(dir.url, /index\.html/);
    assert.match(md.openPath.replace(/\\/g, "/"), /交付\/说明\.md/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("localDayStamp 用本地日历日，不用 UTC，避免凌晨写进昨天的文件夹", () => {
  const now = new Date();
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  assert.equal(localDayStamp(now), local);
});

test("artifactBaseName 小语肖像可读，且带时分秒毫秒避免覆盖", () => {
  const now = new Date("2026-09-05T02:17:47.925+08:00");
  const name = artifactBaseName({ prompt: "一位温柔的AI少女半身像，名叫小语。", now });
  assert.ok(name.startsWith("小语肖像_"), `实际: ${name}`);
  const stamp = String(now.getHours()).padStart(2, "0")
    + String(now.getMinutes()).padStart(2, "0")
    + String(now.getSeconds()).padStart(2, "0")
    + "-" + String(now.getMilliseconds()).padStart(3, "0");
  assert.ok(name.includes(stamp), `必须带本地时分秒毫秒，实际: ${name}`);
  const cat = artifactBaseName({ prompt: "一只橘猫蹲在屋顶", now });
  assert.ok(cat.includes("橘猫"), `实际: ${cat}`);
});

test("looksLikeImageBytes 认 PNG 头，拒 HTML 错误页冒充图片", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal(looksLikeImageBytes(png), true);
  assert.equal(looksLikeImageBytes(Buffer.from("<!DOCTYPE html><p>error</p>")), false);
  assert.equal(looksLikeImageBytes(Buffer.from("not an image")), false);
});

test("资产页成品交付：目录也能点开，不能 disabled 掉", () => {
  const src = readFileSync(new URL("../../frontend/src/pages/Assets.tsx", import.meta.url), "utf8");
  assert.ok(src.includes("成品交付"), "资产页要有成品交付分区");
  assert.ok(!src.includes("disabled={d.type !== 'file'}"), "有入口的目录不能整行 disabled");
  assert.ok(!src.includes("目录请在工作空间中打开"), "不能把成品文件夹推去工作空间");
  assert.ok(src.includes("openPath") || src.includes("d.url"), "点击必须打开交付入口");
});
