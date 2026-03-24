const { AppError } = require('../utils/errors')
const { cleanLocationField } = require('../utils/deliveryFees')
const { getDefaultStoreSettings, normalizeStoreSettings } = require('../utils/storeSettings')
const { assertSafeExternalUrl } = require('../utils/security')
const { scoreSearchMatch } = require('../utils/search')
const { createOrderAuditService } = require('./orderAuditService')

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

function normalizeOrderStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function assertPaymentTransitionAllowed(currentOrder, nextPaymentStatus) {
  const current = normalizeOrderStatus(currentOrder?.status_pagamento)
  const next = normalizeOrderStatus(nextPaymentStatus)

  if (!next || next === current) {
    return
  }

  if (next === 'pago') {
    throw new AppError(409, 'Pagamento nao pode ser confirmado manualmente por este endpoint.')
  }

  if (current === 'pago' && next !== 'estornado') {
    throw new AppError(409, 'Pedido pago nao pode voltar para um status anterior por este endpoint.')
  }

  if (current === 'estornado') {
    throw new AppError(409, 'Pedido estornado nao pode voltar para um status anterior por este endpoint.')
  }

  if (['cancelado', 'expirado'].includes(current) && ['pendente', 'pago'].includes(next)) {
    throw new AppError(409, 'Este pedido precisa de um novo checkout antes de voltar ao fluxo de pagamento.')
  }

  if (next === 'estornado' && current !== 'pago') {
    throw new AppError(409, 'Somente pedidos pagos podem ser marcados como estornados.')
  }
}

function buildAdminAuditActor(auth) {
  const username = String(auth?.username || '').trim()
  const subject = String(auth?.sub || '').trim()

  if (username && subject) {
    return `${username}#${subject}`
  }

  if (username) return username
  if (subject) return `usuario:${subject}`
  return null
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

function hasTextSearch(value) {
  return /[A-Za-zÀ-ÿ]/.test(normalizeSearchValue(value))
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

function buildOrderWhere(query = {}, { includeSearch = true } = {}) {
  const conditions = []
  const { where: createdAtWhere } = buildCreatedAtWhere(query)
  const search = normalizeSearchValue(query.search)

  if (createdAtWhere) {
    conditions.push({ criado_em: createdAtWhere })
  }

  if (query.status && query.status !== 'all') {
    conditions.push({ status_entrega: query.status })
  }

  if (includeSearch && search) {
    const or = buildOrderSearchOr(search)
    if (or.length > 0) {
      conditions.push({ OR: or })
    }
  }

  if (conditions.length === 0) return undefined
  if (conditions.length === 1) return conditions[0]
  return { AND: conditions }
}

function cleanAddressForAdmin(endereco) {
  if (!endereco) return null

  return {
    id: endereco.id,
    rua: endereco.rua,
    numero: endereco.numero,
    bairro: endereco.bairro,
    cidade: endereco.cidade || null,
    complemento: endereco.complemento || null,
    referencia: endereco.referencia || null,
  }
}

function toMoneyNumber(value) {
  const parsed = Number(value || 0)
  if (Number.isNaN(parsed)) return 0
  return Number(parsed.toFixed(2))
}

function toValidDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function diffDaysFromNow(value, now = new Date()) {
  const parsed = toValidDate(value)
  if (!parsed) return null
  const diffMs = now.getTime() - parsed.getTime()
  if (!Number.isFinite(diffMs)) return null
  return Math.max(0, Math.floor(diffMs / 86400000))
}

function compareNullableDatesDesc(a, b) {
  const left = toValidDate(a)?.getTime() || 0
  const right = toValidDate(b)?.getTime() || 0
  return right - left
}

function compareStringsAsc(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' })
}

function buildCustomerSearchOr(search) {
  const normalized = normalizeSearchValue(search)
  if (!normalized) return []

  const digits = toPhoneDigits(normalized)
  const parsedOrderId = parseOrderSearchId(normalized)

  if (normalized.startsWith('#')) {
    return parsedOrderId ? [{ pedidos: { some: { id: parsedOrderId } } }] : []
  }

  if (/^\d+$/.test(normalized)) {
    if (looksLikePhoneSearch(normalized)) {
      return digits ? [{ telefone_whatsapp: { contains: digits } }] : []
    }

    return parsedOrderId
      ? [{ id: parsedOrderId }, { pedidos: { some: { id: parsedOrderId } } }]
      : []
  }

  const or = [{ nome: { contains: normalized, mode: 'insensitive' } }]
  if (digits) {
    or.push({ telefone_whatsapp: { contains: digits } })
  }

  return or
}

function buildCustomerWhere(query = {}, { includeSearch = true } = {}) {
  const conditions = []
  const search = normalizeSearchValue(query.search)
  const { where: createdAtWhere, meta } = buildCreatedAtWhere(query)

  if (includeSearch && search) {
    const or = buildCustomerSearchOr(search)
    if (or.length > 0) {
      conditions.push({ OR: or })
    }
  }

  if (createdAtWhere) {
    conditions.push({
      OR: [
        { criado_em: createdAtWhere },
        { pedidos: { some: { criado_em: createdAtWhere } } },
      ],
    })
  }

  if (conditions.length === 0) {
    return { where: undefined, meta }
  }

  if (conditions.length === 1) {
    return { where: conditions[0], meta }
  }

  return { where: { AND: conditions }, meta }
}

function getCustomerListInclude() {
  return {
    enderecos: {
      orderBy: [{ id: 'desc' }],
      take: 1,
    },
    pedidos: {
      select: {
        id: true,
        valor_total: true,
        metodo_pagamento: true,
        status_entrega: true,
        criado_em: true,
      },
      orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
    },
  }
}

function getCustomerDetailInclude() {
  return {
    enderecos: {
      orderBy: [{ id: 'desc' }],
    },
    pedidos: {
      include: {
        enderecos: true,
        itens_pedido: {
          include: {
            produtos: { select: { id: true, nome_doce: true, preco: true } },
          },
        },
      },
      orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
    },
  }
}

function getPreferredPaymentMethod(orders = []) {
  const counts = new Map()

  orders.forEach((order) => {
    const key = normalizeSearchValue(order.metodo_pagamento)
    if (!key) return
    counts.set(key, (counts.get(key) || 0) + 1)
  })

  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return compareStringsAsc(left[0], right[0])
    })[0]?.[0] || null
}

