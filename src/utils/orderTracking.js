const { randomBytes } = require('node:crypto')

function generateOrderTrackingToken() {
  return randomBytes(24).toString('hex')
}

function normalizePublicBaseUrl(rawValue) {
  const normalized = String(rawValue || '').trim()
  if (!normalized) return null

  try {
    const url = new URL(normalized)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.search = ''
    url.hash = ''
    return url
  } catch {
    return null
  }
}

function normalizePublicBasePath(pathname) {
  const normalized = String(pathname || '').replace(/\/+$/, '')
  if (!normalized || normalized === '/') return ''
  if (normalized.endsWith('/whatsapp/webhook')) {
    return normalized.slice(0, -'/whatsapp/webhook'.length)
  }

  if (['/loja', '/catalogo', '/cliente', '/site'].includes(normalized)) {
    return ''
  }

  return normalized
}

function resolvePublicAppBaseUrl(env = process.env) {
  const candidates = [env.APP_URL, env.APP_BASE_URL, env.PUBLIC_BASE_URL, env.WPP_PUBLIC_WEBHOOK_URL]

  for (const candidate of candidates) {
    const url = normalizePublicBaseUrl(candidate)
    if (!url) continue

    url.pathname = normalizePublicBasePath(url.pathname) || '/'
    return url
  }

  return null
}

function buildPublicOrderTrackingPath(orderId, trackingToken) {
  const normalizedOrderId = Number.parseInt(String(orderId || ''), 10)
  const normalizedToken = String(trackingToken || '').trim()

  if (!Number.isInteger(normalizedOrderId) || normalizedOrderId <= 0 || !normalizedToken) {
    return null
  }

  const params = new URLSearchParams({ token: normalizedToken })
  return `/pedido/${normalizedOrderId}?${params.toString()}`
}

function buildPublicOrderTrackingUrl(orderId, trackingToken, env = process.env) {
  const path = buildPublicOrderTrackingPath(orderId, trackingToken)
  if (!path) return null

  const baseUrl = resolvePublicAppBaseUrl(env)
  if (!baseUrl) return null

  return new URL(path, baseUrl).toString()
}

module.exports = {
  buildPublicOrderTrackingPath,
  buildPublicOrderTrackingUrl,
  generateOrderTrackingToken,
  resolvePublicAppBaseUrl,
}
