const { isIP } = require('node:net')
const { promises: dns } = require('node:dns')
const { AppError } = require('./errors')

const DEFAULT_MAX_JSON_BODY_BYTES = 5 * 1024 * 1024
const DEFAULT_HEADERS_TIMEOUT_MS = 15_000
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_KEEP_ALIVE_TIMEOUT_MS = 5_000
const DEFAULT_MAX_REQUESTS_PER_SOCKET = 100
const DEFAULT_CORS_MAX_AGE_SECONDS = 600
const DEFAULT_CORS_ALLOWED_METHODS = Object.freeze(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const DEFAULT_CORS_ALLOWED_HEADERS = Object.freeze([
  'Authorization',
  'Content-Type',
  'Accept',
  'X-Customer-Session-Token',
  'Last-Event-ID',
])
const DEFAULT_CORS_EXPOSE_HEADERS = Object.freeze([
  'Content-Length',
  'Content-Type',
  'RateLimit-Limit',
  'RateLimit-Remaining',
  'RateLimit-Reset',
  'RateLimit-Policy',
  'Retry-After',
])

const STATIC_SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
})

const NO_STORE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
})

const RATE_LIMIT_RULES = [
  {
    key: 'auth-login',
    methods: ['POST'],
    paths: ['/auth/login', '/api/auth/login', '/public/customer/login'],
    maxRequests: 5,
    windowMs: 10 * 60 * 1000,
    message: 'Muitas tentativas de login. Tente novamente em instantes.',
  },
  {
    key: 'customer-register',
    methods: ['POST'],
    paths: ['/public/customer/register'],
    maxRequests: 5,
    windowMs: 30 * 60 * 1000,
    message: 'Muitas tentativas de cadastro. Tente novamente em instantes.',
  },
  {
    key: 'checkout-create',
    methods: ['POST'],
    paths: ['/public/orders', '/api/checkout/create'],
    maxRequests: 10,
    windowMs: 60 * 1000,
    message: 'Muitas tentativas. Tente novamente em instantes.',
  },
  {
    key: 'checkout-retry',
    methods: ['POST'],
    matcher(path) {
      return /^\/api\/checkout\/\d+\/retry$/.test(path)
    },
    maxRequests: 10,
    windowMs: 5 * 60 * 1000,
    message: 'Muitas tentativas de reabrir o checkout. Tente novamente em instantes.',
  },
  {
    key: 'asaas-webhook',
    methods: ['POST'],
    paths: ['/webhooks/asaas', '/api/webhooks/asaas'],
    maxRequests: 120,
    windowMs: 60 * 1000,
    message: 'Muitas notificacoes recebidas. Tente novamente em instantes.',
  },
  {
    key: 'order-status-summary',
    methods: ['GET'],
    matcher(path) {
      return /^\/api\/orders\/\d+\/status$/.test(path) || /^\/public\/orders\/\d+$/.test(path)
    },
    maxRequests: 30,
    windowMs: 60 * 1000,
    message: 'Muitas consultas de status. Tente novamente em instantes.',
  },
  {
    key: 'coupon-validate',
    methods: ['POST'],
    paths: ['/api/coupons/validate'],
    maxRequests: 20,
    windowMs: 60 * 1000,
    message: 'Muitas validacoes de cupom. Tente novamente em instantes.',
  },
  {
    key: 'customer-phone-check',
    methods: ['GET'],
    paths: ['/public/customer/check-phone'],
    maxRequests: 30,
    windowMs: 10 * 60 * 1000,
    message: 'Muitas consultas. Tente novamente em instantes.',
  },
]

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return parsed
}

function getMaxJsonBodyBytes() {
  return parsePositiveInt(process.env.MAX_JSON_BODY_BYTES, DEFAULT_MAX_JSON_BODY_BYTES)
}

function getServerTimeoutConfig() {
  return {
    headersTimeout: parsePositiveInt(process.env.SERVER_HEADERS_TIMEOUT_MS, DEFAULT_HEADERS_TIMEOUT_MS),
    requestTimeout: parsePositiveInt(process.env.SERVER_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
    keepAliveTimeout: parsePositiveInt(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS, DEFAULT_KEEP_ALIVE_TIMEOUT_MS),
    maxRequestsPerSocket: parsePositiveInt(
      process.env.SERVER_MAX_REQUESTS_PER_SOCKET,
      DEFAULT_MAX_REQUESTS_PER_SOCKET,
    ),
  }
}

function getSecurityHeaders(extraHeaders = {}) {
  return {
    ...STATIC_SECURITY_HEADERS,
    ...extraHeaders,
  }
}

function getNoStoreHeaders(extraHeaders = {}) {
  return {
    ...NO_STORE_HEADERS,
    ...extraHeaders,
  }
}

function parseCommaSeparatedValues(value) {
  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  )
}

