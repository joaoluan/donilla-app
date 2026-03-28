const test = require('node:test')
const assert = require('node:assert/strict')

const { publicStoreService } = require('../src/services/publicStoreService')
const { signToken } = require('../src/utils/jwt')

function createPrismaMock(user = null, overrides = {}) {
  return {
    usuarios: {
      findUnique(args) {
        if (args?.where?.username) {
          return Promise.resolve(user)
        }
        return Promise.resolve(null)
      },
    },
    configuracoes_loja: {
      findFirst() {
        return Promise.resolve(overrides.storeConfig || null)
      },
    },
    taxas_entrega_locais: {
      findMany() {
        return Promise.resolve(overrides.deliveryFees || [])
      },
    },
  }
}

function createOrderPrismaMock(options = {}) {
  const calls = {
    pedidoCreate: null,
    pedidoUpdate: [],
    createMany: null,
    produtoUpdate: [],
    orderAuditCreate: [],
    asaasCheckout: null,
    webhookEventCreate: [],
    webhookEventUpdate: [],
  }
  const orders = new Map()
  const webhookEvents = new Map()
  let nextWebhookEventId = 1

  function applySelect(record, select) {
    if (!select) return record
    return Object.fromEntries(Object.keys(select).map((field) => [field, record[field]]))
  }

  function applyUpdate(record, data) {
    const next = { ...record }

    for (const [key, value] of Object.entries(data || {})) {
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'increment')) {
        next[key] = Number(next[key] || 0) + Number(value.increment || 0)
        continue
      }

      next[key] = value
    }

    return next
  }

  function matchesOrderWhere(order, where = {}) {
    if (!order || !where) return false

    if (where.id !== undefined && order.id !== where.id) {
      return false
    }

    if (where.cliente_id !== undefined && order.cliente_id !== where.cliente_id) {
      return false
    }

    if (where.id_transacao_gateway !== undefined && order.id_transacao_gateway !== where.id_transacao_gateway) {
      return false
    }

    const customerPhone = where?.clientes?.is?.telefone_whatsapp
    if (customerPhone !== undefined && order?.clientes?.telefone_whatsapp !== customerPhone) {
      return false
    }

    return true
  }

  return {
    calls,
    orders,
    webhookEvents,
    prisma: {
      configuracoes_loja: {
        findFirst() {
          return Promise.resolve(options.storeConfig || {
            loja_aberta: true,
            taxa_entrega_padrao: '0.00',
          })
        },
      },
      taxas_entrega_locais: {
        findMany() {
          return Promise.resolve([])
        },
      },
      produtos: {
        findMany() {
          return Promise.resolve(options.products || [
            {
              id: 1,
              nome_doce: 'Brigadeiro',
              preco: '12.00',
              ativo: true,
              estoque_disponivel: 10,
            },
          ])
        },
        update({ where, data }) {
          calls.produtoUpdate.push({ where, data })
          return Promise.resolve({
            id: where.id,
            estoque_disponivel: data?.estoque_disponivel?.increment ?? 10,
          })
        },
      },
      pedidos: {
        update({ where, data }) {
          const current = orders.get(where.id) || { id: where.id }
          const updated = { ...current, ...data }
          orders.set(where.id, updated)
          calls.pedidoUpdate.push({ where, data })
          return Promise.resolve(updated)
        },
        findUnique({ where, select }) {
          const match = orders.get(where.id) || null
          if (!match) return Promise.resolve(null)
          return Promise.resolve(applySelect(match, select))
        },
        findFirst({ where, select }) {
          const match = [...orders.values()].find((order) => matchesOrderWhere(order, where))
          if (!match) return Promise.resolve(null)
          return Promise.resolve(applySelect(match, select))
        },
      },
      pedidos_auditoria: {
        create({ data }) {
          calls.orderAuditCreate.push(data)
          return Promise.resolve({ id: calls.orderAuditCreate.length, ...data })
        },
      },
      asaas_webhook_events: {
        create({ data, select }) {
          const duplicate = [...webhookEvents.values()].find((event) => event.event_id === data.event_id)
          if (duplicate) {
            return Promise.reject({ code: 'P2002' })
          }

          const created = {
            id: nextWebhookEventId++,
            status: 'recebido',
            tentativas: 0,
            recebido_em: new Date('2026-03-23T22:00:00.000Z'),
            processado_em: null,
            ultimo_erro: null,
            ...data,
          }

          webhookEvents.set(created.id, created)
          calls.webhookEventCreate.push(created)
          return Promise.resolve(applySelect(created, select))
        },
        findUnique({ where, select }) {
          let match = null
          if (where?.id) {
            match = webhookEvents.get(where.id) || null
          } else if (where?.event_id) {
            match = [...webhookEvents.values()].find((event) => event.event_id === where.event_id) || null
          }

          if (!match) return Promise.resolve(null)
          return Promise.resolve(applySelect(match, select))
        },
        updateMany({ where, data }) {
          const current = webhookEvents.get(where.id)
          if (!current) return Promise.resolve({ count: 0 })

          const allowedStatuses = where?.status?.in
          if (Array.isArray(allowedStatuses) && !allowedStatuses.includes(current.status)) {
            return Promise.resolve({ count: 0 })
          }

          const updated = applyUpdate(current, data)
          webhookEvents.set(updated.id, updated)
          calls.webhookEventUpdate.push({ where, data, updated })
          return Promise.resolve({ count: 1 })
        },
        update({ where, data, select }) {
          const current = webhookEvents.get(where.id)
          const updated = applyUpdate(current || { id: where.id }, data)
          webhookEvents.set(updated.id, updated)
          calls.webhookEventUpdate.push({ where, data, updated })
          return Promise.resolve(applySelect(updated, select))
        },
      },
      $transaction(callback) {
        const tx = {
          clientes: {
            findUnique(args) {
              if (args?.where?.id) return Promise.resolve(null)
              if (args?.where?.telefone_whatsapp) return Promise.resolve(null)
              return Promise.resolve(null)
            },
            create({ data }) {
              return Promise.resolve({ id: 21, ...data })
            },
            update({ data }) {
              return Promise.resolve({ id: 21, ...data })
            },
          },
          enderecos: {
            create({ data }) {
              return Promise.resolve({ id: 31, ...data })
            },
          },
          produtos: {
            updateMany() {
              return Promise.resolve({ count: 1 })
            },
          },
          pedidos: {
            create({ data }) {
              calls.pedidoCreate = data
              const created = {
                id: 41,
                criado_em: '2026-03-16T18:00:00.000Z',
                ...data,
              }
              orders.set(created.id, created)
              return Promise.resolve(created)
            },
            update({ where, data }) {
              const current = orders.get(where.id) || { id: where.id }
              const updated = applyUpdate(current, data)
              orders.set(where.id, updated)
              calls.pedidoUpdate.push({ where, data })
              return Promise.resolve(updated)
            },
          },
          pedidos_auditoria: {
            create({ data }) {
              calls.orderAuditCreate.push(data)
              return Promise.resolve({ id: calls.orderAuditCreate.length, ...data })
            },
          },
          itens_pedido: {
            createMany({ data }) {
              calls.createMany = data
              return Promise.resolve({ count: data.length })
            },
          },
        }

        return callback(tx)
      },
    },
  }
}

