const { categoriasController } = require('../controllers/categoriasController')
const { produtosController } = require('../controllers/produtosController')
const { usuariosController } = require('../controllers/usuariosController')
const { authController } = require('../controllers/authController')
const { publicController } = require('../controllers/publicController')
const { adminController } = require('../controllers/adminController')
const { broadcastController } = require('../controllers/broadcastController')
const { flowsController } = require('../controllers/flowsController')
const { whatsappController } = require('../controllers/whatsappController')
const { paymentsController } = require('../controllers/paymentsController')
const { requireAuth, requireRole } = require('../middleware/auth')
const { categoriasService } = require('../services/categoriasService')
const { produtosService } = require('../services/produtosService')
const { usuariosService } = require('../services/usuariosService')
const { publicStoreService } = require('../services/publicStoreService')
const { adminPanelService } = require('../services/adminPanelService')
const { createBroadcastService } = require('../services/broadcastService')
const { createFlowsService } = require('../services/flowsService')
const { createWhatsAppNotificationService } = require('../services/whatsappNotificationService')
const { createWppConnectService } = require('../services/wppConnectService')
const { createWhatsAppBotService } = require('../services/whatsappBotService')
const { createAsaasService } = require('../services/asaasService')
const { createAdminEventsBroker } = require('../services/adminEventsBroker')

function escapeRegexSegment(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compileRoutePattern(pattern) {
  const segments = String(pattern)
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith(':')) {
        return `(?<${segment.slice(1)}>[^/]+)`
      }

      return escapeRegexSegment(segment)
    })

  return new RegExp(`^/${segments.join('/')}$`)
}

function matchRoute(path, pattern) {
  return pattern.exec(String(path || ''))?.groups || null
}

const ROUTE_PATTERNS = {
  publicCustomerOrder: compileRoutePattern('/public/customer/orders/:id'),
  publicOrderStatus: compileRoutePattern('/public/orders/:id'),
  publicOrderTracking: compileRoutePattern('/public/orders/:id/tracking'),
  apiOrderStatus: compileRoutePattern('/api/orders/:id/status'),
  apiOrderDetail: compileRoutePattern('/api/orders/:id'),
  apiCheckoutRetry: compileRoutePattern('/api/checkout/:id/retry'),
  categoriaById: compileRoutePattern('/categorias/:id'),
  produtoById: compileRoutePattern('/produtos/:id'),
  usuarioResetPassword: compileRoutePattern('/usuarios/:id/reset-password'),
  usuarioById: compileRoutePattern('/usuarios/:id'),
  adminCustomerById: compileRoutePattern('/admin/customers/:id'),
  adminOrderAudit: compileRoutePattern('/admin/orders/:id/audit'),
  adminOrderStatus: compileRoutePattern('/admin/orders/:id/status'),
  adminDeliveryFeeById: compileRoutePattern('/admin/delivery-fees/:id'),
  broadcastListById: compileRoutePattern('/admin/broadcast/lists/:id'),
  broadcastListMembers: compileRoutePattern('/admin/broadcast/lists/:id/members'),
  broadcastListMemberByPhone: compileRoutePattern('/admin/broadcast/lists/:id/members/:phone'),
  broadcastListImportClients: compileRoutePattern('/admin/broadcast/lists/:id/import-clients'),
  broadcastTemplateById: compileRoutePattern('/admin/broadcast/templates/:id'),
  broadcastCampaignById: compileRoutePattern('/admin/broadcast/campaigns/:id'),
  broadcastCampaignLogs: compileRoutePattern('/admin/broadcast/campaigns/:id/logs'),
  broadcastCampaignStart: compileRoutePattern('/admin/broadcast/campaigns/:id/start'),
  broadcastCampaignCancel: compileRoutePattern('/admin/broadcast/campaigns/:id/cancel'),
  broadcastCampaignRetryFailed: compileRoutePattern('/admin/broadcast/campaigns/:id/retry-failed'),
  adminFlowById: compileRoutePattern('/admin/flows/:id'),
  adminFlowPublish: compileRoutePattern('/admin/flows/:id/publish'),
  adminFlowUnpublish: compileRoutePattern('/admin/flows/:id/unpublish'),
}

