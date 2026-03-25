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

const timeTextSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Informe horarios validos no formato HH:MM.')

const dailyStoreHoursSchema = z
  .object({
    enabled: booleanLikeSchema,
    open: timeTextSchema,
    close: timeTextSchema,
  })
  .superRefine((value, ctx) => {
    if (value.enabled && value.open === value.close) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'O horario de fechamento precisa ser diferente do horario de abertura.',
      })
    }
  })
  .strict()

const storeHoursScheduleSchema = z
  .object({
    sunday: dailyStoreHoursSchema,
    monday: dailyStoreHoursSchema,
    tuesday: dailyStoreHoursSchema,
    wednesday: dailyStoreHoursSchema,
    thursday: dailyStoreHoursSchema,
    friday: dailyStoreHoursSchema,
    saturday: dailyStoreHoursSchema,
  })
  .strict()

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
    horario_automatico_ativo: booleanLikeSchema.optional(),
    horario_funcionamento: storeHoursScheduleSchema.optional(),
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
    if (
      firstIssue === 'O tempo maximo de entrega deve ser maior ou igual ao minimo.' ||
      firstIssue === 'Informe horarios validos no formato HH:MM.' ||
      firstIssue === 'O horario de fechamento precisa ser diferente do horario de abertura.'
    ) {
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
