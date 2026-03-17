const { z } = require('zod')
const { AppError } = require('../utils/errors')
const { toInt } = require('./common')

const CUSTOMER_PASSWORD_RULE_MESSAGE =
  'A senha deve ter pelo menos 6 caracteres, com 1 letra maiuscula, 1 minuscula e 1 numero.'

function isStrongCustomerPassword(value) {
  const password = String(value || '')
  return password.length >= 6 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)
}

const orderItemSchema = z.object({
  produto_id: z.coerce.number().int().positive(),
  quantidade: z.coerce.number().int().positive(),
})

const enderecoSchema = z.object({
  rua: z.string().trim().min(1),
  numero: z.string().trim().min(1),
  bairro: z.string().trim().min(1),
  cidade: z.string().trim().max(100).optional(),
  complemento: z.string().trim().optional(),
  referencia: z.string().trim().optional(),
})

const createCustomerRegisterSchema = z.object({
  nome: z.string().trim().min(2),
  telefone_whatsapp: z.string().trim().min(8).max(20),
  senha: z.string().max(255).refine(isStrongCustomerPassword, CUSTOMER_PASSWORD_RULE_MESSAGE),
  endereco: enderecoSchema,
})

const customerLoginSchema = z.object({
  telefone_whatsapp: z.string().trim().min(8).max(20),
  senha: z.string().min(1),
})

const updateCustomerProfileSchema = z
  .object({
    nome: z.string().trim().min(2).max(100).optional(),
    endereco: enderecoSchema.optional(),
  })
  .refine((payload) => payload.nome || payload.endereco, {
    message: 'Dados de perfil invalidos.',
  })

const createOrderSchema = z.object({
  cliente_session_token: z.string().trim().min(20),
  endereco: enderecoSchema.optional(),
  observacoes: z
    .preprocess((value) => {
      if (value === undefined || value === null) return value
      if (typeof value !== 'string') return value
      const trimmed = value.trim()
      return trimmed.length === 0 ? null : trimmed
    }, z.string().max(500).nullable())
    .optional(),
  metodo_pagamento: z
    .string()
    .trim()
    .min(1, 'Metodo de pagamento obrigatorio.')
    .max(50)
    .transform((value) => value.toLowerCase())
    .refine((value) => value === 'pix', 'No momento aceitamos apenas Pix.'),
  itens: z.array(orderItemSchema).min(1),
})

const updateOrderStatusSchema = z.object({
  status_entrega: z.enum(['pendente', 'preparando', 'saiu_para_entrega', 'entregue', 'cancelado']).optional(),
  status_pagamento: z.enum(['pendente', 'pago', 'falhou', 'cancelado', 'estornado']).optional(),
}).refine((payload) => payload.status_entrega || payload.status_pagamento, {
  message: 'Status de pedido invalido.',
})

function parseOrderId(value) {
  const id = toInt(value)
  if (!id) throw new AppError(400, 'ID de pedido invalido.')
  return id
}

function toRawPhone(value) {
  return String(value || '').replace(/\D/g, '').trim()
}

function validateCustomerLookup(value) {
  const telefone = toRawPhone(value)
  if (telefone.length < 8 || telefone.length > 20) {
    throw new AppError(400, 'Telefone invalido.')
  }
  return telefone
}

function validateCreateOrder(input) {
  const parsed = createOrderSchema.safeParse(input)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues?.[0]?.message
    if (firstIssue === 'Metodo de pagamento obrigatorio.' || firstIssue === 'No momento aceitamos apenas Pix.') {
      throw new AppError(400, firstIssue)
    }
    throw new AppError(400, 'Dados de pedido invalidos.')
  }
  return parsed.data
}

function validateCreateCustomer(input) {
  const normalized = {
    ...input,
    telefone_whatsapp: toRawPhone(input?.telefone_whatsapp),
  }
  const parsed = createCustomerRegisterSchema.safeParse(normalized)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues?.[0]?.message
    if (firstIssue === CUSTOMER_PASSWORD_RULE_MESSAGE) {
      throw new AppError(400, firstIssue)
    }
    throw new AppError(400, 'Dados de cadastro invalido.')
  }
  return parsed.data
}

function validateCustomerLogin(input) {
  const normalized = {
    ...input,
    telefone_whatsapp: toRawPhone(input?.telefone_whatsapp),
  }
  const parsed = customerLoginSchema.safeParse(normalized)
  if (!parsed.success) throw new AppError(400, 'Dados de login invalidos.')
  return parsed.data
}

function validateUpdateCustomerProfile(input) {
  const parsed = updateCustomerProfileSchema.safeParse(input)
  if (!parsed.success) throw new AppError(400, 'Dados de perfil invalidos.')
  return parsed.data
}

function validateUpdateOrderStatus(input) {
  const parsed = updateOrderStatusSchema.safeParse(input)
  if (!parsed.success) throw new AppError(400, 'Status de pedido invalido.')
  return parsed.data
}

module.exports = {
  CUSTOMER_PASSWORD_RULE_MESSAGE,
  isStrongCustomerPassword,
  parseOrderId,
  validateCustomerLookup,
  validateCreateOrder,
  validateUpdateOrderStatus,
  validateCreateCustomer,
  validateCustomerLogin,
  validateUpdateCustomerProfile,
}
