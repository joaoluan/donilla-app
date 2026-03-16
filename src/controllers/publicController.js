const { parseJsonBody } = require('../utils/http')
const {
  parseOrderId,
  validateCreateOrder,
  validateCreateCustomer,
  validateCustomerLookup,
  validateCustomerLogin,
  validateUpdateCustomerProfile,
} = require('../validators/publicOrderValidator')

function publicController(service) {
  function getCustomerSessionToken(req) {
    const authorization = req?.headers?.authorization || req?.headers?.Authorization
    if (authorization && authorization.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length).trim()
    }

    const customerHeader = req?.headers?.['x-customer-session-token']
    if (typeof customerHeader === 'string' && customerHeader.trim()) {
      return customerHeader.trim()
    }

    return null
  }

  return {
    async store() {
      const data = await service.getStore()
      return { statusCode: 200, data }
    },

    async menu() {
      const data = await service.getMenu()
      return { statusCode: 200, data }
    },

    async createOrder(req) {
      const body = await parseJsonBody(req)
      const payload = validateCreateOrder(body)
      const data = await service.createOrder(payload)
      return { statusCode: 201, data }
    },

    async orderStatus(idParam, req) {
      const id = parseOrderId(idParam)
      const token = getCustomerSessionToken(req)
      const data = await service.getOrderStatus(id, token)
      return { statusCode: 200, data }
    },

    async createCustomerAccount(req) {
      const body = await parseJsonBody(req)
      const payload = validateCreateCustomer(body)
      const data = await service.createCustomerAccount(payload)
      return { statusCode: 201, data }
    },

    async customerPhoneAvailability(url) {
      const telefone = validateCustomerLookup(url.searchParams.get('telefone'))
      const data = await service.customerPhoneAvailability(telefone)
      return { statusCode: 200, data }
    },

    async customerLogin(req) {
      const body = await parseJsonBody(req)
      const payload = validateCustomerLogin(body)
      const data = await service.customerLogin(payload)
      return { statusCode: 200, data }
    },

    async updateCustomerProfile(req) {
      const body = await parseJsonBody(req)
      const payload = validateUpdateCustomerProfile(body)
      const token = getCustomerSessionToken(req)
      const data = await service.updateCustomerProfile(token, payload)
      return { statusCode: 200, data }
    },

    async customerOrders(req) {
      const token = getCustomerSessionToken(req)
      const data = await service.getCustomerOrders(token)
      return { statusCode: 200, data }
    },

    async customerOrder(req, idParam) {
      const id = parseOrderId(idParam)
      const token = getCustomerSessionToken(req)
      const data = await service.getCustomerOrder(token, id)
      return { statusCode: 200, data }
    },
  }
}

module.exports = { publicController }