function appendVaryHeader(headers, ...values) {
  const existing = parseCommaSeparatedValues(headers?.Vary || headers?.vary || '')
  const next = Array.from(new Set([...existing, ...values.filter(Boolean)]))
  if (next.length === 0) return headers
  return {
    ...headers,
    Vary: next.join(', '),
  }
}

function getAllowedCorsOriginPatterns() {
  return parseCommaSeparatedValues(process.env.CORS_ALLOWED_ORIGINS)
}

function matchesCorsOrigin(origin, pattern) {
  if (pattern === '*') return true
  if (origin === pattern) return true

  const wildcardMatch = String(pattern || '').match(/^([a-z]+:\/\/)\*\.(.+)$/i)
  if (!wildcardMatch) return false

  let parsedOrigin
  try {
    parsedOrigin = new URL(origin)
  } catch {
    return false
  }

  const protocolPrefix = `${parsedOrigin.protocol}//`.toLowerCase()
  const expectedProtocolPrefix = wildcardMatch[1].toLowerCase()
  const expectedHost = wildcardMatch[2].toLowerCase()
  const actualHost = String(parsedOrigin.hostname || '').toLowerCase()

  return (
    protocolPrefix === expectedProtocolPrefix &&
    actualHost !== expectedHost &&
    actualHost.endsWith(`.${expectedHost}`)
  )
}

function resolveAllowedCorsOrigin(origin) {
  const normalizedOrigin = String(origin || '').trim()
  if (!normalizedOrigin) return null

  let parsedOrigin
  try {
    parsedOrigin = new URL(normalizedOrigin)
  } catch {
    return null
  }

  if (!['http:', 'https:'].includes(parsedOrigin.protocol)) {
    return null
  }

  const allowedPatterns = getAllowedCorsOriginPatterns()
  if (allowedPatterns.length === 0) {
    return null
  }

  if (allowedPatterns.includes('*')) {
    return '*'
  }

  return allowedPatterns.some((pattern) => matchesCorsOrigin(normalizedOrigin, pattern))
    ? normalizedOrigin
    : null
}

function getCorsAllowedMethods() {
  const configured = parseCommaSeparatedValues(process.env.CORS_ALLOWED_METHODS)
  return configured.length > 0 ? configured : [...DEFAULT_CORS_ALLOWED_METHODS]
}

function getCorsDefaultAllowedHeaders() {
  const configured = parseCommaSeparatedValues(process.env.CORS_ALLOWED_HEADERS)
  return configured.length > 0 ? configured : [...DEFAULT_CORS_ALLOWED_HEADERS]
}

function getCorsExposeHeaders() {
  const configured = parseCommaSeparatedValues(process.env.CORS_EXPOSE_HEADERS)
  return configured.length > 0 ? configured : [...DEFAULT_CORS_EXPOSE_HEADERS]
}

function getCorsMaxAgeSeconds() {
  return parsePositiveInt(process.env.CORS_MAX_AGE_SECONDS, DEFAULT_CORS_MAX_AGE_SECONDS)
}

function getCorsHeaders(req, { includePreflight = false } = {}) {
  const origin = req?.headers?.origin || req?.headers?.Origin || ''
  const allowedOrigin = resolveAllowedCorsOrigin(origin)
  if (!allowedOrigin) return {}

  let headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Expose-Headers': getCorsExposeHeaders().join(', '),
  }

  if (allowedOrigin !== '*') {
    headers = appendVaryHeader(headers, 'Origin')
  }

  if (String(process.env.CORS_ALLOW_CREDENTIALS || '').trim() === '1' && allowedOrigin !== '*') {
    headers['Access-Control-Allow-Credentials'] = 'true'
  }

  if (includePreflight) {
    const requestedHeaders = String(req?.headers?.['access-control-request-headers'] || '').trim()
    headers['Access-Control-Allow-Methods'] = getCorsAllowedMethods().join(', ')
    headers['Access-Control-Allow-Headers'] = requestedHeaders || getCorsDefaultAllowedHeaders().join(', ')
    headers['Access-Control-Max-Age'] = String(getCorsMaxAgeSeconds())
    headers = appendVaryHeader(headers, 'Access-Control-Request-Method')
    if (requestedHeaders) {
      headers = appendVaryHeader(headers, 'Access-Control-Request-Headers')
    }
  }

  return headers
}

function isCorsPreflightRequest(req) {
  return (
    String(req?.method || '').toUpperCase() === 'OPTIONS' &&
    Boolean(req?.headers?.origin || req?.headers?.Origin) &&
    Boolean(req?.headers?.['access-control-request-method'])
  )
}

function normalizeIp(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const withoutZone = raw.split('%', 1)[0]
  if (withoutZone === '::1') return '127.0.0.1'
  if (withoutZone.startsWith('::ffff:')) return withoutZone.slice('::ffff:'.length)
  return withoutZone
}

