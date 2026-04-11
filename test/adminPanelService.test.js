const test = require('node:test')
const assert = require('node:assert/strict')

const { adminPanelService } = require('../src/services/adminPanelService')

function createPrismaMock() {
  const calls = {
    findMany: [],
    count: [],
    findUnique: [],
    auditFindMany: [],
  }

  return {
    calls,
    prisma: {
      categorias: {
        findMany() {
          return Promise.resolve([])
        },
      },
      produtos: {
        findMany() {
          return Promise.resolve([])
        },
      },
      pedidos: {
        findUnique(args) {
          calls.findUnique.push(args)
          return Promise.resolve({ id: args?.where?.id || 1 })
        },
        findMany(args) {
          calls.findMany.push(args)
          return Promise.resolve([])
        },
        count(args) {
          calls.count.push(args)
          return Promise.resolve(0)
        },
      },
      pedidos_auditoria: {
        findMany(args) {
          calls.auditFindMany.push(args)
          return Promise.resolve([])
        },
      },
      $transaction(actions) {
        return Promise.all(actions)
      },
    },
  }
}

test('getCatalogSnapshot devolve categorias e produtos com imagem leve e contagem agregada', async () => {
  const calls = {
    categoriasFindMany: [],
    produtosFindMany: [],
  }
  const prisma = {
    categorias: {
      findMany(args) {
        calls.categoriasFindMany.push(args)
        return Promise.resolve([
          { id: 2, nome: 'Bolos', ordem_exibicao: 1 },
          { id: 3, nome: 'Brigadeiros', ordem_exibicao: 2 },
        ])
      },
    },
    produtos: {
      findMany(args) {
        calls.produtosFindMany.push(args)
        return Promise.resolve([
          {
            id: 31,
            categoria_id: 2,
            nome_doce: 'Bolo de pote',
            descricao: 'Chocolate',
            preco: '15.00',
            imagem_url: 'data:image/png;base64,aGVsbG8=',
            estoque_disponivel: 4,
            ativo: true,
            categorias: { id: 2, nome: 'Bolos' },
          },
          {
            id: 32,
            categoria_id: 2,
            nome_doce: 'Bolo de cenoura',
            descricao: null,
            preco: '18.00',
            imagem_url: null,
            estoque_disponivel: 2,
            ativo: true,
            categorias: { id: 2, nome: 'Bolos' },
          },
        ])
      },
    },
    $transaction(actions) {
      return Promise.all(actions)
    },
  }
  const service = adminPanelService(prisma)

  const result = await service.getCatalogSnapshot()

  assert.equal(calls.categoriasFindMany.length, 1)
  assert.equal(calls.produtosFindMany.length, 1)
  assert.deepEqual(result.categorias, [
    { id: 2, nome: 'Bolos', ordem_exibicao: 1, _count: { produtos: 2 } },
    { id: 3, nome: 'Brigadeiros', ordem_exibicao: 2, _count: { produtos: 0 } },
  ])
  assert.match(result.produtos[0].imagem_url, /^\/produtos\/31\/imagem\?v=[a-f0-9]{12}$/)
  assert.equal(result.produtos[1].imagem_url, null)
})

function createCustomerListPrismaMock(customers = []) {
  const calls = {
    findMany: [],
  }

  return {
    calls,
    prisma: {
      clientes: {
        findMany(args) {
          calls.findMany.push(args)
          return Promise.resolve(customers)
        },
      },
    },
  }
}

test('listOrders usa id exato quando a busca e um numero curto de pedido', async () => {
  const { prisma, calls } = createPrismaMock()
  const service = adminPanelService(prisma)

  await service.listOrders({ period: 'all', search: '5' })

  assert.deepEqual(calls.findMany[0].where, {
    OR: [{ id: 5 }],
  })
  assert.deepEqual(calls.count[0].where, {
    OR: [{ id: 5 }],
  })
})

