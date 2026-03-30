const test = require('node:test')
const assert = require('node:assert/strict')

const { createBroadcastService } = require('../src/services/broadcastService')

function compactSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim()
}

function createBroadcastPrismaMock() {
  const calls = {
    query: [],
    execute: [],
  }

  return {
    calls,
    prisma: {
      async $queryRawUnsafe(sql, ...params) {
        const normalizedSql = compactSql(sql)
        calls.query.push({ sql: normalizedSql, params })

        if (normalizedSql.includes('SELECT id, list_id, client_phone FROM broadcast_list_members ORDER BY id ASC')) {
          return []
        }

        if (normalizedSql.includes('SELECT id, scheduled_at FROM broadcast_campaigns')) {
          return []
        }

        if (normalizedSql.includes('SELECT id FROM broadcast_campaigns WHERE status IN ($1, $2, $3, $4)')) {
          return []
        }

        if (normalizedSql.includes('SELECT id FROM broadcast_interactions WHERE status = $1 AND expires_at IS NOT NULL AND expires_at <= NOW()')) {
          return []
        }

        if (normalizedSql.includes('SELECT id, expires_at FROM broadcast_interactions WHERE status = $1 AND expires_at IS NOT NULL AND expires_at > NOW()')) {
          return []
        }

        if (normalizedSql.includes('SELECT id, name, description, created_at FROM broadcast_lists')) {
          return [{ id: 21, name: 'Teste', description: null, created_at: '2026-03-30T13:56:25.133Z' }]
        }

        if (normalizedSql.includes('SELECT id, client_phone FROM broadcast_list_members')) {
          return [{ id: 82, client_phone: '51999999999' }]
        }

        throw new Error(`Unexpected raw query: ${normalizedSql}`)
      },

      async $executeRawUnsafe(sql, ...params) {
        const normalizedSql = compactSql(sql)
        calls.execute.push({ sql: normalizedSql, params })

        if (normalizedSql.includes('UPDATE broadcast_campaigns SET status = $2, finished_at = NOW() WHERE status = $1')) {
          return 0
        }

        if (normalizedSql.includes('DELETE FROM broadcast_list_members')) {
          return 1
        }

        throw new Error(`Unexpected raw execute: ${normalizedSql}`)
      },
    },
  }
}

