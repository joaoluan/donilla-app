function normalizeAuditText(value, maxLength) {
  const normalized = String(value || '').trim()
  if (!normalized) return null
  return normalized.slice(0, maxLength)
}

function normalizeAuditStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  return normalized || null
}

function sanitizeAuditDetails(details) {
  if (details === undefined) return null

  try {
    return JSON.parse(JSON.stringify(details))
  } catch {
    return {
      fallback: String(details),
    }
  }
}

function createOrderAuditService(prisma, { logger = console } = {}) {
  async function record(entry = {}, db = prisma) {
    if (!db?.pedidos_auditoria?.create) {
      return null
    }

    const pedidoId = Number(entry.pedido_id || entry.orderId)
    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return null
    }

    const acao = normalizeAuditText(entry.acao, 80)
    if (!acao) {
      return null
    }

    try {
      return await db.pedidos_auditoria.create({
        data: {
          pedido_id: pedidoId,
          origem: normalizeAuditText(entry.origem, 50) || 'system',
          ator: normalizeAuditText(entry.ator, 120),
          acao,
          status_pagamento_anterior: normalizeAuditStatus(entry.status_pagamento_anterior),
          status_pagamento_atual: normalizeAuditStatus(entry.status_pagamento_atual),
          status_entrega_anterior: normalizeAuditStatus(entry.status_entrega_anterior),
          status_entrega_atual: normalizeAuditStatus(entry.status_entrega_atual),
          detalhes: sanitizeAuditDetails(entry.detalhes),
        },
      })
    } catch (error) {
      logger.error('Falha ao registrar auditoria do pedido:', error?.message || error)
      return null
    }
  }

  return {
    record,
  }
}

module.exports = { createOrderAuditService }
