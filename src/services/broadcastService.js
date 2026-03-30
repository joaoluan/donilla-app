const { AppError } = require('../utils/errors')
const { getPhoneSearchVariants, normalizeWhatsAppPhone } = require('../utils/phone')

const CAMPAIGN_STATUS = {
  draft: 'draft',
  scheduled: 'scheduled',
  running: 'running',
  done: 'done',
  failed: 'failed',
}

const LOG_STATUS = {
  pending: 'pending',
  sent: 'sent',
  failed: 'failed',
}

const MIN_DELAY_MS = 3000
const MAX_DELAY_MS = 6000
const MAX_TIMEOUT_MS = 2_147_483_647

function createBroadcastService(prisma, deps = {}) {
  const whatsappTransport = deps.whatsappTransport || null
  const logger = deps.logger || console
  const nowProvider = typeof deps.nowProvider === 'function' ? deps.nowProvider : () => new Date()
  const randomProvider = typeof deps.randomProvider === 'function' ? deps.randomProvider : Math.random
  const scheduledTimers = new Map()
  const runningCampaigns = new Map()
  let bootstrapPromise = null
  let memberPhoneNormalizationPromise = null
  let memberPhoneNormalizationDone = false

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
        'Schema do banco desatualizado. Aplique o SQL prisma/sql/20260330_add_broadcast_module.sql antes de usar os disparos.',
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
    return MIN_DELAY_MS + Math.floor(randomProvider() * (MAX_DELAY_MS - MIN_DELAY_MS + 1))
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }

  function toNumber(value, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  function trimNullable(value) {
    const normalized = String(value || '').trim()
    return normalized || null
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
    const processed = toNumber(campaign.sent_count) + toNumber(campaign.failed_count)
    if (!total) return 0
    return Math.max(0, Math.min(100, Math.round((processed / total) * 100)))
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
      created_at: row.created_at || null,
    }
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
        SELECT c.*, l.name AS list_name
        FROM broadcast_campaigns c
        LEFT JOIN broadcast_lists l ON l.id = c.list_id
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
    clearTimeout(active.timeoutId)
    scheduledTimers.delete(campaignId)
  }

  function scheduleCampaignTimer(campaignId, scheduledAt) {
    clearScheduledTimer(campaignId)

    const targetAt = new Date(scheduledAt)
    if (!Number.isFinite(targetAt.getTime())) return

    const armNextTimeout = () => {
      const remaining = targetAt.getTime() - nowProvider().getTime()
      const nextDelay = Math.min(Math.max(remaining, 0), MAX_TIMEOUT_MS)

      const timeoutId = setTimeout(async () => {
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

  async function bootstrapScheduledCampaigns() {
    if (bootstrapPromise) return bootstrapPromise

    bootstrapPromise = (async () => {
      await normalizeLegacyMemberPhonesOnce()

      await execute(
        `
          UPDATE broadcast_campaigns
          SET status = $2,
              finished_at = NOW()
          WHERE status = $1
        `,
        CAMPAIGN_STATUS.running,
        CAMPAIGN_STATUS.failed,
      )

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

  async function listMembers(listId) {
    await normalizeLegacyMemberPhonesOnce()
    await ensureListExists(listId)

    const rows = await query(
      `
        SELECT id, list_id, client_phone, client_name, added_at
        FROM broadcast_list_members
        WHERE list_id = $1
        ORDER BY COALESCE(NULLIF(TRIM(client_name), ''), client_phone) ASC, id ASC
      `,
      listId,
    )

    return (rows || []).map(mapMember)
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

    const members = await listMembers(listId)

    return {
      imported_count: toNumber(inserted),
      total_members: members.length,
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
          c.created_at
        FROM broadcast_campaigns c
        LEFT JOIN broadcast_lists l ON l.id = c.list_id
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

  async function getCampaignLogs(campaignId) {
    await ensureCampaignExists(campaignId)

    const rows = await query(
      `
        SELECT id, campaign_id, phone, client_name, status, error_message, sent_at, created_at
        FROM broadcast_logs
        WHERE campaign_id = $1
        ORDER BY id ASC
      `,
      campaignId,
    )

    return (rows || []).map(mapLog)
  }

  async function prepareCampaignRun(campaignId, { preserveScheduledAt = false } = {}) {
    const campaign = await ensureCampaignExists(campaignId)

    if (campaign.status === CAMPAIGN_STATUS.running) {
      throw new AppError(409, 'Esta campanha ja esta em execucao.')
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

    await prisma.$transaction(async (tx) => {
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

  async function updateLogStatus(campaignId, logId, payload = {}) {
    const status = payload.status || LOG_STATUS.failed
    const errorMessage = trimNullable(payload.error_message)
    const shouldSetSentAt = status === LOG_STATUS.sent

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

    if (status === LOG_STATUS.sent) {
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

        try {
          await whatsappTransport.sendTextMessage({
            to: log.phone,
            body: campaign.message,
          })

          await updateLogStatus(campaignId, log.id, {
            status: LOG_STATUS.sent,
            error_message: null,
          })
        } catch (error) {
          await updateLogStatus(campaignId, log.id, {
            status: LOG_STATUS.failed,
            error_message: formatDeliveryError(error),
          })
        }

        if (index < logs.length - 1) {
          await sleep(getRandomDelayMs())
        }
      }

      await finalizeCampaign(campaignId, CAMPAIGN_STATUS.done)
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

    setTimeout(() => {
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

  async function removeCampaign(campaignId) {
    const campaign = await ensureCampaignExists(campaignId)

    if (campaign.status === CAMPAIGN_STATUS.running || runningCampaigns.has(campaignId)) {
      throw new AppError(409, 'Nao e possivel excluir uma campanha em execucao.')
    }

    clearScheduledTimer(campaignId)

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
    cancelCampaign,
    removeCampaign,
  }
}

module.exports = { createBroadcastService, CAMPAIGN_STATUS, LOG_STATUS }
