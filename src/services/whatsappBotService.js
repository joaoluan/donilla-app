const { STATUS_LABELS, PAYMENT_STATUS_LABELS } = require('./whatsappNotificationService')
const { getPhoneSearchVariants, normalizeLidKey, normalizeWhatsAppId } = require('../utils/phone')
const { normalizePhone } = require('./wppConnectService')

const HUMAN_HANDOFF_WINDOW_MS = 30 * 60 * 1000
const OBSERVATION_MAX_LENGTH = 500
const conversationStates = new Map()

function removeDiacritics(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeCommandText(value) {
  return removeDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeCommandText(value) {
  return normalizeCommandText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
}

function levenshteinDistance(left, right) {
  const a = String(left || '')
  const b = String(right || '')

  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const matrix = Array.from({ length: a.length + 1 }, (_, row) =>
    Array.from({ length: b.length + 1 }, (_, column) => {
      if (row === 0) return column
      if (column === 0) return row
      return 0
    }),
  )

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      )
    }
  }

  return matrix[a.length][b.length]
}

function fuzzyWordEquals(word, expected) {
  const left = String(word || '').trim()
  const right = String(expected || '').trim()
  if (!left || !right) return false
  if (left === right) return true

  const maxDistance = right.length <= 4 ? 1 : 2
  return levenshteinDistance(left, right) <= maxDistance
}

function hasApproxWords(tokens = [], phraseWords = []) {
  if (phraseWords.length === 0) return false
  return phraseWords.every((word) => tokens.some((token) => fuzzyWordEquals(token, word)))
}

function matchesAnyPhrase(tokens = [], phrases = []) {
  return phrases.some((phrase) => hasApproxWords(tokens, tokenizeCommandText(phrase)))
}

function extractMenuOption(tokens = []) {
  if (tokens.length !== 1) return null
  if (!/^[0-4]$/.test(tokens[0])) return null
  return Number(tokens[0])
}

function isGreetingIntent(tokens = []) {
  return matchesAnyPhrase(tokens, [
    'oi',
    'ola',
    'oii',
    'bom dia',
    'boa tarde',
    'boa noite',
  ])
}

function isMenuIntent(tokens = []) {
  return matchesAnyPhrase(tokens, ['menu', 'ajuda', 'help', 'inicio', 'iniciar'])
}

function isResetIntent(tokens = []) {
  return isMenuIntent(tokens) || matchesAnyPhrase(tokens, ['voltar', 'cancelar', 'bot', 'retomar'])
}

function isThanksIntent(tokens = []) {
  return matchesAnyPhrase(tokens, ['obrigado', 'obrigada', 'valeu', 'vlw'])
}

function isStorefrontIntent(tokens = []) {
  return matchesAnyPhrase(tokens, [
    'fazer pedido',
    'quero pedir',
    'quero comprar',
    'novo pedido',
    'cardapio',
    'catalogo',
    'comprar',
    'pedir',
    'loja',
  ])
}

function isObservationIntent(tokens = []) {
  return matchesAnyPhrase(tokens, [
    'observacao',
    'observacao pedido',
    'deixar observacao',
    'deixar recado',
    'anotar',
    'recado',
  ])
}

function isHumanHandoffIntent(tokens = []) {
  return matchesAnyPhrase(tokens, [
    'falar com a loja',
    'falar com loja',
    'falar com atendente',
    'falar com humano',
    'atendente',
    'humano',
    'suporte',
  ])
}

function isLatestOrderIntent(tokens = []) {
  return matchesAnyPhrase(tokens, [
    'ultimo pedido',
    'ultimo',
    'meu pedido',
    'meus pedidos',
    'acompanhar pedido',
    'status pedido',
    'status',
    'onde esta meu pedido',
    'onde ta meu pedido',
  ])
}

function firstTruthyFrom(values) {
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (normalized) return normalized
  }
  return ''
}

function normalizeMessageText(item = {}) {
  return (
    item?.body ||
    item?.content ||
    item?.text?.body ||
    item?._data?.body ||
    item?._data?.text ||
    item?.messageBody ||
    item?._data?.message?.conversation ||
    item?.message?.conversation ||
    item?._data?.message?.extendedTextMessage?.text ||
    item?.message?.extendedTextMessage?.text ||
    ''
  )
}