test('customerPhoneAvailability deve informar quando o telefone ja possui cadastro', async () => {
  const service = publicStoreService(createPrismaMock({ id: 10 }))

  const result = await service.customerPhoneAvailability('(11) 99999-9999')

  assert.deepEqual(result, {
    exists: true,
    telefone_whatsapp: '11999999999',
  })
})

test('customerPhoneAvailability deve informar quando o telefone ainda esta livre', async () => {
  const service = publicStoreService(createPrismaMock(null))

  const result = await service.customerPhoneAvailability('(11) 98888-7777')

  assert.deepEqual(result, {
    exists: false,
    telefone_whatsapp: '11988887777',
  })
})

test('getStore nao deve expor configuracoes privadas do bot de WhatsApp', async () => {
  const service = publicStoreService(
    createPrismaMock(null, {
      storeConfig: {
        id: 1,
        loja_aberta: true,
        tempo_entrega_minutos: 30,
        tempo_entrega_max_minutos: 50,
        taxa_entrega_padrao: '8.00',
        mensagem_aviso: 'Aviso',
        whatsapp_ativo: true,
        whatsapp_webhook_url: 'https://bot.exemplo.test/webhook',
        whatsapp_webhook_secret: 'segredo',
      },
    }),
  )

  const result = await service.getStore()

  assert.equal(result.id, 1)
  assert.equal(result.loja_aberta, true)
  assert.equal(result.tempo_entrega_minutos, 30)
  assert.equal(result.tempo_entrega_max_minutos, 50)
  assert.equal(result.taxa_entrega_padrao, '8.00')
  assert.equal(result.mensagem_aviso, 'Aviso')
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'whatsapp_ativo'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'whatsapp_webhook_url'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'whatsapp_webhook_secret'), false)
})

