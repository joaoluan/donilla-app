const { AppError } = require('../utils/errors')

const ASAAS_ENVIRONMENTS = Object.freeze({
  production: {
    apiBaseUrl: 'https://api.asaas.com/v3',
    checkoutBaseUrl: 'https://www.asaas.com/checkoutSession/show',
  },
  sandbox: {
    apiBaseUrl: 'https://api-sandbox.asaas.com/v3',
    checkoutBaseUrl: 'https://sandbox.asaas.com/checkoutSession/show',
  },
})

function normalizeEnvironment(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (normalized === 'production' || normalized === 'prod') return 'production'
  return 'sandbox'
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return parsed
}

function readFirstEnvValue(env, keys = []) {
  for (const key of keys) {
    const value = String(env?.[key] || '').trim()
    if (value) return value
  }

  return ''
}

function normalizeApiBaseUrl(value, fallback) {
  const rawValue = String(value || '').trim()
  if (!rawValue) return fallback

  try {
    const url = new URL(rawValue)
    url.hash = ''
    url.search = ''

    const pathname = String(url.pathname || '')
      .replace(/\/+$/, '')
      .trim()

    if (!pathname || pathname === '/api' || pathname === '/api/v3') {
      url.pathname = '/v3'
    } else {
      url.pathname = pathname
    }

    return url.toString().replace(/\/$/, '')
  } catch {
    return rawValue.replace(/\/+$/, '') || fallback
  }
}

function detectEnvironmentFromApiKey(apiKey) {
  const normalized = String(apiKey || '').trim().toLowerCase()
  if (!normalized) return null

  if (normalized.startsWith('$aact_hmlg_')) return 'sandbox'
  if (normalized.startsWith('$aact_prod_')) return 'production'
  return null
}

function detectEnvironmentFromApiBaseUrl(apiBaseUrl) {
  try {
    const hostname = new URL(String(apiBaseUrl || '').trim()).hostname.toLowerCase()
    if (hostname === 'api-sandbox.asaas.com') return 'sandbox'
    if (hostname === 'api.asaas.com') return 'production'
  } catch {
    return null
  }

  return null
}

function extractHostLabel(rawUrl) {
  try {
    return new URL(String(rawUrl || '').trim()).host || null
  } catch {
    return null
  }
}

function buildDefaultUserAgent(environment, appBaseUrl) {
  const hostLabel = extractHostLabel(appBaseUrl)
  return `DonillaAsaasCheckout/1 (${environment}${hostLabel ? `; ${hostLabel}` : ''})`
}

function getAsaasConfig(env = process.env) {
  const environment = normalizeEnvironment(env.ASAAS_ENVIRONMENT)
  const urls = ASAAS_ENVIRONMENTS[environment]
  const appBaseUrl = readFirstEnvValue(env, ['ASAAS_APP_BASE_URL', 'APP_URL', 'APP_BASE_URL'])

  return {
    environment,
    apiBaseUrl: normalizeApiBaseUrl(env.ASAAS_API_BASE_URL, urls.apiBaseUrl),
    checkoutBaseUrl: urls.checkoutBaseUrl,
    apiKey: readFirstEnvValue(env, ['ASAAS_ACCESS_TOKEN', 'ASAAS_API_KEY']),
    webhookAuthToken: readFirstEnvValue(env, ['ASAAS_WEBHOOK_TOKEN', 'ASAAS_WEBHOOK_AUTH_TOKEN']),
    checkoutMinutesToExpire: parsePositiveInt(env.ASAAS_CHECKOUT_MINUTES_TO_EXPIRE, 60),
    requestTimeoutMs: parsePositiveInt(env.ASAAS_REQUEST_TIMEOUT_MS, 15_000),
    appBaseUrl,
    userAgent: readFirstEnvValue(env, ['ASAAS_USER_AGENT']) || buildDefaultUserAgent(environment, appBaseUrl),
    successUrl: String(env.ASAAS_CHECKOUT_SUCCESS_URL || '').trim(),
    cancelUrl: String(env.ASAAS_CHECKOUT_CANCEL_URL || '').trim(),
    expiredUrl: String(env.ASAAS_CHECKOUT_EXPIRED_URL || '').trim(),
  }
}

