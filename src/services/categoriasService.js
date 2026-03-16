const { AppError } = require('../utils/errors')

function categoriasService(prisma) {
  return {
    async list(params) {
      const { page, pageSize, search, sort, order } = params
      const skip = (page - 1) * pageSize
      const where = search
        ? { nome: { contains: search, mode: 'insensitive' } }
        : undefined

      const [items, total] = await prisma.$transaction([
        prisma.categorias.findMany({
          where,
          orderBy: { [sort]: order },
          skip,
          take: pageSize,
          include: {
            _count: {
              select: { produtos: true },
            },
          },
        }),
        prisma.categorias.count({ where }),
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

    async getById(id) {
      const categoria = await prisma.categorias.findUnique({ where: { id } })
      if (!categoria) throw new AppError(404, 'Categoria nao encontrada.')
      return categoria
    },

    create(data) {
      return prisma.categorias.create({ data })
    },

    update(id, data) {
      return prisma.categorias.update({ where: { id }, data })
    },

    async remove(id) {
      await prisma.categorias.delete({ where: { id } })
      return { deleted: true }
    },
  }
}

module.exports = { categoriasService }