test('getStore deve refletir loja fechada quando o horario automatico nao tem agenda ativa', async () => {
  const service = publicStoreService(
    createPrismaMock(null, {
      storeConfig: {
        id: 2,
        loja_aberta: true,
        horario_automatico_ativo: true,
        horario_funcionamento: {
          sunday: { enabled: false, open: '09:00', close: '18:00' },
          monday: { enabled: false, open: '09:00', close: '18:00' },
          tuesday: { enabled: false, open: '09:00', close: '18:00' },
          wednesday: { enabled: false, open: '09:00', close: '18:00' },
          thursday: { enabled: false, open: '09:00', close: '18:00' },
          friday: { enabled: false, open: '09:00', close: '18:00' },
          saturday: { enabled: false, open: '09:00', close: '18:00' },
        },
      },
    }),
  )

  const result = await service.getStore()

  assert.equal(result.loja_aberta, false)
  assert.equal(result.loja_status_motivo, 'schedule_unavailable')
})

test('createOrder deve bloquear pedido quando a loja estiver fechada pelo horario automatico', async () => {
  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'
  const { prisma } = createOrderPrismaMock({
    storeConfig: {
      loja_aberta: true,
      horario_automatico_ativo: true,
      horario_funcionamento: {
        sunday: { enabled: false, open: '09:00', close: '18:00' },
        monday: { enabled: false, open: '09:00', close: '18:00' },
        tuesday: { enabled: false, open: '09:00', close: '18:00' },
        wednesday: { enabled: false, open: '09:00', close: '18:00' },
        thursday: { enabled: false, open: '09:00', close: '18:00' },
        friday: { enabled: false, open: '09:00', close: '18:00' },
        saturday: { enabled: false, open: '09:00', close: '18:00' },
      },
      taxa_entrega_padrao: '0.00',
    },
  })
  const service = publicStoreService(prisma)

  try {
    await assert.rejects(
      () =>
        service.createOrder({
          cliente_session_token: signToken(
            {
              purpose: 'customer_session',
              customer_id: null,
              telefone_whatsapp: '11999999999',
              nome: 'Maria Teste',
              endereco: {
                rua: 'Rua das Flores',
                numero: '20',
                bairro: 'Centro',
                cidade: 'Sapiranga',
              },
            },
            'test-secret',
            3600,
          ),
          metodo_pagamento: 'pix',
          itens: [{ produto_id: 1, quantidade: 1 }],
        }),
      /Loja fechada no momento/i,
    )
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalSecret
  }
})

test('createOrder deve criar pedido pix aguardando pagamento de forma persistente', async () => {
  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const { prisma, calls } = createOrderPrismaMock()
  const notifications = []
  const service = publicStoreService(prisma, {
    whatsappNotifier: {
      notifyOrderCreatedSafe(payload) {
        notifications.push(payload)
      },
    },
  })

  const sessionToken = signToken(
    {
      purpose: 'customer_session',
      customer_id: null,
      telefone_whatsapp: '11999999999',
      nome: 'Maria Pix',
      endereco: {
        rua: 'Rua das Flores',
        numero: '20',
        bairro: 'Centro',
        cidade: 'Sapiranga',
      },
    },
    process.env.JWT_SECRET,
    3600,
  )

  try {
    const result = await service.createOrder({
      cliente_session_token: sessionToken,
      metodo_pagamento: 'pix',
      itens: [{ produto_id: 1, quantidade: 2 }],
    })

    assert.equal(calls.pedidoCreate.metodo_pagamento, 'pix')
    assert.equal(calls.pedidoCreate.status_pagamento, 'pendente')
    assert.equal(result.metodo_pagamento, 'pix')
    assert.equal(result.status_pagamento, 'pendente')
    assert.equal(calls.createMany.length, 1)
    assert.equal(calls.createMany[0].nome_snapshot, 'Brigadeiro')
    assert.equal(notifications.length, 1)
    assert.equal(notifications[0].order.status_pagamento, 'pendente')
    assert.equal(calls.orderAuditCreate[0].acao, 'pedido_criado')
    assert.equal(calls.orderAuditCreate[0].origem, 'customer')
  } finally {
    process.env.JWT_SECRET = originalSecret
  }
})

