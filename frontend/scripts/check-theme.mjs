#!/usr/bin/env node
// 主题契约检查（nomifun check:theme 模式，2026-08-25）
// 1) 所有 var(--pi-*) 引用必须有定义；2) 缓动曲线必须走 token（禁止散落裸 cubic-bezier）
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const SRC = join(ROOT, 'src')
const failures = []

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(tsx?|css)$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(SRC)

// ── 收集定义：styles.css 的 --pi-* 声明 + theme/*.ts 里导出的 token 名 ──
const defined = new Set()
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  // CSS 自定义属性定义
  for (const m of src.matchAll(/(--pi-[\w-]+)\s*:/g)) defined.add(m[1])
}
// tokens.ts / palettes.ts 中 colors 对象的 key → --pi-<key>
for (const tf of ['tokens.ts', 'palettes.ts']) {
  const p = join(SRC, 'theme', tf)
  try {
    const src = readFileSync(p, 'utf8')
    for (const m of src.matchAll(/^export const \w+ = \{([\s\S]*?)\}/gm)) {
      for (const k of m[1].matchAll(/^\s*([A-Za-z][\w]*):/gm)) defined.add('--pi-' + k[1].replace(/[A-Z]/g, c => '-' + c.toLowerCase()))
    }
  } catch { /* 文件不存在则跳过 */ }
}

// ── 检查 1：var(--pi-*) 使用必须有定义 ──
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/var\((--pi-[\w-]+)/g)) {
    if (!defined.has(m[1])) failures.push(`${f.replace(SRC + '\\', '').replace(/\\/g, '/')}: 使用了未定义的 ${m[1]}`)
  }
}

// ── 检查 2：缓动曲线收敛 —— 裸 cubic-bezier 只允许出现在 token 定义处 ──
const EASE_DEF_FILES = new Set(['styles.css', 'tokens.ts'])
for (const f of files) {
  if (EASE_DEF_FILES.has(f.split(/[\\/]/).pop())) continue
  const src = readFileSync(f, 'utf8')
  if (/cubic-bezier/.test(src)) failures.push(`${f.replace(SRC + '\\', '').replace(/\\/g, '/')}: 出现裸 cubic-bezier，请改用 var(--pi-ease/--pi-ease-sheet) 或 theme/tokens.ts 的 EASE/EASE_SHEET`)
}
// styles.css 里只许 :root 定义行有裸值
const stylesSrc = readFileSync(join(SRC, 'styles.css'), 'utf8')
for (const [i, line] of stylesSrc.split('\n').entries()) {
  if (/cubic-bezier/.test(line) && !/^\s*--pi-(ease|ease-sheet)\s*:/.test(line.trim())) {
    if (!line.includes('/* nomifun') && !line.trim().startsWith('*')) {
      failures.push(`src/styles.css:${i + 1}: 裸 cubic-bezier 应收敛到 --pi-ease/--pi-ease-sheet token`)
    }
  }
}

if (failures.length) {
  console.error(`✗ 主题契约违反 ${failures.length} 处：`)
  for (const f of failures) console.error('  - ' + f)
  process.exit(1)
}
console.log(`✓ 主题契约通过：${defined.size} 个 token 全部有定义，无裸缓动曲线`)