function normalizeProfileName(item = {}) {
  return (
    item?.sender?.pushname ||
    item?.sender?.name ||
    item?.notifyName ||
    item?._data?.notifyName ||
    item?.pushName ||
    item?._data?.pushName ||
    item?.chat?.name ||
    'Cliente'
  )
}

function extractWppLookupPhone(item = {}, rawFrom = '') {
  const key = item?.key || {}
  const wrappedKey = item?._data?.key || {}
  return (
    firstTruthyFrom([
      item?.cleanedSenderPn,
      key?.cleanedSenderPn,
      item?.senderPn,
      key?.senderPn,
      wrappedKey?.cleanedSenderPn,
      wrappedKey?.senderPn,
      item?.cleanedParticipantPn,
      key?.cleanedParticipantPn,
      item?.sender?.id,
      key?.sender,
      wrappedKey?.sender,
      item?._data?.senderPn,
      item?._data?.cleanedSenderPn,
      item?._data?.sender?.id,
    ]) ||
    firstTruthyFrom([rawFrom])
  )
}

function isWppGroupMessage(item = {}, rawFrom = '') {
  return (
    /@g\.us$/i.test(rawFrom) ||
    /@g\.us$/i.test(item?.chatId || '') ||
    /@g\.us$/i.test(item?.key?.remoteJid || '') ||
    /@g\.us$/i.test(item?.key?.participant || '') ||
    /@g\.us$/i.test(item?._data?.key?.remoteJid || '') ||
    /@g\.us$/i.test(item?._data?.key?.participant || '') ||
    /@g\.us$/i.test(item?._data?.remoteJid || '')
  )
}

function collectWppConnectMessageCandidates(payload = {}) {
  const directBuckets = [
    payload?.payload,
    payload?.data,
    payload?.message,
    payload,
  ]

  const candidates = []
  for (const bucket of directBuckets) {
    if (!bucket || typeof bucket !== 'object') continue

    if (Array.isArray(bucket.messages)) {
      candidates.push(...bucket.messages)
      continue
    }

    if (bucket.messages && typeof bucket.messages === 'object') {
      candidates.push(bucket.messages)
      continue
    }

    if (Array.isArray(bucket.message)) {
      candidates.push(...bucket.message)
      continue
    }

    candidates.push(bucket)
  }

  const uniq = []
  const seen = new Set()
  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue
    const key = String(item?.key?.id || item?.id || '')
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    uniq.push(item)
  }

  return uniq
}

