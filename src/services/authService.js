const { createHash, randomBytes } = require('node:crypto')
const { AppError } = require('../utils/errors')
const { signToken } = require('../utils/jwt')
const { verifyPassword } = require('../utils/password')

function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function authService(prisma) {
  function getAccessConfig() {
    const secret = process.env.JWT_SECRET
    const ttl = Number.parseInt(process.env.JWT_EXPIRES_IN || '3600', 10)
    if (!secret) throw new AppError(500, 'JWT_SECRET nao configurado no ambiente.')
    return { secret, ttl: Number.isNaN(ttl) ? 3600 : ttl }
  }

  function getRefreshConfig() {
    const ttl = Number.parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '604800', 10)
    return { ttl: Number.isNaN(ttl) ? 604800 : ttl }
  }

  function issueAccessToken(user) {
    const { secret, ttl } = getAccessConfig()
    const token = signToken(
      {
        sub: String(user.id),
        username: user.username,
        role: user.role,
      },
      secret,
      ttl,
    )

    return { token, ttl }
  }

  async function issueRefreshToken(userId) {
    const { ttl } = getRefreshConfig()
    const refreshToken = randomBytes(48).toString('base64url')
    const tokenHash = hashRefreshToken(refreshToken)
    const expiresAt = new Date(Date.now() + ttl * 1000)

    await prisma.refresh_tokens.create({
      data: {
        usuario_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    })

    return { refreshToken, ttl }
  }

  return {
    async login(username, password) {
      const user = await prisma.usuarios.findUnique({ where: { username } })

      if (!user || !user.ativo || !verifyPassword(password, user.password_hash)) {
        throw new AppError(401, 'Credenciais invalidas.')
      }

      const access = issueAccessToken(user)
      const refresh = await issueRefreshToken(user.id)

      return {
        accessToken: access.token,
        accessExpiresIn: access.ttl,
        refreshToken: refresh.refreshToken,
        refreshExpiresIn: refresh.ttl,
        user: { id: user.id, username: user.username, role: user.role },
      }
    },

    async refresh(refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken)

      const dbToken = await prisma.refresh_tokens.findUnique({
        where: { token_hash: tokenHash },
        include: { usuarios: true },
      })

      if (
        !dbToken ||
        dbToken.revoked_at ||
        dbToken.expires_at.getTime() <= Date.now() ||
        !dbToken.usuarios?.ativo
      ) {
        throw new AppError(401, 'Refresh token invalido ou expirado.')
      }

      await prisma.refresh_tokens.update({
        where: { id: dbToken.id },
        data: { revoked_at: new Date() },
      })

      const access = issueAccessToken(dbToken.usuarios)
      const refresh = await issueRefreshToken(dbToken.usuarios.id)

      return {
        accessToken: access.token,
        accessExpiresIn: access.ttl,
        refreshToken: refresh.refreshToken,
        refreshExpiresIn: refresh.ttl,
        user: {
          id: dbToken.usuarios.id,
          username: dbToken.usuarios.username,
          role: dbToken.usuarios.role,
        },
      }
    },

    async logout(refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken)

      const dbToken = await prisma.refresh_tokens.findUnique({
        where: { token_hash: tokenHash },
      })

      if (dbToken && !dbToken.revoked_at) {
        await prisma.refresh_tokens.update({
          where: { id: dbToken.id },
          data: { revoked_at: new Date() },
        })
      }

      return { loggedOut: true }
    },
  }
}

module.exports = { authService }
