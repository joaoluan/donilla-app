const { AppError } = require('./errors')
const { getMaxJsonBodyBytes, getNoStoreHeaders, getSecurityHeaders } = require('./security')

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    ...getSecurityHeaders(),
    ...getNoStoreHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  })
  res.end(JSON.stringify(data))
}

function sendRaw(res, statusCode, body, contentType = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(statusCode, {
    ...getSecurityHeaders(),
    'Content-Type': contentType,
    ...headers,
  })
  res.end(body)
}

function sendSuccess(res, statusCode, data, meta, headers = {}) {
  const payload = { success: true, data }
  if (meta) payload.meta = meta
  sendJson(res, statusCode, payload, headers)
}

function sendError(res, statusCode, message, details, headers = {}) {
  sendJson(
    res,
    statusCode,
    {
      success: false,
      error: { message, details },
    },
    headers,
  )
}

function parseJsonBody(req, options = {}) {
  const maxBytes = Number.isInteger(options.maxBytes) && options.maxBytes > 0
    ? options.maxBytes
    : getMaxJsonBodyBytes()
  const contentLength = Number.parseInt(String(req?.headers?.['content-length'] || ''), 10)

  if (Number.isInteger(contentLength) && contentLength > maxBytes) {
    return Promise.reject(new AppError(413, 'Corpo da requisicao excede o tamanho maximo permitido.'))
  }

  return new Promise((resolve, reject) => {
    let data = ''
    let size = 0
    let settled = false

    function fail(error) {
      if (settled) return
      settled = true
      reject(error)
    }

    function succeed(payload) {
      if (settled) return
      settled = true
      resolve(payload)
    }

    req.on('data', (chunk) => {
      const chunkText = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      size += Buffer.byteLength(chunkText)

      if (size > maxBytes) {
        fail(new AppError(413, 'Corpo da requisicao excede o tamanho maximo permitido.'))
        if (typeof req.destroy === 'function') {
          req.destroy()
        }
        return
      }

      data += chunkText
    })

    req.on('end', () => {
      if (settled) return
      if (!data) {
        succeed({})
        return
      }

      try {
        succeed(JSON.parse(data))
      } catch {
        fail(new AppError(400, 'JSON invalido no corpo da requisicao.'))
      }
    })

    req.on('error', (error) => {
      if (settled) return
      fail(error)
    })
  })
}

module.exports = {
  parseJsonBody,
  sendError,
  sendJson,
  sendRaw,
  sendSuccess,
}
