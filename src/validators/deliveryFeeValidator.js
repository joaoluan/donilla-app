const { z } = require('zod')
const { AppError } = require('../utils/errors')
const { toInt } = require('./common')

function normalizeOptionalLocation(value) {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).trim()
  return normalized || null
}

const createDeliveryFeeSchema = z
  .object({
    bairro: z.preprocess(normalizeOptionalLocation, z.string().max(100).nullable().optional()),
    cidade: z.preprocess(normalizeOptionalLocation, z.string().max(100).nullable().optional()),
    valor_entrega: z.coerce.number().min(0).max(9999),
    ativo: z.coerce.boolean().optional(),
  })
  .strict()
  .refine((payload) => payload.bairro || payload.cidade, {
    message: 'Informe ao menos um bairro ou cidade.',
  })

const updateDeliveryFeeSchema = z
  .object({
    bairro: z.preprocess(normalizeOptionalLocation, z.string().max(100).nullable().optional()),
    cidade: z.preprocess(normalizeOptionalLocation, z.string().max(100).nullable().optional()),
    valor_entrega: z.coerce.number().min(0).max(9999).optional(),
    ativo: z.coerce.boolean().optional(),
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  })

function parseDeliveryFeeId(value) {
  const id = toInt(value)
  if (!id) throw new AppError(400, 'ID de taxa de entrega invalido.')
  return id
}

function validateCreateDeliveryFee(input) {
  const parsed = createDeliveryFeeSchema.safeParse(input || {})
  if (!parsed.success) throw new AppError(400, 'Dados da taxa de entrega invalidos.')
  return {
    bairro: parsed.data.bairro ?? null,
    cidade: parsed.data.cidade ?? null,
    valor_entrega: parsed.data.valor_entrega,
    ativo: parsed.data.ativo ?? true,
  }
}

function validateUpdateDeliveryFee(input) {
  const parsed = updateDeliveryFeeSchema.safeParse(input || {})
  if (!parsed.success) {
    const firstIssue = parsed.error.issues?.[0]?.message
    if (firstIssue === 'Informe ao menos um campo para atualizar.') {
      throw new AppError(400, firstIssue)
    }
    throw new AppError(400, 'Dados da taxa de entrega invalidos.')
  }
  return parsed.data
}

module.exports = {
  parseDeliveryFeeId,
  validateCreateDeliveryFee,
  validateUpdateDeliveryFee,
}
