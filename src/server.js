const { createServer } = require('node:http')
const { open } = require('node:fs/promises')
const pathLib = require('node:path')
const { pipeline } = require('node:stream/promises')
const { createRouter } = require('./routes')
const { AppError } = require('./utils/errors')
const { sendError, sendRaw, sendSuccess } = require('./utils/http')
const {
  createRateLimitGuard,
  getCorsHeaders,
  getNoStoreHeaders,
  getSecurityHeaders,
  getServerTimeoutConfig,
  isCorsPreflightRequest,
  shouldExposeErrorDetails,
} = require('./utils/security')

// Keep public entrypoints explicit so production URLs stay predictable.
const ADMIN_STATIC_ROUTE = { type: 'file', fileName: 'admin.html' }
const PUBLIC_DIR = pathLib.join(process.cwd(), 'public')
const PUBLIC_ASSETS_DIR = pathLib.join(PUBLIC_DIR, 'assets')
const PUBLIC_TRACKING_PAGE_PATTERN = /^\/pedido\/[^/]+$/
const STATIC_ROUTES = {
  '/': { type: 'file', fileName: 'cliente-login.html' },
  '/loja': { type: 'file', fileName: 'cliente-login.html' },
  '/catalogo': { type: 'file', fileName: 'site.html' },
  '/admin': ADMIN_STATIC_ROUTE,
  '/admin/resumo': ADMIN_STATIC_ROUTE,
  '/admin/clientes': ADMIN_STATIC_ROUTE,
  '/admin/cardapio': ADMIN_STATIC_ROUTE,
  '/admin/pedidos': ADMIN_STATIC_ROUTE,
  '/admin/bot-whatsapp': ADMIN_STATIC_ROUTE,
  '/admin/bot-whatsapp/disparos': ADMIN_STATIC_ROUTE,
  '/admin/disparos': ADMIN_STATIC_ROUTE,
  '/admin/configuracoes': ADMIN_STATIC_ROUTE,
  '/admin/bot-whatsapp/fluxos': { type: 'file', fileName: 'flows.html' },
  '/admin/bot-whatsapp/fluxos/editor': { type: 'file', fileName: 'flow-builder.html' },
  '/admin/fluxos': { type: 'file', fileName: 'flows.html' },
  '/admin/fluxos/editor': { type: 'file', fileName: 'flow-builder.html' },
  '/site': { type: 'redirect', location: '/', statusCode: 308 },
  '/cliente': { type: 'redirect', location: '/', statusCode: 308 },
  '/styles.css': { type: 'file', fileName: 'styles.css' },
  '/logo-donilla.png': { type: 'file', fileName: 'logo-donilla.png' },
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

function resolveStaticContentType(filePath) {
  const ext = pathLib.extname(String(filePath || '')).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

function resolvePublicAssetPath(routePath) {
  if (!routePath.startsWith('/assets/')) return null

  const relativePath = routePath.replace(/^\/+/, '')
  const filePath = pathLib.resolve(PUBLIC_DIR, relativePath)

  if (filePath === PUBLIC_ASSETS_DIR) return null
  if (!filePath.startsWith(`${PUBLIC_ASSETS_DIR}${pathLib.sep}`)) return null

  return filePath
}

function buildStaticHeaders(contentType, size, extraHeaders = {}) {
  return {
    ...getSecurityHeaders(),
    ...getNoStoreHeaders(),
    'Content-Type': contentType,
    'Content-Length': String(size),
    ...extraHeaders,
  }
}

async function openStaticFile(filePath) {
  let fileHandle

  try {
    fileHandle = await open(filePath, 'r')
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') {
      return null
    }

    throw error
  }

  try {
    const stats = await fileHandle.stat()
    if (!stats.isFile()) {
      await fileHandle.close()
      return null
    }

    return {
      size: stats.size,
      stream: fileHandle.createReadStream(),
    }
  } catch (error) {
    await fileHandle.close().catch(() => {})

    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') {
      return null
    }

    throw error
  }
}

async function streamStaticFile(res, filePath, contentType, headers = {}) {
  const file = await openStaticFile(filePath)
  if (!file) return false

  res.writeHead(200, buildStaticHeaders(contentType, file.size, headers))
  try {
    await pipeline(file.stream, res)
  } catch (error) {
    if (error?.code === 'ERR_STREAM_PREMATURE_CLOSE' || error?.code === 'ECONNRESET') {
      return true
    }

    if (res.headersSent) {
      console.error('Erro ao transmitir arquivo estatico:', error)
      if (typeof res.destroy === 'function' && !res.destroyed) {
        res.destroy(error)
      }
      return true
    }

    throw error
  }

  return true
}

async function serveStatic(req, res, routePath) {
  if (req.method !== 'GET') return false

  const corsHeaders = getCorsHeaders(req)

  const assetPath = resolvePublicAssetPath(routePath)
  if (assetPath) {
    return streamStaticFile(res, assetPath, resolveStaticContentType(assetPath), corsHeaders)
  }

  if (PUBLIC_TRACKING_PAGE_PATTERN.test(routePath)) {
    const trackingPagePath = pathLib.join(PUBLIC_DIR, 'pedido.html')
    return streamStaticFile(res, trackingPagePath, resolveStaticContentType(trackingPagePath), corsHeaders)
  }

  const route = STATIC_ROUTES[routePath]
  if (!route) return false

  if (route.type === 'redirect') {
    sendRaw(res, route.statusCode || 302, '', 'text/plain; charset=utf-8', {
      Location: route.location,
      ...corsHeaders,
    })
    return true
  }

  const fileName = route.fileName
  const filePath = pathLib.join(PUBLIC_DIR, fileName)
  return streamStaticFile(res, filePath, resolveStaticContentType(fileName), corsHeaders)
}

