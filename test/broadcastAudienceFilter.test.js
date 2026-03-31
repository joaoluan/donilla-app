const test = require('node:test')
const assert = require('node:assert/strict')

const { createBroadcastService } = require('../src/services/broadcastService')

function compactSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim()
}

function createPrismaMock() {
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

        if (normalizedSql.includes('INSERT INTO broadcast_lists (name, description)')) {
          return [{
            id: 91,
            name: 'Fas de Nutella',
            description: 'Criada por filtro',
            created_at: '2026-03-31T00:00:00.000Z',
          }]
        }

        throw new Error(`Unexpected raw query: ${normalizedSql}`)
      },

      async $executeRawUnsafe(sql, ...params) {
        const normalizedSql = compactSql(sql)
        calls.execute.push({ sql: normalizedSql, params })
        return 4
      },
    },
  }
}

test('createListFromFilter deduplica telefones normalizados antes de inserir membros', async () => {
  const { prisma, calls } = createPrismaMock()
  const service = createBroadcastService(prisma)

  const result = await service.createListFromFilter({
    name: 'Fas de Nutella',
    description: 'Criada por filtro',
    filter: {
      logic: 'and',
      rules: [
        {
          field: 'product_bought',
          operator: 'contains',
          value: 'Nutella',
          window_days: 30,
        },
      ],
    },
  })

  assert.equal(result.id, 91)
  assert.equal(result.member_count, 4)

  const insertMembersCall = calls.execute[0]
  assert.ok(insertMembersCall)
  assert.match(insertMembersCall.sql, /WITH audience_matches AS/i)
  assert.match(insertMembersCall.sql, /SELECT DISTINCT ON \(normalized_phone\)/i)
  assert.doesNotMatch(insertMembersCall.sql, /ON CONFLICT/i)
  assert.deepEqual(insertMembersCall.params, [91, '%Nutella%', 30])
})
