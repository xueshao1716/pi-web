import test from 'node:test'
import assert from 'node:assert/strict'

test('download history preserves a started external download for the download center', async () => {
  const { rememberDownload, readDownloadHistory } = await import('../src/lib/downloads.ts')
  const data = new Map()
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  }
  rememberDownload({
    name: '采访视频.mp4',
    url: 'https://platform-outputs.agnes-ai.space/videos/demo.mp4',
    size: 0,
    createdAt: '2026-09-13T09:00:00.000Z',
    status: 'started',
  }, storage)
  const [record] = readDownloadHistory(storage)
  assert.equal(record.status, 'started')
})
