const { AppError } = require('./errors')

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

function sendRaw(res, statusCode, body, contentType = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    ...headers,
  })
  res.end(body)
}

function sendSuccess(res, statusCode, data, meta) {
  const payload = { success: true, data }
  if (meta) payload.meta = meta
  sendJson(res, statusCode, payload)
}

function sendError(res, statusCode, message, details) {
  sendJson(res, statusCode, {
    success: false,
    error: { message, details },
  })
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''

    req.on('data', (chunk) => {
      data += chunk
    })

    req.on('end', () => {
      if (!data) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(data))
      } catch {
        reject(new AppError(400, 'JSON invalido no corpo da requisicao.'))
      }
    })

    req.on('error', reject)
  })
}

module.exports = {
  parseJsonBody,
  sendError,
  sendJson,
  sendRaw,
  sendSuccess,
}