function extractReferencedOrderId(normalized, tokens = []) {
  const match = String(normalized || '').match(/(?:#|\b)(\d{1,10})\b/)
  if (!match) return null

  const hasOrderContext = matchesAnyPhrase(tokens, [
    'status',
    'pedido',
    'acompanhar pedido',
    'acompanhar',
  ])

  if (!hasOrderContext) return null

  const parsed = Number(match[1])
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function isPrivateHostname(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase()
  if (!normalized) return true
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(normalized)) return true
  if (/^10\./.test(normalized)) return true
  if (/^192\.168\./.test(normalized)) return true

  const block172 = normalized.match(/^172\.(\d+)\./)
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

function buildPhoneSuffixVariants(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return []

  const suffixes = new Set()

  if (digits.length >= 13) {
    suffixes.add(digits.slice(-13))
  }

  if (digits.length >= 12) {
    suffixes.add(digits.slice(-12))
  }

  if (digits.length >= 11) {
    suffixes.add(digits.slice(-11))
  }

  if (digits.length >= 10) {
    suffixes.add(digits.slice(-10))
  }

  return [...suffixes].filter(Boolean)
}

function dedupe(values) {
  return [...new Set(values)]
}

function combineWhereClauses(clauses = []) {
  const normalized = clauses.filter(Boolean)
  if (normalized.length === 0) return null
  if (normalized.length === 1) return normalized[0]
  return { OR: normalized }
}

function mergeLookupValues(values) {
  const output = new Set()

  for (const raw of Array.isArray(values) ? values : [values]) {
    const value = String(raw || '').trim()
    if (!value) continue

    output.add(value)
    for (const variant of getPhoneSearchVariants(value)) {
      output.add(variant)
    }

    const withoutDomain = normalizeWhatsAppId(value)
    if (withoutDomain) output.add(withoutDomain)
    output.add(withoutDomain.replace(/\D/g, ''))

    const normalizedDigits = normalizePhone(value)
    if (normalizedDigits) output.add(normalizedDigits)

    for (const suffix of buildPhoneSuffixVariants(value)) {
      output.add(suffix)
    }

    if (normalizedDigits) {
      for (const suffix of buildPhoneSuffixVariants(normalizedDigits)) {
        output.add(suffix)
      }
    }
  }

  return [...output].filter(Boolean)
}

function buildClientePhoneExactWhere(phone) {
  const lookupValues = mergeLookupValues(Array.isArray(phone) ? phone : [phone])
  const variants = dedupe(lookupValues)
    .map((variant) => String(variant || '').trim())
    .filter((variant) => /^\d+$/.test(variant))

  if (variants.length === 0) return null

  return {
    telefone_whatsapp: {
      in: variants,
    },
  }
}

function buildClienteLidExactWhere(values) {
  const variants = dedupe((Array.isArray(values) ? values : [values])
    .map((value) => normalizeLidKey(value))
    .filter(Boolean))

  if (variants.length === 0) return null

  return {
    whatsapp_lid: {
      in: variants,
    },
  }
}

function buildClientePhoneSuffixWhere(phone) {
  const lookupValues = mergeLookupValues(Array.isArray(phone) ? phone : [phone])
  const suffixes = new Set()

  for (const value of lookupValues) {
    for (const suffix of buildPhoneSuffixVariants(value)) {
      suffixes.add(suffix)
    }
  }

  const variants = [...suffixes]
    .map((variant) => String(variant || '').trim())
    .filter((variant) => /^\d+$/.test(variant) && variant.length >= 10)

  if (variants.length === 0) return null

  const where = []
  for (const candidate of dedupe(variants)) {
    where.push({ telefone_whatsapp: { endsWith: candidate } })
  }

  if (where.length === 1) {
    return where[0]
  }
  return { OR: where }
}

function buildClienteLookupExactWhere(values) {
  return combineWhereClauses([
    buildClientePhoneExactWhere(values),
    buildClienteLidExactWhere(values),
  ])
}

function buildClienteLookupFallbackWhere(values) {
  return combineWhereClauses([
    buildClientePhoneSuffixWhere(values),
    buildClienteLidExactWhere(values),
  ])
}

function getConversationState(phone) {
  const key = normalizePhone(phone)
  if (!key) return null

  const state = conversationStates.get(key) || null
  if (!state) return null

  if (state.mode === 'human_handoff' && Number(state.expiresAt || 0) <= Date.now()) {
    conversationStates.delete(key)
    return null
  }

  return state
}

function setConversationState(phone, state) {
  const key = normalizePhone(phone)
  if (!key) return
  conversationStates.set(key, state)
}

function clearConversationState(phone) {
  const key = normalizePhone(phone)
  if (!key) return
  conversationStates.delete(key)
}

function statusLabel(value) {
  return STATUS_LABELS[value] || value || 'Nao informado'
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDateTime(value) {
  if (!value) return '--'
  return new Date(value).toLocaleString('pt-BR')
}

function buildNoOrderMenuLines() {
  return [
    'N\u00e3o encontrei nenhum pedido vinculado a este n\u00famero no momento.',
    '',
    'O que voc\u00ea gostaria de fazer?',
    '',
    '1. Fazer um novo pedido',
    '2. Falar com a loja',
    '',
    'Se voc\u00ea j\u00e1 realizou um pedido com este n\u00famero, escolha uma das op\u00e7\u00f5es abaixo:',
    '',
    '3. Acompanhar pedido',
    '4. Enviar uma observa\u00e7\u00e3o sobre o pedido',
  ]
}

function extractLookupPhone(value) {
  const normalized = normalizePhone(value)
  if (!/^\d{12,13}$/.test(normalized)) return ''
  return normalized
}

function buildLookupPhonePrompt(intent = 'track', { invalid = false } = {}) {
  const lines = []

  if (invalid) {
    lines.push('N\u00e3o consegui identificar o n\u00famero do pedido nessa mensagem.')
    lines.push('')
  }

  if (intent === 'observation') {
    lines.push('Para eu localizar o pedido certo e registrar sua observa\u00e7\u00e3o, me envie o WhatsApp usado na compra, com DDD.')
  } else {
    lines.push('Para eu localizar seu pedido, me envie o WhatsApp usado na compra, com DDD.')
  }

  lines.push('Ex.: 11999999999 ou 5511999999999.')
  lines.push('Se quiser voltar ao menu, envie 0.')

  return lines.join('\n')
}

function buildLookupPhoneNotFoundMessage(phone) {
  return [
    `Ainda n\u00e3o encontrei pedido para o n\u00famero ${phone}.`,
    'Confira se o pedido foi feito com outro WhatsApp e me envie esse n\u00famero com DDD para eu tentar novamente.',
    'Se preferir, responda 2 para falar com a loja.',
  ].join('\n')
}

function buildHelpMessage(profileName = 'Cliente', latestOrder = null, storeUrl = null) {
  const lines = [`Ol\u00e1, ${profileName}! \u{1F60A}`, 'Eu sou a assistente virtual da Donilla.']

  if (latestOrder?.id) {
    lines.push(`Seu pedido mais recente e o #${latestOrder.id}.`)
    lines.push(`Status atual: ${statusLabel(latestOrder.status_entrega)}`)
    lines.push('Me responda com um numero ou escreva do seu jeito:')
    lines.push('1. Acompanhar pedido')
    lines.push('2. Fazer um pedido')
    lines.push('3. Enviar uma observacao')
    lines.push('4. Falar com a loja')
  } else {
    lines.push('')
    lines.push(...buildNoOrderMenuLines())
  }

  if (storeUrl && latestOrder?.id) {
    lines.push('Se preferir, tambem posso te mandar o link da loja.')
  }

  return lines.join('\n')
}

function buildUnknownMessage(profileName = 'Cliente', latestOrder = null, storeUrl = null) {
  const lines = [`Ol\u00e1, ${profileName}!`, 'N\u00e3o consegui entender essa mensagem.']

  if (latestOrder?.id) {
    lines.push(`Seu pedido mais recente e o #${latestOrder.id}.`)
    lines.push(`Status atual: ${statusLabel(latestOrder.status_entrega)}`)
    lines.push('Tente uma destas opcoes:')
    lines.push('1. Acompanhar pedido')
    lines.push('2. Fazer um pedido')
    lines.push('3. Enviar uma observacao')
    lines.push('4. Falar com a loja')
  } else {
    lines.push('')
    lines.push(...buildNoOrderMenuLines())
  }

  if (storeUrl && latestOrder?.id) {
    lines.push('Voce tambem pode escrever "quero pedir".')
  }

  return lines.join('\n')
}

function buildThanksMessage(profileName = 'Cliente') {
  return [
    `Imagina, ${profileName}!`,
    'Se quiser acompanhar seu pedido, e so me enviar 1 ou "ultimo pedido".',
  ].join('\n')
}

function buildStorefrontMessage(profileName = 'Cliente', storeUrl = null) {
  if (storeUrl) {
    return [
      `Perfeito, ${profileName}!`,
      'Para fazer seu pedido, e so acessar nossa loja pelo link abaixo:',
      storeUrl,
      'Se quiser, depois eu tambem posso te ajudar a acompanhar o pedido por aqui.',
    ].join('\n')
  }

  return [
    `Perfeito, ${profileName}!`,
    'Consigo te direcionar para a loja assim que o link publico estiver configurado no servidor.',
    'Enquanto isso, responda 4 para falar com a loja por aqui.',
  ].join('\n')
}

function buildObservationPrompt(order) {
  return [
    `Certo. Vou registrar sua observacao no pedido #${order.id}.`,
    'Agora me diga o que voce quer que a loja saiba.',
    'Se quiser cancelar e voltar ao menu, envie 0.',
  ].join('\n')
}

function buildObservationSavedMessage(order) {
  return [
    `Pronto! Registrei sua observacao no pedido #${order.id}.`,
    'A loja ja consegue ver isso no painel.',
  ].join('\n')
}

function buildObservationUnavailableMessage(storeUrl = null) {
  const lines = ['Nao encontrei um pedido em andamento para registrar observacao neste numero.']

  if (storeUrl) {
    lines.push('Se quiser fazer um novo pedido, use a opcao 2.')
  } else {
    lines.push('Se precisar, responda 4 para falar com a loja.')
  }

  return lines.join('\n')
}

function buildHumanHandoffMessage(profileName = 'Cliente') {
  return [
    `Certo, ${profileName}. Vou te deixar falando com a loja por aqui.`,
    'Enquanto isso, o bot fica em pausa nesta conversa.',
    'Quando quiser voltar ao menu automatico, e so enviar 0.',
  ].join('\n')
}

function buildOrderMessage(order, { storeUrl = null } = {}) {
  if (!order) {
    const lines = ['Ainda nao encontrei pedido para este numero.']
    if (storeUrl) {
      lines.push('Se quiser fazer um novo pedido, responda 2.')
    } else {
      lines.push('Se quiser, tente "ultimo pedido" ou "status 123".')
    }
    return lines.join('\n')
  }

  return [
    `Aqui vai o resumo do pedido #${order.id}:`,
    `Status: ${statusLabel(order.status_entrega)}`,
    `Pagamento: ${PAYMENT_STATUS_LABELS[order.status_pagamento] || order.status_pagamento || 'Aguardando pagamento'}`,
    `Total: ${formatMoney(order.valor_total)}`,
    `Criado em: ${formatDateTime(order.criado_em)}`,
  ].join('\n')
}

function extractCloudApiMessages(payload) {
  const messages = []

  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {}
      const contactsByWaId = new Map(
        (value.contacts || []).map((contact) => {
          const rawId = String(contact?.wa_id || '').trim()
          return [
            normalizePhone(rawId) || normalizeWhatsAppId(rawId),
            contact?.profile?.name || 'Cliente',
          ]
        }),
      )

      for (const message of value.messages || []) {
        if (message?.type !== 'text' || !message?.text?.body) continue

        const rawFrom = String(message.from || '').trim()
        const from = normalizePhone(rawFrom) || normalizeWhatsAppId(rawFrom)
        if (!from) continue

        const profileName =
          contactsByWaId.get(from)
          || contactsByWaId.get(normalizeWhatsAppId(rawFrom))
          || 'Cliente'

        messages.push({
          from,
          rawFrom,
          profileName,
          body: message.text.body,
        })
      }
    }
  }

  return messages
}

function extractWppConnectMessages(payload) {
  const eventName = String(payload?.event || payload?.type || '').toLowerCase()
  if (eventName && !eventName.includes('message')) {
    return []
  }

  const candidates = collectWppConnectMessageCandidates(payload)
  const messages = []

  for (const item of candidates) {
    const body = normalizeMessageText(item)
    const rawFrom = firstTruthyFrom([
      item?.from,
      item?.chatId,
      item?.key?.remoteJid,
      item?._data?.key?.remoteJid,
      item?._data?.key?.remoteJidAlt,
      item?.sender?.id,
      item?.key?.participant,
      item?._data?.key?.participant,
      item?.chat?.id,
      item?.participant,
    ])
    const from = normalizePhone(
      firstTruthyFrom([
        extractWppLookupPhone(item, rawFrom),
        rawFrom,
      ]),
    ) || normalizeWhatsAppId(rawFrom)
    const profileName = normalizeProfileName(item)

    if (!body || !from) continue
    if (
      item?.fromMe ||
      item?.key?.fromMe ||
      item?._data?.key?.fromMe ||
      item?._data?.fromMe
    ) continue
    if (item?.isGroupMsg || isWppGroupMessage(item, rawFrom)) continue

      messages.push({
        from,
        rawFrom,
        profileName,
        body,
      })
    }

  return messages
}

function extractTextMessages(payload) {
  if (payload?.object === 'whatsapp_business_account') {
    return extractCloudApiMessages(payload)
  }

  return extractWppConnectMessages(payload)
}

function createWhatsAppBotService(prisma, { transportService, logger = console, broadcastService = null } = {}) {
  if (!transportService) {
    throw new Error('Servico de transporte obrigatorio para o bot de WhatsApp.')
  }

  async function verifyWebhook(url) {
    return transportService.verifyWebhook ? transportService.verifyWebhook(url) : 'ok'
  }

  async function isBotPaused() {
    if (typeof prisma?.configuracoes_loja?.findFirst !== 'function') {
      return false
    }

    try {
      const config = await prisma.configuracoes_loja.findFirst({
        orderBy: { id: 'asc' },
        select: { whatsapp_bot_pausado: true },
      })

      return Boolean(config?.whatsapp_bot_pausado)
    } catch (error) {
      logger.warn('[whatsapp] Falha ao consultar pausa do bot:', error?.message || error)
      return false
    }
  }

  async function findOrderByPhoneAndIdExact(telefone, id, { fallbackPhones = [] } = {}) {
    const clientesWhere = buildClienteLookupExactWhere([telefone, ...fallbackPhones])
    if (!clientesWhere) return null

    return prisma.pedidos.findFirst({
      where: {
        id,
        clientes: {
          is: clientesWhere,
        },
      },
      include: {
        clientes: { select: { nome: true, telefone_whatsapp: true } },
      },
    })
  }

  async function findLatestOrderByPhoneExact(telefone, { activeOnly = false, fallbackPhones = [] } = {}) {
    const clientesWhere = buildClienteLookupExactWhere([telefone, ...fallbackPhones])
    if (!clientesWhere) return null

    return prisma.pedidos.findFirst({
      where: {
        ...(activeOnly ? { status_entrega: { notIn: ['entregue', 'cancelado'] } } : {}),
        clientes: {
          is: clientesWhere,
        },
      },
      orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
      include: {
        clientes: { select: { nome: true, telefone_whatsapp: true } },
      },
    })
  }

  async function findOrderByPhoneAndIdWithFallback(telefone, id, { fallbackPhones = [] } = {}) {
    const exactOrder = await findOrderByPhoneAndIdExact(telefone, id, { fallbackPhones })
    if (exactOrder) return exactOrder

    const clientesWhere = buildClienteLookupFallbackWhere([telefone, ...fallbackPhones])
    if (!clientesWhere) return null

    return prisma.pedidos.findFirst({
      where: {
        id,
        clientes: {
          is: clientesWhere,
        },
      },
      include: {
        clientes: { select: { nome: true, telefone_whatsapp: true } },
      },
    })
  }

  async function findLatestOrderByPhone(telefone, { activeOnly = false, fallbackPhones = [] } = {}) {
    const exactOrder = await findLatestOrderByPhoneExact(telefone, { activeOnly, fallbackPhones })
    if (exactOrder) return exactOrder

    const clientesWhere = buildClienteLookupFallbackWhere([telefone, ...fallbackPhones])
    if (!clientesWhere) return null

    return prisma.pedidos.findFirst({
      where: {
        ...(activeOnly ? { status_entrega: { notIn: ['entregue', 'cancelado'] } } : {}),
        clientes: { is: clientesWhere },
      },
      orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
      include: {
        clientes: { select: { nome: true, telefone_whatsapp: true } },
      },
    })
  }

  async function saveObservationOnOrder(order, rawText) {
    const normalizedText = String(rawText || '').replace(/\s+/g, ' ').trim()
    if (!normalizedText) return order

    const entry = `WhatsApp: ${normalizedText}`
    const existing = String(order?.observacoes || '').trim()
    const merged = existing ? `${existing} | ${entry}` : entry
    const observacoes = merged.slice(0, OBSERVATION_MAX_LENGTH)

    await prisma.pedidos.update({
      where: { id: order.id },
      data: { observacoes },
    })

    return {
      ...order,
      observacoes,
    }
  }

  async function persistResolvedLid(rawFrom, values = []) {
    if (typeof prisma?.clientes?.findFirst !== 'function' || typeof prisma?.clientes?.update !== 'function') {
      return
    }

    const lid = normalizeLidKey(rawFrom)
    if (!lid) return

    const existingByLid = await prisma.clientes.findFirst({
      where: { whatsapp_lid: lid },
      select: { id: true },
    })
    if (existingByLid) return

    const phoneWhere = buildClientePhoneExactWhere(values)
    if (!phoneWhere) return

    const cliente = await prisma.clientes.findFirst({
      where: phoneWhere,
      select: { id: true, whatsapp_lid: true },
    })
    if (!cliente || cliente.whatsapp_lid === lid) return

    try {
      await prisma.clientes.update({
        where: { id: cliente.id },
        data: { whatsapp_lid: lid },
      })
    } catch (error) {
      logger.warn('[whatsapp] Falha ao persistir LID do cliente:', error?.message || error)
    }
  }

  async function buildReply({
    from,
    rawFrom = '',
    lookupPhones = [],
    body,
    profileName,
  }) {
    const normalized = normalizeCommandText(body)
    const tokens = tokenizeCommandText(body)
    const state = getConversationState(from)
    const storeUrl = buildStorefrontUrl()
    const phoneLookupSet = dedupe([from, rawFrom, ...lookupPhones].filter(Boolean))

    if (state?.mode === 'human_handoff') {
      if (extractMenuOption(tokens) === 0 || isResetIntent(tokens)) {
        clearConversationState(from)
      } else {
        return null
      }
    }

    const activeLatestOrder = await findLatestOrderByPhone(from, {
      activeOnly: true,
      fallbackPhones: phoneLookupSet,
    })
    const latestOrder = activeLatestOrder || await findLatestOrderByPhone(from, {
      fallbackPhones: phoneLookupSet,
    })

    if (state?.mode === 'awaiting_observation') {
      const stateLookupPhones = dedupe([
        ...phoneLookupSet,
        ...((Array.isArray(state.lookupPhones) ? state.lookupPhones : []).filter(Boolean)),
      ])

      if (!normalized || extractMenuOption(tokens) === 0 || isResetIntent(tokens)) {
        clearConversationState(from)
        return buildHelpMessage(profileName, latestOrder, storeUrl)
      }

      const targetOrder =
        (state.orderId
          ? await findOrderByPhoneAndIdWithFallback(from, state.orderId, { fallbackPhones: stateLookupPhones })
          : null) ||
        (await findLatestOrderByPhone(from, { activeOnly: true, fallbackPhones: stateLookupPhones }))

      clearConversationState(from)

      if (!targetOrder) {
        return buildObservationUnavailableMessage(storeUrl)
      }

      await saveObservationOnOrder(targetOrder, body)
      return buildObservationSavedMessage(targetOrder)
    }

    if (state?.mode === 'awaiting_lookup_phone') {
      if (!normalized || extractMenuOption(tokens) === 0 || isResetIntent(tokens)) {
        clearConversationState(from)
        return buildHelpMessage(profileName, latestOrder, storeUrl)
      }

      const confirmedPhone = extractLookupPhone(body)
      if (!confirmedPhone) {
        return buildLookupPhonePrompt(state.intent, { invalid: true })
      }

      const confirmedLookupPhones = dedupe([confirmedPhone, ...getPhoneSearchVariants(confirmedPhone)])
      clearConversationState(from)

      if (state.intent === 'observation') {
        const activeOrder = await findLatestOrderByPhone(confirmedPhone, {
          activeOnly: true,
          fallbackPhones: confirmedLookupPhones,
        })

        if (!activeOrder) {
          return buildLookupPhoneNotFoundMessage(confirmedPhone)
        }

        setConversationState(from, {
          mode: 'awaiting_observation',
          orderId: activeOrder.id,
          lookupPhones: confirmedLookupPhones,
        })

        return buildObservationPrompt(activeOrder)
      }

      const confirmedActiveOrder = await findLatestOrderByPhone(confirmedPhone, {
        activeOnly: true,
        fallbackPhones: confirmedLookupPhones,
      })
      const confirmedLatestOrder = confirmedActiveOrder || await findLatestOrderByPhone(confirmedPhone, {
        fallbackPhones: confirmedLookupPhones,
      })

      if (!confirmedLatestOrder) {
        return buildLookupPhoneNotFoundMessage(confirmedPhone)
      }

      return buildOrderMessage(confirmedLatestOrder, { storeUrl })
    }

    if (!normalized) {
      return buildHelpMessage(profileName, latestOrder, storeUrl)
    }

    const menuOption = extractMenuOption(tokens)
    const hasKnownOrder = Boolean(latestOrder?.id)

    if (menuOption === 0 || isMenuIntent(tokens) || isGreetingIntent(tokens)) {
      return buildHelpMessage(profileName, latestOrder, storeUrl)
    }

    if (isThanksIntent(tokens)) {
      return buildThanksMessage(profileName)
    }

    if (isStorefrontIntent(tokens) || menuOption === (hasKnownOrder ? 2 : 1)) {
      return buildStorefrontMessage(profileName, storeUrl)
    }

    if (isHumanHandoffIntent(tokens) || menuOption === (hasKnownOrder ? 4 : 2)) {
      setConversationState(from, {
        mode: 'human_handoff',
        expiresAt: Date.now() + HUMAN_HANDOFF_WINDOW_MS,
      })
      return buildHumanHandoffMessage(profileName)
    }

    if (isObservationIntent(tokens) || menuOption === (hasKnownOrder ? 3 : 4)) {
      const activeOrder = await findLatestOrderByPhone(from, {
        activeOnly: true,
        fallbackPhones: phoneLookupSet,
      })
      if (!activeOrder) {
        setConversationState(from, {
          mode: 'awaiting_lookup_phone',
          intent: 'observation',
        })
        return buildLookupPhonePrompt('observation')
      }

      setConversationState(from, {
        mode: 'awaiting_observation',
        orderId: activeOrder.id,
        lookupPhones: phoneLookupSet,
      })

      return buildObservationPrompt(activeOrder)
    }

    const referencedOrderId = extractReferencedOrderId(normalized, tokens)
    if (referencedOrderId) {
      const order = await findOrderByPhoneAndIdWithFallback(from, referencedOrderId, {
        fallbackPhones: phoneLookupSet,
      })
      if (!order) {
        return `Nao encontrei o pedido #${referencedOrderId} para este numero.`
      }
      return buildOrderMessage(order, { storeUrl })
    }

    if (isLatestOrderIntent(tokens) || menuOption === (hasKnownOrder ? 1 : 3)) {
      if (!latestOrder) {
        setConversationState(from, {
          mode: 'awaiting_lookup_phone',
          intent: 'track',
        })
        return buildLookupPhonePrompt('track')
      }

      return buildOrderMessage(latestOrder, { storeUrl })
    }

    return buildUnknownMessage(profileName, latestOrder, storeUrl)
  }

  async function resolveLookupPhone(rawFrom, fallbackPhone) {
    const normalized = String(rawFrom || '').trim()
    if (!/@lid$/i.test(normalized)) {
      return fallbackPhone
    }

    if (typeof transportService.getPhoneFromLid !== 'function') {
      return fallbackPhone
    }

    try {
      const resolved = await transportService.getPhoneFromLid(normalized)
      return normalizePhone(resolved) || fallbackPhone
    } catch {
      return fallbackPhone
    }
  }

  async function handleIncomingMessage(message) {
    if (!transportService.isConfigured()) {
      logger.warn('[whatsapp] Mensagem recebida, mas o transporte WhatsApp nao esta configurado.')
      return
    }

    const rawFrom = firstTruthyFrom([message?.rawFrom, message?.from])
    const normalizedFallback = firstTruthyFrom([
      normalizePhone(message?.from),
      normalizeWhatsAppId(message?.from),
    ])
    const resolvedFrom = await resolveLookupPhone(rawFrom, normalizedFallback)
    const finalFrom =
      normalizePhone(resolvedFrom)
      || normalizeWhatsAppId(resolvedFrom)
      || normalizedFallback
      || rawFrom
    const lookupPhones = dedupe([rawFrom, normalizedFallback, finalFrom].filter(Boolean))

    await persistResolvedLid(rawFrom, [resolvedFrom, finalFrom, ...lookupPhones])

    const debugMode = String(process.env.DEBUG_WHATSAPP_BOT || '').trim().toLowerCase() === '1'
    if (debugMode) {
      logger.info('[whatsapp] payload processado', {
        rawFrom,
        resolvedFrom: finalFrom,
        fallbackPhones: lookupPhones,
      })
    }

    if (broadcastService?.processIncomingReply) {
      try {
        const broadcastResult = await broadcastService.processIncomingReply({
          phone: finalFrom,
          rawPhone: rawFrom,
          phones: lookupPhones,
          replyTarget: message.rawFrom || message.from,
          message: message.body,
          profileName: message.profileName,
        })

        if (broadcastResult?.matched) {
          return
        }
      } catch (error) {
        logger.error('[whatsapp] Falha ao processar resposta pendente de broadcast:', error?.message || error)
      }
    }

    const reply = await buildReply({
      ...message,
      from: finalFrom,
      rawFrom,
      lookupPhones,
    })
    if (!reply) return

    await transportService.sendTextMessage({
      to: message.rawFrom || message.from,
      body: reply,
    })
  }

  async function handleWebhookEvent(payload, url = new URL('http://localhost/whatsapp/webhook')) {
    if (transportService.validateIncomingWebhook) {
      transportService.validateIncomingWebhook(url)
    }

    const messages = extractTextMessages(payload)
    if (messages.length === 0) {
      return { processed: false, ignored: true }
    }

    if (await isBotPaused()) {
      return {
        processed: false,
        ignored: true,
        reason: 'paused',
        messages: messages.length,
      }
    }

    for (const message of messages) {
      try {
        await handleIncomingMessage(message)
      } catch (error) {
        logger.error('[whatsapp] Falha ao responder mensagem recebida:', error?.message || error)
      }
    }

    return {
      processed: true,
      messages: messages.length,
    }
  }

  return {
    verifyWebhook,
    handleWebhookEvent,
  }
}

module.exports = {
  buildHelpMessage,
  buildHumanHandoffMessage,
  buildOrderMessage,
  buildStorefrontMessage,
  buildThanksMessage,
  buildUnknownMessage,
  createWhatsAppBotService,
  extractTextMessages,
}
