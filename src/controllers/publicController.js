const { parseJsonBody } = require('../utils/http')
const {
  parseOrderId,
  parseTrackingToken,
  validateCreateOrder,
  validateCreateCustomer,
  validateCustomerLookup,
  validateCustomerLogin,
  validateUpdateCustomerProfile,
} = require('../validators/publicOrderValidator')
const { parseProdutoId } = require('../validators/produtosValidator')

function requestHasMatchingEtag(req, etag) {
  const header = req?.headers?.['if-none-match'] || req?.headers?.['If-None-Match']
  if (!header || !etag) return false

  return String(header)
    .split(',')
    .map((value) => value.trim())
    .includes(etag)
}

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

    async productImage(idParam, req) {
      const id = parseProdutoId(idParam)
      const image = await service.getProductImage(id)
      const headers = {
        'Cache-Control': image.cacheControl,
        ETag: image.etag,
      }

      if (requestHasMatchingEtag(req, image.etag)) {
        return {
          statusCode: 304,
          rawBody: '',
          contentType: image.contentType,
          headers,
        }
      }

      return {
        statusCode: 200,
        rawBody: image.buffer,
        contentType: image.contentType,
        headers: {
          ...headers,
          'Content-Length': String(image.buffer.length),
        },
      }
    },

    async createOrder(req) {
      const body = await parseJsonBody(req)
      const payload = validateCreateOrder(body)
      const data = await service.createOrder(payload)
      return { statusCode: 201, data }
    },

    async createCheckout(req) {
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

    async orderStatusSummary(req, idParam) {
      const id = parseOrderId(idParam)
      const token = getCustomerSessionToken(req)
      const data = await service.getOrderStatusSummary(id, token)
      return { statusCode: 200, data }
    },

    async publicOrderTracking(url, idParam) {
      const id = parseOrderId(idParam)
      const trackingToken = parseTrackingToken(url.searchParams.get('token'))
      const data = await service.getPublicOrderTracking(id, trackingToken)
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

    async retryCheckout(req, idParam) {
      const id = parseOrderId(idParam)
      const token = getCustomerSessionToken(req)
      const data = await service.retryAsaasCheckout(token, id)
      return { statusCode: 200, data }
    },
  }
}

module.exports = { publicController }
