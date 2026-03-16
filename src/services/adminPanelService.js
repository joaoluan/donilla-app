const { AppError } = require('../utils/errors')
const { cleanLocationField } = require('../utils/deliveryFees')
const { getDefaultStoreSettings, normalizeStoreSettings } = require('../utils/storeSettings')
const { assertSafeExternalUrl } = require('../utils/security')

function normalizeDeliveryFeeData(data) {
  return {
    ...(data.bairro !== undefined ? { bairro: cleanLocationField(data.bairro) } : {}),
    ...(data.cidade !== undefined ? { cidade: cleanLocationField(data.cidade) } : {}),
    ...(data.valor_entrega !== undefined ? { valor_entrega: Number(data.valor_entrega) } : {}),
    ...(data.ativo !== undefined ? { ativo: Boolean(data.ativo) } : {}),
  }
}

function buildDeliveryFeeLookup(data, excludeId = null) {
  return {
    ...(excludeId ? { id: { not: excludeId } } : {}),
    bairro: data.bairro === null ? null : { equals: data.bairro, mode: 'insensitive' },
    cidade: data.cidade === null ? null : { equals: data.cidade, mode: 'insensitive' },
  }
}

function ensureStoreSettingsRange(data) {
  const min = Number(data.tempo_entrega_minutos || 0)
  const max = Number(data.tempo_entrega_max_minutos || 0)

  if (max < min) {
    throw new AppError(400, 'O tempo maximo de entrega deve ser maior ou igual ao minimo.')
  }
}

function ensureWhatsAppSettings(data, { whatsappTransport = null } = {}) {
  const hasExternalWebhook = Boolean(String(data.whatsapp_webhook_url || '').trim())
  const hasManagedTransport = Boolean(whatsappTransport?.isConfigured?.())

  if (data.whatsapp_ativo && !hasExternalWebhook && !hasManagedTransport) {
    throw new AppError(
      400,
      'Para ativar o WhatsApp, configure o WPPConnect no ambiente do servidor ou informe uma URL de webhook externa.',
    )
  }
}

function startOfUtcDay(dateText) {
  return new Date(`${dateText}T00:00:00.000Z`)
}

function endOfUtcDay(dateText) {
  return new Date(`${dateText}T23:59:59.999Z`)
}

function toDateOnly(value) {
  return new Date(value).toISOString().slice(0, 10)
}

function shiftUtcDays(baseDate, diffDays) {
  const next = new Date(baseDate)
  next.setUTCDate(next.getUTCDate() + diffDays)
  return next
}

function buildPeriodRange(query = {}) {
  const now = new Date()
  const today = toDateOnly(now)

  if (query.period === 'custom') {
    const from = query.from || null
    const to = query.to || null
    return {
      gte: from ? startOfUtcDay(from) : undefined,
      lte: to ? endOfUtcDay(to) : undefined,
      label: 'Periodo personalizado',
      from,
      to,
      period: 'custom',
    }
  }

  if (query.period === 'month') {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    return {
      gte: monthStart,
      lte: endOfUtcDay(today),
      label: 'Este mes',
      from: toDateOnly(monthStart),
      to: today,
      period: 'month',
    }
  }

  if (query.period === '30d') {
    const fromDate = shiftUtcDays(startOfUtcDay(today), -29)
    return {
      gte: fromDate,
      lte: endOfUtcDay(today),
      label: 'Ultimos 30 dias',
      from: toDateOnly(fromDate),
      to: today,
      period: '30d',
    }
  }

  if (query.period === 'all') {
    return {
      gte: undefined,
      lte: undefined,
      label: 'Todo o periodo',
      from: null,
      to: null,
      period: 'all',
    }
  }

  const fromDate = shiftUtcDays(startOfUtcDay(today), -6)
  return {
    gte: fromDate,
    lte: endOfUtcDay(today),
    label: 'Ultimos 7 dias',
    from: toDateOnly(fromDate),
    to: today,
    period: '7d',
  }
}

function buildCreatedAtWhere(query) {
  const range = buildPeriodRange(query)
  const where = {}
  if (range.gte) where.gte = range.gte
  if (range.lte) where.lte = range.lte

  return {
    where: Object.keys(where).length > 0 ? where : undefined,
    meta: {
      period: range.period,
      label: range.label,
      from: range.from,
      to: range.to,
    },
  }
}

