import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleWsFile, initWorkspaceApi } from "../../engine/workspace-api.mjs";

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
