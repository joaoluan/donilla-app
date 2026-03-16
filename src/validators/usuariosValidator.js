const { z } = require('zod')
const { AppError } = require('../utils/errors')
const { toInt } = require('./common')

const roleSchema = z.enum(['admin', 'user'])

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
  role: roleSchema.optional(),
  ativo: z.enum(['true', 'false']).optional(),
  sort: z.enum(['id', 'username', 'criado_em']).default('id'),
  order: z.enum(['asc', 'desc']).default('asc'),
})

const createSchema = z.object({
  username: z.string().trim().min(3).max(80),
  password: z.string().min(6).max(128),
  role: roleSchema.default('user'),
  ativo: z.coerce.boolean().default(true),
})

const updateSchema = z
  .object({
    username: z.string().trim().min(3).max(80).optional(),
    role: roleSchema.optional(),
    ativo: z.coerce.boolean().optional(),
  })
  .strict()

const resetPasswordSchema = z.object({
  password: z.string().min(6).max(128),
})

function parseUsuarioId(value) {
  const id = toInt(value)
  if (!id) throw new AppError(400, 'ID invalido.')
  return id
}

function parseUsuariosListQuery(url) {
  const parsed = listSchema.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) throw new AppError(400, 'Parametros de listagem invalidos.')
  return {
    ...parsed.data,
    ativo: parsed.data.ativo === undefined ? undefined : parsed.data.ativo === 'true',
  }
}

function validateCreateUsuario(input) {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) throw new AppError(400, 'Campos obrigatorios: username, password.')
  return parsed.data
}

function validateUpdateUsuario(input) {
  const parsed = updateSchema.safeParse(input || {})
  if (!parsed.success) throw new AppError(400, 'Dados invalidos.')
  if (Object.keys(parsed.data).length === 0) {
    throw new AppError(400, 'Informe ao menos um campo para atualizar.')
  }
  return parsed.data
}

function validateResetPassword(input) {
  const parsed = resetPasswordSchema.safeParse(input)
  if (!parsed.success) throw new AppError(400, 'Campo obrigatorio: password.')
  return parsed.data
}

module.exports = {
  parseUsuarioId,
  parseUsuariosListQuery,
  validateCreateUsuario,
  validateResetPassword,
  validateUpdateUsuario,
}
