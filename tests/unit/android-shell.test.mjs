import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mobileApiBaseError, isBundledShellOrigin } from '../../frontend/src/lib/shell-origin.ts'
import { createCorsPolicy } from '../../engine/cors-policy.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8')

test('Tauri Android WebView 的 https://tauri.localhost 必须在 CORS 白名单', () => {
  const policy = createCorsPolicy('')
  assert.equal(policy.allowedOrigin('https://tauri.localhost'), 'https://tauri.localhost')
})

test('内置壳不能把 127.0.0.1 当服务器，否则会话打到手机自己', () => {
  assert.equal(isBundledShellOrigin('https://tauri.localhost'), true)
  assert.ok(mobileApiBaseError('', 'https://tauri.localhost'))
  assert.ok(mobileApiBaseError('http://127.0.0.1:8787', 'https://tauri.localhost'))
  assert.equal(mobileApiBaseError('https://pi.myxinyu.xin', 'https://tauri.localhost'), '')
  assert.equal(mobileApiBaseError('', 'http://127.0.0.1:8787'), '')
})

test('登录页在手机壳上必须要求填写远程地址', () => {
  const login = read('frontend', 'src', 'components', 'Login.tsx')
  assert.ok(login.includes('mobileApiBaseError'), '登录必须校验手机壳的服务器地址')
  assert.ok(login.includes('pi.myxinyu.xin'), '占位符要给出公网入口示例')
  const store = read('frontend', 'src', 'store.tsx')
  assert.ok(store.includes('mobileApiBaseError'), '有令牌但没有可用服务器时不得进主界面')
  assert.ok(store.includes('pi_api_base'), '退出登录必须清掉服务器地址，避免幽灵空会话')
})

test('Android 正式包允许明文 HTTP，才能连电脑局域网 8787', () => {
  const gradle = read('app', 'src-tauri', 'gen', 'android', 'app', 'build.gradle.kts')
  const defaultBlock = gradle.slice(gradle.indexOf('defaultConfig'), gradle.indexOf('buildTypes'))
  assert.match(defaultBlock, /usesCleartextTraffic"\]\s*=\s*"true"/, 'release 默认也必须放行 HTTP')
})

test('Android 首屏必须打开公网工作台，禁止探活 http://tauri.localhost', () => {
  const src = read('app', 'src-tauri', 'src', 'lib.rs')
  const mobile = src.slice(src.indexOf('#[cfg(mobile)]'))
  assert.match(mobile, /https:\/\/pi\.myxinyu\.xin\//)
  assert.match(mobile, /WebviewUrl::External/)
  assert.doesNotMatch(mobile, /WebviewUrl::App/, 'App 协议会变成 http://tauri.localhost，荣耀上 reqwest 探活必失败')
})

test('元枢壳版本号必须高于 0.1.0，覆盖安装才会换原生代码', () => {
  const conf = JSON.parse(read('app', 'src-tauri', 'tauri.conf.json'))
  const cargo = read('app', 'src-tauri', 'Cargo.toml')
  assert.equal(conf.version, '0.2.1')
  assert.match(cargo, /^version = "0\.2\.1"/m)
})
