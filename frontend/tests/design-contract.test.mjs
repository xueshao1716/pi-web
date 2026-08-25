// ══════════════════════════════════════════════════════════
// 设计契约测试（对标 nomifun：视觉决策用 CI 锁死，不靠人眼）
// 跑法：cd frontend && node --test tests/
// ══════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEEDS, generateTheme, emitCss, contrast, wcagLum } from '../src/theme/generate.mjs'

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

// ── 1. 缓动词汇表 ──
const ALLOWED_EASING = [
  'cubic-bezier(0.2, 0.8, 0.2, 1)',
  'cubic-bezier(0.32, 0.72, 0, 1)',
]
test('缓动词汇表：styles.css 只允许白名单曲线', () => {
  const found = [...css.matchAll(/cubic-bezier\([^)]*\)/g)].map(m =>
    m[0].replace(/\s+/g, ' ').replace(/,\s/g, ', ').trim())
  for (const f of found) {
    assert.ok(ALLOWED_EASING.includes(f), `白名单外: ${f}`)
  }
})

// ── 2. keyframe 唯一 ──
test('keyframes 不允许重复定义', () => {
  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1])
  const dup = names.filter((n, i) => names.indexOf(n) !== i)
  assert.deepEqual(dup, [], `重复: ${dup.join(', ')}`)
})

// ── 3. animation 引用可解析 ──
test('animation 引用都有对应 @keyframes', () => {
  const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]))
  const refs = [...css.matchAll(/animation:\s*([\w-]+)\s/g)].map(m => m[1])
    .concat([...css.matchAll(/animation-name:\s*([\w-]+)/g)].map(m => m[1]))
    .filter(r => r !== 'none')
  const missing = refs.filter(r => !defined.has(r))
  assert.deepEqual(missing, [], `未定义: ${missing.join(', ')}`)
})

// ── 4A. 派生不变量 ──
test('任意 seed 下 dim2/bg2 ≥4.5、dim/bg ≥5.5、阶梯单调', () => {
  const seeds = [...Object.entries(SEEDS),
    ['rand-warm', { bg: '#171310', text: '#f8efe8', accent: '#ff7847' }],
    ['rand-teal', { bg: '#0c1414', text: '#e8f8f5', accent: '#14b8a6' }],
    ['rand-rose', { bg: '#140d12', text: '#fdeef5', accent: '#ec4899' }],
  ]
  const failures = []
  for (const [name, seed] of seeds) {
    const v = generateTheme(seed)
    if (contrast(v['--pi-dim2'], v['--pi-bg2']) < 4.5) failures.push(`${name}: dim2/bg2 ${contrast(v['--pi-dim2'], v['--pi-bg2']).toFixed(2)}`)
    // dim2 的亮承载面不止 bg2：卡片 bg3 / 按钮 default(=bg3) 也必须 ≥4.5（复评检测器抓到 bg3 漏到 ~4.2）
    if (contrast(v['--pi-dim2'], v['--pi-bg3']) < 4.5) failures.push(`${name}: dim2/bg3 ${contrast(v['--pi-dim2'], v['--pi-bg3']).toFixed(2)}`)
    if (contrast(v['--pi-dim2'], v['--pi-default']) < 4.5) failures.push(`${name}: dim2/default ${contrast(v['--pi-dim2'], v['--pi-default']).toFixed(2)}`)
    if (contrast(v['--pi-dim'], v['--pi-bg']) < 5.5) failures.push(`${name}: dim/bg ${contrast(v['--pi-dim'], v['--pi-bg']).toFixed(2)}`)
    const Ls = [v['--pi-bg'], v['--pi-bg1'], v['--pi-bg2'], v['--pi-bg3'], v['--pi-bg4']].map(h => wcagLum(h))
    if (!Ls.every((x, i) => i === 0 || x > Ls[i - 1]) && !Ls.every((x, i) => i === 0 || x < Ls[i - 1])) failures.push(`${name}: 不单调`)
  }
  assert.deepEqual(failures, [], failures.join('\n'))
})

// ── 4B. styles.css 区块与生成器一致 ──
test('styles.css token 区块与生成器一致', () => {
  const c = readFileSync(join(ROOT, 'src/styles.css'), 'utf8').replace(/\r\n/g, '\n')
  const esc = s => s.replace(/[*/]/g, '\\$&')
  const START = '/* @generated-tokens:start'
  const END = '/* @generated-tokens:end */'
  const regions = [...c.matchAll(new RegExp(`${esc(START)}[\\s\\S]*?\\n([\\s\\S]*?)\\n${esc(END)}`, 'g'))].map(m => m[1])
  assert.equal(regions.length, 2, `应有 2 个区块，实际 ${regions.length}`)
  const { root, themes } = emitCss()
  assert.equal(regions[0].trim(), root.trim(), ':root 不一致')
  assert.equal(regions[1].trim(), themes.trim(), 'data-theme 不一致')
})