test('createOrder deve publicar evento SSE administrativo para novo pedido', async () => {
  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const { prisma } = createOrderPrismaMock()
  const events = []
  const service = publicStoreService(prisma, {
    adminEvents: {
      publish(eventName, payload) {
        events.push({ eventName, payload })
      },
    },
  })

  const sessionToken = signToken(
    {
      purpose: 'customer_session',
      customer_id: null,
      telefone_whatsapp: '11999999999',
      nome: 'Maria Tempo Real',
      endereco: {
        rua: 'Rua das Flores',
        numero: '20',
        bairro: 'Centro',
        cidade: 'Sapiranga',
      },
    },
    process.env.JWT_SECRET,
    3600,
  )

  try {
    await service.createOrder({
      cliente_session_token: sessionToken,
      metodo_pagamento: 'pix',
      itens: [{ produto_id: 1, quantidade: 1 }],
    })

    assert.equal(events.length, 1)
    assert.equal(events[0].eventName, 'order.created')
    assert.equal(events[0].payload.orderId, 41)
    assert.equal(events[0].payload.paymentMethod, 'pix')
    assert.equal(events[0].payload.deliveryStatus, 'pendente')
    assert.equal(events[0].payload.paymentStatus, 'pendente')
    assert.equal(events[0].payload.total, '12.00')
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalSecret
  }
})

test('createOrder deve ignorar preco, frete, total e status enviados pelo cliente', async () => {
  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const { prisma, calls } = createOrderPrismaMock({
    storeConfig: {
      loja_aberta: true,
      taxa_entrega_padrao: '8.00',
    },
  })

  const service = publicStoreService(prisma)

  const sessionToken = signToken(
    {
      purpose: 'customer_session',
      customer_id: null,
      telefone_whatsapp: '11999999999',
      nome: 'Maria Segura',
      endereco: {
        rua: 'Rua das Flores',
        numero: '20',
        bairro: 'Centro',
        cidade: 'Sapiranga',
      },
    },
    process.env.JWT_SECRET,
    3600,
  )

  try {
    const result = await service.createOrder({
      cliente_session_token: sessionToken,
      metodo_pagamento: 'pix',
      itens: [{ produto_id: 1, quantidade: 2 }],
      valor_entrega: '0.01',
      valor_total: '0.02',
      status_pagamento: 'pago',
      desconto: '999.99',
      preco_unitario: '0.01',
    })

    assert.equal(calls.pedidoCreate.valor_itens, '24.00')
    assert.equal(calls.pedidoCreate.valor_entrega, '8.00')
    assert.equal(calls.pedidoCreate.valor_total, '32.00')
    assert.equal(calls.pedidoCreate.status_pagamento, 'pendente')
    assert.equal(result.valor_total, '32.00')
    assert.equal(result.status_pagamento, 'pendente')
  } finally {
    process.env.JWT_SECRET = originalSecret
  }
})

