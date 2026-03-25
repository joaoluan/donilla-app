const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildOrderMessage,
  createWhatsAppBotService,
  extractTextMessages,
} = require('../src/services/whatsappBotService')

function createTransport(sentMessages, overrides = {}) {
  return {
    isConfigured() {
      return true
    },
    validateIncomingWebhook() {},
    verifyWebhook() {
      return 'ok'
    },
    async sendTextMessage(payload) {
      sentMessages.push(payload)
      return { messages: [{ id: 'wamid.1' }] }
    },
    ...overrides,
  }
}

test('extractTextMessages le mensagens de texto recebidas do webhook do WhatsApp', () => {
  const messages = extractTextMessages({
    event: 'onmessage',
    payload: {
      from: '5511999990000@c.us',
      body: 'status 12',
      sender: { pushname: 'Maria' },
    },
  })

  assert.deepEqual(messages, [
    {
      from: '5511999990000',
      rawFrom: '5511999990000@c.us',
      profileName: 'Maria',
      body: 'status 12',
    },
  ])
})

test('extractTextMessages remove sufixos tecnicos do JID do WhatsApp', () => {
  const messages = extractTextMessages({
    event: 'onmessage',
    payload: {
      from: '5511999990000:17@s.whatsapp.net',
      body: 'oi',
      sender: { pushname: 'Maria' },
    },
  })

  assert.deepEqual(messages, [
    {
      from: '5511999990000',
      rawFrom: '5511999990000:17@s.whatsapp.net',
      profileName: 'Maria',
      body: 'oi',
    },
  ])
})

test('buildOrderMessage formata o resumo do pedido', () => {
  const text = buildOrderMessage({
    id: 12,
    status_entrega: 'preparando',
    status_pagamento: 'pendente',
    valor_total: '39.90',
    criado_em: '2026-03-11T12:00:00.000Z',
  })

  assert.match(text, /pedido #12/i)
  assert.match(text, /Status: Preparando/)
  assert.match(text, /Total: R\$/)
})

test('handleWebhookEvent responde saudacao com menu numerico e ajuda contextual', async () => {
  const previousStoreUrl = process.env.PUBLIC_STORE_URL
  process.env.PUBLIC_STORE_URL = 'https://loja.exemplo.com/loja'

  const sentMessages = []
  const prisma = {
    pedidos: {
      findFirst() {
        return Promise.resolve({
          id: 42,
          status_entrega: 'preparando',
          status_pagamento: 'pendente',
          valor_total: '49.90',
          criado_em: '2026-03-11T12:00:00.000Z',
        })
      },
    },
  }

  const service = createWhatsAppBotService(prisma, {
    transportService: createTransport(sentMessages),
  })

  try {
    const result = await service.handleWebhookEvent({
      event: 'onmessage',
      payload: {
        from: '5511999990000@c.us',
        body: 'oi',
        sender: { pushname: 'Maria' },
      },
    })

    assert.equal(result.processed, true)
    assert.equal(result.messages, 1)
    assert.equal(sentMessages.length, 1)
    assert.match(sentMessages[0].body, /assistente virtual da Donilla/i)
    assert.match(sentMessages[0].body, /Status atual: Preparando/)
    assert.match(sentMessages[0].body, /1\. Acompanhar pedido/)
    assert.match(sentMessages[0].body, /2\. Fazer um pedido/)
    assert.match(sentMessages[0].body, /#42/i)
  } finally {
    process.env.PUBLIC_STORE_URL = previousStoreUrl
  }
})

test('handleWebhookEvent prioriza fazer pedido e falar com a loja para cliente sem historico', async () => {
  const previousStoreUrl = process.env.PUBLIC_STORE_URL
  process.env.PUBLIC_STORE_URL = 'https://loja.exemplo.com/loja'

  const sentMessages = []
  const prisma = {
    pedidos: {
      findFirst() {
        return Promise.resolve(null)
      },
    },
  }

  const service = createWhatsAppBotService(prisma, {
    transportService: createTransport(sentMessages),
  })

  try {
    const result = await service.handleWebhookEvent({
      event: 'onmessage',
      payload: {
        from: '5511999990000@c.us',
        body: 'oi',
        sender: { pushname: 'Maria' },
      },
    })

    assert.equal(result.processed, true)
    assert.equal(sentMessages.length, 1)
    assert.match(sentMessages[0].body, /N\u00e3o encontrei nenhum pedido vinculado a este n\u00famero/i)
    assert.match(sentMessages[0].body, /O que voc\u00ea gostaria de fazer/i)
    assert.equal(sentMessages[0].body.indexOf('1. Fazer um novo pedido') < sentMessages[0].body.indexOf('3. Acompanhar pedido'), true)
    assert.equal(sentMessages[0].body.indexOf('2. Falar com a loja') < sentMessages[0].body.indexOf('3. Acompanhar pedido'), true)
  } finally {
    process.env.PUBLIC_STORE_URL = previousStoreUrl
  }
})

test('handleWebhookEvent prioriza pedido em andamento ao abrir o menu', async () => {
  const sentMessages = []
  const prisma = {
    pedidos: {
      findFirst(args) {
        if (args?.where?.status_entrega?.notIn) {
          return Promise.resolve({
            id: 88,
            status_entrega: 'preparando',
            status_pagamento: 'pendente',
            valor_total: '61.90',
            criado_em: '2026-03-12T12:00:00.000Z',
          })
        }

        return Promise.resolve({
          id: 90,
          status_entrega: 'entregue',
          status_pagamento: 'pago',
          valor_total: '25.00',
          criado_em: '2026-03-12T13:00:00.000Z',
        })
      },
    },
  }

  const service = createWhatsAppBotService(prisma, {
    transportService: createTransport(sentMessages),
  })

  const result = await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '5511999990000@c.us',
      body: 'oi',
      sender: { pushname: 'Maria' },
    },
  })

  assert.equal(result.processed, true)
  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0].body, /#88/i)
  assert.doesNotMatch(sentMessages[0].body, /pedido #90/i)
})

