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
