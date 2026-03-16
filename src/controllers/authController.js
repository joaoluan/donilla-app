const { z } = require('zod')
const { AppError } = require('../utils/errors')
const { parseJsonBody } = require('../utils/http')
const { authService } = require('../services/authService')

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

function authController(prisma) {
  const service = authService(prisma)
  return {
    async login(req) {
      const body = await parseJsonBody(req)
      const parsed = loginSchema.safeParse(body)
      if (!parsed.success) {
        throw new AppError(400, 'Campos obrigatorios: username, password.')
      }

      const session = await service.login(parsed.data.username, parsed.data.password)

      return {
        statusCode: 200,
        data: {
          accessToken: session.accessToken,
          accessTokenType: 'Bearer',
          accessExpiresIn: session.accessExpiresIn,
          refreshToken: session.refreshToken,
          refreshExpiresIn: session.refreshExpiresIn,
          user: session.user,
        },
      }
    },

    async refresh(req) {
      const body = await parseJsonBody(req)
      const parsed = refreshSchema.safeParse(body)
      if (!parsed.success) {
        throw new AppError(400, 'Campo obrigatorio: refreshToken.')
      }

      const session = await service.refresh(parsed.data.refreshToken)
      return {
        statusCode: 200,
        data: {
          accessToken: session.accessToken,
          accessTokenType: 'Bearer',
          accessExpiresIn: session.accessExpiresIn,
          refreshToken: session.refreshToken,
          refreshExpiresIn: session.refreshExpiresIn,
          user: session.user,
        },
      }
    },

    async logout(req) {
      const body = await parseJsonBody(req)
      const parsed = refreshSchema.safeParse(body)
      if (!parsed.success) {
        throw new AppError(400, 'Campo obrigatorio: refreshToken.')
      }

      const data = await service.logout(parsed.data.refreshToken)
      return { statusCode: 200, data }
    },
  }
}

module.exports = { authController }
