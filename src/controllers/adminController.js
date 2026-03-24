const { parseJsonBody } = require('../utils/http')
const {
  parseOrderId,
  validateUpdateOrderStatus,
} = require('../validators/publicOrderValidator')
const { validateUpdateStoreSettings } = require('../validators/storeSettingsValidator')
const { validateWhatsAppTest } = require('../validators/whatsappValidator')
const {
  parseDeliveryFeeId,
  validateCreateDeliveryFee,
  validateUpdateDeliveryFee,
} = require('../validators/deliveryFeeValidator')
const {
  parseDashboardQuery,
  parseOrdersQuery,
  parseCustomersQuery,
  parseCustomerId,
} = require('../validators/adminQueryValidator')

function adminController(service) {
  return {
    async dashboard(url) {
      const query = parseDashboardQuery(url)
      const result = await service.dashboard(query)
      return { statusCode: 200, data: result.data, meta: result.meta }
    },

    async orders(url) {
      const query = parseOrdersQuery(url)
      const result = await service.listOrders(query)
      return { statusCode: 200, data: result.items, meta: result.meta }
    },

    async customers(url) {
      const query = parseCustomersQuery(url)
      const result = await service.listCustomers(query)
      return { statusCode: 200, data: result.items, meta: result.meta }
    },

    async customer(idParam) {
      const id = parseCustomerId(idParam)
      const data = await service.getCustomer(id)
      return { statusCode: 200, data }
    },

    async updateOrderStatus(req, idParam) {
      const id = parseOrderId(idParam)
      const body = await parseJsonBody(req)
      const payload = validateUpdateOrderStatus(body)
      const data = await service.updateOrderStatus(id, payload, req.auth || null)
      return { statusCode: 200, data }
    },

    async orderAudit(idParam) {
      const id = parseOrderId(idParam)
      const data = await service.getOrderAudit(id)
      return { statusCode: 200, data }
    },

    async storeSettings() {
      const data = await service.getStoreSettings()
      return { statusCode: 200, data }
    },

    async updateStoreSettings(req) {
      const body = await parseJsonBody(req)
      const payload = validateUpdateStoreSettings(body)
      const data = await service.updateStoreSettings(payload)
      return { statusCode: 200, data }
    },

    async sendWhatsAppTest(req) {
      const body = await parseJsonBody(req)
      const payload = validateWhatsAppTest(body)
      const data = await service.sendWhatsAppTest(payload)
      return { statusCode: 200, data }
    },

    async startWhatsAppSession() {
      const data = await service.startWhatsAppSession()
      return { statusCode: 200, data }
    },

    async whatsAppSessionStatus() {
      const data = await service.getWhatsAppSessionStatus()
      return { statusCode: 200, data }
    },

    async whatsAppSessionQrCode() {
      const data = await service.getWhatsAppSessionQrCode()
      return { statusCode: 200, data }
    },

    async deliveryFees() {
      const data = await service.listDeliveryFees()
      return { statusCode: 200, data }
    },

    async createDeliveryFee(req) {
      const body = await parseJsonBody(req)
      const payload = validateCreateDeliveryFee(body)
      const data = await service.createDeliveryFee(payload)
      return { statusCode: 201, data }
    },

    async updateDeliveryFee(req, idParam) {
      const id = parseDeliveryFeeId(idParam)
      const body = await parseJsonBody(req)
      const payload = validateUpdateDeliveryFee(body)
      const data = await service.updateDeliveryFee(id, payload)
      return { statusCode: 200, data }
    },

    async removeDeliveryFee(idParam) {
      const id = parseDeliveryFeeId(idParam)
      const data = await service.removeDeliveryFee(id)
      return { statusCode: 200, data }
    },
  }
}

module.exports = { adminController }
