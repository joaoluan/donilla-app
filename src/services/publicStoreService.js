const { AppError } = require('../utils/errors')
const { signToken, verifyToken } = require('../utils/jwt')
const { hashPassword, verifyPassword } = require('../utils/password')
const { cleanLocationField, resolveDeliveryFee } = require('../utils/deliveryFees')
const { normalizeStoreSettings, toPublicStoreSettings } = require('../utils/storeSettings')
const { resolveStoreAvailability } = require('../utils/storeHours')
const { createOrderAuditService } = require('./orderAuditService')
const {
  isStrongCustomerPassword,
  CUSTOMER_PASSWORD_RULE_MESSAGE,
} = require('../validators/publicOrderValidator')

const CLIENT_SESSION_TTL_SECONDS = 3600

function toMoney(value) {
  const n = Number(value || 0)
  return Number.isNaN(n) ? 0 : n
}

function toObservations(value) {
  if (value === undefined || value === null) return null
  const normalized = String(value).trim()
  return normalized || null
}

function toPhone(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .trim()
}

function normalizePaymentMethod(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (normalized === 'pix') return 'pix'
  if (normalized === 'asaas_checkout' || normalized === 'checkout_asaas' || normalized === 'checkout') {
    return 'asaas_checkout'
  }

  throw new AppError(400, 'Metodo de pagamento invalido.')
}

function resolvePaymentStatus() {
  return 'pendente'
}

function toAddress(input) {
  if (!input || typeof input !== 'object') return null

  return {
    rua: String(input.rua || '').trim(),
    numero: String(input.numero || '').trim(),
    bairro: String(input.bairro || '').trim(),
    cidade: cleanLocationField(input.cidade),
    complemento: input.complemento ? String(input.complemento).trim() : undefined,
    referencia: input.referencia ? String(input.referencia).trim() : undefined,
  }
}

function cleanAddressForClient(endereco) {
  if (!endereco) return null
  return {
    rua: endereco.rua,
    numero: endereco.numero,
    bairro: endereco.bairro,
    cidade: endereco.cidade || null,
    complemento: endereco.complemento || null,
    referencia: endereco.referencia || null,
  }
}

function buildCustomerSessionFromCliente(cliente, latestEndereco = null) {
  const endereco = latestEndereco || cliente?.enderecos?.[0] || null
  const normalizedEndereco = cleanAddressForClient(endereco)

  const payload = {
    customer_id: cliente.id,
    telefone_whatsapp: cliente.telefone_whatsapp,
    nome: cliente.nome,
    has_endereco: Boolean(normalizedEndereco),
    endereco: normalizedEndereco,
  }

  return {
    found: true,
    has_endereco: Boolean(normalizedEndereco),
    endereco: normalizedEndereco,
    cliente_session_token: issueCustomerSession(payload, CLIENT_SESSION_TTL_SECONDS),
    cliente: {
      nome: cliente.nome,
      telefone_whatsapp: cliente.telefone_whatsapp,
    },
  }
}

function getSessionSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new AppError(500, 'JWT_SECRET nao configurado no ambiente.')
  return secret
}

function issueCustomerSession(payload, ttlSeconds = 3600) {
  return signToken(
    {
      purpose: 'customer_session',
      ...payload,
    },
    getSessionSecret(),
    ttlSeconds,
  )
}

function parseCustomerSessionToken(rawToken) {
  if (!rawToken) {
    throw new AppError(401, 'Sessao de cliente obrigatoria.')
  }

  try {
    const payload = verifyToken(rawToken, getSessionSecret())
    if (!payload || payload.purpose !== 'customer_session') {
      throw new AppError(401, 'Token de sessao de cliente invalido.')
    }

    return payload
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(401, 'Token de sessao de cliente invalido.', error.message)
  }
}

function getTokenFromAddress(endereco) {
  const normalized = toAddress(endereco)
  if (!normalized || !normalized.rua || !normalized.numero || !normalized.bairro) return null

  return normalized
}