// ── 5. 字号地板 ──
test('不允许 <10px 字号 class', () => {
  const offenders = []
  for (const p of walkTs(join(ROOT, 'src'))) {
    if (!p.endsWith('.tsx')) continue
    for (const m of readFileSync(p, 'utf8').matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
      if (parseFloat(m[1]) < 10) offenders.push(`${p.replace(ROOT, '')}: text-[${m[1]}px]`)
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'))
})

// ── 6. 字阶白名单 ──
test('字号阶梯收敛到 7 级白名单', () => {
  const SCALE = new Set(['10', '11', '12', '13', '15', '17', '22'])
  const offenders = []
  for (const p of walkTs(join(ROOT, 'src'))) {
    if (!p.endsWith('.tsx')) continue
    for (const m of readFileSync(p, 'utf8').matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
      if (!SCALE.has(m[1])) offenders.push(`${p.replace(ROOT, '')}: text-[${m[1]}px]`)
    }
  }
  assert.deepEqual(offenders, [], '白名单外:\n' + offenders.join('\n'))
})

// ── 7. data-slot 契约 ──
test('Radix 封装组件声明 data-slot', () => {
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

// ── 8. 主题完整性 ──
test('四套主题必需 token 完整', () => {
  const required = ['--pi-bg','--pi-text','--pi-dim','--pi-dim2','--pi-accent','--pi-border','--pi-border-soft','--pi-bg1','--pi-bg2','--pi-bg3','--pi-bg4']
  const { themes } = emitCss()
  const failures = []
  for (const sel of ['ink','violet','mist']) {
    const block = themes.split(`[data-theme="${sel}"]`)[1]?.split('}')[0] || ''
    for (const v of required) if (!block.includes(v + ':')) failures.push(`${sel}: 缺 ${v}`)
  }
  assert.deepEqual(failures, [], failures.join('\n'))
})

// ── 9. 禁止 setTimeout 假加载器 ──
test('禁止 setTimeout 假加载器', () => {
  const offenders = []
  for (const p of walkTs(join(ROOT, 'src'))) {
    if (!p.endsWith('.tsx')) continue
    const src = readFileSync(p, 'utf8')
    const lines = src.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (/setTimeout.*set\w+\s*\(\s*(true|false)/.test(lines[i]) && !/animationDelay|delay/.test(lines[i])) {
        offenders.push(`${p.replace(ROOT, '')}:${i + 1}`)
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'))
})

// ── 10. 禁止 transition-all ──
test('禁止 transition-all', () => {
  const offenders = []
  for (const p of walkTs(join(ROOT, 'src'))) {
    if (!p.endsWith('.tsx')) continue
    const src = readFileSync(p, 'utf8')
    const lines = src.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (/transition-all/.test(lines[i])) offenders.push(`${p.replace(ROOT, '')}:${i + 1}`)
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'))
})

// ── 11. 禁止内联 style 硬编码主题色 ──
// 颜色必须走 var(--pi-*) token 或 color-mix 语义派生；把主题色写死成 hex = 换主题时不跟随（Anti-slop 抓的退化）
// 中性遮罩（黑/白 rgba）豁免；hex 代表明确是主题色硬编码。
test('禁止内联 style 硬编码 hex 色值（改用 var(--pi-*)/color-mix）', () => {
  const offenders = []
  for (const p of walkTs(join(ROOT, 'src'))) {
    if (!p.endsWith('.tsx')) continue
    const src = readFileSync(p, 'utf8')
    for (const m of src.matchAll(/style=\{\{([\s\S]*?)\}\}/g)) {
      const hit = m[1].match(/#[0-9a-fA-F]{3,8}\b/)
      if (hit) {
        const lineNo = src.slice(0, m.index).split('\n').length
        offenders.push(`${p.replace(ROOT, '')}:${lineNo} (#${hit[0]})`)
      }
    }
  }
  assert.deepEqual(offenders, [], '内联 style 硬编码 hex（改用 var(--pi-*)/color-mix）：\n' + offenders.join('\n'))
})

// ── 12. 工具卡 5 态归一（AionUi 路线，防改回 2 态 running 布尔）──
test('工具卡为非 2 态：含 ToolStatus 归属 + canceled 分支', () => {
  const src = readFileSync(join(ROOT, 'src/components/Message.tsx'), 'utf8')
  const req = ['ToolStatus', "'canceled'", 'Square', '已停止']
  const missing = req.filter(s => !src.includes(s))
  assert.deepEqual(missing, [], '工具卡 5 态缺失（被改回 2 态？）: ' + missing.join(', '))
})
