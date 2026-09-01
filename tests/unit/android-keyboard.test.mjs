// Tauri Android 键盘避让契约测试
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8')

 test('Tauri MainActivity 必须把真实 IME inset 注入当前 WebView', () => {
  const src = read('app', 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'java', 'com', 'yuanshu', 'app', 'MainActivity.kt')
  assert.match(src, /WindowInsetsCompat\.Type\.ime\(\)/, '必须读取 Android IME WindowInsets')
  assert.match(src, /ViewCompat\.setOnApplyWindowInsetsListener/, '必须监听 WebView 的 WindowInsets')
  assert.match(src, /evaluateJavascript/, '必须把 IME 状态通知给 WebView')
  assert.match(src, /yuanshu-ime/, '必须发送稳定的原生键盘事件名')
})

test('Tauri Manifest 必须保留 adjustResize', () => {
  const manifest = read('app', 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'AndroidManifest.xml')
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/)
})

test('前端必须消费原生 IME 高度且不与 visualViewport 双重缩短', () => {
  const viewport = read('frontend', 'src', 'lib', 'viewport.ts')
  const css = read('frontend', 'src', 'styles.css')
  assert.match(viewport, /yuanshu-ime/, '前端必须监听 Tauri 原生 IME 事件')
  assert.match(viewport, /pi-native-keyboard-inset/, '前端必须保存原生键盘高度')
  assert.match(viewport, /visualInset|visualViewport/, '必须保留浏览器 visualViewport 兼容路径')
  assert.match(css, /pi-native-keyboard-inset/, '移动根布局必须使用原生键盘高度兜底')
})