function toSessionCustomerId(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function toStockValue(value) {
  if (value === null || value === undefined) return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return null

  return parsed
}

function assertOrderBelongsToSession(order, session) {
  if (!order || !session) {
    throw new AppError(404, 'Pedido nao encontrado.')
  }

  const sessionCustomerId = toSessionCustomerId(session.customer_id)
  if (sessionCustomerId) {
    if (order.cliente_id !== sessionCustomerId) {
      throw new AppError(403, 'Voce nao tem acesso a este pedido.')
    }
    return
  }

  const sessionTelefone = toPhone(session.telefone_whatsapp)
  if (sessionTelefone && order.clientes?.telefone_whatsapp === sessionTelefone) return

  throw new AppError(403, 'Voce nao tem acesso a este pedido.')
}

function buildOrderOwnershipWhere(id, session) {
  const sessionCustomerId = toSessionCustomerId(session?.customer_id)
  if (sessionCustomerId) {
    return {
      id,
      cliente_id: sessionCustomerId,
    }
  }

  const sessionTelefone = toPhone(session?.telefone_whatsapp)
  if (!sessionTelefone) {
    throw new AppError(401, 'Sessao de cliente invalida.')
  }

  return {
    id,
    clientes: {
      is: {
        telefone_whatsapp: sessionTelefone,
      },
    },
  }
}

function mapOrderSummary(order) {
  return {
    id: order.id,
    metodo_pagamento: order.metodo_pagamento,
    status_entrega: order.status_entrega,
    status_pagamento: order.status_pagamento,
    valor_total: order.valor_total,
    observacoes: order.observacoes || null,
    criado_em: order.criado_em,
    endereco: order.enderecos ? cleanAddressForClient(order.enderecos) : null,
    itens_pedido: order.itens_pedido?.map((item) => ({
      id: item.id,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      subtotal: item.subtotal,
      produto: item.produtos
        ? {
            id: item.produtos.id,
            nome_doce: item.produtos.nome_doce,
            preco: item.produtos.preco,
          }
        : null,
    })),
  }
}

function buildNotificationOrderData({
  pedido,
  cliente,
  endereco,
  itens,
  produtosById,
  metodo_pagamento,
}) {
  return {
    id: pedido.id,
    status_entrega: pedido.status_entrega,
    status_pagamento: pedido.status_pagamento,
    valor_total: pedido.valor_total,
    valor_entrega: pedido.valor_entrega,
    metodo_pagamento,
    observacoes: pedido.observacoes || null,
    criado_em: pedido.criado_em,
    cliente: {
      id: cliente.id,
      nome: cliente.nome,
      telefone_whatsapp: cliente.telefone_whatsapp,
    },
    endereco: cleanAddressForClient(endereco),
    itens: itens.map((item) => {
      const produto = produtosById.get(item.produto_id)
      return {
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        subtotal: item.subtotal,
        produto: produto
          ? {
              id: produto.id,
              nome_doce: produto.nome_doce,
              preco: produto.preco,
            }
          : null,
      }
    }),
  }
}

function isAsaasCheckoutOrder(order) {
  return String(order?.metodo_pagamento || '').trim().toLowerCase() === 'asaas_checkout'
}

function normalizeOrderStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function isAwaitingPaymentStatus(status) {
  const normalized = normalizeOrderStatus(status)
  return !normalized || normalized === 'pendente'
}

function resolveAsaasWebhookUpdate(order, eventUpdate) {
  const currentPaymentStatus = normalizeOrderStatus(order?.status_pagamento)
  const currentDeliveryStatus = normalizeOrderStatus(order?.status_entrega)
  const nextPaymentStatus = normalizeOrderStatus(eventUpdate?.status_pagamento)
  const nextDeliveryStatus = normalizeOrderStatus(eventUpdate?.status_entrega)
  const updateData = {}

  if (nextPaymentStatus === 'pago' && isAwaitingPaymentStatus(currentPaymentStatus)) {
    updateData.status_pagamento = 'pago'
  }

  if (
    ['cancelado', 'expirado'].includes(nextPaymentStatus) &&
    isAwaitingPaymentStatus(currentPaymentStatus)
  ) {
    updateData.status_pagamento = nextPaymentStatus

    if (
      nextDeliveryStatus === 'cancelado' &&
      (!currentDeliveryStatus || currentDeliveryStatus === 'pendente')
    ) {
      updateData.status_entrega = 'cancelado'
    }
  }

  return updateData
}

function normalizeWebhookEventRecordStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function shouldRequeueWebhookEvent(status) {
  const normalized = normalizeWebhookEventRecordStatus(status)
  return normalized === 'recebido' || normalized === 'falhou'
}

function getAsaasWebhookEnvelope(payload) {
  const eventId = String(payload?.id || '').trim()
  const eventName = String(payload?.event || '').trim()
  const checkoutId = String(payload?.checkout?.id || '').trim() || null

  if (!eventId) {
    throw new AppError(400, 'Webhook do Asaas sem event.id.')
  }

  if (!eventName) {
    throw new AppError(400, 'Webhook do Asaas sem nome de evento.')
  }

  return {
    eventId,
    eventName,
    checkoutId,
  }
}

function extractAsaasPaymentId(payload) {
  const candidates = [
    payload?.payment?.id,
    payload?.paymentId,
    payload?.checkout?.payment?.id,
  ]

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim()
    if (normalized) return normalized
  }

  return null
}

function buildCustomerAuditActor(session) {
  const sessionCustomerId = toSessionCustomerId(session?.customer_id)
  if (sessionCustomerId) {
    return `cliente:${sessionCustomerId}`
  }

  const telefone = toPhone(session?.telefone_whatsapp)
  if (telefone) {
    return `telefone:${telefone}`
  }

  return null
}

function buildWebhookAuditActor(payload) {
  const eventId = String(payload?.id || '').trim()
  return eventId ? `event:${eventId}` : null
}

