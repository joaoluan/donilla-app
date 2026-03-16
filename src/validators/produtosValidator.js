const { AppError } = require('../utils/errors')
const { z } = require('zod')
const { toInt } = require('./common')

function parseImagemDataUrl(value) {
  if (value === undefined || value === null) return undefined

  const parsed = String(value).trim()
  if (!parsed) return undefined

  const match = /^data:image\/[a-z0-9.+-]+;base64,/.test(parsed)
  if (!match) throw new AppError(400, 'imagem_data_url invalida. Use data URL de imagem (Base64).')

  return parsed
}

function parseImageUrlFromPayload(data) {
  if (!data || typeof data !== 'object') return data

  if (Object.prototype.hasOwnProperty.call(data, 'imagem_data_url')) {
    const dataUrl = parseImagemDataUrl(data.imagem_data_url)
    const nextData = { ...data }

    if (dataUrl) {
      nextData.imagem_url = dataUrl
    } else {
      delete nextData.imagem_url
    }

    delete nextData.imagem_data_url
    return nextData
  }

  return { ...data }
}

function parseProdutoId(value) {
  const id = toInt(value)
  if (!id) throw new AppError(400, 'ID invalido.')
  return id
}

function validateCreateProduto(input) {
  const schema = z.object({
    categoria_id: z.coerce.number().int().positive(),
    nome_doce: z.string().trim().min(1),
    preco: z.coerce.number(),
    descricao: z.string().optional(),
    estoque_disponivel: z.coerce.number().int().min(0).nullable().optional(),
    imagem_url: z.string().optional(),
    ativo: z.coerce.boolean().optional(),
  })

  const parsed = schema.safeParse({
    ...parseImageUrlFromPayload(input),
    clear_imagem_url: undefined,
  })
  if (!parsed.success) {
    throw new AppError(400, 'Campos obrigatorios: categoria_id, nome_doce, preco.')
  }

  return {
    ...parsed.data,
    clear_imagem_url: undefined,
  }
}

function validateUpdateProduto(input) {
  const schema = z
    .object({
      categoria_id: z.coerce.number().int().positive().optional(),
      nome_doce: z.string().trim().min(1).optional(),
      preco: z.coerce.number().optional(),
      descricao: z.string().optional(),
      estoque_disponivel: z.coerce.number().int().min(0).nullable().optional(),
      imagem_url: z.string().optional(),
      clear_imagem_url: z.coerce.boolean().optional(),
      ativo: z.coerce.boolean().optional(),
    })
    .strict()

  const parsed = schema.safeParse(parseImageUrlFromPayload(input))
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.[0]
    if (field === 'categoria_id') throw new AppError(400, 'categoria_id invalido.')
    if (field === 'nome_doce') throw new AppError(400, 'nome_doce invalido.')
    if (field === 'preco') throw new AppError(400, 'preco invalido.')
    throw new AppError(400, 'Dados invalidos.')
  }

  if (Object.keys(parsed.data).length === 0) {
    throw new AppError(400, 'Informe ao menos um campo para atualizar.')
  }

  const normalized = { ...parsed.data }
  if (normalized.clear_imagem_url) {
    normalized.imagem_url = null
  }
  delete normalized.clear_imagem_url

  return normalized
}

module.exports = {
  parseProdutoId,
  validateCreateProduto,
  validateUpdateProduto,
}
