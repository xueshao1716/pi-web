import { EventEmitter } from 'node:events'

const TERMINAL = new Set(['completed', 'failed', 'stopped', 'interrupted'])

function createSseParser(onEvent) {
  let buffer = ''
  const consume = block => {
    if (!block || block.startsWith(':')) return
    let type = 'message'
    const dataLines = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) type = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
    if (!dataLines.length) return
    const raw = dataLines.join('\n')
    let data = raw
    try { data = JSON.parse(raw) } catch {}
    onEvent(type, data)
  }
  return {
    push(chunk) {
      buffer += String(chunk)
      let boundary
      while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const match = buffer.slice(boundary).match(/^(?:\r?\n){2}/)?.[0] || '\n\n'
        consume(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + match.length)
      }
    },
    flush() {
      consume(buffer.trim())
      buffer = ''
    },
  }
}

function createExecutionIo({ headers = {}, socket = {}, onEvent }) {
  const req = new EventEmitter()
  req.headers = { ...headers }
  req.socket = { remoteAddress: '127.0.0.1', ...socket }
  req.destroyed = false

  const res = new EventEmitter()
  const parser = createSseParser(onEvent)
  res.statusCode = 200
  res.headers = {}
  res.writableEnded = false
  res.setHeader = (name, value) => { res.headers[String(name).toLowerCase()] = value }
  res.writeHead = (code, responseHeaders = {}) => {
    res.statusCode = code
    for (const [name, value] of Object.entries(responseHeaders)) res.setHeader(name, value)
    return res
  }
  res.write = chunk => {
    if (res.writableEnded) return false
    parser.push(chunk)
    return true
  }
  res.end = chunk => {
    if (res.writableEnded) return res
    if (chunk != null) parser.push(chunk)
    parser.flush()
    res.writableEnded = true
    res.emit('finish')
    return res
  }

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    req.destroyed = true
    req.emit('close')
  }
  return { req, res, close }
}

export function createRunManager({ store, eventLog, executeChat, instanceId }) {
  const executions = new Map()

  const append = (run, type, data = {}) => eventLog.append({
    runId: run.id,
    sessionId: run.sessionId,
    type,
    data,
  })

  const finish = (runId, status, data = {}) => {
    const current = store.get(runId)
    if (!current || TERMINAL.has(current.status)) return current
    const updated = store.update(runId, {
      status,
      ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
      ...(status === 'failed' ? { failedAt: new Date().toISOString(), error: data.message || 'run_failed' } : {}),
      ...(status === 'stopped' ? { stoppedAt: new Date().toISOString() } : {}),
    })
    append(updated, status, data)
    return updated
  }

  const start = async control => {
    const initial = store.get(control.runId)
    if (!initial || TERMINAL.has(initial.status)) return
    if (control.stopRequested) {
      finish(initial.id, 'stopped', { reason: 'stopped_before_start' })
      executions.delete(initial.id)
      return
    }

    const running = store.update(initial.id, { status: 'running', startedAt: new Date().toISOString() })
    append(running, 'run_started', { status: 'running' })
    let sawError = null
    const io = createExecutionIo({
      headers: control.context.headers,
      socket: control.context.socket,
      onEvent(type, data) {
        const current = store.get(running.id)
        append(current || running, type, data)
        if (type === 'error') sawError = data
      },
    })
    control.close = io.close

    if (control.stopRequested) io.close()
    try {
      await executeChat(io.req, io.res, control.body)
      if (!io.res.writableEnded) io.res.end()
      const current = store.get(running.id)
      if (control.stopRequested || current?.status === 'stopping') {
        finish(running.id, 'stopped', { reason: 'user_stop' })
      } else if (sawError || io.res.statusCode >= 400) {
        const message = sawError?.message || sawError?.error || `HTTP ${io.res.statusCode}`
        finish(running.id, 'failed', { message })
      } else {
        finish(running.id, 'completed', {})
      }
    } catch (error) {
      const current = store.get(running.id)
      if (control.stopRequested || current?.status === 'stopping') {
        finish(running.id, 'stopped', { reason: 'user_stop' })
      } else {
        finish(running.id, 'failed', { message: String(error?.message || error) })
      }
    } finally {
      executions.delete(running.id)
    }
  }

  return {
    create(body, context = {}) {
      if (!body?.sessionId) throw Object.assign(new Error('sessionId_required'), { code: 'invalid_request' })
      if (!body?.clientRequestId) throw Object.assign(new Error('clientRequestId_required'), { code: 'invalid_request' })
      const active = store.findActiveBySession(body.sessionId)
      if (active) {
        if (active.clientRequestId === body.clientRequestId) return active
        throw Object.assign(new Error('session_busy'), { code: 'session_busy', activeRunId: active.id })
      }

      const run = store.create({ ...body, ownerId: instanceId })
      if (TERMINAL.has(run.status) || executions.has(run.id)) return run
      const control = {
        runId: run.id,
        body: { ...body },
        context: { headers: context.headers || {}, socket: context.socket || {} },
        close: null,
        stopRequested: false,
      }
      executions.set(run.id, control)
      queueMicrotask(() => start(control))
      return run
    },
    get(runId) { return store.get(runId) },
    readAfter(runId, after) { return eventLog.readAfter(runId, after) },
    subscribe(runId, listener) { return eventLog.subscribe(runId, listener) },
    stop(runId) {
      const run = store.get(runId)
      if (!run) throw Object.assign(new Error('run_not_found'), { code: 'run_not_found' })
      if (TERMINAL.has(run.status)) return run
      const control = executions.get(runId)
      if (control?.stopRequested) return store.get(runId)
      if (control) control.stopRequested = true
      const stopping = store.update(runId, { status: 'stopping', stopRequestedAt: new Date().toISOString() })
      if (control?.close) control.close()
      else if (!control) finish(runId, 'stopped', { reason: 'execution_missing' })
      return stopping
    },
    recover() {
      const orphaned = store.markOrphanedInterrupted(instanceId)
      for (const run of orphaned) append(run, 'interrupted', { reason: 'server_restarted' })
      return orphaned
    },
  }
}
