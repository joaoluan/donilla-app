const { AppError } = require('../utils/errors')
const { signToken, verifyToken } = require('../utils/jwt')
const { hashPassword, verifyPassword } = require('../utils/password')
const { cleanLocationField, resolveDeliveryFee } = require('../utils/deliveryFees')
const { normalizeStoreSettings, toPublicStoreSettings } = require('../utils/storeSettings')
const {
  isStrongCustomerPassword,
  CUSTOMER_PASSWORD_RULE_MESSAGE,
} = require('../validators/publicOrderValidator')

const CLIENT_SESSION_TTL_SECONDS = 3600

function toMoney(value) {
  const n = Number(value || 0)
  return Number.isNaN(n) ? 0 : n
}

function toObservations(value) {
  if (value === undefined || value === null) return null
  const normalized = String(value).trim()
  return normalized || null
}

function toPhone(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .trim()
}

function normalizePaymentMethod(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (normalized === 'pix') return 'pix'

  throw new AppError(400, 'No momento aceitamos apenas Pix.')
}

function resolvePaymentStatus() {
  return 'pendente'
}

function toAddress(input) {
  if (!input || typeof input !== 'object') return null

  return {
    rua: String(input.rua || '').trim(),
    numero: String(input.numero || '').trim(),
    bairro: String(input.bairro || '').trim(),
    cidade: cleanLocationField(input.cidade),
    complemento: input.complemento ? String(input.complemento).trim() : undefined,
    referencia: input.referencia ? String(input.referencia).trim() : undefined,
  }
}

function cleanAddressForClient(endereco) {
  if (!endereco) return null
  return {
    rua: endereco.rua,
    numero: endereco.numero,
    bairro: endereco.bairro,
    cidade: endereco.cidade || null,
    complemento: endereco.complemento || null,
    referencia: endereco.referencia || null,
  }
}

function buildCustomerSessionFromCliente(cliente, latestEndereco = null) {
  const endereco = latestEndereco || cliente?.enderecos?.[0] || null
  const normalizedEndereco = cleanAddressForClient(endereco)

  const payload = {
    customer_id: cliente.id,
    telefone_whatsapp: cliente.telefone_whatsapp,
    nome: cliente.nome,
    has_endereco: Boolean(normalizedEndereco),
    endereco: normalizedEndereco,
  }

  return {
    found: true,
    has_endereco: Boolean(normalizedEndereco),
    endereco: normalizedEndereco,
    cliente_session_token: issueCustomerSession(payload, CLIENT_SESSION_TTL_SECONDS),
    cliente: {
      nome: cliente.nome,
      telefone_whatsapp: cliente.telefone_whatsapp,
    },
  }
}

function getSessionSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new AppError(500, 'JWT_SECRET nao configurado no ambiente.')
  return secret
}

function issueCustomerSession(payload, ttlSeconds = 3600) {
  return signToken(
    {
      purpose: 'customer_session',
      ...payload,
    },
    getSessionSecret(),
    ttlSeconds,
  )
}

function parseCustomerSessionToken(rawToken) {
  if (!rawToken) {
    throw new AppError(401, 'Sessao de cliente obrigatoria.')
  }

  try {
    const payload = verifyToken(rawToken, getSessionSecret())
    if (!payload || payload.purpose !== 'customer_session') {
      throw new AppError(401, 'Token de sessao de cliente invalido.')
    }

    return payload
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(401, 'Token de sessao de cliente invalido.', error.message)
  }
}

function getTokenFromAddress(endereco) {
  const normalized = toAddress(endereco)
  if (!normalized || !normalized.rua || !normalized.numero || !normalized.bairro) return null

  return normalized
}

