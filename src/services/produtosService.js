const { AppError } = require('../utils/errors')
const { scoreSearchMatch } = require('../utils/search')

const MAX_DATA_URL_BYTES = 2 * 1024 * 1024
const ALLOWED_IMAGE_MIME = ['jpeg', 'jpg', 'png', 'webp']

function compareProdutos(left, right, sort, order) {
  const direction = order === 'desc' ? -1 : 1

  if (sort === 'categoria') {
    const categoryCompare = String(left.categorias?.nome || '').localeCompare(
      String(right.categorias?.nome || ''),
      'pt-BR',
      { sensitivity: 'base' },
    )
    if (categoryCompare !== 0) return categoryCompare * direction
    return String(left.nome_doce || '').localeCompare(String(right.nome_doce || ''), 'pt-BR', {
      sensitivity: 'base',
    })
  }

  if (sort === 'nome_doce') {
    return String(left.nome_doce || '').localeCompare(String(right.nome_doce || ''), 'pt-BR', {
      sensitivity: 'base',
    }) * direction
  }

  const leftValue = Number(left[sort] ?? 0)
  const rightValue = Number(right[sort] ?? 0)
  if (leftValue !== rightValue) return (leftValue - rightValue) * direction

  return String(left.nome_doce || '').localeCompare(String(right.nome_doce || ''), 'pt-BR', {
    sensitivity: 'base',
  })
}

function parseDataUrl(dataUrl) {
  const normalized = String(dataUrl).trim()
  const match = normalized.match(/^data:image\/([a-z0-9.+-]+);base64,(.*)$/i)

  if (!match) return null

  const [, mime, base64Payload = ''] = match
  return {
    normalized,
    mime: mime.toLowerCase(),
    base64: base64Payload,
  }
}

function sanitizePayload(data) {
  const next = {}
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined) continue
    next[key] = value
  }
  return next
}

function dataUrlByteLength(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || ''
  const normalized = base64.replace(/\\s/g, '')
  if (!normalized) return 0
  return Math.floor((normalized.length * 3) / 4)
}

function assertProdutoImagemPayload(data) {
  if (!Object.prototype.hasOwnProperty.call(data, 'imagem_url')) return
  if (data.imagem_url === null || data.imagem_url === '') return
  if (typeof data.imagem_url !== 'string') {
    throw new AppError(400, 'imagem_url invalida. Deve ser uma string no formato data URL.')
  }

  const parsed = parseDataUrl(data.imagem_url)
  if (!parsed) {
    throw new AppError(400, 'imagem_url invalida. Use data URL de imagem no formato Base64.')
  }

  const mime = parsed.mime.replace(/^x-/, '')
  const baseMime = mime.split('+')[0].split(';')[0]
  if (!ALLOWED_IMAGE_MIME.includes(baseMime)) {
    throw new AppError(400, 'Tipo de imagem nao suportado. Use JPG, PNG ou WEBP.')
  }

  const byteLength = dataUrlByteLength(parsed.normalized)
  if (byteLength > MAX_DATA_URL_BYTES) {
    throw new AppError(400, 'Imagem muito grande. Envie uma imagem menor que 2MB.')
  }
}

function produtosService(prisma) {
  return {
    async list(params) {
      const { page, pageSize, search, sort, order, categoria_id, ativo, disponibilidade } = params
      const skip = (page - 1) * pageSize

      const where = {
        ...(categoria_id ? { categoria_id } : {}),
        ...(search ? { nome_doce: { contains: search, mode: 'insensitive' } } : {}),
        ...(ativo === undefined ? {} : { ativo }),
      }

      if (disponibilidade === 'disponiveis') {
        where.ativo = true
        where.OR = [{ estoque_disponivel: null }, { estoque_disponivel: { gt: 0 } }]
      } else if (disponibilidade === 'inativos') {
        where.ativo = false
      } else if (disponibilidade === 'sem_estoque') {
        where.estoque_disponivel = 0
      }

      const orderBy = sort === 'categoria'
        ? [{ categorias: { nome: order } }, { nome_doce: 'asc' }]
        : { [sort]: order }

      const [items, total] = await prisma.$transaction([
        prisma.produtos.findMany({
          where,
          orderBy,
          skip,
          take: pageSize,
          include: {
            categorias: { select: { id: true, nome: true } },
          },
        }),
        prisma.produtos.count({ where }),
      ])

      if (search && total === 0) {
        const fallbackWhere = {
          ...(categoria_id ? { categoria_id } : {}),
          ...(ativo === undefined ? {} : { ativo }),
        }

        if (disponibilidade === 'disponiveis') {
          fallbackWhere.ativo = true
          fallbackWhere.OR = [{ estoque_disponivel: null }, { estoque_disponivel: { gt: 0 } }]
        } else if (disponibilidade === 'inativos') {
          fallbackWhere.ativo = false
        } else if (disponibilidade === 'sem_estoque') {
          fallbackWhere.estoque_disponivel = 0
        }

        const fallbackItems = await prisma.produtos.findMany({
          where: fallbackWhere,
          orderBy,
          include: {
            categorias: { select: { id: true, nome: true } },
          },
        })

        const rankedItems = fallbackItems
          .map((item) => ({
            item,
            score: scoreSearchMatch(search, [
              item.nome_doce,
              item.descricao,
              item.categorias?.nome,
            ]),
          }))
          .filter((entry) => entry.score >= 0)
          .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score
            return compareProdutos(left.item, right.item, sort, order)
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
      const produto = await prisma.produtos.findUnique({
        where: { id },
        include: {
          categorias: { select: { id: true, nome: true } },
        },
      })
      if (!produto) throw new AppError(404, 'Produto nao encontrado.')
      return produto
    },

    create(data) {
      const payload = sanitizePayload(data)
      assertProdutoImagemPayload(payload)
      return prisma.produtos.create({ data: payload })
    },

    update(id, data) {
      const payload = sanitizePayload(data)
      assertProdutoImagemPayload(payload)
      return prisma.produtos.update({ where: { id }, data: payload })
    },

    async remove(id) {
      try {
        await prisma.produtos.delete({ where: { id } })
        return { deleted: true, deactivated: false }
      } catch (error) {
        if (error?.code !== 'P2003') throw error

        await prisma.produtos.update({
          where: { id },
          data: { ativo: false },
        })

        return { deleted: false, deactivated: true }
      }
    },
  }
}

module.exports = { produtosService }