test('createOrder deve criar checkout do Asaas e devolver checkout_url', async () => {
  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const { prisma, calls } = createOrderPrismaMock()
  const asaas = {
    isConfigured() {
      return true
    },
    buildCheckoutUrl(id) {
      return `https://sandbox.asaas.com/checkoutSession/show?id=${id}`
    },
    createCheckout(payload) {
      calls.asaasCheckout = payload
      return Promise.resolve({
        id: 'chk_test_123',
        checkout_url: 'https://sandbox.asaas.com/checkoutSession/show?id=chk_test_123',
        expires_at: '2026-03-23T19:00:00.000Z',
      })
    },
  }

  const service = publicStoreService(prisma, { asaas })

  const sessionToken = signToken(
    {
      purpose: 'customer_session',
      customer_id: null,
      telefone_whatsapp: '11999999999',
      nome: 'Maria Checkout',
      endereco: {
        rua: 'Rua das Flores',
        numero: '20',
        bairro: 'Centro',
        cidade: 'Sapiranga',
      },
    },
    process.env.JWT_SECRET,
    3600,
  )

  try {
    const result = await service.createOrder({
      cliente_session_token: sessionToken,
      metodo_pagamento: 'asaas_checkout',
      itens: [{ produto_id: 1, quantidade: 2 }],
    })

    assert.equal(calls.pedidoCreate.metodo_pagamento, 'asaas_checkout')
    assert.equal(calls.asaasCheckout.orderId, 41)
    assert.equal(calls.asaasCheckout.paymentMethod, 'asaas_checkout')
    assert.equal(calls.pedidoUpdate[0].data.id_transacao_gateway, 'chk_test_123')
    assert.equal(calls.pedidoUpdate[0].data.expira_em.toISOString(), '2026-03-23T19:00:00.000Z')
    assert.equal(result.id_transacao_gateway, 'chk_test_123')
    assert.equal(result.checkout_url, 'https://sandbox.asaas.com/checkoutSession/show?id=chk_test_123')
    assert.deepEqual(calls.orderAuditCreate.map((entry) => entry.acao), ['pedido_criado', 'checkout_criado'])
  } finally {
    process.env.JWT_SECRET = originalSecret
  }
})

test('handleAsaasWebhook deve atualizar o status do pedido pelo checkoutId', async () => {
  const { prisma, orders, calls } = createOrderPrismaMock()
  orders.set(41, {
    id: 41,
    metodo_pagamento: 'asaas_checkout',
    status_pagamento: 'pendente',
    status_entrega: 'pendente',
    id_transacao_gateway: 'chk_test_123',
  })

  let validatedHeader = null
  const service = publicStoreService(prisma, {
    asaas: {
      validateWebhook(headers) {
        validatedHeader = headers['asaas-access-token']
      },
      mapCheckoutEvent(eventName) {
        if (eventName === 'CHECKOUT_PAID') {
          return { status_pagamento: 'pago' }
        }
        return null
      },
      buildCheckoutUrl(id) {
        return `https://sandbox.asaas.com/checkoutSession/show?id=${id}`
      },
    },
  })

  const result = await service.handleAsaasWebhook(
    {
      event: 'CHECKOUT_PAID',
      checkout: {
        id: 'chk_test_123',
      },
    },
    {
      'asaas-access-token': 'token-teste',
    },
  )

  assert.equal(validatedHeader, 'token-teste')
  assert.equal(result.processed, true)
  assert.equal(result.applied, true)
  assert.equal(orders.get(41).status_pagamento, 'pago')
  assert.equal(calls.orderAuditCreate.at(-1).acao, 'status_atualizado_por_webhook')
  assert.equal(calls.orderAuditCreate.at(-1).origem, 'asaas_webhook')
})

test('handleAsaasWebhook deve ignorar cancelamento apos pagamento confirmado', async () => {
  const { prisma, orders } = createOrderPrismaMock()
  orders.set(41, {
    id: 41,
    metodo_pagamento: 'asaas_checkout',
    status_pagamento: 'pago',
    status_entrega: 'pendente',
    id_transacao_gateway: 'chk_test_123',
  })

  const service = publicStoreService(prisma, {
    asaas: {
      validateWebhook() {},
      mapCheckoutEvent(eventName) {
        if (eventName === 'CHECKOUT_CANCELED') {
          return {
            status_pagamento: 'cancelado',
            status_entrega: 'cancelado',
          }
        }
        return null
      },
    },
  })

  const result = await service.handleAsaasWebhook(
    {
      event: 'CHECKOUT_CANCELED',
      checkout: {
        id: 'chk_test_123',
      },
    },
    {
      'asaas-access-token': 'token-teste',
    },
  )

  assert.equal(result.processed, true)
  assert.equal(result.applied, false)
  assert.equal(orders.get(41).status_pagamento, 'pago')
  assert.equal(orders.get(41).status_entrega, 'pendente')
})