function normalizeSearchValue(value) {
  return String(value || '').trim()
}

const MAX_ORDER_ID = 2147483647

function toPhoneDigits(value) {
  return normalizeSearchValue(value).replace(/\D/g, '')
}

function parseOrderSearchId(value) {
  const normalized = normalizeSearchValue(value).replace(/^#/, '')
  if (!/^\d+$/.test(normalized)) return null

  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_ORDER_ID) return null

  return parsed
}

function looksLikePhoneSearch(value) {
  const normalized = normalizeSearchValue(value)
  const digits = toPhoneDigits(normalized)
  if (!digits) return false

  return normalized !== digits || digits.length >= 10
}

function buildOrderSearchOr(search) {
  const normalized = normalizeSearchValue(search)
  if (!normalized) return []

  const digits = toPhoneDigits(normalized)
  const parsedId = parseOrderSearchId(normalized)

  if (normalized.startsWith('#')) {
    return parsedId ? [{ id: parsedId }] : []
  }

  if (/^\d+$/.test(normalized)) {
    if (looksLikePhoneSearch(normalized)) {
      return digits ? [{ clientes: { is: { telefone_whatsapp: { contains: digits } } } }] : []
    }

    return parsedId ? [{ id: parsedId }] : []
  }

  const or = [{ clientes: { is: { nome: { contains: normalized, mode: 'insensitive' } } } }]

  if (looksLikePhoneSearch(normalized)) {
    or.push({ clientes: { is: { telefone_whatsapp: { contains: digits } } } })
  }

  return or
}

function buildOrderWhere(query = {}) {
  const conditions = []
  const { where: createdAtWhere } = buildCreatedAtWhere(query)
  const search = normalizeSearchValue(query.search)

  if (createdAtWhere) {
    conditions.push({ criado_em: createdAtWhere })
  }

  if (query.status && query.status !== 'all') {
    conditions.push({ status_entrega: query.status })
  }

  if (search) {
    const or = buildOrderSearchOr(search)
    if (or.length > 0) {
      conditions.push({ OR: or })
    }
  }

  if (conditions.length === 0) return undefined
  if (conditions.length === 1) return conditions[0]
  return { AND: conditions }
}

function getOrderNotificationInclude() {
  return {
    clientes: { select: { id: true, nome: true, telefone_whatsapp: true } },
    enderecos: true,
    itens_pedido: {
      include: {
        produtos: { select: { id: true, nome_doce: true, preco: true } },
      },
    },
  }
}

