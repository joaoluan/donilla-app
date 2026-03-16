const { parseJsonBody } = require('../utils/http')
const {
  parseProdutoId,
  validateCreateProduto,
  validateUpdateProduto,
} = require('../validators/produtosValidator')
const { parseProdutosListQuery } = require('../validators/listQueryValidator')

function produtosController(service) {
  return {
    async list(url) {
      const query = parseProdutosListQuery(url)
      const result = await service.list(query)
      return { statusCode: 200, data: result.items, meta: result.meta }
    },

    async getById(idParam) {
      const id = parseProdutoId(idParam)
      const data = await service.getById(id)
      return { statusCode: 200, data }
    },

    async create(req) {
      const body = await parseJsonBody(req)
      const data = validateCreateProduto(body)
      const created = await service.create(data)
      return { statusCode: 201, data: created }
    },

    async update(req, idParam) {
      const id = parseProdutoId(idParam)
      const body = await parseJsonBody(req)
      const data = validateUpdateProduto(body)
      const updated = await service.update(id, data)
      return { statusCode: 200, data: updated }
    },

    async remove(idParam) {
      const id = parseProdutoId(idParam)
      const data = await service.remove(id)
      return { statusCode: 200, data }
    },
  }
}

module.exports = { produtosController }