function ensureFetch() {
  if (typeof fetch !== 'function') {
    throw new AppError(500, 'Runtime sem suporte ao fetch para integrar com o Asaas.')
  }

  return fetch
}

function buildCheckoutUrl(checkoutId, config) {
  if (!checkoutId) return null

  const url = new URL(config.checkoutBaseUrl)
  url.searchParams.set('id', checkoutId)
  return url.toString()
}

function buildCallbackUrl(config, status, orderId) {
  const explicitMap = {
    success: config.successUrl,
    cancel: config.cancelUrl,
    expired: config.expiredUrl,
  }

  const explicitUrl = explicitMap[status]
  if (explicitUrl) return explicitUrl

  if (!config.appBaseUrl) {
    throw new AppError(
      500,
      'Configure APP_URL, ASAAS_APP_BASE_URL ou as URLs de retorno do checkout do Asaas no ambiente.',
    )
  }

  const url = new URL('/', config.appBaseUrl)
  url.searchParams.set('checkout_status', status)
  url.searchParams.set('order_id', String(orderId))
  return url.toString()
}

function buildBillingTypes(paymentMethod) {
  if (paymentMethod === 'pix') return ['PIX']
  return ['PIX', 'CREDIT_CARD']
}

function createAbortSignal(timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeout)
    },
  }
}

async function readAsaasResponse(response) {
  const rawText = await response.text()

  if (!rawText) {
    return null
  }

  try {
    return JSON.parse(rawText)
  } catch {
    return rawText
  }
}

function extractAsaasErrorMessage(payload) {
  if (!payload) return null

  if (typeof payload === 'string') {
    return payload.trim() || null
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const first = payload.errors[0]
    if (typeof first === 'string') return first
    if (first?.description) return first.description
    if (first?.message) return first.message
  }

  if (payload.message) return payload.message
  if (payload.description) return payload.description

  return null
}

function sanitizeAsaasErrorDetails(payload) {
  if (!payload) return undefined

  if (typeof payload === 'string') {
    const message = payload.trim()
    return message ? { message } : undefined
  }

  const errors = Array.isArray(payload.errors)
    ? payload.errors
        .map((entry) => {
          if (typeof entry === 'string') return { message: entry }

          const message = String(entry?.description || entry?.message || '').trim()
          const code = String(entry?.code || '').trim()
          if (!message && !code) return null

          return {
            ...(code ? { code } : {}),
            ...(message ? { message } : {}),
          }
        })
        .filter(Boolean)
    : []

  const summary = String(payload.message || payload.description || '').trim()
  if (!summary && errors.length === 0) return undefined

  return {
    ...(summary ? { message: summary } : {}),
    ...(errors.length > 0 ? { errors } : {}),
  }
}

function mapCheckoutEvent(eventName) {
  const normalized = String(eventName || '').trim().toUpperCase()

  if (normalized === 'CHECKOUT_PAID') {
    return { status_pagamento: 'pago' }
  }

  if (normalized === 'CHECKOUT_CANCELED') {
    return {
      status_pagamento: 'cancelado',
      status_entrega: 'cancelado',
    }
  }

  if (normalized === 'CHECKOUT_EXPIRED') {
    return {
      status_pagamento: 'expirado',
      status_entrega: 'cancelado',
    }
  }

  return null
}

