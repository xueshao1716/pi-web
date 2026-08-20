// ===== dsh-tool.test.mjs —— dsh 执行臂适配层单测（错误翻译 / 结构化解析 / 密钥链）=====
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractStructuredOut, friendlyDshError, resolveDshEnv } from "../../engine/dsh-tool.mjs";

test("extractStructuredOut：协议解析", (t) => {
  t.test("```json 代码块优先", () => {
    const r = extractStructuredOut('前置说明\n```json\n{"result":"ok","steps":["a"]}\n```\n尾部');
    assert.equal(r.ok, true);
    assert.equal(r.data.result, "ok");
  });
  t.test("裸 JSON 块从后往前扫（含 result 才认）", () => {
    const r = extractStructuredOut('{"meta":{"x":1}} 尾部 {"result":"结论","steps":["s1"]}');
    assert.equal(r.ok, true);
    assert.equal(r.data.result, "结论");
  });
  t.test("无 result 的嵌套对象不误认", () => {
    const r = extractStructuredOut('{"foo":{"bar":1}}');
    assert.equal(r.ok, false);
  });
  t.test("空输入", () => {
    assert.equal(extractStructuredOut("").ok, false);
    assert.equal(extractStructuredOut(null).ok, false);
  });
});

test("friendlyDshError：失败原因翻译（stderr 真相优先于 err.message）", (t) => {
  t.test("QUOTA/余额不足 → 充值指引", () => {
    const msg = friendlyDshError("Command failed: node bin.js --profile headless", "dsh: QUOTA: Insufficient Balance");
    assert.match(msg, /余额不足/);
    assert.ok(!msg.includes("Command failed"), "不应暴露无用的命令行错误");
  });
  t.test("401/密钥无效 → 认证指引", () => {
    assert.match(friendlyDshError("", "dsh: 401 Unauthorized"), /认证失败/);
  });
  t.test("未安装 → 安装指引", () => {
    assert.match(friendlyDshError("Cannot find module 'C:/x/dsh'", ""), /未安装/);
  });
  t.test("超时", () => {
    assert.match(friendlyDshError("spawn ETIMEDOUT", ""), /超时/);
  });
  t.test("未知错误：透传 stderr 原文", () => {
    assert.match(friendlyDshError("whatever", "some raw failure"), /some raw failure/);
  });
});

test("resolveDshEnv：密钥三级链路（env → 注册表 → auth.json），不丢原环境", () => {
  const env = resolveDshEnv();
  assert.equal(env.PATH, process.env.PATH, "原环境变量必须保留");
  // 有无 key 都不应抛错（机器相关，只验证结构与 PATH 继承）
  assert.equal(typeof env, "object");
});
