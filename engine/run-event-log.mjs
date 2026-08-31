import fs from 'node:fs'
import path from 'node:path'

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_')
}

function readValidLines(file) {
  let raw
  try { raw = fs.readFileSync(file, 'utf8') }
  catch { return [] }
  return raw.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line) }
    catch { return null }
  }).filter(Boolean)
}

export function createRunEventLog({ rootDir, now = () => new Date().toISOString() }) {
  const eventsDir = path.join(rootDir, 'events')
  const subscribers = new Map()
  let closed = false
  fs.mkdirSync(eventsDir, { recursive: true })

  const fileFor = runId => path.join(eventsDir, `${safeId(runId)}.jsonl`)
  const getLastSeq = runId => readValidLines(fileFor(runId)).reduce(
    (last, event) => Number.isInteger(event.seq) && event.seq > last ? event.seq : last,
    0,
  )

  function repairIncompleteTail(file) {
    let raw
    try { raw = fs.readFileSync(file, 'utf8') }
    catch { return }
    if (!raw || raw.endsWith('\n')) return
    const lastNewline = raw.lastIndexOf('\n')
    const tail = raw.slice(lastNewline + 1)
    try {
      JSON.parse(tail)
      fs.appendFileSync(file, '\n', 'utf8')
    } catch {
      fs.truncateSync(file, lastNewline < 0 ? 0 : Buffer.byteLength(raw.slice(0, lastNewline + 1), 'utf8'))
    }
  }

  return {
    append({ runId, sessionId, type, data }) {
      if (closed) throw new Error('run_event_log_closed')
      if (!runId || !sessionId || !type) throw new Error('invalid_run_event')
      const file = fileFor(runId)
      repairIncompleteTail(file)
      const event = {
        v: 1,
        runId,
        sessionId,
        seq: getLastSeq(runId) + 1,
        type,
        ts: now(),
        data: data ?? {},
      }
      fs.appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8')
      for (const listener of subscribers.get(runId) || []) listener(event)
      return event
    },
    readAfter(runId, after = 0) {
      return readValidLines(fileFor(runId)).filter(event => event.seq > after)
    },
    getLastSeq,
    subscribe(runId, listener) {
      if (closed) throw new Error('run_event_log_closed')
      const listeners = subscribers.get(runId) || new Set()
      listeners.add(listener)
      subscribers.set(runId, listeners)
      return () => {
        listeners.delete(listener)
        if (!listeners.size) subscribers.delete(runId)
      }
    },
    close() {
      closed = true
      subscribers.clear()
    },
  }
}
