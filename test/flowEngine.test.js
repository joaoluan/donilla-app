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

test('processIncomingMessage captura input e aplica variaveis na mensagem seguinte', async () => {
  const sentMessages = []
  const flow = {
    id: 18,
    name: 'Fluxo guiado',
    flow_json: {
      nodes: [
        { id: 'trigger_1', type: 'trigger', next: 'input_name' },
        {
          id: 'input_name',
          type: 'input',
          prompt: 'Qual e o seu nome?',
          variable_key: 'nome_digitado',
          next: 'message_1',
        },
        {
          id: 'message_1',
          type: 'message',
          content: 'Prazer, {nome_digitado}! Seu telefone e {cliente_telefone}.',
          next: 'end_1',
        },
        { id: 'end_1', type: 'end' },
      ],
    },
  }

  const { repository, calls } = createRepositoryStub({
    async getClientSession() {
      return {
        id: 88,
        phone: '5511999991111',
        flow_id: 18,
        current_node_id: 'input_name',
        waiting_for: 'input_text',
        context_data: {
          phone: '5511999991111',
          profile_name: 'Maria Souza',
          variables: {},
        },
      }
    },
    async findFlowById(id) {
      return id === 18 ? flow : null
    },
  })

  const engine = createFlowEngine({}, { repository })
  const handled = await engine.processIncomingMessage({
    phone: '5511999991111',
    message: 'Ana',
    sendMessage: async (body) => {
      sentMessages.push(body)
    },
  })

  assert.equal(handled, true)
  assert.deepEqual(sentMessages, ['Prazer, Ana! Seu telefone e 5511999991111.'])
  assert.equal(calls.createOrUpdateSession[0].nodeId, 'message_1')
  assert.equal(calls.createOrUpdateSession[0].contextData.variables.nome_digitado, 'Ana')
})

test('processIncomingMessage busca pedido pelo WhatsApp e segue pelo ramo found', async () => {
  const sentMessages = []
  const flow = {
    id: 28,
    name: 'Fluxo pedidos',
    flow_json: {
      nodes: [
        { id: 'trigger_1', type: 'trigger', next: 'order_lookup_1' },
        {
          id: 'order_lookup_1',
          type: 'order_lookup',
          lookup_scope: 'latest',
          phone_source: 'current_phone',
          found: 'message_found',
          missing: 'message_missing',
        },
        {
          id: 'message_found',
          type: 'message',
          content: 'Pedido {pedido_id} encontrado. {pedido_resumo}',
          next: 'end_1',
        },
        { id: 'message_missing', type: 'message', content: 'Nenhum pedido encontrado.', next: 'end_1' },
        { id: 'end_1', type: 'end' },
      ],
    },
  }

  const prisma = {
    pedidos: {
      async findFirst() {
        return {
          id: 321,
          status_entrega: 'preparando',
          status_pagamento: 'paid',
          valor_total: 42.5,
          criado_em: '2026-03-30T12:00:00.000Z',
          observacoes: 'Sem cebola',
          tracking_token: 'abc123',
          clientes: {
            nome: 'Maria Souza',
            telefone_whatsapp: '5511999991111',
          },
        }
      },
    },
  }

  const { repository } = createRepositoryStub({
    async findPublishedFlowByTrigger(message) {
      return message.startsWith('oi') ? flow : null
    },
  })

  const engine = createFlowEngine(prisma, { repository })
  const handled = await engine.processIncomingMessage({
    phone: '5511999991111',
    message: 'oi',
    sendMessage: async (body) => {
      sentMessages.push(body)
    },
  })

  assert.equal(handled, true)
  assert.match(sentMessages[0], /Pedido 321 encontrado/i)
  assert.match(sentMessages[0], /Status:/i)
})

test('processIncomingMessage salva observacao no pedido ativo usando variavel capturada', async () => {
  const sentMessages = []
  const updateCalls = []
  const flow = {
    id: 44,
    name: 'Fluxo observacao',
    flow_json: {
      nodes: [
        { id: 'trigger_1', type: 'trigger', next: 'save_observation_1' },
        {
          id: 'save_observation_1',
          type: 'save_observation',
          variable_key: 'observacao_cliente',
          phone_source: 'current_phone',
          saved: 'message_saved',
          missing: 'message_missing',
        },
        {
          id: 'message_saved',
          type: 'message',
          content: 'Observacao salva no pedido {pedido_id}: {pedido_observacoes}',
          next: 'end_1',
        },
        { id: 'message_missing', type: 'message', content: 'Pedido nao encontrado.', next: 'end_1' },
        { id: 'end_1', type: 'end' },
      ],
    },
  }

  const prisma = {
    pedidos: {
      async findFirst() {
        return {
          id: 777,
          status_entrega: 'preparando',
          status_pagamento: 'pending',
          valor_total: 55,
          criado_em: '2026-03-30T10:00:00.000Z',
          observacoes: 'Sem picles',
          tracking_token: 'track777',
          clientes: {
            nome: 'Carlos',
            telefone_whatsapp: '5511999991111',
          },
        }
      },
      async update(payload) {
        updateCalls.push(payload)
        return {
          id: 777,
          status_entrega: 'preparando',
          status_pagamento: 'pending',
          valor_total: 55,
          criado_em: '2026-03-30T10:00:00.000Z',
          observacoes: payload.data.observacoes,
          tracking_token: 'track777',
          clientes: {
            nome: 'Carlos',
            telefone_whatsapp: '5511999991111',
          },
        }
      },
    },
  }

  const { repository } = createRepositoryStub({
    async getClientSession() {
      return {
        id: 17,
        phone: '5511999991111',
        flow_id: 44,
        current_node_id: 'save_observation_1',
        waiting_for: null,
        context_data: {
          phone: '5511999991111',
          variables: {
            observacao_cliente: 'Cliente quer retirar sem molho',
          },
        },
      }
    },
    async findFlowById(id) {
      return id === 44 ? flow : null
    },
  })

  const engine = createFlowEngine(prisma, { repository })
  const handled = await engine.processIncomingMessage({
    phone: '5511999991111',
    message: 'quero registrar observacao',
    sendMessage: async (body) => {
      sentMessages.push(body)
    },
  })

  assert.equal(handled, true)
  assert.equal(updateCalls.length, 1)
  assert.match(updateCalls[0].data.observacoes, /WhatsApp: Cliente quer retirar sem molho/i)
  assert.match(sentMessages[0], /Observacao salva no pedido 777/i)
  assert.match(sentMessages[0], /Sem picles \| WhatsApp: Cliente quer retirar sem molho/i)
})
