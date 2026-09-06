import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleWsFile, handleWsDeliveries, initWorkspaceApi, localDayStamp, artifactBaseName, looksLikeImageBytes } from "../../engine/workspace-api.mjs";

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
