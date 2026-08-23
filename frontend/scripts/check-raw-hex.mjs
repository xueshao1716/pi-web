#!/usr/bin/env node
// 颜色契约检查（08-23 对标 nomifun 的 deadCssUtility/contract 思路，最小版）：
// styles.css 之外禁止裸写 hex 色值——颜色必须走 token（var(--pi-*) / uno 语义类），
// 主题定义只允许在 src/theme/。违例 = 颜色体系再次失控的信号。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");
const norm = (p) => p.split("\\").join("/");
const ALLOWED = (rel) => { const r = norm(rel); return r === "src/styles.css" || r.startsWith("src/theme/"); }; // token 本体 + 主题定义合法持有 hex
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const SKIP_EXT = [".test.ts", ".test.tsx"];

let bad = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(tsx?|css)$/.test(name) || SKIP_EXT.some((e) => name.endsWith(e))) continue;
    const rel = relative(process.cwd(), p);
    if (ALLOWED(rel)) continue;
    const lines = readFileSync(p, "utf8").split("\n");
    lines.forEach((line, i) => {
      // 放行注释里的色值说明
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      const m = line.match(HEX);
      if (m) bad.push(`${rel}:${i + 1}  ${m.join(", ")}  → ${line.trim().slice(0, 60)}`);
    });
  }
})(ROOT);

if (bad.length) {
  console.error(`✗ 颜色契约违规 ${bad.length} 处（styles.css 外裸写 hex）：\n` + bad.map((b) => "  " + b).join("\n"));
  process.exit(1);
}
console.log("✓ 颜色契约通过：token 之外无裸 hex");
