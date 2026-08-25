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

// ── 契约四A：token 生成器派生不变量（Ant Design 路线：AA 是定义不是事后校验）──
import { SEEDS, generateTheme, emitCss, contrast, wcagLum } from '../src/theme/generate.mjs'
test('token 生成器：任意 seed 下 dim2/bg2 ≥4.5、dim/bg ≥5.5、阶梯单调', () => {
  const seeds = [...Object.entries(SEEDS),
    ['rand-warm', { bg: '#171310', text: '#f8efe8', accent: '#ff7847' }],
    ['rand-teal', { bg: '#0c1414', text: '#e8f8f5', accent: '#14b8a6' }],
    ['rand-rose', { bg: '#140d12', text: '#fdeef5', accent: '#ec4899' }],
  ]
  const failures = []
  for (const [name, seed] of seeds) {
    const v = generateTheme(seed)
    if (contrast(v['--pi-dim2'], v['--pi-bg2']) < 4.5) failures.push(`${name}: dim2/bg2 ${contrast(v['--pi-dim2'], v['--pi-bg2']).toFixed(2)}`)
    if (contrast(v['--pi-dim'], v['--pi-bg']) < 5.5) failures.push(`${name}: dim/bg ${contrast(v['--pi-dim'], v['--pi-bg']).toFixed(2)}`)
    // 阶梯亮度单调：深色主题递增、浅色主题递减（方向一致即可）
    const Ls = [v['--pi-bg'], v['--pi-bg1'], v['--pi-bg2'], v['--pi-bg3'], v['--pi-bg4']].map(h => wcagLum(h))
    const inc = Ls.every((x, i) => i === 0 || x > Ls[i - 1])
    const dec = Ls.every((x, i) => i === 0 || x < Ls[i - 1])
    if (!inc && !dec) failures.push(`${name}: 阶梯亮度不单调`)
  }
  assert.deepEqual(failures, [], failures.join('\n'))
})

// ── 契约四B：styles.css 生成区块与生成器输出一致（防手改漂移）──
test('styles.css token 区块与生成器输出一致（改 token 请改 generate.mjs 后重跑 scripts）', () => {
  const css = readFileSync(join(ROOT, 'src/styles.css'), 'utf8')
  const esc = s => s.replace(/[*/]/g, '\\$&')
  const START = '/* @generated-tokens:start —— 本区块由 scripts/generate-theme.mjs 生成，勿手改 */'
  const END = '/* @generated-tokens:end */'
  const regions = [...css.matchAll(new RegExp(`${esc(START)}\\r?\\n([\\s\\S]*?)\\r?\\n${esc(END)}`, 'g'))].map(m => m[1])
  assert.equal(regions.length, 2, `应有 2 个生成区块，实际 ${regions.length}`)
  const { root, themes } = emitCss()
  assert.equal(regions[0].trim(), root.trim(), ':root 区与生成器不一致——跑 node scripts/generate-theme.mjs')
  assert.equal(regions[1].trim(), themes.trim(), 'data-theme 区与生成器不一致——跑 node scripts/generate-theme.mjs')
})
// ── 契约七：Radix 封装组件必须声明 data-slot（shadcn 结构/皮肤分离约定）──
test('Radix 封装组件声明 data-slot 契约', () => {
  const required = [
    ['src/components/ModelSelect.tsx', ['data-slot="model-trigger"', 'data-slot="model-listbox"', 'data-slot="model-option"']],
    ['src/components/CommandPalette.tsx', ['data-slot="command-input"', 'data-slot="command-list"']],
    ['src/components/Sidebar.tsx', ['data-slot="session-delete-dialog"', 'data-slot="session-rename-dialog"']],
  ]
  const missing = []
  for (const [file, slots] of required) {
    const src = readFileSync(join(ROOT, file), 'utf8')
    for (const slot of slots) if (!src.includes(slot)) missing.push(`${file}: ${slot}`)
  }
  assert.deepEqual(missing, [], missing.join('\n'))
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
