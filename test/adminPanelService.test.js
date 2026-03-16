const test = require('node:test')
const assert = require('node:assert/strict')

const { adminPanelService } = require('../src/services/adminPanelService')

function createPrismaMock() {
  const calls = {
    findMany: [],
    count: [],
  }

  return {
    calls,
    prisma: {
      pedidos: {
        findMany(args) {
          calls.findMany.push(args)
          return Promise.resolve([])
        },
        count(args) {
          calls.count.push(args)
          return Promise.resolve(0)
        },
      },
      $transaction(actions) {
        return Promise.all(actions)
      },
    },
  }
}

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
  }

  const service = adminPanelService(prisma, {
    whatsappNotifier: {
      notifyOrderStatusUpdatedSafe(payload) {
        notifications.push(payload)
      },
    },
  })

  const result = await service.updateOrderStatus(9, 'preparando')

  assert.equal(result.status_entrega, 'preparando')
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].previousStatus, 'pendente')
  assert.equal(notifications[0].order.cliente.telefone_whatsapp, '5511999990000')
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

  const result = await service.updateOrderStatus(9, 'preparando')

  assert.equal(result.status_entrega, 'preparando')
  assert.equal(updateCalled, false)
  assert.equal(notificationCalled, false)
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