function createInteractionPrismaMock() {
  const calls = {
    query: [],
    execute: [],
  }

  const state = {
    interaction: {
      id: 301,
      campaign_id: 12,
      log_id: 77,
      phone_number: '5511999990000',
      client_name: 'Maria',
      main_message: 'Oferta especial hoje',
      status: 'greeting_sent',
      expires_at: '2026-03-31T10:00:00.000Z',
      reply_message: null,
    },
    log: {
      id: 77,
      status: 'greeting_sent',
      error_message: null,
    },
  }

  return {
    calls,
    state,
    prisma: {
      async $queryRawUnsafe(sql, ...params) {
        const normalizedSql = compactSql(sql)
        calls.query.push({ sql: normalizedSql, params })

        if (normalizedSql.includes('SELECT id, list_id, client_phone FROM broadcast_list_members ORDER BY id ASC')) {
          return []
        }

        if (normalizedSql.includes('SELECT id, scheduled_at FROM broadcast_campaigns')) {
          return []
        }

        if (normalizedSql.includes('SELECT id FROM broadcast_campaigns WHERE status IN ($1, $2, $3, $4)')) {
          return []
        }

        if (normalizedSql.includes('SELECT id FROM broadcast_interactions WHERE status = $1 AND expires_at IS NOT NULL AND expires_at <= NOW()')) {
          return []
        }

        if (normalizedSql.includes('SELECT id, expires_at FROM broadcast_interactions WHERE status = $1 AND expires_at IS NOT NULL AND expires_at > NOW()')) {
          return []
        }

        if (normalizedSql.includes('SELECT id, campaign_id, log_id, phone_number, client_name, main_message, status, expires_at FROM broadcast_interactions')) {
          if (!state.interaction || state.interaction.main_message_sent_at) {
            return []
          }

          const variants = params.slice(2)
          if (!variants.includes(state.interaction.phone_number)) {
            return []
          }

          return [state.interaction]
        }

        if (normalizedSql.includes('SELECT COUNT(*) FILTER (WHERE status = $2)::int AS pending_logs_count')) {
          const currentStatus = String(state.log.status || '')
          return [{
            pending_logs_count: currentStatus === 'pending' ? 1 : 0,
            awaiting_reply_count: ['greeting_sent', 'replied'].includes(currentStatus) ? 1 : 0,
            completed_count: currentStatus === 'completed' ? 1 : 0,
            no_response_count: currentStatus === 'no_response' ? 1 : 0,
            failed_logs_count: currentStatus === 'failed' ? 1 : 0,
            total_logs_count: 1,
          }]
        }

        throw new Error(`Unexpected raw query: ${normalizedSql}`)
      },

      async $executeRawUnsafe(sql, ...params) {
        const normalizedSql = compactSql(sql)
        calls.execute.push({ sql: normalizedSql, params })

        if (normalizedSql.includes('UPDATE broadcast_campaigns SET status = $2, finished_at = NOW() WHERE status = $1')) {
          return 0
        }

        if (normalizedSql.includes('UPDATE broadcast_interactions SET status = $2, reply_received_at = COALESCE(reply_received_at, NOW())')) {
          state.interaction = {
            ...state.interaction,
            status: params[1],
            reply_message: params[2],
            reply_received_at: '2026-03-30T10:00:00.000Z',
            expires_at: null,
            error_message: null,
          }
          return 1
        }

        if (normalizedSql.includes('UPDATE broadcast_interactions SET status = $2, main_message_sent_at = NOW()')) {
          state.interaction = {
            ...state.interaction,
            status: params[1],
            main_message_sent_at: '2026-03-30T10:00:01.000Z',
            completed_at: '2026-03-30T10:00:01.000Z',
            last_message_sent_at: '2026-03-30T10:00:01.000Z',
            error_message: null,
          }
          return 1
        }

        if (normalizedSql.includes('UPDATE broadcast_interactions SET status = $2, error_message = $3')) {
          state.interaction = {
            ...state.interaction,
            status: params[1],
            error_message: params[2],
          }
          return 1
        }

        if (normalizedSql.includes('UPDATE broadcast_logs SET status = $2, error_message = $3 WHERE id = $1')) {
          state.log = {
            ...state.log,
            status: params[1],
            error_message: params[2],
          }
          return 1
        }

        if (normalizedSql.includes('UPDATE broadcast_campaigns SET status = $2, finished_at = CASE')) {
          state.campaignStatus = params[1]
          return 1
        }

        throw new Error(`Unexpected raw execute: ${normalizedSql}`)
      },
    },
  }
}

