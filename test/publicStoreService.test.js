const test = require('node:test')
const assert = require('node:assert/strict')

const { publicStoreService } = require('../src/services/publicStoreService')

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