function createAsaasService(rawConfig = getAsaasConfig()) {
  const config = {
    ...rawConfig,
    userAgent:
      String(rawConfig?.userAgent || '').trim() ||
      buildDefaultUserAgent(rawConfig?.environment || 'sandbox', rawConfig?.appBaseUrl || ''),
  }

  function isConfigured() {
    return Boolean(config.apiKey)
  }

  function assertEnvironmentConsistency() {
    const keyEnvironment = detectEnvironmentFromApiKey(config.apiKey)
    if (keyEnvironment && keyEnvironment !== config.environment) {
      throw new AppError(
        500,
        'ASAAS_ENVIRONMENT nao corresponde ao access token configurado para o Asaas.',
      )
    }

    const baseUrlEnvironment = detectEnvironmentFromApiBaseUrl(config.apiBaseUrl)
    if (baseUrlEnvironment && baseUrlEnvironment !== config.environment) {
      throw new AppError(
        500,
        'ASAAS_ENVIRONMENT nao corresponde ao ASAAS_API_BASE_URL configurado para o Asaas.',
      )
    }
  }

  function assertConfigured() {
    if (!isConfigured()) {
      throw new AppError(503, 'Asaas Checkout nao configurado no ambiente.')
    }

    assertEnvironmentConsistency()
  }

  async function request(path, { method = 'GET', body } = {}) {
    assertConfigured()
    const timeout = createAbortSignal(config.requestTimeoutMs)

    try {
      const response = await ensureFetch()(`${config.apiBaseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': config.userAgent,
          access_token: config.apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: timeout.signal,
      })

      const payload = await readAsaasResponse(response)

      if (!response.ok) {
        throw new AppError(
          response.status === 401 || response.status === 403 ? 502 : 502,
          extractAsaasErrorMessage(payload) || 'Falha ao comunicar com o Asaas.',
          sanitizeAsaasErrorDetails(payload),
        )
      }

      return payload
    } catch (error) {
      if (error instanceof AppError) throw error

      if (error?.name === 'AbortError') {
        throw new AppError(504, 'Timeout ao comunicar com o Asaas.')
      }

      throw new AppError(502, 'Falha ao comunicar com o Asaas.', error?.message || String(error))
    } finally {
      timeout.clear()
    }
  }

  return {
    isConfigured,

    buildCheckoutUrl(checkoutId) {
      return buildCheckoutUrl(checkoutId, config)
    },

    validateWebhook(headers = {}) {
      const configuredToken = config.webhookAuthToken
      if (!configuredToken) {
        throw new AppError(500, 'ASAAS_WEBHOOK_TOKEN/ASAAS_WEBHOOK_AUTH_TOKEN nao configurado no ambiente.')
      }

      const receivedToken = String(
        headers['asaas-access-token'] || headers['Asaas-Access-Token'] || headers['ASAAS-ACCESS-TOKEN'] || '',
      ).trim()

      if (!receivedToken || receivedToken !== configuredToken) {
        throw new AppError(401, 'Webhook do Asaas nao autorizado.')
      }
    },

    mapCheckoutEvent,

    async createCheckout({ orderId, amount, items, paymentMethod }) {
      const callback = {
        successUrl: buildCallbackUrl(config, 'success', orderId),
        cancelUrl: buildCallbackUrl(config, 'cancel', orderId),
        expiredUrl: buildCallbackUrl(config, 'expired', orderId),
      }

      const payload = await request('/checkouts', {
        method: 'POST',
        body: {
          billingTypes: buildBillingTypes(paymentMethod),
          chargeTypes: ['DETACHED'],
          minutesToExpire: config.checkoutMinutesToExpire,
          callback,
          items: items.map((item) => ({
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            value: item.value,
          })),
        },
      })

      const checkoutId = payload?.id
      if (!checkoutId) {
        throw new AppError(502, 'Resposta invalida do Asaas ao criar checkout.', sanitizeAsaasErrorDetails(payload))
      }

      const expiresAt = new Date(Date.now() + config.checkoutMinutesToExpire * 60 * 1000)

      return {
        id: checkoutId,
        amount,
        checkout_url: payload?.link || buildCheckoutUrl(checkoutId, config),
        expires_at: expiresAt.toISOString(),
        raw: payload,
      }
    },
  }
}

module.exports = {
  createAsaasService,
  getAsaasConfig,
}
