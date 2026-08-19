// ===== tools-unified.test.mjs —— 统一工具集单测（安全防线 + 文件工具 + 执行器工厂）=====
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BASE_TOOL_SCHEMAS, createUnifiedToolExecutor, rewriteInlineCode, webSearchTool, stripHtml,
} from "../../engine/tools/unified-tools.mjs";
import { matchDenyRule, isProtectedPath, safeJoin, DANGEROUS_CMD_RE, INTERACTIVE_CMD_RE } from "../../engine/tools/security.mjs";

test("engine/tools 安全线（security.mjs）", (t) => {
  t.test("deny 规则：隧道/强推git/系统篡改/密钥写入命中", () => {
    assert.equal(matchDenyRule("cloudflared tunnel run")?.id, "no-tunnel");
    assert.equal(matchDenyRule("ngrok http 8080")?.id, "no-tunnel");
    assert.equal(matchDenyRule("git push -f origin main")?.id, "no-force-git");
    assert.equal(matchDenyRule("reg delete HKLM\\Soft")?.id, "no-system-mutate");
    assert.equal(matchDenyRule("echo password >> .env")?.id, "no-secrets-write");
  });
  t.test("deny 规则：正常命令不误伤", () => {
    assert.equal(matchDenyRule("node server.mjs"), null);
    assert.equal(matchDenyRule("git status"), null);
    assert.equal(matchDenyRule("dir /b"), null);
  });
  t.test("危险命令正则：rm -rf / format / shutdown", () => {
    assert.ok(DANGEROUS_CMD_RE.test("rm -rf /"));
    assert.ok(DANGEROUS_CMD_RE.test("format C:"));
    assert.ok(DANGEROUS_CMD_RE.test("shutdown /s"));
    assert.ok(DANGEROUS_CMD_RE.test("rm script.js")); // 原版语义：rm 一律拦截（flag 组可选）
  });
  t.test("交互命令正则", () => {
    assert.ok(INTERACTIVE_CMD_RE.test("npm login"));
    assert.ok(!INTERACTIVE_CMD_RE.test("npm install lodash"));
  });
  t.test("受保护路径：人格/宪法/凭据只读", () => {
    assert.ok(isProtectedPath("D:/pi-workspace/APPEND_SYSTEM.md"));
    assert.ok(isProtectedPath("/home/x/SOUL"));
    assert.ok(isProtectedPath("D:/x/宪法.json"));
    assert.ok(isProtectedPath("C:/Users/x/.token"));
    assert.ok(!isProtectedPath("D:/pi-workspace/记忆.md"));
    assert.ok(!isProtectedPath("D:/x/token.md")); // .token 结尾才算，token.md 不算
  });
  t.test("safeJoin：工作空间内放行、../ 越权拒绝", () => {
    const root = "D:\\ws";
    assert.ok(safeJoin(root, "工程/a.txt")?.startsWith(root));
    assert.equal(safeJoin(root, "../outside.txt"), null);
    assert.equal(safeJoin(root, "a/../../b.txt"), null); // 解析后跳出 root
  });
});

test("engine/tools 工具集（unified-tools.mjs）", (t) => {
  t.test("schema：5 个基础工具齐全且为 function 格式", () => {
    const names = BASE_TOOL_SCHEMAS.map((s) => s.function.name);
    assert.deepEqual(names, ["bash", "read", "write", "edit", "web_search"]);
    for (const s of BASE_TOOL_SCHEMAS) assert.equal(s.type, "function");
  });

  t.test("rewriteInlineCode：多行 node -e 改写为临时文件", () => {
    const r = rewriteInlineCode('node -e "const a=1;\nconsole.log(a)"');
    assert.ok(r && r.file.endsWith(".js"));
    assert.equal(r.interp, process.execPath);
  });
  t.test("rewriteInlineCode：简单命令不改写", () => {
    assert.equal(rewriteInlineCode("node server.mjs"), null);
    assert.equal(rewriteInlineCode('node -e "console.log(1)"'), null); // 单行无嵌套引号
  });

  t.test("webSearchTool：HTTP 失败返回错误文案（不抛异常）", async () => {
    const fake = async () => ({ status: 500, ok: false, text: async () => "" });
    const r = await webSearchTool("test", fake);
    assert.match(r, /^（搜索请求失败/);
  });
  t.test("webSearchTool：解析 Bing 结果块 + 跳转链接还原", async () => {
    const real = Buffer.from("https://example.com/page", "utf8").toString("base64");
    const html = `<ol><li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1${real}">示例 <b>标题</b></a></h2><p class="b_lineclamp">这是&amp;摘要</p></li></ol>`;
    const fake = async () => ({ status: 200, ok: true, text: async () => html });
    const r = await webSearchTool("test", fake);
    assert.match(r, /1\. 示例 标题/);
    assert.match(r, /https:\/\/example\.com\/page/); // base64 解码还原真实地址
    assert.match(r, /这是&摘要/); // stripHtml 解实体
  });

  t.test("stripHtml：去标签 + 解 HTML 实体", () => {
    assert.equal(stripHtml("<p>a &amp; b &lt;c&gt;</p>"), "a & b <c>");
  });
});

test("engine/tools 执行器工厂（createUnifiedToolExecutor）", (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "piweb-tools-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const exec = createUnifiedToolExecutor({
    cwd: () => tmp,
    safePath: (p) => safeJoin(tmp, p),
  });

  t.test("bash：危险命令被拦截", async () => {
    const r = await exec("bash", { command: "rm -rf D:/" });
    assert.equal(r.isError, true);
    assert.match(r.text, /拒绝执行/);
  });
  t.test("bash：deny 规则拦截并报规则 id", async () => {
    const r = await exec("bash", { command: "ngrok http 8080" });
    assert.equal(r.isError, true);
    assert.match(r.text, /宪法规则 no-tunnel/);
  });
  t.test("bash：正常命令执行并返回输出", async () => {
    const r = await exec("bash", { command: "echo hello-tools" });
    assert.equal(r.isError, false);
    assert.match(r.text, /hello-tools/);
  });
  t.test("read/write/edit：正常读写改", async () => {
    const w = await exec("write", { path: "a/b.txt", content: "hello" });
    assert.equal(w.isError, false);
    const r = await exec("read", { path: "a/b.txt" });
    assert.equal(r.text, "hello");
    const e = await exec("edit", { path: "a/b.txt", oldText: "hello", newText: "world" });
    assert.equal(e.isError, false);
    assert.equal((await exec("read", { path: "a/b.txt" })).text, "world");
  });
  t.test("write：路径越权拒绝", async () => {
    const r = await exec("write", { path: "../escape.txt", content: "x" });
    assert.equal(r.isError, true);
    assert.match(r.text, /路径越权/);
  });
  t.test("write：受保护路径只读拒绝", async () => {
    const r = await exec("write", { path: "APPEND_SYSTEM.md", content: "x" });
    assert.equal(r.isError, true);
    assert.match(r.text, /受保护文件/);
  });
  t.test("read：不存在的文件报错", async () => {
    const r = await exec("read", { path: "nope.txt" });
    assert.equal(r.isError, true);
  });
  t.test("未知工具：返回错误而非抛异常", async () => {
    const r = await exec("nonexistent", {});
    assert.equal(r.isError, true);
    assert.match(r.text, /未知工具/);
  });
  t.test("think：返回思考标记（调试工具）", async () => {
    const r = await exec("think", { content: "分析…" });
    assert.ok(!r.isError); // 原版语义：think 成功时无 isError 字段
    assert.equal(r.think, "分析…");
  });
});