test('listOrders usa telefone quando a busca numerica parece um WhatsApp', async () => {
  const { prisma, calls } = createPrismaMock()
  const service = adminPanelService(prisma)

  await service.listOrders({ period: 'all', search: '11999995555' })

  assert.deepEqual(calls.findMany[0].where, {
    OR: [
      {
        clientes: {
          is: {
            telefone_whatsapp: { contains: '11999995555' },
          },
        },
      },
    ],
  })
  assert.deepEqual(calls.count[0].where, {
    OR: [
      {
        clientes: {
          is: {
            telefone_whatsapp: { contains: '11999995555' },
          },
        },
      },
    ],
  })
})

test('listOrders permite forcar busca por pedido com prefixo #', async () => {
  const { prisma, calls } = createPrismaMock()
  const service = adminPanelService(prisma)

  await service.listOrders({ period: 'all', search: '#42' })

  assert.deepEqual(calls.findMany[0].where, {
    OR: [{ id: 42 }],
  })
  assert.deepEqual(calls.count[0].where, {
    OR: [{ id: 42 }],
  })
})

test('listOrders filtra pedidos do dia com intervalo fechado de hoje', async () => {
  const { prisma, calls } = createPrismaMock()
  const service = adminPanelService(prisma)
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const today = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const result = await service.listOrders({ period: 'today' })

  assert.deepEqual(calls.findMany[0].where, {
    criado_em: {
      gte: new Date(year, month - 1, day, 0, 0, 0, 0),
      lte: new Date(year, month - 1, day, 23, 59, 59, 999),
    },
  })
  assert.deepEqual(calls.count[0].where, {
    criado_em: {
      gte: new Date(year, month - 1, day, 0, 0, 0, 0),
      lte: new Date(year, month - 1, day, 23, 59, 59, 999),
    },
  })
  assert.equal(result.meta.filters.period, 'today')
  assert.equal(result.meta.filters.label, 'Pedidos do dia')
  assert.equal(result.meta.filters.from, today)
  assert.equal(result.meta.filters.to, today)
})

test('listOrders prioriza intervalo exato enviado pela interface', async () => {
  const { prisma, calls } = createPrismaMock()
  const service = adminPanelService(prisma)

  const result = await service.listOrders({
    period: 'today',
    from: '2026-03-25',
    to: '2026-03-25',
    fromAt: '2026-03-25T03:00:00.000Z',
    toAt: '2026-03-26T02:59:59.999Z',
  })

  assert.deepEqual(calls.findMany[0].where, {
    criado_em: {
      gte: new Date('2026-03-25T03:00:00.000Z'),
      lte: new Date('2026-03-26T02:59:59.999Z'),
    },
  })
  assert.deepEqual(calls.count[0].where, {
    criado_em: {
      gte: new Date('2026-03-25T03:00:00.000Z'),
      lte: new Date('2026-03-26T02:59:59.999Z'),
    },
  })
  assert.equal(result.meta.filters.period, 'today')
  assert.equal(result.meta.filters.from, '2026-03-25')
  assert.equal(result.meta.filters.to, '2026-03-25')
})

test('dashboard calcula tendencias comparando com ontem', async () => {
  const calls = {
    count: [],
    findMany: [],
  }
  const countResults = [8, 3, 2, 2, 1, 5]
  const revenueResults = [
    [{ valor_total: '30.00' }, { valor_total: '50.00' }],
    [{ valor_total: '20.00' }, { valor_total: '20.00' }],
  ]
  const prisma = {
    pedidos: {
      count(args) {
        calls.count.push(args)
        return Promise.resolve(countResults[calls.count.length - 1] ?? 0)
      },
      findMany(args) {
        calls.findMany.push(args)
        return Promise.resolve(revenueResults[calls.findMany.length - 1] ?? [])
      },
    },
    $transaction(actions) {
      return Promise.all(actions)
    },
  }
  const service = adminPanelService(prisma, {
    nowProvider: () => new Date('2026-03-28T12:00:00.000Z'),
  })

  const result = await service.dashboard({
    period: 'today',
    from: '2026-03-28',
    to: '2026-03-28',
    fromAt: '2026-03-28T00:00:00.000Z',
    toAt: '2026-03-28T23:59:59.999Z',
  })

  assert.equal(result.data.totalPedidos, 8)
  assert.deepEqual(result.data.status, {
    pendentes: 3,
    preparando: 2,
    entregues: 2,
    cancelados: 1,
  })
  assert.equal(result.data.faturamento, 80)
  assert.deepEqual(result.data.comparison, {
    totalPedidos: { current: 8, previous: 5, delta: 3, percent: 60 },
    faturamento: { current: 80, previous: 40, delta: 40, percent: 100 },
    ticketMedio: { current: 10, previous: 8, delta: 2, percent: 25 },
  })
  assert.equal(calls.count.length, 6)
  assert.equal(calls.findMany.length, 2)
})