function createPaginationPrismaMock() {
  const calls = {
    query: [],
    execute: [],
  }

  const campaignRow = {
    id: 17,
    name: 'Campanha VIP',
    message: 'Oferta doce',
    list_id: 21,
    list_name: 'VIP',
    status: 'done',
    scheduled_at: null,
    started_at: '2026-03-30T10:00:00.000Z',
    finished_at: '2026-03-30T11:00:00.000Z',
    total_contacts: 101,
    sent_count: 90,
    failed_count: 11,
    created_at: '2026-03-30T09:00:00.000Z',
    pending_logs_count: 0,
    awaiting_reply_count: 0,
    completed_count: 90,
    no_response_count: 0,
  }

  return {
    calls,
    prisma: {
      async $queryRawUnsafe(sql, ...params) {
        const normalizedSql = compactSql(sql)
        calls.query.push({ sql: normalizedSql, params })

        if (normalizedSql.includes('SELECT id, list_id, client_phone FROM broadcast_list_members ORDER BY id ASC')) {
          return []
        }

        if (normalizedSql.includes('SELECT id, scheduled_at FROM broadcast_campaigns')) {
          return []
        }

        if (normalizedSql.includes('SELECT id FROM broadcast_campaigns WHERE status IN ($1, $2, $3, $4)')) {
          return []
        }

        if (normalizedSql.includes('SELECT id FROM broadcast_interactions WHERE status = $1 AND expires_at IS NOT NULL AND expires_at <= NOW()')) {
          return []
        }

        if (normalizedSql.includes('SELECT id, expires_at FROM broadcast_interactions WHERE status = $1 AND expires_at IS NOT NULL AND expires_at > NOW()')) {
          return []
        }

        if (normalizedSql.includes('SELECT id, name, description, created_at FROM broadcast_lists WHERE id = $1 LIMIT 1')) {
          return [{ id: 21, name: 'VIP', description: null, created_at: '2026-03-30T13:56:25.133Z' }]
        }

        if (normalizedSql.includes('SELECT COUNT(*)::int AS total FROM broadcast_list_members WHERE list_id = $1')) {
          return [{ total: 102 }]
        }

        if (normalizedSql.includes('SELECT id, list_id, client_phone, client_name, added_at FROM broadcast_list_members WHERE list_id = $1 ORDER BY COALESCE(NULLIF(TRIM(client_name), \'\'), client_phone) ASC, id ASC LIMIT $2 OFFSET $3')) {
          return [
            {
              id: 201,
              list_id: 21,
              client_phone: '5511999991111',
              client_name: 'Ana',
              added_at: '2026-03-30T12:00:00.000Z',
            },
            {
              id: 202,
              list_id: 21,
              client_phone: '5511999992222',
              client_name: 'Bruno',
              added_at: '2026-03-30T12:05:00.000Z',
            },
          ]
        }

        if (
          normalizedSql.includes('FROM broadcast_campaigns c LEFT JOIN broadcast_lists l ON l.id = c.list_id')
          && normalizedSql.includes('WHERE c.id = $1 LIMIT 1')
        ) {
          return [campaignRow]
        }

        if (normalizedSql.includes('SELECT COUNT(*)::int AS total FROM broadcast_logs WHERE campaign_id = $1')) {
          return [{ total: 101 }]
        }

        if (normalizedSql.includes('FROM broadcast_logs l LEFT JOIN broadcast_interactions i ON i.log_id = l.id WHERE l.campaign_id = $1 ORDER BY l.id ASC LIMIT $2 OFFSET $3')) {
          return [{
            id: 401,
            campaign_id: 17,
            phone: '5511999991111',
            client_name: 'Ana',
            status: 'failed',
            error_message: 'Timeout',
            sent_at: '2026-03-30T10:10:00.000Z',
            created_at: '2026-03-30T10:00:00.000Z',
            last_message_sent_at: null,
            greeting_sent_at: null,
            reply_received_at: null,
            main_message_sent_at: null,
            expires_at: null,
            interaction_status: 'failed',
          }]
        }

        throw new Error(`Unexpected raw query: ${normalizedSql}`)
      },

      async $executeRawUnsafe(sql, ...params) {
        const normalizedSql = compactSql(sql)
        calls.execute.push({ sql: normalizedSql, params })

        if (normalizedSql.includes('UPDATE broadcast_campaigns SET status = $2, finished_at = NOW() WHERE status = $1')) {
          return 0
        }

        throw new Error(`Unexpected raw execute: ${normalizedSql}`)
      },
    },
  }
}