function toNotificationOrderData(order) {
  return {
    id: order.id,
    status_entrega: order.status_entrega,
    status_pagamento: order.status_pagamento,
    valor_total: order.valor_total,
    valor_entrega: order.valor_entrega,
    metodo_pagamento: order.metodo_pagamento,
    observacoes: order.observacoes || null,
    criado_em: order.criado_em,
    cliente: order.clientes
      ? {
          id: order.clientes.id,
          nome: order.clientes.nome,
          telefone_whatsapp: order.clientes.telefone_whatsapp,
        }
      : null,
    endereco: order.enderecos
      ? {
          rua: order.enderecos.rua,
          numero: order.enderecos.numero,
          bairro: order.enderecos.bairro,
          cidade: order.enderecos.cidade || null,
          complemento: order.enderecos.complemento || null,
          referencia: order.enderecos.referencia || null,
        }
      : null,
    itens: (order.itens_pedido || []).map((item) => ({
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

function adminPanelService(prisma, deps = {}) {
  const whatsappNotifier = deps.whatsappNotifier || null
  const whatsappTransport = deps.whatsappTransport || null
  const assertSafeTargetUrl = deps.assertSafeTargetUrl || assertSafeExternalUrl

  async function getStoreSettingsConfig() {
    const config = await prisma.configuracoes_loja.findFirst({
      orderBy: { id: 'asc' },
    })

    return normalizeStoreSettings(config || {})
  }

  function ensureWhatsAppTransport() {
    if (!whatsappTransport) {
      throw new AppError(500, 'Transporte WhatsApp indisponivel no servidor.')
    }
  }

  async function assertSafeWebhookUrl(value) {
    const webhookUrl = String(value || '').trim()
    if (!webhookUrl) return null
    return assertSafeTargetUrl(webhookUrl)
  }

  function normalizeQrCodePayload(raw) {
    const source =
      raw?.qrcode ||
      raw?.base64 ||
      raw?.qrCode ||
      raw?.data?.qrcode ||
      raw?.data?.base64 ||
      raw?.data?.qrCode ||
      null
    const qrCodeContentType =
      String(raw?.contentType || raw?.mimeType || raw?.data?.contentType || raw?.data?.mimeType || '').trim() ||
      'image/png'

    const qrCodeDataUrl =
      typeof source === 'string' && source
        ? source.startsWith('data:')
          ? source
          : `data:${qrCodeContentType};base64,${source}`
        : null

    return {
      configured: whatsappTransport?.isConfigured?.() || false,
      qrCodeDataUrl,
      raw,
    }
  }

  return {
    async dashboard(query = {}) {
      const { where: createdAtWhere, meta } = buildCreatedAtWhere(query)
      const baseWhere = createdAtWhere ? { criado_em: createdAtWhere } : undefined

      const [totalPedidos, pendentes, preparando, entregues, cancelados] = await prisma.$transaction([
        prisma.pedidos.count({ where: baseWhere }),
        prisma.pedidos.count({ where: { ...(baseWhere || {}), status_entrega: 'pendente' } }),
        prisma.pedidos.count({ where: { ...(baseWhere || {}), status_entrega: 'preparando' } }),
        prisma.pedidos.count({ where: { ...(baseWhere || {}), status_entrega: 'entregue' } }),
        prisma.pedidos.count({ where: { ...(baseWhere || {}), status_entrega: 'cancelado' } }),
      ])

      const receitas = await prisma.pedidos.findMany({
        where: { ...(baseWhere || {}), status_entrega: { in: ['entregue'] } },
        select: { valor_total: true },
      })

      const faturamento = receitas.reduce((acc, item) => acc + Number(item.valor_total || 0), 0)

      return {
        data: {
          totalPedidos,
          status: { pendentes, preparando, entregues, cancelados },
          faturamento: Number(faturamento.toFixed(2)),
        },
        meta: {
          filters: meta,
        },
      }
    },

    async listOrders(query = {}) {
      const page = Number(query.page || 1)
      const pageSize = Number(query.pageSize || 10)
      const skip = (page - 1) * pageSize
      const where = buildOrderWhere(query)
      const { meta } = buildCreatedAtWhere(query)

      const [items, total] = await prisma.$transaction([
        prisma.pedidos.findMany({
          where,
          orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
          skip,
          take: pageSize,
          include: getOrderNotificationInclude(),
        }),
        prisma.pedidos.count({ where }),
      ])

      return {
        items,
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          filters: {
            ...meta,
            status: query.status || 'all',
            search: normalizeSearchValue(query.search),
          },
        },
      }
    },

    async updateOrderStatus(id, status_entrega) {
      const currentOrder = await prisma.pedidos.findUnique({
        where: { id },
        include: getOrderNotificationInclude(),
      })

      if (!currentOrder) {
        throw new AppError(404, 'Pedido nao encontrado.')
      }

      if (currentOrder.status_entrega === status_entrega) {
        return currentOrder
      }

      const [config, updatedOrder] = await Promise.all([
        getStoreSettingsConfig(),
        prisma.pedidos.update({
          where: { id },
          data: { status_entrega },
          include: getOrderNotificationInclude(),
        }),
      ])

      if (whatsappNotifier?.notifyOrderStatusUpdatedSafe) {
        whatsappNotifier.notifyOrderStatusUpdatedSafe({
          config,
          previousStatus: currentOrder.status_entrega || null,
          order: toNotificationOrderData(updatedOrder),
        })
      }

      return updatedOrder
    },

    async getStoreSettings() {
      return getStoreSettingsConfig()
    },

    async updateStoreSettings(data) {
      const current = await prisma.configuracoes_loja.findFirst({ orderBy: { id: 'asc' } })
      const merged = normalizeStoreSettings({
        ...(current || getDefaultStoreSettings()),
        ...data,
      })
      const { id, ...persistedData } = merged
      if (persistedData.whatsapp_webhook_url) {
        persistedData.whatsapp_webhook_url = await assertSafeWebhookUrl(persistedData.whatsapp_webhook_url)
      }
      ensureStoreSettingsRange(merged)
      ensureWhatsAppSettings(merged, { whatsappTransport })

      if (current) {
        const updated = await prisma.configuracoes_loja.update({
          where: { id: current.id },
          data: persistedData,
        })
        return normalizeStoreSettings(updated)
      }
      const created = await prisma.configuracoes_loja.create({ data: persistedData })
      return normalizeStoreSettings(created)
    },

    async sendWhatsAppTest(input) {
      if (!whatsappNotifier?.sendTestMessage) {
        throw new AppError(500, 'Integracao WhatsApp indisponivel no servidor.')
      }

      const config = await getStoreSettingsConfig()
      if (config.whatsapp_webhook_url) {
        config.whatsapp_webhook_url = await assertSafeWebhookUrl(config.whatsapp_webhook_url)
      }
      const result = await whatsappNotifier.sendTestMessage({
        config,
        customer: input,
      })

      return {
        ok: true,
        delivered: Boolean(result?.delivered),
        telefone_whatsapp: input.telefone_whatsapp,
      }
    },

    async startWhatsAppSession() {
      ensureWhatsAppTransport()
      const result = await whatsappTransport.startSession()
      return {
        configured: whatsappTransport.isConfigured(),
        webhook_url: whatsappTransport.buildWebhookUrl?.() || null,
        raw: result,
      }
    },

    async getWhatsAppSessionStatus() {
      ensureWhatsAppTransport()

      return {
        configured: whatsappTransport.isConfigured(),
        webhook_url: whatsappTransport.buildWebhookUrl?.() || null,
        raw: whatsappTransport.isConfigured() ? await whatsappTransport.checkConnectionSession() : null,
      }
    },

    async getWhatsAppSessionQrCode() {
      ensureWhatsAppTransport()
      if (!whatsappTransport.isConfigured()) {
        return {
          configured: false,
          qrCodeDataUrl: null,
          raw: null,
        }
      }

      return normalizeQrCodePayload(await whatsappTransport.getQrCode())
    },

    async listDeliveryFees() {
      return prisma.taxas_entrega_locais.findMany({
        orderBy: [{ cidade: 'asc' }, { bairro: 'asc' }, { id: 'asc' }],
      })
    },

    async createDeliveryFee(data) {
      const normalized = normalizeDeliveryFeeData(data)
      if (!normalized.bairro && !normalized.cidade) {
        throw new AppError(400, 'Informe ao menos um bairro ou cidade.')
      }

      const existing = await prisma.taxas_entrega_locais.findFirst({
        where: buildDeliveryFeeLookup(normalized),
      })

      if (existing) {
        throw new AppError(409, 'Ja existe uma taxa cadastrada para este bairro/cidade.')
      }

      return prisma.taxas_entrega_locais.create({
        data: normalized,
      })
    },

    async updateDeliveryFee(id, data) {
      const current = await prisma.taxas_entrega_locais.findUnique({
        where: { id },
      })

      if (!current) {
        throw new AppError(404, 'Taxa de entrega nao encontrada.')
      }

      const normalized = normalizeDeliveryFeeData(data)
      const merged = {
        bairro: normalized.bairro !== undefined ? normalized.bairro : current.bairro,
        cidade: normalized.cidade !== undefined ? normalized.cidade : current.cidade,
        valor_entrega: normalized.valor_entrega !== undefined ? normalized.valor_entrega : current.valor_entrega,
        ativo: normalized.ativo !== undefined ? normalized.ativo : current.ativo,
      }

      if (!merged.bairro && !merged.cidade) {
        throw new AppError(400, 'A taxa precisa manter um bairro ou cidade.')
      }

      const duplicate = await prisma.taxas_entrega_locais.findFirst({
        where: buildDeliveryFeeLookup(merged, id),
      })

      if (duplicate) {
        throw new AppError(409, 'Ja existe uma taxa cadastrada para este bairro/cidade.')
      }

      return prisma.taxas_entrega_locais.update({
        where: { id },
        data: normalized,
      })
    },

    async removeDeliveryFee(id) {
      try {
        return await prisma.taxas_entrega_locais.delete({
          where: { id },
        })
      } catch (error) {
        if (error?.code === 'P2025') throw new AppError(404, 'Taxa de entrega nao encontrada.')
        throw error
      }
    },
  }
}

module.exports = { adminPanelService }