function publicStoreService(prisma, deps = {}) {
  const whatsappNotifier = deps.whatsappNotifier || null
  const asaas = deps.asaas || null
  const adminEvents = deps.adminEvents || null
  const logger = deps.logger || console
  const orderAudit = deps.orderAudit || createOrderAuditService(prisma, { logger })
  const scheduleTask = typeof deps.scheduleTask === 'function'
    ? deps.scheduleTask
    : (task) => setImmediate(task)

  async function getStoreConfig() {
    const config = await prisma.configuracoes_loja.findFirst({
      orderBy: { id: 'asc' },
    })

    return normalizeStoreSettings(config || {})
  }

  async function listActiveDeliveryFees() {
    return prisma.taxas_entrega_locais.findMany({
      where: { ativo: true },
      orderBy: [{ cidade: 'asc' }, { bairro: 'asc' }, { id: 'asc' }],
    })
  }

  function buildOrderResponse(order) {
    const response = {
      id: order.id,
      metodo_pagamento: order.metodo_pagamento,
      status_entrega: order.status_entrega,
      status_pagamento: order.status_pagamento,
      observacoes: order.observacoes || null,
      valor_entrega: order.valor_entrega,
      valor_total: order.valor_total,
      criado_em: order.criado_em,
    }

    if (order.id_transacao_gateway) {
      response.id_transacao_gateway = order.id_transacao_gateway
    }

    if (order.id_transacao_gateway && order.status_pagamento === 'pendente' && isAsaasCheckoutOrder(order)) {
      response.checkout_url = asaas?.buildCheckoutUrl?.(order.id_transacao_gateway) || null
    }

    return response
  }

  function buildOrderStatusSummary(order) {
    const response = {
      id: order.id,
      metodo_pagamento: order.metodo_pagamento,
      status_entrega: order.status_entrega,
      status_pagamento: order.status_pagamento,
    }

    if (order.id_transacao_gateway) {
      response.id_transacao_gateway = order.id_transacao_gateway
    }

    if (order.id_transacao_gateway && order.status_pagamento === 'pendente' && isAsaasCheckoutOrder(order)) {
      response.checkout_url = asaas?.buildCheckoutUrl?.(order.id_transacao_gateway) || null
    }

    return response
  }

  function publishAdminOrderEvent(eventName, order, { includePaymentMethod = false } = {}) {
    if (!adminEvents?.publish || !order?.id) return

    const payload = {
      orderId: order.id,
      createdAt: order.criado_em,
      deliveryStatus: order.status_entrega,
      paymentStatus: order.status_pagamento,
      total: order.valor_total,
    }

    if (includePaymentMethod) {
      payload.paymentMethod = order.metodo_pagamento
    }

    adminEvents.publish(eventName, payload)
  }

  async function createPendingOrderRecord({
    session,
    sessionNome,
    sessionTelefone,
    enderecoPayload,
    requestedByProduto,
    produtosById,
    itensCalculados,
    valorItens,
    valorEntrega,
    valorTotal,
    observacoes,
    metodoPagamento,
    statusPagamento,
  }) {
    return prisma.$transaction(async (tx) => {
      const sessionCustomerId = toSessionCustomerId(session.customer_id)
      let cliente = null

      if (sessionCustomerId) {
        cliente = await tx.clientes.findUnique({
          where: { id: sessionCustomerId },
        })
        if (cliente && cliente.telefone_whatsapp !== sessionTelefone) {
          throw new AppError(401, 'Sessao de cliente inconsistente.')
        }
      }

      if (!cliente) {
        cliente = await tx.clientes.findUnique({
          where: { telefone_whatsapp: sessionTelefone },
        })
      }

      if (!cliente) {
        cliente = await tx.clientes.create({
          data: {
            nome: sessionNome,
            telefone_whatsapp: sessionTelefone,
          },
        })
      } else if (cliente.nome !== sessionNome) {
        cliente = await tx.clientes.update({
          where: { id: cliente.id },
          data: { nome: sessionNome },
        })
      }

      const endereco = await tx.enderecos.create({
        data: {
          cliente_id: cliente.id,
          rua: enderecoPayload.rua,
          numero: enderecoPayload.numero,
          bairro: enderecoPayload.bairro,
          cidade: enderecoPayload.cidade,
          complemento: enderecoPayload.complemento,
          referencia: enderecoPayload.referencia,
        },
      })

      for (const [produtoId, quantidade] of Object.entries(requestedByProduto)) {
        const parsedProdutoId = Number(produtoId)
        const produto = produtosById.get(parsedProdutoId)
        if (!produto || produto.estoque_disponivel === null || produto.estoque_disponivel === undefined) {
          continue
        }

        const updated = await tx.produtos.updateMany({
          where: {
            id: parsedProdutoId,
            estoque_disponivel: { gte: quantidade },
          },
          data: {
            estoque_disponivel: { decrement: quantidade },
          },
        })

        if (updated.count !== 1) {
          throw new AppError(409, `Produto "${produto.nome_doce}" sem estoque suficiente.`)
        }
      }

      const pedido = await tx.pedidos.create({
        data: {
          cliente_id: cliente.id,
          endereco_id: endereco.id,
          valor_itens: valorItens.toFixed(2),
          valor_entrega: valorEntrega.toFixed(2),
          valor_total: valorTotal.toFixed(2),
          observacoes,
          metodo_pagamento: metodoPagamento,
          status_pagamento: statusPagamento,
          status_entrega: 'pendente',
        },
      })

      await tx.itens_pedido.createMany({
        data: itensCalculados.map((item) => ({
          pedido_id: pedido.id,
          produto_id: item.produto_id,
          nome_snapshot: produtosById.get(item.produto_id)?.nome_doce || `Produto ${item.produto_id}`,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
          subtotal: item.subtotal,
        })),
      })

      await orderAudit.record({
        pedido_id: pedido.id,
        origem: 'customer',
        ator: buildCustomerAuditActor(session),
        acao: 'pedido_criado',
        status_pagamento_atual: pedido.status_pagamento,
        status_entrega_atual: pedido.status_entrega,
        detalhes: {
          metodo_pagamento: metodoPagamento,
          valor_total: pedido.valor_total,
          valor_entrega: pedido.valor_entrega,
          itens: itensCalculados.length,
        },
      }, tx)

      return {
        response: buildOrderResponse(pedido),
        notification: buildNotificationOrderData({
          pedido,
          cliente,
          endereco,
          itens: itensCalculados,
          produtosById,
          metodo_pagamento: metodoPagamento,
        }),
      }
    })
  }

  async function compensateFailedGatewayOrder(orderId, requestedByProduto, produtosById) {
    await prisma.$transaction(async (tx) => {
      for (const [produtoId, quantidade] of Object.entries(requestedByProduto)) {
        const parsedProdutoId = Number(produtoId)
        const produto = produtosById.get(parsedProdutoId)
        if (!produto || produto.estoque_disponivel === null || produto.estoque_disponivel === undefined) {
          continue
        }

        await tx.produtos.update({
          where: { id: parsedProdutoId },
          data: {
            estoque_disponivel: { increment: quantidade },
          },
        })
      }

      const updatedOrder = await tx.pedidos.update({
        where: { id: orderId },
        data: {
          status_pagamento: 'falhou',
          status_entrega: 'cancelado',
        },
      })

      await orderAudit.record({
        pedido_id: orderId,
        origem: 'system',
        ator: 'gateway',
        acao: 'checkout_falhou',
        status_pagamento_anterior: 'pendente',
        status_pagamento_atual: updatedOrder.status_pagamento,
        status_entrega_anterior: 'pendente',
        status_entrega_atual: updatedOrder.status_entrega,
      }, tx)
    })
  }

  function buildAsaasCheckoutItems(orderId, itensCalculados, produtosById, valorEntrega) {
    const items = itensCalculados.map((item) => {
      const produto = produtosById.get(item.produto_id)
      return {
        name: produto?.nome_doce || `Produto ${item.produto_id}`,
        description: `Pedido #${orderId}`,
        quantity: item.quantidade,
        value: Number(item.preco_unitario),
      }
    })

    if (valorEntrega > 0) {
      items.push({
        name: 'Taxa de entrega',
        description: `Entrega do pedido #${orderId}`,
        quantity: 1,
        value: Number(valorEntrega.toFixed(2)),
      })
    }

    return items
  }

  async function createAsaasCheckoutForOrder({ orderId, valorTotal, itensCalculados, produtosById, valorEntrega, metodoPagamento }) {
    if (!asaas?.isConfigured?.()) {
      throw new AppError(503, 'Asaas Checkout nao configurado no ambiente.')
    }

    const checkout = await asaas.createCheckout({
      orderId,
      amount: Number(valorTotal.toFixed(2)),
      paymentMethod: metodoPagamento,
      items: buildAsaasCheckoutItems(orderId, itensCalculados, produtosById, valorEntrega),
    })

    const updated = await prisma.pedidos.update({
      where: { id: orderId },
      data: {
        id_transacao_gateway: checkout.id,
        expira_em: checkout.expires_at ? new Date(checkout.expires_at) : null,
      },
    })

    await orderAudit.record({
      pedido_id: orderId,
      origem: 'checkout',
      ator: 'asaas',
      acao: 'checkout_criado',
      status_pagamento_atual: updated.status_pagamento,
      status_entrega_atual: updated.status_entrega,
      detalhes: {
        checkout_id: checkout.id,
        expira_em: checkout.expires_at || null,
      },
    })

    return {
      ...buildOrderResponse(updated),
      checkout_url: checkout.checkout_url,
    }
  }

  function assertAsaasWebhookStore() {
    if (!prisma?.asaas_webhook_events) {
      throw new AppError(
        500,
        'Schema do banco desatualizado. Aplique a atualizacao de eventos de webhook do Asaas no banco de dados.',
      )
    }
  }

  async function applyAsaasWebhookEvent(payload, headers, options = {}) {
    if (!asaas) {
      throw new AppError(503, 'Integracao Asaas indisponivel no ambiente.')
    }

    if (options.validateToken !== false) {
      asaas?.validateWebhook?.(headers)
    }

    const event = String(payload?.event || '').trim()
    const eventUpdate = asaas?.mapCheckoutEvent?.(event)
    const checkoutId = String(payload?.checkout?.id || '').trim()

    if (!eventUpdate || !checkoutId) {
      return {
        processed: false,
        ignored: true,
        reason: 'Evento sem acao mapeada.',
      }
    }

    const pedido = await prisma.pedidos.findFirst({
      where: { id_transacao_gateway: checkoutId },
      select: {
        id: true,
        criado_em: true,
        valor_total: true,
        metodo_pagamento: true,
        status_pagamento: true,
        status_entrega: true,
        pago_em: true,
      },
    })

    if (!pedido) {
      return {
        processed: false,
        ignored: true,
        reason: 'Pedido nao encontrado para o checkout informado.',
      }
    }

    const updateData = resolveAsaasWebhookUpdate(pedido, eventUpdate)
    const asaasPaymentId = extractAsaasPaymentId(payload)

    if (updateData.status_pagamento === 'pago' && !pedido.pago_em) {
      updateData.pago_em = new Date()
    }

    if (asaasPaymentId) {
      updateData.asaas_payment_id = asaasPaymentId
    }

    if (Object.keys(updateData).length > 0) {
      const updatedOrder = await prisma.pedidos.update({
        where: { id: pedido.id },
        data: updateData,
      })

      await orderAudit.record({
        pedido_id: pedido.id,
        origem: 'asaas_webhook',
        ator: buildWebhookAuditActor(payload),
        acao: 'status_atualizado_por_webhook',
        status_pagamento_anterior: pedido.status_pagamento,
        status_pagamento_atual: updateData.status_pagamento || pedido.status_pagamento,
        status_entrega_anterior: pedido.status_entrega,
        status_entrega_atual: updateData.status_entrega || pedido.status_entrega,
        detalhes: {
          event,
          checkout_id: checkoutId,
          asaas_payment_id: asaasPaymentId,
        },
      })

      publishAdminOrderEvent('order.updated', updatedOrder)
    }

    return {
      processed: true,
      pedido_id: pedido.id,
      event,
      checkout_id: checkoutId,
      applied: Object.keys(updateData).length > 0,
    }
  }

  async function registerAsaasWebhookEvent(payload, headers) {
    if (!asaas) {
      throw new AppError(503, 'Integracao Asaas indisponivel no ambiente.')
    }

    asaas?.validateWebhook?.(headers)
    assertAsaasWebhookStore()

    const envelope = getAsaasWebhookEnvelope(payload)
    const pedido = envelope.checkoutId
      ? await prisma.pedidos.findFirst({
          where: { id_transacao_gateway: envelope.checkoutId },
          select: { id: true },
        })
      : null

    try {
      const created = await prisma.asaas_webhook_events.create({
        data: {
          event_id: envelope.eventId,
          event_name: envelope.eventName,
          checkout_id: envelope.checkoutId,
          pedido_id: pedido?.id || null,
          payload,
        },
        select: {
          id: true,
          event_id: true,
          status: true,
        },
      })

      return {
        event_id: created.event_id,
        record_id: created.id,
        duplicate: false,
        queued: true,
        status: created.status,
      }
    } catch (error) {
      if (error?.code !== 'P2002') {
        throw error
      }

      const existing = await prisma.asaas_webhook_events.findUnique({
        where: { event_id: envelope.eventId },
        select: {
          id: true,
          event_id: true,
          status: true,
        },
      })

      return {
        event_id: envelope.eventId,
        record_id: existing?.id || null,
        duplicate: true,
        queued: shouldRequeueWebhookEvent(existing?.status),
        status: existing?.status || null,
      }
    }
  }

  async function processQueuedAsaasWebhookEvent(recordId) {
    assertAsaasWebhookStore()

    const claimed = await prisma.asaas_webhook_events.updateMany({
      where: {
        id: recordId,
        status: { in: ['recebido', 'falhou'] },
      },
      data: {
        status: 'processando',
        tentativas: { increment: 1 },
        ultimo_erro: null,
      },
    })

    if (claimed.count !== 1) {
      return {
        processed: false,
        skipped: true,
      }
    }

    const eventRecord = await prisma.asaas_webhook_events.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        event_id: true,
        payload: true,
      },
    })

    if (!eventRecord) {
      return {
        processed: false,
        skipped: true,
      }
    }

    try {
      const result = await applyAsaasWebhookEvent(eventRecord.payload, {}, { validateToken: false })

      await prisma.asaas_webhook_events.update({
        where: { id: eventRecord.id },
        data: {
          status: 'processado',
          processado_em: new Date(),
          ultimo_erro: null,
        },
      })

      return {
        processed: true,
        event_id: eventRecord.event_id,
        result,
      }
    } catch (error) {
      await prisma.asaas_webhook_events.update({
        where: { id: eventRecord.id },
        data: {
          status: 'falhou',
          ultimo_erro: String(error?.message || error).slice(0, 1000),
        },
      })

      throw error
    }
  }

  function scheduleQueuedAsaasWebhookEvent(recordId) {
    if (!recordId) return

    scheduleTask(() => {
      return Promise.resolve(processQueuedAsaasWebhookEvent(recordId)).catch((error) => {
        logger.error('Falha ao processar webhook do Asaas em segundo plano:', error)
      })
    })
  }

  return {
    async getStore() {
      const [config, taxas_entrega_locais] = await Promise.all([getStoreConfig(), listActiveDeliveryFees()])

      return {
        ...toPublicStoreSettings(config),
        taxas_entrega_locais,
      }
    },

    async getCustomerByPhone(telefone_whatsapp) {
      const telefone = toPhone(telefone_whatsapp)
      if (!telefone) {
        return { found: false }
      }

      const cliente = await prisma.clientes.findFirst({
        where: { telefone_whatsapp: telefone },
        include: {
          enderecos: {
            orderBy: { id: 'desc' },
            take: 1,
          },
        },
      })

      if (!cliente) return { found: false }

      return buildCustomerSessionFromCliente(cliente)
    },

    async createCustomerSession(input) {
      const payload = {
        customer_id: null,
        telefone_whatsapp: toPhone(input?.telefone_whatsapp),
        nome: String(input?.nome || '').trim(),
        is_new: true,
        endereco: toAddress(input?.endereco),
      }

      return {
        found: false,
        has_endereco: Boolean(payload.endereco?.rua && payload.endereco?.numero && payload.endereco?.bairro),
        cliente_session_token: issueCustomerSession(payload, CLIENT_SESSION_TTL_SECONDS),
        endereco: cleanAddressForClient(payload.endereco),
        cliente: {
          nome: payload.nome,
          telefone_whatsapp: payload.telefone_whatsapp,
        },
      }
    },

    async customerPhoneAvailability(telefone_whatsapp) {
      const telefone = toPhone(telefone_whatsapp)
      if (!telefone) {
        return { exists: false, telefone_whatsapp: '' }
      }

      const user = await prisma.usuarios.findUnique({
        where: { username: telefone },
        select: { id: true },
      })

      return {
        exists: Boolean(user),
        telefone_whatsapp: telefone,
      }
    },

    async createCustomerAccount(input) {
      const nome = String(input?.nome || '').trim()
      const telefone = toPhone(input?.telefone_whatsapp)
      const senha = String(input?.senha || '')
      const endereco = toAddress(input?.endereco)

      if (!nome) {
        throw new AppError(400, 'Nome do cliente invalido.')
      }

      if (!telefone) {
        throw new AppError(400, 'Telefone invalido.')
      }

      if (!isStrongCustomerPassword(senha)) {
        throw new AppError(400, CUSTOMER_PASSWORD_RULE_MESSAGE)
      }

      if (!endereco || !endereco.rua || !endereco.numero || !endereco.bairro) {
        throw new AppError(400, 'Endereco invalido.')
      }

      return prisma.$transaction(async (tx) => {
        const usernameInUse = await tx.usuarios.findUnique({
          where: { username: telefone },
        })

        if (usernameInUse) {
          throw new AppError(409, 'Telefone já possui cadastro.')
        }

        let cliente = await tx.clientes.findUnique({
          where: { telefone_whatsapp: telefone },
        })

        if (!cliente) {
          cliente = await tx.clientes.create({
            data: {
              nome,
              telefone_whatsapp: telefone,
            },
          })
        } else if (cliente.nome !== nome) {
          cliente = await tx.clientes.update({
            where: { id: cliente.id },
            data: { nome },
          })
        }

        const enderecoCriado = await tx.enderecos.create({
          data: {
            cliente_id: cliente.id,
            rua: endereco.rua,
            numero: endereco.numero,
            bairro: endereco.bairro,
            cidade: endereco.cidade,
            complemento: endereco.complemento,
            referencia: endereco.referencia,
          },
        })

        await tx.usuarios.create({
          data: {
            username: telefone,
            password_hash: hashPassword(senha),
            role: 'cliente',
            ativo: true,
          },
        })

        return buildCustomerSessionFromCliente(
          {
            ...cliente,
            enderecos: [enderecoCriado],
          },
          enderecoCriado,
        )
      })
    },

    async customerLogin(input) {
      const telefone = toPhone(input?.telefone_whatsapp)
      const senha = String(input?.senha || '')

      if (!telefone || !senha) {
        throw new AppError(400, 'Telefone e senha obrigatorios.')
      }

      const user = await prisma.usuarios.findUnique({
        where: { username: telefone },
      })

      if (!user || !user.ativo) {
        throw new AppError(401, 'Credenciais invalidas.')
      }

      if (user.role !== 'cliente') {
        throw new AppError(403, 'Acesso negado para esse perfil.')
      }

      const validPassword = verifyPassword(senha, user.password_hash)
      if (!validPassword) {
        throw new AppError(401, 'Credenciais invalidas.')
      }

      const cliente = await prisma.clientes.findUnique({
        where: { telefone_whatsapp: telefone },
        include: {
          enderecos: {
            orderBy: { id: 'desc' },
            take: 1,
          },
        },
      })

      if (!cliente) {
        const novoCliente = await prisma.clientes.create({
          data: {
            nome: telefone,
            telefone_whatsapp: telefone,
          },
          include: {
            enderecos: {
              orderBy: { id: 'desc' },
              take: 1,
            },
          },
        })

        return buildCustomerSessionFromCliente(novoCliente)
      }

      return buildCustomerSessionFromCliente(cliente)
    },

    async updateCustomerProfile(rawSessionToken, input) {
      const session = parseCustomerSessionToken(rawSessionToken)
      const nome = String(input?.nome || '').trim()
      const endereco = toAddress(input?.endereco)

      const sessionCustomerId = toSessionCustomerId(session.customer_id)
      const telefone = toPhone(session.telefone_whatsapp)

      if (!telefone) {
        throw new AppError(401, 'Sessao de cliente invalida.')
      }

      const cliente = await prisma.clientes.findFirst({
        where: sessionCustomerId ? { id: sessionCustomerId } : { telefone_whatsapp: telefone },
      })

      if (!cliente) {
        throw new AppError(404, 'Cliente nao encontrado.')
      }

      return prisma.$transaction(async (tx) => {
        let clienteAtualizado = cliente

        if (nome && nome !== cliente.nome) {
          clienteAtualizado = await tx.clientes.update({
            where: { id: cliente.id },
            data: { nome },
          })
        }

        if (endereco && endereco.rua && endereco.numero && endereco.bairro) {
          await tx.enderecos.create({
            data: {
              cliente_id: cliente.id,
              rua: endereco.rua,
              numero: endereco.numero,
              bairro: endereco.bairro,
              cidade: endereco.cidade,
              complemento: endereco.complemento,
              referencia: endereco.referencia,
            },
          })
        }

        const refreshedCliente = await tx.clientes.findUnique({
          where: { id: clienteAtualizado.id },
          include: {
            enderecos: {
              orderBy: { id: 'desc' },
              take: 1,
            },
          },
        })

        return buildCustomerSessionFromCliente(refreshedCliente, refreshedCliente?.enderecos?.[0] || null)
      })
    },

    async getMenu() {
      const categorias = await prisma.categorias.findMany({
        orderBy: [{ ordem_exibicao: 'asc' }, { id: 'asc' }],
        include: {
          produtos: {
            where: { ativo: true },
            orderBy: { id: 'asc' },
          },
        },
      })
      return categorias
    },

    async createOrder(input) {
      const [config, taxasEntrega] = await Promise.all([getStoreConfig(), listActiveDeliveryFees()])
      const availability = resolveStoreAvailability(config)
      if (!availability.isOpen) {
        throw new AppError(409, availability.checkoutMessage || 'Loja fechada no momento.')
      }

      const produtoIds = input.itens.map((item) => item.produto_id)
      const uniqueProdutoIds = [...new Set(produtoIds)]
      const requestedByProduto = input.itens.reduce((acc, item) => {
        acc[item.produto_id] = (acc[item.produto_id] || 0) + item.quantidade
        return acc
      }, {})
      const produtos = await prisma.produtos.findMany({
        where: { id: { in: uniqueProdutoIds }, ativo: true },
      })

      if (produtos.length !== uniqueProdutoIds.length) {
        throw new AppError(400, 'Um ou mais produtos estao invalidos ou inativos.')
      }

      const produtosById = new Map(produtos.map((p) => [p.id, p]))
      for (const produtoId of uniqueProdutoIds) {
        const produto = produtosById.get(produtoId)
        const estoque = toStockValue(produto?.estoque_disponivel)
        const solicitado = requestedByProduto[produtoId] || 0

        if (estoque !== null && estoque < solicitado) {
          const nome = produto?.nome_doce || `Produto ${produtoId}`
          throw new AppError(409, `Produto "${nome}" sem estoque suficiente (${estoque} disponível).`)
        }
      }
      const itensCalculados = input.itens.map((item) => {
        const produto = produtosById.get(item.produto_id)
        const precoUnitario = toMoney(produto.preco)
        const subtotal = precoUnitario * item.quantidade

        return {
          produto_id: item.produto_id,
          quantidade: item.quantidade,
          preco_unitario: precoUnitario.toFixed(2),
          subtotal: subtotal.toFixed(2),
        }
      })

      const valorItens = itensCalculados.reduce((acc, item) => acc + Number(item.subtotal), 0)

      const sessionToken = input?.cliente_session_token
      const session = parseCustomerSessionToken(sessionToken)
      const observacoes = toObservations(input?.observacoes)
      const metodoPagamento = normalizePaymentMethod(input?.metodo_pagamento)
      const statusPagamento = resolvePaymentStatus()

      const sessionNome = String(session.nome || '').trim()
      const sessionTelefone = toPhone(session.telefone_whatsapp)
      const sessionEndereco = getTokenFromAddress(session.endereco)

      if (!sessionNome || !sessionTelefone) {
        throw new AppError(401, 'Sessao de cliente invalida.')
      }

      const enderecoPayload = getTokenFromAddress(input.endereco) || sessionEndereco
      if (!enderecoPayload) {
        throw new AppError(400, 'Endereco obrigatorio para finalizar o pedido.')
      }

      const resolvedDeliveryFee = resolveDeliveryFee(enderecoPayload, taxasEntrega, config?.taxa_entrega_padrao)
      const valorEntrega = toMoney(resolvedDeliveryFee.amount)
      const valorTotal = valorItens + valorEntrega

      const createdOrder = await createPendingOrderRecord({
        session,
        sessionNome,
        sessionTelefone,
        enderecoPayload,
        requestedByProduto,
        produtosById,
        itensCalculados,
        valorItens,
        valorEntrega,
        valorTotal,
        observacoes,
        metodoPagamento,
        statusPagamento,
      })

      let response = createdOrder.response

      if (metodoPagamento === 'asaas_checkout') {
        try {
          response = await createAsaasCheckoutForOrder({
            orderId: createdOrder.response.id,
            valorTotal,
            itensCalculados,
            produtosById,
            valorEntrega,
            metodoPagamento,
          })
        } catch (error) {
          await compensateFailedGatewayOrder(createdOrder.response.id, requestedByProduto, produtosById)
          throw error
        }
      }

      if (whatsappNotifier?.notifyOrderCreatedSafe) {
        whatsappNotifier.notifyOrderCreatedSafe({
          config,
          order: createdOrder.notification,
        })
      }

      publishAdminOrderEvent('order.created', response, { includePaymentMethod: true })

      return response
    },

    async getOrderStatus(id, rawSessionToken) {
      const session = parseCustomerSessionToken(rawSessionToken)
      const pedido = await prisma.pedidos.findFirst({
        where: buildOrderOwnershipWhere(id, session),
        include: {
          clientes: { select: { id: true, nome: true, telefone_whatsapp: true } },
        },
      })

      if (!pedido) {
        throw new AppError(404, 'Pedido nao encontrado.')
      }

      assertOrderBelongsToSession(pedido, session)

      return buildOrderResponse(pedido)
    },

    async getOrderStatusSummary(id, rawSessionToken) {
      const session = parseCustomerSessionToken(rawSessionToken)
      const pedido = await prisma.pedidos.findFirst({
        where: buildOrderOwnershipWhere(id, session),
        include: {
          clientes: { select: { id: true, nome: true, telefone_whatsapp: true } },
        },
      })

      if (!pedido) {
        throw new AppError(404, 'Pedido nao encontrado.')
      }

      assertOrderBelongsToSession(pedido, session)

      return buildOrderStatusSummary(pedido)
    },

    async getCustomerOrders(rawSessionToken) {
      const session = parseCustomerSessionToken(rawSessionToken)

      const sessionCustomerId = toSessionCustomerId(session.customer_id)
      const where = sessionCustomerId
        ? { cliente_id: sessionCustomerId }
        : {
            clientes: {
              is: {
                telefone_whatsapp: toPhone(session.telefone_whatsapp),
              },
            },
          }

      const pedidos = await prisma.pedidos.findMany({
        where,
        orderBy: { id: 'desc' },
        include: {
          enderecos: true,
          itens_pedido: {
            include: {
              produtos: {
                select: { id: true, nome_doce: true, preco: true },
              },
            },
          },
        },
      })

      return pedidos.map((pedido) => {
        return {
          ...mapOrderSummary(pedido),
          ...(pedido.id_transacao_gateway ? { id_transacao_gateway: pedido.id_transacao_gateway } : {}),
          ...(pedido.status_pagamento === 'pendente' && isAsaasCheckoutOrder(pedido) && pedido.id_transacao_gateway
            ? { checkout_url: asaas?.buildCheckoutUrl?.(pedido.id_transacao_gateway) || null }
            : {}),
        }
      })
    },

    async getCustomerOrder(rawSessionToken, id) {
      const session = parseCustomerSessionToken(rawSessionToken)

      const pedido = await prisma.pedidos.findFirst({
        where: buildOrderOwnershipWhere(id, session),
        include: {
          clientes: { select: { id: true, nome: true, telefone_whatsapp: true } },
          enderecos: true,
          itens_pedido: {
            include: {
              produtos: {
                select: { id: true, nome_doce: true, preco: true },
              },
            },
          },
        },
      })

      assertOrderBelongsToSession(pedido, session)

      return {
        ...buildOrderResponse(pedido),
        endereco: cleanAddressForClient(pedido.enderecos),
        itens: pedido.itens_pedido.map((item) => ({
          produto_id: item.produto_id,
          nome_doce: item.produtos?.nome_doce || '',
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
          subtotal: item.subtotal,
        })),
      }
    },

    async retryAsaasCheckout(rawSessionToken, id) {
      const session = parseCustomerSessionToken(rawSessionToken)

      if (!asaas?.isConfigured?.()) {
        throw new AppError(503, 'Asaas Checkout nao configurado no ambiente.')
      }

      const pedido = await prisma.pedidos.findFirst({
        where: buildOrderOwnershipWhere(id, session),
        include: {
          clientes: { select: { id: true, nome: true, telefone_whatsapp: true } },
          itens_pedido: {
            include: {
              produtos: {
                select: { id: true, nome_doce: true, preco: true },
              },
            },
          },
        },
      })

      if (!pedido) {
        throw new AppError(404, 'Pedido nao encontrado.')
      }

      assertOrderBelongsToSession(pedido, session)

      if (!isAsaasCheckoutOrder(pedido)) {
        throw new AppError(400, 'Este pedido nao usa pagamento online.')
      }

      const paymentStatus = normalizeOrderStatus(pedido.status_pagamento)
      const deliveryStatus = normalizeOrderStatus(pedido.status_entrega)

      if (paymentStatus === 'pago') {
        throw new AppError(409, 'Este pedido ja foi pago.')
      }

      if (deliveryStatus && !['pendente', 'cancelado'].includes(deliveryStatus)) {
        throw new AppError(409, 'O pedido nao pode gerar novo checkout no status atual.')
      }

      if (!Array.isArray(pedido.itens_pedido) || pedido.itens_pedido.length === 0) {
        throw new AppError(409, 'Pedido sem itens para gerar checkout.')
      }

      const produtosById = new Map(
        pedido.itens_pedido
          .filter((item) => item?.produtos)
          .map((item) => [item.produto_id, item.produtos]),
      )

      const itensCalculados = pedido.itens_pedido.map((item) => ({
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: String(item.preco_unitario),
        subtotal: String(item.subtotal),
      }))

      const checkout = await asaas.createCheckout({
        orderId: pedido.id,
        amount: toMoney(pedido.valor_total),
        paymentMethod: 'asaas_checkout',
        items: buildAsaasCheckoutItems(
          pedido.id,
          itensCalculados,
          produtosById,
          toMoney(pedido.valor_entrega),
        ),
      })

      const updated = await prisma.pedidos.update({
        where: { id: pedido.id },
        data: {
          id_transacao_gateway: checkout.id,
          expira_em: checkout.expires_at ? new Date(checkout.expires_at) : null,
          ...(['cancelado', 'falhou', 'expirado'].includes(paymentStatus)
            ? { status_pagamento: 'pendente' }
            : {}),
          ...(deliveryStatus === 'cancelado'
            ? { status_entrega: 'pendente' }
            : {}),
        },
      })

      await orderAudit.record({
        pedido_id: pedido.id,
        origem: 'customer',
        ator: buildCustomerAuditActor(session),
        acao: 'checkout_reaberto',
        status_pagamento_anterior: pedido.status_pagamento,
        status_pagamento_atual: updated.status_pagamento,
        status_entrega_anterior: pedido.status_entrega,
        status_entrega_atual: updated.status_entrega,
        detalhes: {
          checkout_id_anterior: pedido.id_transacao_gateway || null,
          checkout_id_novo: checkout.id,
          expira_em: checkout.expires_at || null,
        },
      })

      publishAdminOrderEvent('order.updated', updated)

      return {
        ...buildOrderStatusSummary(updated),
        checkout_url: checkout.checkout_url,
      }
    },

    async receiveAsaasWebhook(payload, headers) {
      const registration = await registerAsaasWebhookEvent(payload, headers)

      if (registration.queued && registration.record_id) {
        scheduleQueuedAsaasWebhookEvent(registration.record_id)
      }

      return {
        received: true,
        duplicate: registration.duplicate,
        queued: registration.queued,
        event_id: registration.event_id,
      }
    },

    async handleAsaasWebhook(payload, headers) {
      return applyAsaasWebhookEvent(payload, headers)
    },

    async processQueuedAsaasWebhookEvent(recordId) {
      return processQueuedAsaasWebhookEvent(recordId)
    },
  }
}

module.exports = { publicStoreService, parseCustomerSessionToken }