function buildFavoriteProducts(orders = [], limit = 5) {
  const products = new Map()

  orders.forEach((order) => {
    ;(order.itens_pedido || []).forEach((item) => {
      const product = item.produtos
      if (!product) return

      const key = product.id
      const current = products.get(key) || {
        id: product.id,
        nome_doce: product.nome_doce,
        quantidade: 0,
        receita_total: 0,
      }

      current.quantidade += Number(item.quantidade || 0)
      current.receita_total = toMoneyNumber(current.receita_total + Number(item.subtotal || 0))
      products.set(key, current)
    })
  })

  return [...products.values()]
    .sort((left, right) => {
      if (right.quantidade !== left.quantidade) return right.quantidade - left.quantidade
      if (right.receita_total !== left.receita_total) return right.receita_total - left.receita_total
      return compareStringsAsc(left.nome_doce, right.nome_doce)
    })
    .slice(0, limit)
}

function classifyCustomerSegment(summary) {
  if (!summary.total_orders) {
    return {
      segment: 'lead',
      segment_label: 'Lead',
      segment_reason: 'Cadastro sem pedido confirmado.',
    }
  }

  if (summary.days_since_last_order !== null && summary.days_since_last_order > 45) {
    return {
      segment: 'inativo',
      segment_label: 'Inativo',
      segment_reason: `Sem pedidos ha ${summary.days_since_last_order} dias.`,
    }
  }

  if (summary.total_orders >= 3) {
    return {
      segment: 'recorrente',
      segment_label: 'Recorrente',
      segment_reason: 'Cliente com recompra consistente.',
    }
  }

  return {
    segment: 'novo',
    segment_label: 'Novo',
    segment_reason: 'Primeiras compras ainda em consolidacao.',
  }
}