test('handleWebhookEvent aceita erro de digitacao ao consultar pedido por id', async () => {
  const sentMessages = []
  const prisma = {
    pedidos: {
      findFirst(args) {
        if (args?.where?.id === 42) {
          return Promise.resolve({
            id: 42,
            status_entrega: 'saiu_para_entrega',
            status_pagamento: 'pendente',
            valor_total: '49.90',
            criado_em: '2026-03-11T12:00:00.000Z',
          })
        }

        return Promise.resolve(null)
      },
    },
  }

  const service = createWhatsAppBotService(prisma, {
    transportService: createTransport(sentMessages),
  })

  const result = await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '5511999990000@c.us',
      body: 'staus 42',
      sender: { pushname: 'Maria' },
    },
  })

  assert.equal(result.processed, true)
  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0].body, /pedido #42/i)
  assert.match(sentMessages[0].body, /Saiu para entrega/)
})

test('handleWebhookEvent encontra pedido usando fallback pelo final do telefone', async () => {
  const sentMessages = []
  const calls = []
  const prisma = {
    pedidos: {
      findFirst(args) {
        calls.push(args)

        const exactFilter = args?.where?.clientes?.is?.telefone_whatsapp?.in
        if (Array.isArray(exactFilter)) {
          return Promise.resolve(null)
        }

        const suffixFilters = args?.where?.clientes?.is?.OR || []
        if (suffixFilters.some((item) => item?.telefone_whatsapp?.endsWith === '51985711759')) {
          return Promise.resolve({
            id: 24,
            status_entrega: 'preparando',
            status_pagamento: 'pendente',
            valor_total: '33.00',
            criado_em: '2026-03-12T03:52:41.065Z',
          })
        }

        return Promise.resolve(null)
      },
    },
  }

  const service = createWhatsAppBotService(prisma, {
    transportService: createTransport(sentMessages),
  })

  const result = await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '0005551985711759@c.us',
      body: '1',
      sender: { pushname: 'Maria' },
    },
  })

  assert.equal(result.processed, true)
  assert.equal(sentMessages.length, 1)
  assert.equal(calls.length >= 2, true)
  assert.match(sentMessages[0].body, /pedido #24/i)
  assert.match(sentMessages[0].body, /Preparando/)
})

