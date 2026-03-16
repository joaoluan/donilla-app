const { AppError } = require('../utils/errors')
const { scoreSearchMatch } = require('../utils/search')

function compareCategorias(left, right, sort, order) {
  const direction = order === 'desc' ? -1 : 1

  if (sort === 'nome') {
    return left.nome.localeCompare(right.nome, 'pt-BR', { sensitivity: 'base' }) * direction
  }

  if (sort === 'ordem_exibicao') {
    const leftValue = Number(left.ordem_exibicao || 0)
    const rightValue = Number(right.ordem_exibicao || 0)
    if (leftValue !== rightValue) return (leftValue - rightValue) * direction
    return left.nome.localeCompare(right.nome, 'pt-BR', { sensitivity: 'base' })
  }

  return (Number(left.id || 0) - Number(right.id || 0)) * direction
}

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

      if (search && total === 0) {
        const fallbackItems = await prisma.categorias.findMany({
          orderBy: { [sort]: order },
          include: {
            _count: {
              select: { produtos: true },
            },
          },
        })

        const rankedItems = fallbackItems
          .map((item) => ({ item, score: scoreSearchMatch(search, [item.nome]) }))
          .filter((entry) => entry.score >= 0)
          .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score
            return compareCategorias(left.item, right.item, sort, order)
          })
          .map((entry) => entry.item)

        const fallbackTotal = rankedItems.length
        const totalPages = Math.max(1, Math.ceil(fallbackTotal / pageSize))
        const safePage = Math.min(Math.max(page, 1), totalPages)
        const fallbackSkip = (safePage - 1) * pageSize

        return {
          items: rankedItems.slice(fallbackSkip, fallbackSkip + pageSize),
          meta: {
            page: safePage,
            pageSize,
            total: fallbackTotal,
            totalPages,
          },
        }
      }

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
