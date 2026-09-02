import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const read = (...parts) => readFile(path.join(ROOT, ...parts), 'utf8')

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-web-hardening-'))
  try { return await fn(dir) } finally { await fs.rm(dir, { recursive: true, force: true }) }
}

test('frontend sync mirrors source and removes stale target assets', async () => {
  const { syncFrontend } = await import('../../scripts/sync-frontend.mjs')
  await withTempDir(async dir => {
    const source = path.join(dir, 'source')
    const publicTarget = path.join(dir, 'public')
    const appTarget = path.join(dir, 'app-dist')
    await fs.mkdir(path.join(source, 'assets'), { recursive: true })
    await fs.mkdir(publicTarget, { recursive: true })
    await fs.mkdir(appTarget, { recursive: true })
    await fs.writeFile(path.join(source, 'index.html'), '<script src="/assets/new.js"></script>')
    await fs.writeFile(path.join(source, 'assets', 'new.js'), 'new')
    await fs.writeFile(path.join(publicTarget, 'index.html'), 'old')
    await fs.writeFile(path.join(publicTarget, 'old.js'), 'old')
    await fs.writeFile(path.join(appTarget, 'index.html'), 'old')
    await syncFrontend({ sourceDir: source, targets: [publicTarget, appTarget] })
    assert.equal(await fs.readFile(path.join(publicTarget, 'index.html'), 'utf8'), '<script src="/assets/new.js"></script>')
    assert.equal(await fs.readFile(path.join(appTarget, 'assets', 'new.js'), 'utf8'), 'new')
    await assert.rejects(() => fs.access(path.join(publicTarget, 'old.js')))
  })
})

test('Capacitor uses the single React frontend distribution', async () => {
  const src = await read('capacitor.config.ts')
  assert.match(src, /webDir:\s*['"]frontend\/dist['"]/, 'Capacitor must consume frontend/dist')
})

test('endpoint resolution uses the configured remote API base', async () => {
  const api = await read('frontend', 'src', 'api.ts')
  const sessionDb = await read('frontend', 'src', 'pages', 'SessionDb.tsx')
  const tui = await read('frontend', 'src', 'components', 'TuiTerminal.tsx')
  assert.match(api, /export function getApiBase\(/)
  assert.match(api, /export function apiUrl\(/)
  assert.match(api, /export function webSocketUrl\(/)
  assert.match(api, /fetch\(apiUrl\(path\)/)
  assert.doesNotMatch(sessionDb, /fetch\(['"]\/api\/sessions\/db/)
  assert.match(sessionDb, /import \{ api, SessionsApi \} from ['"]\.\.\/api['"]/) 
  assert.match(tui, /webSocketUrl\(/)
  assert.doesNotMatch(tui, /location\.host\/ws\/tui/)
})
