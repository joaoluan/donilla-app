const { getCorsHeaders, getNoStoreHeaders, getSecurityHeaders } = require('../utils/security')
const { ManagedInterval } = require('../utils/syncUtility')

function formatSseChunk({ id = null, event = null, data = undefined, comment = null } = {}) {
  const lines = []

  if (comment) {
    lines.push(`: ${comment}`)
  }

  if (id !== null && id !== undefined) {
    lines.push(`id: ${id}`)
  }

  if (event) {
    lines.push(`event: ${event}`)
  }

  if (data !== undefined) {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data)
    serialized.split(/\r?\n/).forEach((line) => {
      lines.push(`data: ${line}`)
    })
  }

  return `${lines.join('\n')}\n\n`
}

function createAdminEventsBroker({ heartbeatIntervalMs = 25_000, logger = console } = {}) {
  const clients = new Map()
  let nextClientId = 1
  let nextEventId = 1

  function removeClient(clientId) {
    const client = clients.get(clientId)
    if (!client) return

    if (client.heartbeatTimer) {
      if (typeof client.heartbeatTimer.cancel === 'function') {
        // ManagedInterval
        client.heartbeatTimer.cancel()
      } else {
        // Fallback para casos legados
        clearInterval(client.heartbeatTimer)
      }
    }

    clients.delete(clientId)
  }

  function writeChunk(clientId, chunk) {
    const client = clients.get(clientId)
    if (!client) return false

    try {
      client.res.write(chunk)
      return true
    } catch {
      removeClient(clientId)
      return false
    }
  }

  function publish(event, data = {}) {
    const eventId = nextEventId++
    const chunk = formatSseChunk({
      id: eventId,
      event,
      data: {
        emittedAt: new Date().toISOString(),
        ...data,
      },
    })

    for (const clientId of clients.keys()) {
      writeChunk(clientId, chunk)
    }
  }

  function subscribe(req, res, { auth = null } = {}) {
    const clientId = nextClientId++
    let closed = false
    const corsHeaders = getCorsHeaders(req)

    req.setTimeout?.(0)
    res.setTimeout?.(0)
    req.socket?.setTimeout?.(0)
    res.socket?.setTimeout?.(0)

    res.writeHead(200, {
      ...getSecurityHeaders(),
      ...getNoStoreHeaders(),
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders?.()

    const cleanup = () => {
      if (closed) return
      closed = true
      removeClient(clientId)
    }

    const heartbeatTimer = new ManagedInterval(() => {
      if (writeChunk(clientId, formatSseChunk({ comment: 'ping' }))) {
        return
      }

      heartbeatTimer.cancel()
      logger.warn?.('[admin-events] Cliente SSE removido durante heartbeat.', { clientId })
    }, heartbeatIntervalMs)

    clients.set(clientId, {
      id: clientId,
      auth,
      res,
      heartbeatTimer,
    })

    req.on?.('aborted', cleanup)
    req.on?.('close', cleanup)
    res.on?.('close', cleanup)
    res.on?.('error', cleanup)

    writeChunk(clientId, formatSseChunk({
      event: 'connected',
      data: {
        clientId,
        connectedAt: new Date().toISOString(),
        userId: auth?.sub || null,
      },
    }))
  }

  function getClientCount() {
    return clients.size
  }

  return {
    subscribe,
    publish,
    getClientCount,
  }
}

module.exports = { createAdminEventsBroker }