test('handleAsaasWebhook deve ignorar pagamento quando o evento pago chegar apos cancelamento no mesmo checkout', async () => {
  const { prisma, orders } = createOrderPrismaMock()
  orders.set(41, {
    id: 41,
    metodo_pagamento: 'asaas_checkout',
    status_pagamento: 'cancelado',
    status_entrega: 'cancelado',
    id_transacao_gateway: 'chk_test_123',
  })

  const service = publicStoreService(prisma, {
    asaas: {
      validateWebhook() {},
      mapCheckoutEvent(eventName) {
        if (eventName === 'CHECKOUT_PAID') {
          return { status_pagamento: 'pago' }
        }
        return null
      },
    },
  })

  const result = await service.handleAsaasWebhook(
    {
      event: 'CHECKOUT_PAID',
      checkout: {
        id: 'chk_test_123',
      },
    },
    {
      'asaas-access-token': 'token-teste',
    },
  )

  assert.equal(result.processed, true)
  assert.equal(result.applied, false)
  assert.equal(orders.get(41).status_pagamento, 'cancelado')
  assert.equal(orders.get(41).status_entrega, 'cancelado')
})

test('handleAsaasWebhook deve marcar checkout expirado sem permitir retorno para pago no mesmo link', async () => {
  const { prisma, orders } = createOrderPrismaMock()
  orders.set(41, {
    id: 41,
    metodo_pagamento: 'asaas_checkout',
    status_pagamento: 'pendente',
    status_entrega: 'pendente',
    id_transacao_gateway: 'chk_test_123',
  })

  const service = publicStoreService(prisma, {
    asaas: {
      validateWebhook() {},
      mapCheckoutEvent(eventName) {
        if (eventName === 'CHECKOUT_EXPIRED') {
          return {
            status_pagamento: 'expirado',
            status_entrega: 'cancelado',
          }
        }
        if (eventName === 'CHECKOUT_PAID') {
          return { status_pagamento: 'pago' }
        }
        return null
      },
    },
  })

  const expiredResult = await service.handleAsaasWebhook(
    {
      event: 'CHECKOUT_EXPIRED',
      checkout: {
        id: 'chk_test_123',
      },
    },
    {
      'asaas-access-token': 'token-teste',
    },
  )

  assert.equal(expiredResult.processed, true)
  assert.equal(expiredResult.applied, true)
  assert.equal(orders.get(41).status_pagamento, 'expirado')
  assert.equal(orders.get(41).status_entrega, 'cancelado')

  const paidResult = await service.handleAsaasWebhook(
    {
      event: 'CHECKOUT_PAID',
      checkout: {
        id: 'chk_test_123',
      },
    },
    {
      'asaas-access-token': 'token-teste',
    },
  )

  assert.equal(paidResult.processed, true)
  assert.equal(paidResult.applied, false)
  assert.equal(orders.get(41).status_pagamento, 'expirado')
})

test('getOrderStatusSummary deve retornar apenas status resumido com checkout_url pendente', async () => {
  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const { prisma, orders } = createOrderPrismaMock()
  orders.set(41, {
    id: 41,
    cliente_id: 21,
    metodo_pagamento: 'asaas_checkout',
    status_pagamento: 'pendente',
    status_entrega: 'pendente',
    id_transacao_gateway: 'chk_test_123',
  })

  const service = publicStoreService(prisma, {
    asaas: {
      buildCheckoutUrl(id) {
        return `https://sandbox.asaas.com/checkoutSession/show?id=${id}`
      },
    },
  })

  const sessionToken = signToken(
    {
      purpose: 'customer_session',
      customer_id: 21,
      telefone_whatsapp: '11999999999',
      nome: 'Maria Resumo',
    },
    process.env.JWT_SECRET,
    3600,
  )

  try {
    const result = await service.getOrderStatusSummary(41, sessionToken)

    assert.deepEqual(result, {
      id: 41,
      metodo_pagamento: 'asaas_checkout',
      status_entrega: 'pendente',
      status_pagamento: 'pendente',
      id_transacao_gateway: 'chk_test_123',
      checkout_url: 'https://sandbox.asaas.com/checkoutSession/show?id=chk_test_123',
    })
  } finally {
    process.env.JWT_SECRET = originalSecret
  }
})