function handleError(req, res, error) {
  const corsHeaders = getCorsHeaders(req)

  function isSensitivePersistenceError(value) {
    const code = String(value?.code || '').trim()
    const name = String(value?.name || '').trim()

    return (
      /^P\d{4}$/i.test(code) ||
      /^\d{5}$/.test(code) ||
      name.startsWith('Prisma') ||
      Boolean(value?.clientVersion)
    )
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      console.error('Erro interno da aplicacao:', error)
    }

    sendError(
      res,
      error.statusCode,
      error.message,
      shouldExposeErrorDetails(error.statusCode) ? error.details : undefined,
      corsHeaders,
    )
    return
  }

  if (error?.code === 'P2025') {
    sendError(res, 404, 'Registro nao encontrado.', undefined, corsHeaders)
    return
  }

  if (error?.code === 'P2002') {
    sendError(res, 409, 'Registro duplicado para campo unico.', undefined, corsHeaders)
    return
  }

  if (error?.code === 'P2003') {
    sendError(
      res,
      409,
      'Nao foi possivel excluir este registro porque ele esta vinculado a outros dados.',
      shouldExposeErrorDetails(409, { sensitive: true })
        ? (error?.message || 'Restricao de chave estrangeira.')
        : undefined,
      corsHeaders,
    )
    return
  }

  if (error?.code === 'P2022') {
    sendError(
      res,
      500,
      'Schema do banco desatualizado. Aplique as atualizacoes SQL pendentes no banco de dados.',
      shouldExposeErrorDetails(500, { sensitive: true })
        ? (error?.message || 'Coluna ou tabela ausente no banco.')
        : undefined,
      corsHeaders,
    )
    return
  }

  if (error?.name === 'PrismaClientValidationError') {
    sendError(
      res,
      400,
      'Dados invalidos.',
      shouldExposeErrorDetails(400, { sensitive: true }) ? error.message : undefined,
      corsHeaders,
    )
    return
  }

  if (error?.code === '22001') {
    sendError(res, 400, 'Imagem fora do tamanho permitido para o banco de dados.', undefined, corsHeaders)
    return
  }

  console.error('Erro interno nao tratado:', error)
  sendError(
    res,
    500,
    'Erro interno no servidor.',
    shouldExposeErrorDetails(500, { sensitive: isSensitivePersistenceError(error) })
      ? error?.message || String(error)
      : undefined,
    corsHeaders,
  )
}

function createApp(prisma, deps = {}) {
  const route = createRouter(prisma, deps)
  const checkRateLimit = createRateLimitGuard()
  const server = createServer(async (req, res) => {
    const method = req.method || 'GET'
    const url = new URL(req.url || '/', 'http://localhost')
    const path = url.pathname
    const normalizedPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
    const corsHeaders = getCorsHeaders(req)
    const preflightCorsHeaders = getCorsHeaders(req, { includePreflight: true })

    try {
      if (isCorsPreflightRequest(req)) {
        if (!preflightCorsHeaders['Access-Control-Allow-Origin']) {
          sendError(res, 403, 'Origem CORS nao permitida.')
          return
        }

        sendRaw(res, 204, '', 'text/plain; charset=utf-8', preflightCorsHeaders)
        return
      }

      const served = await serveStatic(req, res, normalizedPath)
      if (served) return

      const rateLimit = checkRateLimit(req, method, normalizedPath)
      if (rateLimit) {
        sendError(
          res,
          429,
          rateLimit.message || 'Muitas requisicoes. Tente novamente em instantes.',
          undefined,
          {
            ...corsHeaders,
            'Retry-After': String(rateLimit.retryAfterSeconds),
            'RateLimit-Limit': String(rateLimit.limit),
            'RateLimit-Remaining': String(rateLimit.remaining),
            'RateLimit-Reset': String(rateLimit.resetAfterSeconds),
            'RateLimit-Policy': rateLimit.policy,
          },
        )
        return
      }

      const response = await route(req, res, method, normalizedPath, url)

      if (response?.handled) {
        return
      }

      if (response === null) {
        sendError(res, 404, 'Rota nao encontrada.', undefined, corsHeaders)
        return
      }

      if (Object.prototype.hasOwnProperty.call(response || {}, 'rawBody')) {
        sendRaw(
          res,
          response?.statusCode || 200,
          response.rawBody,
          response?.contentType || 'text/plain; charset=utf-8',
          {
            ...corsHeaders,
            ...(response?.headers || {}),
          },
        )
        return
      }

      const statusCode = response?.statusCode || 200
      const data = Object.prototype.hasOwnProperty.call(response || {}, 'data') ? response.data : response
      const meta = response?.meta
      sendSuccess(res, statusCode, data, meta, {
        ...corsHeaders,
        ...(response?.headers || {}),
      })
    } catch (error) {
      handleError(req, res, error)
    }
  })

  const timeoutConfig = getServerTimeoutConfig()
  server.headersTimeout = timeoutConfig.headersTimeout
  server.requestTimeout = timeoutConfig.requestTimeout
  server.keepAliveTimeout = timeoutConfig.keepAliveTimeout
  server.maxRequestsPerSocket = timeoutConfig.maxRequestsPerSocket

  return server
}

module.exports = { createApp, resolveStaticContentType }