function createRouter(prisma, deps = {}) {
  const whatsappTransport = deps.whatsappTransport || createWppConnectService()
  const whatsappNotifier = deps.whatsappNotifier || createWhatsAppNotificationService({ transportService: whatsappTransport })
  const adminEvents = deps.adminEventsBroker || createAdminEventsBroker()
  const broadcastService = createBroadcastService(prisma, { whatsappTransport, logger: deps.logger })
  const whatsappBot = whatsappController(createWhatsAppBotService(prisma, {
    transportService: whatsappTransport,
    logger: deps.logger,
    broadcastService,
  }))
  const asaas = deps.asaasService || createAsaasService()
  const categorias = categoriasController(categoriasService(prisma))
  const produtos = produtosController(produtosService(prisma))
  const usuarios = usuariosController(usuariosService(prisma))
  const auth = authController(prisma)
  const storeService = deps.storeService || publicStoreService(prisma, {
    whatsappNotifier,
    asaas,
    adminEvents,
    scheduleTask: deps.scheduleTask,
    logger: deps.logger,
  })
  const pub = publicController(storeService)
  const payments = paymentsController(deps.paymentsService || storeService)
  const admin = adminController(
    adminPanelService(prisma, { whatsappNotifier, whatsappTransport, adminEvents }),
    { adminEvents },
  )
  const broadcast = broadcastController(broadcastService)
  const flows = flowsController(createFlowsService(prisma))

  return async function route(req, res, method, path, url) {
    if (method === 'GET' && path === '/health') {
      return { statusCode: 200, data: { ok: true } }
    }

    if (method === 'GET' && path === '/whatsapp/webhook') {
      return whatsappBot.verify(url)
    }

    if (method === 'POST' && path === '/whatsapp/webhook') {
      return whatsappBot.webhook(req, url)
    }

    if (method === 'GET' && path === '/public/store') {
      return pub.store()
    }

    if (method === 'GET' && path === '/public/menu') {
      return pub.menu()
    }

    if (method === 'POST' && path === '/public/customer/login') {
      return pub.customerLogin(req)
    }

    if (method === 'POST' && path === '/public/customer/register') {
      return pub.createCustomerAccount(req)
    }

    if (method === 'GET' && path === '/public/customer/check-phone') {
      return pub.customerPhoneAvailability(url)
    }

    if (method === 'PUT' && path === '/public/customer/profile') {
      return pub.updateCustomerProfile(req)
    }

    if (method === 'GET' && path === '/public/customer/orders') {
      return pub.customerOrders(req)
    }

    const publicCustomerOrderMatch = matchRoute(path, ROUTE_PATTERNS.publicCustomerOrder)
    if (publicCustomerOrderMatch) {
      if (method === 'GET') return pub.customerOrder(req, publicCustomerOrderMatch.id)
    }

    if (method === 'POST' && path === '/public/orders') {
      return pub.createOrder(req)
    }

    if (method === 'POST' && path === '/api/checkout/create') {
      return pub.createCheckout(req)
    }

    if (method === 'POST' && path === '/webhooks/asaas') {
      return payments.asaasWebhook(req)
    }

    if (method === 'POST' && path === '/api/webhooks/asaas') {
      return payments.asaasWebhook(req)
    }

    const publicOrderStatusMatch = matchRoute(path, ROUTE_PATTERNS.publicOrderStatus)
    if (publicOrderStatusMatch) {
      if (method === 'GET') return pub.orderStatus(publicOrderStatusMatch.id, req)
    }

    const publicOrderTrackingMatch = matchRoute(path, ROUTE_PATTERNS.publicOrderTracking)
    if (publicOrderTrackingMatch) {
      if (method === 'GET') return pub.publicOrderTracking(url, publicOrderTrackingMatch.id)
    }

    const apiOrderStatusMatch = matchRoute(path, ROUTE_PATTERNS.apiOrderStatus)
    if (apiOrderStatusMatch) {
      if (method === 'GET') {
        return pub.orderStatusSummary(req, apiOrderStatusMatch.id)
      }
    }

    const apiOrderDetailMatch = matchRoute(path, ROUTE_PATTERNS.apiOrderDetail)
    if (apiOrderDetailMatch) {
      if (method === 'GET') {
        return pub.customerOrder(req, apiOrderDetailMatch.id)
      }
    }

    const apiCheckoutRetryMatch = matchRoute(path, ROUTE_PATTERNS.apiCheckoutRetry)
    if (apiCheckoutRetryMatch) {
      if (method === 'POST') {
        return pub.retryCheckout(req, apiCheckoutRetryMatch.id)
      }
    }

    if (method === 'POST' && path === '/auth/login') {
      return auth.login(req)
    }

    if (method === 'POST' && path === '/auth/refresh') {
      return auth.refresh(req)
    }

    if (method === 'POST' && path === '/auth/logout') {
      return auth.logout(req)
    }

    if (method === 'GET' && path === '/auth/me') {
      const user = requireAuth(req)
      return {
        statusCode: 200,
        data: {
          user: {
            id: user.sub,
            username: user.username,
            role: user.role,
          },
        },
      }
    }

    if (method === 'GET' && path === '/categorias') {
      return categorias.list(url)
    }

    if (method === 'POST' && path === '/categorias') {
      requireRole(req, 'admin')
      return categorias.create(req)
    }

    const categoriaByIdMatch = matchRoute(path, ROUTE_PATTERNS.categoriaById)
    if (categoriaByIdMatch) {
      if (method === 'GET') return categorias.getById(categoriaByIdMatch.id)
      if (method === 'PUT') {
        requireRole(req, 'admin')
        return categorias.update(req, categoriaByIdMatch.id)
      }
      if (method === 'DELETE') {
        requireRole(req, 'admin')
        return categorias.remove(categoriaByIdMatch.id)
      }
    }

    if (method === 'GET' && path === '/produtos') {
      return produtos.list(url)
    }

    if (method === 'POST' && path === '/produtos') {
      requireRole(req, 'admin')
      return produtos.create(req)
    }

    const produtoByIdMatch = matchRoute(path, ROUTE_PATTERNS.produtoById)
    if (produtoByIdMatch) {
      if (method === 'GET') return produtos.getById(produtoByIdMatch.id)
      if (method === 'PUT') {
        requireRole(req, 'admin')
        return produtos.update(req, produtoByIdMatch.id)
      }
      if (method === 'DELETE') {
        requireRole(req, 'admin')
        return produtos.remove(produtoByIdMatch.id)
      }
    }

    if (method === 'GET' && path === '/usuarios') {
      requireRole(req, 'admin')
      return usuarios.list(url)
    }

    if (method === 'POST' && path === '/usuarios') {
      const auth = requireRole(req, 'admin')
      return usuarios.create(req, Number.parseInt(auth.sub, 10))
    }

    const usuarioResetPasswordMatch = matchRoute(path, ROUTE_PATTERNS.usuarioResetPassword)
    if (usuarioResetPasswordMatch) {
      const auth = requireRole(req, 'admin')
      if (method === 'POST') return usuarios.resetPassword(req, usuarioResetPasswordMatch.id, Number.parseInt(auth.sub, 10))
    }

    const usuarioByIdMatch = matchRoute(path, ROUTE_PATTERNS.usuarioById)
    if (usuarioByIdMatch) {
      const auth = requireRole(req, 'admin')
      if (method === 'PUT') return usuarios.update(req, usuarioByIdMatch.id, Number.parseInt(auth.sub, 10))
      if (method === 'DELETE') return usuarios.remove(usuarioByIdMatch.id, Number.parseInt(auth.sub, 10))
    }

    if (method === 'GET' && path === '/admin/dashboard') {
      requireRole(req, 'admin')
      return admin.dashboard(url)
    }

    if (method === 'GET' && path === '/admin/events') {
      requireRole(req, 'admin')
      return admin.events(req, res)
    }

    if (method === 'GET' && path === '/admin/customers') {
      requireRole(req, 'admin')
      return admin.customers(url)
    }

    const adminCustomerByIdMatch = matchRoute(path, ROUTE_PATTERNS.adminCustomerById)
    if (adminCustomerByIdMatch) {
      if (method === 'GET') {
        requireRole(req, 'admin')
        return admin.customer(adminCustomerByIdMatch.id)
      }
    }

    if (method === 'GET' && path === '/admin/orders') {
      requireRole(req, 'admin')
      return admin.orders(url)
    }

    const adminOrderAuditMatch = matchRoute(path, ROUTE_PATTERNS.adminOrderAudit)
    if (adminOrderAuditMatch) {
      if (method === 'GET') {
        requireRole(req, 'admin')
        return admin.orderAudit(adminOrderAuditMatch.id)
      }
    }

    const adminOrderStatusMatch = matchRoute(path, ROUTE_PATTERNS.adminOrderStatus)
    if (adminOrderStatusMatch) {
      if (method === 'PUT') {
        requireRole(req, 'admin')
        return admin.updateOrderStatus(req, adminOrderStatusMatch.id)
      }
    }

    if (method === 'GET' && path === '/admin/store-settings') {
      requireRole(req, 'admin')
      return admin.storeSettings()
    }

    if (method === 'PUT' && path === '/admin/store-settings') {
      requireRole(req, 'admin')
      return admin.updateStoreSettings(req)
    }

    if (method === 'POST' && path === '/admin/whatsapp/test') {
      requireRole(req, 'admin')
      return admin.sendWhatsAppTest(req)
    }

    if (method === 'POST' && path === '/admin/whatsapp/session/start') {
      requireRole(req, 'admin')
      return admin.startWhatsAppSession()
    }

    if (method === 'GET' && path === '/admin/whatsapp/session/status') {
      requireRole(req, 'admin')
      return admin.whatsAppSessionStatus()
    }

    if (method === 'GET' && path === '/admin/whatsapp/session/qrcode') {
      requireRole(req, 'admin')
      return admin.whatsAppSessionQrCode()
    }

    if (method === 'GET' && path === '/admin/delivery-fees') {
      requireRole(req, 'admin')
      return admin.deliveryFees()
    }

    if (method === 'POST' && path === '/admin/delivery-fees') {
      requireRole(req, 'admin')
      return admin.createDeliveryFee(req)
    }

    const adminDeliveryFeeByIdMatch = matchRoute(path, ROUTE_PATTERNS.adminDeliveryFeeById)
    if (adminDeliveryFeeByIdMatch) {
      if (method === 'PUT') {
        requireRole(req, 'admin')
        return admin.updateDeliveryFee(req, adminDeliveryFeeByIdMatch.id)
      }
      if (method === 'DELETE') {
        requireRole(req, 'admin')
        return admin.removeDeliveryFee(adminDeliveryFeeByIdMatch.id)
      }
    }

    if (method === 'GET' && path === '/admin/broadcast/lists') {
      requireRole(req, 'admin')
      return broadcast.lists()
    }

    if (method === 'POST' && path === '/admin/broadcast/lists') {
      requireRole(req, 'admin')
      return broadcast.createList(req)
    }

    if (method === 'POST' && path === '/admin/broadcast/audience/preview') {
      requireRole(req, 'admin')
      return broadcast.previewAudience(req)
    }

    if (method === 'POST' && path === '/admin/broadcast/audience/create-list') {
      requireRole(req, 'admin')
      return broadcast.createListFromFilter(req)
    }

    const broadcastListByIdMatch = matchRoute(path, ROUTE_PATTERNS.broadcastListById)
    if (broadcastListByIdMatch) {
      if (method === 'DELETE') {
        requireRole(req, 'admin')
        return broadcast.removeList(broadcastListByIdMatch.id)
      }
    }

    const broadcastListMembersMatch = matchRoute(path, ROUTE_PATTERNS.broadcastListMembers)
    if (broadcastListMembersMatch) {
      if (method === 'GET') {
        requireRole(req, 'admin')
        return broadcast.listMembers(url, broadcastListMembersMatch.id)
      }

      if (method === 'POST') {
        requireRole(req, 'admin')
        return broadcast.addMember(req, broadcastListMembersMatch.id)
      }
    }

    const broadcastListMemberByPhoneMatch = matchRoute(path, ROUTE_PATTERNS.broadcastListMemberByPhone)
    if (broadcastListMemberByPhoneMatch) {
      if (method === 'DELETE') {
        requireRole(req, 'admin')
        return broadcast.removeMember(
          broadcastListMemberByPhoneMatch.id,
          broadcastListMemberByPhoneMatch.phone,
        )
      }
    }

    const broadcastListImportClientsMatch = matchRoute(path, ROUTE_PATTERNS.broadcastListImportClients)
    if (broadcastListImportClientsMatch) {
      if (method === 'POST') {
        requireRole(req, 'admin')
        return broadcast.importClients(broadcastListImportClientsMatch.id)
      }
    }

    if (method === 'GET' && path === '/admin/broadcast/templates') {
      requireRole(req, 'admin')
      return broadcast.templates()
    }

    if (method === 'POST' && path === '/admin/broadcast/templates') {
      requireRole(req, 'admin')
      return broadcast.createTemplate(req)
    }

    const broadcastTemplateByIdMatch = matchRoute(path, ROUTE_PATTERNS.broadcastTemplateById)
    if (broadcastTemplateByIdMatch) {
      if (method === 'DELETE') {
        requireRole(req, 'admin')
        return broadcast.removeTemplate(broadcastTemplateByIdMatch.id)
      }
    }

    if (method === 'GET' && path === '/admin/broadcast/campaigns') {
      requireRole(req, 'admin')
      return broadcast.campaigns()
    }

    if (method === 'POST' && path === '/admin/broadcast/campaigns') {
      requireRole(req, 'admin')
      return broadcast.createCampaign(req)
    }

    const broadcastCampaignByIdMatch = matchRoute(path, ROUTE_PATTERNS.broadcastCampaignById)
    if (broadcastCampaignByIdMatch) {
      if (method === 'GET') {
        requireRole(req, 'admin')
        return broadcast.campaign(broadcastCampaignByIdMatch.id)
      }
      if (method === 'DELETE') {
        requireRole(req, 'admin')
        return broadcast.removeCampaign(broadcastCampaignByIdMatch.id)
      }
    }

    const broadcastCampaignLogsMatch = matchRoute(path, ROUTE_PATTERNS.broadcastCampaignLogs)
    if (broadcastCampaignLogsMatch) {
      if (method === 'GET') {
        requireRole(req, 'admin')
        return broadcast.campaignLogs(url, broadcastCampaignLogsMatch.id)
      }
    }

    const broadcastCampaignStartMatch = matchRoute(path, ROUTE_PATTERNS.broadcastCampaignStart)
    if (broadcastCampaignStartMatch) {
      if (method === 'POST') {
        requireRole(req, 'admin')
        return broadcast.startCampaign(broadcastCampaignStartMatch.id)
      }
    }

    const broadcastCampaignCancelMatch = matchRoute(path, ROUTE_PATTERNS.broadcastCampaignCancel)
    if (broadcastCampaignCancelMatch) {
      if (method === 'POST') {
        requireRole(req, 'admin')
        return broadcast.cancelCampaign(broadcastCampaignCancelMatch.id)
      }
    }

    const broadcastCampaignRetryFailedMatch = matchRoute(path, ROUTE_PATTERNS.broadcastCampaignRetryFailed)
    if (broadcastCampaignRetryFailedMatch) {
      if (method === 'POST') {
        requireRole(req, 'admin')
        return broadcast.retryFailedCampaign(broadcastCampaignRetryFailedMatch.id)
      }
    }

    if (method === 'GET' && path === '/admin/flows') {
      requireRole(req, 'admin')
      return flows.listFlows()
    }

    if (method === 'POST' && path === '/admin/flows') {
      requireRole(req, 'admin')
      return flows.createFlow(req)
    }

    if (method === 'GET' && path === '/admin/flows/sessions/active') {
      requireRole(req, 'admin')
      return flows.activeSessions()
    }

    const adminFlowPublishMatch = matchRoute(path, ROUTE_PATTERNS.adminFlowPublish)
    if (adminFlowPublishMatch) {
      if (method === 'POST') {
        requireRole(req, 'admin')
        return flows.publishFlow(adminFlowPublishMatch.id)
      }
    }

    const adminFlowUnpublishMatch = matchRoute(path, ROUTE_PATTERNS.adminFlowUnpublish)
    if (adminFlowUnpublishMatch) {
      if (method === 'POST') {
        requireRole(req, 'admin')
        return flows.unpublishFlow(adminFlowUnpublishMatch.id)
      }
    }

    const adminFlowByIdMatch = matchRoute(path, ROUTE_PATTERNS.adminFlowById)
    if (adminFlowByIdMatch) {
      if (method === 'GET') {
        requireRole(req, 'admin')
        return flows.getFlow(adminFlowByIdMatch.id)
      }
      if (method === 'PUT') {
        requireRole(req, 'admin')
        return flows.updateFlow(req, adminFlowByIdMatch.id)
      }
      if (method === 'DELETE') {
        requireRole(req, 'admin')
        return flows.removeFlow(adminFlowByIdMatch.id)
      }
    }

    return null
  }
}

module.exports = { createRouter }
