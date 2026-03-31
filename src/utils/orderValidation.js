/**
 * Validadores para pedidos públicos com melhor tratamento de erros
 */

const { AppError } = require('./errors')
const { normalizeWhatsAppPhone } = require('./phone')

/**
 * Valida se um array de itens é válido para um pedido
 * @throws {AppError} Se houver problemas na validação
 */
function validateOrderItems(items) {
  if (!items || !Array.isArray(items)) {
    throw new AppError(400, 'itens deve ser um array')
  }

  if (items.length === 0) {
    throw new AppError(400, 'Pedido deve ter pelo menos um item')
  }

  if (items.length > 100) {
    throw new AppError(400, 'Pedido não pode ter mais de 100 itens')
  }

  const produtoIds = new Set()

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    // Validar produto_id
    if (!item.produto_id || !Number.isInteger(item.produto_id)) {
      throw new AppError(400, `item[${i}]: produto_id inválido ou ausente`)
    }

    if (item.produto_id <= 0) {
      throw new AppError(400, `item[${i}]: produto_id deve ser > 0`)
    }

    // Validar quantidade
    if (!item.quantidade || !Number.isInteger(item.quantidade)) {
      throw new AppError(400, `item[${i}]: quantidade deve ser inteira`)
    }

    if (item.quantidade <= 0 || item.quantidade > 999) {
      throw new AppError(400, `item[${i}]: quantidade deve estar entre 1 e 999`)
    }

    // Detectar duplicatas
    if (produtoIds.has(item.produto_id)) {
      throw new AppError(400, `item[${i}]: produto ${item.produto_id} duplicado`)
    }

    produtoIds.add(item.produto_id)
  }

  return true
}

/**
 * Valida dados de cliente para criação/atualização
 */
function validateClientData(data) {
  if (!data) {
    throw new AppError(400, 'Dados de cliente obrigatórios')
  }

  if (!data.nome || typeof data.nome !== 'string') {
    throw new AppError(400, 'nome do cliente obrigatório')
  }

  const nome = data.nome.trim()
  if (nome.length < 2 || nome.length > 100) {
    throw new AppError(400, 'nome deve ter entre 2 e 100 caracteres')
  }

  const rawPhone = data.telefone ?? data.telefone_whatsapp
  if (!rawPhone || (typeof rawPhone !== 'string' && typeof rawPhone !== 'number')) {
    throw new AppError(400, 'telefone obrigatório')
  }

  const phone = normalizeWhatsAppPhone(rawPhone)
  if (!phone || phone.length < 12 || phone.length > 13) {
    throw new AppError(400, 'telefone inválido')
  }

  return true
}

/**
 * Valida dados de endereço
 */
function validateAddressData(data) {
  if (!data) {
    throw new AppError(400, 'Dados de endereço obrigatórios')
  }

  const validFields = {
    rua: { required: true, min: 3, max: 150, type: 'string' },
    numero: { required: true, min: 1, max: 20, type: 'string' },
    bairro: { required: true, min: 2, max: 100, type: 'string' },
    cidade: { required: false, min: 2, max: 100, type: 'string' },
    complemento: { required: false, min: 0, max: 100, type: 'string' },
    referencia: { required: false, min: 0, max: 150, type: 'string' },
  }

  for (const [field, config] of Object.entries(validFields)) {
    const value = data[field]

    if (config.required && (!value || typeof value !== config.type)) {
      throw new AppError(400, `${field} obrigatório`)
    }

    if (value) {
      const stringValue = String(value).trim()
      if (stringValue.length < config.min || stringValue.length > config.max) {
        throw new AppError(
          400,
          `${field} deve ter entre ${config.min} e ${config.max} caracteres`
        )
      }
    }
  }

  return true
}

module.exports = {
  validateOrderItems,
  validateClientData,
  validateAddressData,
}
