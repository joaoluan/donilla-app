const { AppError } = require('../utils/errors')
const { getPhoneSearchVariants, normalizeWhatsAppPhone } = require('../utils/phone')

const CAMPAIGN_STATUS = {
  draft: 'draft',
  scheduled: 'scheduled',
  running: 'running',
  awaiting_reply: 'awaiting_reply',
  done: 'done',
  failed: 'failed',
}

const LOG_STATUS = {
  pending: 'pending',
  sent: 'sent',
  greeting_sent: 'greeting_sent',
  replied: 'replied',
  completed: 'completed',
  no_response: 'no_response',
  failed: 'failed',
}

const INTERACTION_STATUS = {
  greeting_sent: 'greeting_sent',
  replied: 'replied',
  completed: 'completed',
  no_response: 'no_response',
  failed: 'failed',
}

const DEFAULT_MIN_DELAY_MS = 2 * 60 * 1000
const DEFAULT_MAX_DELAY_MS = 3 * 60 * 1000
const DEFAULT_REPLY_TIMEOUT_MS = 24 * 60 * 60 * 1000
const DEFAULT_PAGE_LIMIT = 100
const MAX_PAGE_LIMIT = 100
const MAX_TIMEOUT_MS = 2_147_483_647

function createBroadcastService(prisma, deps = {}) {
  const whatsappTransport = deps.whatsappTransport || null
  const logger = deps.logger || console
  const nowProvider = typeof deps.nowProvider === 'function' ? deps.nowProvider : () => new Date()
  const randomProvider = typeof deps.randomProvider === 'function' ? deps.randomProvider : Math.random
  const setTimeoutFn = typeof deps.setTimeoutFn === 'function' ? deps.setTimeoutFn : setTimeout
  const clearTimeoutFn = typeof deps.clearTimeoutFn === 'function' ? deps.clearTimeoutFn : clearTimeout
  const sleepImpl = typeof deps.sleepImpl === 'function'
    ? deps.sleepImpl
    : (ms) => new Promise((resolve) => {
      setTimeoutFn(resolve, ms)
    })
  const minDelayMs = Math.max(0, toFiniteNumber(deps.minDelayMs, DEFAULT_MIN_DELAY_MS))
  const maxDelayMs = Math.max(minDelayMs, toFiniteNumber(deps.maxDelayMs, DEFAULT_MAX_DELAY_MS))
  const replyTimeoutMs = Math.max(60_000, toFiniteNumber(deps.replyTimeoutMs, DEFAULT_REPLY_TIMEOUT_MS))
  const scheduledTimers = new Map()
  const interactionTimers = new Map()
  const runningCampaigns = new Map()
  const processingReplyInteractions = new Set()
  let bootstrapPromise = null
  let memberPhoneNormalizationPromise = null
  let memberPhoneNormalizationDone = false

  function toFiniteNumber(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  function hasRawQuerySupport() {
    return typeof prisma?.$queryRawUnsafe === 'function' && typeof prisma?.$executeRawUnsafe === 'function'
  }

  function isMissingSchemaError(error) {
    return ['42P01', '42703'].includes(String(error?.code || '').trim())
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

    if (['42P01', '42703'].includes(databaseCode) || isMissingSchemaError(error)) {
      throw new AppError(
        500,
        'Schema do banco desatualizado. Aplique os SQLs prisma/sql/20260330_add_broadcast_module.sql e prisma/sql/20260330_add_broadcast_human_behavior.sql antes de usar os disparos.',
      )
    }

    if (databaseCode === '23505') {
      throw new AppError(409, 'Registro duplicado para este contexto.')
    }

    if (databaseCode === '23503') {
      throw new AppError(
        409,
        'Nao foi possivel concluir a operacao porque este registro esta vinculado a outros dados.',
      )
    }

    throw error
  }

  async function query(sql, ...params) {
    if (!hasRawQuerySupport()) {
      throw new AppError(500, 'Cliente Prisma atual nao suporta queries raw para o modulo de disparos.')
    }

    try {
      return await prisma.$queryRawUnsafe(sql, ...params)
    } catch (error) {
      normalizeError(error)
    }
  }

  async function execute(sql, ...params) {
    if (!hasRawQuerySupport()) {
      throw new AppError(500, 'Cliente Prisma atual nao suporta queries raw para o modulo de disparos.')
    }

    try {
      return await prisma.$executeRawUnsafe(sql, ...params)
    } catch (error) {
      normalizeError(error)
    }
  }

  function ensureWhatsAppTransport() {
    if (!whatsappTransport?.sendTextMessage) {
      throw new AppError(500, 'Transporte WhatsApp indisponivel no servidor.')
    }
  }

  function getRandomDelayMs() {
    return minDelayMs + Math.floor(randomProvider() * (maxDelayMs - minDelayMs + 1))
  }

  function sleep(ms) {
    return sleepImpl(ms)
  }

  function toNumber(value, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  function trimNullable(value) {
    const normalized = String(value || '').trim()
    return normalized || null
  }

  function truncateToMaxLength(value, max) {
    const normalized = String(value || '').trim()
    if (!normalized) return ''
    if (!Number.isInteger(max) || max <= 0 || normalized.length <= max) {
      return normalized
    }

    return normalized.slice(0, max)
  }

  function normalizePagination(options = {}) {
    return {
      limit: Math.max(1, Math.min(MAX_PAGE_LIMIT, toNumber(options.limit, DEFAULT_PAGE_LIMIT))),
      offset: Math.max(0, toNumber(options.offset, 0)),
    }
  }

  function buildPaginationMeta(total, limit, offset, loadedCount) {
    const safeTotal = Math.max(0, toNumber(total))
    const safeLimit = Math.max(1, toNumber(limit, DEFAULT_PAGE_LIMIT))
    const safeOffset = Math.max(0, toNumber(offset))
    const safeLoadedCount = Math.max(0, toNumber(loadedCount))
    const nextOffset = safeOffset + safeLoadedCount

    return {
      total: safeTotal,
      limit: safeLimit,
      offset: safeOffset,
      loaded: safeLoadedCount,
      has_more: nextOffset < safeTotal,
      next_offset: nextOffset < safeTotal ? nextOffset : null,
    }
  }

  function dedupeStrings(values = []) {
    return [...new Set(
      values
        .map((value) => trimNullable(value))
        .filter(Boolean),
    )]
  }

  function normalizeMemberPhone(value) {
    return normalizeWhatsAppPhone(value) || trimNullable(value) || ''
  }

  function buildMemberPhoneVariants(value) {
    return dedupeStrings([
      trimNullable(value),
      normalizeMemberPhone(value),
      ...getPhoneSearchVariants(value),
    ])
  }

  function firstName(value) {
    const normalized = trimNullable(value)
    if (!normalized) return null
    return normalized.split(/\s+/).filter(Boolean)[0] || null
  }

  function buildTimeGreetingLabel(reference = nowProvider()) {
    const hour = new Date(reference).getHours()
    if (hour < 12) return 'Bom dia'
    if (hour < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  function chooseGreetingMessage(clientName) {
    const name = firstName(clientName)
    const timeGreeting = buildTimeGreetingLabel()
    const candidates = dedupeStrings([
      'Oi!',
      'Ola!',
      'Oi, tudo bem?',
      'Ola! Tudo bem?',
      name ? `Oi, ${name}!` : null,
      name ? `${timeGreeting}, ${name}!` : `${timeGreeting}!`,
    ])

    if (!candidates.length) return 'Oi!'

    const selectedIndex = Math.floor(randomProvider() * candidates.length)
    return candidates[selectedIndex] || candidates[0]
  }

  function buildInteractionExpiryDate(reference = nowProvider()) {
    return new Date(new Date(reference).getTime() + replyTimeoutMs)
  }

  function isGreetingDispatchStatus(status) {
    return [LOG_STATUS.sent, LOG_STATUS.greeting_sent].includes(trimNullable(status))
  }

  function mapList(row = {}) {
    return {
      id: toNumber(row.id),
      name: trimNullable(row.name) || '',
      description: trimNullable(row.description),
      created_at: row.created_at || null,
      member_count: toNumber(row.member_count),
    }
  }

  function mapMember(row = {}) {
    return {
      id: toNumber(row.id),
      list_id: toNumber(row.list_id),
      phone: trimNullable(row.client_phone) || '',
      name: trimNullable(row.client_name),
      added_at: row.added_at || null,
    }
  }

  function buildCampaignProgress(campaign = {}) {
    const total = toNumber(campaign.total_contacts)
    const pendingLogs = toNumber(campaign.pending_logs_count)
    const awaitingReply = toNumber(campaign.awaiting_reply_count)
    const resolved = toNumber(campaign.completed_count) + toNumber(campaign.no_response_count) + toNumber(campaign.failed_count)
    const status = trimNullable(campaign.status) || CAMPAIGN_STATUS.draft

    if (!total) return 0

    if (status === CAMPAIGN_STATUS.awaiting_reply || status === CAMPAIGN_STATUS.done) {
      return Math.max(0, Math.min(100, Math.round((resolved / total) * 100)))
    }

    if (status === CAMPAIGN_STATUS.running) {
      const attempted = Math.max(0, total - pendingLogs)
      return Math.max(0, Math.min(100, Math.round((attempted / total) * 100)))
    }

    if (awaitingReply > 0) {
      return Math.max(0, Math.min(100, Math.round((resolved / total) * 100)))
    }

    return Math.max(0, Math.min(100, Math.round((resolved / total) * 100)))
  }

  function mapCampaign(row = {}) {
    return {
      id: toNumber(row.id),
      name: trimNullable(row.name) || '',
      message: trimNullable(row.message) || '',
      list_id: toNumber(row.list_id),
      list_name: trimNullable(row.list_name),
      status: trimNullable(row.status) || CAMPAIGN_STATUS.draft,
      scheduled_at: row.scheduled_at || null,
      started_at: row.started_at || null,
      finished_at: row.finished_at || null,
      total_contacts: toNumber(row.total_contacts),
      sent_count: toNumber(row.sent_count),
      failed_count: toNumber(row.failed_count),
      pending_logs_count: toNumber(row.pending_logs_count),
      awaiting_reply_count: toNumber(row.awaiting_reply_count),
      completed_count: toNumber(row.completed_count),
      no_response_count: toNumber(row.no_response_count),
      created_at: row.created_at || null,
      progress_percent: buildCampaignProgress(row),
    }
  }

  function mapTemplate(row = {}) {
    return {
      id: toNumber(row.id),
      name: trimNullable(row.name) || '',
      content: trimNullable(row.content) || '',
      created_at: row.created_at || null,
    }
  }

  function mapLog(row = {}) {
    return {
      id: toNumber(row.id),
      campaign_id: toNumber(row.campaign_id),
      phone: trimNullable(row.phone) || '',
      client_name: trimNullable(row.client_name),
      status: trimNullable(row.status) || LOG_STATUS.pending,
      error_message: trimNullable(row.error_message),
      sent_at: row.sent_at || null,
      last_message_sent_at: row.last_message_sent_at || null,
      greeting_sent_at: row.greeting_sent_at || null,
      reply_received_at: row.reply_received_at || null,
      main_message_sent_at: row.main_message_sent_at || null,
      expires_at: row.expires_at || null,
      interaction_status: trimNullable(row.interaction_status),
      created_at: row.created_at || null,
    }
  }

  function buildRetryListName(sourceCampaignName, reference = nowProvider()) {
    const stamp = new Date(reference).toISOString().slice(0, 16).replace('T', ' ').replace(':', 'h')
    return truncateToMaxLength(`Falhas - ${trimNullable(sourceCampaignName) || 'Campanha'} - ${stamp}`, 255)
  }

  function buildRetryListDescription(sourceCampaignId, retryCount, reference = nowProvider()) {
    const stamp = new Date(reference).toISOString()
    return truncateToMaxLength(
      `Lista gerada automaticamente a partir das falhas da campanha #${toNumber(sourceCampaignId)} em ${stamp}. Contatos reaproveitados: ${toNumber(retryCount)}.`,
      2000,
    )
  }

  function buildRetryCampaignName(sourceCampaignName) {
    return truncateToMaxLength(`Reenvio - ${trimNullable(sourceCampaignName) || 'Campanha'}`, 255)
  }

  function campaignLogSummaryJoinSql() {
    return `
      LEFT JOIN (
        SELECT
          campaign_id,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_logs_count,
          COUNT(*) FILTER (WHERE status IN ('greeting_sent', 'replied'))::int AS awaiting_reply_count,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
          COUNT(*) FILTER (WHERE status = 'no_response')::int AS no_response_count
        FROM broadcast_logs
        GROUP BY campaign_id
      ) log_summary ON log_summary.campaign_id = c.id
    `
  }

  function campaignSelectColumnsSql() {
    return `
      c.id,
      c.name,
      c.message,
      c.list_id,
      l.name AS list_name,
      c.status,
      c.scheduled_at,
      c.started_at,
      c.finished_at,
      c.total_contacts,
      c.sent_count,
      c.failed_count,
      c.created_at,
      COALESCE(log_summary.pending_logs_count, 0)::int AS pending_logs_count,
      COALESCE(log_summary.awaiting_reply_count, 0)::int AS awaiting_reply_count,
      COALESCE(log_summary.completed_count, 0)::int AS completed_count,
      COALESCE(log_summary.no_response_count, 0)::int AS no_response_count
    `
  }

  async function ensureListExists(listId) {
    const rows = await query(
      `
        SELECT id, name, description, created_at
        FROM broadcast_lists
        WHERE id = $1
        LIMIT 1
      `,
      listId,
    )
    const row = rows?.[0] || null
    if (!row) {
      throw new AppError(404, 'Lista de disparo nao encontrada.')
    }

    return row
  }

  async function ensureTemplateExists(templateId) {
    const rows = await query(
      `
        SELECT id
        FROM broadcast_templates
        WHERE id = $1
        LIMIT 1
      `,
      templateId,
    )
    if (!rows?.[0]) {
      throw new AppError(404, 'Template nao encontrado.')
    }
  }

  async function ensureCampaignExists(campaignId) {
    const rows = await query(
      `
        SELECT
          ${campaignSelectColumnsSql()}
        FROM broadcast_campaigns c
        LEFT JOIN broadcast_lists l ON l.id = c.list_id
        ${campaignLogSummaryJoinSql()}
        WHERE c.id = $1
        LIMIT 1
      `,
      campaignId,
    )
    const row = rows?.[0] || null
    if (!row) {
      throw new AppError(404, 'Campanha nao encontrada.')
    }

    return row
  }

  function clearScheduledTimer(campaignId) {
    const active = scheduledTimers.get(campaignId)
    if (!active) return
    clearTimeoutFn(active.timeoutId)
    scheduledTimers.delete(campaignId)
  }

  function clearInteractionTimer(interactionId) {
    const active = interactionTimers.get(interactionId)
    if (!active) return
    clearTimeoutFn(active.timeoutId)
    interactionTimers.delete(interactionId)
  }

  function scheduleCampaignTimer(campaignId, scheduledAt) {
    clearScheduledTimer(campaignId)

    const targetAt = new Date(scheduledAt)
    if (!Number.isFinite(targetAt.getTime())) return

    const armNextTimeout = () => {
      const remaining = targetAt.getTime() - nowProvider().getTime()
      const nextDelay = Math.min(Math.max(remaining, 0), MAX_TIMEOUT_MS)

      const timeoutId = setTimeoutFn(async () => {
        if (remaining > MAX_TIMEOUT_MS) {
          armNextTimeout()
          return
        }

        scheduledTimers.delete(campaignId)

        try {
          await startCampaign(campaignId, { source: 'scheduled' })
        } catch (error) {
          logger.error?.('[broadcast] Falha ao iniciar campanha agendada:', error?.message || error)
          try {
            await execute(
              `
                UPDATE broadcast_campaigns
                SET status = $2,
                    finished_at = NOW()
                WHERE id = $1
                  AND status = $3
              `,
              campaignId,
              CAMPAIGN_STATUS.failed,
              CAMPAIGN_STATUS.scheduled,
            )
          } catch (persistError) {
            logger.error?.('[broadcast] Falha ao registrar erro de campanha agendada:', persistError?.message || persistError)
          }
        }
      }, nextDelay)

      scheduledTimers.set(campaignId, { timeoutId, scheduled_at: targetAt.toISOString() })
    }

    armNextTimeout()
  }

  async function updateInteractionLogStatus(logId, status, errorMessage = null) {
    await execute(
      `
        UPDATE broadcast_logs
        SET status = $2,
            error_message = $3
        WHERE id = $1
      `,
      logId,
      status,
      errorMessage,
    )
  }

  async function expireInteraction(interactionId) {
    clearInteractionTimer(interactionId)

    const rows = await query(
      `
        SELECT id, campaign_id, log_id
        FROM broadcast_interactions
        WHERE id = $1
          AND status = $2
        LIMIT 1
      `,
      interactionId,
      INTERACTION_STATUS.greeting_sent,
    )

    const interaction = rows?.[0] || null
    if (!interaction) return false

    const errorMessage = 'Cliente nao respondeu ao cumprimento em ate 24 horas.'

    await execute(
      `
        UPDATE broadcast_interactions
        SET status = $2,
            expired_at = NOW(),
            expires_at = NULL,
            error_message = $3,
            updated_at = NOW()
        WHERE id = $1
      `,
      interactionId,
      INTERACTION_STATUS.no_response,
      errorMessage,
    )

    await updateInteractionLogStatus(toNumber(interaction.log_id), LOG_STATUS.no_response, errorMessage)
    await syncCampaignLifecycle(toNumber(interaction.campaign_id))
    return true
  }

  function scheduleInteractionTimer(interactionId, expiresAt) {
    clearInteractionTimer(interactionId)

    const targetAt = new Date(expiresAt)
    if (!Number.isFinite(targetAt.getTime())) return

    const armNextTimeout = () => {
      const remaining = targetAt.getTime() - nowProvider().getTime()
      const nextDelay = Math.min(Math.max(remaining, 0), MAX_TIMEOUT_MS)

      const timeoutId = setTimeoutFn(async () => {
        if (remaining > MAX_TIMEOUT_MS) {
          armNextTimeout()
          return
        }

        interactionTimers.delete(interactionId)

        try {
          await expireInteraction(interactionId)
        } catch (error) {
          logger.error?.('[broadcast] Falha ao expirar interacao pendente:', error?.message || error)
        }
      }, nextDelay)

      interactionTimers.set(interactionId, {
        timeoutId,
        expires_at: targetAt.toISOString(),
      })
    }

    armNextTimeout()
  }

  async function bootstrapPendingInteractions() {
    const expiredRows = await query(
      `
        SELECT id
        FROM broadcast_interactions
        WHERE status = $1
          AND expires_at IS NOT NULL
          AND expires_at <= NOW()
      `,
      INTERACTION_STATUS.greeting_sent,
    )

    for (const interaction of expiredRows || []) {
      await expireInteraction(toNumber(interaction.id))
    }

    const pendingRows = await query(
      `
        SELECT id, expires_at
        FROM broadcast_interactions
        WHERE status = $1
          AND expires_at IS NOT NULL
          AND expires_at > NOW()
      `,
      INTERACTION_STATUS.greeting_sent,
    )

    for (const interaction of pendingRows || []) {
      scheduleInteractionTimer(toNumber(interaction.id), interaction.expires_at)
    }
  }

  async function clearCampaignInteractionTimers(campaignId) {
    const rows = await query(
      `
        SELECT id
        FROM broadcast_interactions
        WHERE campaign_id = $1
      `,
      campaignId,
    )

    for (const interaction of rows || []) {
      clearInteractionTimer(toNumber(interaction.id))
    }
  }

  async function bootstrapScheduledCampaigns() {
    if (bootstrapPromise) return bootstrapPromise

    bootstrapPromise = (async () => {
      await normalizeLegacyMemberPhonesOnce()

      const scheduledCampaigns = await query(
        `
          SELECT id, scheduled_at
          FROM broadcast_campaigns
          WHERE status = $1
            AND scheduled_at IS NOT NULL
        `,
        CAMPAIGN_STATUS.scheduled,
      )

      for (const campaign of scheduledCampaigns || []) {
        scheduleCampaignTimer(toNumber(campaign.id), campaign.scheduled_at)
      }

      await bootstrapPendingInteractions()

      const activeCampaigns = await query(
        `
        SELECT id
        FROM broadcast_campaigns
        WHERE status IN ($1, $2, $3, $4)
        `,
        CAMPAIGN_STATUS.running,
        CAMPAIGN_STATUS.awaiting_reply,
        CAMPAIGN_STATUS.done,
        CAMPAIGN_STATUS.failed,
      )

      for (const campaign of activeCampaigns || []) {
        const campaignId = toNumber(campaign.id)
        const nextStatus = await syncCampaignLifecycle(campaignId)

        if (nextStatus === CAMPAIGN_STATUS.running && !runningCampaigns.has(campaignId)) {
          runningCampaigns.set(campaignId, {
            started_at: nowProvider().toISOString(),
            source: 'recovery',
          })

          setTimeoutFn(() => {
            runCampaign(campaignId).catch((error) => {
              logger.error?.('[broadcast] Falha ao retomar campanha apos reinicio:', error?.message || error)
            })
          }, 0)
        }
      }
    })()

    try {
      await bootstrapPromise
    } finally {
      bootstrapPromise = null
    }
  }

  async function normalizeLegacyMemberPhonesOnce() {
    if (memberPhoneNormalizationDone) return
    if (memberPhoneNormalizationPromise) {
      await memberPhoneNormalizationPromise
      return
    }

    memberPhoneNormalizationPromise = (async () => {
      const rows = await query(
        `
          SELECT id, list_id, client_phone
          FROM broadcast_list_members
          ORDER BY id ASC
        `,
      )

      if (!rows?.length) {
        memberPhoneNormalizationDone = true
        return
      }

      const targetGroups = new Map()

      for (const row of rows) {
        const currentPhone = trimNullable(row.client_phone) || ''
        const normalizedPhone = normalizeMemberPhone(currentPhone)

        if (!currentPhone || !normalizedPhone) continue

        const key = `${toNumber(row.list_id)}:${normalizedPhone}`
        const group = targetGroups.get(key) || []
        group.push({
          id: toNumber(row.id),
          list_id: toNumber(row.list_id),
          currentPhone,
          normalizedPhone,
          needsUpdate: currentPhone !== normalizedPhone,
        })
        targetGroups.set(key, group)
      }

      let updatedCount = 0
      let skippedCount = 0

      for (const group of targetGroups.values()) {
        const candidates = group.filter((item) => item.needsUpdate)
        if (!candidates.length) continue

        if (group.length > 1) {
          skippedCount += candidates.length
          continue
        }

        const candidate = candidates[0]
        await execute(
          `
            UPDATE broadcast_list_members
            SET client_phone = $2
            WHERE id = $1
          `,
          candidate.id,
          candidate.normalizedPhone,
        )
        updatedCount += 1
      }

      if (updatedCount || skippedCount) {
        logger.info?.(
          `[broadcast] Normalizacao de telefones dos membros concluida. Atualizados: ${updatedCount}. Ignorados: ${skippedCount}.`,
        )
      }

      memberPhoneNormalizationDone = true
    })()

    try {
      await memberPhoneNormalizationPromise
    } finally {
      memberPhoneNormalizationPromise = null
    }
  }

  async function listLists() {
    await bootstrapScheduledCampaigns()

    const rows = await query(
      `
        SELECT
          l.id,
          l.name,
          l.description,
          l.created_at,
          COUNT(m.id)::int AS member_count
        FROM broadcast_lists l
        LEFT JOIN broadcast_list_members m ON m.list_id = l.id
        GROUP BY l.id
        ORDER BY l.created_at DESC, l.id DESC
      `,
    )

    return (rows || []).map(mapList)
  }

  async function createList(payload) {
    const rows = await query(
      `
        INSERT INTO broadcast_lists (name, description)
        VALUES ($1, $2)
        RETURNING id, name, description, created_at
      `,
      payload.name,
      payload.description,
    )

    return mapList({ ...(rows?.[0] || {}), member_count: 0 })
  }

  async function removeList(listId) {
    const list = await ensureListExists(listId)
    const campaignRows = await query(
      `
        SELECT COUNT(*)::int AS total
        FROM broadcast_campaigns
        WHERE list_id = $1
      `,
      listId,
    )
    const linkedCampaigns = toNumber(campaignRows?.[0]?.total)

    if (linkedCampaigns > 0) {
      throw new AppError(
        409,
        `Nao e possivel excluir a lista "${trimNullable(list.name) || 'selecionada'}" porque ela esta vinculada a ${linkedCampaigns} campanha(s). Exclua as campanhas relacionadas primeiro.`,
      )
    }

    await execute(
      `
        DELETE FROM broadcast_lists
        WHERE id = $1
      `,
      listId,
    )

    return { removed: true, id: listId }
  }

  async function countListMembers(listId) {
    const rows = await query(
      `
        SELECT COUNT(*)::int AS total
        FROM broadcast_list_members
        WHERE list_id = $1
      `,
      listId,
    )

    return toNumber(rows?.[0]?.total)
  }

  async function listMembers(listId, options = {}) {
    await normalizeLegacyMemberPhonesOnce()
    await ensureListExists(listId)
    const { limit, offset } = normalizePagination(options)
    const total = await countListMembers(listId)

    const rows = await query(
      `
        SELECT id, list_id, client_phone, client_name, added_at
        FROM broadcast_list_members
        WHERE list_id = $1
        ORDER BY COALESCE(NULLIF(TRIM(client_name), ''), client_phone) ASC, id ASC
        LIMIT $2
        OFFSET $3
      `,
      listId,
      limit,
      offset,
    )

    const items = (rows || []).map(mapMember)
    return {
      items,
      meta: buildPaginationMeta(total, limit, offset, items.length),
    }
  }

  async function addMember(listId, payload) {
    await ensureListExists(listId)

    const rows = await query(
      `
        INSERT INTO broadcast_list_members (list_id, client_phone, client_name)
        VALUES ($1, $2, $3)
        RETURNING id, list_id, client_phone, client_name, added_at
      `,
      listId,
      payload.phone,
      payload.name,
    )

    return mapMember(rows?.[0] || {})
  }

  async function removeMember(listId, phone) {
    await normalizeLegacyMemberPhonesOnce()
    await ensureListExists(listId)

    const exactPhone = trimNullable(phone) || ''
    const normalizedPhone = normalizeMemberPhone(phone)
    const variants = buildMemberPhoneVariants(phone)

    const memberRows = variants.length
      ? await query(
        `
          SELECT id, client_phone
          FROM broadcast_list_members
          WHERE list_id = $1
            AND client_phone IN (${variants.map((_, index) => `$${index + 4}`).join(', ')})
          ORDER BY
            CASE
              WHEN client_phone = $2 THEN 0
              WHEN client_phone = $3 THEN 1
              ELSE 2
            END,
            id ASC
          LIMIT 1
        `,
        listId,
        exactPhone,
        normalizedPhone,
        ...variants,
      )
      : []

    const memberId = toNumber(memberRows?.[0]?.id)
    if (!memberId) {
      throw new AppError(404, 'Contato nao encontrado nesta lista.')
    }

    const removed = await execute(
      `
        DELETE FROM broadcast_list_members
        WHERE list_id = $1
          AND id = $2
      `,
      listId,
      memberId,
    )

    if (!removed) {
      throw new AppError(404, 'Contato nao encontrado nesta lista.')
    }

    return { removed: true, list_id: listId, phone: trimNullable(memberRows?.[0]?.client_phone) || phone }
  }

  async function importClients(listId) {
    await normalizeLegacyMemberPhonesOnce()
    await ensureListExists(listId)

    const inserted = await execute(
      `
        INSERT INTO broadcast_list_members (list_id, client_phone, client_name)
        SELECT
          $1,
          CASE
            WHEN COALESCE(NULLIF(REGEXP_REPLACE(c.telefone_whatsapp, '\\D', '', 'g'), ''), '') = '' THEN ''
            WHEN REGEXP_REPLACE(c.telefone_whatsapp, '\\D', '', 'g') LIKE '55%'
              AND LENGTH(REGEXP_REPLACE(c.telefone_whatsapp, '\\D', '', 'g')) IN (12, 13)
              THEN REGEXP_REPLACE(c.telefone_whatsapp, '\\D', '', 'g')
            WHEN LENGTH(REGEXP_REPLACE(c.telefone_whatsapp, '\\D', '', 'g')) IN (10, 11)
              THEN '55' || REGEXP_REPLACE(c.telefone_whatsapp, '\\D', '', 'g')
            ELSE REGEXP_REPLACE(c.telefone_whatsapp, '\\D', '', 'g')
          END,
          c.nome
        FROM clientes c
        WHERE COALESCE(NULLIF(TRIM(c.telefone_whatsapp), ''), '') <> ''
          AND COALESCE(
            NULLIF(
              CASE
                WHEN COALESCE(NULLIF(REGEXP_REPLACE(c.telefone_whatsapp, '\\D', '', 'g'), ''), '') = '' THEN ''
                WHEN REGEXP_REPLACE(c.telefone_whatsapp, '\\D', '', 'g') LIKE '55%'
                  AND LENGTH(REGEXP_REPLACE(c.telefone_whatsapp, '\\D', '', 'g')) IN (12, 13)
                  THEN REGEXP_REPLACE(c.telefone_whatsapp, '\\D', '', 'g')
                WHEN LENGTH(REGEXP_REPLACE(c.telefone_whatsapp, '\\D', '', 'g')) IN (10, 11)
                  THEN '55' || REGEXP_REPLACE(c.telefone_whatsapp, '\\D', '', 'g')
                ELSE REGEXP_REPLACE(c.telefone_whatsapp, '\\D', '', 'g')
              END,
              ''
            ),
            ''
          ) <> ''
        ON CONFLICT (list_id, client_phone) DO NOTHING
      `,
      listId,
    )

    return {
      imported_count: toNumber(inserted),
      total_members: await countListMembers(listId),
    }
  }

  async function listTemplates() {
    const rows = await query(
      `
        SELECT id, name, content, created_at
        FROM broadcast_templates
        ORDER BY created_at DESC, id DESC
      `,
    )

    return (rows || []).map(mapTemplate)
  }

  async function createTemplate(payload) {
    const rows = await query(
      `
        INSERT INTO broadcast_templates (name, content)
        VALUES ($1, $2)
        RETURNING id, name, content, created_at
      `,
      payload.name,
      payload.content,
    )

    return mapTemplate(rows?.[0] || {})
  }

  async function removeTemplate(templateId) {
    await ensureTemplateExists(templateId)

    await execute(
      `
        DELETE FROM broadcast_templates
        WHERE id = $1
      `,
      templateId,
    )

    return { removed: true, id: templateId }
  }

  async function listCampaigns() {
    await bootstrapScheduledCampaigns()

    const rows = await query(
      `
        SELECT
          ${campaignSelectColumnsSql()}
        FROM broadcast_campaigns c
        LEFT JOIN broadcast_lists l ON l.id = c.list_id
        ${campaignLogSummaryJoinSql()}
        ORDER BY c.created_at DESC, c.id DESC
      `,
    )

    return (rows || []).map(mapCampaign)
  }

  async function createCampaign(payload) {
    await ensureListExists(payload.list_id)

    const now = nowProvider()
    const shouldSchedule = payload.scheduled_at && payload.scheduled_at.getTime() > now.getTime()
    const status = shouldSchedule ? CAMPAIGN_STATUS.scheduled : CAMPAIGN_STATUS.draft
    const scheduledAt = shouldSchedule ? payload.scheduled_at : null

    const rows = await query(
      `
        INSERT INTO broadcast_campaigns (name, message, list_id, status, scheduled_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, message, list_id, status, scheduled_at, started_at, finished_at, total_contacts, sent_count, failed_count, created_at
      `,
      payload.name,
      payload.message,
      payload.list_id,
      status,
      scheduledAt,
    )

    const campaign = mapCampaign(rows?.[0] || {})

    if (campaign.status === CAMPAIGN_STATUS.scheduled && campaign.scheduled_at) {
      scheduleCampaignTimer(campaign.id, campaign.scheduled_at)
    }

    return {
      ...campaign,
      list_name: trimNullable((await ensureListExists(payload.list_id)).name),
    }
  }

  async function getCampaign(campaignId) {
    const row = await ensureCampaignExists(campaignId)
    return mapCampaign(row)
  }

  async function countCampaignLogs(campaignId) {
    const rows = await query(
      `
        SELECT COUNT(*)::int AS total
        FROM broadcast_logs
        WHERE campaign_id = $1
      `,
      campaignId,
    )

    return toNumber(rows?.[0]?.total)
  }

  async function getCampaignLogs(campaignId, options = {}) {
    await ensureCampaignExists(campaignId)
    const { limit, offset } = normalizePagination(options)
    const total = await countCampaignLogs(campaignId)

    const rows = await query(
      `
        SELECT
          l.id,
          l.campaign_id,
          l.phone,
          l.client_name,
          l.status,
          l.error_message,
          l.sent_at,
          l.created_at,
          i.last_message_sent_at,
          i.greeting_sent_at,
          i.reply_received_at,
          i.main_message_sent_at,
          i.expires_at,
          i.status AS interaction_status
        FROM broadcast_logs l
        LEFT JOIN broadcast_interactions i ON i.log_id = l.id
        WHERE l.campaign_id = $1
        ORDER BY l.id ASC
        LIMIT $2
        OFFSET $3
      `,
      campaignId,
      limit,
      offset,
    )

    const items = (rows || []).map(mapLog)
    return {
      items,
      meta: buildPaginationMeta(total, limit, offset, items.length),
    }
  }

  async function prepareCampaignRun(campaignId, { preserveScheduledAt = false } = {}) {
    const campaign = await ensureCampaignExists(campaignId)

    if (campaign.status === CAMPAIGN_STATUS.running) {
      throw new AppError(409, 'Esta campanha ja esta em execucao.')
    }

    if (campaign.status === CAMPAIGN_STATUS.awaiting_reply) {
      throw new AppError(409, 'Esta campanha ainda esta aguardando respostas dos contatos.')
    }

    if (campaign.status === CAMPAIGN_STATUS.done) {
      throw new AppError(409, 'Esta campanha ja foi concluida.')
    }

    ensureWhatsAppTransport()

    const members = await query(
      `
        SELECT id, client_phone, client_name
        FROM broadcast_list_members
        WHERE list_id = $1
        ORDER BY added_at ASC, id ASC
      `,
      campaign.list_id,
    )

    if (!members?.length) {
      throw new AppError(400, 'A lista vinculada nao possui contatos para disparo.')
    }

    await clearCampaignInteractionTimers(campaignId)

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `
          DELETE FROM broadcast_interactions
          WHERE campaign_id = $1
        `,
        campaignId,
      )

      await tx.$executeRawUnsafe(
        `
          DELETE FROM broadcast_logs
          WHERE campaign_id = $1
        `,
        campaignId,
      )

      await tx.$executeRawUnsafe(
        `
          INSERT INTO broadcast_logs (campaign_id, phone, client_name, status)
          SELECT
            $1,
            client_phone,
            client_name,
            $2
          FROM broadcast_list_members
          WHERE list_id = $3
          ORDER BY added_at ASC, id ASC
        `,
        campaignId,
        LOG_STATUS.pending,
        campaign.list_id,
      )

      await tx.$executeRawUnsafe(
        `
          UPDATE broadcast_campaigns
          SET status = $2,
              started_at = NOW(),
              finished_at = NULL,
              total_contacts = $3,
              sent_count = 0,
              failed_count = 0,
              scheduled_at = CASE WHEN $4::boolean THEN scheduled_at ELSE NULL END
          WHERE id = $1
        `,
        campaignId,
        CAMPAIGN_STATUS.running,
        members.length,
        preserveScheduledAt,
      )
    })
  }

  async function finalizeCampaign(campaignId, status) {
    await execute(
      `
        UPDATE broadcast_campaigns
        SET status = $2,
            finished_at = NOW()
        WHERE id = $1
      `,
      campaignId,
      status,
    )
  }

  async function summarizeCampaignLogs(campaignId) {
    const rows = await query(
      `
        SELECT
          COUNT(*) FILTER (WHERE status = $2)::int AS pending_logs_count,
          COUNT(*) FILTER (WHERE status IN ($3, $4))::int AS awaiting_reply_count,
          COUNT(*) FILTER (WHERE status = $5)::int AS completed_count,
          COUNT(*) FILTER (WHERE status = $6)::int AS no_response_count,
          COUNT(*) FILTER (WHERE status = $7)::int AS failed_logs_count,
          COUNT(*)::int AS total_logs_count
        FROM broadcast_logs
        WHERE campaign_id = $1
      `,
      campaignId,
      LOG_STATUS.pending,
      LOG_STATUS.greeting_sent,
      LOG_STATUS.replied,
      LOG_STATUS.completed,
      LOG_STATUS.no_response,
      LOG_STATUS.failed,
    )

    return rows?.[0] || {}
  }

  async function syncCampaignLifecycle(campaignId) {
    const summary = await summarizeCampaignLogs(campaignId)
    const pendingLogs = toNumber(summary.pending_logs_count)
    const awaitingReply = toNumber(summary.awaiting_reply_count)
    const totalLogs = toNumber(summary.total_logs_count)

    let nextStatus = CAMPAIGN_STATUS.done
    if (!totalLogs) {
      nextStatus = CAMPAIGN_STATUS.draft
    } else if (pendingLogs > 0) {
      nextStatus = CAMPAIGN_STATUS.running
    } else if (awaitingReply > 0) {
      nextStatus = CAMPAIGN_STATUS.awaiting_reply
    }

    const shouldRemainOpen = [CAMPAIGN_STATUS.running, CAMPAIGN_STATUS.awaiting_reply].includes(nextStatus)

    await execute(
      `
        UPDATE broadcast_campaigns
        SET status = $2,
            finished_at = CASE
              WHEN $3::boolean THEN NULL
              ELSE COALESCE(finished_at, NOW())
            END
        WHERE id = $1
      `,
      campaignId,
      nextStatus,
      shouldRemainOpen,
    )

    return nextStatus
  }

  async function updateLogStatus(campaignId, logId, payload = {}) {
    const status = payload.status || LOG_STATUS.failed
    const errorMessage = trimNullable(payload.error_message)
    const shouldSetSentAt = isGreetingDispatchStatus(status)

    await execute(
      `
        UPDATE broadcast_logs
        SET status = $3,
            error_message = $4,
            sent_at = CASE WHEN $5::boolean THEN NOW() ELSE sent_at END
        WHERE campaign_id = $1
          AND id = $2
      `,
      campaignId,
      logId,
      status,
      errorMessage,
      shouldSetSentAt,
    )

    if (isGreetingDispatchStatus(status)) {
      await execute(
        `
          UPDATE broadcast_campaigns
          SET sent_count = sent_count + 1
          WHERE id = $1
        `,
        campaignId,
      )
      return
    }

    await execute(
      `
        UPDATE broadcast_campaigns
        SET failed_count = failed_count + 1
        WHERE id = $1
      `,
      campaignId,
    )
  }

  function formatDeliveryError(error) {
    if (error instanceof AppError) {
      return error.message
    }

    return trimNullable(error?.message) || 'Falha ao enviar mensagem.'
  }

  async function recordGreetingInteraction({
    campaignId,
    logId,
    phone,
    clientName,
    greetingMessage,
    mainMessage,
  }) {
    const sentAt = nowProvider()
    const expiresAt = buildInteractionExpiryDate(sentAt)
    const rows = await query(
      `
        INSERT INTO broadcast_interactions (
          campaign_id,
          log_id,
          phone_number,
          client_name,
          greeting_message,
          main_message,
          status,
          last_message_sent_at,
          greeting_sent_at,
          expires_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, NOW(), NOW())
        ON CONFLICT (log_id) DO UPDATE
        SET campaign_id = EXCLUDED.campaign_id,
            phone_number = EXCLUDED.phone_number,
            client_name = EXCLUDED.client_name,
            greeting_message = EXCLUDED.greeting_message,
            main_message = EXCLUDED.main_message,
            status = EXCLUDED.status,
            last_message_sent_at = EXCLUDED.last_message_sent_at,
            greeting_sent_at = EXCLUDED.greeting_sent_at,
            reply_received_at = NULL,
            main_message_sent_at = NULL,
            expires_at = EXCLUDED.expires_at,
            expired_at = NULL,
            completed_at = NULL,
            reply_message = NULL,
            error_message = NULL,
            updated_at = NOW()
        RETURNING id, expires_at
      `,
      campaignId,
      logId,
      phone,
      clientName,
      greetingMessage,
      mainMessage,
      INTERACTION_STATUS.greeting_sent,
      sentAt,
      expiresAt,
    )

    return rows?.[0] || null
  }

  async function recordFailedInteraction({
    campaignId,
    logId,
    phone,
    clientName,
    mainMessage,
    errorMessage,
    greetingMessage = null,
  }) {
    const rows = await query(
      `
        INSERT INTO broadcast_interactions (
          campaign_id,
          log_id,
          phone_number,
          client_name,
          greeting_message,
          main_message,
          status,
          error_message,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (log_id) DO UPDATE
        SET campaign_id = EXCLUDED.campaign_id,
            phone_number = EXCLUDED.phone_number,
            client_name = EXCLUDED.client_name,
            greeting_message = EXCLUDED.greeting_message,
            main_message = EXCLUDED.main_message,
            status = EXCLUDED.status,
            last_message_sent_at = NULL,
            greeting_sent_at = NULL,
            reply_received_at = NULL,
            main_message_sent_at = NULL,
            expires_at = NULL,
            expired_at = NULL,
            completed_at = NULL,
            reply_message = NULL,
            error_message = EXCLUDED.error_message,
            updated_at = NOW()
        RETURNING id
      `,
      campaignId,
      logId,
      phone,
      clientName,
      greetingMessage,
      mainMessage,
      INTERACTION_STATUS.failed,
      errorMessage,
    )

    return rows?.[0] || null
  }

  async function findOpenInteraction(values = []) {
    const variants = dedupeStrings(values.flatMap((value) => buildMemberPhoneVariants(value)))
    if (!variants.length) return null

    const rows = await query(
      `
        SELECT
          id,
          campaign_id,
          log_id,
          phone_number,
          client_name,
          main_message,
          status,
          expires_at
        FROM broadcast_interactions
        WHERE status IN ($1, $2)
          AND main_message_sent_at IS NULL
          AND phone_number IN (${variants.map((_, index) => `$${index + 3}`).join(', ')})
        ORDER BY
          CASE
            WHEN status = $1 THEN 0
            ELSE 1
          END,
          COALESCE(reply_received_at, greeting_sent_at, created_at) DESC,
          id DESC
        LIMIT 1
      `,
      INTERACTION_STATUS.greeting_sent,
      INTERACTION_STATUS.replied,
      ...variants,
    )

    const row = rows?.[0] || null
    if (!row) return null

    const isExpiredGreeting = (
      trimNullable(row.status) === INTERACTION_STATUS.greeting_sent
      && row.expires_at
      && new Date(row.expires_at).getTime() <= nowProvider().getTime()
    )

    if (isExpiredGreeting) {
      await expireInteraction(toNumber(row.id))
      return null
    }

    return row
  }

  async function markInteractionReplied(interactionId, logId, replyMessage) {
    await execute(
      `
        UPDATE broadcast_interactions
        SET status = $2,
            reply_received_at = COALESCE(reply_received_at, NOW()),
            reply_message = $3,
            expires_at = NULL,
            error_message = NULL,
            updated_at = NOW()
        WHERE id = $1
      `,
      interactionId,
      INTERACTION_STATUS.replied,
      trimNullable(replyMessage),
    )

    await updateInteractionLogStatus(logId, LOG_STATUS.replied, null)
  }

  async function markInteractionCompleted(interactionId, logId, campaignId) {
    await execute(
      `
        UPDATE broadcast_interactions
        SET status = $2,
            main_message_sent_at = NOW(),
            completed_at = NOW(),
            last_message_sent_at = NOW(),
            error_message = NULL,
            updated_at = NOW()
        WHERE id = $1
      `,
      interactionId,
      INTERACTION_STATUS.completed,
    )

    await updateInteractionLogStatus(logId, LOG_STATUS.completed, null)
    await syncCampaignLifecycle(campaignId)
  }

  async function markInteractionReplyDeliveryError(interactionId, logId, campaignId, errorMessage) {
    await execute(
      `
        UPDATE broadcast_interactions
        SET status = $2,
            error_message = $3,
            updated_at = NOW()
        WHERE id = $1
      `,
      interactionId,
      INTERACTION_STATUS.replied,
      errorMessage,
    )

    await updateInteractionLogStatus(logId, LOG_STATUS.replied, errorMessage)
    await syncCampaignLifecycle(campaignId)
  }

  async function processIncomingReply(payload = {}) {
    await bootstrapScheduledCampaigns()

    const lookupValues = dedupeStrings([
      ...(Array.isArray(payload.phones) ? payload.phones : []),
      payload.phone,
      payload.rawPhone,
    ])

    const interaction = await findOpenInteraction(lookupValues)
    if (!interaction) {
      return { matched: false }
    }

    const interactionId = toNumber(interaction.id)
    const logId = toNumber(interaction.log_id)
    const campaignId = toNumber(interaction.campaign_id)
    if (processingReplyInteractions.has(interactionId)) {
      return {
        matched: true,
        sent: false,
        skipped: true,
        interaction_id: interactionId,
        log_id: logId,
        campaign_id: campaignId,
      }
    }

    processingReplyInteractions.add(interactionId)
    clearInteractionTimer(interactionId)

    try {
      await markInteractionReplied(interactionId, logId, payload.message)

      ensureWhatsAppTransport()
      await whatsappTransport.sendTextMessage({
        to: payload.replyTarget || payload.rawPhone || payload.phone || interaction.phone_number,
        body: trimNullable(interaction.main_message) || '',
      })

      await markInteractionCompleted(interactionId, logId, campaignId)

      return {
        matched: true,
        sent: true,
        interaction_id: interactionId,
        log_id: logId,
        campaign_id: campaignId,
      }
    } catch (error) {
      const errorMessage = formatDeliveryError(error)
      await markInteractionReplyDeliveryError(interactionId, logId, campaignId, errorMessage)
      logger.error?.('[broadcast] Falha ao enviar mensagem principal apos resposta do cliente:', errorMessage)

      return {
        matched: true,
        sent: false,
        interaction_id: interactionId,
        log_id: logId,
        campaign_id: campaignId,
        error_message: errorMessage,
      }
    } finally {
      processingReplyInteractions.delete(interactionId)
    }
  }

  async function runCampaign(campaignId) {
    const execution = runningCampaigns.get(campaignId)
    if (!execution) return

    try {
      const campaign = await ensureCampaignExists(campaignId)
      const logs = await query(
        `
          SELECT id, phone, client_name
          FROM broadcast_logs
          WHERE campaign_id = $1
            AND status = $2
          ORDER BY id ASC
        `,
        campaignId,
        LOG_STATUS.pending,
      )

      for (let index = 0; index < (logs || []).length; index += 1) {
        const log = logs[index]

        if (!runningCampaigns.has(campaignId)) {
          return
        }

        const greetingMessage = chooseGreetingMessage(log.client_name)

        try {
          await whatsappTransport.sendTextMessage({
            to: log.phone,
            body: greetingMessage,
          })

          const interaction = await recordGreetingInteraction({
            campaignId,
            logId: log.id,
            phone: log.phone,
            clientName: log.client_name,
            greetingMessage,
            mainMessage: campaign.message,
          })

          if (interaction?.id && interaction?.expires_at) {
            scheduleInteractionTimer(toNumber(interaction.id), interaction.expires_at)
          }

          await updateLogStatus(campaignId, log.id, {
            status: LOG_STATUS.greeting_sent,
            error_message: null,
          })
        } catch (error) {
          const errorMessage = formatDeliveryError(error)
          await recordFailedInteraction({
            campaignId,
            logId: log.id,
            phone: log.phone,
            clientName: log.client_name,
            greetingMessage,
            mainMessage: campaign.message,
            errorMessage,
          })

          await updateLogStatus(campaignId, log.id, {
            status: LOG_STATUS.failed,
            error_message: errorMessage,
          })
        }

        if (index < logs.length - 1) {
          await sleep(getRandomDelayMs())
        }
      }

      await syncCampaignLifecycle(campaignId)
    } catch (error) {
      logger.error?.('[broadcast] Falha na execucao da campanha:', error?.message || error)
      await finalizeCampaign(campaignId, CAMPAIGN_STATUS.failed)
    } finally {
      runningCampaigns.delete(campaignId)
    }
  }

  async function startCampaign(campaignId, options = {}) {
    await bootstrapScheduledCampaigns()

    clearScheduledTimer(campaignId)

    if (runningCampaigns.has(campaignId)) {
      throw new AppError(409, 'Esta campanha ja esta em execucao.')
    }

    const preserveScheduledAt = options.source === 'scheduled'
    await prepareCampaignRun(campaignId, { preserveScheduledAt })

    runningCampaigns.set(campaignId, {
      started_at: nowProvider().toISOString(),
      source: options.source || 'manual',
    })

    setTimeoutFn(() => {
      runCampaign(campaignId).catch((error) => {
        logger.error?.('[broadcast] Falha inesperada ao disparar campanha:', error?.message || error)
      })
    }, 0)

    return getCampaign(campaignId)
  }

  async function cancelCampaign(campaignId) {
    const campaign = await ensureCampaignExists(campaignId)

    if (campaign.status !== CAMPAIGN_STATUS.scheduled) {
      throw new AppError(409, 'Somente campanhas agendadas podem ser canceladas.')
    }

    clearScheduledTimer(campaignId)

    await execute(
      `
        UPDATE broadcast_campaigns
        SET status = $2,
            scheduled_at = NULL
        WHERE id = $1
      `,
      campaignId,
      CAMPAIGN_STATUS.draft,
    )

    return getCampaign(campaignId)
  }

  async function retryFailedCampaign(campaignId) {
    const sourceCampaign = await ensureCampaignExists(campaignId)

    if ([CAMPAIGN_STATUS.running, CAMPAIGN_STATUS.awaiting_reply].includes(sourceCampaign.status) || runningCampaigns.has(campaignId)) {
      throw new AppError(409, 'Aguarde a campanha terminar antes de reenviar as falhas.')
    }

    const failedRows = await query(
      `
        SELECT phone, client_name
        FROM broadcast_logs
        WHERE campaign_id = $1
          AND status = $2
          AND COALESCE(NULLIF(TRIM(phone), ''), '') <> ''
        ORDER BY id DESC
      `,
      campaignId,
      LOG_STATUS.failed,
    )

    const contactsByPhone = new Map()
    for (const row of failedRows || []) {
      const phone = normalizeMemberPhone(row.phone)
      if (!phone || contactsByPhone.has(phone)) continue
      contactsByPhone.set(phone, {
        phone,
        name: trimNullable(row.client_name),
      })
    }

    const contacts = Array.from(contactsByPhone.values())
    if (!contacts.length) {
      throw new AppError(409, 'Esta campanha nao possui falhas para reenviar.')
    }

    const reference = nowProvider()
    const retryListName = buildRetryListName(sourceCampaign.name, reference)
    const retryListDescription = buildRetryListDescription(campaignId, contacts.length, reference)
    const retryCampaignName = buildRetryCampaignName(sourceCampaign.name)

    const created = await prisma.$transaction(async (tx) => {
      const listRows = await tx.$queryRawUnsafe(
        `
          INSERT INTO broadcast_lists (name, description)
          VALUES ($1, $2)
          RETURNING id, name, description, created_at
        `,
        retryListName,
        retryListDescription,
      )

      const list = mapList({ ...(listRows?.[0] || {}), member_count: contacts.length })

      const membersValuesSql = contacts
        .map((_, index) => `($1, $${index * 2 + 2}, $${index * 2 + 3})`)
        .join(', ')

      await tx.$executeRawUnsafe(
        `
          INSERT INTO broadcast_list_members (list_id, client_phone, client_name)
          VALUES ${membersValuesSql}
        `,
        list.id,
        ...contacts.flatMap((contact) => [contact.phone, contact.name]),
      )

      const campaignRows = await tx.$queryRawUnsafe(
        `
          INSERT INTO broadcast_campaigns (name, message, list_id, status, scheduled_at)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, name, message, list_id, status, scheduled_at, started_at, finished_at, total_contacts, sent_count, failed_count, created_at
        `,
        retryCampaignName,
        trimNullable(sourceCampaign.message) || '',
        list.id,
        CAMPAIGN_STATUS.draft,
        null,
      )

      return {
        list,
        campaign: {
          ...mapCampaign(campaignRows?.[0] || {}),
          list_name: list.name,
        },
      }
    })

    return {
      source_campaign_id: campaignId,
      retry_contacts_count: contacts.length,
      created_list: created.list,
      created_campaign: created.campaign,
    }
  }

  async function removeCampaign(campaignId) {
    const campaign = await ensureCampaignExists(campaignId)

    if ([CAMPAIGN_STATUS.running, CAMPAIGN_STATUS.awaiting_reply].includes(campaign.status) || runningCampaigns.has(campaignId)) {
      throw new AppError(409, 'Nao e possivel excluir uma campanha com fluxo ainda em andamento.')
    }

    clearScheduledTimer(campaignId)
    await clearCampaignInteractionTimers(campaignId)

    await execute(
      `
        DELETE FROM broadcast_campaigns
        WHERE id = $1
      `,
      campaignId,
    )

    return { removed: true, id: campaignId }
  }

  if (hasRawQuerySupport()) {
    void bootstrapScheduledCampaigns().catch((error) => {
      logger.error?.('[broadcast] Falha ao inicializar campanhas agendadas:', error?.message || error)
    })
  }

  return {
    listLists,
    createList,
    removeList,
    listMembers,
    addMember,
    removeMember,
    importClients,
    listTemplates,
    createTemplate,
    removeTemplate,
    listCampaigns,
    createCampaign,
    getCampaign,
    getCampaignLogs,
    startCampaign,
    processIncomingReply,
    cancelCampaign,
    retryFailedCampaign,
    removeCampaign,
  }
}

module.exports = { createBroadcastService, CAMPAIGN_STATUS, LOG_STATUS, INTERACTION_STATUS }