test('getOrderStatusSummary deve retornar 404 quando o pedido pertence a outro cliente', async () => {
  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const { prisma, orders } = createOrderPrismaMock()
  orders.set(41, {
    id: 41,
    cliente_id: 99,
    clientes: { telefone_whatsapp: '11999999998' },
    metodo_pagamento: 'asaas_checkout',
    status_pagamento: 'pendente',
    status_entrega: 'pendente',
    id_transacao_gateway: 'chk_test_123',
  })

  const service = publicStoreService(prisma)

  const sessionToken = signToken(
    {
      purpose: 'customer_session',
      customer_id: 21,
      telefone_whatsapp: '11999999999',
      nome: 'Maria Resumo',
    },
    process.env.JWT_SECRET,
    3600,
  )

  try {
    await assert.rejects(
      service.getOrderStatusSummary(41, sessionToken),
      /Pedido nao encontrado/,
    )
  } finally {
    process.env.JWT_SECRET = originalSecret
  }
})

test('getCustomerOrder deve validar ownership pelo telefone quando a sessao nao tem customer_id', async () => {
  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const { prisma, orders } = createOrderPrismaMock()
  orders.set(41, {
    id: 41,
    cliente_id: 21,
    clientes: { id: 21, nome: 'Maria', telefone_whatsapp: '11999999999' },
    metodo_pagamento: 'asaas_checkout',
    status_pagamento: 'pendente',
    status_entrega: 'pendente',
    id_transacao_gateway: 'chk_test_123',
    enderecos: null,
    itens_pedido: [],
  })

  const service = publicStoreService(prisma)

  const sessionToken = signToken(
    {
      purpose: 'customer_session',
      customer_id: null,
      telefone_whatsapp: '11999999999',
      nome: 'Maria Resumo',
    },
    process.env.JWT_SECRET,
    3600,
  )

  try {
    const result = await service.getCustomerOrder(sessionToken, 41)
    assert.equal(result.id, 41)
  } finally {
    process.env.JWT_SECRET = originalSecret
  }
})

test('retryAsaasCheckout deve gerar novo checkout para pedido do cliente', async () => {
  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const { prisma, orders, calls } = createOrderPrismaMock()
  const events = []
  orders.set(41, {
    id: 41,
    cliente_id: 21,
    criado_em: '2026-03-16T18:00:00.000Z',
    metodo_pagamento: 'asaas_checkout',
    status_pagamento: 'cancelado',
    status_entrega: 'cancelado',
    id_transacao_gateway: 'chk_old',
    valor_total: '32.00',
    valor_entrega: '8.00',
    itens_pedido: [
      {
        produto_id: 1,
        quantidade: 2,
        preco_unitario: '12.00',
        subtotal: '24.00',
        produtos: {
          id: 1,
          nome_doce: 'Brigadeiro',
          preco: '12.00',
        },
      },
    ],
  })

  const service = publicStoreService(prisma, {
    adminEvents: {
      publish(eventName, payload) {
        events.push({ eventName, payload })
      },
    },
    asaas: {
      isConfigured() {
        return true
      },
      buildCheckoutUrl(id) {
        return `https://sandbox.asaas.com/checkoutSession/show?id=${id}`
      },
      createCheckout(payload) {
        calls.asaasCheckout = payload
        return Promise.resolve({
          id: 'chk_retry_456',
          checkout_url: 'https://sandbox.asaas.com/checkoutSession/show?id=chk_retry_456',
        })
      },
    },
  })

  const sessionToken = signToken(
    {
      purpose: 'customer_session',
      customer_id: 21,
      telefone_whatsapp: '11999999999',
      nome: 'Maria Retry',
    },
    process.env.JWT_SECRET,
    3600,
  )

  try {
    const result = await service.retryAsaasCheckout(sessionToken, 41)

    assert.equal(calls.asaasCheckout.orderId, 41)
    assert.equal(calls.asaasCheckout.items.length, 2)
    assert.equal(orders.get(41).id_transacao_gateway, 'chk_retry_456')
    assert.equal(orders.get(41).status_pagamento, 'pendente')
    assert.equal(orders.get(41).status_entrega, 'pendente')
    assert.equal(result.checkout_url, 'https://sandbox.asaas.com/checkoutSession/show?id=chk_retry_456')
    assert.equal(events.length, 1)
    assert.equal(events[0].eventName, 'order.updated')
    assert.equal(events[0].payload.orderId, 41)
    assert.equal(events[0].payload.createdAt, '2026-03-16T18:00:00.000Z')
    assert.equal(events[0].payload.paymentStatus, 'pendente')
    assert.equal(events[0].payload.deliveryStatus, 'pendente')
    assert.equal(events[0].payload.total, '32.00')
  } finally {
    process.env.JWT_SECRET = originalSecret
  }
})

