const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildPayload,
  createWhatsAppNotificationService,
} = require('../src/services/whatsappNotificationService')

test('buildPayload aplica variaveis do pedido na mensagem', () => {
  const payload = buildPayload(
    'order.created',
    {
      whatsapp_mensagem_novo_pedido: 'Pedido #{pedido_id} para {cliente_nome} com total {valor_total}.',
      tempo_entrega_minutos: 20,
      tempo_entrega_max_minutos: 30,
    },
    {
      id: 77,
      status_entrega: 'pendente',
      status_pagamento: 'pago',
      valor_total: '49.90',
      valor_entrega: '8.00',
      metodo_pagamento: 'pix',
      cliente: {
        nome: 'Maria',
        telefone_whatsapp: '11999990000',
      },
      tracking_url: 'https://app.donilla.test/pedido/77?token=abc123',
      endereco: {
        rua: 'Rua A',
        numero: '10',
        bairro: 'Centro',
        cidade: 'Novo Hamburgo',
      },
      itens: [{ quantidade: 2, produto: { nome_doce: 'Brigadeiro' } }],
    },
  )

  assert.equal(payload.recipient.telefone_whatsapp, '5511999990000')
  assert.match(payload.message, /^Pedido #77 para Maria com total R\$\s49,90\.$/)
  assert.equal(payload.variables.previsao_entrega, '20 a 30 min')
  assert.equal(payload.variables.itens_resumo, '2x Brigadeiro')
  assert.equal(payload.variables.status_pagamento_label, 'Pago')
  assert.equal(payload.variables.pedido_tracking_url, 'https://app.donilla.test/pedido/77?token=abc123')
  assert.equal(
    payload.variables.pedido_tracking_callout,
    'Acompanhe seu pedido: https://app.donilla.test/pedido/77?token=abc123',
  )
})

test('buildPayload monta mensagem contextual para status atualizado', () => {
  const payload = buildPayload(
    'order.status_updated',
    {
      tempo_entrega_minutos: 30,
      tempo_entrega_max_minutos: 45,
    },
    {
      id: 88,
      status_entrega: 'saiu_para_entrega',
      valor_total: '59.90',
      cliente: {
        nome: 'Maria',
        telefone_whatsapp: '11999990000',
      },
      itens: [],
    },
    'preparando',
  )

  assert.equal(payload.variables.status_entrega_label, 'Saiu para entrega')
  assert.equal(payload.variables.status_anterior_label, 'Preparando')
  assert.match(payload.variables.status_mensagem, /saiu para entrega/i)
  assert.match(payload.message, /passando para te atualizar sobre o pedido #88/i)
  assert.match(payload.message, /Seu pedido saiu para entrega e deve chegar em breve/)
})

test('notifyOrderCreated retorna skipped quando integracao esta desativada', async () => {
  const service = createWhatsAppNotificationService({
    fetchImpl() {
      throw new Error('fetch nao deveria ser chamado')
    },
  })

  const result = await service.notifyOrderCreated({
    config: { whatsapp_ativo: false },
    order: {
      id: 1,
      cliente: {
        nome: 'Maria',
        telefone_whatsapp: '5511999990000',
      },
    },
  })

  assert.deepEqual(result, {
    delivered: false,
    skipped: true,
    reason: 'disabled',
  })
})

test('notifyOrderCreated retorna skipped quando o bot esta pausado no admin', async () => {
  const service = createWhatsAppNotificationService({
    fetchImpl() {
      throw new Error('fetch nao deveria ser chamado')
    },
  })

  const result = await service.notifyOrderCreated({
    config: { whatsapp_ativo: true, whatsapp_bot_pausado: true },
    order: {
      id: 1,
      cliente: {
        nome: 'Maria',
        telefone_whatsapp: '5511999990000',
      },
    },
  })

  assert.deepEqual(result, {
    delivered: false,
    skipped: true,
    reason: 'paused',
  })
})

test('sendTestMessage envia payload para o webhook do bot', async () => {
  const calls = []
  const service = createWhatsAppNotificationService({
    async assertSafeTargetUrl(url) {
      return url
    },
    async fetchImpl(url, options) {
      calls.push({ url, options })
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ ok: true })
        },
      }
    },
  })

  const result = await service.sendTestMessage({
    config: {
      whatsapp_ativo: false,
      whatsapp_webhook_url: 'https://bot.exemplo.test/webhook',
      whatsapp_webhook_secret: 'segredo',
    },
    customer: {
      nome: 'Cliente Teste',
      telefone_whatsapp: '(11) 99999-0000',
    },
  })

  assert.equal(result.delivered, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://bot.exemplo.test/webhook')
  assert.equal(calls[0].options.headers['x-donilla-bot-secret'], 'segredo')

  const body = JSON.parse(calls[0].options.body)
  assert.equal(body.event, 'integration.test')
  assert.equal(body.recipient.telefone_whatsapp, '5511999990000')
  assert.match(body.message, /Teste da Donilla/)
})

test('sendTestMessage bloqueia webhook apontando para localhost', async () => {
  const service = createWhatsAppNotificationService()

  await assert.rejects(
    () =>
      service.sendTestMessage({
        config: {
          whatsapp_ativo: false,
          whatsapp_webhook_url: 'http://127.0.0.1:8080/webhook',
        },
        customer: {
          nome: 'Cliente Teste',
          telefone_whatsapp: '(11) 99999-0000',
        },
      }),
    /ip privado|loopback|reservado/i,
  )
})

test('notifyOrderCreated usa transporte WhatsApp configurado', async () => {
  const messageCalls = []
  const service = createWhatsAppNotificationService({
    transportService: {
      providerName: 'wppconnect',
      isConfigured() {
        return true
      },
      async sendTextMessage(payload) {
        messageCalls.push(payload)
        return { messages: [{ id: 'wamid.1' }] }
      },
    },
  })

  const result = await service.notifyOrderCreated({
    config: {
      whatsapp_ativo: true,
      tempo_entrega_minutos: 30,
      tempo_entrega_max_minutos: 45,
    },
    order: {
      id: 10,
      status_entrega: 'pendente',
      valor_total: '59.90',
      valor_entrega: '7.00',
      tracking_url: 'https://app.donilla.test/pedido/10?token=trk_10',
      cliente: {
        nome: 'Maria',
        telefone_whatsapp: '11999990000',
      },
      itens: [],
    },
  })

  assert.equal(result.delivered, true)
  assert.equal(result.provider, 'wppconnect')
  assert.equal(messageCalls.length, 1)
  assert.equal(messageCalls[0].to, '5511999990000')
  assert.match(messageCalls[0].body, /Oi Maria, recebemos seu pedido #10/)
  assert.match(messageCalls[0].body, /Entrega prevista: 30 a 45 min/)
  assert.match(messageCalls[0].body, /Acompanhe seu pedido: https:\/\/app\.donilla\.test\/pedido\/10\?token=trk_10/)
  assert.match(messageCalls[0].body, /Qualquer novidade, avisamos por aqui/)
})
