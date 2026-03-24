const { parseJsonBody } = require('../utils/http')

function paymentsController(service) {
  return {
    async asaasWebhook(req) {
      const body = await parseJsonBody(req)
      const data = await service.receiveAsaasWebhook(body, req?.headers || {})
      return { statusCode: 200, data }
    },
  }
}

module.exports = { paymentsController }