function isPrivateOrSpecialIpv4(ip) {
  const parts = ip.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return true

  const [a, b] = parts

  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 192 && b === 0) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51) return true
  if (a === 203 && b === 0) return true
  if (a >= 224) return true

  return false
}

function isPrivateOrSpecialIpv6(ip) {
  const normalized = ip.toLowerCase()
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  )
}

function isPrivateOrSpecialIp(value) {
  const ip = normalizeIp(value)
  const version = isIP(ip)
  if (version === 4) return isPrivateOrSpecialIpv4(ip)
  if (version === 6) return isPrivateOrSpecialIpv6(ip)
  return true
}

function isTrustedProxySource(value) {
  return isPrivateOrSpecialIp(value)
}

function getClientIp(req) {
  const remoteAddress = normalizeIp(req?.socket?.remoteAddress || '')
  const forwardedFor = String(req?.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim()
  const forwardedAddress = normalizeIp(forwardedFor)

  if (forwardedAddress && isTrustedProxySource(remoteAddress)) {
    return forwardedAddress
  }

  return remoteAddress || forwardedAddress || 'unknown'
}

function createRateLimitGuard() {
  const state = new Map()

  return function checkRateLimit(req, method, path) {
    const rule = RATE_LIMIT_RULES.find((candidate) => {
      if (!candidate.methods.includes(method)) return false
      if (typeof candidate.matcher === 'function') return candidate.matcher(path)
      return candidate.paths.includes(path)
    })

    if (!rule) return null

    const key = `${rule.key}:${getClientIp(req)}`
    const now = Date.now()
    const current = state.get(key)

    if (!current || current.resetAt <= now) {
      state.set(key, {
        count: 1,
        resetAt: now + rule.windowMs,
      })
      return null
    }

    if (current.count >= rule.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      return {
        message: rule.message || 'Muitas requisicoes. Tente novamente em instantes.',
        retryAfterSeconds,
        limit: rule.maxRequests,
        remaining: 0,
        resetAfterSeconds: retryAfterSeconds,
        policy: `${rule.maxRequests};w=${Math.ceil(rule.windowMs / 1000)}`,
      }
    }

    current.count += 1
    state.set(key, current)
    return null
  }
}

function shouldExposeErrorDetails(statusCode = 500, { sensitive = false } = {}) {
  const isProduction = process.env.NODE_ENV === 'production'
  const expose = String(process.env.EXPOSE_ERROR_DETAILS || '').trim() === '1'
  if (sensitive && isProduction) return false
  if (expose) return true
  return !isProduction && statusCode < 500
}

function isLocalHostname(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal')
  )
}

async function assertSafeExternalUrl(rawUrl, { lookupImpl = dns.lookup } = {}) {
  if (String(process.env.ALLOW_PRIVATE_WEBHOOK_URLS || '').trim() === '1') {
    return rawUrl
  }

  let url
  try {
    url = new URL(String(rawUrl || '').trim())
  } catch {
    throw new AppError(400, 'URL externa invalida.')
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError(400, 'Use apenas URLs externas HTTP ou HTTPS.')
  }

  if (url.username || url.password) {
    throw new AppError(400, 'Nao use credenciais embutidas na URL externa.')
  }

  const hostname = String(url.hostname || '').trim()
  if (!hostname) {
    throw new AppError(400, 'URL externa invalida.')
  }

  if (isLocalHostname(hostname)) {
    throw new AppError(400, 'Nao e permitido usar localhost ou dominios internos como destino externo.')
  }

  if (isIP(hostname) && isPrivateOrSpecialIp(hostname)) {
    throw new AppError(400, 'Nao e permitido usar IP privado, loopback ou reservado na URL externa.')
  }

  if (!isIP(hostname)) {
    let addresses = []
    try {
      addresses = await lookupImpl(hostname, { all: true, verbatim: true })
    } catch {
      throw new AppError(400, 'Nao foi possivel resolver o host informado para a URL externa.')
    }

    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new AppError(400, 'Nao foi possivel resolver o host informado para a URL externa.')
    }

    const hasPrivateTarget = addresses.some((entry) => isPrivateOrSpecialIp(entry?.address || ''))
    if (hasPrivateTarget) {
      throw new AppError(400, 'Nao e permitido usar destinos internos ou privados na URL externa.')
    }
  }

  return url.toString()
}

module.exports = {
  assertSafeExternalUrl,
  createRateLimitGuard,
  getCorsHeaders,
  getClientIp,
  getMaxJsonBodyBytes,
  getNoStoreHeaders,
  getSecurityHeaders,
  getServerTimeoutConfig,
  isCorsPreflightRequest,
  shouldExposeErrorDetails,
}
