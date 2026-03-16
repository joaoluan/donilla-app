const { isIP } = require('node:net')
const { promises: dns } = require('node:dns')
const { AppError } = require('./errors')

const DEFAULT_MAX_JSON_BODY_BYTES = 5 * 1024 * 1024
const DEFAULT_HEADERS_TIMEOUT_MS = 15_000
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_KEEP_ALIVE_TIMEOUT_MS = 5_000
const DEFAULT_MAX_REQUESTS_PER_SOCKET = 100

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
    paths: ['/auth/login', '/public/customer/login'],
    maxRequests: 5,
    windowMs: 10 * 60 * 1000,
  },
  {
    key: 'customer-register',
    methods: ['POST'],
    paths: ['/public/customer/register'],
    maxRequests: 5,
    windowMs: 30 * 60 * 1000,
  },
  {
    key: 'order-create',
    methods: ['POST'],
    paths: ['/public/orders'],
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
  },
  {
    key: 'customer-phone-check',
    methods: ['GET'],
    paths: ['/public/customer/check-phone'],
    maxRequests: 30,
    windowMs: 10 * 60 * 1000,
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
      return candidate.methods.includes(method) && candidate.paths.includes(path)
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
      return {
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      }
    }

    current.count += 1
    state.set(key, current)
    return null
  }
}

function shouldExposeErrorDetails(statusCode = 500) {
  const expose = String(process.env.EXPOSE_ERROR_DETAILS || '').trim() === '1'
  if (expose) return true
  return process.env.NODE_ENV !== 'production' && statusCode < 500
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
  getClientIp,
  getMaxJsonBodyBytes,
  getNoStoreHeaders,
  getSecurityHeaders,
  getServerTimeoutConfig,
  shouldExposeErrorDetails,
}
