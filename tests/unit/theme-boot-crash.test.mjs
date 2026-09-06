// P0：窄屏登录后欢迎页 HDR 外链把整棵 React 树打穿
// 契约：启动就套主题、缺 CSS 变量不当深色、装饰层不拉 HDR、对话有错误边界
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'frontend', 'src')
const read = (...parts) => readFileSync(join(SRC, ...parts), 'utf8')

test('启动时必须在首屏前套上主题，不依赖桌面 ThemeSwitcher', () => {
  const main = read('main.tsx')
  const apply = read('theme', 'apply.ts')
  assert.ok(apply.includes('export function bootTheme'), 'apply.ts 必须导出 bootTheme')
  assert.ok(main.includes('bootTheme'), 'main.tsx 必须在渲染前调用 bootTheme')
  assert.ok(apply.includes("localStorage.getItem('pi_theme')"), 'bootTheme 必须读本地主题')
})

test('缺 --pi-bg 时 GradientField 不得当成深色去拉 WebGL', () => {
  const src = read('components', 'GradientField.tsx')
  assert.ok(src.includes('if (full.length !== 6) return false'), '解析失败必须视为浅色，禁止默认深色')
  assert.ok(src.includes('getDerivedStateFromError'), '装饰层必须吞掉 WebGL/HDR 异常，不得打穿对话')
})

test('ShaderGradient 禁止 env HDR 外链', () => {
  const inner = read('components', 'ShaderGradientInner.tsx')
  assert.ok(!inner.includes('envPreset'), '禁止 envPreset（会拉 city.hdr）')
  assert.ok(!inner.includes('lightType="env"'), '禁止 lightType=env')
})

test('移动端和桌面端对话都包在 PageErrorBoundary 里', () => {
  const layout = read('AppLayout.tsx')
  assert.equal([...layout.matchAll(/<ChatArea/g)].length, 2, '移动+桌面各一处 ChatArea')
  assert.ok(layout.includes('<PageErrorBoundary page="对话">'), '对话必须有错误边界')
  const afterBoundary = layout.split('<PageErrorBoundary page="对话">')
  assert.ok(afterBoundary.length >= 3, '移动端和桌面端都必须各自包一层对话错误边界')
  for (const chunk of afterBoundary.slice(1)) {
    const beforeClose = chunk.split('</PageErrorBoundary>')[0]
    assert.ok(beforeClose.includes('<ChatArea'), '错误边界内必须是 ChatArea')
  }
})

test('未挂 data-theme 时原生控件跟浅色默认（晨雾），避免 FOUC 深色底', () => {
  const css = read('styles.css')
  assert.ok(css.includes('html { color-scheme: light; }'), '默认 color-scheme 必须是 light（产品默认晨雾）')
})
