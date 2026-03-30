const { parseJsonBody } = require('../utils/http')
const {
  parseListId,
  parseTemplateId,
  parseCampaignId,
  parseMemberPhone,
  validateCreateBroadcastList,
  validateAddBroadcastMember,
  validateCreateBroadcastTemplate,
  validateCreateBroadcastCampaign,
} = require('../validators/broadcastValidator')

function broadcastController(service) {
  return {
    async lists() {
      const data = await service.listLists()
      return { statusCode: 200, data }
    },

    async createList(req) {
      const body = await parseJsonBody(req)
      const payload = validateCreateBroadcastList(body)
      const data = await service.createList(payload)
      return { statusCode: 201, data }
    },

    async removeList(idParam) {
      const id = parseListId(idParam)
      const data = await service.removeList(id)
      return { statusCode: 200, data }
    },

    async listMembers(idParam) {
      const listId = parseListId(idParam)
      const data = await service.listMembers(listId)
      return { statusCode: 200, data }
    },

    async addMember(req, idParam) {
      const listId = parseListId(idParam)
      const body = await parseJsonBody(req)
      const payload = validateAddBroadcastMember(body)
      const data = await service.addMember(listId, payload)
      return { statusCode: 201, data }
    },

    async removeMember(idParam, phoneParam) {
      const listId = parseListId(idParam)
      const phone = parseMemberPhone(phoneParam)
      const data = await service.removeMember(listId, phone)
      return { statusCode: 200, data }
    },

    async importClients(idParam) {
      const listId = parseListId(idParam)
      const data = await service.importClients(listId)
      return { statusCode: 200, data }
    },

    async templates() {
      const data = await service.listTemplates()
      return { statusCode: 200, data }
    },

    async createTemplate(req) {
      const body = await parseJsonBody(req)
      const payload = validateCreateBroadcastTemplate(body)
      const data = await service.createTemplate(payload)
      return { statusCode: 201, data }
    },

    async removeTemplate(idParam) {
      const id = parseTemplateId(idParam)
      const data = await service.removeTemplate(id)
      return { statusCode: 200, data }
    },

    async campaigns() {
      const data = await service.listCampaigns()
      return { statusCode: 200, data }
    },

    async createCampaign(req) {
      const body = await parseJsonBody(req)
      const payload = validateCreateBroadcastCampaign(body)
      const data = await service.createCampaign(payload)
      return { statusCode: 201, data }
    },

    async campaign(idParam) {
      const id = parseCampaignId(idParam)
      const data = await service.getCampaign(id)
      return { statusCode: 200, data }
    },

    async campaignLogs(idParam) {
      const id = parseCampaignId(idParam)
      const data = await service.getCampaignLogs(id)
      return { statusCode: 200, data }
    },

    async startCampaign(idParam) {
      const id = parseCampaignId(idParam)
      const data = await service.startCampaign(id)
      return { statusCode: 202, data }
    },

    async cancelCampaign(idParam) {
      const id = parseCampaignId(idParam)
      const data = await service.cancelCampaign(id)
      return { statusCode: 200, data }
    },

    async removeCampaign(idParam) {
      const id = parseCampaignId(idParam)
      const data = await service.removeCampaign(id)
      return { statusCode: 200, data }
    },
  }
}

module.exports = { broadcastController }
