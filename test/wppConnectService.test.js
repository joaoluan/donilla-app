const test = require('node:test')
const assert = require('node:assert/strict')

const { createWppConnectService, normalizeAccessToken } = require('../src/services/wppConnectService')

function withEnv(values, fn) {
  const previous = {}
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key]
    if (value === null) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    })
}

test('sendTextMessage usa generate-token e endpoint send-message do WPPConnect', async () => {
  const calls = []

  await withEnv(
    {
      WPP_SERVER_URL: 'http://localhost:21465',
      WPP_SESSION_NAME: 'donilla',
      WPP_SECRET_KEY: 'secret',
    },
    async () => {
      const service = createWppConnectService({
        async fetchImpl(url, options) {
          calls.push({ url, options })

          if (url.endsWith('/api/donilla/secret/generate-token')) {
            return {
              ok: true,
              status: 200,
              async text() {
                return JSON.stringify({ token: 'abc', full: 'donilla:abc' })
              },
            }
          }

          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({ status: 'success' })
            },
          }
        },
      })

      const result = await service.sendTextMessage({
        to: '(11) 99999-0000',
        body: 'Teste',
      })

      assert.equal(result.status, 'success')
      assert.equal(calls.length, 2)
      assert.equal(calls[1].url, 'http://localhost:21465/api/donilla/send-message')
      assert.equal(calls[1].options.headers.Authorization, 'Bearer abc')
      assert.deepEqual(JSON.parse(calls[1].options.body), {
        phone: '5511999990000',
        message: 'Teste',
        isGroup: false,
        isNewsletter: false,
        isLid: false,
      })
    },
  )
})

test('normalizeAccessToken remove prefixo Bearer e nome da sessao', () => {
  assert.equal(normalizeAccessToken('Bearer abc123'), 'abc123')
  assert.equal(normalizeAccessToken('donilla:abc123'), 'abc123')
  assert.equal(normalizeAccessToken('Bearer donilla:abc123'), 'abc123')
  assert.equal(normalizeAccessToken('abc123'), 'abc123')
  assert.equal(normalizeAccessToken(''), null)
})

test('buildWebhookUrl adiciona token quando configurado', async () => {
  await withEnv(
    {
      WPP_SERVER_URL: 'http://localhost:21465',
      WPP_SESSION_NAME: 'donilla',
      WPP_SECRET_KEY: 'secret',
      APP_BASE_URL: 'https://api.donilla.com',
      WPP_WEBHOOK_TOKEN: 'abc123',
    },
    async () => {
      const service = createWppConnectService({
        async fetchImpl() {
          throw new Error('nao deveria chamar fetch')
        },
      })

      assert.equal(service.buildWebhookUrl(), 'https://api.donilla.com/whatsapp/webhook?token=abc123')
    },
  )
})

test('getQrCode converte resposta de imagem do WPPConnect em base64', async () => {
  await withEnv(
    {
      WPP_SERVER_URL: 'http://localhost:21465',
      WPP_SESSION_NAME: 'donilla',
      WPP_BEARER_TOKEN: 'donilla:abc',
    },
    async () => {
      const service = createWppConnectService({
        async fetchImpl() {
          return {
            ok: true,
            status: 200,
            headers: {
              get(name) {
                if (String(name).toLowerCase() === 'content-type') return 'image/png'
                return null
              },
            },
            async arrayBuffer() {
              return Uint8Array.from([0x89, 0x50, 0x4e, 0x47]).buffer
            },
          }
        },
      })

      const result = await service.getQrCode()

      assert.deepEqual(result, {
        base64: 'iVBORw==',
        contentType: 'image/png',
      })
    },
  )
})

test('getPhoneFromLid extrai phoneNumber.id do retorno do WPPConnect', async () => {
  const calls = []

  await withEnv(
    {
      WPP_SERVER_URL: 'http://localhost:21465',
      WPP_SESSION_NAME: 'donilla',
      WPP_SECRET_KEY: 'secret',
    },
    async () => {
      const service = createWppConnectService({
        async fetchImpl(url, options) {
          calls.push({ url, options })

          if (url.endsWith('/api/donilla/secret/generate-token')) {
            return {
              ok: true,
              status: 200,
              headers: { get() { return 'application/json' } },
              async text() {
                return JSON.stringify({ token: 'abc', full: 'donilla:abc' })
              },
            }
          }

          return {
            ok: true,
            status: 200,
            headers: { get() { return 'application/json' } },
            async text() {
              return JSON.stringify({
                lid: { id: '196456149418037', _serialized: '196456149418037@lid' },
                phoneNumber: { id: '555185711759', _serialized: '555185711759@c.us' },
                session: 'donilla',
              })
            },
          }
        },
      })

      const result = await service.getPhoneFromLid('196456149418037@lid')

      assert.equal(result, '555185711759')
      assert.equal(calls.length, 2)
      assert.equal(calls[1].url, 'http://localhost:21465/api/donilla/contact/pn-lid/196456149418037%40lid')
      assert.equal(calls[1].options.headers.Authorization, 'Bearer abc')
    },
  )
})
