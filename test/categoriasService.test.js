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
})
