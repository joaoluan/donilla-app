const test = require('node:test')
const assert = require('node:assert/strict')

const { categoriasService } = require('../src/services/categoriasService')

test('list encontra categoria sem acento usando fallback tolerante', async () => {
  const calls = {
    findMany: [],
    count: [],
  }

  const service = categoriasService({
    categorias: {
      findMany(args) {
        calls.findMany.push(args)
        if (calls.findMany.length === 1) return Promise.resolve([])
        return Promise.resolve([
          {
            id: 3,
            nome: 'Pães de Mel',
            ordem_exibicao: 2,
            _count: { produtos: 4 },
          },
        ])
      },
      count(args) {
        calls.count.push(args)
        return Promise.resolve(0)
      },
    },
    $transaction(actions) {
      return Promise.all(actions)
    },
  })

  const result = await service.list({
    page: 1,
    pageSize: 10,
    search: 'Paes',
    sort: 'nome',
    order: 'asc',
  })

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].nome, 'Pães de Mel')
  assert.equal(calls.findMany.length, 2)
  assert.equal(calls.findMany[0].where.removido_em, null)
  assert.equal(calls.count[0].where.removido_em, null)
})

test('remove faz soft delete da categoria e dos produtos vinculados', async () => {
  const calls = []
  const service = categoriasService({
    categorias: {
      findFirst(args) {
        calls.push(['findFirst', args])
        return Promise.resolve({ id: 4, nome: 'Bolos', removido_em: null })
      },
    },
    $transaction(callback) {
      return callback({
        produtos: {
          updateMany(args) {
            calls.push(['updateMany', args])
            return Promise.resolve({ count: 2 })
          },
        },
        categorias: {
          update(args) {
            calls.push(['update', args])
            return Promise.resolve({ id: 4, removido_em: args.data.removido_em })
          },
        },
      })
    },
  })

  const result = await service.remove(4)

  assert.equal(result.deleted, true)
  assert.equal(result.softDeleted, true)
  assert.equal(result.produtos_removidos, 2)
  assert.deepEqual(calls[0], ['findFirst', { where: { id: 4, removido_em: null } }])
  assert.deepEqual(calls[1], [
    'updateMany',
    {
      where: { categoria_id: 4, removido_em: null },
      data: {
        ativo: false,
        removido_em: calls[1][1].data.removido_em,
      },
    },
  ])
  assert.ok(calls[1][1].data.removido_em instanceof Date)
  assert.deepEqual(calls[2], [
    'update',
    {
      where: { id: 4 },
      data: {
        removido_em: calls[1][1].data.removido_em,
      },
    },
  ])
})
