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
