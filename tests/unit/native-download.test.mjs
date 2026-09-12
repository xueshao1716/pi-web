import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

async function saver() {
  const module = await import('../../frontend/src/lib/native-download.ts').catch(() => ({}))
  assert.equal(typeof module.saveNativeDownload, 'function', 'Android downloads need a real file-saving bridge')
  return module.saveNativeDownload
}

function nativeFixture(status = 'saved') {
  const events = new EventTarget()
  const chunks = []
  const calls = []
  const bridge = {
    begin(id, name, mime, size) { calls.push(['begin', id, name, mime, size]); return '' },
    append(id, base64) { chunks.push(Buffer.from(base64, 'base64')); return '' },
    finish(id) {
      calls.push(['finish', id])
      queueMicrotask(() => events.dispatchEvent(new CustomEvent('yuanshu-download-result', {
        detail: { id, status, uri: 'content://documents/example', location: '系统所选位置', error: status === 'failed' ? '空间不足' : '' },
      })))
      return ''
    },
    cancel(id) { calls.push(['cancel', id]) },
  }
  return { bridge, events, calls, chunks }
}

test('Android saving transfers exact bytes in bounded chunks and waits for native save result', async () => {
  const save = await saver()
  const fixture = nativeFixture()
  const data = Buffer.alloc(310000)
  for (let i = 0; i < data.length; i++) data[i] = i % 251
  const result = await save(new Blob([data], { type: 'application/test' }), '宣传.pptx', fixture.bridge, fixture.events)
  assert.deepEqual(Buffer.concat(fixture.chunks), data)
  assert.ok(fixture.chunks.length > 1)
  assert.ok(fixture.chunks.every(chunk => chunk.length <= 65536))
  assert.equal(result.savedUri, 'content://documents/example')
  assert.equal(result.location, '系统所选位置')
  assert.equal(fixture.calls[0][2], '宣传.pptx')
})

test('cancelled or failed Android saves reject instead of recording a completed download', async () => {
  const save = await saver()
  for (const [status, message] of [['cancelled', '已取消保存'], ['failed', '空间不足']]) {
    const fixture = nativeFixture(status)
    await assert.rejects(save(new Blob(['test']), 'file.txt', fixture.bridge, fixture.events), { message })
  }
})

test('native transfer failure cleans up the partial file and does not show a save dialog', async () => {
  const save = await saver()
  const fixture = nativeFixture()
  fixture.bridge.append = () => '存储空间不足'
  await assert.rejects(save(new Blob(['test']), 'file.txt', fixture.bridge, fixture.events), { message: '存储空间不足' })
  assert.equal(fixture.calls.some(call => call[0] === 'finish'), false)
  assert.equal(fixture.calls.filter(call => call[0] === 'cancel').length, 1)
})

test('browser without an Android bridge keeps its normal download flow', async () => {
  const save = await saver()
  assert.equal(await save(new Blob(['test']), 'file.txt', null, new EventTarget()), null)
})

test('page navigation cancels an unfinished transfer so later downloads are not blocked', async () => {
  const save = await saver()
  const fixture = nativeFixture()
  let resume
  const blob = { size: 4, type: 'text/plain', slice: () => ({ arrayBuffer: () => new Promise(resolve => { resume = resolve }) }) }
  const pending = save(blob, 'file.txt', fixture.bridge, fixture.events)
  fixture.events.dispatchEvent(new Event('pagehide'))
  resume(new Uint8Array([1, 2, 3, 4]).buffer)
  await assert.rejects(pending, /保存已中断/)
  assert.equal(fixture.calls.filter(call => call[0] === 'cancel').length, 1)
  assert.equal(fixture.calls.some(call => call[0] === 'finish'), false)
})

test('Android shell registers document saving and common download API awaits it before recording', () => {
  const main = readFileSync(new URL('../../app/src-tauri/gen/android/app/src/main/java/com/yuanshu/app/MainActivity.kt', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../../frontend/src/api.ts', import.meta.url), 'utf8')
  assert.ok(main.includes('YuanshuDownloads'), 'the WebView must expose native saving')
  const saveIndex = api.indexOf('await saveNativeDownload(')
  assert.ok(saveIndex >= 0 && saveIndex < api.indexOf('rememberDownload({'), 'save confirmation must precede the history entry')
})
