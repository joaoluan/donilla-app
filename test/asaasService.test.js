const test = require('node:test')
const assert = require('node:assert/strict')

const { createAsaasService, getAsaasConfig } = require('../src/services/asaasService')
const { AppError } = require('../src/utils/errors')

test('getAsaasConfig usa os nomes novos de ambiente e normaliza a API base do Asaas', () => {
  const config = getAsaasConfig({
    ASAAS_ENVIRONMENT: 'sandbox',
    ASAAS_API_BASE_URL: 'https://api-sandbox.asaas.com/api/v3/',
    ASAAS_ACCESS_TOKEN: '$aact_hmlg_teste',
    ASAAS_WEBHOOK_TOKEN: 'whsec_novo',
    APP_URL: 'https://www.donilla.com.br',
  })

  assert.equal(config.environment, 'sandbox')
  assert.equal(config.apiBaseUrl, 'https://api-sandbox.asaas.com/v3')
  assert.equal(config.apiKey, '$aact_hmlg_teste')
  assert.equal(config.webhookAuthToken, 'whsec_novo')
  assert.equal(config.appBaseUrl, 'https://www.donilla.com.br')
  assert.match(config.userAgent, /DonillaAsaasCheckout\/1/)
  assert.match(config.userAgent, /sandbox/)
})

test('getAsaasConfig mantem compatibilidade com aliases legados', () => {
  const config = getAsaasConfig({
    ASAAS_ENVIRONMENT: 'production',
    ASAAS_API_KEY: '$aact_prod_teste',
    ASAAS_WEBHOOK_AUTH_TOKEN: 'whsec_legado',
    ASAAS_APP_BASE_URL: 'https://checkout.donilla.com.br',
    APP_BASE_URL: 'http://donilla-backend:3000',
  })

  assert.equal(config.environment, 'production')
  assert.equal(config.apiBaseUrl, 'https://api.asaas.com/v3')
  assert.equal(config.apiKey, '$aact_prod_teste')
  assert.equal(config.webhookAuthToken, 'whsec_legado')
  assert.equal(config.appBaseUrl, 'https://checkout.donilla.com.br')
})

test('validateWebhook aceita o token configurado do Asaas', () => {
  const service = createAsaasService({
    environment: 'sandbox',
    apiBaseUrl: 'https://api-sandbox.asaas.com/v3',
    checkoutBaseUrl: 'https://sandbox.asaas.com/checkoutSession/show',
    apiKey: 'token-api',
    webhookAuthToken: 'whsec_teste',
    checkoutMinutesToExpire: 60,
    requestTimeoutMs: 15000,
    appBaseUrl: 'https://www.donilla.com.br',
    successUrl: '',
    cancelUrl: '',
    expiredUrl: '',
  })

  assert.doesNotThrow(() => {
    service.validateWebhook({ 'asaas-access-token': 'whsec_teste' })
  })
})

test('validateWebhook rejeita token invalido do webhook', () => {
  const service = createAsaasService({
    environment: 'sandbox',
    apiBaseUrl: 'https://api-sandbox.asaas.com/v3',
    checkoutBaseUrl: 'https://sandbox.asaas.com/checkoutSession/show',
    apiKey: 'token-api',
    webhookAuthToken: 'whsec_teste',
    checkoutMinutesToExpire: 60,
    requestTimeoutMs: 15000,
    appBaseUrl: 'https://www.donilla.com.br',
    successUrl: '',
    cancelUrl: '',
    expiredUrl: '',
  })

  assert.throws(
    () => service.validateWebhook({ 'asaas-access-token': 'whsec_invalido' }),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.statusCode, 401)
      return true
    },
  )
})

