import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assetKindForName,
  filterAssets,
  mergeAssets,
  normalizeArtifacts,
  normalizeDeliveries,
  projectForPath,
  sortAssets,
} from '../../frontend/src/lib/assets.ts'

const artifact = (overrides = {}) => ({
  name: 'cover.png',
  type: 'png',
  date: '2026-09-02T10:00:00.000Z',
  path: '工程/元枢安卓App/交付/cover.png',
  size: 1200,
  url: '/api/ws/file?path=cover.png',
  ...overrides,
})

const delivery = (overrides = {}) => ({
  name: 'release.mp4',
  type: 'file',
  size: 2400,
  url: '/api/ws/file?path=release.mp4',
  wsPath: '交付/元枢安卓App/release.mp4',
  ...overrides,
})

test('assetKindForName maps common media, text, binary documents, and unknown extensions', () => {
  assert.equal(assetKindForName('photo.JPG'), 'image')
  assert.equal(assetKindForName('clip.webm'), 'video')
  assert.equal(assetKindForName('voice.m4a'), 'audio')
  assert.equal(assetKindForName('notes.md'), 'text')
  assert.equal(assetKindForName('data.JSON'), 'text')
  assert.equal(assetKindForName('report.pdf'), 'other')
  assert.equal(assetKindForName('report.docx'), 'other')
  assert.equal(assetKindForName('sheet.xlsx'), 'other')
  assert.equal(assetKindForName('slides.pptx'), 'other')
  assert.equal(assetKindForName('archive.zip'), 'other')
})

test('projectForPath derives the first meaningful project segment', () => {
  assert.equal(projectForPath('工程/元枢安卓App/交付/cover.png'), '元枢安卓App')
  assert.equal(projectForPath('生成物/cover.png'), '未分类')
  assert.equal(projectForPath('cover.png'), '未分类')
  assert.equal(projectForPath('/工程/元枢安卓App/cover.png'), '元枢安卓App')
})

test('normalizers expose stable source/path IDs and directory safety metadata', () => {
  const [a] = normalizeArtifacts([artifact()])
  assert.equal(a.id, 'artifact:工程/元枢安卓App/交付/cover.png')
  assert.equal(a.kind, 'image')
  assert.equal(a.source, 'artifact')
  assert.equal(a.project, '元枢安卓App')
  assert.equal(a.mtimeMs, Date.parse('2026-09-02T10:00:00.000Z'))

  const [d] = normalizeDeliveries([delivery({ type: 'dir', name: 'release' })])
  assert.equal(d.id, 'delivery:交付/元枢安卓App/release.mp4')
  assert.equal(d.kind, 'other')
  assert.equal(d.isDirectory, true)
  assert.equal(d.project, '元枢安卓App')
})

test('mergeAssets de-duplicates the same source/path while retaining both sources otherwise', () => {
  const a = artifact({ path: '生成物/same.png' })
  const duplicateDelivery = delivery({ wsPath: '生成物/same.png', name: 'same.png' })
  const merged = mergeAssets([a], [duplicateDelivery])
  assert.equal(merged.length, 2, 'source is part of the stable ID, so distinct stores are retained')
  assert.equal(new Set(merged.map(item => item.id)).size, merged.length)

  const mergedDuplicateArtifact = mergeAssets([a, { ...a }], [])
  assert.equal(mergedDuplicateArtifact.length, 1)
})

test('filterAssets searches name and relative path and supports source/project/kind', () => {
  const items = mergeAssets(
    [artifact({ name: 'cover.png' }), artifact({ name: 'guide.md', path: '工程/元枢安卓App/文档/guide.md', type: 'md' })],
    [delivery()],
  )
  assert.deepEqual(filterAssets(items, { search: '安卓App/文档' }).map(item => item.name), ['guide.md'])
  assert.deepEqual(filterAssets(items, { kind: 'video' }).map(item => item.name), ['release.mp4'])
  assert.deepEqual(filterAssets(items, { source: 'artifact', project: '元枢安卓App' }).map(item => item.name), ['cover.png', 'guide.md'])
  assert.equal(filterAssets(items, {}).length, 3)
})

test('filterAssets applies deterministic today, 7-day, and 30-day ranges', () => {
  const now = Date.parse('2026-09-02T12:00:00.000Z')
  const items = [
    { ...normalizeArtifacts([artifact({ path: 'a.txt', name: 'a.txt', date: '2026-09-02T00:00:00.000Z' })])[0] },
    { ...normalizeArtifacts([artifact({ path: 'b.txt', name: 'b.txt', date: '2026-08-27T12:00:00.000Z' })])[0] },
    { ...normalizeArtifacts([artifact({ path: 'c.txt', name: 'c.txt', date: '2026-08-02T12:00:00.000Z' })])[0] },
    { ...normalizeArtifacts([artifact({ path: 'future.txt', name: 'future.txt', date: '2026-09-03T00:00:00.000Z' })])[0] },
  ]
  assert.deepEqual(filterAssets(items, { timeRange: 'today', now }).map(item => item.name), ['a.txt'])
  assert.deepEqual(filterAssets(items, { timeRange: '7d', now }).map(item => item.name), ['a.txt', 'b.txt'])
  assert.deepEqual(filterAssets(items, { timeRange: '30d', now }).map(item => item.name), ['a.txt', 'b.txt'])
})

test('delivery timestamps participate in normalization, filtering, and sorting', () => {
  const now = Date.parse('2026-09-02T12:00:00.000Z')
  const [recent, old] = normalizeDeliveries([
    delivery({ name: 'recent.mp4', mtimeMs: now - 60_000, date: new Date(now - 60_000).toISOString() }),
    delivery({ name: 'old.mp4', mtimeMs: now - 8 * 24 * 60 * 60 * 1000, date: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString() }),
  ])
  assert.equal(recent.mtimeMs, now - 60_000)
  assert.equal(recent.date, new Date(now - 60_000).toISOString())
  assert.deepEqual(filterAssets([recent, old], { timeRange: '7d', now }).map(item => item.name), ['recent.mp4'])
  assert.deepEqual(sortAssets([old, recent], 'newest').map(item => item.name), ['recent.mp4', 'old.mp4'])
})

test('sortAssets orders newest and oldest by mtimeMs without mutating input', () => {
  const items = normalizeArtifacts([
    artifact({ path: 'old.txt', name: 'old.txt', date: '2026-08-01T00:00:00.000Z' }),
    artifact({ path: 'new.txt', name: 'new.txt', date: '2026-09-02T00:00:00.000Z' }),
  ])
  const original = items.map(item => item.name)
  assert.deepEqual(sortAssets(items, 'newest').map(item => item.name), ['new.txt', 'old.txt'])
  assert.deepEqual(sortAssets(items, 'oldest').map(item => item.name), ['old.txt', 'new.txt'])
  assert.deepEqual(items.map(item => item.name), original)
})

test('directories always normalize as other and cannot be playable media', () => {
  const [item] = normalizeDeliveries([delivery({ name: 'movie.mp4', type: 'dir' })])
  assert.equal(item.kind, 'other')
  assert.equal(item.isDirectory, true)
})