function buildCustomerActions(summary) {
  if (summary.segment === 'lead') {
    return [
      'Enviar mensagem de boas-vindas com catalogo e horario da loja.',
      'Oferecer incentivo para a primeira compra.',
      'Confirmar endereco principal e preferencia de entrega.',
    ]
  }

  if (summary.segment === 'novo') {
    return [
      'Estimular a segunda compra com combo ou cupom de retorno.',
      'Pedir feedback curto sobre a experiencia do primeiro pedido.',
      'Apresentar os produtos mais vendidos da casa.',
    ]
  }

  if (summary.segment === 'recorrente') {
    return [
      'Convidar para programa de fidelidade ou beneficios por recorrencia.',
      'Anunciar novidades do cardapio em primeira mao.',
      'Monitorar intervalo medio entre pedidos para nao perder o timing.',
    ]
  }

  return [
    'Enviar campanha de reativacao com oferta objetiva.',
    'Revisar a ultima experiencia para detectar possivel atrito.',
    'Retomar contato em uma janela curta para recuperar a frequencia.',
  ]
}

function mapCustomerOrderDetail(order) {
  return {
    id: order.id,
    criado_em: order.criado_em,
    valor_total: toMoneyNumber(order.valor_total),
    valor_entrega: toMoneyNumber(order.valor_entrega),
    status_entrega: order.status_entrega,
    status_pagamento: order.status_pagamento,
    metodo_pagamento: order.metodo_pagamento,
    observacoes: order.observacoes || null,
    endereco: cleanAddressForAdmin(order.enderecos),
    itens: (order.itens_pedido || []).map((item) => ({
      id: item.id,
      produto_id: item.produto_id,
      quantidade: Number(item.quantidade || 0),
      preco_unitario: toMoneyNumber(item.preco_unitario),
      subtotal: toMoneyNumber(item.subtotal),
      produto: item.produtos
        ? {
            id: item.produtos.id,
            nome_doce: item.produtos.nome_doce,
            preco: toMoneyNumber(item.produtos.preco),
          }
        : null,
    })),
  }
}

function summarizeCustomer(cliente, { includeOrders = false, now = new Date() } = {}) {
  const orders = [...(cliente.pedidos || [])].sort((left, right) => {
    const dateDiff = compareNullableDatesDesc(left.criado_em, right.criado_em)
    if (dateDiff !== 0) return dateDiff
    return Number(right.id || 0) - Number(left.id || 0)
  })

  const totalOrders = orders.length
  const deliveredOrders = orders.filter((order) => order.status_entrega === 'entregue').length
  const cancelledOrders = orders.filter((order) => order.status_entrega === 'cancelado').length
  const totalSpent = toMoneyNumber(
    orders.reduce((acc, order) => acc + Number(order.valor_total || 0), 0),
  )
  const averageTicket = totalOrders > 0 ? toMoneyNumber(totalSpent / totalOrders) : 0
  const lastOrder = orders[0] || null
  const firstOrder = orders[orders.length - 1] || null
  const daysSinceLastOrder = diffDaysFromNow(lastOrder?.criado_em, now)

  const baseSummary = {
    id: cliente.id,
    nome: cliente.nome,
    telefone_whatsapp: cliente.telefone_whatsapp,
    whatsapp_lid: cliente.whatsapp_lid || null,
    criado_em: cliente.criado_em || null,
    latest_endereco: cleanAddressForAdmin(cliente.enderecos?.[0] || null),
    total_orders: totalOrders,
    delivered_orders: deliveredOrders,
    cancelled_orders: cancelledOrders,
    total_spent: totalSpent,
    average_ticket: averageTicket,
    first_order_at: firstOrder?.criado_em || null,
    last_order_at: lastOrder?.criado_em || null,
    last_order_status: lastOrder?.status_entrega || null,
    preferred_payment_method: getPreferredPaymentMethod(orders),
    days_since_last_order: daysSinceLastOrder,
  }

  const segmentData = classifyCustomerSegment(baseSummary)
  const recommendedActions = buildCustomerActions({ ...baseSummary, ...segmentData })

  return {
    ...baseSummary,
    ...segmentData,
    recommended_action: recommendedActions[0] || null,
    recommended_actions: recommendedActions,
    orders: includeOrders ? orders.map(mapCustomerOrderDetail) : undefined,
  }
}

