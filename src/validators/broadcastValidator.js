const { z } = require('zod')
const { AppError } = require('../utils/errors')
const { digitsOnly, normalizeWhatsAppPhone } = require('../utils/phone')

const positiveInt = z.coerce.number().int().positive()
const nonNegativeInt = z.coerce.number().int().min(0)
const paginationSchema = z.object({
  limit: positiveInt.max(100).default(100),
  offset: nonNegativeInt.default(0),
})

function decodeRouteParam(value) {
  try {
    return decodeURIComponent(String(value || '').trim())
  } catch {
    return String(value || '').trim()
  }
}

function normalizeOptionalString(value, max = 255) {
  if (value === null || value === undefined) return null

  const normalized = String(value).trim()
  if (!normalized) return null
  if (normalized.length > max) {
    throw new AppError(400, `Campo excede o limite de ${max} caracteres.`)
  }

  return normalized
}

function normalizeRequiredString(value, label, max = 255) {
  const normalized = normalizeOptionalString(value, max)
  if (!normalized) {
    throw new AppError(400, `${label} obrigatorio.`)
  }

  return normalized
}

function normalizePhone(value) {
  const normalized = normalizeWhatsAppPhone(value)
  if (!normalized) {
    throw new AppError(400, 'Telefone invalido.')
  }

  if (normalized.length < 12 || normalized.length > 20) {
    throw new AppError(400, 'Telefone invalido.')
  }

  return normalized
}

function parseOptionalDateTime(value) {
  if (value === null || value === undefined) return null

  const normalized = String(value).trim()
  if (!normalized) return null

  const parsed = new Date(normalized)
  if (!Number.isFinite(parsed.getTime())) {
    throw new AppError(400, 'Data e hora de agendamento invalida.')
  }

  return parsed
}

function parseListId(value) {
  const parsed = positiveInt.safeParse(value)
  if (!parsed.success) {
    throw new AppError(400, 'ID da lista invalido.')
  }

  return parsed.data
}

function parseTemplateId(value) {
  const parsed = positiveInt.safeParse(value)
  if (!parsed.success) {
    throw new AppError(400, 'ID do template invalido.')
  }

  return parsed.data
}

function parseCampaignId(value) {
  const parsed = positiveInt.safeParse(value)
  if (!parsed.success) {
    throw new AppError(400, 'ID da campanha invalido.')
  }

  return parsed.data
}

function parseMemberPhone(value) {
  const digits = digitsOnly(decodeRouteParam(value))
  if (!digits || digits.length < 10 || digits.length > 20) {
    throw new AppError(400, 'Telefone invalido.')
  }

  return digits
}

function validateCreateBroadcastList(input = {}) {
  return {
    name: normalizeRequiredString(input?.name, 'Nome da lista', 255),
    description: normalizeOptionalString(input?.description, 2000),
  }
}

function validateAddBroadcastMember(input = {}) {
  return {
    phone: normalizePhone(input?.phone),
    name: normalizeOptionalString(input?.name, 255),
  }
}

function validateCreateBroadcastTemplate(input = {}) {
  return {
    name: normalizeRequiredString(input?.name, 'Nome do template', 255),
    content: normalizeRequiredString(input?.content, 'Conteudo do template', 4000),
  }
}

function validateCreateBroadcastCampaign(input = {}) {
  return {
    name: normalizeRequiredString(input?.name, 'Nome da campanha', 255),
    message: normalizeRequiredString(input?.message, 'Mensagem da campanha', 4000),
    list_id: parseListId(input?.list_id),
    scheduled_at: parseOptionalDateTime(input?.scheduled_at),
  }
}

function parseBroadcastPaginationQuery(url) {
  const parsed = paginationSchema.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) {
    throw new AppError(400, 'Parametros de paginacao invalidos.')
  }

  return parsed.data
}

module.exports = {
  parseListId,
  parseTemplateId,
  parseCampaignId,
  parseBroadcastPaginationQuery,
  parseMemberPhone,
  validateCreateBroadcastList,
  validateAddBroadcastMember,
  validateCreateBroadcastTemplate,
  validateCreateBroadcastCampaign,
}

const audienceRuleSchema = z.object({
  field: z.enum([
    'last_order_days',
    'total_orders',
    'product_bought',
    'category_bought',
    'total_spent',
    'never_ordered',
    'city',
  ]),
  operator: z.enum([
    'gte',
    'lte',
    'eq',
    'contains',
    'not_gte',
  ]),
  value: z.union([z.string(), z.number()]).transform(String),
  window_days: z.coerce.number().int().positive().optional().nullable(),
})

const audienceFilterSchema = z.object({
  logic: z.enum(['and', 'or']).default('and'),
  rules: z.array(audienceRuleSchema).min(1).max(10),
})

function validateAudienceFilter(body) {
  const result = audienceFilterSchema.safeParse(body)
  if (!result.success) {
    throw new AppError(400, result.error.issues.map((issue) => issue.message).join(', '))
  }

  return result.data
}

const createListFromFilterSchema = z.object({
  name: z.string().min(1).max(255).transform((value) => value.trim()),
  description: z.string().max(2000).optional().nullable().transform((value) => value?.trim() || null),
  filter: audienceFilterSchema,
})

function validateCreateListFromFilter(body) {
  const result = createListFromFilterSchema.safeParse(body)
  if (!result.success) {
    throw new AppError(400, result.error.issues.map((issue) => issue.message).join(', '))
  }

  return result.data
}

module.exports.validateAudienceFilter = validateAudienceFilter
module.exports.validateCreateListFromFilter = validateCreateListFromFilter
