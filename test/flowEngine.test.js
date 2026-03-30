const test = require('node:test')
const assert = require('node:assert/strict')

const { createFlowEngine } = require('../src/services/flowEngine')

function createRepositoryStub(overrides = {}) {
  const calls = {
    createOrUpdateSession: [],
    clearClientSession: [],
    updateCustomerTags: [],
    setCustomerHandoff: [],
  }

  const repository = {
    hasRawQuerySupport() {
      return true
    },
    async findPublishedFlowByTrigger() {
      return null
    },
    async getClientSession() {
      return null
    },
    async createOrUpdateSession(phone, flowId, nodeId, waitingFor, contextData) {
      calls.createOrUpdateSession.push({ phone, flowId, nodeId, waitingFor, contextData })
      return { phone, flow_id: flowId, current_node_id: nodeId, waiting_for: waitingFor, context_data: contextData }
    },
    async clearClientSession(phone) {
      calls.clearClientSession.push(phone)
      return { phone }
    },
    async findFlowById() {
      return null
    },
    async updateCustomerTags(phone, tagName) {
      calls.updateCustomerTags.push({ phone, tagName })
      return { phone, tagName }
    },
    async setCustomerHandoff(phone, active) {
      calls.setCustomerHandoff.push({ phone, active })
      return { phone, active }
    },
    async isCustomerInHandoff() {
      return false
    },
    ...overrides,
  }

  return { repository, calls }
}

test('processIncomingMessage executa fluxo publicado e envia mensagem configurada', async () => {
  const sentMessages = []
  const flow = {
    id: 8,
    trigger_keyword: 'oi',
    flow_json: {
      nodes: [
        { id: 'trigger_1', type: 'trigger', next: 'message_1' },
        { id: 'message_1', type: 'message', content: 'Bem-vindo ao fluxo visual!', next: 'end_1' },
        { id: 'end_1', type: 'end' },
      ],
    },
  }

  const { repository, calls } = createRepositoryStub({
    async findPublishedFlowByTrigger(message) {
      return message.startsWith('oi') ? flow : null
    },
  })

  const engine = createFlowEngine({}, { repository })
  const handled = await engine.processIncomingMessage({
    phone: '5511999991111',
    message: 'oi tudo bem',
    sendMessage: async (body) => {
      sentMessages.push(body)
    },
  })

  assert.equal(handled, true)
  assert.deepEqual(sentMessages, ['Bem-vindo ao fluxo visual!'])
  assert.equal(calls.createOrUpdateSession[0].nodeId, 'trigger_1')
  assert.equal(calls.clearClientSession.length, 1)
})

test('processIncomingMessage trata resposta de menu e segue para o próximo nó', async () => {
  const sentMessages = []
  const flow = {
    id: 12,
    flow_json: {
      nodes: [
        { id: 'trigger_1', type: 'trigger', next: 'menu_1' },
        {
          id: 'menu_1',
          type: 'menu',
          content: 'Escolha:',
          options: [
            { label: 'Cardápio', next: 'message_1' },
            { label: 'Atendente', next: 'handoff_1' },
          ],
        },
        { id: 'message_1', type: 'message', content: 'Abrindo cardápio agora.', next: 'end_1' },
        { id: 'handoff_1', type: 'handoff', content: 'Transferindo.' },
        { id: 'end_1', type: 'end' },
      ],
    },
  }

  const { repository, calls } = createRepositoryStub({
    async getClientSession() {
      return {
        id: 51,
        phone: '5511999991111',
        flow_id: 12,
        current_node_id: 'menu_1',
        waiting_for: 'menu_option',
        context_data: {},
      }
    },
    async findFlowById(id) {
      return id === 12 ? flow : null
    },
  })

  const engine = createFlowEngine({}, { repository })
  const handled = await engine.processIncomingMessage({
    phone: '5511999991111',
    message: '1',
    sendMessage: async (body) => {
      sentMessages.push(body)
    },
  })

  assert.equal(handled, true)
  assert.match(sentMessages[0], /Abrindo cardápio agora/i)
  assert.equal(calls.createOrUpdateSession[0].nodeId, 'message_1')
})

test('processIncomingMessage respeita handoff ativo e só libera quando recebe comando de retorno', async () => {
  const { repository, calls } = createRepositoryStub({
    async isCustomerInHandoff() {
      return true
    },
  })

  const engine = createFlowEngine({}, { repository })

  const ignored = await engine.processIncomingMessage({
    phone: '5511999991111',
    message: 'oi',
    sendMessage: async () => {},
  })

  assert.equal(ignored, true)
  assert.deepEqual(calls.setCustomerHandoff, [])

  const resumed = await engine.processIncomingMessage({
    phone: '5511999991111',
    message: '0',
    sendMessage: async () => {},
  })

  assert.equal(resumed, false)
  assert.deepEqual(calls.setCustomerHandoff, [{ phone: '5511999991111', active: false }])
})