function matchesCustomerSegment(customer, segment) {
  if (!segment || segment === 'all') return true
  return customer.segment === segment
}

function sortCustomers(items, sort) {
  const customers = [...items]

  customers.sort((left, right) => compareCustomers(left, right, sort))

  return customers
}

function compareCustomers(left, right, sort) {
  if (sort === 'name_asc') {
    return compareStringsAsc(left.nome, right.nome)
  }

  if (sort === 'orders_desc') {
    if (right.total_orders !== left.total_orders) return right.total_orders - left.total_orders
    if (right.total_spent !== left.total_spent) return right.total_spent - left.total_spent
    return compareStringsAsc(left.nome, right.nome)
  }

  if (sort === 'total_spent_desc') {
    if (right.total_spent !== left.total_spent) return right.total_spent - left.total_spent
    if (right.total_orders !== left.total_orders) return right.total_orders - left.total_orders
    return compareStringsAsc(left.nome, right.nome)
  }

  if (sort === 'recent_desc') {
    const dateDiff = compareNullableDatesDesc(left.last_order_at, right.last_order_at)
    if (dateDiff !== 0) return dateDiff
    if (right.total_spent !== left.total_spent) return right.total_spent - left.total_spent
    return compareStringsAsc(left.nome, right.nome)
  }

  if (right.total_spent !== left.total_spent) return right.total_spent - left.total_spent
  if (right.total_orders !== left.total_orders) return right.total_orders - left.total_orders
  const dateDiff = compareNullableDatesDesc(left.last_order_at, right.last_order_at)
  if (dateDiff !== 0) return dateDiff
  return compareStringsAsc(left.nome, right.nome)
}

function compareOrders(left, right) {
  const dateDiff = compareNullableDatesDesc(left.criado_em, right.criado_em)
  if (dateDiff !== 0) return dateDiff
  return Number(right.id || 0) - Number(left.id || 0)
}

