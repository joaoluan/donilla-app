const { AppError } = require('../utils/errors')
const { z } = require('zod')
const { toInt } = require('./common')

function parseCategoriaId(value) {
  const id = toInt(value)
  if (!id) throw new AppError(400, 'ID invalido.')
  return id
}

function validateCreateCategoria(input) {
  const schema = z.object({
    nome: z.string().trim().min(1),
    ordem_exibicao: z.coerce.number().int().optional().default(0),
  })

  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.[0]
    if (field === 'nome') throw new AppError(400, 'Campo "nome" e obrigatorio.')
    if (field === 'ordem_exibicao') throw new AppError(400, 'Campo "ordem_exibicao" invalido.')
    throw new AppError(400, 'Dados invalidos.')
  }

  return parsed.data
}

function validateUpdateCategoria(input) {
  const schema = z
    .object({
      nome: z.string().trim().min(1).optional(),
      ordem_exibicao: z.coerce.number().int().optional(),
    })
    .strict()

  const parsed = schema.safeParse(input || {})
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.[0]
    if (field === 'nome') throw new AppError(400, 'Campo "nome" invalido.')
    if (field === 'ordem_exibicao') throw new AppError(400, 'Campo "ordem_exibicao" invalido.')
    throw new AppError(400, 'Dados invalidos.')
  }

  if (Object.keys(parsed.data).length === 0) {
    throw new AppError(400, 'Informe ao menos um campo para atualizar.')
  }

  return parsed.data
}

module.exports = {
  parseCategoriaId,
  validateCreateCategoria,
  validateUpdateCategoria,
}
