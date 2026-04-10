const { AppError } = require('../utils/errors')
const { scoreSearchMatch } = require('../utils/search')

function buildCategoriaWhere(extra = {}) {
  return {
    removido_em: null,
    ...extra,
  }
}

function buildCategoriaCountInclude() {
  return {
    _count: {
      select: {
        produtos: {
          where: { removido_em: null },
        },
      },
    },
  }
}

async function findCategoriaAtiva(prisma, id) {
  if (typeof prisma?.categorias?.findFirst === 'function') {
    return prisma.categorias.findFirst({
      where: buildCategoriaWhere({ id }),
    })
  }

  const categoria = await prisma?.categorias?.findUnique?.({
    where: { id },
  })

  if (!categoria || categoria.removido_em) return null
  return categoria
}

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
      const where = buildCategoriaWhere(
        search
          ? { nome: { contains: search, mode: 'insensitive' } }
          : {},
      )

      const [items, total] = await prisma.$transaction([
        prisma.categorias.findMany({
          where,
          orderBy: { [sort]: order },
          skip,
          take: pageSize,
          include: buildCategoriaCountInclude(),
        }),
        prisma.categorias.count({ where }),
      ])

      if (search && total === 0) {
        const fallbackItems = await prisma.categorias.findMany({
          where: buildCategoriaWhere(),
          orderBy: { [sort]: order },
          include: buildCategoriaCountInclude(),
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
      const categoria = await findCategoriaAtiva(prisma, id)
      if (!categoria) throw new AppError(404, 'Categoria nao encontrada.')
      return categoria
    },

    create(data) {
      return prisma.categorias.create({ data })
    },

    async update(id, data) {
      const categoria = await findCategoriaAtiva(prisma, id)
      if (!categoria) throw new AppError(404, 'Categoria nao encontrada.')
      return prisma.categorias.update({ where: { id }, data })
    },

    async remove(id) {
      const categoria = await findCategoriaAtiva(prisma, id)
      if (!categoria) throw new AppError(404, 'Categoria nao encontrada.')

      const removidoEm = new Date()
      const executeSoftDelete = async (tx) => {
        const affectedProducts = await tx.produtos.updateMany({
          where: {
            categoria_id: id,
            removido_em: null,
          },
          data: {
            ativo: false,
            removido_em: removidoEm,
          },
        })

        await tx.categorias.update({
          where: { id },
          data: {
            removido_em: removidoEm,
          },
        })

        return {
          deleted: true,
          softDeleted: true,
          produtos_removidos: affectedProducts.count,
        }
      }

      if (typeof prisma.$transaction === 'function') {
        return prisma.$transaction((tx) => executeSoftDelete(tx))
      }

      return executeSoftDelete(prisma)
    },
  }
}

module.exports = { categoriasService }
