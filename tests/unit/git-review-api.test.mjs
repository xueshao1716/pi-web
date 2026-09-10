import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { createMiscApi } from '../../engine/misc-api.mjs'

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
}

function fixture(cwd, gitRunner = null) {
  let response
  const api = createMiscApi({
    json: (_res, status, body) => { response = { status, body } },
    readJsonFile: () => ({}), writeJsonFile: () => true,
    getAgentDir: () => cwd, authPath: '', modelsPath: '',
    openSession: async () => null, ensureAgent: async () => {}, getDefaultModel: () => null,
    refreshModelList: async () => {}, scanSessionFiles: () => [], extractText: () => '', parseSessionFile: () => ({}),
    cwd, scanExclude: /(^|[\\/])node_modules([\\/]|$)/i,
    ...(gitRunner ? { gitRunner } : {}),
  })
  return { api, response: () => response }
}

test('git review returns branch, per-file counts, bounded diff, and truthful verification state', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'piweb-git-review-'))
  try {
    git(cwd, ['init', '-b', 'main'])
    git(cwd, ['config', 'user.email', 'test@example.com'])
    git(cwd, ['config', 'user.name', 'Test'])
    fs.writeFileSync(path.join(cwd, 'README.md'), 'before\n')
    git(cwd, ['add', 'README.md'])
    git(cwd, ['commit', '-m', 'initial'])
    fs.writeFileSync(path.join(cwd, 'README.md'), 'before\nafter\n')
    fs.writeFileSync(path.join(cwd, 'new.txt'), 'untracked\n')

    const fx = fixture(cwd)
    await fx.api.handleGitReview({})
    const result = fx.response()
    assert.equal(result.status, 200)
    assert.equal(result.body.isRepo, true)
    assert.equal(result.body.branch, 'main')
    assert.equal(result.body.files.some(file => file.path === 'README.md' && file.additions === 1 && file.deletions === 0), true)
    assert.equal(result.body.files.some(file => file.path === 'new.txt' && file.status === 'untracked'), true)
    assert.match(result.body.diff, /\+after/)
    assert.deepEqual(result.body.verification, { state: 'unknown', checks: [] })
    assert.equal(typeof result.body.diffTruncated, 'boolean')
  } finally { fs.rmSync(cwd, { recursive: true, force: true }) }
})

test('git review reports a non-repository without pretending verification ran', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'piweb-git-review-empty-'))
  try {
    const fx = fixture(cwd)
    await fx.api.handleGitReview({})
    assert.deepEqual(fx.response().body, {
      isRepo: false, branch: null, files: [], diff: '', diffTruncated: false,
      verification: { state: 'unknown', checks: [] },
    })
  } finally { fs.rmSync(cwd, { recursive: true, force: true }) }
})

test('git review reports oversized command output instead of inventing a changed file', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'piweb-git-review-large-'))
  try {
    const fx = fixture(cwd, async args => args[0] === 'status'
      ? { ok: false, isRepo: true, output: '', error: 'output_too_large' }
      : { ok: true, isRepo: true, output: '' })
    await fx.api.handleGitReview({})
    assert.deepEqual(fx.response().body, {
      isRepo: true, branch: null, files: [], diff: '', diffTruncated: false,
      error: 'output_too_large', verification: { state: 'unknown', checks: [] },
    })
  } finally { fs.rmSync(cwd, { recursive: true, force: true }) }
})
