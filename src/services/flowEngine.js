const { createFlowRepository } = require('./flowRepository')
const { getPhoneSearchVariants, normalizeWhatsAppPhone } = require('../utils/phone')
const { buildPublicOrderTrackingPath, buildPublicOrderTrackingUrl } = require('../utils/orderTracking')
const { PAYMENT_STATUS_LABELS, STATUS_LABELS } = require('./whatsappNotificationService')
const { ManagedTimer } = require('../utils/syncUtility')

const MAX_AUTO_STEPS = 40
const INPUT_VARIABLE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/
const WAITING_FOR = {
  menuOption: 'menu_option',
  inputText: 'input_text',
  waitTimer: 'wait_timer',
}

function removeDiacritics(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeText(value) {
  return removeDiacritics(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function isResumeIntent(value) {
  const normalized = normalizeText(value)
  return ['0', 'menu', 'inicio', 'iniciar', 'reset', 'retomar', 'voltar'].includes(normalized)
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value || {}))
}

function trimNullable(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function normalizeVariableKey(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return INPUT_VARIABLE_KEY_PATTERN.test(normalized) ? normalized : ''
}

function buildNodeMap(flow) {
  const nodeMap = new Map()
  const nodes = Array.isArray(flow?.flow_json?.nodes) ? flow.flow_json.nodes : []

  for (const node of nodes) {
    nodeMap.set(String(node?.id || '').trim(), node)
  }

  return nodeMap
}

function resolveTriggerNodeId(flow) {
  const nodes = Array.isArray(flow?.flow_json?.nodes) ? flow.flow_json.nodes : []
  const triggerNode = nodes.find((node) => node?.type === 'trigger')
  return triggerNode?.id ? String(triggerNode.id).trim() : null
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('pt-BR')
}

function firstName(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return 'Cliente'
  return normalized.split(/\s+/)[0] || normalized
}

function statusLabel(value) {
  return STATUS_LABELS[value] || value || 'Nao informado'
}

function paymentStatusLabel(value) {
  return PAYMENT_STATUS_LABELS[value] || value || 'Nao informado'
}

function buildOrderSummary(order) {
  if (!order?.id) return ''

  return [
    `Pedido #${order.id}`,
    `Status: ${statusLabel(order.status_entrega)}`,
    `Pagamento: ${paymentStatusLabel(order.status_pagamento)}`,
    `Total: ${formatMoney(order.valor_total)}`,
    order.criado_em ? `Criado em: ${formatDateTime(order.criado_em)}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function buildPhoneSuffixVariants(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return []

  const suffixes = new Set()

  if (digits.length >= 13) suffixes.add(digits.slice(-13))
  if (digits.length >= 12) suffixes.add(digits.slice(-12))
  if (digits.length >= 11) suffixes.add(digits.slice(-11))
  if (digits.length >= 10) suffixes.add(digits.slice(-10))

  return [...suffixes].filter(Boolean)
}

function buildPhoneLookupVariants(value) {
  const normalizedPhone = normalizeWhatsAppPhone(value) || String(value || '').replace(/\D/g, '').trim()
  const output = new Set()

  for (const candidate of [value, normalizedPhone]) {
    const normalized = String(candidate || '').trim()
    if (!normalized) continue
    output.add(normalized)

    for (const variant of getPhoneSearchVariants(normalized)) {
      output.add(variant)
    }

    output.add(normalized.replace(/\D/g, ''))
  }

  return [...output]
    .map((candidate) => String(candidate || '').replace(/\D/g, '').trim())
    .filter((candidate) => candidate.length >= 10)
}

function isPrivateHostname(hostname) {
  const value = String(hostname || '').trim().toLowerCase()
  if (!value) return true
  if (value === 'localhost' || value.endsWith('.localhost')) return true
  if (value === '0.0.0.0' || value === '::1' || value === '127.0.0.1') return true
  if (/^10\./.test(value)) return true
  if (/^192\.168\./.test(value)) return true
  const block172 = value.match(/^172\.(\d{1,3})\./)
  if (block172) {
    const secondOctet = Number(block172[1])
    if (secondOctet >= 16 && secondOctet <= 31) return true
  }

  return false
}

function toPublicUrl(raw) {
  if (!raw) return null

  try {
    const url = new URL(String(raw).trim())
    if (!/^https?:$/.test(url.protocol)) return null
    if (isPrivateHostname(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

function buildStorefrontUrl() {
  const directCandidates = [process.env.PUBLIC_STORE_URL, process.env.STORE_PUBLIC_URL]
  for (const candidate of directCandidates) {
    const url = toPublicUrl(candidate)
    if (url) return url.toString()
  }

  const baseCandidates = [process.env.PUBLIC_BASE_URL, process.env.APP_BASE_URL, process.env.WPP_PUBLIC_WEBHOOK_URL]
  for (const candidate of baseCandidates) {
    const url = toPublicUrl(candidate)
    if (!url) continue

    if (url.pathname.endsWith('/whatsapp/webhook')) {
      url.pathname = url.pathname.replace(/\/whatsapp\/webhook$/, '/loja')
    } else if (!['/', '/loja', '/catalogo'].includes(url.pathname)) {
      url.pathname = '/loja'
    } else if (url.pathname === '/') {
      url.pathname = '/loja'
    }

    url.search = ''
    url.hash = ''
    return url.toString()
  }

  return null
}

function mapOrderSnapshot(order, lookupPhone = '') {
  if (!order?.id) return null

  const trackingPath = order?.tracking_path || buildPublicOrderTrackingPath(order.id, order.tracking_token)
  const trackingUrl = order?.tracking_url || buildPublicOrderTrackingUrl(order.id, order.tracking_token)

  return {
    id: Number(order.id || 0),
    status_entrega: order.status_entrega || '',
    status_pagamento: order.status_pagamento || '',
    valor_total: order.valor_total || 0,
    criado_em: order.criado_em || null,
    observacoes: order.observacoes || '',
    tracking_path: trackingPath || '',
    tracking_url: trackingUrl || '',
    cliente_nome: order?.clientes?.nome || '',
    cliente_telefone: order?.clientes?.telefone_whatsapp || lookupPhone || '',
    lookup_phone: lookupPhone || '',
  }
}

function prepareRuntimeContext(context = {}, seed = {}) {
  const nextContext = {
    ...deepClone(context),
    ...deepClone(seed),
  }

  nextContext.variables = {
    ...(context?.variables && typeof context.variables === 'object' ? deepClone(context.variables) : {}),
    ...(seed?.variables && typeof seed.variables === 'object' ? deepClone(seed.variables) : {}),
  }

  return nextContext
}

function setRuntimeVariable(context, key, value) {
  const normalizedKey = normalizeVariableKey(key)
  if (!normalizedKey) return

  if (!context.variables || typeof context.variables !== 'object') {
    context.variables = {}
  }

  context.variables[normalizedKey] = value
}

function clearOrderContext(context, lookupPhone = '') {
  context.latest_order = null
  context.order_lookup_phone = lookupPhone || ''
}

function assignOrderContext(context, order, lookupPhone = '') {
  context.latest_order = mapOrderSnapshot(order, lookupPhone)
  context.order_lookup_phone = lookupPhone || ''
}

function buildRuntimeVariables(flow, context = {}) {
  const now = new Date()
  const order = context.latest_order || null

  const variables = {
    ...(context.variables && typeof context.variables === 'object' ? context.variables : {}),
    cliente_nome: context.profile_name || order?.cliente_nome || 'Cliente',
    cliente_primeiro_nome: firstName(context.profile_name || order?.cliente_nome || 'Cliente'),
    cliente_telefone: context.phone || order?.cliente_telefone || '',
    mensagem_recebida: context.last_incoming_message || '',
    ultima_mensagem: context.last_incoming_message || '',
    gatilho_fluxo: context.trigger_keyword || flow?.trigger_keyword || '',
    fluxo_nome: context.flow_name || flow?.name || '',
    loja_link: context.store_url || buildStorefrontUrl() || '',
    data_atual: now.toLocaleDateString('pt-BR'),
    hora_atual: now.toLocaleTimeString('pt-BR'),
    data_hora_atual: now.toLocaleString('pt-BR'),
    menu_opcao_escolhida: context.last_selected_option ? String(context.last_selected_option) : '',
    menu_opcao_rotulo: context.last_selected_label || '',
    pedido_encontrado: order ? 'sim' : 'nao',
    pedido_id: order?.id ? String(order.id) : '',
    pedido_status: order?.status_entrega || '',
    pedido_status_label: statusLabel(order?.status_entrega),
    pedido_pagamento_status: order?.status_pagamento || '',
    pedido_pagamento_label: paymentStatusLabel(order?.status_pagamento),
    pedido_total: order ? formatMoney(order.valor_total) : '',
    pedido_criado_em: order?.criado_em ? formatDateTime(order.criado_em) : '',
    pedido_tracking_path: order?.tracking_path || '',
    pedido_tracking_url: order?.tracking_url || '',
    pedido_observacoes: order?.observacoes || '',
    pedido_resumo: buildOrderSummary(order),
    pedido_telefone_consulta: context.order_lookup_phone || '',
  }

  return variables
}

function renderFlowTemplate(template, variables = {}, { trim = true } = {}) {
  const rendered = String(template || '')
    .replace(/\\n/g, '\n')
    .replace(/\{([a-z0-9_]+)\}/gi, (_, key) => {
      const value = variables[String(key || '').toLowerCase()]
      return value === undefined || value === null ? '' : String(value)
    })

  return trim ? rendered.trim() : rendered
}

function formatMenuMessage(node, variables = {}) {
  const lines = []
  const content = renderFlowTemplate(node?.content || '', variables)
  if (content) {
    lines.push(content)
    lines.push('')
  }

  const options = Array.isArray(node?.options) ? node.options : []
  options.forEach((option, index) => {
    const label = renderFlowTemplate(option?.label || '', variables)
    lines.push(`${index + 1}. ${label}`.trim())
  })

  return lines.join('\n').trim()
}

function getOrderLookupNodeConfig(node = {}) {
  return {
    lookup_scope: String(node.lookup_scope || 'latest').trim() === 'active' ? 'active' : 'latest',
    phone_source: String(node.phone_source || 'current_phone').trim() === 'variable' ? 'variable' : 'current_phone',
    phone_variable: normalizeVariableKey(node.phone_variable),
  }
}

function getObservationNodeConfig(node = {}) {
  return {
    variable_key: normalizeVariableKey(node.variable_key),
    phone_source: String(node.phone_source || 'current_phone').trim() === 'variable' ? 'variable' : 'current_phone',
    phone_variable: normalizeVariableKey(node.phone_variable),
  }
}

function createFlowEngine(prisma, deps = {}) {
  const logger = deps.logger || console
  const setTimeoutFn = typeof deps.setTimeoutFn === 'function' ? deps.setTimeoutFn : setTimeout
  const clearTimeoutFn = typeof deps.clearTimeoutFn === 'function' ? deps.clearTimeoutFn : clearTimeout
  const repository = deps.repository || createFlowRepository(prisma)
  const pendingWaitTimers = new Map()

  function cancelWaitTimer(phone) {
    const normalizedPhone = normalizeWhatsAppPhone(phone) || String(phone || '').replace(/\D/g, '').trim()
    const currentTimer = pendingWaitTimers.get(normalizedPhone)
    if (!currentTimer) return

    if (typeof currentTimer.cancel === 'function') {
      // ManagedTimer
      currentTimer.cancel()
    } else {
      // Fallback para casos legados
      clearTimeoutFn(currentTimer)
    }
    pendingWaitTimers.delete(normalizedPhone)
  }

  async function findPublishedFlowByTrigger(keyword) {
    return repository.findPublishedFlowByTrigger(keyword)
  }

  async function getClientSession(phone) {
    return repository.getClientSession(phone)
  }

  async function createOrUpdateSession(phone, flowId, nodeId, waitingFor = null, contextData = {}) {
    if (waitingFor !== WAITING_FOR.waitTimer) {
      cancelWaitTimer(phone)
    }

    return repository.createOrUpdateSession(phone, flowId, nodeId, waitingFor, contextData)
  }

  async function clearClientSession(phone) {
    cancelWaitTimer(phone)
    return repository.clearClientSession(phone)
  }

  async function findLatestOrderByPhone(phone, { activeOnly = false } = {}) {
    if (typeof prisma?.pedidos?.findFirst !== 'function') {
      return null
    }

    const variants = buildPhoneLookupVariants(phone)
    if (!variants.length) return null

    const buildQueryOptions = (clientesWhere) => ({
      where: {
        ...(activeOnly ? { status_entrega: { notIn: ['entregue', 'cancelado'] } } : {}),
        clientes: { is: clientesWhere },
      },
      orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
      include: {
        clientes: { select: { nome: true, telefone_whatsapp: true } },
      },
    })

    const exactOrder = await prisma.pedidos.findFirst(buildQueryOptions({
      telefone_whatsapp: {
        in: variants,
      },
    }))

    if (exactOrder) {
      return exactOrder
    }

    const suffixes = buildPhoneSuffixVariants(phone)
      .map((candidate) => String(candidate || '').trim())
      .filter((candidate) => candidate.length >= 10)

    if (!suffixes.length) {
      return null
    }

    return prisma.pedidos.findFirst(buildQueryOptions({
      OR: suffixes.map((suffix) => ({
        telefone_whatsapp: {
          endsWith: suffix,
        },
      })),
    }))
  }

  async function saveObservationOnOrder(order, rawText) {
    if (!order?.id || typeof prisma?.pedidos?.update !== 'function') {
      return null
    }

    const normalizedText = String(rawText || '').replace(/\s+/g, ' ').trim()
    if (!normalizedText) return order

    const entry = `WhatsApp: ${normalizedText}`
    const existing = String(order?.observacoes || '').trim()
    const merged = existing ? `${existing} | ${entry}` : entry
    const observacoes = merged.slice(0, 500)

    await prisma.pedidos.update({
      where: { id: order.id },
      data: { observacoes },
    })

    return {
      ...order,
      observacoes,
    }
  }

  function resolvePhoneForNode(node, runtimeContext, defaultPhone) {
    const config = getOrderLookupNodeConfig(node)
    if (config.phone_source !== 'variable') {
      return normalizeWhatsAppPhone(defaultPhone) || String(defaultPhone || '').replace(/\D/g, '').trim()
    }

    const candidate = runtimeContext?.variables?.[config.phone_variable]
    return normalizeWhatsAppPhone(candidate) || String(candidate || '').replace(/\D/g, '').trim()
  }

  function scheduleWaitTimer(phone, flow, nodeId, sendMessage, waitSeconds) {
    cancelWaitTimer(phone)

    const normalizedPhone = normalizeWhatsAppPhone(phone) || String(phone || '').replace(/\D/g, '').trim()
    const timer = new ManagedTimer(async () => {
      try {
        const session = await repository.getClientSession(normalizedPhone)
        if (!session) {
          logger.warn('[flows] Session não encontrada ao retomar timer:', { normalizedPhone, nodeId })
          return
        }

        const resumeNodeId = String(session?.context_data?.resume_node_id || '').trim()
        if (session.waiting_for !== WAITING_FOR.waitTimer || resumeNodeId !== String(nodeId || '').trim()) {
          logger.warn('[flows] Session state inválido ao retomar:', {
            normalizedPhone,
            nodeId,
            waiting_for: session.waiting_for,
            resumeNodeId,
          })
          return
        }

        const runtimeContext = prepareRuntimeContext(session.context_data, {
          last_wait_completed_at: new Date().toISOString(),
        })
        await createOrUpdateSession(normalizedPhone, flow.id, nodeId, null, runtimeContext)
        await executeNode(normalizedPhone, flow, nodeId, '', sendMessage, runtimeContext)
      } catch (error) {
        logger.error('[flows] Falha ao retomar no de espera:', error?.message || error)
      } finally {
        // Cleanup automático
        pendingWaitTimers.delete(normalizedPhone)
      }
    }, Math.max(1, Number(waitSeconds || 0)) * 1000)

    pendingWaitTimers.set(normalizedPhone, timer)
  }

  async function restartFlowFromTrigger(phone, flow, sendMessage, currentContext, incomingMessage) {
    const triggerNodeId = resolveTriggerNodeId(flow)
    if (!triggerNodeId) {
      await clearClientSession(phone)
      return false
    }

    const runtimeContext = prepareRuntimeContext(currentContext, {
      resumed_at: new Date().toISOString(),
      last_incoming_message: incomingMessage,
      last_incoming_at: new Date().toISOString(),
    })

    await createOrUpdateSession(phone, flow.id, triggerNodeId, null, runtimeContext)
    await executeNode(phone, flow, triggerNodeId, incomingMessage, sendMessage, runtimeContext)
    return true
  }

  async function executeNode(phone, flow, nodeId, incomingMessage, sendMessage, initialContext = {}) {
    const normalizedPhone = normalizeWhatsAppPhone(phone) || String(phone || '').replace(/\D/g, '').trim()
    if (!normalizedPhone) return { handled: false }

    const nodeMap = buildNodeMap(flow)
    const runtimeContext = prepareRuntimeContext(initialContext, {
      phone: normalizedPhone,
      flow_name: flow?.name || initialContext?.flow_name || '',
      trigger_keyword: flow?.trigger_keyword || initialContext?.trigger_keyword || '',
      store_url: initialContext?.store_url || buildStorefrontUrl() || '',
    })

    if (String(incomingMessage || '').trim()) {
      runtimeContext.last_incoming_message = String(incomingMessage || '').trim()
      runtimeContext.last_incoming_at = new Date().toISOString()
    }

    let currentNodeId = String(nodeId || '').trim()
    let stepCount = 0

    while (currentNodeId && stepCount < MAX_AUTO_STEPS) {
      stepCount += 1

      const node = nodeMap.get(currentNodeId)
      if (!node) {
        await clearClientSession(normalizedPhone)
        logger.warn('[flows] No inexistente durante execucao do fluxo:', {
          flowId: flow?.id,
          nodeId: currentNodeId,
        })
        return { handled: true, reason: 'missing_node' }
      }

      const variables = buildRuntimeVariables(flow, runtimeContext)

      if (node.type === 'trigger') {
        currentNodeId = node.next || ''
        if (!currentNodeId) {
          await clearClientSession(normalizedPhone)
          return { handled: true, ended: true }
        }
        continue
      }

      if (node.type === 'message') {
        const content = renderFlowTemplate(node.content || '', variables)
        if (content) {
          await sendMessage(content)
        }

        currentNodeId = node.next || ''
        if (!currentNodeId) {
          await clearClientSession(normalizedPhone)
          return { handled: true, ended: true }
        }
        continue
      }

      if (node.type === 'menu') {
        const menuText = formatMenuMessage(node, variables)
        if (menuText) {
          await sendMessage(menuText)
        }

        await createOrUpdateSession(normalizedPhone, flow.id, node.id, WAITING_FOR.menuOption, runtimeContext)
        return { handled: true, waiting_for: WAITING_FOR.menuOption }
      }

      if (node.type === 'input') {
        const prompt = renderFlowTemplate(node.prompt || '', variables)
        if (prompt) {
          await sendMessage(prompt)
        }

        await createOrUpdateSession(normalizedPhone, flow.id, node.id, WAITING_FOR.inputText, runtimeContext)
        return { handled: true, waiting_for: WAITING_FOR.inputText }
      }

      if (node.type === 'condition') {
        const matchText = normalizeText(renderFlowTemplate(node.match_text || '', variables))
        const messageText = normalizeText(incomingMessage || '')
        const nextNodeId = matchText && messageText.includes(matchText) ? node.yes : node.no

        currentNodeId = nextNodeId || ''
        if (!currentNodeId) {
          await clearClientSession(normalizedPhone)
          return { handled: true, ended: true }
        }
        continue
      }

      if (node.type === 'wait') {
        const seconds = Math.max(1, Number(node.seconds || 0))
        const resumeNodeId = String(node.next || '').trim()
        if (!resumeNodeId) {
          await clearClientSession(normalizedPhone)
          return { handled: true, ended: true }
        }

        runtimeContext.resume_node_id = resumeNodeId
        runtimeContext.wait_seconds = seconds

        await createOrUpdateSession(normalizedPhone, flow.id, node.id, WAITING_FOR.waitTimer, runtimeContext)

        scheduleWaitTimer(normalizedPhone, flow, resumeNodeId, sendMessage, seconds)
        return { handled: true, waiting_for: WAITING_FOR.waitTimer }
      }

      if (node.type === 'tag') {
        const tagName = renderFlowTemplate(node.tag_name || '', variables)
        if (tagName) {
          await repository.updateCustomerTags(normalizedPhone, tagName)
        }

        currentNodeId = node.next || ''
        if (!currentNodeId) {
          await clearClientSession(normalizedPhone)
          return { handled: true, ended: true }
        }
        continue
      }

      if (node.type === 'order_lookup') {
        const config = getOrderLookupNodeConfig(node)
        const lookupPhone = resolvePhoneForNode(node, runtimeContext, normalizedPhone)
        const order = await findLatestOrderByPhone(lookupPhone, {
          activeOnly: config.lookup_scope === 'active',
        })

        if (order) {
          assignOrderContext(runtimeContext, order, lookupPhone)
          currentNodeId = String(node.found || '').trim()
        } else {
          clearOrderContext(runtimeContext, lookupPhone)
          currentNodeId = String(node.missing || '').trim()
        }

        if (!currentNodeId) {
          await clearClientSession(normalizedPhone)
          return { handled: true, ended: true }
        }
        continue
      }

      if (node.type === 'save_observation') {
        const config = getObservationNodeConfig(node)
        const lookupPhone = config.phone_source === 'variable'
          ? normalizeWhatsAppPhone(runtimeContext?.variables?.[config.phone_variable])
          : normalizedPhone
        const observationText = config.variable_key
          ? trimNullable(runtimeContext?.variables?.[config.variable_key])
          : null
        const order = await findLatestOrderByPhone(lookupPhone, { activeOnly: true })

        if (!order || !observationText) {
          currentNodeId = String(node.missing || '').trim()
        } else {
          const savedOrder = await saveObservationOnOrder(order, observationText)
          assignOrderContext(runtimeContext, savedOrder || order, lookupPhone)
          currentNodeId = String(node.saved || '').trim()
        }

        if (!currentNodeId) {
          await clearClientSession(normalizedPhone)
          return { handled: true, ended: true }
        }
        continue
      }

      if (node.type === 'handoff') {
        const content = renderFlowTemplate(node.content || '', variables)
        if (content) {
          await sendMessage(content)
        }

        await repository.setCustomerHandoff(normalizedPhone, true)
        await clearClientSession(normalizedPhone)
        return { handled: true, handoff: true }
      }

      if (node.type === 'end') {
        await clearClientSession(normalizedPhone)
        return { handled: true, ended: true }
      }

      await clearClientSession(normalizedPhone)
      return { handled: true, ended: true }
    }

    await clearClientSession(normalizedPhone)
    logger.warn('[flows] Execucao interrompida por excesso de passos automaticos.', {
      flowId: flow?.id,
      nodeId,
    })
    return { handled: true, reason: 'step_limit' }
  }

  async function processIncomingMessage(payload = {}) {
    try {
      if (!repository.hasRawQuerySupport()) {
        return false
      }

      const phone = normalizeWhatsAppPhone(payload.phone) || String(payload.phone || '').replace(/\D/g, '').trim()
      const message = String(payload.message || '').trim()
      const sendMessage = payload.sendMessage

      if (!phone || typeof sendMessage !== 'function') {
        return false
      }

      const inHandoff = await repository.isCustomerInHandoff(phone)
      if (inHandoff) {
        if (isResumeIntent(message)) {
          await repository.setCustomerHandoff(phone, false)
        } else {
          return true
        }
      }

      const baseContext = prepareRuntimeContext({}, {
        phone,
        raw_phone: payload.rawPhone || '',
        profile_name: payload.profileName || 'Cliente',
        last_incoming_message: message,
        last_incoming_at: new Date().toISOString(),
        store_url: buildStorefrontUrl() || '',
      })

      const session = await getClientSession(phone)
      if (session?.flow_id) {
        const flow = await repository.findFlowById(session.flow_id)
        if (!flow) {
          await clearClientSession(phone)
          return false
        }

        const sessionContext = prepareRuntimeContext(session.context_data, baseContext)

        if ((session.waiting_for === WAITING_FOR.menuOption || session.waiting_for === WAITING_FOR.inputText) && isResumeIntent(message)) {
          return restartFlowFromTrigger(phone, flow, sendMessage, sessionContext, message)
        }

        if (session.waiting_for === WAITING_FOR.waitTimer) {
          return true
        }

        if (session.waiting_for === WAITING_FOR.menuOption) {
          const nodeMap = buildNodeMap(flow)
          const menuNode = nodeMap.get(String(session.current_node_id || '').trim())
          const options = Array.isArray(menuNode?.options) ? menuNode.options : []
          const selectedIndex = Number.parseInt(message, 10) - 1

          if (!Number.isInteger(selectedIndex) || !options[selectedIndex]) {
            const menuText = formatMenuMessage(menuNode, buildRuntimeVariables(flow, sessionContext))
            await sendMessage(
              [
                'Responda com o numero de uma opcao valida.',
                menuText,
              ]
                .filter(Boolean)
                .join('\n\n'),
            )
            return true
          }

          sessionContext.last_selected_option = selectedIndex + 1
          sessionContext.last_selected_label = renderFlowTemplate(options[selectedIndex]?.label || '', buildRuntimeVariables(flow, sessionContext))

          const nextNodeId = String(options[selectedIndex]?.next || '').trim()
          if (!nextNodeId) {
            await clearClientSession(phone)
            await sendMessage('Essa opcao ainda nao esta conectada no fluxo.')
            return true
          }

          await createOrUpdateSession(phone, flow.id, nextNodeId, null, sessionContext)
          await executeNode(phone, flow, nextNodeId, message, sendMessage, sessionContext)
          return true
        }

        if (session.waiting_for === WAITING_FOR.inputText) {
          const nodeMap = buildNodeMap(flow)
          const inputNode = nodeMap.get(String(session.current_node_id || '').trim())
          const variableKey = normalizeVariableKey(inputNode?.variable_key)
          if (!variableKey) {
            await clearClientSession(phone)
            await sendMessage('Esse bloco de captura ainda nao tem uma variavel configurada.')
            return true
          }

          if (!message) {
            const prompt = renderFlowTemplate(inputNode?.prompt || '', buildRuntimeVariables(flow, sessionContext))
            if (prompt) {
              await sendMessage(prompt)
            }
            return true
          }

          setRuntimeVariable(sessionContext, variableKey, message)
          sessionContext.last_captured_variable = variableKey

          const nextNodeId = String(inputNode?.next || '').trim()
          if (!nextNodeId) {
            await clearClientSession(phone)
            return true
          }

          await createOrUpdateSession(phone, flow.id, nextNodeId, null, sessionContext)
          await executeNode(phone, flow, nextNodeId, message, sendMessage, sessionContext)
          return true
        }

        if (session.current_node_id) {
          await executeNode(phone, flow, session.current_node_id, message, sendMessage, sessionContext)
          return true
        }
      }

      const flow = await findPublishedFlowByTrigger(message)
      if (!flow) {
        return false
      }

      const triggerNodeId = resolveTriggerNodeId(flow)
      if (!triggerNodeId) {
        logger.warn('[flows] Fluxo publicado sem no trigger valido.', { flowId: flow.id })
        return false
      }

      const startedAt = new Date().toISOString()
      const runtimeContext = prepareRuntimeContext(baseContext, {
        started_at: startedAt,
        trigger_message: message,
        flow_name: flow.name || '',
        trigger_keyword: flow.trigger_keyword || '',
      })

      await createOrUpdateSession(phone, flow.id, triggerNodeId, null, runtimeContext)
      await executeNode(phone, flow, triggerNodeId, message, sendMessage, runtimeContext)
      return true
    } catch (error) {
      logger.error('[flows] Falha ao processar mensagem no Flow Builder:', error?.message || error)
      return false
    }
  }

  return {
    clearClientSession,
    createOrUpdateSession,
    executeNode,
    findPublishedFlowByTrigger,
    getClientSession,
    processIncomingMessage,
  }
}

module.exports = {
  WAITING_FOR,
  createFlowEngine,
  formatMenuMessage,
  renderFlowTemplate,
}
