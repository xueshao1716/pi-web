import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { collectSubagentHistory } from '../../engine/stats-api.mjs'

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

test('collectSubagentHistory aggregates mission runs and safe review evidence', () => {
  const root = tempDir('piweb-subagent-history-')
  try {
    const missions = path.join(root, 'missions')
    const artifacts = path.join(root, 'artifacts')
    fs.mkdirSync(missions, { recursive: true })
    fs.mkdirSync(artifacts, { recursive: true })
    fs.writeFileSync(path.join(artifacts, 'run-1_reviewer_meta.json'), JSON.stringify({
      runId: 'run-1', agent: 'reviewer', model: 'api-top/gpt-5.6-sol:high',
      durationMs: 1200, toolCount: 4,
      acceptance: { status: 'attested' },
      childReport: { reviewFindings: ['Important: fix the flow'], residualRisks: ['Needs browser check'] },
    }))
    fs.writeFileSync(path.join(missions, 'mission.json'), JSON.stringify({
      id: 'mission-1', title: 'UI 审查', objective: '检查界面', status: 'completed',
      createdAt: '2026-09-10T10:00:00.000Z', updatedAt: '2026-09-10T10:01:00.000Z', cwd: 'D:/pi-web',
      runs: [{ runId: 'run-1', agent: 'reviewer', status: 'completed', startedAt: '2026-09-10T10:00:10.000Z', completedAt: '2026-09-10T10:01:00.000Z' }],
      artifacts: [{ kind: 'output', path: path.join(artifacts, 'run-1_reviewer_meta.json'), description: 'review metadata' }],
      summary: '已完成审查', acceptance: { status: 'attested' },
    }))

    const result = collectSubagentHistory({ missionRoots: [missions], artifactRoots: [artifacts], asyncRoots: [] })
    assert.equal(result.missions.length, 1)
    assert.equal(result.missions[0].runs[0].runId, 'run-1')
    assert.equal(result.missions[0].runs[0].toolCount, 4)
    assert.deepEqual(result.missions[0].runs[0].reviewFindings, ['Important: fix the flow'])
    assert.deepEqual(result.missions[0].runs[0].residualRisks, ['Needs browser check'])
    assert.equal(result.missions[0].artifacts[0].name, 'run-1_reviewer_meta.json')
    assert.equal(result.missions[0].artifacts[0].path.includes('D:'), false)
    assert.equal(result.missions[0].cwd, '…/pi-web')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('collectSubagentHistory exposes async run state, failure reason and event summary', () => {
  const root = tempDir('piweb-subagent-async-')
  try {
    const run = path.join(root, 'call-1')
    fs.mkdirSync(run, { recursive: true })
    fs.writeFileSync(path.join(run, 'status.json'), JSON.stringify({
      runId: 'call-1', mode: 'workflow', state: 'failed', agent: 'worker',
      startedAt: 1789000000000, lastUpdate: 1789000002500,
      cwd: 'C:/Users/test', error: '403 insufficient balance',
      steps: [{ agent: 'worker', label: 'implement', status: 'failed' }],
    }))
    fs.writeFileSync(path.join(run, 'events.jsonl'), '{"type":"started"}\n{"type":"failed"}\n')

    const result = collectSubagentHistory({ missionRoots: [], artifactRoots: [], asyncRoots: [root] })
    assert.equal(result.runs.length, 1)
    assert.equal(result.runs[0].source, 'async')
    assert.equal(result.runs[0].state, 'failed')
    assert.equal(result.runs[0].error, '403 insufficient balance')
    assert.equal(result.runs[0].eventCount, 2)
    assert.equal(result.runs[0].startedAt, new Date(1789000000000).toISOString())
    assert.equal(result.runs[0].cwd, undefined)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('collectSubagentHistory sanitizes sensitive metadata before returning it', () => {
  const root = tempDir('piweb-subagent-sensitive-')
  try {
    const run = path.join(root, 'call-sensitive')
    fs.mkdirSync(run, { recursive: true })
    fs.writeFileSync(path.join(run, 'status.json'), JSON.stringify({
      runId: 'call-sensitive', state: 'failed', agent: 'worker',
      task: 'inspect api-key=topsecret', error: 'Bearer token-secret-value',
      childReport: { reviewFindings: ['sk-abcdefghijklmnop'] },
    }))

    const result = collectSubagentHistory({ missionRoots: [], artifactRoots: [], asyncRoots: [root] })
    const serialized = JSON.stringify(result)
    assert.doesNotMatch(serialized, /topsecret|token-secret-value|sk-abcdefghijklmnop/)
    assert.match(serialized, /已脱敏/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('collectSubagentHistory keeps separate runs when source records omit runId', () => {
  const root = tempDir('piweb-subagent-missing-id-')
  try {
    const missions = path.join(root, 'missions')
    fs.mkdirSync(missions, { recursive: true })
    fs.writeFileSync(path.join(missions, 'mission.json'), JSON.stringify({
      id: 'mission-missing-id', title: '边界记录', status: 'completed',
      runs: [{ agent: 'one', status: 'completed' }, { agent: 'two', status: 'failed' }],
    }))
    const result = collectSubagentHistory({ missionRoots: [missions], artifactRoots: [], asyncRoots: [] })
    assert.equal(result.missions[0].runs.length, 2)
    assert.notEqual(result.missions[0].runs[0].runId, result.missions[0].runs[1].runId)

    const asyncRoot = path.join(root, 'async')
    for (const id of ['call-one', 'call-two']) {
      const dir = path.join(asyncRoot, id)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ state: 'completed', agent: id }))
    }
    const asyncResult = collectSubagentHistory({ missionRoots: [], artifactRoots: [], asyncRoots: [asyncRoot] })
    assert.equal(asyncResult.runs.length, 2)
    assert.notEqual(asyncResult.runs[0].runId, asyncResult.runs[1].runId)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('collectSubagentHistory tolerates missing roots and keeps newest records first', () => {
  const result = collectSubagentHistory({ missionRoots: ['Z:/missing'], artifactRoots: ['Z:/missing'], asyncRoots: ['Z:/missing'] })
  assert.deepEqual(result.missions, [])
  assert.deepEqual(result.runs, [])
  assert.equal(typeof result.updatedAt, 'string')
})

test('collectSubagentHistory ignores blank roots instead of treating cwd as a source', () => {
  const result = collectSubagentHistory({ missionRoots: [''], artifactRoots: [''], asyncRoots: [''] })
  assert.deepEqual(result.missions, [])
  assert.deepEqual(result.runs, [])
})
