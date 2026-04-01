const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Writable } = require('node:stream')
const { Prisma } = require('@prisma/client')

const { createApp, resolveStaticContentType } = require('../src/server')
const { createAdminEventsBroker } = require('../src/services/adminEventsBroker')
const { signToken } = require('../src/utils/jwt')

function requestApp(server, { method = 'GET', url = '/', headers = {}, body = '', remoteAddress = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter()
    req.method = method
    req.url = url
    req.headers = headers
    req.socket = { remoteAddress }
    req.destroy = () => {}

    const chunks = []
    const response = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
        callback()
      },
    })
    response.statusCode = 200
    response.headers = {}
    response.headersSent = false
    response.writeHead = function writeHead(statusCode, nextHeaders = {}) {
      this.statusCode = statusCode
      this.headers = nextHeaders
      this.headersSent = true
      return this
    }
    response.on('finish', () => {
      resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      })
    })

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

function openSseConnection(server, { method = 'GET', url = '/', headers = {}, remoteAddress = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter()
    req.method = method
    req.url = url
    req.headers = headers
    req.socket = {
      remoteAddress,
      setTimeout() {},
    }
    req.setTimeout = () => {}
    req.destroy = () => {}

    const response = new EventEmitter()
    response.statusCode = 200
    response.headers = {}
    response.body = ''
    response.socket = {
      setTimeout() {},
    }
    response.setTimeout = () => {}
    response.flushHeaders = () => {}

    let settled = false
    const succeed = () => {
      if (settled) return
      settled = true
      resolve({ req, response })
    }

    response.writeHead = function writeHead(statusCode, nextHeaders = {}) {
      this.statusCode = statusCode
      this.headers = nextHeaders
      succeed()
    }
    response.write = function write(chunk = '') {
      this.body += chunk
      return true
    }
    response.end = function end(chunk = '') {
      this.body += chunk
      this.emit('close')
      succeed()
    }

    try {
      server.emit('request', req, response)
      process.nextTick(() => {
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

  const adminResumoResponse = await requestApp(app, { url: '/admin/resumo' })
  assert.equal(adminResumoResponse.statusCode, 200)
  assert.match(adminResumoResponse.body, /<title>Donilla - Portal de Controle<\/title>/)

  const adminClientesResponse = await requestApp(app, { url: '/admin/clientes' })
  assert.equal(adminClientesResponse.statusCode, 200)
  assert.match(adminClientesResponse.body, /<title>Donilla - Portal de Controle<\/title>/)

  const adminCardapioResponse = await requestApp(app, { url: '/admin/cardapio' })
  assert.equal(adminCardapioResponse.statusCode, 200)
  assert.match(adminCardapioResponse.body, /<title>Donilla - Portal de Controle<\/title>/)

  const adminPedidosResponse = await requestApp(app, { url: '/admin/pedidos' })
  assert.equal(adminPedidosResponse.statusCode, 200)
  assert.match(adminPedidosResponse.body, /<title>Donilla - Portal de Controle<\/title>/)

  const adminConfigResponse = await requestApp(app, { url: '/admin/configuracoes' })
  assert.equal(adminConfigResponse.statusCode, 200)
  assert.match(adminConfigResponse.body, /<title>Donilla - Portal de Controle<\/title>/)

  const adminWhatsAppResponse = await requestApp(app, { url: '/admin/bot-whatsapp' })
  assert.equal(adminWhatsAppResponse.statusCode, 200)
  assert.match(adminWhatsAppResponse.body, /<title>Donilla - Portal de Controle<\/title>/)

  const adminBroadcastResponse = await requestApp(app, { url: '/admin/bot-whatsapp/disparos' })
  assert.equal(adminBroadcastResponse.statusCode, 200)
  assert.match(adminBroadcastResponse.body, /<title>Donilla - Portal de Controle<\/title>/)

  const adminBotFlowsResponse = await requestApp(app, { url: '/admin/bot-whatsapp/fluxos' })
  assert.equal(adminBotFlowsResponse.statusCode, 200)
  assert.match(adminBotFlowsResponse.body, /<title>Donilla - Flow Builder<\/title>/)

  const adminBotFlowBuilderResponse = await requestApp(app, { url: '/admin/bot-whatsapp/fluxos/editor?id=1' })
  assert.equal(adminBotFlowBuilderResponse.statusCode, 200)
  assert.match(adminBotFlowBuilderResponse.body, /<title>Donilla - Editor de Fluxo<\/title>/)

  const adminFlowsResponse = await requestApp(app, { url: '/admin/fluxos' })
  assert.equal(adminFlowsResponse.statusCode, 200)
  assert.match(adminFlowsResponse.body, /<title>Donilla - Flow Builder<\/title>/)

  const adminFlowBuilderResponse = await requestApp(app, { url: '/admin/fluxos/editor?id=1' })
  assert.equal(adminFlowBuilderResponse.statusCode, 200)
  assert.match(adminFlowBuilderResponse.body, /<title>Donilla - Editor de Fluxo<\/title>/)

  const trackingResponse = await requestApp(app, { url: '/pedido/41' })
  assert.equal(trackingResponse.statusCode, 200)
  assert.match(trackingResponse.body, /<title>Donilla - Acompanhar Pedido<\/title>/)
})

test('assets do admin modularizado devem ser servidos como javascript com cache revalidavel', async () => {
  const app = createApp({})

  const appModuleResponse = await requestApp(app, { url: '/assets/admin/app.js' })
  assert.equal(appModuleResponse.statusCode, 200)
  assert.equal(appModuleResponse.headers['Content-Type'], 'text/javascript; charset=utf-8')
  assert.equal(appModuleResponse.headers['Cache-Control'], 'public, max-age=86400, stale-while-revalidate=604800')
  assert.equal(appModuleResponse.headers['X-Content-Type-Options'], 'nosniff')
  assert.ok(appModuleResponse.headers.ETag)
  assert.ok(Number(appModuleResponse.headers['Content-Length']) > 0)
  assert.match(appModuleResponse.body, /from '\.\/modules\/navigation\.js(\?v=[0-9]{8}[a-z])?'/)

  const nestedModuleResponse = await requestApp(app, { url: '/assets/admin/modules/navigation.js' })
  assert.equal(nestedModuleResponse.statusCode, 200)
  assert.equal(nestedModuleResponse.headers['Content-Type'], 'text/javascript; charset=utf-8')
  assert.equal(nestedModuleResponse.headers['Cache-Control'], 'public, max-age=86400, stale-while-revalidate=604800')
  assert.ok(nestedModuleResponse.headers.ETag)
  assert.ok(Number(nestedModuleResponse.headers['Content-Length']) > 0)
  assert.match(nestedModuleResponse.body, /export function bindNavigationSection/)

  const cachedModuleResponse = await requestApp(app, {
    url: '/assets/admin/app.js',
    headers: {
      'if-none-match': appModuleResponse.headers.ETag,
    },
  })
  assert.equal(cachedModuleResponse.statusCode, 304)
  assert.equal(cachedModuleResponse.body, '')
  assert.equal(cachedModuleResponse.headers.ETag, appModuleResponse.headers.ETag)
})

test('resolveStaticContentType cobre extensoes comuns do frontend', () => {
  assert.equal(resolveStaticContentType('/assets/icon.svg'), 'image/svg+xml; charset=utf-8')
  assert.equal(resolveStaticContentType('/assets/banner.jpg'), 'image/jpeg')
  assert.equal(resolveStaticContentType('/assets/banner.JPEG'), 'image/jpeg')
  assert.equal(resolveStaticContentType('/assets/data.json'), 'application/json; charset=utf-8')
  assert.equal(resolveStaticContentType('/assets/font.woff2'), 'font/woff2')
  assert.equal(resolveStaticContentType('/assets/app.webmanifest'), 'application/manifest+json; charset=utf-8')
  assert.equal(resolveStaticContentType('/assets/unknown.bin'), 'application/octet-stream')
})

test('rota publica de imagem do produto deve reutilizar etag quando nao mudou', async () => {
  const app = createApp({}, {
    storeService: {
      getProductImage(id) {
        assert.equal(id, 7)
        return Promise.resolve({
          buffer: Buffer.from('hello'),
          contentType: 'image/png',
          etag: '"product-image-7-cachetest"',
          cacheControl: 'public, max-age=31536000, immutable',
        })
      },
    },
  })

  const firstResponse = await requestApp(app, { url: '/public/produtos/7/imagem' })
  assert.equal(firstResponse.statusCode, 200)
  assert.equal(firstResponse.body, 'hello')
  assert.equal(firstResponse.headers['Content-Type'], 'image/png')
  assert.equal(firstResponse.headers['Cache-Control'], 'public, max-age=31536000, immutable')
  assert.equal(firstResponse.headers.ETag, '"product-image-7-cachetest"')

  const cachedResponse = await requestApp(app, {
    url: '/public/produtos/7/imagem',
    headers: {
      'if-none-match': '"product-image-7-cachetest"',
    },
  })
  assert.equal(cachedResponse.statusCode, 304)
  assert.equal(cachedResponse.body, '')
  assert.equal(cachedResponse.headers.ETag, '"product-image-7-cachetest"')
})

test('servidor aplica CORS por allowlist e responde preflight', async () => {
  const previousAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  const previousAllowCredentials = process.env.CORS_ALLOW_CREDENTIALS
  process.env.CORS_ALLOWED_ORIGINS = 'https://app.donilla.test,https://*.donilla.test'
  process.env.CORS_ALLOW_CREDENTIALS = '1'

  const app = createApp({})

  try {
    const preflightResponse = await requestApp(app, {
      method: 'OPTIONS',
      url: '/api/checkout/create',
      headers: {
        origin: 'https://painel.donilla.test',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    })

    assert.equal(preflightResponse.statusCode, 204)
    assert.equal(preflightResponse.headers['Access-Control-Allow-Origin'], 'https://painel.donilla.test')
    assert.equal(preflightResponse.headers['Access-Control-Allow-Credentials'], 'true')
    assert.equal(preflightResponse.headers['Access-Control-Allow-Headers'], 'authorization,content-type')
    assert.match(preflightResponse.headers['Access-Control-Allow-Methods'], /POST/)
    assert.match(preflightResponse.headers.Vary, /Origin/)
    assert.match(preflightResponse.headers.Vary, /Access-Control-Request-Method/)
    assert.match(preflightResponse.headers.Vary, /Access-Control-Request-Headers/)

    const allowedOriginResponse = await requestApp(app, {
      url: '/assets/admin/app.js',
      headers: {
        origin: 'https://app.donilla.test',
      },
    })

    assert.equal(allowedOriginResponse.statusCode, 200)
    assert.equal(allowedOriginResponse.headers['Access-Control-Allow-Origin'], 'https://app.donilla.test')
    assert.equal(allowedOriginResponse.headers['Access-Control-Allow-Credentials'], 'true')
    assert.match(allowedOriginResponse.headers.Vary, /Origin/)
    assert.equal(allowedOriginResponse.headers['X-Content-Type-Options'], 'nosniff')

    const blockedPreflightResponse = await requestApp(app, {
      method: 'OPTIONS',
      url: '/api/checkout/create',
      headers: {
        origin: 'https://evil.example.com',
        'access-control-request-method': 'POST',
      },
    })

    assert.equal(blockedPreflightResponse.statusCode, 403)
    assert.equal(blockedPreflightResponse.headers['Access-Control-Allow-Origin'], undefined)
  } finally {
    if (previousAllowedOrigins === undefined) delete process.env.CORS_ALLOWED_ORIGINS
    else process.env.CORS_ALLOWED_ORIGINS = previousAllowedOrigins

    if (previousAllowCredentials === undefined) delete process.env.CORS_ALLOW_CREDENTIALS
    else process.env.CORS_ALLOW_CREDENTIALS = previousAllowCredentials
  }
})

test('client Prisma gerado deve incluir campos de horario automatico da loja', () => {
  const model = Prisma.dmmf.datamodel.models.find((entry) => entry.name === 'configuracoes_loja')
  assert.ok(model)
  const fieldNames = model.fields.map((field) => field.name)
  assert.ok(fieldNames.includes('horario_automatico_ativo'))
  assert.ok(fieldNames.includes('horario_funcionamento'))

  const ordersModel = Prisma.dmmf.datamodel.models.find((entry) => entry.name === 'pedidos')
  assert.ok(ordersModel)
  const orderFieldNames = ordersModel.fields.map((field) => field.name)
  assert.ok(orderFieldNames.includes('tracking_token'))
})

test('aliases legados devem redirecionar para a loja principal', async () => {
  const app = createApp({})

  const siteResponse = await requestApp(app, { url: '/site' })
  assert.equal(siteResponse.statusCode, 308)
  assert.equal(siteResponse.headers.Location, '/')

  const clienteResponse = await requestApp(app, { url: '/cliente' })
  assert.equal(clienteResponse.statusCode, 308)
  assert.equal(clienteResponse.headers.Location, '/')

  const faviconResponse = await requestApp(app, { url: '/favicon.ico' })
  assert.equal(faviconResponse.statusCode, 308)
  assert.equal(faviconResponse.headers.Location, '/logo-donilla.png?v=20260331a')
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

test('rotas /api de checkout e pedidos expõem o contrato minimo', async () => {
  const calls = {
    createOrder: null,
    orderDetail: null,
    orderStatus: null,
    publicTracking: null,
    retryCheckout: null,
    webhook: null,
  }

  const app = createApp({}, {
    storeService: {
      createOrder(payload) {
        calls.createOrder = payload
        return Promise.resolve({ id: 41, checkout_url: 'https://sandbox.asaas.com/checkoutSession/show?id=chk_41' })
      },
      getCustomerOrder(token, id) {
        calls.orderDetail = { token, id }
        return Promise.resolve({ id, itens: [] })
      },
      getOrderStatusSummary(id, token) {
        calls.orderStatus = { token, id }
        return Promise.resolve({ id, status_pagamento: 'pendente', status_entrega: 'pendente' })
      },
      getPublicOrderTracking(id, trackingToken) {
        calls.publicTracking = { id, trackingToken }
        return Promise.resolve({ id, tracking_path: `/pedido/${id}?token=${trackingToken}` })
      },
      retryAsaasCheckout(token, id) {
        calls.retryCheckout = { token, id }
        return Promise.resolve({ id, checkout_url: 'https://sandbox.asaas.com/checkoutSession/show?id=chk_retry' })
      },
    },
    paymentsService: {
      receiveAsaasWebhook(body, headers) {
        calls.webhook = { body, headers }
        return Promise.resolve({ received: true, queued: true, duplicate: false, event_id: body.id })
      },
    },
  })

  const createResponse = await requestApp(app, {
    method: 'POST',
    url: '/api/checkout/create',
    headers: { 'content-length': '140' },
    body: JSON.stringify({
      cliente_session_token: '12345678901234567890',
      metodo_pagamento: 'asaas_checkout',
      itens: [{ produto_id: 1, quantidade: 2 }],
    }),
  })

  assert.equal(createResponse.statusCode, 201)
  assert.equal(calls.createOrder.metodo_pagamento, 'asaas_checkout')

  const detailResponse = await requestApp(app, {
    method: 'GET',
    url: '/api/orders/41',
    headers: { authorization: 'Bearer sessao-cliente' },
  })

  assert.equal(detailResponse.statusCode, 200)
  assert.deepEqual(calls.orderDetail, { token: 'sessao-cliente', id: 41 })

  const statusResponse = await requestApp(app, {
    method: 'GET',
    url: '/api/orders/41/status',
    headers: { authorization: 'Bearer sessao-cliente' },
  })

  assert.equal(statusResponse.statusCode, 200)
  assert.deepEqual(calls.orderStatus, { token: 'sessao-cliente', id: 41 })

  const publicTrackingResponse = await requestApp(app, {
    method: 'GET',
    url: '/public/orders/41/tracking?token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  })

  assert.equal(publicTrackingResponse.statusCode, 200)
  assert.deepEqual(calls.publicTracking, {
    id: 41,
    trackingToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  })

  const retryResponse = await requestApp(app, {
    method: 'POST',
    url: '/api/checkout/41/retry',
    headers: { authorization: 'Bearer sessao-cliente' },
  })

  assert.equal(retryResponse.statusCode, 200)
  assert.deepEqual(calls.retryCheckout, { token: 'sessao-cliente', id: 41 })

  const webhookResponse = await requestApp(app, {
    method: 'POST',
    url: '/api/webhooks/asaas',
    headers: { 'content-length': '80', 'asaas-access-token': 'whsec' },
    body: JSON.stringify({
      id: 'evt_001',
      event: 'CHECKOUT_PAID',
      checkout: { id: 'chk_41' },
    }),
  })

  assert.equal(webhookResponse.statusCode, 200)
  assert.equal(calls.webhook.body.id, 'evt_001')
  assert.equal(calls.webhook.headers['asaas-access-token'], 'whsec')
})

test('rotas dinamicas fazem match estrito e rejeitam segmentos extras', async () => {
  const previousSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const adminToken = signToken(
    {
      sub: '7',
      username: 'admin',
      role: 'admin',
    },
    process.env.JWT_SECRET,
    3600,
  )

  const calls = {
    orderDetail: [],
    orderStatus: [],
    publicTracking: [],
    retryCheckout: [],
    orderAudit: [],
  }

  const app = createApp({
    pedidos: {
      findUnique({ where }) {
        return Promise.resolve({ id: where.id })
      },
    },
    pedidos_auditoria: {
      findMany(args) {
        calls.orderAudit.push(args.where.pedido_id)
        return Promise.resolve([])
      },
    },
  }, {
    storeService: {
      getCustomerOrder(token, id) {
        calls.orderDetail.push({ token, id })
        return Promise.resolve({ id, itens: [] })
      },
      getOrderStatusSummary(id, token) {
        calls.orderStatus.push({ token, id })
        return Promise.resolve({ id, status_pagamento: 'pendente', status_entrega: 'pendente' })
      },
      getPublicOrderTracking(id, trackingToken) {
        calls.publicTracking.push({ id, trackingToken })
        return Promise.resolve({ id, tracking_path: `/pedido/${id}?token=${trackingToken}` })
      },
      retryAsaasCheckout(token, id) {
        calls.retryCheckout.push({ token, id })
        return Promise.resolve({ id, checkout_url: 'https://sandbox.asaas.com/checkoutSession/show?id=chk_retry' })
      },
    },
  })

  try {
    const validCustomerOrderResponse = await requestApp(app, {
      method: 'GET',
      url: '/public/customer/orders/41',
      headers: { authorization: 'Bearer sessao-cliente' },
    })

    assert.equal(validCustomerOrderResponse.statusCode, 200)
    assert.deepEqual(calls.orderDetail, [{ token: 'sessao-cliente', id: 41 }])

    const malformedCustomerOrderResponse = await requestApp(app, {
      method: 'GET',
      url: '/public/customer/orders/41/extra',
      headers: { authorization: 'Bearer sessao-cliente' },
    })

    assert.equal(malformedCustomerOrderResponse.statusCode, 404)
    assert.deepEqual(calls.orderDetail, [{ token: 'sessao-cliente', id: 41 }])

    const validOrderStatusResponse = await requestApp(app, {
      method: 'GET',
      url: '/api/orders/41/status',
      headers: { authorization: 'Bearer sessao-cliente' },
    })

    assert.equal(validOrderStatusResponse.statusCode, 200)
    assert.deepEqual(calls.orderStatus, [{ token: 'sessao-cliente', id: 41 }])

    const malformedOrderStatusResponse = await requestApp(app, {
      method: 'GET',
      url: '/api/orders/41/status/extra',
      headers: { authorization: 'Bearer sessao-cliente' },
    })

    assert.equal(malformedOrderStatusResponse.statusCode, 404)
    assert.deepEqual(calls.orderStatus, [{ token: 'sessao-cliente', id: 41 }])

    const duplicatedSlashOrderStatusResponse = await requestApp(app, {
      method: 'GET',
      url: '/api/orders//status',
      headers: { authorization: 'Bearer sessao-cliente' },
    })

    assert.equal(duplicatedSlashOrderStatusResponse.statusCode, 404)
    assert.deepEqual(calls.orderStatus, [{ token: 'sessao-cliente', id: 41 }])

    const validPublicTrackingResponse = await requestApp(app, {
      method: 'GET',
      url: '/public/orders/41/tracking?token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })

    assert.equal(validPublicTrackingResponse.statusCode, 200)
    assert.deepEqual(calls.publicTracking, [{
      id: 41,
      trackingToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }])

    const malformedPublicTrackingResponse = await requestApp(app, {
      method: 'GET',
      url: '/public/orders/41/tracking/extra?token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })

    assert.equal(malformedPublicTrackingResponse.statusCode, 404)
    assert.deepEqual(calls.publicTracking, [{
      id: 41,
      trackingToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }])

    const validRetryResponse = await requestApp(app, {
      method: 'POST',
      url: '/api/checkout/41/retry',
      headers: { authorization: 'Bearer sessao-cliente' },
    })

    assert.equal(validRetryResponse.statusCode, 200)
    assert.deepEqual(calls.retryCheckout, [{ token: 'sessao-cliente', id: 41 }])

    const malformedRetryResponse = await requestApp(app, {
      method: 'POST',
      url: '/api/checkout/41/retry/extra',
      headers: { authorization: 'Bearer sessao-cliente' },
    })

    assert.equal(malformedRetryResponse.statusCode, 404)
    assert.deepEqual(calls.retryCheckout, [{ token: 'sessao-cliente', id: 41 }])

    const validAdminAuditResponse = await requestApp(app, {
      method: 'GET',
      url: '/admin/orders/41/audit',
      headers: { authorization: `Bearer ${adminToken}` },
    })

    assert.equal(validAdminAuditResponse.statusCode, 200)
    assert.deepEqual(calls.orderAudit, [41])

    const malformedAdminAuditResponse = await requestApp(app, {
      method: 'GET',
      url: '/admin/orders/41/audit/extra',
      headers: { authorization: `Bearer ${adminToken}` },
    })

    assert.equal(malformedAdminAuditResponse.statusCode, 404)
    assert.deepEqual(calls.orderAudit, [41])
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previousSecret
  }
})

test('rota admin de auditoria do pedido exige admin e devolve historico', async () => {
  const previousSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const adminToken = signToken(
    {
      sub: '7',
      username: 'admin',
      role: 'admin',
    },
    process.env.JWT_SECRET,
    3600,
  )

  const app = createApp({
    pedidos: {
      findUnique({ where }) {
        return Promise.resolve({ id: where.id })
      },
    },
    pedidos_auditoria: {
      findMany() {
        return Promise.resolve([
          {
            id: 5,
            pedido_id: 41,
            origem: 'checkout',
            ator: 'asaas',
            acao: 'checkout_criado',
            status_pagamento_anterior: null,
            status_pagamento_atual: 'pendente',
            status_entrega_anterior: null,
            status_entrega_atual: 'pendente',
            detalhes: { checkout_id: 'chk_41' },
            criado_em: '2026-03-23T19:00:00.000Z',
          },
        ])
      },
    },
  })

  try {
    const response = await requestApp(app, {
      method: 'GET',
      url: '/admin/orders/41/audit',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    })

    assert.equal(response.statusCode, 200)
    assert.match(response.body, /checkout_criado/)
    assert.match(response.body, /chk_41/)
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previousSecret
  }
})

test('rota admin events exige autenticacao e transmite SSE para admins', async () => {
  const previousSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const adminToken = signToken(
    {
      sub: '9',
      username: 'admin',
      role: 'admin',
    },
    process.env.JWT_SECRET,
    3600,
  )

  const broker = createAdminEventsBroker({ heartbeatIntervalMs: 60_000 })
  const app = createApp({}, { adminEventsBroker: broker })

  try {
    const unauthorizedResponse = await requestApp(app, {
      method: 'GET',
      url: '/admin/events',
    })

    assert.equal(unauthorizedResponse.statusCode, 401)

    const { req, response } = await openSseConnection(app, {
      method: 'GET',
      url: '/admin/events',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    })

    await new Promise((resolve) => setImmediate(resolve))

    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['Content-Type'], 'text/event-stream; charset=utf-8')
    assert.match(response.body, /event: connected/)
    assert.equal(broker.getClientCount(), 1)

    broker.publish('order.created', { orderId: 41, total: '12.00' })
    await new Promise((resolve) => setImmediate(resolve))

    assert.match(response.body, /event: order\.created/)
    assert.match(response.body, /"orderId":41/)
    assert.match(response.body, /"total":"12\.00"/)

    req.emit('close')
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(broker.getClientCount(), 0)
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previousSecret
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
    assert.equal(lastResponse.headers['RateLimit-Limit'], '5')
    assert.equal(lastResponse.headers['RateLimit-Remaining'], '0')
    assert.equal(lastResponse.headers['RateLimit-Reset'], '600')
    assert.equal(lastResponse.headers['RateLimit-Policy'], '5;w=600')
    assert.equal(lastResponse.headers['Retry-After'], '600')
    assert.match(lastResponse.body, /Muitas tentativas de login/i)
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previousSecret
  }
})

test('checkout create deve aplicar rate limit dedicado', async () => {
  const app = createApp({}, {
    storeService: {
      createOrder() {
        return Promise.resolve({ id: 41, checkout_url: 'https://sandbox.asaas.com/checkoutSession/show?id=chk_41' })
      },
    },
  })

  let lastResponse = null

  for (let attempt = 0; attempt < 11; attempt += 1) {
    lastResponse = await requestApp(app, {
      method: 'POST',
      url: '/api/checkout/create',
      headers: {
        'content-length': '140',
        'x-forwarded-for': '198.51.100.30',
      },
      body: JSON.stringify({
        cliente_session_token: '12345678901234567890',
        metodo_pagamento: 'asaas_checkout',
        itens: [{ produto_id: 1, quantidade: 1 }],
      }),
    })
  }

  assert.equal(lastResponse.statusCode, 429)
  assert.equal(lastResponse.headers['RateLimit-Limit'], '10')
  assert.equal(lastResponse.headers['RateLimit-Policy'], '10;w=60')
  assert.equal(lastResponse.headers['Retry-After'], '60')
  assert.match(lastResponse.body, /Muitas tentativas/i)
})

test('namespace publico deve aplicar rate limit generico nas rotas /public/*', async () => {
  const app = createApp({}, {
    storeService: {
      getStore() {
        return Promise.resolve({ id: 1, nome_loja: 'Donilla' })
      },
    },
  })

  let lastResponse = null

  for (let attempt = 0; attempt < 61; attempt += 1) {
    lastResponse = await requestApp(app, {
      method: 'GET',
      url: '/public/store',
      headers: {
        'x-forwarded-for': '198.51.100.33',
      },
    })
  }

  assert.equal(lastResponse.statusCode, 429)
  assert.equal(lastResponse.headers['RateLimit-Limit'], '60')
  assert.equal(lastResponse.headers['RateLimit-Policy'], '60;w=60')
  assert.equal(lastResponse.headers['Retry-After'], '60')
  assert.match(lastResponse.body, /API publica/i)
})

test('namespace de checkout deve aplicar rate limit generico em /api/checkout/*', async () => {
  const app = createApp({})

  let lastResponse = null

  for (let attempt = 0; attempt < 31; attempt += 1) {
    lastResponse = await requestApp(app, {
      method: 'GET',
      url: '/api/checkout/probe',
      headers: {
        'x-forwarded-for': '198.51.100.34',
      },
    })
  }

  assert.equal(lastResponse.statusCode, 429)
  assert.equal(lastResponse.headers['RateLimit-Limit'], '30')
  assert.equal(lastResponse.headers['RateLimit-Policy'], '30;w=60')
  assert.equal(lastResponse.headers['Retry-After'], '60')
  assert.match(lastResponse.body, /checkout/i)
})

test('status resumido do pedido deve aplicar rate limit dedicado', async () => {
  const app = createApp({}, {
    storeService: {
      getOrderStatusSummary(id, token) {
        return Promise.resolve({ id, token, status_pagamento: 'pendente', status_entrega: 'pendente' })
      },
    },
  })

  let lastResponse = null

  for (let attempt = 0; attempt < 31; attempt += 1) {
    lastResponse = await requestApp(app, {
      method: 'GET',
      url: '/api/orders/41/status',
      headers: {
        authorization: 'Bearer sessao-cliente',
        'x-forwarded-for': '198.51.100.31',
      },
    })
  }

  assert.equal(lastResponse.statusCode, 429)
  assert.equal(lastResponse.headers['RateLimit-Limit'], '30')
  assert.equal(lastResponse.headers['RateLimit-Policy'], '30;w=60')
  assert.equal(lastResponse.headers['Retry-After'], '60')
  assert.match(lastResponse.body, /Muitas consultas de status/i)
})

test('webhook do Asaas deve aplicar rate limit dedicado', async () => {
  const app = createApp({}, {
    paymentsService: {
      receiveAsaasWebhook(body) {
        return Promise.resolve({ received: true, event_id: body.id })
      },
    },
  })

  let lastResponse = null

  for (let attempt = 0; attempt < 121; attempt += 1) {
    lastResponse = await requestApp(app, {
      method: 'POST',
      url: '/api/webhooks/asaas',
      headers: {
        'content-length': '80',
        'asaas-access-token': 'whsec',
        'x-forwarded-for': '198.51.100.32',
      },
      body: JSON.stringify({
        id: `evt_${attempt}`,
        event: 'CHECKOUT_PAID',
        checkout: { id: 'chk_41' },
      }),
    })
  }

  assert.equal(lastResponse.statusCode, 429)
  assert.equal(lastResponse.headers['RateLimit-Limit'], '120')
  assert.equal(lastResponse.headers['RateLimit-Policy'], '120;w=60')
  assert.equal(lastResponse.headers['Retry-After'], '60')
  assert.match(lastResponse.body, /Muitas notificacoes recebidas/i)
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

test('erros de banco nao vazam detalhes em producao mesmo com EXPOSE_ERROR_DETAILS ativo', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousExpose = process.env.EXPOSE_ERROR_DETAILS
  process.env.NODE_ENV = 'production'
  process.env.EXPOSE_ERROR_DETAILS = '1'

  const app = createApp({}, {
    storeService: {
      createOrder() {
        return Promise.reject({
          code: 'P2003',
          message: 'Foreign key constraint failed on the field: pedidos_cliente_id_fkey',
        })
      },
    },
  })

  try {
    const response = await requestApp(app, {
      method: 'POST',
      url: '/api/checkout/create',
      headers: { 'content-length': '140' },
      body: JSON.stringify({
        cliente_session_token: '12345678901234567890',
        metodo_pagamento: 'asaas_checkout',
        itens: [{ produto_id: 1, quantidade: 1 }],
      }),
    })

    const payload = JSON.parse(response.body)
    assert.equal(response.statusCode, 409)
    assert.equal(payload.success, false)
    assert.equal(payload.error.message, 'Nao foi possivel excluir este registro porque ele esta vinculado a outros dados.')
    assert.equal('details' in payload.error, false)
    assert.doesNotMatch(response.body, /pedidos_cliente_id_fkey/i)
    assert.doesNotMatch(response.body, /foreign key/i)
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv

    if (previousExpose === undefined) delete process.env.EXPOSE_ERROR_DETAILS
    else process.env.EXPOSE_ERROR_DETAILS = previousExpose
  }
})

test('erros prisma nao tratados continuam sem detalhes em producao', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousExpose = process.env.EXPOSE_ERROR_DETAILS
  process.env.NODE_ENV = 'production'
  process.env.EXPOSE_ERROR_DETAILS = '1'

  const app = createApp({}, {
    storeService: {
      createOrder() {
        const error = new Error('relation "pedidos" does not exist')
        error.name = 'PrismaClientUnknownRequestError'
        error.code = 'P5000'
        error.clientVersion = '6.0.0'
        return Promise.reject(error)
      },
    },
  })

  try {
    const response = await requestApp(app, {
      method: 'POST',
      url: '/api/checkout/create',
      headers: { 'content-length': '140' },
      body: JSON.stringify({
        cliente_session_token: '12345678901234567890',
        metodo_pagamento: 'asaas_checkout',
        itens: [{ produto_id: 1, quantidade: 1 }],
      }),
    })

    const payload = JSON.parse(response.body)
    assert.equal(response.statusCode, 500)
    assert.equal(payload.success, false)
    assert.equal(payload.error.message, 'Erro interno no servidor.')
    assert.equal('details' in payload.error, false)
    assert.doesNotMatch(response.body, /relation "pedidos"/i)
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv

    if (previousExpose === undefined) delete process.env.EXPOSE_ERROR_DETAILS
    else process.env.EXPOSE_ERROR_DETAILS = previousExpose
  }
})