function rankSearchMatches(items, search, getFields, compareFallback) {
  return [...items]
    .map((item) => ({
      item,
      score: scoreSearchMatch(search, getFields(item)),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return compareFallback ? compareFallback(left.item, right.item) : 0
    })
    .map((entry) => entry.item)
}

function buildCustomerSearchFields(customer) {
  return [
    customer.nome,
    customer.telefone_whatsapp,
    customer.segment_label,
    customer.segment_reason,
    customer.latest_endereco?.rua,
    customer.latest_endereco?.numero,
    customer.latest_endereco?.bairro,
    customer.latest_endereco?.cidade,
  ]
}

function buildOrderSearchFields(order) {
  return [
    String(order.id || ''),
    order.clientes?.nome,
    order.clientes?.telefone_whatsapp,
    order.enderecos?.rua,
    order.enderecos?.numero,
    order.enderecos?.bairro,
    order.enderecos?.cidade,
    order.metodo_pagamento,
    order.observacoes,
    ...(order.itens_pedido || []).map((item) => item.produtos?.nome_doce || `Produto ${item.produto_id}`),
  ]
}

function buildCustomersSummary(customers) {
  const totalRevenue = toMoneyNumber(
    customers.reduce((acc, customer) => acc + Number(customer.total_spent || 0), 0),
  )
  const totalOrders = customers.reduce((acc, customer) => acc + Number(customer.total_orders || 0), 0)

  return {
    total_customers: customers.length,
    active_customers: customers.filter((customer) => customer.days_since_last_order !== null && customer.days_since_last_order <= 30).length,
    recurring_customers: customers.filter((customer) => customer.segment === 'recorrente').length,
    new_customers: customers.filter((customer) => customer.segment === 'novo').length,
    inactive_customers: customers.filter((customer) => customer.segment === 'inativo').length,
    lead_customers: customers.filter((customer) => customer.segment === 'lead').length,
    revenue_total: totalRevenue,
    total_orders: totalOrders,
    average_ticket: totalOrders > 0 ? toMoneyNumber(totalRevenue / totalOrders) : 0,
  }
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
  const orderAudit = deps.orderAudit || createOrderAuditService(prisma)
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
      const search = normalizeSearchValue(query.search)
      const where = buildOrderWhere(query)
      const { meta } = buildCreatedAtWhere(query)
      const textSearch = hasTextSearch(search)

      if (textSearch) {
        const [exactItems, exactTotal] = await prisma.$transaction([
          prisma.pedidos.findMany({
            where,
            orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
            skip,
            take: pageSize,
            include: getOrderNotificationInclude(),
          }),
          prisma.pedidos.count({ where }),
        ])

        if (exactTotal > 0) {
          return {
            items: exactItems,
            meta: {
              page,
              pageSize,
              total: exactTotal,
              totalPages: Math.max(1, Math.ceil(exactTotal / pageSize)),
              filters: {
                ...meta,
                status: query.status || 'all',
                search,
              },
            },
          }
        }

        const fallbackWhere = buildOrderWhere(query, { includeSearch: false })
        const fallbackItems = await prisma.pedidos.findMany({
          where: fallbackWhere,
          orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
          include: getOrderNotificationInclude(),
        })

        const rankedItems = rankSearchMatches(
          fallbackItems,
          search,
          buildOrderSearchFields,
          compareOrders,
        )
        const total = rankedItems.length
        const totalPages = Math.max(1, Math.ceil(total / pageSize))
        const safePage = Math.min(Math.max(page, 1), totalPages)
        const fallbackSkip = (safePage - 1) * pageSize

        return {
          items: rankedItems.slice(fallbackSkip, fallbackSkip + pageSize),
          meta: {
            page: safePage,
            pageSize,
            total,
            totalPages,
            filters: {
              ...meta,
              status: query.status || 'all',
              search,
            },
          },
        }
      }

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
            search,
          },
        },
      }
    },

    async getOrderAudit(id) {
      const order = await prisma.pedidos.findUnique({
        where: { id },
        select: { id: true },
      })

      if (!order) {
        throw new AppError(404, 'Pedido nao encontrado.')
      }

      if (!prisma?.pedidos_auditoria?.findMany) {
        throw new AppError(
          500,
          'Schema do banco desatualizado. Aplique a atualizacao de auditoria de pedidos no banco de dados.',
        )
      }

      const items = await prisma.pedidos_auditoria.findMany({
        where: { pedido_id: id },
        orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
      })

      return items.map((item) => ({
        id: item.id,
        pedido_id: item.pedido_id,
        origem: item.origem,
        ator: item.ator || null,
        acao: item.acao,
        status_pagamento_anterior: item.status_pagamento_anterior || null,
        status_pagamento_atual: item.status_pagamento_atual || null,
        status_entrega_anterior: item.status_entrega_anterior || null,
        status_entrega_atual: item.status_entrega_atual || null,
        detalhes: item.detalhes || null,
        criado_em: item.criado_em,
      }))
    },

    async listCustomers(query = {}) {
      const page = Number(query.page || 1)
      const pageSize = Number(query.pageSize || 12)
      const sort = query.sort || 'recent_desc'
      const segment = query.segment || 'all'
      const search = normalizeSearchValue(query.search)
      const { where, meta } = buildCustomerWhere(query)
      const textSearch = hasTextSearch(search)

      let rawCustomers = await prisma.clientes.findMany({
        where,
        orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
        include: getCustomerListInclude(),
      })

      if (textSearch && rawCustomers.length === 0) {
        const { where: fallbackWhere } = buildCustomerWhere(query, { includeSearch: false })
        rawCustomers = await prisma.clientes.findMany({
          where: fallbackWhere,
          orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
          include: getCustomerListInclude(),
        })
      }

      const summarizedCustomers = rawCustomers.map((customer) => summarizeCustomer(customer))
      const filteredBySegment = summarizedCustomers.filter((customer) => matchesCustomerSegment(customer, segment))
      const filteredCustomers = search
        ? rankSearchMatches(
            filteredBySegment,
            search,
            buildCustomerSearchFields,
            (left, right) => compareCustomers(left, right, sort),
          )
        : sortCustomers(filteredBySegment, sort)
      const total = filteredCustomers.length
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      const safePage = Math.min(Math.max(page, 1), totalPages)
      const skip = (safePage - 1) * pageSize
      const items = filteredCustomers.slice(skip, skip + pageSize)

      return {
        items,
        meta: {
          page: safePage,
          pageSize,
          total,
          totalPages,
          summary: buildCustomersSummary(filteredCustomers),
          filters: {
            ...meta,
            search,
            segment,
            sort,
          },
        },
      }
    },

    async getCustomer(id) {
      const customer = await prisma.clientes.findUnique({
        where: { id },
        include: getCustomerDetailInclude(),
      })

      if (!customer) {
        throw new AppError(404, 'Cliente nao encontrado.')
      }

      const summary = summarizeCustomer(customer, { includeOrders: true })

      return {
        id: customer.id,
        nome: customer.nome,
        telefone_whatsapp: customer.telefone_whatsapp,
        whatsapp_lid: customer.whatsapp_lid || null,
        criado_em: customer.criado_em || null,
        latest_endereco: summary.latest_endereco,
        enderecos: (customer.enderecos || []).map(cleanAddressForAdmin),
        total_orders: summary.total_orders,
        delivered_orders: summary.delivered_orders,
        cancelled_orders: summary.cancelled_orders,
        total_spent: summary.total_spent,
        average_ticket: summary.average_ticket,
        first_order_at: summary.first_order_at,
        last_order_at: summary.last_order_at,
        last_order_status: summary.last_order_status,
        preferred_payment_method: summary.preferred_payment_method,
        days_since_last_order: summary.days_since_last_order,
        segment: summary.segment,
        segment_label: summary.segment_label,
        segment_reason: summary.segment_reason,
        recommended_action: summary.recommended_action,
        recommended_actions: summary.recommended_actions,
        favorite_products: buildFavoriteProducts(customer.pedidos),
        orders: summary.orders || [],
      }
    },

    async updateOrderStatus(id, updates = {}, actor = null) {
      const currentOrder = await prisma.pedidos.findUnique({
        where: { id },
        include: getOrderNotificationInclude(),
      })

      if (!currentOrder) {
        throw new AppError(404, 'Pedido nao encontrado.')
      }

      const nextStatusEntrega = updates.status_entrega ?? currentOrder.status_entrega
      const nextStatusPagamento = updates.status_pagamento ?? currentOrder.status_pagamento
      const deliveryChanged = currentOrder.status_entrega !== nextStatusEntrega
      const paymentChanged = currentOrder.status_pagamento !== nextStatusPagamento

      if (!deliveryChanged && !paymentChanged) {
        return currentOrder
      }

      if (paymentChanged) {
        assertPaymentTransitionAllowed(currentOrder, nextStatusPagamento)
      }

      const updateData = {}
      if (deliveryChanged) updateData.status_entrega = nextStatusEntrega
      if (paymentChanged) updateData.status_pagamento = nextStatusPagamento

      let config = null
      let updatedOrder = null

      if (deliveryChanged && whatsappNotifier?.notifyOrderStatusUpdatedSafe) {
        const results = await Promise.all([
          getStoreSettingsConfig(),
          prisma.pedidos.update({
            where: { id },
            data: updateData,
            include: getOrderNotificationInclude(),
          }),
        ])
        config = results[0]
        updatedOrder = results[1]
      } else {
        updatedOrder = await prisma.pedidos.update({
          where: { id },
          data: updateData,
          include: getOrderNotificationInclude(),
        })
      }

      if (deliveryChanged && whatsappNotifier?.notifyOrderStatusUpdatedSafe) {
        whatsappNotifier.notifyOrderStatusUpdatedSafe({
          config,
          previousStatus: currentOrder.status_entrega || null,
          order: toNotificationOrderData(updatedOrder),
        })
      }

      await orderAudit.record({
        pedido_id: currentOrder.id,
        origem: 'admin',
        ator: buildAdminAuditActor(actor),
        acao: 'status_atualizado_no_painel',
        status_pagamento_anterior: currentOrder.status_pagamento,
        status_pagamento_atual: updatedOrder.status_pagamento,
        status_entrega_anterior: currentOrder.status_entrega,
        status_entrega_atual: updatedOrder.status_entrega,
        detalhes: {
          delivery_changed: deliveryChanged,
          payment_changed: paymentChanged,
        },
      })

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