test('handleWebhookEvent encontra pedido quando LID resolve numero sem nono digito', async () => {
  const sentMessages = []
  const prisma = {
    pedidos: {
      findFirst(args) {
        const exactFilter = args?.where?.clientes?.is?.telefone_whatsapp?.in
          || args?.where?.clientes?.is?.OR?.find((item) => item?.telefone_whatsapp?.in)?.telefone_whatsapp?.in
          || []
        if (exactFilter.includes('51985711759')) {
          return Promise.resolve({
            id: 21,
            status_entrega: 'saiu_para_entrega',
            status_pagamento: 'pendente',
            valor_total: '44.00',
            criado_em: '2026-03-12T02:46:00.212Z',
          })
        }

        return Promise.resolve(null)
      },
    },
  }

  const service = createWhatsAppBotService(prisma, {
    transportService: createTransport(sentMessages, {
      async getPhoneFromLid(lid) {
        assert.equal(lid, '196456149418037@lid')
        return '555185711759@c.us'
      },
    }),
  })

  const result = await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '196456149418037@lid',
      body: '1',
      sender: { pushname: 'Joao' },
    },
  })

  assert.equal(result.processed, true)
  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0].body, /pedido #21/i)
  assert.match(sentMessages[0].body, /Saiu para entrega/)
})

test('handleWebhookEvent persiste o LID no cliente resolvido pelo telefone', async () => {
  const sentMessages = []
  const updates = []
  const prisma = {
    pedidos: {
      findFirst(args) {
        const exactFilter = args?.where?.clientes?.is?.OR || []
        const phoneFilter = exactFilter.find((item) => item?.telefone_whatsapp?.in)
        if (phoneFilter?.telefone_whatsapp?.in?.includes('51985711759')) {
          return Promise.resolve({
            id: 31,
            status_entrega: 'preparando',
            status_pagamento: 'pendente',
            valor_total: '27.00',
            criado_em: '2026-03-12T03:00:00.000Z',
          })
        }

        return Promise.resolve(null)
      },
    },
    clientes: {
      findFirst(args) {
        if (args?.where?.whatsapp_lid === '196456149418037') {
          return Promise.resolve(null)
        }

        const phoneFilter = args?.where?.telefone_whatsapp?.in || []
        if (phoneFilter.includes('51985711759')) {
          return Promise.resolve({ id: 7, whatsapp_lid: null })
        }

        return Promise.resolve(null)
      },
      update(args) {
        updates.push(args)
        return Promise.resolve({ id: args.where.id, whatsapp_lid: args.data.whatsapp_lid })
      },
    },
  }

  const service = createWhatsAppBotService(prisma, {
    transportService: createTransport(sentMessages, {
      async getPhoneFromLid() {
        return '555185711759@c.us'
      },
    }),
  })

  const result = await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '196456149418037@lid',
      body: '1',
      sender: { pushname: 'Joao' },
    },
  })

  assert.equal(result.processed, true)
  assert.equal(updates.length, 1)
  assert.deepEqual(updates[0], {
    where: { id: 7 },
    data: { whatsapp_lid: '196456149418037' },
  })
})

test('handleWebhookEvent encontra pedido pelo LID persistido quando a resolucao falha', async () => {
  const sentMessages = []
  const prisma = {
    pedidos: {
      findFirst(args) {
        const filters = args?.where?.clientes?.is?.OR || []
        const lidFilter = filters.find((item) => item?.whatsapp_lid?.in)
        if (lidFilter?.whatsapp_lid?.in?.includes('196456149418037')) {
          return Promise.resolve({
            id: 32,
            status_entrega: 'preparando',
            status_pagamento: 'pendente',
            valor_total: '27.00',
            criado_em: '2026-03-12T03:05:00.000Z',
          })
        }

        return Promise.resolve(null)
      },
    },
    clientes: {
      findFirst(args) {
        if (args?.where?.whatsapp_lid === '196456149418037') {
          return Promise.resolve({ id: 7 })
        }

        return Promise.resolve(null)
      },
      update() {
        throw new Error('nao deveria atualizar o cliente')
      },
    },
  }

  const service = createWhatsAppBotService(prisma, {
    transportService: createTransport(sentMessages, {
      async getPhoneFromLid() {
        throw new Error('falha ao resolver lid')
      },
    }),
  })

  const result = await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '196456149418037@lid',
      body: '1',
      sender: { pushname: 'Joao' },
    },
  })

  assert.equal(result.processed, true)
  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0].body, /pedido #32/i)
})

