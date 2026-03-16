const { AppError } = require('../utils/errors')
const { hashPassword } = require('../utils/password')

function usuariosService(prisma) {
  return {
    async list(params) {
      const { page, pageSize, search, role, ativo, sort, order } = params
      const skip = (page - 1) * pageSize

      const where = {
        ...(search ? { username: { contains: search, mode: 'insensitive' } } : {}),
        ...(role ? { role } : {}),
        ...(ativo === undefined ? {} : { ativo }),
      }

      const [items, total] = await prisma.$transaction([
        prisma.usuarios.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { [sort]: order },
          select: {
            id: true,
            username: true,
            role: true,
            ativo: true,
            created_by: true,
            updated_by: true,
            criado_em: true,
            atualizado_em: true,
          },
        }),
        prisma.usuarios.count({ where }),
      ])

      return {
        items,
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      }
    },

    async create(data, actorId) {
      try {
        return await prisma.usuarios.create({
          data: {
            username: data.username,
            password_hash: hashPassword(data.password),
            role: data.role,
            ativo: data.ativo,
            created_by: actorId,
            updated_by: actorId,
          },
          select: {
            id: true,
            username: true,
            role: true,
            ativo: true,
            created_by: true,
            updated_by: true,
            criado_em: true,
            atualizado_em: true,
          },
        })
      } catch (error) {
        if (error?.code === 'P2002') {
          throw new AppError(409, 'Username ja existe.')
        }
        throw error
      }
    },

    async update(id, data, actorId) {
      const current = await prisma.usuarios.findUnique({
        where: { id },
        select: { id: true, role: true, ativo: true },
      })

      if (!current) throw new AppError(404, 'Usuario nao encontrado.')

      if (actorId === id && data.ativo === false) {
        throw new AppError(400, 'Nao e permitido desativar seu proprio usuario.')
      }
      if (actorId === id && data.role && data.role !== current.role) {
        throw new AppError(400, 'Nao e permitido alterar seu proprio role.')
      }

      try {
        const updated = await prisma.usuarios.update({
          where: { id },
          data: {
            ...data,
            updated_by: actorId,
          },
          select: {
            id: true,
            username: true,
            role: true,
            ativo: true,
            created_by: true,
            updated_by: true,
            criado_em: true,
            atualizado_em: true,
          },
        })

        if (data.ativo === false) {
          await prisma.refresh_tokens.updateMany({
            where: { usuario_id: id, revoked_at: null },
            data: { revoked_at: new Date() },
          })
        }

        return updated
      } catch (error) {
        if (error?.code === 'P2025') throw new AppError(404, 'Usuario nao encontrado.')
        if (error?.code === 'P2002') throw new AppError(409, 'Username ja existe.')
        throw error
      }
    },

    async resetPassword(id, password, actorId) {
      try {
        await prisma.usuarios.update({
          where: { id },
          data: { password_hash: hashPassword(password), updated_by: actorId },
        })
      } catch (error) {
        if (error?.code === 'P2025') throw new AppError(404, 'Usuario nao encontrado.')
        throw error
      }

      await prisma.refresh_tokens.updateMany({
        where: { usuario_id: id, revoked_at: null },
        data: { revoked_at: new Date() },
      })

      return { passwordReset: true }
    },

    async remove(id, actorId) {
      if (actorId === id) {
        throw new AppError(400, 'Nao e permitido remover seu proprio usuario.')
      }

      try {
        const updated = await prisma.usuarios.update({
          where: { id },
          data: { ativo: false, updated_by: actorId },
          select: {
            id: true,
            username: true,
            role: true,
            ativo: true,
            created_by: true,
            updated_by: true,
            criado_em: true,
            atualizado_em: true,
          },
        })

        await prisma.refresh_tokens.updateMany({
          where: { usuario_id: id, revoked_at: null },
          data: { revoked_at: new Date() },
        })

        return updated
      } catch (error) {
        if (error?.code === 'P2025') throw new AppError(404, 'Usuario nao encontrado.')
        throw error
      }
    },
  }
}

module.exports = { usuariosService }
