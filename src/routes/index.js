const { categoriasController } = require('../controllers/categoriasController')
const { produtosController } = require('../controllers/produtosController')
const { usuariosController } = require('../controllers/usuariosController')
const { authController } = require('../controllers/authController')
const { publicController } = require('../controllers/publicController')
const { adminController } = require('../controllers/adminController')
const { whatsappController } = require('../controllers/whatsappController')
const { requireAuth, requireRole } = require('../middleware/auth')
const { categoriasService } = require('../services/categoriasService')
const { produtosService } = require('../services/produtosService')
const { usuariosService } = require('../services/usuariosService')
const { publicStoreService } = require('../services/publicStoreService')
const { adminPanelService } = require('../services/adminPanelService')
const { createWhatsAppNotificationService } = require('../services/whatsappNotificationService')
const { createWppConnectService } = require('../services/wppConnectService')
const { createWhatsAppBotService } = require('../services/whatsappBotService')

function createRouter(prisma) {
  const whatsappTransport = createWppConnectService()
  const whatsappNotifier = createWhatsAppNotificationService({ transportService: whatsappTransport })
  const whatsappBot = whatsappController(createWhatsAppBotService(prisma, { transportService: whatsappTransport }))
  const categorias = categoriasController(categoriasService(prisma))
  const produtos = produtosController(produtosService(prisma))
  const usuarios = usuariosController(usuariosService(prisma))
  const auth = authController(prisma)
  const pub = publicController(publicStoreService(prisma, { whatsappNotifier }))
  const admin = adminController(adminPanelService(prisma, { whatsappNotifier, whatsappTransport }))

  return async function route(req, method, path, url) {
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

    if (path.startsWith('/public/customer/orders/')) {
      const id = path.replace('/public/customer/orders/', '')
      if (method === 'GET') return pub.customerOrder(req, id)
    }

    if (method === 'POST' && path === '/public/orders') {
      return pub.createOrder(req)
    }

    if (path.startsWith('/public/orders/')) {
      const id = path.replace('/public/orders/', '')
      if (method === 'GET') return pub.orderStatus(id, req)
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

    if (path.startsWith('/categorias/')) {
      const id = path.replace('/categorias/', '')
      if (method === 'GET') return categorias.getById(id)
      if (method === 'PUT') {
        requireRole(req, 'admin')
        return categorias.update(req, id)
      }
      if (method === 'DELETE') {
        requireRole(req, 'admin')
        return categorias.remove(id)
      }
    }

    if (method === 'GET' && path === '/produtos') {
      return produtos.list(url)
    }

    if (method === 'POST' && path === '/produtos') {
      requireRole(req, 'admin')
      return produtos.create(req)
    }

    if (path.startsWith('/produtos/')) {
      const id = path.replace('/produtos/', '')
      if (method === 'GET') return produtos.getById(id)
      if (method === 'PUT') {
        requireRole(req, 'admin')
        return produtos.update(req, id)
      }
      if (method === 'DELETE') {
        requireRole(req, 'admin')
        return produtos.remove(id)
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

    if (path.startsWith('/usuarios/')) {
      const rest = path.replace('/usuarios/', '')
      const auth = requireRole(req, 'admin')

      if (rest.endsWith('/reset-password')) {
        const id = rest.replace('/reset-password', '')
        if (method === 'POST') return usuarios.resetPassword(req, id, Number.parseInt(auth.sub, 10))
      } else {
        if (method === 'PUT') return usuarios.update(req, rest, Number.parseInt(auth.sub, 10))
        if (method === 'DELETE') return usuarios.remove(rest, Number.parseInt(auth.sub, 10))
      }
    }

    if (method === 'GET' && path === '/admin/dashboard') {
      requireRole(req, 'admin')
      return admin.dashboard(url)
    }

    if (method === 'GET' && path === '/admin/customers') {
      requireRole(req, 'admin')
      return admin.customers(url)
    }

    if (path.startsWith('/admin/customers/')) {
      const id = path.replace('/admin/customers/', '')
      if (method === 'GET') {
        requireRole(req, 'admin')
        return admin.customer(id)
      }
    }

    if (method === 'GET' && path === '/admin/orders') {
      requireRole(req, 'admin')
      return admin.orders(url)
    }

    if (path.startsWith('/admin/orders/')) {
      const rest = path.replace('/admin/orders/', '')
      if (rest.endsWith('/status') && method === 'PUT') {
        requireRole(req, 'admin')
        const id = rest.replace('/status', '')
        return admin.updateOrderStatus(req, id)
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

    if (path.startsWith('/admin/delivery-fees/')) {
      const id = path.replace('/admin/delivery-fees/', '')
      if (method === 'PUT') {
        requireRole(req, 'admin')
        return admin.updateDeliveryFee(req, id)
      }
      if (method === 'DELETE') {
        requireRole(req, 'admin')
        return admin.removeDeliveryFee(id)
      }
    }

    return null
  }
}

module.exports = { createRouter }