test('handleWebhookEvent envia link da loja quando cliente escolhe fazer pedido', async () => {
  const previousStoreUrl = process.env.PUBLIC_STORE_URL
  process.env.PUBLIC_STORE_URL = 'https://loja.exemplo.com/loja'

  const sentMessages = []
  const prisma = {
    pedidos: {
      findFirst() {
        return Promise.resolve(null)
      },
    },
  }

  const service = createWhatsAppBotService(prisma, {
    transportService: createTransport(sentMessages),
  })

  try {
    const result = await service.handleWebhookEvent({
      event: 'onmessage',
      payload: {
        from: '5511999990000@c.us',
        body: '1',
        sender: { pushname: 'Maria' },
      },
    })

    assert.equal(result.processed, true)
    assert.equal(sentMessages.length, 1)
    assert.match(sentMessages[0].body, /acessar nossa loja/i)
    assert.match(sentMessages[0].body, /https:\/\/loja\.exemplo\.com\/loja/)
  } finally {
    process.env.PUBLIC_STORE_URL = previousStoreUrl
  }
})

test('handleWebhookEvent pede confirmacao do WhatsApp do pedido antes de acompanhar quando nao encontra historico', async () => {
  const sentMessages = []
  const prisma = {
    pedidos: {
      findFirst(args) {
        const exactFilter = args?.where?.clientes?.is?.telefone_whatsapp?.in
          || args?.where?.clientes?.is?.OR?.find((item) => item?.telefone_whatsapp?.in)?.telefone_whatsapp?.in
          || []

        if (exactFilter.includes('5511999991234')) {
          return Promise.resolve({
            id: 77,
            status_entrega: 'preparando',
            status_pagamento: 'pendente',
            valor_total: '42.00',
            criado_em: '2026-03-12T10:00:00.000Z',
          })
        }

        return Promise.resolve(null)
      },
    },
  }

  const service = createWhatsAppBotService(prisma, {
    transportService: createTransport(sentMessages),
  })

  await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '5511999990000@c.us',
      body: '3',
      sender: { pushname: 'Maria' },
    },
  })

  await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '5511999990000@c.us',
      body: '11 99999-1234',
      sender: { pushname: 'Maria' },
    },
  })

  assert.equal(sentMessages.length, 2)
  assert.match(sentMessages[0].body, /me envie o WhatsApp usado na compra/i)
  assert.match(sentMessages[1].body, /pedido #77/i)
  assert.match(sentMessages[1].body, /Preparando/)
})

test('handleWebhookEvent localiza pedido por outro WhatsApp antes de registrar observacao', async () => {
  const sentMessages = []
  const updatedOrders = []
  const order = {
    id: 81,
    status_entrega: 'preparando',
    status_pagamento: 'pendente',
    valor_total: '55.90',
    observacoes: '',
    criado_em: '2026-03-12T12:00:00.000Z',
  }

  const prisma = {
    pedidos: {
      findFirst(args) {
        const exactFilter = args?.where?.clientes?.is?.telefone_whatsapp?.in
          || args?.where?.clientes?.is?.OR?.find((item) => item?.telefone_whatsapp?.in)?.telefone_whatsapp?.in
          || []

        if (args?.where?.id === 81) {
          return Promise.resolve(order)
        }

        if (exactFilter.includes('5511999991234')) {
          return Promise.resolve(order)
        }

        return Promise.resolve(null)
      },
      update(args) {
        updatedOrders.push(args)
        return Promise.resolve({ ...order, observacoes: args.data.observacoes })
      },
    },
  }

  const service = createWhatsAppBotService(prisma, {
    transportService: createTransport(sentMessages),
  })

  await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '5511999990000@c.us',
      body: '4',
      sender: { pushname: 'Maria' },
    },
  })

  await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '5511999990000@c.us',
      body: '11 99999-1234',
      sender: { pushname: 'Maria' },
    },
  })

  await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '5511999990000@c.us',
      body: 'tirar a cebola, por favor',
      sender: { pushname: 'Maria' },
    },
  })

  assert.equal(sentMessages.length, 3)
  assert.match(sentMessages[0].body, /registrar sua observa\u00e7\u00e3o/i)
  assert.match(sentMessages[1].body, /vou registrar sua observacao no pedido #81/i)
  assert.match(sentMessages[2].body, /Registrei sua observacao no pedido #81/i)
  assert.equal(updatedOrders.length, 1)
  assert.match(updatedOrders[0].data.observacoes, /WhatsApp: tirar a cebola, por favor/i)
})

