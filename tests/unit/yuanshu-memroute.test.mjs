import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractEntities, routeMemory, MEMORY_TOP_K } from "../../engine/yuanshu-memroute.mjs";
import { initContextLoader, setLastUserQuery, loadMemory } from "../../engine/context-loader.mjs";

function tmpMem() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memroute-"));
  fs.mkdirSync(path.join(root, "记忆"), { recursive: true });
  return root;
}

test("extractEntities：对谁/记忆标题命中，闲聊不瞎抽", () => {
  const ents = extractEntities("我对上司特别紧张，面试又要来了", ["面试", "旅游计划"]);
  assert.ok(ents.includes("上司"), "对X 要抽出实体");
  assert.ok(ents.includes("面试"), "记忆标题出现在句子里要当 schema");
  assert.ok(!ents.includes("旅游计划"), "没提到的标题不能进");
  assert.equal(extractEntities("嗯好的").length, 0, "闲聊不抽实体");
});

test("routeMemory：最多 5 条，字面相关优先，无关旅游进不去", () => {
  assert.equal(MEMORY_TOP_K, 5);
  const picked = routeMemory({
    query: "下周面试怎么办",
    entities: ["面试"],
    candidates: [
      { source: "log", text: "### 1\n- 要点：面试准备了两个月" },
      { source: "log", text: "### 2\n- 要点：去云南旅游买了机票" },
      { source: "relation", text: "## 性格\n- 重要场合前容易焦虑" },
      { source: "correction", text: "### 纠\n- 触发: 面试\n- 纠正: 别说加油打气" },
      { source: "log", text: "### 3\n- 要点：晚饭吃了面" },
      { source: "log", text: "### 4\n- 要点：修了 8787 端口" },
      { source: "log", text: "### 5\n- 要点：面试官姓王" },
      { source: "log", text: "### 6\n- 要点：又一次面试复盘" },
    ],
  });
  assert.ok(picked.length <= 5, `超预算：${picked.length}`);
  assert.ok(picked.some((t) => /面试/.test(t)), "面试相关必须在");
  assert.ok(!picked.some((t) => /云南旅游/.test(t)), "无关旅游不得挤进 Top-5");
});

test("loadMemory 任务句只灌路由后的 Top-5，不再整份纠正+关系", () => {
  const root = tmpMem();
  fs.writeFileSync(path.join(root, "记忆.md"), "## 面试\n准备两个月\n## 旅游计划\n去云南\n", "utf8");
  let log = "";
  for (let i = 0; i < 12; i++) {
    log += `### 2026-09-0${(i % 9) + 1} 12:0${i % 10}\n- 要点：${i === 3 ? "面试准备了两个月" : i === 7 ? "云南旅游买机票" : `杂事编号${i}`}\n\n`;
  }
  fs.writeFileSync(path.join(root, "记忆", "记忆日志.md"), log, "utf8");
  fs.writeFileSync(path.join(root, "记忆", "纠正记忆.md"), "### a\n- 触发: 面试\n- 纠正: 别打鸡血\n\n### b\n- 触发: 旅游\n- 纠正: 别推荐景点\n", "utf8");
  fs.writeFileSync(path.join(root, "记忆", "关系记忆.md"), "## 性格\n- 重要面试前容易焦虑\n\n## 饮食\n- 不吃香菜\n", "utf8");
  initContextLoader({ cwd: root });
  setLastUserQuery("下周面试怎么办");
  const blob = loadMemory().join("\n\n");
  assert.ok(/工作协议/.test(blob), "协议常驻");
  assert.ok(/面试/.test(blob), "面试记忆要在");
  assert.ok(!/不吃香菜/.test(blob), "无关关系记忆不能整份灌");
  const routed = blob.split(/\n(?=### |## )/).filter((x) => /面试|焦虑|鸡血|云南|香菜|杂事/.test(x));
  assert.ok(routed.length <= 5, `路由条数 ${routed.length} 超过 Top-5`);
});
