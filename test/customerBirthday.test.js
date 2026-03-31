const test = require('node:test')
const assert = require('node:assert/strict')

const { validateCreateCustomer, validateUpdateCustomerProfile } = require('../src/validators/publicOrderValidator')
const { publicStoreService } = require('../src/services/publicStoreService')
const { createBroadcastService } = require('../src/services/broadcastService')
const { signToken } = require('../src/utils/jwt')

test('validateCreateCustomer aceita data de aniversario valida', () => {
  const result = validateCreateCustomer({
    nome: 'Maria Teste',
    telefone_whatsapp: '(11) 99999-0000',
    senha: 'Senha1',
    data_aniversario: '1994-08-15',
    endereco: {
      rua: 'Rua A',
      numero: '10',
      bairro: 'Centro',
    },
  })

  assert.equal(result.telefone_whatsapp, '11999990000')
  assert.equal(result.data_aniversario, '1994-08-15')
})

test('validateCreateCustomer rejeita data de aniversario futura', () => {
  assert.throws(
    () => validateCreateCustomer({
      nome: 'Maria Teste',
      telefone_whatsapp: '(11) 99999-0000',
      senha: 'Senha1',
      data_aniversario: '2099-08-15',
      endereco: {
        rua: 'Rua A',
        numero: '10',
        bairro: 'Centro',
      },
    }),
    /Data de aniversario invalida/i,
  )
})

test('validateUpdateCustomerProfile permite atualizar apenas data de aniversario', () => {
  const result = validateUpdateCustomerProfile({
    data_aniversario: '1990-01-20',
  })

  assert.equal(result.data_aniversario, '1990-01-20')
})

function createCustomerPrismaMock() {
  const calls = {
    clienteCreate: null,
    clienteUpdate: [],
  }

  const state = {
    cliente: {
      id: 7,
      nome: 'Maria Teste',
      telefone_whatsapp: '11999990000',
      data_aniversario: new Date('1994-08-15T12:00:00.000Z'),
    },
    endereco: {
      id: 12,
      cliente_id: 7,
      rua: 'Rua A',
      numero: '10',
      bairro: 'Centro',
      cidade: 'Sao Paulo',
      complemento: null,
      referencia: null,
    },
  }

  return {
    calls,
    prisma: {
      $transaction(callback) {
        const tx = {
          usuarios: {
            findUnique() {
              return Promise.resolve(null)
            },
            create() {
              return Promise.resolve({ id: 99 })
            },
          },
          clientes: {
            findUnique(args) {
              if (args?.where?.telefone_whatsapp === state.cliente.telefone_whatsapp) {
                return Promise.resolve(null)
              }
              if (args?.where?.id === state.cliente.id) {
                return Promise.resolve(state.cliente)
              }
              return Promise.resolve(null)
            },
            findFirst() {
              return Promise.resolve(state.cliente)
            },
            create({ data }) {
              calls.clienteCreate = data
              state.cliente = {
                id: 7,
                ...data,
              }
              return Promise.resolve(state.cliente)
            },
            update({ where, data }) {
              calls.clienteUpdate.push({ where, data })
              state.cliente = {
                ...state.cliente,
                ...data,
              }
              return Promise.resolve(state.cliente)
            },
          },
          enderecos: {
            create({ data }) {
              state.endereco = {
                id: 12,
                ...data,
              }
              return Promise.resolve(state.endereco)
            },
          },
        }

        tx.clientes.findUnique = tx.clientes.findUnique.bind(tx.clientes)
        return callback(tx)
      },
      clientes: {
        findFirst() {
          return Promise.resolve(state.cliente)
        },
      },
    },
  }
}

test('createCustomerAccount persiste data de aniversario e devolve na sessao', async () => {
  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const { prisma, calls } = createCustomerPrismaMock()
  const service = publicStoreService(prisma)

  try {
    const result = await service.createCustomerAccount({
      nome: 'Maria Teste',
      telefone_whatsapp: '11999990000',
      senha: 'Senha1',
      data_aniversario: '1994-08-15',
      endereco: {
        rua: 'Rua A',
        numero: '10',
        bairro: 'Centro',
        cidade: 'Sao Paulo',
      },
    })

    assert.ok(calls.clienteCreate?.data_aniversario instanceof Date)
    assert.equal(result.data_aniversario, '1994-08-15')
    assert.equal(result.cliente.data_aniversario, '1994-08-15')
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalSecret
  }
})

test('updateCustomerProfile permite limpar data de aniversario', async () => {
  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'

  const { prisma, calls } = createCustomerPrismaMock()
  const service = publicStoreService(prisma)
  const token = signToken(
    {
      purpose: 'customer_session',
      customer_id: 7,
      telefone_whatsapp: '11999990000',
      nome: 'Maria Teste',
      data_aniversario: '1994-08-15',
    },
    process.env.JWT_SECRET,
    3600,
  )

  try {
    const result = await service.updateCustomerProfile(token, {
      data_aniversario: null,
    })

    assert.equal(calls.clienteUpdate.length, 1)
    assert.equal(calls.clienteUpdate[0].data.data_aniversario, null)
    assert.equal(result.data_aniversario, null)
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalSecret
  }
})

function compactSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim()
}

test('createListFromFilter suporta filtros de aniversario e idade', async () => {
  const calls = {
    query: [],
    execute: [],
  }

  const prisma = {
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
          name: 'Aniversariantes',
          description: 'Lista de aniversario',
          created_at: '2026-03-31T00:00:00.000Z',
        }]
      }

      throw new Error(`Unexpected raw query: ${normalizedSql}`)
    },

    async $executeRawUnsafe(sql, ...params) {
      calls.execute.push({ sql: compactSql(sql), params })
      return 3
    },
  }

  const service = createBroadcastService(prisma)

  await service.createListFromFilter({
    name: 'Aniversariantes',
    description: 'Lista de aniversario',
    filter: {
      logic: 'and',
      rules: [
        {
          field: 'birthday_month',
          operator: 'eq',
          value: '8',
        },
        {
          field: 'age_years',
          operator: 'gte',
          value: '30',
        },
      ],
    },
  })

  assert.equal(calls.execute.length, 1)
  assert.match(calls.execute[0].sql, /EXTRACT\(MONTH FROM c\.data_aniversario\)/i)
  assert.match(calls.execute[0].sql, /DATE_PART\('year', AGE\(CURRENT_DATE, c\.data_aniversario\)\)/i)
  assert.deepEqual(calls.execute[0].params, [91, 8, 30])
})
