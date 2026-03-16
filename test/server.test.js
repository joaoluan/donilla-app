const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const { createApp } = require('../src/server')

function requestApp(server, { method = 'GET', url = '/', headers = {}, body = '', remoteAddress = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter()
    req.method = method
    req.url = url
    req.headers = headers
    req.socket = { remoteAddress }
    req.destroy = () => {}

    const response = {
      statusCode: 200,
      headers: {},
      body: '',
      writeHead(statusCode, headers = {}) {
        this.statusCode = statusCode
        this.headers = headers
      },
      end(chunk = '') {
        this.body += chunk
        resolve({
          statusCode: this.statusCode,
          headers: this.headers,
          body: this.body,
        })
      },
    }

    try {
      server.emit('request', req, response)
      process.nextTick(() => {
        if (body) req.emit('data', body)
        req.emit('end')
      })
    } catch (error) {
      reject(error)
    }
  })
}

test('rotas web canonicas devem servir as paginas corretas', async () => {
  const app = createApp({})

  const storeResponse = await requestApp(app, { url: '/' })
  assert.equal(storeResponse.statusCode, 200)
  assert.match(storeResponse.body, /<title>Donilla - Loja Online<\/title>/)
  assert.equal(storeResponse.headers['X-Frame-Options'], 'DENY')

  const aliasResponse = await requestApp(app, { url: '/loja' })
  assert.equal(aliasResponse.statusCode, 200)
  assert.match(aliasResponse.body, /<title>Donilla - Loja Online<\/title>/)

  const catalogResponse = await requestApp(app, { url: '/catalogo' })
  assert.equal(catalogResponse.statusCode, 200)
  assert.match(catalogResponse.body, /<title>Donilla - Pedidos Online<\/title>/)

  const adminResponse = await requestApp(app, { url: '/admin' })
  assert.equal(adminResponse.statusCode, 200)
  assert.match(adminResponse.body, /<title>Donilla - Portal de Controle<\/title>/)
})

test('aliases legados devem redirecionar para a loja principal', async () => {
  const app = createApp({})

  const siteResponse = await requestApp(app, { url: '/site' })
  assert.equal(siteResponse.statusCode, 308)
  assert.equal(siteResponse.headers.Location, '/')

  const clienteResponse = await requestApp(app, { url: '/cliente' })
  assert.equal(clienteResponse.statusCode, 308)
  assert.equal(clienteResponse.headers.Location, '/')
})

test('webhook do WhatsApp deve responder ok em texto puro', async () => {
  const previousToken = process.env.WPP_WEBHOOK_TOKEN
  process.env.WPP_WEBHOOK_TOKEN = 'token-teste'
  const previousUrl = process.env.WPP_SERVER_URL
  const previousSession = process.env.WPP_SESSION_NAME
  const previousSecret = process.env.WPP_SECRET_KEY
  process.env.WPP_SERVER_URL = 'http://localhost:21465'
  process.env.WPP_SESSION_NAME = 'donilla'
  process.env.WPP_SECRET_KEY = 'secret'

  try {
    const app = createApp({})
    const response = await requestApp(app, {
      url: '/whatsapp/webhook?token=token-teste',
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['Content-Type'], 'text/plain; charset=utf-8')
    assert.equal(response.body, 'ok')
  } finally {
    if (previousToken === undefined) delete process.env.WPP_WEBHOOK_TOKEN
    else process.env.WPP_WEBHOOK_TOKEN = previousToken
    if (previousUrl === undefined) delete process.env.WPP_SERVER_URL
    else process.env.WPP_SERVER_URL = previousUrl
    if (previousSession === undefined) delete process.env.WPP_SESSION_NAME
    else process.env.WPP_SESSION_NAME = previousSession
    if (previousSecret === undefined) delete process.env.WPP_SECRET_KEY
    else process.env.WPP_SECRET_KEY = previousSecret
  }
})

test('rotas sensiveis devem aplicar rate limit por IP', async () => {
  const previousSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const app = createApp({
    usuarios: {
      findUnique() {
        return Promise.resolve(null)
      },
    },
  })

  try {
    let lastResponse = null

    for (let attempt = 0; attempt < 6; attempt += 1) {
      lastResponse = await requestApp(app, {
        method: 'POST',
        url: '/auth/login',
        headers: {
          'content-length': '40',
          'x-forwarded-for': '203.0.113.50',
        },
        body: JSON.stringify({ username: 'admin', password: 'senha' }),
      })
    }

    assert.equal(lastResponse.statusCode, 429)
    assert.equal(lastResponse.headers['Retry-After'], '600')
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previousSecret
  }
})

test('payloads JSON acima do limite devem ser bloqueados', async () => {
  const previousLimit = process.env.MAX_JSON_BODY_BYTES
  process.env.MAX_JSON_BODY_BYTES = '32'

  const app = createApp({
    usuarios: {
      findUnique() {
        return Promise.resolve(null)
      },
    },
  })

  try {
    const response = await requestApp(app, {
      method: 'POST',
      url: '/auth/login',
      headers: {
        'content-length': '64',
      },
      body: JSON.stringify({ username: 'admin', password: 'senha' }),
    })

    assert.equal(response.statusCode, 413)
    assert.match(response.body, /tamanho maximo permitido/i)
  } finally {
    if (previousLimit === undefined) delete process.env.MAX_JSON_BODY_BYTES
    else process.env.MAX_JSON_BODY_BYTES = previousLimit
  }
})
