const { parseJsonBody } = require('../utils/http')
const {
  parseUsuarioId,
  parseUsuariosListQuery,
  validateCreateUsuario,
  validateResetPassword,
  validateUpdateUsuario,
} = require('../validators/usuariosValidator')

function usuariosController(service) {
  return {
    async list(url) {
      const query = parseUsuariosListQuery(url)
      const result = await service.list(query)
      return { statusCode: 200, data: result.items, meta: result.meta }
    },

    async create(req, actorId) {
      const body = await parseJsonBody(req)
      const data = validateCreateUsuario(body)
      const created = await service.create(data, actorId)
      return { statusCode: 201, data: created }
    },

    async update(req, idParam, actorId) {
      const id = parseUsuarioId(idParam)
      const body = await parseJsonBody(req)
      const data = validateUpdateUsuario(body)
      const updated = await service.update(id, data, actorId)
      return { statusCode: 200, data: updated }
    },

    async resetPassword(req, idParam, actorId) {
      const id = parseUsuarioId(idParam)
      const body = await parseJsonBody(req)
      const { password } = validateResetPassword(body)
      const data = await service.resetPassword(id, password, actorId)
      return { statusCode: 200, data }
    },

    async remove(idParam, actorId) {
      const id = parseUsuarioId(idParam)
      const data = await service.remove(id, actorId)
      return { statusCode: 200, data }
    },
  }
}

module.exports = { usuariosController }
