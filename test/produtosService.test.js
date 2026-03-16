const test = require('node:test')
const assert = require('node:assert/strict')

const { produtosService } = require('../src/services/produtosService')

test('list encontra item sem acento usando fallback tolerante', async () => {
  const calls = {
    findMany: [],
    count: [],
  }
  const service = produtosService({
    produtos: {
      findMany(args) {
        calls.findMany.push(args)
        if (calls.findMany.length === 1) return Promise.resolve([])
        return Promise.resolve([
          {
            id: 21,
            nome_doce: 'Pão de Mel',
            descricao: 'Doce artesanal',
            preco: '12.00',
            estoque_disponivel: 8,
            ativo: true,
            categorias: { id: 3, nome: 'Clássicos' },
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
    search: 'Pao',
    sort: 'nome_doce',
    order: 'asc',
    disponibilidade: 'all',
  })

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].nome_doce, 'Pão de Mel')
  assert.equal(calls.findMany.length, 2)
})

test('remove exclui o produto quando nao ha vinculos', async () => {
  const calls = []
  const service = produtosService({
    produtos: {
      delete(args) {
        calls.push(['delete', args])
        return Promise.resolve({ id: 10 })
      },
      update(args) {
        calls.push(['update', args])
        return Promise.resolve(args)
      },
    },
  })

  const result = await service.remove(10)

  assert.deepEqual(result, { deleted: true, deactivated: false })
  assert.deepEqual(calls, [['delete', { where: { id: 10 } }]])
})

test('remove inativa o produto quando ha pedidos vinculados', async () => {
  const calls = []
  const service = produtosService({
    produtos: {
      delete(args) {
        calls.push(['delete', args])
        return Promise.reject({ code: 'P2003' })
      },
      update(args) {
        calls.push(['update', args])
        return Promise.resolve({ id: 15, ativo: false })
      },
    },
  })

  const result = await service.remove(15)

  assert.deepEqual(result, { deleted: false, deactivated: true })
  assert.deepEqual(calls, [
    ['delete', { where: { id: 15 } }],
    ['update', { where: { id: 15 }, data: { ativo: false } }],
  ])
})

test('remove repassa erros inesperados', async () => {
  const service = produtosService({
    produtos: {
      delete() {
        return Promise.reject(new Error('falha inesperada'))
      },
      update() {
        throw new Error('nao deveria atualizar')
      },
    },
  })

  await assert.rejects(() => service.remove(7), /falha inesperada/)
})
