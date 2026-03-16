const { parseJsonBody } = require('../utils/http')
const {
  parseCategoriaId,
  validateCreateCategoria,
  validateUpdateCategoria,
} = require('../validators/categoriasValidator')
const { parseCategoriasListQuery } = require('../validators/listQueryValidator')

function categoriasController(service) {
  return {
    async list(url) {
      const query = parseCategoriasListQuery(url)
      const result = await service.list(query)
      return { statusCode: 200, data: result.items, meta: result.meta }
    },

    async getById(idParam) {
      const id = parseCategoriaId(idParam)
      const data = await service.getById(id)
      return { statusCode: 200, data }
    },

    async create(req) {
      const body = await parseJsonBody(req)
      const data = validateCreateCategoria(body)
      const created = await service.create(data)
      return { statusCode: 201, data: created }
    },

    async update(req, idParam) {
      const id = parseCategoriaId(idParam)
      const body = await parseJsonBody(req)
      const data = validateUpdateCategoria(body)
      const updated = await service.update(id, data)
      return { statusCode: 200, data: updated }
    },

    async remove(idParam) {
      const id = parseCategoriaId(idParam)
      const data = await service.remove(id)
      return { statusCode: 200, data }
    },
  }
}

module.exports = { categoriasController }
