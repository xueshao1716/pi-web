import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { atomicWriteJson } from './atomic-io.mjs'

const ACTIVE_STATUSES = new Set(['queued', 'running', 'stopping'])

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_')
}

function persistedInput(input) {
  return {
    messagePreview: String(input.message || '').slice(0, 500),
    model: input.model || null,
    attachments: Array.isArray(input.files)
      ? input.files.map(file => ({ path: String(file?.path || '') })).filter(file => file.path)
      : [],
  }
}

export function createRunStore({ rootDir, now = () => new Date().toISOString(), idFactory = randomUUID }) {
  const runsDir = path.join(rootDir, 'runs')
  fs.mkdirSync(runsDir, { recursive: true })

  const fileFor = id => path.join(runsDir, `${safeId(id)}.json`)
  const get = id => {
    try { return JSON.parse(fs.readFileSync(fileFor(id), 'utf8')) }
    catch { return null }
  }
  const list = () => fs.readdirSync(runsDir)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      try { return JSON.parse(fs.readFileSync(path.join(runsDir, name), 'utf8')) }
      catch { return null }
    })
    .filter(Boolean)

  const update = (id, patch) => {
    const current = get(id)
    if (!current) throw new Error(`run_not_found:${id}`)
    const updated = { ...current, ...patch, id: current.id, updatedAt: now() }
    atomicWriteJson(fileFor(id), updated)
    return updated
  }

  return {
    create(input) {
      if (!input?.sessionId) throw new Error('sessionId_required')
      if (!input?.clientRequestId) throw new Error('clientRequestId_required')
      const existing = list().find(run => (
        run.sessionId === input.sessionId && run.clientRequestId === input.clientRequestId
      ))
      if (existing) return existing

      const createdAt = now()
      const run = {
        v: 1,
        id: idFactory(),
        sessionId: input.sessionId,
        clientRequestId: input.clientRequestId,
        ownerId: input.ownerId || null,
        status: 'queued',
        input: persistedInput(input),
        createdAt,
        updatedAt: createdAt,
      }
      atomicWriteJson(fileFor(run.id), run)
      return run
    },
    get,
    update,
    list,
    findActiveBySession(sessionId) {
      return list().find(run => run.sessionId === sessionId && ACTIVE_STATUSES.has(run.status)) || null
    },
    markOrphanedInterrupted(currentOwnerId) {
      const orphaned = list().filter(run => (
        ACTIVE_STATUSES.has(run.status) && run.ownerId !== currentOwnerId
      ))
      return orphaned.map(run => update(run.id, {
        status: 'interrupted',
        interruptedAt: now(),
        error: 'server_restarted',
      }))
    },
  }
}
