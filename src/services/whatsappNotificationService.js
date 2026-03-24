const { AppError } = require('../utils/errors')
const { normalizeWhatsAppPhone } = require('../utils/phone')
const { normalizeStoreSettings } = require('../utils/storeSettings')
const { assertSafeExternalUrl } = require('../utils/security')

const WEBHOOK_TIMEOUT_MS = 8000

const STATUS_LABELS = {
  pendente: 'Pendente',
  preparando: 'Preparando',
  saiu_para_entrega: 'Saiu para entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

const PAYMENT_STATUS_LABELS = {
  pendente: 'Aguardando pagamento',
  pago: 'Pago',
  falhou: 'Falhou',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
  estornado: 'Estornado',
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDeliveryWindow(min, max) {
  const minNumber = Number(min || 0)
  const maxNumber = Number(max || 0)

  if (minNumber > 0 && maxNumber > 0) {
    if (minNumber === maxNumber) return `${minNumber} min`
    return `${minNumber} a ${maxNumber} min`
  }

  if (minNumber > 0) return `${minNumber} min`
  if (maxNumber > 0) return `${maxNumber} min`
  return 'a confirmar'
}

function formatAddress(endereco) {
  if (!endereco) return ''

  return [
    [endereco.rua, endereco.numero].filter(Boolean).join(', '),
    endereco.bairro,
    endereco.cidade,
    endereco.complemento,
    endereco.referencia ? `Ref: ${endereco.referencia}` : null,
  ]
    .filter(Boolean)
    .join(' - ')
}

function formatItems(items = []) {
  return items
    .map((item) => {
      const nome = item?.produto?.nome_doce || item?.nome_doce || `Produto ${item?.produto_id || ''}`.trim()
      return `${item.quantidade}x ${nome}`
    })
    .join(', ')
}

function statusLabel(value) {
  return STATUS_LABELS[value] || value || 'Nao informado'
}

function paymentStatusLabel(value) {
  return PAYMENT_STATUS_LABELS[value] || value || 'Nao informado'
}

function buildStatusMessage(status, { previsaoEntrega }) {
  switch (status) {
    case 'pendente':
      return `Seu pedido entrou na nossa fila de atendimento. A previsao no momento e de ${previsaoEntrega}.`
    case 'preparando':
      return `Seu pedido ja esta sendo preparado por aqui. A previsao no momento e de ${previsaoEntrega}.`
    case 'saiu_para_entrega':
      return 'Seu pedido saiu para entrega e deve chegar em breve.'
    case 'entregue':
      return 'Seu pedido foi entregue. Obrigado por pedir com a Donilla.'
    case 'cancelado':
      return 'Seu pedido foi cancelado. Se precisar de ajuda, e so responder esta mensagem.'
    default:
      return `O status do seu pedido agora e ${statusLabel(status)}.`
  }
}

function renderTemplate(template, variables) {
  return String(template || '').replace(/\{([a-z_]+)\}/gi, (_, key) => {
    const value = variables[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

function buildVariables(config, order, previousStatus = null) {
  const cliente = order?.cliente || {}
  const endereco = order?.endereco || null
  const currentStatus = order?.status_entrega || null
  const previsaoEntrega = formatDeliveryWindow(config.tempo_entrega_minutos, config.tempo_entrega_max_minutos)

  return {
    cliente_nome: cliente.nome || 'Cliente',
    cliente_telefone: cliente.telefone_whatsapp || '',
    pedido_id: order?.id || '',
    status_entrega: currentStatus || '',
    status_entrega_label: statusLabel(currentStatus),
    status_pagamento: order?.status_pagamento || '',
    status_pagamento_label: paymentStatusLabel(order?.status_pagamento),
    status_anterior: previousStatus || '',
    status_anterior_label: statusLabel(previousStatus),
    valor_total: formatMoney(order?.valor_total),
    valor_entrega: formatMoney(order?.valor_entrega),
    metodo_pagamento: order?.metodo_pagamento || '',
    observacoes: order?.observacoes || '',
    endereco_resumo: formatAddress(endereco),
    itens_resumo: formatItems(order?.itens || []),
    tempo_entrega_min: config.tempo_entrega_minutos,
    tempo_entrega_max: config.tempo_entrega_max_minutos,
    previsao_entrega: previsaoEntrega,
    status_mensagem: buildStatusMessage(currentStatus, { previsaoEntrega }),
  }
}

function buildPayload(eventName, config, order, previousStatus = null, customMessage = null) {
  const normalizedConfig = normalizeStoreSettings(config)
  const variables = buildVariables(normalizedConfig, order, previousStatus)
  const messageTemplate =
    customMessage ||
    (eventName === 'order.created'
      ? normalizedConfig.whatsapp_mensagem_novo_pedido
      : normalizedConfig.whatsapp_mensagem_status)

  return {
    event: eventName,
    sent_at: new Date().toISOString(),
    recipient: {
      nome: order?.cliente?.nome || 'Cliente',
      telefone_whatsapp: normalizeWhatsAppPhone(order?.cliente?.telefone_whatsapp),
    },
    message: renderTemplate(messageTemplate, variables).trim(),
    variables,
    order: {
      id: order?.id || null,
      status_entrega: order?.status_entrega || null,
      status_pagamento: order?.status_pagamento || null,
      valor_total: order?.valor_total ?? null,
      valor_entrega: order?.valor_entrega ?? null,
      metodo_pagamento: order?.metodo_pagamento || null,
      observacoes: order?.observacoes || null,
      criado_em: order?.criado_em || null,
      cliente: order?.cliente || null,
      endereco: order?.endereco || null,
      itens: Array.isArray(order?.itens) ? order.itens : [],
    },
  }
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeout)
    },
  }
}

function extractResponseDetails(responseBody) {
  if (!responseBody) return null
  try {
    return JSON.parse(responseBody)
  } catch {
    return responseBody
  }
}

function createWhatsAppNotificationService({
  fetchImpl = globalThis.fetch,
  logger = console,
  transportService = null,
  assertSafeTargetUrl = assertSafeExternalUrl,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch API indisponivel para a integracao WhatsApp.')
  }

  async function sendUsingTransport(config, payload) {
    if (!transportService?.isConfigured?.()) {
      return null
    }

    const response = await transportService.sendTextMessage({
      to: payload.recipient.telefone_whatsapp,
      body: payload.message,
    })

    return {
      delivered: true,
      provider: transportService.providerName || 'whatsapp',
      response,
    }
  }

  async function postToWebhook(config, payload) {
    const webhookUrl = String(config?.whatsapp_webhook_url || '').trim()
    if (!webhookUrl) {
      throw new AppError(400, 'Configure a URL do webhook do bot de WhatsApp.')
    }

    const safeWebhookUrl = await assertSafeTargetUrl(webhookUrl)

    const { signal, clear } = createTimeoutSignal(WEBHOOK_TIMEOUT_MS)

    try {
      const response = await fetchImpl(safeWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config?.whatsapp_webhook_secret
            ? { 'x-donilla-bot-secret': String(config.whatsapp_webhook_secret) }
            : {}),
        },
        body: JSON.stringify(payload),
        signal,
      })

      const responseBody = await response.text()
      if (!response.ok) {
        throw new AppError(
          502,
          `Bot WhatsApp respondeu com erro HTTP ${response.status}.`,
          extractResponseDetails(responseBody),
        )
      }

      return {
        delivered: true,
        statusCode: response.status,
        response: extractResponseDetails(responseBody),
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new AppError(504, 'Bot WhatsApp nao respondeu dentro do tempo limite.')
      }

      throw error
    } finally {
      clear()
    }
  }

  async function sendEvent(eventName, { config, order, previousStatus = null, force = false, customMessage = null }) {
    const normalizedConfig = normalizeStoreSettings(config)

    if (!force && !normalizedConfig.whatsapp_ativo) {
      return { delivered: false, skipped: true, reason: 'disabled' }
    }

    const payload = buildPayload(eventName, normalizedConfig, order, previousStatus, customMessage)

    if (!payload.recipient.telefone_whatsapp) {
      throw new AppError(400, 'Pedido sem telefone valido para notificacao WhatsApp.')
    }

    const transportResult = await sendUsingTransport(normalizedConfig, payload)
    if (transportResult) return transportResult

    if (!normalizedConfig.whatsapp_webhook_url) {
      throw new AppError(
        500,
        'WhatsApp nao configurado. Configure o WPPConnect no ambiente ou informe um webhook externo.',
      )
    }

    return postToWebhook(normalizedConfig, payload)
  }

  function runSafely(taskLabel, taskFactory) {
    Promise.resolve()
      .then(taskFactory)
      .catch((error) => {
        logger.error(`[whatsapp] Falha em ${taskLabel}:`, error?.message || error)
      })
  }

  async function notifyOrderCreated({ config, order }) {
    return sendEvent('order.created', { config, order })
  }

  async function notifyOrderStatusUpdated({ config, order, previousStatus }) {
    if (order?.status_entrega === previousStatus) {
      return { delivered: false, skipped: true, reason: 'same-status' }
    }

    return sendEvent('order.status_updated', {
      config,
      order,
      previousStatus,
    })
  }

  async function sendTestMessage({ config, customer }) {
    const order = {
      id: 9999,
      status_entrega: 'pendente',
      status_pagamento: 'pendente',
      valor_total: '0.00',
      valor_entrega: '0.00',
      metodo_pagamento: 'teste',
      observacoes: 'Mensagem de teste da integracao.',
      criado_em: new Date().toISOString(),
      cliente: {
        nome: customer?.nome || 'Cliente Teste',
        telefone_whatsapp: normalizeWhatsAppPhone(customer?.telefone_whatsapp),
      },
      endereco: null,
      itens: [],
    }

    return sendEvent('integration.test', {
      config,
      order,
      force: true,
      customMessage: [
        'Teste da Donilla:',
        'Se esta mensagem chegou certinho, a integracao do WhatsApp esta funcionando.',
        'Numero testado: {cliente_nome} ({cliente_telefone})',
      ].join('\n'),
    })
  }

  return {
    notifyOrderCreated,
    notifyOrderStatusUpdated,
    sendTestMessage,

    notifyOrderCreatedSafe(payload) {
      runSafely('order.created', () => notifyOrderCreated(payload))
    },

    notifyOrderStatusUpdatedSafe(payload) {
      runSafely('order.status_updated', () => notifyOrderStatusUpdated(payload))
    },

    sendTestMessageSafe(payload) {
      runSafely('integration.test', () => sendTestMessage(payload))
    },
  }
}

module.exports = {
  STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  buildPayload,
  createWhatsAppNotificationService,
}