test('listCustomers permite localizar clientes pelo numero de pedido', async () => {
  const { prisma, calls } = createCustomerListPrismaMock([])
  const service = adminPanelService(prisma)

  await service.listCustomers({ period: 'all', search: '#42' })

  assert.deepEqual(calls.findMany[0].where, {
    OR: [
      {
        pedidos: {
          some: { id: 42 },
        },
      },
    ],
  })
})

test('listCustomers encontra nome sem acento usando fallback tolerante', async () => {
  const calls = []
  const prisma = {
    clientes: {
      findMany(args) {
        calls.push(args)
        if (calls.length === 1) return Promise.resolve([])
        return Promise.resolve([
          {
            id: 7,
            nome: 'João Moura',
            telefone_whatsapp: '5511985711759',
            whatsapp_lid: null,
            criado_em: '2026-03-01T10:00:00.000Z',
            enderecos: [{ id: 1, rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Porto Alegre' }],
            pedidos: [
              { id: 77, valor_total: '40.00', metodo_pagamento: 'pix', status_entrega: 'entregue', criado_em: '2026-03-15T12:00:00.000Z' },
            ],
          },
        ])
      },
    },
  }
  const service = adminPanelService(prisma)

  const result = await service.listCustomers({ period: 'all', search: 'Joao' })

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].nome, 'João Moura')
  assert.equal(calls.length, 2)
  assert.equal(calls[1].where, undefined)
})

test('listCustomers filtra por segmento recorrente e resume a carteira CRM', async () => {
  const { prisma } = createCustomerListPrismaMock([
    {
      id: 1,
      nome: 'Maria Recorrente',
      telefone_whatsapp: '5511999990000',
      whatsapp_lid: null,
      criado_em: '2026-01-10T10:00:00.000Z',
      enderecos: [{ id: 11, rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Sao Paulo' }],
      pedidos: [
        { id: 101, valor_total: '80.00', metodo_pagamento: 'pix', status_entrega: 'entregue', criado_em: '2026-03-15T12:00:00.000Z' },
        { id: 102, valor_total: '70.00', metodo_pagamento: 'pix', status_entrega: 'entregue', criado_em: '2026-03-10T12:00:00.000Z' },
        { id: 103, valor_total: '60.00', metodo_pagamento: 'cartao', status_entrega: 'entregue', criado_em: '2026-03-01T12:00:00.000Z' },
        { id: 104, valor_total: '50.00', metodo_pagamento: 'pix', status_entrega: 'entregue', criado_em: '2026-02-20T12:00:00.000Z' },
        { id: 105, valor_total: '50.00', metodo_pagamento: 'pix', status_entrega: 'entregue', criado_em: '2026-02-10T12:00:00.000Z' },
      ],
    },
    {
      id: 2,
      nome: 'Lead sem pedido',
      telefone_whatsapp: '5511988880000',
      whatsapp_lid: null,
      criado_em: '2026-03-01T10:00:00.000Z',
      enderecos: [],
      pedidos: [],
    },
    {
      id: 3,
      nome: 'Cliente Inativo',
      telefone_whatsapp: '5511977770000',
      whatsapp_lid: null,
      criado_em: '2025-11-01T10:00:00.000Z',
      enderecos: [],
      pedidos: [
        { id: 201, valor_total: '40.00', metodo_pagamento: 'dinheiro', status_entrega: 'entregue', criado_em: '2025-12-20T12:00:00.000Z' },
      ],
    },
  ])
  const service = adminPanelService(prisma)

  const result = await service.listCustomers({ period: 'all', segment: 'recorrente', sort: 'total_spent_desc' })

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].nome, 'Maria Recorrente')
  assert.equal(result.items[0].segment, 'recorrente')
  assert.equal(result.items[0].total_spent, 310)
  assert.equal(result.meta.summary.total_customers, 1)
  assert.equal(result.meta.summary.recurring_customers, 1)
  assert.equal(result.meta.summary.revenue_total, 310)
})