function createRetryPrismaMock() {
  const calls = {
    query: [],
    execute: [],
    txQuery: [],
    txExecute: [],
  }

  const state = {
    insertedMembers: [],
  }

  const sourceCampaignRow = {
    id: 17,
    name: 'Campanha de Páscoa',
    message: 'Oferta especial da semana',
    list_id: 21,
    list_name: 'Clientes VIP',
    status: 'done',
    scheduled_at: null,
    started_at: '2026-03-30T09:00:00.000Z',
    finished_at: '2026-03-30T10:00:00.000Z',
    total_contacts: 10,
    sent_count: 8,
    failed_count: 2,
    created_at: '2026-03-30T08:00:00.000Z',
    pending_logs_count: 0,
    awaiting_reply_count: 0,
    completed_count: 8,
    no_response_count: 0,
  }

  const tx = {
    async $queryRawUnsafe(sql, ...params) {
      const normalizedSql = compactSql(sql)
      calls.txQuery.push({ sql: normalizedSql, params })

      if (normalizedSql.includes('INSERT INTO broadcast_lists (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at')) {
        return [{
          id: 55,
          name: params[0],
          description: params[1],
          created_at: '2026-03-30T15:00:00.000Z',
        }]
      }

      if (normalizedSql.includes('INSERT INTO broadcast_campaigns (name, message, list_id, status, scheduled_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, message, list_id, status, scheduled_at, started_at, finished_at, total_contacts, sent_count, failed_count, created_at')) {
        return [{
          id: 77,
          name: params[0],
          message: params[1],
          list_id: params[2],
          status: params[3],
          scheduled_at: null,
          started_at: null,
          finished_at: null,
          total_contacts: 0,
          sent_count: 0,
          failed_count: 0,
          created_at: '2026-03-30T15:00:01.000Z',
        }]
      }

      throw new Error(`Unexpected tx raw query: ${normalizedSql}`)
    },

    async $executeRawUnsafe(sql, ...params) {
      const normalizedSql = compactSql(sql)
      calls.txExecute.push({ sql: normalizedSql, params })

      if (normalizedSql.includes('INSERT INTO broadcast_list_members (list_id, client_phone, client_name) VALUES')) {
        state.insertedMembers = []
        for (let index = 1; index < params.length; index += 2) {
          state.insertedMembers.push({
            list_id: params[0],
            client_phone: params[index],
            client_name: params[index + 1],
          })
        }
        return state.insertedMembers.length
      }

      throw new Error(`Unexpected tx raw execute: ${normalizedSql}`)
    },
  }

  return {
    calls,
    state,
    prisma: {
      async $queryRawUnsafe(sql, ...params) {
        const normalizedSql = compactSql(sql)
        calls.query.push({ sql: normalizedSql, params })

        if (normalizedSql.includes('SELECT id, list_id, client_phone FROM broadcast_list_members ORDER BY id ASC')) {
          return []
        }

        if (normalizedSql.includes('SELECT id, scheduled_at FROM broadcast_campaigns')) {
          return []
        }

        if (normalizedSql.includes('SELECT id FROM broadcast_campaigns WHERE status IN ($1, $2, $3, $4)')) {
          return []
        }

        if (normalizedSql.includes('SELECT id FROM broadcast_interactions WHERE status = $1 AND expires_at IS NOT NULL AND expires_at <= NOW()')) {
          return []
        }

        if (normalizedSql.includes('SELECT id, expires_at FROM broadcast_interactions WHERE status = $1 AND expires_at IS NOT NULL AND expires_at > NOW()')) {
          return []
        }

        if (
          normalizedSql.includes('FROM broadcast_campaigns c LEFT JOIN broadcast_lists l ON l.id = c.list_id')
          && normalizedSql.includes('WHERE c.id = $1 LIMIT 1')
        ) {
          return [sourceCampaignRow]
        }

        if (normalizedSql.includes('SELECT phone, client_name FROM broadcast_logs WHERE campaign_id = $1 AND status = $2')) {
          return [
            { phone: '5511999990000', client_name: 'Maria' },
            { phone: '5511999990000', client_name: 'Maria duplicada' },
            { phone: '5511888887777', client_name: 'Joao' },
          ]
        }

        throw new Error(`Unexpected raw query: ${normalizedSql}`)
      },

      async $executeRawUnsafe(sql, ...params) {
        const normalizedSql = compactSql(sql)
        calls.execute.push({ sql: normalizedSql, params })

        if (normalizedSql.includes('UPDATE broadcast_campaigns SET status = $2, finished_at = NOW() WHERE status = $1')) {
          return 0
        }

        throw new Error(`Unexpected raw execute: ${normalizedSql}`)
      },

      async $transaction(callback) {
        return callback(tx)
      },
    },
  }
}

test('removeMember encontra contato legado salvo sem prefixo 55', async () => {
  const { prisma, calls } = createBroadcastPrismaMock()
  const service = createBroadcastService(prisma, {
    logger: {
      info() {},
      error() {},
    },
  })

  const result = await service.removeMember(21, '51999999999')

  assert.deepEqual(result, {
    removed: true,
    list_id: 21,
    phone: '51999999999',
  })

  const lookupCall = calls.query.find((entry) => entry.sql.includes('SELECT id, client_phone FROM broadcast_list_members'))
  assert.ok(lookupCall, 'deveria consultar o membro antes de excluir')
  assert.deepEqual(lookupCall.params.slice(0, 3), [21, '51999999999', '5551999999999'])
  assert.ok(lookupCall.params.includes('51999999999'))
  assert.ok(lookupCall.params.includes('5551999999999'))

  const deleteCall = calls.execute.find((entry) => entry.sql.includes('DELETE FROM broadcast_list_members'))
  assert.ok(deleteCall, 'deveria excluir pelo id do membro encontrado')
  assert.deepEqual(deleteCall.params, [21, 82])
})

