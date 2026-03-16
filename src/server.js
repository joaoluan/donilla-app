const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const pathLib = require('node:path')
const { createRouter } = require('./routes')
const { AppError } = require('./utils/errors')
const { sendError, sendRaw, sendSuccess } = require('./utils/http')

// Keep public entrypoints explicit so production URLs stay predictable.
const STATIC_ROUTES = {
  '/': { type: 'file', fileName: 'cliente-login.html' },
  '/loja': { type: 'file', fileName: 'cliente-login.html' },
  '/catalogo': { type: 'file', fileName: 'site.html' },
  '/admin': { type: 'file', fileName: 'admin.html' },
  '/site': { type: 'redirect', location: '/', statusCode: 308 },
  '/cliente': { type: 'redirect', location: '/', statusCode: 308 },
  '/styles.css': { type: 'file', fileName: 'styles.css' },
  '/logo-donilla.png': { type: 'file', fileName: 'logo-donilla.png' },
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
}

async function serveStatic(req, res, routePath) {
  if (req.method !== 'GET') return false
  const route = STATIC_ROUTES[routePath]
  if (!route) return false

  if (route.type === 'redirect') {
    res.writeHead(route.statusCode || 302, { Location: route.location })
    res.end()
    return true
  }

  const fileName = route.fileName
  const filePath = pathLib.join(process.cwd(), 'public', fileName)
  const ext = pathLib.extname(fileName)
  const mime = MIME_TYPES[ext] || 'text/plain; charset=utf-8'
  const content = await readFile(filePath)

  res.writeHead(200, { 'Content-Type': mime })
  res.end(content)
  return true
}

function handleError(res, error) {
  if (error instanceof AppError) {
    sendError(res, error.statusCode, error.message, error.details)
    return
  }

  if (error?.code === 'P2025') {
    sendError(res, 404, 'Registro nao encontrado.')
    return
  }

  if (error?.code === 'P2002') {
    sendError(res, 409, 'Registro duplicado para campo unico.')
    return
  }

  if (error?.code === 'P2003') {
    sendError(
      res,
      409,
      'Nao foi possivel excluir este registro porque ele esta vinculado a outros dados.',
      error?.message || 'Restricao de chave estrangeira.',
    )
    return
  }

  if (error?.code === 'P2022') {
    sendError(
      res,
      500,
      'Schema do banco desatualizado. Aplique a atualizacao do cardapio no banco de dados.',
      error?.message || 'Coluna ou tabela ausente no banco.',
    )
    return
  }

  if (error?.name === 'PrismaClientValidationError') {
    sendError(res, 400, 'Dados invalidos.', error.message)
    return
  }

  if (error?.code === '22001') {
    sendError(res, 400, 'Imagem fora do tamanho permitido para o banco de dados.')
    return
  }

  sendError(res, 500, 'Erro interno no servidor.', error?.message || String(error))
}

function createApp(prisma) {
  const route = createRouter(prisma)

  return createServer(async (req, res) => {
    const method = req.method || 'GET'
    const url = new URL(req.url || '/', 'http://localhost')
    const path = url.pathname
    const normalizedPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path

    try {
      const served = await serveStatic(req, res, normalizedPath)
      if (served) return

      const response = await route(req, method, normalizedPath, url)

      if (response === null) {
        sendError(res, 404, 'Rota nao encontrada.')
        return
      }

      if (Object.prototype.hasOwnProperty.call(response || {}, 'rawBody')) {
        sendRaw(
          res,
          response?.statusCode || 200,
          response.rawBody,
          response?.contentType || 'text/plain; charset=utf-8',
          response?.headers || {},
        )
        return
      }

      const statusCode = response?.statusCode || 200
      const data = Object.prototype.hasOwnProperty.call(response || {}, 'data') ? response.data : response
      const meta = response?.meta
      sendSuccess(res, statusCode, data, meta)
    } catch (error) {
      handleError(res, error)
    }
  })
}

module.exports = { createApp }