test('recencia do cliente considera a virada do dia no fuso da loja', async () => {
  const customer = {
    id: 7,
    nome: 'João Moura',
    telefone_whatsapp: '5551985711759',
    whatsapp_lid: null,
    criado_em: '2026-03-06T12:00:00.000Z',
    enderecos: [{ id: 1, rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Porto Alegre' }],
    pedidos: [
      {
        id: 38,
        valor_total: '26.90',
        metodo_pagamento: 'pix',
        status_entrega: 'cancelado',
        criado_em: '2026-03-25T01:48:15.000Z',
      },
    ],
  }

  const prisma = {
    clientes: {
      findMany() {
        return Promise.resolve([customer])
      },
      findUnique() {
        return Promise.resolve(customer)
      },
    },
  }
  const service = adminPanelService(prisma, {
    nowProvider: () => new Date('2026-03-25T15:00:00.000Z'),
  })

  const list = await service.listCustomers({ period: 'all' })
  const detail = await service.getCustomer(7)

  assert.equal(list.items[0].days_since_last_order, 1)
  assert.equal(detail.days_since_last_order, 1)
  assert.equal(detail.last_order_at, '2026-03-25T01:48:15.000Z')
})

test('getOrderAudit devolve historico ordenado do pedido', async () => {
  const { prisma, calls } = createPrismaMock()
  prisma.pedidos_auditoria.findMany = (args) => {
    calls.auditFindMany.push(args)
    return Promise.resolve([
      {
        id: 11,
        pedido_id: 42,
        origem: 'asaas_webhook',
        ator: 'event:evt_1',
        acao: 'status_atualizado_por_webhook',
        status_pagamento_anterior: 'pendente',
        status_pagamento_atual: 'pago',
        status_entrega_anterior: 'pendente',
        status_entrega_atual: 'pendente',
        detalhes: { event: 'CHECKOUT_PAID' },
        criado_em: '2026-03-23T20:00:00.000Z',
      },
    ])
  }

  const service = adminPanelService(prisma)
  const result = await service.getOrderAudit(42)

  assert.equal(calls.findUnique[0].where.id, 42)
  assert.deepEqual(calls.auditFindMany[0], {
    where: { pedido_id: 42 },
    orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
  })
  assert.equal(result.length, 1)
  assert.equal(result[0].acao, 'status_atualizado_por_webhook')
  assert.equal(result[0].detalhes.event, 'CHECKOUT_PAID')
})

test('listOrders encontra cliente com busca tolerante quando a busca literal falha', async () => {
  const calls = {
    findMany: [],
    count: [],
  }
  const prisma = {
    pedidos: {
      findMany(args) {
        calls.findMany.push(args)
        if (calls.findMany.length === 1) return Promise.resolve([])
        return Promise.resolve([
          {
            id: 26,
            criado_em: '2026-03-16T15:26:29.000Z',
            valor_total: '26.90',
            metodo_pagamento: 'pix',
            status_entrega: 'pendente',
            observacoes: null,
            clientes: { id: 9, nome: 'João Moura', telefone_whatsapp: '5511985711759' },
            enderecos: { id: 10, rua: 'Rua Prudente de Moraes', numero: '413', bairro: 'Guarani', cidade: 'Novo Hamburgo' },
            itens_pedido: [
              {
                id: 1,
                produto_id: 2,
                quantidade: 1,
                subtotal: '26.90',
                produtos: { id: 2, nome_doce: 'Bolo de Pote Ninho com Nutella' },
              },
            ],
          },
        ])
      },
      count(args) {
        calls.count.push(args)
        return Promise.resolve(0)
      },
    },
    $transaction(actions) {
      return Promise.all(actions)
    },
  }
  const service = adminPanelService(prisma)

  const result = await service.listOrders({ period: 'all', search: 'Joao' })

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].id, 26)
  assert.equal(calls.findMany.length, 2)
  assert.equal(calls.count.length, 1)
  assert.equal(calls.findMany[1].where, undefined)
})

