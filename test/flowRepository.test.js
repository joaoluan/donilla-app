const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createFlowRepository,
  findBestTriggerMatch,
  hasOverlappingTriggerAlias,
  normalizeTriggerText,
  splitTriggerKeywords,
} = require('../src/services/flowRepository')

function createFlowRow(overrides = {}) {
  return {
    id: 1,
    name: 'Fluxo',
    trigger_keyword: 'oi',
    flow_json: { nodes: [] },
    canvas_json: {},
    status: 'published',
    published_at: '2026-03-30T12:00:00.000Z',
    created_at: '2026-03-30T11:00:00.000Z',
    updated_at: '2026-03-30T12:00:00.000Z',
    ...overrides,
  }
}

test('normalizeTriggerText remove acento e pontuacao para comparar gatilhos', () => {
  assert.equal(normalizeTriggerText(' Olá!!! boa-noite? '), 'ola boa noite')
})

test('splitTriggerKeywords aceita varios aliases e elimina duplicados normalizados', () => {
  const aliases = splitTriggerKeywords('oi, olá, ola, OI\nboa noite')

  assert.deepEqual(
    aliases.map((item) => item.raw),
    ['oi', 'olá', 'boa noite'],
  )
  assert.deepEqual(
    aliases.map((item) => item.normalized),
    ['oi', 'ola', 'boa noite'],
  )
})

test('hasOverlappingTriggerAlias compara aliases ignorando acentos e caixa', () => {
  assert.equal(hasOverlappingTriggerAlias('oi, olá', 'OLA, bom dia'), true)
  assert.equal(hasOverlappingTriggerAlias('oi', 'oi tudo'), false)
})

test('findBestTriggerMatch escolhe o alias mais especifico no inicio da mensagem', () => {
  const flow = findBestTriggerMatch(
    [
      createFlowRow({ id: 1, trigger_keyword: 'bom' }),
      createFlowRow({ id: 2, trigger_keyword: 'bom dia' }),
    ],
    'Bom dia, equipe',
  )

  assert.equal(flow.id, 2)
})

test('findPublishedFlowByTrigger aceita aliases separados por virgula e ignora acentos', async () => {
  const prisma = {
    async $queryRawUnsafe(sql) {
      if (sql.includes("FROM bot_flows") && sql.includes("WHERE status = 'published'")) {
        return [
          createFlowRow({ id: 7, name: 'Saudacao', trigger_keyword: 'oi, ola, olá, opa' }),
          createFlowRow({ id: 8, name: 'Pedido', trigger_keyword: 'cade meu pedido, onde esta meu pedido' }),
        ]
      }

      return []
    },
    async $executeRawUnsafe() {
      return 0
    },
  }

  const repository = createFlowRepository(prisma)

  const greetingFlow = await repository.findPublishedFlowByTrigger('Olá, tudo bem?')
  assert.equal(greetingFlow?.id, 7)

  const orderFlow = await repository.findPublishedFlowByTrigger('Cadê meu pedido?')
  assert.equal(orderFlow?.id, 8)
})

test('publishFlow arquiva apenas fluxos publicados com alias realmente conflitante', async () => {
  const executeCalls = []
  const prisma = {
    async $queryRawUnsafe(sql, ...params) {
      if (sql.includes("FROM bot_flows") && sql.includes("WHERE status = 'published'") && sql.includes('AND id <> $1')) {
        assert.deepEqual(params, [1])
        return [
          createFlowRow({ id: 2, name: 'Saudacao antiga', trigger_keyword: 'oi, olá' }),
          createFlowRow({ id: 3, name: 'Bom dia', trigger_keyword: 'bom dia' }),
          createFlowRow({ id: 4, name: 'Oi tudo', trigger_keyword: 'oi tudo bem' }),
        ]
      }

      if (sql.includes("SET status = 'published'")) {
        assert.deepEqual(params, [1])
        return [createFlowRow({ id: 1, name: 'Novo fluxo', trigger_keyword: 'oi, ola, boa noite' })]
      }

      return []
    },
    async $executeRawUnsafe(sql, ...params) {
      executeCalls.push({ sql, params })
      return 1
    },
    async $transaction(handler) {
      return handler(this)
    },
  }

  const repository = createFlowRepository(prisma)
  const published = await repository.publishFlow(1, 'oi, ola, boa noite')

  assert.equal(published?.id, 1)
  assert.equal(executeCalls.length, 1)
  assert.deepEqual(executeCalls[0].params, [2])
})
