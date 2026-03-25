const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const { createApp } = require('../src/server')
const { signToken } = require('../src/utils/jwt')

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
})

test('assets do admin modularizado devem ser servidos como javascript', async () => {
  const app = createApp({})

  const appModuleResponse = await requestApp(app, { url: '/assets/admin/app.js' })
  assert.equal(appModuleResponse.statusCode, 200)
  assert.equal(appModuleResponse.headers['Content-Type'], 'text/javascript; charset=utf-8')
  assert.equal(appModuleResponse.headers['Cache-Control'], 'no-store, max-age=0')
  assert.match(appModuleResponse.body, /from '\.\/modules\/navigation\.js(\?v=20260325g)?'/)

  const nestedModuleResponse = await requestApp(app, { url: '/assets/admin/modules/navigation.js' })
  assert.equal(nestedModuleResponse.statusCode, 200)
  assert.equal(nestedModuleResponse.headers['Content-Type'], 'text/javascript; charset=utf-8')
  assert.equal(nestedModuleResponse.headers['Cache-Control'], 'no-store, max-age=0')
  assert.match(nestedModuleResponse.body, /export function bindNavigationSection/)
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

test('rotas /api de checkout e pedidos expõem o contrato minimo', async () => {
  const calls = {
    createOrder: null,
    orderDetail: null,
    orderStatus: null,
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
