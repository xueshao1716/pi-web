import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('review workbench is wired as a route and exposes safe review states', () => {
  const page = read('frontend/src/pages/ReviewWorkbench.tsx')
  const api = read('frontend/src/api.ts')
  const layout = read('frontend/src/AppLayout.tsx')
  assert.match(api, /GitReviewApi\s*=\s*\{/) 
  assert.match(api, /\/api\/git\/review/)
  assert.match(layout, /ReviewWorkbench/)
  assert.match(page, /改动与验收/)
  assert.match(page, /verification\.state/)
  assert.match(page, /diffTruncated/)
  assert.match(page, /review\?\.error/)
  assert.match(page, /diffForFile|selectedDiff/)
  assert.match(page, /已阅|确认已看|acknowledge/i)
  assert.match(page, /useState/)
  assert.match(page, /AIBodyApi/)
  assert.match(page, /SubagentApi\.history/)
  assert.match(page, /review-evidence-grid/)
  assert.match(page, /review-mission-card/)
  assert.match(page, /未跟踪文件会按用途折叠/)
  assert.match(api, /\/api\/aibody/)
  assert.match(api, /\/api\/subagent\/history/)
  assert.doesNotMatch(page, /method:\s*['"]POST['"]|\/api\/git\/(reset|stage|commit)/)
})
