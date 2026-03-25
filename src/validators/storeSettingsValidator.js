const { z } = require('zod')
const { AppError } = require('../utils/errors')

const booleanLikeSchema = z
  .union([
    z.boolean(),
    z
      .string()
      .trim()
      .transform((value) => value.toLowerCase())
      .refine((value) => value === 'true' || value === 'false'),
  ])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'))

function optionalTrimmedString(maxLength, message = 'Valor invalido.') {
  return z
    .preprocess((value) => {
      if (value === undefined || value === null) return value
      if (typeof value !== 'string') return value
      const trimmed = value.trim()
      return trimmed.length === 0 ? null : trimmed
    }, z.string().max(maxLength, message).nullable())
    .optional()
}

const updateStoreSettingsSchema = z
  .object({
    loja_aberta: booleanLikeSchema.optional(),
    tempo_entrega_minutos: z.coerce.number().int().positive().max(240).optional(),
    tempo_entrega_max_minutos: z.coerce.number().int().positive().max(240).optional(),
    taxa_entrega_padrao: z.coerce.number().min(0).max(9999).optional(),
    mensagem_aviso: optionalTrimmedString(500),
    whatsapp_ativo: booleanLikeSchema.optional(),
    whatsapp_bot_pausado: booleanLikeSchema.optional(),
    whatsapp_webhook_url: z
      .preprocess((value) => {
        if (value === undefined || value === null) return value
        if (typeof value !== 'string') return value
        const trimmed = value.trim()
        return trimmed.length === 0 ? null : trimmed
      }, z.string().url('Informe uma URL valida para o webhook do bot.').max(500).nullable())
      .optional(),
    whatsapp_webhook_secret: optionalTrimmedString(255),
    whatsapp_mensagem_novo_pedido: optionalTrimmedString(1000),
    whatsapp_mensagem_status: optionalTrimmedString(1000),
  })
  .refine(
    (payload) =>
      payload.tempo_entrega_minutos === undefined ||
      payload.tempo_entrega_max_minutos === undefined ||
      payload.tempo_entrega_max_minutos >= payload.tempo_entrega_minutos,
    {
      message: 'O tempo maximo de entrega deve ser maior ou igual ao minimo.',
    },
  )
  .strict()

function validateUpdateStoreSettings(input) {
  const parsed = updateStoreSettingsSchema.safeParse(input || {})
  if (!parsed.success) {
    const firstIssue = parsed.error.issues?.[0]?.message
    if (firstIssue === 'O tempo maximo de entrega deve ser maior ou igual ao minimo.') {
      throw new AppError(400, firstIssue)
    }
    throw new AppError(400, 'Dados de configuracao da loja invalidos.')
  }
  if (Object.keys(parsed.data).length === 0) {
    throw new AppError(400, 'Informe ao menos um campo para atualizar.')
  }
  return parsed.data
}

module.exports = { validateUpdateStoreSettings }
