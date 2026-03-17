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

function createOrderPrismaMock() {
  const calls = {
    pedidoCreate: null,
    createMany: null,
  }

  return {
    calls,
    prisma: {
      configuracoes_loja: {
        findFirst() {
          return Promise.resolve({
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
          return Promise.resolve([
            {
              id: 1,
              nome_doce: 'Brigadeiro',
              preco: '12.00',
              ativo: true,
              estoque_disponivel: 10,
            },
          ])
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
              return Promise.resolve({
                id: 41,
                criado_em: '2026-03-16T18:00:00.000Z',
                ...data,
              })
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

test('createOrder deve marcar pedido pix como pago de forma persistente', async () => {
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
    assert.equal(calls.pedidoCreate.status_pagamento, 'pago')
    assert.equal(result.metodo_pagamento, 'pix')
    assert.equal(result.status_pagamento, 'pago')
    assert.equal(calls.createMany.length, 1)
    assert.equal(notifications.length, 1)
    assert.equal(notifications[0].order.status_pagamento, 'pago')
  } finally {
    process.env.JWT_SECRET = originalSecret
  }
})
