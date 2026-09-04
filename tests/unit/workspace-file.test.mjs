import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleWsFile, handleWsDeliveries, initWorkspaceApi } from "../../engine/workspace-api.mjs";

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
