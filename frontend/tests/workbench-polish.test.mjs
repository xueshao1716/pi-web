import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SEEDS, generateTheme, contrast, wcagLum } from '../src/theme/generate.mjs'
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('mist has a neutral near-white canvas and restrained surface ladder', () => {
  const v = generateTheme(SEEDS.mist)
  assert.ok(wcagLum(v['--pi-bg']) > .95)
  const c = v['--pi-bg'].slice(1).match(/../g).map(x => parseInt(x, 16))
  assert.ok(Math.max(...c) - Math.min(...c) <= 2)
  assert.ok(wcagLum(v['--pi-bg2']) > .85)
})
test('primary actions have readable foreground for custom accents', () => {
  for (const seed of Object.values(SEEDS)) for (const accent of [seed.accent, '#61a8c0', '#fafafa', '#000000', '#ffcc00']) {
    const v = generateTheme({ ...seed, accent })
    assert.ok(v['--pi-on-accent'], 'primary foreground token is required')
    assert.ok(contrast(v['--pi-on-accent'], accent) >= 4.5, accent)
  }
  const line = read('uno.config.ts').split('\n').find(x => x.includes("'btn-primary':"))
  assert.ok(line.includes('bg-pi-accent') && line.includes('text-pi-on-accent'))
  assert.ok(!line.includes('btn-grad'))
})
test('utility tabs have one stable header and keyboard navigation', () => {
  const source = read('src/components/UtilityPanel.tsx')
  assert.ok(!source.includes('utility-panel-kicker') && !source.includes('utility-panel-description'))
  for (const s of ['aria-label={tab.label}', 'tabIndex={active === tab.key ? 0 : -1}', 'ArrowRight', 'ArrowLeft', 'Home', 'End']) assert.ok(source.includes(s), s)
})
test('workspace has full-width browser and preview with visible states', () => {
  const source = read('src/components/Workspace.tsx')
  assert.ok(!source.includes('w-60'))
  for (const s of ['workspace-browser', 'workspace-preview', '返回文件列表', 'role="alert"', '正在加载', '没有匹配的文件']) assert.ok(source.includes(s), s)
})
test('session selection is a button and actions use one menu', () => {
  const source = read('src/components/Sidebar.tsx')
  assert.ok(source.includes('className="session-select'))
  assert.ok(source.includes('aria-current={s.id === currentSessionId'))
  assert.ok(source.includes('<DropdownMenu.Trigger'))
  assert.ok(!source.includes('charAt(0)'))
})
test('overview avoids duplicate promotional headings', () => {
  assert.ok(!read('src/pages/Engine.tsx').includes('engine-eyebrow'))
  assert.ok(!read('src/pages/Assets.tsx').includes('engine-eyebrow'))
})
test('file preview receives focus and directory navigation invalidates older file reads', () => {
  const source = read('src/components/Workspace.tsx')
  assert.ok(source.includes('previewBackRef.current?.focus()'))
  const load = source.slice(source.indexOf('const loadTree'), source.indexOf('}, [])', source.indexOf('const loadTree')))
  assert.ok(load.includes('requestRef.current.file++'))
})
test('material theme primary buttons use the same accent as foreground contrast calculation', () => {
  const css = read('src/styles.css')
  for (const theme of ['wood', 'kraft']) {
    const block = css.split(`[data-theme="${theme}"] .btn-primary {`)[1]?.split('}')[0]
    assert.ok(block?.includes('background: var(--pi-accent)'))
  }
})