function toSessionCustomerId(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function toStockValue(value) {
  if (value === null || value === undefined) return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return null

  return parsed
}

function assertOrderBelongsToSession(order, session) {
  if (!order || !session) {
    throw new AppError(404, 'Pedido nao encontrado.')
  }

  const sessionCustomerId = toSessionCustomerId(session.customer_id)
  if (sessionCustomerId) {
    if (order.cliente_id !== sessionCustomerId) {
      throw new AppError(403, 'Voce nao tem acesso a este pedido.')
    }
    return
  }

  const sessionTelefone = toPhone(session.telefone_whatsapp)
  if (sessionTelefone && order.clientes?.telefone_whatsapp === sessionTelefone) return

  throw new AppError(403, 'Voce nao tem acesso a este pedido.')
}

function mapOrderSummary(order) {
  return {
    id: order.id,
    metodo_pagamento: order.metodo_pagamento,
    status_entrega: order.status_entrega,
    status_pagamento: order.status_pagamento,
    valor_total: order.valor_total,
    observacoes: order.observacoes || null,
    criado_em: order.criado_em,
    endereco: order.enderecos ? cleanAddressForClient(order.enderecos) : null,
    itens_pedido: order.itens_pedido?.map((item) => ({
      id: item.id,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      subtotal: item.subtotal,
      produto: item.produtos
        ? {
            id: item.produtos.id,
            nome_doce: item.produtos.nome_doce,
            preco: item.produtos.preco,
          }
        : null,
    })),
  }
}

function buildNotificationOrderData({
  pedido,
  cliente,
  endereco,
  itens,
  produtosById,
  metodo_pagamento,
}) {
  return {
    id: pedido.id,
    status_entrega: pedido.status_entrega,
    status_pagamento: pedido.status_pagamento,
    valor_total: pedido.valor_total,
    valor_entrega: pedido.valor_entrega,
    metodo_pagamento,
    observacoes: pedido.observacoes || null,
    criado_em: pedido.criado_em,
    cliente: {
      id: cliente.id,
      nome: cliente.nome,
      telefone_whatsapp: cliente.telefone_whatsapp,
    },
    endereco: cleanAddressForClient(endereco),
    itens: itens.map((item) => {
      const produto = produtosById.get(item.produto_id)
      return {
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        subtotal: item.subtotal,
        produto: produto
          ? {
              id: produto.id,
              nome_doce: produto.nome_doce,
              preco: produto.preco,
            }
          : null,
      }
    }),
  }
}

function publicStoreService(prisma, deps = {}) {
  const whatsappNotifier = deps.whatsappNotifier || null

  async function getStoreConfig() {
    const config = await prisma.configuracoes_loja.findFirst({
      orderBy: { id: 'asc' },
    })

    return normalizeStoreSettings(config || {})
  }

  async function listActiveDeliveryFees() {
    return prisma.taxas_entrega_locais.findMany({
      where: { ativo: true },
      orderBy: [{ cidade: 'asc' }, { bairro: 'asc' }, { id: 'asc' }],
    })
  }

  return {
    async getStore() {
      const [config, taxas_entrega_locais] = await Promise.all([getStoreConfig(), listActiveDeliveryFees()])

      return {
        ...toPublicStoreSettings(config),
        taxas_entrega_locais,
      }
    },

    async getCustomerByPhone(telefone_whatsapp) {
      const telefone = toPhone(telefone_whatsapp)
      if (!telefone) {
        return { found: false }
      }

      const cliente = await prisma.clientes.findFirst({
        where: { telefone_whatsapp: telefone },
        include: {
          enderecos: {
            orderBy: { id: 'desc' },
            take: 1,
          },
        },
      })

      if (!cliente) return { found: false }

      return buildCustomerSessionFromCliente(cliente)
    },

    async createCustomerSession(input) {
      const payload = {
        customer_id: null,
        telefone_whatsapp: toPhone(input?.telefone_whatsapp),
        nome: String(input?.nome || '').trim(),
        is_new: true,
        endereco: toAddress(input?.endereco),
      }

      return {
        found: false,
        has_endereco: Boolean(payload.endereco?.rua && payload.endereco?.numero && payload.endereco?.bairro),
        cliente_session_token: issueCustomerSession(payload, CLIENT_SESSION_TTL_SECONDS),
        endereco: cleanAddressForClient(payload.endereco),
        cliente: {
          nome: payload.nome,
          telefone_whatsapp: payload.telefone_whatsapp,
        },
      }
    },

    async customerPhoneAvailability(telefone_whatsapp) {
      const telefone = toPhone(telefone_whatsapp)
      if (!telefone) {
        return { exists: false, telefone_whatsapp: '' }
      }

      const user = await prisma.usuarios.findUnique({
        where: { username: telefone },
        select: { id: true },
      })

      return {
        exists: Boolean(user),
        telefone_whatsapp: telefone,
      }
    },

    async createCustomerAccount(input) {
      const nome = String(input?.nome || '').trim()
      const telefone = toPhone(input?.telefone_whatsapp)
      const senha = String(input?.senha || '')
      const endereco = toAddress(input?.endereco)

      if (!nome) {
        throw new AppError(400, 'Nome do cliente invalido.')
      }

      if (!telefone) {
        throw new AppError(400, 'Telefone invalido.')
      }

      if (!isStrongCustomerPassword(senha)) {
        throw new AppError(400, CUSTOMER_PASSWORD_RULE_MESSAGE)
      }

      if (!endereco || !endereco.rua || !endereco.numero || !endereco.bairro) {
        throw new AppError(400, 'Endereco invalido.')
      }

      return prisma.$transaction(async (tx) => {
        const usernameInUse = await tx.usuarios.findUnique({
          where: { username: telefone },
        })

        if (usernameInUse) {
          throw new AppError(409, 'Telefone já possui cadastro.')
        }

        let cliente = await tx.clientes.findUnique({
          where: { telefone_whatsapp: telefone },
        })

        if (!cliente) {
          cliente = await tx.clientes.create({
            data: {
              nome,
              telefone_whatsapp: telefone,
            },
          })
        } else if (cliente.nome !== nome) {
          cliente = await tx.clientes.update({
            where: { id: cliente.id },
            data: { nome },
          })
        }

        const enderecoCriado = await tx.enderecos.create({
          data: {
            cliente_id: cliente.id,
            rua: endereco.rua,
            numero: endereco.numero,
            bairro: endereco.bairro,
            cidade: endereco.cidade,
            complemento: endereco.complemento,
            referencia: endereco.referencia,
          },
        })

        await tx.usuarios.create({
          data: {
            username: telefone,
            password_hash: hashPassword(senha),
            role: 'cliente',
            ativo: true,
          },
        })

        return buildCustomerSessionFromCliente(
          {
            ...cliente,
            enderecos: [enderecoCriado],
          },
          enderecoCriado,
        )
      })
    },

    async customerLogin(input) {
      const telefone = toPhone(input?.telefone_whatsapp)
      const senha = String(input?.senha || '')

      if (!telefone || !senha) {
        throw new AppError(400, 'Telefone e senha obrigatorios.')
      }

      const user = await prisma.usuarios.findUnique({
        where: { username: telefone },
      })

      if (!user || !user.ativo) {
        throw new AppError(401, 'Credenciais invalidas.')
      }

      if (user.role !== 'cliente') {
        throw new AppError(403, 'Acesso negado para esse perfil.')
      }

      const validPassword = verifyPassword(senha, user.password_hash)
      if (!validPassword) {
        throw new AppError(401, 'Credenciais invalidas.')
      }

      const cliente = await prisma.clientes.findUnique({
        where: { telefone_whatsapp: telefone },
        include: {
          enderecos: {
            orderBy: { id: 'desc' },
            take: 1,
          },
        },
      })

      if (!cliente) {
        const novoCliente = await prisma.clientes.create({
          data: {
            nome: telefone,
            telefone_whatsapp: telefone,
          },
          include: {
            enderecos: {
              orderBy: { id: 'desc' },
              take: 1,
            },
          },
        })

        return buildCustomerSessionFromCliente(novoCliente)
      }

      return buildCustomerSessionFromCliente(cliente)
    },

    async updateCustomerProfile(rawSessionToken, input) {
      const session = parseCustomerSessionToken(rawSessionToken)
      const nome = String(input?.nome || '').trim()
      const endereco = toAddress(input?.endereco)

      const sessionCustomerId = toSessionCustomerId(session.customer_id)
      const telefone = toPhone(session.telefone_whatsapp)

      if (!telefone) {
        throw new AppError(401, 'Sessao de cliente invalida.')
      }

      const cliente = await prisma.clientes.findFirst({
        where: sessionCustomerId ? { id: sessionCustomerId } : { telefone_whatsapp: telefone },
      })

      if (!cliente) {
        throw new AppError(404, 'Cliente nao encontrado.')
      }

      return prisma.$transaction(async (tx) => {
        let clienteAtualizado = cliente

        if (nome && nome !== cliente.nome) {
          clienteAtualizado = await tx.clientes.update({
            where: { id: cliente.id },
            data: { nome },
          })
        }

        if (endereco && endereco.rua && endereco.numero && endereco.bairro) {
          await tx.enderecos.create({
            data: {
              cliente_id: cliente.id,
              rua: endereco.rua,
              numero: endereco.numero,
              bairro: endereco.bairro,
              cidade: endereco.cidade,
              complemento: endereco.complemento,
              referencia: endereco.referencia,
            },
          })
        }

        const refreshedCliente = await tx.clientes.findUnique({
          where: { id: clienteAtualizado.id },
          include: {
            enderecos: {
              orderBy: { id: 'desc' },
              take: 1,
            },
          },
        })

        return buildCustomerSessionFromCliente(refreshedCliente, refreshedCliente?.enderecos?.[0] || null)
      })
    },

    async getMenu() {
      const categorias = await prisma.categorias.findMany({
        orderBy: [{ ordem_exibicao: 'asc' }, { id: 'asc' }],
        include: {
          produtos: {
            where: { ativo: true },
            orderBy: { id: 'asc' },
          },
        },
      })
      return categorias
    },

    async createOrder(input) {
      const [config, taxasEntrega] = await Promise.all([getStoreConfig(), listActiveDeliveryFees()])
      const lojaAberta = config?.loja_aberta ?? true
      if (!lojaAberta) {
        throw new AppError(409, 'Loja fechada no momento.')
      }

      const produtoIds = input.itens.map((item) => item.produto_id)
      const uniqueProdutoIds = [...new Set(produtoIds)]
      const requestedByProduto = input.itens.reduce((acc, item) => {
        acc[item.produto_id] = (acc[item.produto_id] || 0) + item.quantidade
        return acc
      }, {})
      const produtos = await prisma.produtos.findMany({
        where: { id: { in: uniqueProdutoIds }, ativo: true },
      })

      if (produtos.length !== uniqueProdutoIds.length) {
        throw new AppError(400, 'Um ou mais produtos estao invalidos ou inativos.')
      }

      const produtosById = new Map(produtos.map((p) => [p.id, p]))
      for (const produtoId of uniqueProdutoIds) {
        const produto = produtosById.get(produtoId)
        const estoque = toStockValue(produto?.estoque_disponivel)
        const solicitado = requestedByProduto[produtoId] || 0

        if (estoque !== null && estoque < solicitado) {
          const nome = produto?.nome_doce || `Produto ${produtoId}`
          throw new AppError(409, `Produto "${nome}" sem estoque suficiente (${estoque} disponível).`)
        }
      }
      const itensCalculados = input.itens.map((item) => {
        const produto = produtosById.get(item.produto_id)
        const precoUnitario = toMoney(produto.preco)
        const subtotal = precoUnitario * item.quantidade

        return {
          produto_id: item.produto_id,
          quantidade: item.quantidade,
          preco_unitario: precoUnitario.toFixed(2),
          subtotal: subtotal.toFixed(2),
        }
      })

      const valorItens = itensCalculados.reduce((acc, item) => acc + Number(item.subtotal), 0)

      const sessionToken = input?.cliente_session_token
      const session = parseCustomerSessionToken(sessionToken)
      const observacoes = toObservations(input?.observacoes)
      const metodoPagamento = normalizePaymentMethod(input?.metodo_pagamento)
      const statusPagamento = resolvePaymentStatus()

      const sessionNome = String(session.nome || '').trim()
      const sessionTelefone = toPhone(session.telefone_whatsapp)
      const sessionEndereco = getTokenFromAddress(session.endereco)

      if (!sessionNome || !sessionTelefone) {
        throw new AppError(401, 'Sessao de cliente invalida.')
      }

      const enderecoPayload = getTokenFromAddress(input.endereco) || sessionEndereco
      if (!enderecoPayload) {
        throw new AppError(400, 'Endereco obrigatorio para finalizar o pedido.')
      }

      const resolvedDeliveryFee = resolveDeliveryFee(enderecoPayload, taxasEntrega, config?.taxa_entrega_padrao)
      const valorEntrega = toMoney(resolvedDeliveryFee.amount)
      const valorTotal = valorItens + valorEntrega

      const createdOrder = await prisma.$transaction(async (tx) => {
        const sessionCustomerId = toSessionCustomerId(session.customer_id)
        let cliente = null

        if (sessionCustomerId) {
          cliente = await tx.clientes.findUnique({
            where: { id: sessionCustomerId },
          })
          if (cliente && cliente.telefone_whatsapp !== sessionTelefone) {
            throw new AppError(401, 'Sessao de cliente inconsistente.')
          }
        }

        if (!cliente) {
          cliente = await tx.clientes.findUnique({
            where: { telefone_whatsapp: sessionTelefone },
          })
        }

        if (!cliente) {
          cliente = await tx.clientes.create({
            data: {
              nome: sessionNome,
              telefone_whatsapp: sessionTelefone,
            },
          })
        } else if (cliente.nome !== sessionNome) {
          cliente = await tx.clientes.update({
            where: { id: cliente.id },
            data: { nome: sessionNome },
          })
        }

        const endereco = await tx.enderecos.create({
          data: {
            cliente_id: cliente.id,
            rua: enderecoPayload.rua,
            numero: enderecoPayload.numero,
            bairro: enderecoPayload.bairro,
            cidade: enderecoPayload.cidade,
            complemento: enderecoPayload.complemento,
            referencia: enderecoPayload.referencia,
          },
        })

        for (const [produtoId, quantidade] of Object.entries(requestedByProduto)) {
          const produto = produtosById.get(Number(produtoId))
          if (!produto || produto.estoque_disponivel === null || produto.estoque_disponivel === undefined) {
            continue
          }

          const updated = await tx.produtos.updateMany({
            where: {
              id: Number(produtoId),
              estoque_disponivel: { gte: quantidade },
            },
            data: {
              estoque_disponivel: { decrement: quantidade },
            },
          })

          if (updated.count !== 1) {
            throw new AppError(409, `Produto "${produto.nome_doce}" sem estoque suficiente.`)
          }
        }

        const pedido = await tx.pedidos.create({
          data: {
            cliente_id: cliente.id,
            endereco_id: endereco.id,
            valor_itens: valorItens.toFixed(2),
            valor_entrega: valorEntrega.toFixed(2),
            valor_total: valorTotal.toFixed(2),
            observacoes,
            metodo_pagamento: metodoPagamento,
            status_pagamento: statusPagamento,
            status_entrega: 'pendente',
          },
        })

        await tx.itens_pedido.createMany({
          data: itensCalculados.map((item) => ({
            pedido_id: pedido.id,
            produto_id: item.produto_id,
            quantidade: item.quantidade,
            preco_unitario: item.preco_unitario,
            subtotal: item.subtotal,
          })),
        })

        return {
          response: {
            id: pedido.id,
            metodo_pagamento: pedido.metodo_pagamento,
            status_entrega: pedido.status_entrega,
            status_pagamento: pedido.status_pagamento,
            observacoes: pedido.observacoes,
            valor_entrega: pedido.valor_entrega,
            valor_total: pedido.valor_total,
            criado_em: pedido.criado_em,
          },
          notification: buildNotificationOrderData({
            pedido,
            cliente,
            endereco,
            itens: itensCalculados,
            produtosById,
            metodo_pagamento: metodoPagamento,
          }),
        }
      })

      if (whatsappNotifier?.notifyOrderCreatedSafe) {
        whatsappNotifier.notifyOrderCreatedSafe({
          config,
          order: createdOrder.notification,
        })
      }

      return createdOrder.response
    },

    async getOrderStatus(id, rawSessionToken) {
      const session = parseCustomerSessionToken(rawSessionToken)
      const pedido = await prisma.pedidos.findUnique({
        where: { id },
        include: {
          clientes: { select: { id: true, nome: true, telefone_whatsapp: true } },
        },
      })

      if (!pedido) {
        throw new AppError(404, 'Pedido nao encontrado.')
      }

      assertOrderBelongsToSession(pedido, session)

      return {
        id: pedido.id,
        metodo_pagamento: pedido.metodo_pagamento,
        status_entrega: pedido.status_entrega,
        status_pagamento: pedido.status_pagamento,
        observacoes: pedido.observacoes || null,
        valor_total: pedido.valor_total,
        criado_em: pedido.criado_em,
      }
    },

    async getCustomerOrders(rawSessionToken) {
      const session = parseCustomerSessionToken(rawSessionToken)

      const sessionCustomerId = toSessionCustomerId(session.customer_id)
      const where = sessionCustomerId
        ? { cliente_id: sessionCustomerId }
        : { clientes: { telefone_whatsapp: toPhone(session.telefone_whatsapp) } }

      const pedidos = await prisma.pedidos.findMany({
        where,
        orderBy: { id: 'desc' },
        include: {
          enderecos: true,
          itens_pedido: {
            include: {
              produtos: {
                select: { id: true, nome_doce: true, preco: true },
              },
            },
          },
        },
      })

      return pedidos.map(mapOrderSummary)
    },

    async getCustomerOrder(rawSessionToken, id) {
      const session = parseCustomerSessionToken(rawSessionToken)

      const pedido = await prisma.pedidos.findUnique({
        where: { id },
        include: {
          clientes: { select: { id: true, nome: true, telefone_whatsapp: true } },
          enderecos: true,
          itens_pedido: {
            include: {
              produtos: {
                select: { id: true, nome_doce: true, preco: true },
              },
            },
          },
        },
      })

      assertOrderBelongsToSession(pedido, session)

      return {
        id: pedido.id,
        metodo_pagamento: pedido.metodo_pagamento,
        status_entrega: pedido.status_entrega,
        status_pagamento: pedido.status_pagamento,
        observacoes: pedido.observacoes || null,
        valor_total: pedido.valor_total,
        criado_em: pedido.criado_em,
        endereco: cleanAddressForClient(pedido.enderecos),
        itens: pedido.itens_pedido.map((item) => ({
          produto_id: item.produto_id,
          nome_doce: item.produtos?.nome_doce || '',
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
          subtotal: item.subtotal,
        })),
      }
    },
  }
}

module.exports = { publicStoreService, parseCustomerSessionToken }
