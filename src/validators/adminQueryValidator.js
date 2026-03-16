const { z } = require('zod')
const { AppError } = require('../utils/errors')

const positiveInt = z.coerce.number().int().positive()
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const basePeriodSchema = z.object({
  period: z.enum(['7d', '30d', 'month', 'all', 'custom']).default('7d'),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
})

const ordersQuerySchema = basePeriodSchema.extend({
  page: positiveInt.default(1),
  pageSize: positiveInt.max(50).default(10),
  status: z.enum(['all', 'pendente', 'preparando', 'saiu_para_entrega', 'entregue', 'cancelado']).default('all'),
  search: z.string().trim().max(80).optional(),
})

function fromSearchParams(url) {
  return Object.fromEntries(url.searchParams.entries())
}

function validatePeriodRange(data) {
  if (data.period !== 'custom') return data

  if (!data.from && !data.to) {
    throw new AppError(400, 'Informe ao menos uma data para o periodo personalizado.')
  }

  if (data.from && data.to && data.from > data.to) {
    throw new AppError(400, 'A data inicial deve ser menor ou igual a data final.')
  }

  return data
}

function parseDashboardQuery(url) {
  const parsed = basePeriodSchema.safeParse(fromSearchParams(url))
  if (!parsed.success) throw new AppError(400, 'Parametros de filtro invalidos.')
  return validatePeriodRange(parsed.data)
}

function parseOrdersQuery(url) {
  const parsed = ordersQuerySchema.safeParse(fromSearchParams(url))
  if (!parsed.success) throw new AppError(400, 'Parametros de listagem invalidos.')
  return validatePeriodRange(parsed.data)
}

module.exports = {
  parseDashboardQuery,
  parseOrdersQuery,
}
