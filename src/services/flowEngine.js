const { createFlowRepository } = require('./flowRepository')
const { normalizeWhatsAppPhone } = require('../utils/phone')

const MAX_AUTO_STEPS = 40
const WAITING_FOR = {
  menuOption: 'menu_option',
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

function formatMenuMessage(node) {
  const lines = []
  const content = String(node?.content || '').trim()
  if (content) {
    lines.push(content)
    lines.push('')
  }

  const options = Array.isArray(node?.options) ? node.options : []
  options.forEach((option, index) => {
    lines.push(`${index + 1}. ${String(option?.label || '').trim()}`)
  })

  return lines.join('\n').trim()
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

    clearTimeoutFn(currentTimer)
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

  function scheduleWaitTimer(phone, flow, nodeId, sendMessage, waitSeconds) {
    cancelWaitTimer(phone)

    const normalizedPhone = normalizeWhatsAppPhone(phone) || String(phone || '').replace(/\D/g, '').trim()
    const timer = setTimeoutFn(async () => {
      pendingWaitTimers.delete(normalizedPhone)

      try {
        const session = await repository.getClientSession(normalizedPhone)
        const resumeNodeId = String(session?.context_data?.resume_node_id || '').trim()
        if (!session || session.waiting_for !== WAITING_FOR.waitTimer || resumeNodeId !== String(nodeId || '').trim()) {
          return
        }

        await createOrUpdateSession(normalizedPhone, flow.id, nodeId, null, {})
        await executeNode(normalizedPhone, flow, nodeId, '', sendMessage)
      } catch (error) {
        logger.error('[flows] Falha ao retomar no de espera:', error?.message || error)
      }
    }, Math.max(1, Number(waitSeconds || 0)) * 1000)

    pendingWaitTimers.set(normalizedPhone, timer)
  }

  async function executeNode(phone, flow, nodeId, incomingMessage, sendMessage) {
    const normalizedPhone = normalizeWhatsAppPhone(phone) || String(phone || '').replace(/\D/g, '').trim()
    if (!normalizedPhone) return { handled: false }

    const nodeMap = buildNodeMap(flow)
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

      if (node.type === 'trigger') {
        currentNodeId = node.next || ''
        if (!currentNodeId) {
          await clearClientSession(normalizedPhone)
          return { handled: true, ended: true }
        }
        continue
      }

      if (node.type === 'message') {
        const content = String(node.content || '').replace(/\\n/g, '\n').trim()
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
        const menuText = formatMenuMessage(node)
        if (menuText) {
          await sendMessage(menuText)
        }

        await createOrUpdateSession(normalizedPhone, flow.id, node.id, WAITING_FOR.menuOption, {})
        return { handled: true, waiting_for: WAITING_FOR.menuOption }
      }

      if (node.type === 'condition') {
        const matchText = normalizeText(node.match_text || '')
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

        await createOrUpdateSession(normalizedPhone, flow.id, node.id, WAITING_FOR.waitTimer, {
          resume_node_id: resumeNodeId,
          wait_seconds: seconds,
        })

        scheduleWaitTimer(normalizedPhone, flow, resumeNodeId, sendMessage, seconds)
        return { handled: true, waiting_for: WAITING_FOR.waitTimer }
      }

      if (node.type === 'tag') {
        const tagName = String(node.tag_name || '').trim()
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

      if (node.type === 'handoff') {
        const content = String(node.content || '').replace(/\\n/g, '\n').trim()
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

      const session = await getClientSession(phone)
      if (session?.flow_id) {
        const flow = await repository.findFlowById(session.flow_id)
        if (!flow) {
          await clearClientSession(phone)
          return false
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
            const menuText = formatMenuMessage(menuNode)
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

          const nextNodeId = String(options[selectedIndex]?.next || '').trim()
          if (!nextNodeId) {
            await clearClientSession(phone)
            await sendMessage('Essa opcao ainda nao esta conectada no fluxo.')
            return true
          }

          await createOrUpdateSession(phone, flow.id, nextNodeId, null, {
            selected_option: selectedIndex + 1,
          })
          await executeNode(phone, flow, nextNodeId, message, sendMessage)
          return true
        }

        if (session.current_node_id) {
          await executeNode(phone, flow, session.current_node_id, message, sendMessage)
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

      await createOrUpdateSession(phone, flow.id, triggerNodeId, null, {
        started_at: new Date().toISOString(),
      })

      await executeNode(phone, flow, triggerNodeId, message, sendMessage)
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
}