test('processIncomingReply envia mensagem principal quando o cliente responde ao cumprimento', async () => {
  const sentMessages = []
  const { prisma, state } = createInteractionPrismaMock()
  const service = createBroadcastService(prisma, {
    logger: {
      info() {},
      error() {},
    },
    nowProvider() {
      return new Date('2026-03-30T10:00:00.000Z')
    },
    whatsappTransport: {
      async sendTextMessage(payload) {
        sentMessages.push(payload)
        return { ok: true }
      },
    },
  })

  const result = await service.processIncomingReply({
    phone: '5511999990000',
    rawPhone: '5511999990000@c.us',
    phones: ['5511999990000'],
    replyTarget: '5511999990000@c.us',
    message: 'Tenho interesse',
  })

  assert.deepEqual(result, {
    matched: true,
    sent: true,
    interaction_id: 301,
    log_id: 77,
    campaign_id: 12,
  })

  assert.deepEqual(sentMessages, [
    {
      to: '5511999990000@c.us',
      body: 'Oferta especial hoje',
    },
  ])

  assert.equal(state.interaction.status, 'completed')
  assert.equal(state.interaction.reply_message, 'Tenho interesse')
  assert.equal(state.log.status, 'completed')
})

test('listMembers retorna itens paginados com meta para carregar mais contatos', async () => {
  const { prisma, calls } = createPaginationPrismaMock()
  const service = createBroadcastService(prisma, {
    logger: {
      info() {},
      error() {},
    },
  })

  const result = await service.listMembers(21, { limit: 100, offset: 100 })

  assert.equal(result.items.length, 2)
  assert.deepEqual(result.meta, {
    total: 102,
    limit: 100,
    offset: 100,
    loaded: 2,
    has_more: false,
    next_offset: null,
  })

  const membersQuery = calls.query.find((entry) => entry.sql.includes('FROM broadcast_list_members WHERE list_id = $1 ORDER BY COALESCE(NULLIF(TRIM(client_name), \'\'), client_phone) ASC, id ASC LIMIT $2 OFFSET $3'))
  assert.ok(membersQuery, 'deveria consultar os membros com LIMIT/OFFSET')
  assert.deepEqual(membersQuery.params, [21, 100, 100])
})

test('getCampaignLogs retorna logs paginados com meta para a modal administrativa', async () => {
  const { prisma, calls } = createPaginationPrismaMock()
  const service = createBroadcastService(prisma, {
    logger: {
      info() {},
      error() {},
    },
  })

  const result = await service.getCampaignLogs(17, { limit: 100, offset: 100 })

  assert.equal(result.items.length, 1)
  assert.deepEqual(result.meta, {
    total: 101,
    limit: 100,
    offset: 100,
    loaded: 1,
    has_more: false,
    next_offset: null,
  })

  const logsQuery = calls.query.find((entry) => entry.sql.includes('FROM broadcast_logs l LEFT JOIN broadcast_interactions i ON i.log_id = l.id WHERE l.campaign_id = $1 ORDER BY l.id ASC LIMIT $2 OFFSET $3'))
  assert.ok(logsQuery, 'deveria consultar os logs com LIMIT/OFFSET')
  assert.deepEqual(logsQuery.params, [17, 100, 100])
})

test('retryFailedCampaign cria nova lista e campanha apenas com os contatos que falharam', async () => {
  const { prisma, state } = createRetryPrismaMock()
  const service = createBroadcastService(prisma, {
    logger: {
      info() {},
      error() {},
    },
    nowProvider() {
      return new Date('2026-03-30T15:00:00.000Z')
    },
  })

  const result = await service.retryFailedCampaign(17)

  assert.equal(result.source_campaign_id, 17)
  assert.equal(result.retry_contacts_count, 2)
  assert.equal(result.created_list.id, 55)
  assert.equal(result.created_list.member_count, 2)
  assert.equal(result.created_campaign.id, 77)
  assert.equal(result.created_campaign.status, 'draft')
  assert.equal(result.created_campaign.list_id, 55)
  assert.equal(result.created_campaign.message, 'Oferta especial da semana')
  assert.match(result.created_campaign.name, /^Reenvio - Campanha de Páscoa/)
  assert.deepEqual(
    state.insertedMembers.map((entry) => [entry.client_phone, entry.client_name]),
    [
      ['5511999990000', 'Maria'],
      ['5511888887777', 'Joao'],
    ],
  )
})
