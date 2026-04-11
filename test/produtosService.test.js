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
  assert.equal(calls.findMany[0].where.removido_em, null)
  assert.equal(calls.count[0].where.removido_em, null)
})

test('list devolve imagem leve para o admin quando o produto usa data URL', async () => {
  const service = produtosService({
    produtos: {
      findMany() {
        return Promise.resolve([
          {
            id: 31,
            nome_doce: 'Bolo de pote',
            descricao: 'Chocolate',
            preco: '15.00',
            imagem_url: 'data:image/png;base64,aGVsbG8=',
            estoque_disponivel: 4,
            ativo: true,
            categoria_id: 2,
            categorias: { id: 2, nome: 'Bolos' },
          },
        ])
      },
      count() {
        return Promise.resolve(1)
      },
    },
    $transaction(actions) {
      return Promise.all(actions)
    },
  })

  const result = await service.list({
    page: 1,
    pageSize: 10,
    search: '',
    sort: 'nome_doce',
    order: 'asc',
    disponibilidade: 'all',
  })

  assert.match(result.items[0].imagem_url, /^\/public\/produtos\/31\/imagem\?v=[a-f0-9]{12}$/)
})

test('getImage deve servir imagem de item inativo para o admin', async () => {
  const service = produtosService({
    produtos: {
      findFirst(args) {
        assert.deepEqual(args, {
          where: { id: 31, removido_em: null },
          select: { id: true, imagem_url: true },
        })

        return Promise.resolve({
          id: 31,
          imagem_url: 'data:image/png;base64,aGVsbG8=',
        })
      },
    },
  })

  const image = await service.getImage(31)

  assert.equal(image.contentType, 'image/png')
  assert.equal(image.cacheControl, 'private, max-age=31536000, immutable')
  assert.match(image.etag, /^"admin-product-image-31-[a-f0-9]{12}"$/)
  assert.equal(image.buffer.toString('utf8'), 'hello')
})

test('remove faz soft delete do produto quando nao ha vinculos', async () => {
  const calls = []
  const service = produtosService({
    produtos: {
      findFirst(args) {
        calls.push(['findFirst', args])
        return Promise.resolve({ id: 10, removido_em: null })
      },
      update(args) {
        calls.push(['update', args])
        return Promise.resolve(args)
      },
    },
    itens_pedido: {
      count(args) {
        calls.push(['count', args])
        return Promise.resolve(0)
      },
    },
  })

  const result = await service.remove(10)

  assert.equal(result.deleted, true)
  assert.equal(result.deactivated, false)
  assert.equal(result.softDeleted, true)
  assert.deepEqual(calls[0], ['findFirst', { where: { id: 10, removido_em: null } }])
  assert.deepEqual(calls[1], ['count', { where: { produto_id: 10 } }])
  assert.deepEqual(calls[2], [
    'update',
    {
      where: { id: 10 },
      data: {
        ativo: false,
        removido_em: calls[2][1].data.removido_em,
      },
    },
  ])
  assert.ok(calls[2][1].data.removido_em instanceof Date)
})

test('remove sinaliza historico quando ha pedidos vinculados', async () => {
  const calls = []
  const service = produtosService({
    produtos: {
      findFirst(args) {
        calls.push(['findFirst', args])
        return Promise.resolve({ id: 15, removido_em: null })
      },
      update(args) {
        calls.push(['update', args])
        return Promise.resolve({ id: 15, ativo: false })
      },
    },
    itens_pedido: {
      count(args) {
        calls.push(['count', args])
        return Promise.resolve(3)
      },
    },
  })

  const result = await service.remove(15)

  assert.equal(result.deleted, true)
  assert.equal(result.deactivated, true)
  assert.equal(result.softDeleted, true)
  assert.deepEqual(calls[0], ['findFirst', { where: { id: 15, removido_em: null } }])
  assert.deepEqual(calls[1], ['count', { where: { produto_id: 15 } }])
  assert.deepEqual(calls[2][0], 'update')
})

test('remove retorna 404 quando o produto ja foi removido', async () => {
  const service = produtosService({
    produtos: {
      findFirst() {
        return Promise.resolve(null)
      },
    },
  })

  await assert.rejects(() => service.remove(7), /Produto nao encontrado/)
})
