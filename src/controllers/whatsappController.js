const { parseJsonBody } = require('../utils/http')

function whatsappController(service) {
  return {
    async verify(url) {
      const challenge = await service.verifyWebhook(url)
      return {
        statusCode: 200,
        rawBody: challenge,
        contentType: 'text/plain; charset=utf-8',
      }
    },

    async webhook(req, url) {
      const body = await parseJsonBody(req)
      const data = await service.handleWebhookEvent(body, url)
      return { statusCode: 200, data }
    },
  }
}

module.exports = { whatsappController }
