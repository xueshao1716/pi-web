const TERMINAL = new Set(['completed', 'failed', 'stopped', 'interrupted'])

function cursorFrom(req, url) {
  const query = Number.parseInt(url?.searchParams?.get('after') || '0', 10)
  const header = Number.parseInt(String(req?.headers?.['last-event-id'] || '0'), 10)
  return Math.max(Number.isFinite(query) ? query : 0, Number.isFinite(header) ? header : 0, 0)
}

function writeEvent(res, event) {
  res.write(`id: ${event.seq}\n`)
  res.write(`event: ${event.type}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

export function createRunApi({ manager, json }) {
  return {
    async create(res, body, req = null) {
      try {
        const run = manager.create(body, { headers: req?.headers, socket: req?.socket })
        return json(res, 202, {
          runId: run.id,
          sessionId: run.sessionId,
          status: run.status,
          lastSeq: 0,
        })
      } catch (error) {
        if (error?.code === 'session_busy') {
          return json(res, 409, { error: 'session_busy', activeRunId: error.activeRunId })
        }
        if (error?.code === 'invalid_request') return json(res, 400, { error: error.message })
        throw error
      }
    },
    get(res, runId) {
      const run = manager.get(runId)
      if (!run) return json(res, 404, { error: 'run_not_found' })
      return json(res, 200, { ...run, lastSeq: manager.readAfter(runId, 0).at(-1)?.seq || 0 })
    },
    events(res, req, url, runId) {
      const run = manager.get(runId)
      if (!run) return json(res, 404, { error: 'run_not_found' })
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      let cursor = cursorFrom(req, url)
      let replaying = true
      const queued = []
      const send = event => {
        if (event.seq <= cursor || res.writableEnded) return
        writeEvent(res, event)
        cursor = event.seq
      }
      const unsubscribe = manager.subscribe(runId, event => {
        if (replaying) queued.push(event)
        else send(event)
      })
      for (const event of manager.readAfter(runId, cursor)) send(event)
      replaying = false
      for (const event of queued) send(event)

      const latest = manager.get(runId)
      if (TERMINAL.has(latest?.status)) {
        unsubscribe()
        res.end()
        return
      }
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(': ping\n\n')
      }, 20_000)
      heartbeat.unref?.()
      const close = () => {
        clearInterval(heartbeat)
        unsubscribe()
        if (!res.writableEnded) res.end()
      }
      req.once('close', close)
    },
    stop(res, runId) {
      try {
        return json(res, 200, manager.stop(runId))
      } catch (error) {
        if (error?.code === 'run_not_found') return json(res, 404, { error: 'run_not_found' })
        throw error
      }
    },
  }
}
