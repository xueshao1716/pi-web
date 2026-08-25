// ══════════════════════════════════════════════════════════
// 设计契约测试（对标 nomifun：视觉决策用 CI 锁死，不靠人眼）
// 跑法：cd frontend && node --test tests/
// ══════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(ROOT, 'src/styles.css'), 'utf8')

const walkTs = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walkTs(p, out)
    else if (/\.(tsx?|css)$/.test(f)) out.push(p)
  }
  return out
}

// ── 契约一：缓动词汇表收敛（全站只允许两条曲线，08-25 对标 nomifun）──
const ALLOWED_EASING = [
  'cubic-bezier(0.2, 0.8, 0.2, 1)',   // 通用交互
  'cubic-bezier(0.32, 0.72, 0, 1)',   // 面板/入场（苹果抽屉曲线）
]
test('缓动词汇表：styles.css 只允许白名单曲线', () => {
  const found = [...css.matchAll(/cubic-bezier\([^)]*\)/g)].map(m =>
    m[0].replace(/\s+/g, ' ').replace(/,\s/g, ', ').trim())
  for (const f of found) {
    assert.ok(ALLOWED_EASING.includes(f), `发现白名单外的缓动曲线: ${f}`)
  }
})

// ── 契约二：keyframe 唯一定义 ──
test('keyframes 不允许重复定义', () => {
  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1])
  const dup = names.filter((n, i) => names.indexOf(n) !== i)
  assert.deepEqual(dup, [], `重复定义的 keyframes: ${dup.join(', ')}`)
})

// ── 契约三：animation 引用必须可解析（防 skeletonShimmer 类回归）──
test('所有 animation 引用都有对应 @keyframes 定义', () => {
  const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]))
  const refs = [...css.matchAll(/animation:\s*([\w-]+)\s/g)].map(m => m[1])
    .concat([...css.matchAll(/animation-name:\s*([\w-]+)/g)].map(m => m[1]))
    .filter(r => r !== 'none')
  const missing = refs.filter(r => !defined.has(r))
  assert.deepEqual(missing, [], `引用了未定义的 keyframes: ${missing.join(', ')}`)
})

// ── 契约四：文字 token 全主题 WCAG AA（dim/dim2 对 bg 与 bg2）──
const lum = hex => {
  const [r, g, b] = hex.replace('#', '').match(/\w\w/g).map(x => parseInt(x, 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
const parseVars = block => Object.fromEntries(
  [...block.matchAll(/--pi-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map(m => ['pi-' + m[1], m[2]]))

test('全主题 dim/dim2 文字对比度 ≥ 4.5（对 bg 和 bg2 卡片底色）', () => {
  const themes = [{ name: 'deep(default)', vars: parseVars(css.slice(css.indexOf(':root'))) }]
  for (const m of css.matchAll(/\[data-theme="(\w+)"\]\s*\{([^}]*)\}/g)) {
    themes.push({ name: m[1], vars: { ...themes[0].vars, ...parseVars(m[2]) } })
  }
  const failures = []
  for (const t of themes) {
    const v = t.vars
    if (!v['pi-bg'] || !v['pi-dim']) continue
    const bg2 = v['pi-bg2'] || v['pi-bg']
    for (const [token, surfaceName, fg, bg] of [
      ['dim', 'bg', v['pi-dim'], v['pi-bg']],
      ['dim2', 'bg', v['pi-dim2'], v['pi-bg']],
      ['dim2', 'bg2(卡片)', v['pi-dim2'], bg2],
    ]) {
      const ratio = contrast(fg, bg)
      if (ratio < 4.5) failures.push(`${t.name}: --${token} on ${surfaceName} = ${ratio.toFixed(2)} (${fg} on ${bg})`)
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'))
})

// ── 契约六：字阶白名单（typeset：全站只允许 7 级）──
test('字号阶梯收敛到 7 级白名单', () => {
  const SCALE = new Set(['10', '11', '12', '13', '15', '17', '22'])
  const offenders = []
  for (const p of walkTs(join(ROOT, 'src'))) {
    if (!p.endsWith('.tsx') && !p.endsWith('.ts')) continue
    const src = readFileSync(p, 'utf8')
    for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
      if (!SCALE.has(m[1])) offenders.push(`${p.replace(ROOT, '')}: text-[${m[1]}px]`)
    }
  }
  assert.deepEqual(offenders, [], '白名单外字号:\n' + offenders.join('\n'))
})

// ── 契约五：字号地板（className 里不允许 <10px 的文本）──
test('源码不允许 <10px 字号 class（信息可读性地板）', () => {
  const offenders = []
  for (const p of walkTs(join(ROOT, 'src'))) {
    if (!p.endsWith('.tsx') && !p.endsWith('.ts')) continue
    const src = readFileSync(p, 'utf8')
    for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
      if (parseFloat(m[1]) < 10) offenders.push(`${p.replace(ROOT, '')}: text-[${m[1]}px]`)
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'))
})