test('getCustomer devolve detalhe CRM com favoritos e historico de pedidos', async () => {
  let capturedArgs = null
  const prisma = {
    clientes: {
      findUnique(args) {
        capturedArgs = args
        return Promise.resolve({
          id: 9,
          nome: 'Marina Recorrente',
          telefone_whatsapp: '5511966660000',
          whatsapp_lid: 'lid-9',
          criado_em: '2025-12-01T09:00:00.000Z',
          enderecos: [
            { id: 31, rua: 'Rua B', numero: '44', bairro: 'Centro', cidade: 'Porto Alegre', complemento: 'Ap 12', referencia: 'Esquina' },
          ],
          pedidos: [
            {
              id: 301,
              valor_total: '60.00',
              valor_entrega: '8.00',
              metodo_pagamento: 'pix',
              status_entrega: 'entregue',
              status_pagamento: 'pago',
              observacoes: 'Sem lactose',
              criado_em: '2026-03-14T16:00:00.000Z',
              enderecos: { id: 31, rua: 'Rua B', numero: '44', bairro: 'Centro', cidade: 'Porto Alegre', complemento: 'Ap 12', referencia: 'Esquina' },
              itens_pedido: [
                { id: 1, produto_id: 1, quantidade: 2, preco_unitario: '12.00', subtotal: '24.00', produtos: { id: 1, nome_doce: 'Brigadeiro', preco: '12.00' } },
                { id: 2, produto_id: 2, quantidade: 1, preco_unitario: '36.00', subtotal: '36.00', produtos: { id: 2, nome_doce: 'Torta de Limao', preco: '36.00' } },
              ],
            },
            {
              id: 302,
              valor_total: '55.00',
              valor_entrega: '7.00',
              metodo_pagamento: 'pix',
              status_entrega: 'entregue',
              status_pagamento: 'pago',
              observacoes: null,
              criado_em: '2026-03-05T16:00:00.000Z',
              enderecos: { id: 31, rua: 'Rua B', numero: '44', bairro: 'Centro', cidade: 'Porto Alegre', complemento: 'Ap 12', referencia: 'Esquina' },
              itens_pedido: [
                { id: 3, produto_id: 1, quantidade: 1, preco_unitario: '12.00', subtotal: '12.00', produtos: { id: 1, nome_doce: 'Brigadeiro', preco: '12.00' } },
                { id: 4, produto_id: 3, quantidade: 1, preco_unitario: '43.00', subtotal: '43.00', produtos: { id: 3, nome_doce: 'Cheesecake', preco: '43.00' } },
              ],
            },
            {
              id: 303,
              valor_total: '48.00',
              valor_entrega: '6.00',
              metodo_pagamento: 'cartao',
              status_entrega: 'entregue',
              status_pagamento: 'pago',
              observacoes: null,
              criado_em: '2026-02-20T16:00:00.000Z',
              enderecos: { id: 31, rua: 'Rua B', numero: '44', bairro: 'Centro', cidade: 'Porto Alegre', complemento: 'Ap 12', referencia: 'Esquina' },
              itens_pedido: [
                { id: 5, produto_id: 1, quantidade: 1, preco_unitario: '12.00', subtotal: '12.00', produtos: { id: 1, nome_doce: 'Brigadeiro', preco: '12.00' } },
                { id: 6, produto_id: 4, quantidade: 1, preco_unitario: '36.00', subtotal: '36.00', produtos: { id: 4, nome_doce: 'Banoffee', preco: '36.00' } },
              ],
            },
          ],
        })
      },
    },
  }
  const service = adminPanelService(prisma)

  const result = await service.getCustomer(9)

  assert.equal(capturedArgs.where.id, 9)
  assert.equal(result.segment, 'recorrente')
  assert.equal('crm_score' in result, false)
  assert.equal(result.preferred_payment_method, 'pix')
  assert.equal(result.favorite_products[0].nome_doce, 'Brigadeiro')
  assert.equal(result.favorite_products[0].quantidade, 4)
  assert.equal(result.orders.length, 3)
  assert.match(result.recommended_actions[0], /fidelidade|novidades|timing/i)
})

