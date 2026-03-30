const { parseJsonBody } = require('../utils/http')
const { parseFlowId, validateCreateFlow, validateUpdateFlow } = require('../validators/flowsValidator')

function flowsController(service) {
  return {
    async listFlows() {
      const data = await service.listFlows()
      return { statusCode: 200, data }
    },

    async createFlow(req) {
      const body = await parseJsonBody(req)
      const payload = validateCreateFlow(body)
      const data = await service.createFlow(payload)
      return { statusCode: 201, data }
    },

    async getFlow(idParam) {
      const id = parseFlowId(idParam)
      const data = await service.getFlow(id)
      return { statusCode: 200, data }
    },

    async updateFlow(req, idParam) {
      const id = parseFlowId(idParam)
      const body = await parseJsonBody(req)
      const payload = validateUpdateFlow(body)
      const data = await service.updateFlow(id, payload)
      return { statusCode: 200, data }
    },

    async publishFlow(idParam) {
      const id = parseFlowId(idParam)
      const data = await service.publishFlow(id)
      return { statusCode: 200, data }
    },

    async unpublishFlow(idParam) {
      const id = parseFlowId(idParam)
      const data = await service.unpublishFlow(id)
      return { statusCode: 200, data }
    },

    async removeFlow(idParam) {
      const id = parseFlowId(idParam)
      const data = await service.removeFlow(id)
      return { statusCode: 200, data }
    },

    async activeSessions() {
      const data = await service.listActiveSessions()
      return { statusCode: 200, data }
    },
  }
}

module.exports = { flowsController }
