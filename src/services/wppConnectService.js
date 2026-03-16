const { AppError } = require('../utils/errors')
const { normalizeWhatsAppPhone } = require('../utils/phone')

function normalizePhone(value) {
  return normalizeWhatsAppPhone(value)
}

function normalizeOutboundTarget(rawTo) {
  const raw = String(rawTo || '').trim()
  if (!raw) return null

  const normalizedRaw = raw
    .split(':', 1)[0]
    .trim()

  if (!normalizedRaw) return null

  const [localId, domainSuffix] = normalizedRaw.split('@', 2)
  if (!localId) return null

  const cleanLocalId = localId.trim()
  if (!cleanLocalId) return null
  const isNumeric = /^\d+$/.test(cleanLocalId)

  const normalizedDigits = normalizeWhatsAppPhone(cleanLocalId)
  const suffix = String(domainSuffix || '').toLowerCase()
  const isLid = suffix.includes('lid') || !isNumeric

  if (!suffix) {
    if (normalizedDigits) {
      return { phone: normalizedDigits, isLid: false }
    }

    return null
  }

  if (isLid) {
    return { phone: `${cleanLocalId}@${suffix}`, isLid: true }
  }

  return {
    phone: cleanLocalId,
    isLid: false,
  }
}

function extractLidPhoneFromResponse(response) {
  const nested = response?.data || response?.contact || response
  const candidates = [
    response?.phoneNumber?.id,
    response?.phoneNumber?._serialized,
    response?.phoneNumber?.user,
    response?.phoneNumber,
    response?.pn,
    response?.number,
    response?.phone,
    response?.wid?.id,
    response?.wid?._serialized,
    response?.wid?.user,
    response?.wid,
    response?.id,
    nested?.phoneNumber?.id,
    nested?.phoneNumber?._serialized,
    nested?.phoneNumber?.user,
    nested?.phoneNumber,
    nested?.phone,
    nested?.pn,
    nested?.number,
    nested?.wid?.id,
    nested?.wid?._serialized,
    nested?.wid?.user,
    nested?.wid,
    nested?.id,
  ]

  return candidates.find((candidate) => {
    const value = String(candidate || '').trim()
    return /\d/.test(value)
  }) || null
}

async function resolveLidToPhone(authedRequest, lidValue) {
  const raw = String(lidValue || '').trim()
  if (!raw || !/@lid$/i.test(raw)) return null

  const candidateEndpoints = [
    `/contact/pn-lid/${encodeURIComponent(raw)}`,
    `/lids/${encodeURIComponent(raw)}`,
  ]

  let lastError = null

  for (const path of candidateEndpoints) {
    try {
      const response = await authedRequest(path, { method: 'GET' })
      return normalizeWhatsAppPhone(extractLidPhoneFromResponse(response))
    } catch (error) {
      if (error?.statusCode === 404 || error?.status === 404 || error?.statusCode === 400 || error?.status === 400) {
        lastError = error
        continue
      }

      throw error
    }
  }

  if (lastError) return null
  return null
}

function normalizeServerUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function parseJsonSafe(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function normalizeAccessToken(value) {
  const raw = String(value || '').trim()
  if (!raw) return null

  const withoutBearer = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw
  const [prefix, token] = withoutBearer.split(':', 2)

  if (token && prefix) return token.trim() || null
  return withoutBearer || null
}

function createWppConnectService({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch API indisponivel para a integracao WPPConnect.')
  }

  let cachedBearerToken = null

  function getConfig() {
    return {
      providerName: 'wppconnect',
      serverUrl: normalizeServerUrl(process.env.WPP_SERVER_URL),
      sessionName: String(process.env.WPP_SESSION_NAME || '').trim(),
      secretKey: String(process.env.WPP_SECRET_KEY || '').trim(),
      bearerToken: String(process.env.WPP_BEARER_TOKEN || '').trim() || null,
      publicWebhookUrl:
        String(process.env.WPP_PUBLIC_WEBHOOK_URL || process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim(),
      webhookToken: String(process.env.WPP_WEBHOOK_TOKEN || '').trim() || null,
    }
  }

  function isConfigured() {
    const config = getConfig()
    return Boolean(config.serverUrl && config.sessionName && (config.secretKey || config.bearerToken))
  }

  function assertConfigured() {
    if (!isConfigured()) {
      throw new AppError(
        500,
        'WPPConnect nao configurado. Defina WPP_SERVER_URL, WPP_SESSION_NAME e WPP_SECRET_KEY no ambiente.',
      )
    }
  }

  function buildWebhookUrl() {
    const config = getConfig()
    if (!config.publicWebhookUrl) return null

    const url = new URL(config.publicWebhookUrl.endsWith('/whatsapp/webhook')
      ? config.publicWebhookUrl
      : `${config.publicWebhookUrl.replace(/\/+$/, '')}/whatsapp/webhook`)

    if (config.webhookToken) {
      url.searchParams.set('token', config.webhookToken)
    }

    return url.toString()
  }

  function getVerifyToken() {
    return getConfig().webhookToken
  }

async function request(path, { method = 'GET', headers = {}, body } = {}) {
    const config = getConfig()
    assertConfigured()

    const response = await fetchImpl(`${config.serverUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase()
    let parsed = null

    if (contentType.startsWith('image/')) {
      const buffer = Buffer.from(await response.arrayBuffer())
      parsed = {
        base64: buffer.toString('base64'),
        contentType,
      }
    } else {
      const responseText = await response.text()
      parsed = parseJsonSafe(responseText)
    }

    if (!response.ok) {
      throw new AppError(502, `WPPConnect respondeu com erro HTTP ${response.status}.`, parsed)
    }

    return parsed
  }

  async function getBearerToken(forceRefresh = false) {
    const config = getConfig()
    if (config.bearerToken) return normalizeAccessToken(config.bearerToken)
    if (cachedBearerToken && !forceRefresh) return cachedBearerToken
    if (!config.secretKey) {
      throw new AppError(500, 'WPP_SECRET_KEY nao configurado no ambiente.')
    }

    const result = await request(`/api/${encodeURIComponent(config.sessionName)}/${encodeURIComponent(config.secretKey)}/generate-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    cachedBearerToken = normalizeAccessToken(result?.token || result?.accessToken || result?.full)
    if (!cachedBearerToken) {
      throw new AppError(502, 'WPPConnect nao retornou um token de acesso valido.', result)
    }

    return cachedBearerToken
  }

  async function authedRequest(path, { method = 'GET', body } = {}) {
    const token = normalizeAccessToken(await getBearerToken())
    const config = getConfig()
    const authorization = `Bearer ${token}`

    try {
      return await request(`/api/${encodeURIComponent(config.sessionName)}${path}`, {
        method,
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body,
      })
    } catch (error) {
      if (error?.statusCode === 502) {
        cachedBearerToken = null
      }
      throw error
    }
  }

  async function sendTextMessage({ to, body }) {
    const target = normalizeOutboundTarget(to)
    if (!target?.phone) throw new AppError(400, 'Telefone invalido para envio de mensagem.')

    return authedRequest('/send-message', {
      method: 'POST',
      body: {
        phone: target.phone,
        message: String(body || '').trim(),
        isGroup: false,
        isNewsletter: false,
        isLid: target.isLid,
      },
    })
  }

  async function startSession() {
    const webhook = buildWebhookUrl()
    return authedRequest('/start-session', {
      method: 'POST',
      body: {
        waitQrCode: false,
        ...(webhook ? { webhook } : {}),
      },
    })
  }

  async function checkConnectionSession() {
    return authedRequest('/check-connection-session')
  }

  async function getQrCode() {
    return authedRequest('/qrcode-session')
  }

  function validateIncomingWebhook(url) {
    const expectedToken = getVerifyToken()
    if (!expectedToken) return

    const provided = url.searchParams.get('token')
    if (provided !== expectedToken) {
      throw new AppError(403, 'Webhook do WhatsApp invalido.')
    }
  }

  function verifyWebhook(url) {
    validateIncomingWebhook(url)
    return 'ok'
  }

  async function getPhoneFromLid(lid) {
    return resolveLidToPhone(authedRequest, lid)
  }

  return {
    providerName: 'wppconnect',
    buildWebhookUrl,
    checkConnectionSession,
    getConfig,
    getQrCode,
    getVerifyToken,
    isConfigured,
    sendTextMessage,
    getPhoneFromLid,
    startSession,
    validateIncomingWebhook,
    verifyWebhook,
  }
}

module.exports = {
  createWppConnectService,
  normalizePhone,
  normalizeAccessToken,
}