test('updateOrderStatus dispara notificacao quando o status muda', async () => {
  const notifications = []
  const publishedEvents = []
  const audits = []
  const currentOrder = {
    id: 9,
    status_entrega: 'pendente',
    status_pagamento: 'pendente',
    valor_total: '29.90',
    valor_entrega: '5.00',
    metodo_pagamento: 'pix',
    observacoes: null,
    criado_em: '2026-03-11T10:00:00.000Z',
    clientes: { id: 1, nome: 'Maria', telefone_whatsapp: '5511999990000' },
    enderecos: { rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Novo Hamburgo' },
    itens_pedido: [],
  }
  const updatedOrder = {
    ...currentOrder,
    status_entrega: 'preparando',
  }

  const prisma = {
    pedidos: {
      findUnique() {
        return Promise.resolve(currentOrder)
      },
      update() {
        return Promise.resolve(updatedOrder)
      },
    },
    configuracoes_loja: {
      findFirst() {
        return Promise.resolve({
          whatsapp_ativo: true,
          whatsapp_webhook_url: 'https://bot.exemplo.test/webhook',
        })
      },
    },
    pedidos_auditoria: {
      create({ data }) {
        audits.push(data)
        return Promise.resolve({ id: audits.length, ...data })
      },
    },
  }

  const service = adminPanelService(prisma, {
    whatsappNotifier: {
      notifyOrderStatusUpdatedSafe(payload) {
        notifications.push(payload)
      },
    },
    adminEvents: {
      publish(eventName, payload) {
        publishedEvents.push({ eventName, payload })
      },
    },
  })

  const result = await service.updateOrderStatus(
    9,
    { status_entrega: 'preparando' },
    { sub: '7', username: 'admin' },
  )

  assert.equal(result.status_entrega, 'preparando')
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].previousStatus, 'pendente')
  assert.equal(notifications[0].order.cliente.telefone_whatsapp, '5511999990000')
  assert.equal(audits.length, 1)
  assert.equal(audits[0].acao, 'status_atualizado_no_painel')
  assert.equal(audits[0].ator, 'admin#7')
  assert.deepEqual(publishedEvents, [
    {
      eventName: 'order.updated',
      payload: {
        orderId: 9,
        createdAt: '2026-03-11T10:00:00.000Z',
        deliveryStatus: 'preparando',
        paymentStatus: 'pendente',
        total: '29.90',
      },
    },
  ])
})

test('updateOrderStatus nao dispara notificacao quando o status nao muda', async () => {
  let updateCalled = false
  let notificationCalled = false
  const currentOrder = {
    id: 9,
    status_entrega: 'preparando',
    clientes: { id: 1, nome: 'Maria', telefone_whatsapp: '5511999990000' },
    enderecos: null,
    itens_pedido: [],
  }

  const prisma = {
    pedidos: {
      findUnique() {
        return Promise.resolve(currentOrder)
      },
      update() {
        updateCalled = true
        return Promise.resolve(currentOrder)
      },
    },
  }

  const service = adminPanelService(prisma, {
    whatsappNotifier: {
      notifyOrderStatusUpdatedSafe() {
        notificationCalled = true
      },
    },
  })

  const result = await service.updateOrderStatus(9, { status_entrega: 'preparando' })

  assert.equal(result.status_entrega, 'preparando')
  assert.equal(updateCalled, false)
  assert.equal(notificationCalled, false)
})

