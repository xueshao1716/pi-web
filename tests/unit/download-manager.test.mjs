import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readDownloadHistory, rememberDownload, removeDownload, clearDownloadHistory } from '../../frontend/src/lib/downloads.ts'

function storage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }
}

test('download history stores newest records first and ignores malformed storage', () => {
  const store = storage()
  assert.deepEqual(readDownloadHistory(store), [])
  rememberDownload({ name: '旧文件.txt', url: '/api/old', size: 2, sourcePath: '旧文件.txt', createdAt: '2026-09-11T10:00:00.000Z' }, store)
  rememberDownload({ name: '新文件.pptx', url: '/api/new', size: 4, sourcePath: '新文件.pptx', createdAt: '2026-09-11T11:00:00.000Z' }, store)
  assert.deepEqual(readDownloadHistory(store).map(item => item.name), ['新文件.pptx', '旧文件.txt'])
  store.setItem('yuanshu_download_history_v1', '{bad json')
  assert.deepEqual(readDownloadHistory(store), [])
})

test('download history can remove one item or clear all items', () => {
  const store = storage()
  const first = rememberDownload({ name: 'a.png', url: '/api/a', size: 1, createdAt: '2026-09-11T10:00:00.000Z' }, store)
  rememberDownload({ name: 'b.png', url: '/api/b', size: 2, createdAt: '2026-09-11T11:00:00.000Z' }, store)
  assert.equal(removeDownload(first.id, store), true)
  assert.deepEqual(readDownloadHistory(store).map(item => item.name), ['b.png'])
  clearDownloadHistory(store)
  assert.deepEqual(readDownloadHistory(store), [])
})