test('createCheckout bloqueia token sandbox/producao inconsistente com ASAAS_ENVIRONMENT', async () => {
  const service = createAsaasService({
    environment: 'production',
    apiBaseUrl: 'https://api.asaas.com/v3',
    checkoutBaseUrl: 'https://www.asaas.com/checkoutSession/show',
    apiKey: '$aact_hmlg_teste',
    webhookAuthToken: 'whsec_teste',
    checkoutMinutesToExpire: 60,
    requestTimeoutMs: 15000,
    appBaseUrl: 'https://www.donilla.com.br',
    successUrl: '',
    cancelUrl: '',
    expiredUrl: '',
  })

  await assert.rejects(
    service.createCheckout({
      orderId: 32,
      amount: 26.9,
      paymentMethod: 'asaas_checkout',
      items: [
        {
          name: 'Pedido #32',
          description: 'Compra de teste',
          quantity: 1,
          value: 26.9,
        },
      ],
    }),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.statusCode, 500)
      assert.equal(error.message, 'ASAAS_ENVIRONMENT nao corresponde ao access token configurado para o Asaas.')
      return true
    },
  )
})

test('createCheckout sanitiza detalhes de erro retornados pelo Asaas', async () => {
  const originalFetch = global.fetch
  let capturedHeaders = null
  global.fetch = async (_url, options) => {
    capturedHeaders = options?.headers || null
    return {
      ok: false,
      status: 400,
      async text() {
        return JSON.stringify({
          message: 'Falha no checkout',
          errors: [{ code: 'invalid_request', description: 'Payload invalido' }],
          secret: 'nao-deve-vazar',
        })
      },
    }
  }

  const service = createAsaasService({
    environment: 'sandbox',
    apiBaseUrl: 'https://api-sandbox.asaas.com/v3',
    checkoutBaseUrl: 'https://sandbox.asaas.com/checkoutSession/show',
    apiKey: '$aact_hmlg_teste',
    webhookAuthToken: 'whsec_teste',
    checkoutMinutesToExpire: 60,
    requestTimeoutMs: 15000,
    appBaseUrl: 'https://www.donilla.com.br',
    successUrl: '',
    cancelUrl: '',
    expiredUrl: '',
  })

  try {
    await assert.rejects(
      service.createCheckout({
        orderId: 33,
        amount: 26.9,
        paymentMethod: 'asaas_checkout',
        items: [
          {
            name: 'Pedido #33',
            description: 'Compra de teste',
            quantity: 1,
            value: 26.9,
          },
        ],
      }),
      (error) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.statusCode, 502)
        assert.equal(error.message, 'Payload invalido')
        assert.deepEqual(error.details, {
          message: 'Falha no checkout',
          errors: [{ code: 'invalid_request', message: 'Payload invalido' }],
        })
        assert.match(capturedHeaders['User-Agent'], /DonillaAsaasCheckout\/1/)
        return true
      },
    )
  } finally {
    global.fetch = originalFetch
  }
})

test('createCheckout limita nomes longos dos itens ao maximo aceito pelo Asaas', async () => {
  const originalFetch = global.fetch
  let capturedBody = null
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options?.body || '{}')
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          id: 'chk_long_name',
          link: 'https://sandbox.asaas.com/checkoutSession/show?id=chk_long_name',
        })
      },
    }
  }

  const service = createAsaasService({
    environment: 'sandbox',
    apiBaseUrl: 'https://api-sandbox.asaas.com/v3',
    checkoutBaseUrl: 'https://sandbox.asaas.com/checkoutSession/show',
    apiKey: '$aact_hmlg_teste',
    webhookAuthToken: 'whsec_teste',
    checkoutMinutesToExpire: 60,
    requestTimeoutMs: 15000,
    appBaseUrl: 'https://www.donilla.com.br',
    successUrl: '',
    cancelUrl: '',
    expiredUrl: '',
  })

  try {
    const result = await service.createCheckout({
      orderId: 34,
      amount: 26.9,
      paymentMethod: 'asaas_checkout',
      items: [
        {
          name: 'Bolo de Pote Ninho com Nutella Crocante Especial',
          description: 'Compra de teste',
          quantity: 1,
          value: 26.9,
        },
      ],
    })

    assert.equal(result.id, 'chk_long_name')
    assert.ok(capturedBody)
    assert.equal(capturedBody.items[0].name.length <= 30, true)
    assert.match(capturedBody.items[0].name, /^Bolo de Pote Ninho/)
    assert.match(capturedBody.items[0].name, /\.\.\.$/)
  } finally {
    global.fetch = originalFetch
  }
})