test('retryAsaasCheckout deve reabrir pedido expirado com novo checkout', async () => {
  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const { prisma, orders, calls } = createOrderPrismaMock()
  orders.set(41, {
    id: 41,
    cliente_id: 21,
    metodo_pagamento: 'asaas_checkout',
    status_pagamento: 'expirado',
    status_entrega: 'cancelado',
    id_transacao_gateway: 'chk_old',
    valor_total: '32.00',
    valor_entrega: '8.00',
    itens_pedido: [
      {
        produto_id: 1,
        quantidade: 2,
        preco_unitario: '12.00',
        subtotal: '24.00',
        produtos: {
          id: 1,
          nome_doce: 'Brigadeiro',
          preco: '12.00',
        },
      },
    ],
  })

  const service = publicStoreService(prisma, {
    asaas: {
      isConfigured() {
        return true
      },
      createCheckout(payload) {
        calls.asaasCheckout = payload
        return Promise.resolve({
          id: 'chk_retry_expired',
          checkout_url: 'https://sandbox.asaas.com/checkoutSession/show?id=chk_retry_expired',
          expires_at: '2026-03-23T19:00:00.000Z',
        })
      },
    },
  })

  const sessionToken = signToken(
    {
      purpose: 'customer_session',
      customer_id: 21,
      telefone_whatsapp: '11999999999',
      nome: 'Maria Retry',
    },
    process.env.JWT_SECRET,
    3600,
  )

  try {
    const result = await service.retryAsaasCheckout(sessionToken, 41)

    assert.equal(calls.asaasCheckout.orderId, 41)
    assert.equal(orders.get(41).status_pagamento, 'pendente')
    assert.equal(orders.get(41).status_entrega, 'pendente')
    assert.equal(result.checkout_url, 'https://sandbox.asaas.com/checkoutSession/show?id=chk_retry_expired')
  } finally {
    process.env.JWT_SECRET = originalSecret
  }
})

test('receiveAsaasWebhook deve registrar event.id e processar em segundo plano', async () => {
  const { prisma, orders, webhookEvents } = createOrderPrismaMock()
  const scheduledTasks = []
  const events = []
  orders.set(41, {
    id: 41,
    criado_em: '2026-03-16T18:00:00.000Z',
    valor_total: '12.00',
    metodo_pagamento: 'asaas_checkout',
    status_pagamento: 'pendente',
    status_entrega: 'pendente',
    id_transacao_gateway: 'chk_test_123',
  })

  const service = publicStoreService(prisma, {
    adminEvents: {
      publish(eventName, payload) {
        events.push({ eventName, payload })
      },
    },
    scheduleTask(task) {
      scheduledTasks.push(task)
    },
    logger: {
      error() {},
    },
    asaas: {
      validateWebhook() {},
      mapCheckoutEvent(eventName) {
        if (eventName === 'CHECKOUT_PAID') {
          return { status_pagamento: 'pago' }
        }
        return null
      },
    },
  })

  const result = await service.receiveAsaasWebhook(
    {
      id: 'evt_test_001',
      event: 'CHECKOUT_PAID',
      checkout: {
        id: 'chk_test_123',
      },
    },
    {
      'asaas-access-token': 'token-teste',
    },
  )

  assert.equal(result.received, true)
  assert.equal(result.duplicate, false)
  assert.equal(result.queued, true)
  assert.equal(scheduledTasks.length, 1)
  assert.equal(webhookEvents.size, 1)

  await scheduledTasks[0]()

  const storedEvent = [...webhookEvents.values()][0]
  assert.equal(storedEvent.pedido_id, 41)
  assert.equal(storedEvent.status, 'processado')
  assert.equal(orders.get(41).status_pagamento, 'pago')
  assert.equal(events.length, 1)
  assert.equal(events[0].eventName, 'order.updated')
  assert.equal(events[0].payload.orderId, 41)
  assert.equal(events[0].payload.createdAt, '2026-03-16T18:00:00.000Z')
  assert.equal(events[0].payload.paymentStatus, 'pago')
  assert.equal(events[0].payload.deliveryStatus, 'pendente')
  assert.equal(events[0].payload.total, '12.00')
})
