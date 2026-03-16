const { z } = require('zod')
const { AppError } = require('../utils/errors')

const positiveInt = z.coerce.number().int().positive()

const basePaginationSchema = z.object({
  page: positiveInt.default(1),
  pageSize: positiveInt.max(100).default(10),
  order: z.enum(['asc', 'desc']).default('asc'),
})

const categoriasListSchema = basePaginationSchema.extend({
  search: z.string().trim().optional(),
  sort: z.enum(['id', 'nome', 'ordem_exibicao']).default('id'),
})

const produtosListSchema = basePaginationSchema.extend({
  search: z.string().trim().optional(),
  sort: z.enum(['id', 'nome_doce', 'preco', 'estoque_disponivel', 'categoria']).default('id'),
  categoria_id: z.coerce.number().int().positive().optional(),
  ativo: z.enum(['true', 'false']).optional(),
  disponibilidade: z.enum(['all', 'disponiveis', 'inativos', 'sem_estoque']).optional(),
})

function fromSearchParams(url) {
  return Object.fromEntries(url.searchParams.entries())
}

function parseCategoriasListQuery(url) {
  const parsed = categoriasListSchema.safeParse(fromSearchParams(url))
  if (!parsed.success) throw new AppError(400, 'Parametros de listagem invalidos.')
  return parsed.data
}

function parseProdutosListQuery(url) {
  const parsed = produtosListSchema.safeParse(fromSearchParams(url))
  if (!parsed.success) throw new AppError(400, 'Parametros de listagem invalidos.')
  return {
    ...parsed.data,
    ativo: parsed.data.ativo === undefined ? undefined : parsed.data.ativo === 'true',
    disponibilidade: parsed.data.disponibilidade || 'all',
  }
}

module.exports = {
  parseCategoriasListQuery,
  parseProdutosListQuery,
}