test('updateOrderStatus bloqueia confirmacao manual de pagamento por qualquer endpoint do app', async () => {
  let notificationCalled = false
  let persistedData = null
  const currentOrder = {
    id: 9,
    metodo_pagamento: 'pix',
    status_entrega: 'pendente',
    status_pagamento: 'pendente',
    clientes: { id: 1, nome: 'Maria', telefone_whatsapp: '5511999990000' },
    enderecos: null,
    itens_pedido: [],
  }

  const prisma = {
    pedidos: {
      findUnique() {
        return Promise.resolve(currentOrder)
      },
      update({ data }) {
        persistedData = data
        return Promise.resolve({
          ...currentOrder,
          ...data,
        })
      },
    },
  }

  const service = adminPanelService(prisma, {
    whatsappNotifier: {
      notifyOrderStatusUpdatedSafe() {
        notificationCalled = true
      },
    },
  })

  await assert.rejects(
    service.updateOrderStatus(9, { status_pagamento: 'pago' }),
    /Pagamento nao pode ser confirmado manualmente por este endpoint/,
  )

  assert.equal(persistedData, null)
  assert.equal(notificationCalled, false)
})

test('updateOrderStatus bloqueia regressao de pedido pago para pendente', async () => {
  let persistedData = null
  const currentOrder = {
    id: 9,
    metodo_pagamento: 'asaas_checkout',
    id_transacao_gateway: 'chk_123',
    status_entrega: 'pendente',
    status_pagamento: 'pago',
    clientes: { id: 1, nome: 'Maria', telefone_whatsapp: '5511999990000' },
    enderecos: null,
    itens_pedido: [],
  }

  const prisma = {
    pedidos: {
      findUnique() {
        return Promise.resolve(currentOrder)
      },
      update({ data }) {
        persistedData = data
        return Promise.resolve({
          ...currentOrder,
          ...data,
        })
      },
    },
  }

  const service = adminPanelService(prisma)

  await assert.rejects(
    service.updateOrderStatus(9, { status_pagamento: 'pendente' }),
    /Pedido pago nao pode voltar para um status anterior por este endpoint/,
  )

  assert.equal(persistedData, null)
})

test('updateOrderStatus permite atualizar entrega de pedido ja pago sem alterar pagamento', async () => {
  let persistedData = null
  const currentOrder = {
    id: 9,
    metodo_pagamento: 'asaas_checkout',
    id_transacao_gateway: 'chk_123',
    status_entrega: 'pendente',
    status_pagamento: 'pago',
    clientes: { id: 1, nome: 'Maria', telefone_whatsapp: '5511999990000' },
    enderecos: null,
    itens_pedido: [],
  }

  const prisma = {
    pedidos: {
      findUnique() {
        return Promise.resolve(currentOrder)
      },
      update({ data }) {
        persistedData = data
        return Promise.resolve({
          ...currentOrder,
          ...data,
        })
      },
    },
  }

  const service = adminPanelService(prisma)

  const result = await service.updateOrderStatus(9, {
    status_entrega: 'preparando',
    status_pagamento: 'pago',
  })

  assert.equal(result.status_entrega, 'preparando')
  assert.equal(result.status_pagamento, 'pago')
  assert.deepEqual(persistedData, { status_entrega: 'preparando' })
})

test('getWhatsAppSessionStatus expõe status do transporte configurado', async () => {
  const service = adminPanelService(
    {},
    {
      whatsappTransport: {
        isConfigured() {
          return true
        },
        buildWebhookUrl() {
          return 'https://api.donilla.com/whatsapp/webhook?token=abc'
        },
        async checkConnectionSession() {
          return { status: 'CONNECTED' }
        },
      },
    },
  )

  const result = await service.getWhatsAppSessionStatus()

  assert.equal(result.configured, true)
  assert.equal(result.webhook_url, 'https://api.donilla.com/whatsapp/webhook?token=abc')
  assert.deepEqual(result.raw, { status: 'CONNECTED' })
})

test('getWhatsAppSessionQrCode devolve data url quando o transporte retorna base64 de imagem', async () => {
  const service = adminPanelService(
    {},
    {
      whatsappTransport: {
        isConfigured() {
          return true
        },
        async getQrCode() {
          return {
            base64: 'iVBORw==',
            contentType: 'image/png',
          }
        },
      },
    },
  )

  const result = await service.getWhatsAppSessionQrCode()

  assert.equal(result.configured, true)
  assert.equal(result.qrCodeDataUrl, 'data:image/png;base64,iVBORw==')
  assert.deepEqual(result.raw, {
    base64: 'iVBORw==',
    contentType: 'image/png',
  })
})

