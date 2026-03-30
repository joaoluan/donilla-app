const { AppError } = require('../utils/errors')
const { normalizeWhatsAppPhone } = require('../utils/phone')

function removeDiacritics(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeTriggerText(value) {
  return removeDiacritics(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitTriggerKeywords(value) {
  const seen = new Set()

  return String(value || '')
    .split(/[\n,;|]+/)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => ({
      raw: item,
      normalized: normalizeTriggerText(item),
    }))
    .filter((item) => item.normalized)
    .filter((item) => {
      if (seen.has(item.normalized)) {
        return false
      }

      seen.add(item.normalized)
      return true
    })
}

function hasOverlappingTriggerAlias(leftValue, rightValue) {
  const leftAliases = new Set(splitTriggerKeywords(leftValue).map((item) => item.normalized))
  if (!leftAliases.size) return false

  return splitTriggerKeywords(rightValue).some((item) => leftAliases.has(item.normalized))
}

function compareFlowPriority(leftFlow, leftAlias, rightFlow, rightAlias) {
  if (!rightFlow || !rightAlias) return -1

  const aliasLengthDiff = rightAlias.normalized.length - leftAlias.normalized.length
  if (aliasLengthDiff !== 0) {
    return aliasLengthDiff
  }

  const leftPublishedAt = leftFlow?.published_at ? new Date(leftFlow.published_at).getTime() : 0
  const rightPublishedAt = rightFlow?.published_at ? new Date(rightFlow.published_at).getTime() : 0
  if (rightPublishedAt !== leftPublishedAt) {
    return rightPublishedAt - leftPublishedAt
  }

  return Number(rightFlow?.id || 0) - Number(leftFlow?.id || 0)
}

function findBestTriggerMatch(flows, messageText) {
  const normalizedMessage = normalizeTriggerText(messageText)
  if (!normalizedMessage) return null

  let bestFlow = null
  let bestAlias = null

  for (const flow of Array.isArray(flows) ? flows : []) {
    for (const alias of splitTriggerKeywords(flow?.trigger_keyword)) {
      if (!normalizedMessage.startsWith(alias.normalized)) {
        continue
      }

      if (!bestFlow || compareFlowPriority(bestFlow, bestAlias, flow, alias) > 0) {
        bestFlow = flow
        bestAlias = alias
      }
    }
  }

  return bestFlow
}

function createFlowRepository(prisma) {
  function hasRawQuerySupport(client = prisma) {
    return typeof client?.$queryRawUnsafe === 'function' && typeof client?.$executeRawUnsafe === 'function'
  }

  function extractDatabaseErrorCode(error) {
    const directCode = String(error?.code || '').trim()
    if (directCode && directCode !== 'P2010') {
      return directCode
    }

    const nestedCandidates = [
      error?.meta?.code,
      error?.meta?.driverAdapterError?.code,
      error?.meta?.driverAdapterError?.cause?.code,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)

    if (nestedCandidates.length) {
      return nestedCandidates[0]
    }

    const messageMatch = String(error?.message || '').match(/Code:\s*`([^`]+)`/i)
    return messageMatch?.[1] ? String(messageMatch[1]).trim() : directCode
  }

  function normalizeError(error) {
    const databaseCode = extractDatabaseErrorCode(error)

    if (['42P01', '42703'].includes(databaseCode)) {
      throw new AppError(
        500,
        'Schema do banco desatualizado. Aplique o SQL prisma/sql/20260330_add_flow_builder.sql antes de usar o Flow Builder.',
      )
    }

    if (databaseCode === '23505') {
      throw new AppError(409, 'Ja existe um registro com estes dados.')
    }

    if (databaseCode === '23503') {
      throw new AppError(
        409,
        'Nao foi possivel concluir a operacao porque este fluxo esta vinculado a outras informacoes.',
      )
    }

    if (databaseCode === '22001') {
      const errorMessage = String(error?.message || '')
      if (/trigger_keyword|character varying\(100\)/i.test(errorMessage)) {
        throw new AppError(
          500,
          'Schema do banco desatualizado para gatilhos multiplos. Aplique o SQL prisma/sql/20260330_expand_flow_trigger_keyword_aliases.sql.',
        )
      }

      throw new AppError(400, 'Um dos campos informados excede o limite permitido.')
    }

    throw error
  }

  async function query(sql, params = [], client = prisma) {
    if (!hasRawQuerySupport(client)) {
      throw new AppError(500, 'Cliente Prisma atual nao suporta queries raw para o Flow Builder.')
    }

    try {
      return await client.$queryRawUnsafe(sql, ...params)
    } catch (error) {
      normalizeError(error)
    }
  }

  async function execute(sql, params = [], client = prisma) {
    if (!hasRawQuerySupport(client)) {
      throw new AppError(500, 'Cliente Prisma atual nao suporta queries raw para o Flow Builder.')
    }

    try {
      return await client.$executeRawUnsafe(sql, ...params)
    } catch (error) {
      normalizeError(error)
    }
  }

  async function withTransaction(handler) {
    if (typeof prisma?.$transaction !== 'function') {
      return handler(prisma)
    }

    return prisma.$transaction((tx) => handler(tx))
  }

  function parseJson(value, fallback) {
    if (value === null || value === undefined) return fallback
    if (typeof value === 'string') {
      try {
        return JSON.parse(value)
      } catch {
        return fallback
      }
    }

    return value
  }

  function mapFlow(row = {}) {
    return {
      id: Number(row.id || 0),
      name: String(row.name || '').trim(),
      trigger_keyword: String(row.trigger_keyword || '').trim(),
      flow_json: parseJson(row.flow_json, { nodes: [] }) || { nodes: [] },
      canvas_json: parseJson(row.canvas_json, {}) || {},
      status: String(row.status || 'draft').trim() || 'draft',
      published_at: row.published_at || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    }
  }

  function mapFlowSession(row = {}) {
    return {
      id: Number(row.id || 0),
      phone: String(row.phone || '').trim(),
      flow_id: row.flow_id ? Number(row.flow_id) : null,
      flow_name: row.flow_name ? String(row.flow_name).trim() : null,
      current_node_id: row.current_node_id ? String(row.current_node_id).trim() : null,
      waiting_for: row.waiting_for ? String(row.waiting_for).trim() : null,
      context_data: parseJson(row.context_data, {}) || {},
      last_activity: row.last_activity || null,
      created_at: row.created_at || null,
      customer_name: row.customer_name ? String(row.customer_name).trim() : null,
    }
  }

  function normalizeStoredPhone(phone) {
    return normalizeWhatsAppPhone(phone) || String(phone || '').replace(/\D/g, '').trim()
  }

  async function listFlows() {
    const rows = await query(
      `SELECT id, name, trigger_keyword, flow_json, canvas_json, status, published_at, created_at, updated_at
       FROM bot_flows
       ORDER BY updated_at DESC, id DESC`,
    )

    return rows.map((row) => mapFlow(row))
  }

  async function createFlow({ name, triggerKeyword, flowJson, canvasJson }) {
    const rows = await query(
      `INSERT INTO bot_flows (name, trigger_keyword, flow_json, canvas_json, status, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, 'draft', NOW(), NOW())
       RETURNING id, name, trigger_keyword, flow_json, canvas_json, status, published_at, created_at, updated_at`,
      [name, triggerKeyword, JSON.stringify(flowJson), JSON.stringify(canvasJson || {})],
    )

    return rows[0] ? mapFlow(rows[0]) : null
  }

  async function findFlowById(id) {
    const rows = await query(
      `SELECT id, name, trigger_keyword, flow_json, canvas_json, status, published_at, created_at, updated_at
       FROM bot_flows
       WHERE id = $1
       LIMIT 1`,
      [id],
    )

    return rows[0] ? mapFlow(rows[0]) : null
  }

  async function updateFlow(id, { name, triggerKeyword, flowJson, canvasJson }) {
    const rows = await query(
      `UPDATE bot_flows
       SET name = $2,
           trigger_keyword = $3,
           flow_json = $4::jsonb,
           canvas_json = $5::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, trigger_keyword, flow_json, canvas_json, status, published_at, created_at, updated_at`,
      [id, name, triggerKeyword, JSON.stringify(flowJson), JSON.stringify(canvasJson || {})],
    )

    return rows[0] ? mapFlow(rows[0]) : null
  }

  async function publishFlow(id, triggerKeyword) {
    return withTransaction(async (tx) => {
      const publishedRows = await query(
        `SELECT id, name, trigger_keyword, flow_json, canvas_json, status, published_at, created_at, updated_at
         FROM bot_flows
         WHERE status = 'published'
           AND id <> $1`,
        [id],
        tx,
      )

      for (const row of publishedRows) {
        const publishedFlow = mapFlow(row)
        if (!hasOverlappingTriggerAlias(publishedFlow.trigger_keyword, triggerKeyword)) {
          continue
        }

        await execute(
          `UPDATE bot_flows
           SET status = 'archived',
               updated_at = NOW()
           WHERE id = $1`,
          [publishedFlow.id],
          tx,
        )
      }

      const rows = await query(
        `UPDATE bot_flows
         SET status = 'published',
             published_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, trigger_keyword, flow_json, canvas_json, status, published_at, created_at, updated_at`,
        [id],
        tx,
      )

      return rows[0] ? mapFlow(rows[0]) : null
    })
  }

  async function unpublishFlow(id) {
    const rows = await query(
      `UPDATE bot_flows
       SET status = 'draft',
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, trigger_keyword, flow_json, canvas_json, status, published_at, created_at, updated_at`,
      [id],
    )

    return rows[0] ? mapFlow(rows[0]) : null
  }

  async function removeFlow(id) {
    const rows = await query(
      `DELETE FROM bot_flows
       WHERE id = $1
       RETURNING id, name, trigger_keyword, flow_json, canvas_json, status, published_at, created_at, updated_at`,
      [id],
    )

    return rows[0] ? mapFlow(rows[0]) : null
  }

  async function listActiveSessions() {
    const rows = await query(
      `SELECT s.id,
              s.phone,
              s.flow_id,
              f.name AS flow_name,
              s.current_node_id,
              s.waiting_for,
              s.context_data,
              s.last_activity,
              s.created_at,
              c.nome AS customer_name
       FROM client_flow_sessions s
       LEFT JOIN bot_flows f ON f.id = s.flow_id
       LEFT JOIN clientes c ON c.telefone_whatsapp = s.phone
       ORDER BY s.last_activity DESC, s.id DESC`,
    )

    return rows.map((row) => mapFlowSession(row))
  }

  async function findPublishedFlowByTrigger(messageText) {
    const keyword = String(messageText || '').trim()
    if (!keyword) return null

    const rows = await query(
      `SELECT id, name, trigger_keyword, flow_json, canvas_json, status, published_at, created_at, updated_at
       FROM bot_flows
       WHERE status = 'published'
       ORDER BY published_at DESC NULLS LAST, id DESC`,
    )

    return findBestTriggerMatch(rows.map((row) => mapFlow(row)), keyword)
  }

  async function getClientSession(phone) {
    const normalizedPhone = normalizeStoredPhone(phone)
    if (!normalizedPhone) return null

    const rows = await query(
      `SELECT id, phone, flow_id, current_node_id, waiting_for, context_data, last_activity, created_at
       FROM client_flow_sessions
       WHERE phone = $1
       LIMIT 1`,
      [normalizedPhone],
    )

    return rows[0] ? mapFlowSession(rows[0]) : null
  }

  async function createOrUpdateSession(phone, flowId, nodeId, waitingFor = null, contextData = {}) {
    const normalizedPhone = normalizeStoredPhone(phone)
    if (!normalizedPhone) {
      throw new AppError(400, 'Telefone invalido para sessao de fluxo.')
    }

    const rows = await query(
      `INSERT INTO client_flow_sessions (phone, flow_id, current_node_id, waiting_for, context_data, last_activity, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())
       ON CONFLICT (phone)
       DO UPDATE SET flow_id = EXCLUDED.flow_id,
                     current_node_id = EXCLUDED.current_node_id,
                     waiting_for = EXCLUDED.waiting_for,
                     context_data = EXCLUDED.context_data,
                     last_activity = NOW()
       RETURNING id, phone, flow_id, current_node_id, waiting_for, context_data, last_activity, created_at`,
      [normalizedPhone, flowId || null, nodeId || null, waitingFor || null, JSON.stringify(contextData || {})],
    )

    return rows[0] ? mapFlowSession(rows[0]) : null
  }

  async function clearClientSession(phone) {
    const normalizedPhone = normalizeStoredPhone(phone)
    if (!normalizedPhone) return null

    const rows = await query(
      `DELETE FROM client_flow_sessions
       WHERE phone = $1
       RETURNING id, phone, flow_id, current_node_id, waiting_for, context_data, last_activity, created_at`,
      [normalizedPhone],
    )

    return rows[0] ? mapFlowSession(rows[0]) : null
  }

  async function ensureCustomer(phone) {
    const normalizedPhone = normalizeStoredPhone(phone)
    if (!normalizedPhone) return null

    const rows = await query(
      `INSERT INTO clientes (nome, telefone_whatsapp)
       VALUES ($1, $2)
       ON CONFLICT (telefone_whatsapp)
       DO UPDATE SET telefone_whatsapp = EXCLUDED.telefone_whatsapp
       RETURNING id, nome, telefone_whatsapp, bot_tags, bot_handoff_active, bot_handoff_updated_at`,
      ['Contato WhatsApp', normalizedPhone],
    )

    return rows[0] || null
  }

  async function findCustomerByPhone(phone) {
    const normalizedPhone = normalizeStoredPhone(phone)
    if (!normalizedPhone) return null

    const rows = await query(
      `SELECT id, nome, telefone_whatsapp, bot_tags, bot_handoff_active, bot_handoff_updated_at
       FROM clientes
       WHERE telefone_whatsapp = $1
       LIMIT 1`,
      [normalizedPhone],
    )

    return rows[0] || null
  }

  async function updateCustomerTags(phone, tagName) {
    const normalizedPhone = normalizeStoredPhone(phone)
    const normalizedTag = String(tagName || '').trim()
    if (!normalizedPhone || !normalizedTag) return null

    let customer = await findCustomerByPhone(normalizedPhone)
    if (!customer) {
      customer = await ensureCustomer(normalizedPhone)
    }

    const currentTags = parseJson(customer?.bot_tags, [])
    const nextTags = Array.isArray(currentTags) ? [...currentTags] : []
    const hasTag = nextTags.some((tag) => String(tag || '').trim().toLowerCase() === normalizedTag.toLowerCase())

    if (!hasTag) {
      nextTags.push(normalizedTag)
    }

    const rows = await query(
      `UPDATE clientes
       SET bot_tags = $2::jsonb
       WHERE telefone_whatsapp = $1
       RETURNING id, nome, telefone_whatsapp, bot_tags, bot_handoff_active, bot_handoff_updated_at`,
      [normalizedPhone, JSON.stringify(nextTags)],
    )

    return rows[0] || customer
  }

  async function setCustomerHandoff(phone, active) {
    const normalizedPhone = normalizeStoredPhone(phone)
    if (!normalizedPhone) return null

    let customer = await findCustomerByPhone(normalizedPhone)
    if (!customer) {
      customer = await ensureCustomer(normalizedPhone)
    }

    const rows = await query(
      `UPDATE clientes
       SET bot_handoff_active = $2,
           bot_handoff_updated_at = NOW()
       WHERE telefone_whatsapp = $1
       RETURNING id, nome, telefone_whatsapp, bot_tags, bot_handoff_active, bot_handoff_updated_at`,
      [normalizedPhone, Boolean(active)],
    )

    return rows[0] || customer
  }

  async function isCustomerInHandoff(phone) {
    const customer = await findCustomerByPhone(phone)
    return Boolean(customer?.bot_handoff_active)
  }

  return {
    createFlow,
    createOrUpdateSession,
    execute,
    findCustomerByPhone,
    findFlowById,
    findPublishedFlowByTrigger,
    getClientSession,
    hasRawQuerySupport,
    isCustomerInHandoff,
    listActiveSessions,
    listFlows,
    publishFlow,
    query,
    clearClientSession,
    removeFlow,
    setCustomerHandoff,
    updateCustomerTags,
    updateFlow,
    unpublishFlow,
    withTransaction,
  }
}

module.exports = {
  createFlowRepository,
  findBestTriggerMatch,
  hasOverlappingTriggerAlias,
  normalizeTriggerText,
  splitTriggerKeywords,
}