test('handleWebhookEvent registra observacao no pedido mais recente em andamento', async () => {
  const sentMessages = []
  const updatedOrders = []
  const order = {
    id: 55,
    status_entrega: 'preparando',
    status_pagamento: 'pendente',
    valor_total: '59.90',
    observacoes: 'Sem cobertura',
    criado_em: '2026-03-11T12:00:00.000Z',
  }

  const prisma = {
    pedidos: {
      findFirst(args) {
        if (args?.where?.id === 55) {
          return Promise.resolve(order)
        }

        return Promise.resolve(order)
      },
      update(args) {
        updatedOrders.push(args)
        return Promise.resolve({ ...order, observacoes: args.data.observacoes })
      },
    },
  }

  const service = createWhatsAppBotService(prisma, {
    transportService: createTransport(sentMessages),
  })

  await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '5511999990000@c.us',
      body: '3',
      sender: { pushname: 'Maria' },
    },
  })

  await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '5511999990000@c.us',
      body: 'sem granulado por favor',
      sender: { pushname: 'Maria' },
    },
  })

  assert.equal(sentMessages.length, 2)
  assert.match(sentMessages[0].body, /vou registrar sua observacao no pedido #55/i)
  assert.match(sentMessages[1].body, /Registrei sua observacao no pedido #55/i)
  assert.equal(updatedOrders.length, 1)
  assert.match(updatedOrders[0].data.observacoes, /WhatsApp: sem granulado por favor/i)
})

test('handleWebhookEvent pausa respostas automaticas ao transferir para a loja', async () => {
  const sentMessages = []
  const prisma = {
    pedidos: {
      findFirst() {
        return Promise.resolve(null)
      },
    },
  }

  const service = createWhatsAppBotService(prisma, {
    transportService: createTransport(sentMessages),
  })

  await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '5511999990000@c.us',
      body: '2',
      sender: { pushname: 'Maria' },
    },
  })

  await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '5511999990000@c.us',
      body: 'oi de novo',
      sender: { pushname: 'Maria' },
    },
  })

  await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '5511999990000@c.us',
      body: '0',
      sender: { pushname: 'Maria' },
    },
  })

  assert.equal(sentMessages.length, 2)
  assert.match(sentMessages[0].body, /bot fica em pausa/i)
  assert.match(sentMessages[1].body, /1\. Fazer um novo pedido/)
  assert.match(sentMessages[1].body, /3\. Acompanhar pedido/)
})

test('handleWebhookEvent ignora mensagens quando o bot esta pausado no admin', async () => {
  const sentMessages = []
  const prisma = {
    configuracoes_loja: {
      findFirst() {
        return Promise.resolve({ whatsapp_bot_pausado: true })
      },
    },
    pedidos: {
      findFirst() {
        throw new Error('nao deveria consultar pedidos com o bot pausado')
      },
    },
  }

  const service = createWhatsAppBotService(prisma, {
    transportService: createTransport(sentMessages),
  })

  const result = await service.handleWebhookEvent({
    event: 'onmessage',
    payload: {
      from: '5511999990000@c.us',
      body: 'oi',
      sender: { pushname: 'Maria' },
    },
  })

  assert.deepEqual(result, {
    processed: false,
    ignored: true,
    reason: 'paused',
    messages: 1,
  })
  assert.equal(sentMessages.length, 0)
})

test('verifyWebhook usa a validacao do transporte', async () => {
  const service = createWhatsAppBotService(
    { pedidos: { findFirst() { return Promise.resolve(null) } } },
    {
      transportService: {
        verifyWebhook(url) {
          assert.equal(url.searchParams.get('token'), 'meu-token')
          return 'ok'
        },
      },
    },
  )

  const challenge = await service.verifyWebhook(
    new URL('http://localhost/whatsapp/webhook?token=meu-token'),
  )

  assert.equal(challenge, 'ok')
})