test('updateStoreSettings permite ativar WhatsApp sem webhook externo quando o WPPConnect esta configurado', async () => {
  let persisted = null
  const prisma = {
    configuracoes_loja: {
      findFirst() {
        return Promise.resolve({
          id: 3,
          loja_aberta: true,
          tempo_entrega_minutos: 40,
          tempo_entrega_max_minutos: 60,
          taxa_entrega_padrao: 0,
          mensagem_aviso: null,
          whatsapp_ativo: false,
          whatsapp_webhook_url: null,
          whatsapp_webhook_secret: null,
          whatsapp_mensagem_novo_pedido: null,
          whatsapp_mensagem_status: null,
        })
      },
      update({ data }) {
        persisted = data
        return Promise.resolve({ id: 3, ...data })
      },
    },
  }

  const service = adminPanelService(prisma, {
    whatsappTransport: {
      isConfigured() {
        return true
      },
    },
  })

  const result = await service.updateStoreSettings({
    loja_aberta: true,
    tempo_entrega_minutos: 40,
    tempo_entrega_max_minutos: 60,
    mensagem_aviso: null,
    whatsapp_ativo: true,
    whatsapp_webhook_url: null,
    whatsapp_webhook_secret: null,
    whatsapp_mensagem_novo_pedido: null,
    whatsapp_mensagem_status: null,
  })

  assert.equal(result.whatsapp_ativo, true)
  assert.equal(persisted.whatsapp_ativo, true)
})

test('updateStoreSettings bloqueia ativacao do WhatsApp sem WPPConnect nem webhook externo', async () => {
  const prisma = {
    configuracoes_loja: {
      findFirst() {
        return Promise.resolve({
          id: 3,
          loja_aberta: true,
          tempo_entrega_minutos: 40,
          tempo_entrega_max_minutos: 60,
          taxa_entrega_padrao: 0,
          mensagem_aviso: null,
          whatsapp_ativo: false,
          whatsapp_webhook_url: null,
          whatsapp_webhook_secret: null,
          whatsapp_mensagem_novo_pedido: null,
          whatsapp_mensagem_status: null,
        })
      },
      update() {
        throw new Error('nao deveria atualizar')
      },
    },
  }

  const service = adminPanelService(prisma)

  await assert.rejects(
    () =>
      service.updateStoreSettings({
        loja_aberta: true,
        tempo_entrega_minutos: 40,
        tempo_entrega_max_minutos: 60,
        mensagem_aviso: null,
        whatsapp_ativo: true,
        whatsapp_webhook_url: null,
        whatsapp_webhook_secret: null,
        whatsapp_mensagem_novo_pedido: null,
        whatsapp_mensagem_status: null,
      }),
    /configure o WPPConnect no ambiente do servidor ou informe uma URL de webhook externa/i,
  )
})

test('updateStoreSettings bloqueia webhook externo apontando para rede interna', async () => {
  const prisma = {
    configuracoes_loja: {
      findFirst() {
        return Promise.resolve({
          id: 3,
          loja_aberta: true,
          tempo_entrega_minutos: 40,
          tempo_entrega_max_minutos: 60,
          taxa_entrega_padrao: 0,
          mensagem_aviso: null,
          whatsapp_ativo: false,
          whatsapp_webhook_url: null,
          whatsapp_webhook_secret: null,
          whatsapp_mensagem_novo_pedido: null,
          whatsapp_mensagem_status: null,
        })
      },
      update() {
        throw new Error('nao deveria atualizar')
      },
    },
  }

  const service = adminPanelService(prisma)

  await assert.rejects(
    () =>
      service.updateStoreSettings({
        loja_aberta: true,
        tempo_entrega_minutos: 40,
        tempo_entrega_max_minutos: 60,
        whatsapp_ativo: true,
        whatsapp_webhook_url: 'http://localhost:8080/webhook',
      }),
    /localhost|internos|privados/i,
  )
})
