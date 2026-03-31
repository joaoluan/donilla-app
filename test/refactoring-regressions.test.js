const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const { createAdminEventsBroker } = require('../src/services/adminEventsBroker')
const canonicalPhone = require('../src/utils/phone')
const compatibilityPhone = require('../src/utils/phoneNormalization')
const { validateClientData } = require('../src/utils/orderValidation')

function createSsePair() {
  const req = new EventEmitter()
  req.socket = { setTimeout() {} }
  req.setTimeout = () => {}

  const res = new EventEmitter()
  res.socket = { setTimeout() {} }
  res.setTimeout = () => {}
  res.writeHead = () => {}
  res.flushHeaders = () => {}

  return { req, res }
}

test('phoneNormalization acompanha o utilitario canonico para telefones brasileiros', () => {
  const samples = [
    '11999999999',
    '(11) 99999-9999',
    '5511999999999',
    '5511987654321@c.us',
  ]

  for (const sample of samples) {
    assert.equal(
      compatibilityPhone.normalizeWhatsAppPhone(sample),
      canonicalPhone.normalizeWhatsAppPhone(sample),
    )
  }

  assert.equal(compatibilityPhone.isNormalizedPhone('5511999999999'), true)
  assert.equal(compatibilityPhone.removePhoneFormatting('(11) 99999-9999'), '11999999999')
})

test('validateClientData aceita telefone com 55 e nono digito', () => {
  assert.equal(
    validateClientData({
      nome: 'Maria Teste',
      telefone: '5511999999999',
    }),
    true,
  )
})

test('createAdminEventsBroker remove cliente desconectado sem depender de logger global', async () => {
  const warnings = []
  const broker = createAdminEventsBroker({
    heartbeatIntervalMs: 5,
    logger: {
      warn(message, meta) {
        warnings.push({ message, meta })
      },
    },
  })

  const { req, res } = createSsePair()
  let writes = 0
  res.write = () => {
    writes += 1
    if (writes > 1) {
      throw new Error('socket closed')
    }
  }

  broker.subscribe(req, res, { auth: { sub: '9' } })

  await new Promise((resolve) => setTimeout(resolve, 20))

  assert.equal(broker.getClientCount(), 0)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0].message, /Cliente SSE removido durante heartbeat/i)
  assert.deepEqual(warnings[0].meta, { clientId: 1 })
})
