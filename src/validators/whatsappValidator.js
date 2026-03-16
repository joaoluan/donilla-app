const { z } = require('zod')
const { AppError } = require('../utils/errors')

function toPhone(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .trim()
}

const whatsappTestSchema = z.object({
  telefone_whatsapp: z.string().trim().min(8).max(20),
  nome: z.string().trim().min(2).max(100).optional(),
})

function validateWhatsAppTest(input) {
  const normalized = {
    ...input,
    telefone_whatsapp: toPhone(input?.telefone_whatsapp),
  }

  const parsed = whatsappTestSchema.safeParse(normalized)
  if (!parsed.success) {
    throw new AppError(400, 'Dados de teste do WhatsApp invalidos.')
  }

  return parsed.data
}

module.exports = {
  validateWhatsAppTest,
}
