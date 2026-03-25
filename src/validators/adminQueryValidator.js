const { z } = require('zod')
const { AppError } = require('../utils/errors')

const positiveInt = z.coerce.number().int().positive()
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const isoDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
const periodSchema = z.enum(['today', '7d', '30d', 'month', 'all', 'custom'])

const basePeriodSchema = z.object({
  period: periodSchema.default('7d'),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  fromAt: isoDateTimeSchema.optional(),
  toAt: isoDateTimeSchema.optional(),
})

const ordersQuerySchema = basePeriodSchema.extend({
  page: positiveInt.default(1),
  pageSize: positiveInt.max(50).default(10),
  status: z.enum(['all', 'pendente', 'preparando', 'saiu_para_entrega', 'entregue', 'cancelado']).default('all'),
  search: z.string().trim().max(80).optional(),
})

const customersQuerySchema = basePeriodSchema.extend({
  period: periodSchema.default('all'),
  page: positiveInt.default(1),
  pageSize: positiveInt.max(50).default(12),
  segment: z.enum(['all', 'lead', 'novo', 'recorrente', 'inativo']).default('all'),
  sort: z.enum(['recent_desc', 'total_spent_desc', 'orders_desc', 'name_asc']).default('recent_desc'),
  search: z.string().trim().max(80).optional(),
})

function fromSearchParams(url) {
  return Object.fromEntries(url.searchParams.entries())
}

function validatePeriodRange(data) {
  if (data.period !== 'custom') return data

  if (!data.from && !data.to && !data.fromAt && !data.toAt) {
    throw new AppError(400, 'Informe ao menos uma data para o periodo personalizado.')
  }

  if (data.from && data.to && data.from > data.to) {
    throw new AppError(400, 'A data inicial deve ser menor ou igual a data final.')
  }

  if (data.fromAt && data.toAt && data.fromAt > data.toAt) {
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

function parseCustomersQuery(url) {
  const parsed = customersQuerySchema.safeParse(fromSearchParams(url))
  if (!parsed.success) throw new AppError(400, 'Parametros da carteira de clientes invalidos.')
  return validatePeriodRange(parsed.data)
}

function parseCustomerId(value) {
  const parsed = positiveInt.safeParse(value)
  if (!parsed.success) {
    throw new AppError(400, 'ID de cliente invalido.')
  }

  return parsed.data
}

module.exports = {
  parseDashboardQuery,
  parseOrdersQuery,
  parseCustomersQuery,
  parseCustomerId,
}
