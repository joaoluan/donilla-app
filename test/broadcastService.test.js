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
