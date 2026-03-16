const test = require('node:test')
const assert = require('node:assert/strict')

const { createApp } = require('../src/server')

function requestApp(server, { method = 'GET', url = '/' } = {}) {
  return new Promise((resolve, reject) => {
    const req = { method, url, headers: {} }
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
