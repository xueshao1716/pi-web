import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleWsFile, handleWsDeliveries, handleWsRename, handleWsDelete, initWorkspaceApi, localDayStamp, artifactBaseName, looksLikeImageBytes, writeArtifactSidecar } from "../../engine/workspace-api.mjs";
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

test("资产页交付目录：有入口可打开，空目录保持禁用", () => {
  const src = readFileSync(new URL("../../frontend/src/pages/Assets.tsx", import.meta.url), "utf8");
  const details = readFileSync(new URL("../../frontend/src/components/assets/AssetDetails.tsx", import.meta.url), "utf8");
  const deliveries = readFileSync(new URL("../../frontend/src/components/Deliveries.tsx", import.meta.url), "utf8");
  assert.ok(src.includes("<AssetDetails"), "资产页要挂载资产详情操作区");
  assert.ok(details.includes("item.openPath"), "有入口的目录必须保留打开动作");
  assert.ok(deliveries.includes("d.openPath || d.type === 'file'"), "交付面板应区分空目录和可打开条目");
});

test("普通工作区文件的同名 JSON 不是产物旁路，重命名和删除不能误动", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-sidecar-scope-"));
  try {
    const file = path.join(root, "报告.md");
    const sidecar = path.join(root, "报告.json");
    fs.writeFileSync(file, "正文");
    fs.writeFileSync(sidecar, JSON.stringify({ prompt: "用户自己的配置", type: "custom" }));
    initWorkspaceApi({ wsRoot: root });

    const renameRes = mockRes();
    await handleWsRename(renameRes, { oldPath: "报告.md", newName: "报告-归档.md" });
    assert.equal(renameRes.status, 200);
    assert.equal(fs.existsSync(path.join(root, "报告-归档.json")), false);
    assert.equal(fs.readFileSync(sidecar, "utf8"), JSON.stringify({ prompt: "用户自己的配置", type: "custom" }));

    const deleteRes = mockRes();
    await handleWsDelete(deleteRes, { path: "报告-归档.md", confirmed: true });
    assert.equal(deleteRes.status, 200);
    assert.equal(fs.existsSync(sidecar), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("生成物旁路提示词随生成文件一起重命名和删除", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-sidecar-artifact-"));
  try {
    const dir = path.join(root, "生成物", "图片", "2026-09-11");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "海报_120000-001.png");
    fs.writeFileSync(file, Buffer.from("png"));
    writeArtifactSidecar(file, { prompt: "青衣洗白了", type: "image" });
    initWorkspaceApi({ wsRoot: root });

    const renameRes = mockRes();
    await handleWsRename(renameRes, { oldPath: "生成物/图片/2026-09-11/海报_120000-001.png", newName: "海报-归档.png" });
    assert.equal(renameRes.status, 200);
    assert.equal(fs.existsSync(path.join(dir, "海报_120000-001.json")), false);
    assert.equal(fs.existsSync(path.join(dir, "海报-归档.json")), true);

    const deleteRes = mockRes();
    await handleWsDelete(deleteRes, { path: "生成物/图片/2026-09-11/海报-归档.png", confirmed: true });
    assert.equal(deleteRes.status, 200);
    assert.equal(fs.existsSync(path.join(dir, "海报-归档.json")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("生成物改成普通扩展名时不把旁路提示词挂到非媒体文件", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-sidecar-ext-"));
  try {
    const dir = path.join(root, "生成物", "图片", "2026-09-11");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "海报_120000-002.png");
    const oldSidecar = path.join(dir, "海报_120000-002.json");
    fs.writeFileSync(file, Buffer.from("png"));
    writeArtifactSidecar(file, { prompt: "青衣洗白了", type: "image" });
    initWorkspaceApi({ wsRoot: root });

    const renameRes = mockRes();
    await handleWsRename(renameRes, { oldPath: "生成物/图片/2026-09-11/海报_120000-002.png", newName: "海报-说明.md" });
    assert.equal(renameRes.status, 200);
    assert.equal(fs.existsSync(path.join(dir, "海报-说明.json")), false);
    assert.equal(fs.existsSync(oldSidecar), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
