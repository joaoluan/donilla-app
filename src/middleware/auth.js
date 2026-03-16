const { AppError } = require('../utils/errors')
const { verifyToken } = require('../utils/jwt')

function getBearerToken(req) {
  const authorization = req.headers.authorization
  if (!authorization || !authorization.startsWith('Bearer ')) return null
  return authorization.slice('Bearer '.length).trim()
}

function requireAuth(req) {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new AppError(500, 'JWT_SECRET nao configurado no ambiente.')
  }

  const token = getBearerToken(req)
  if (!token) throw new AppError(401, 'Token Bearer obrigatorio.')

  try {
    const payload = verifyToken(token, secret)
    req.auth = payload
    return payload
  } catch (error) {
    throw new AppError(401, 'Token invalido ou expirado.', error.message)
  }
}

function requireRole(req, allowedRoles) {
  const auth = requireAuth(req)
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]

  if (!roles.includes(auth.role)) {
    throw new AppError(403, 'Sem permissao para esta operacao.')
  }

  return auth
}

module.exports = { requireAuth, requireRole }
