const {
  STORE_OPERATION_TIMEZONE,
  getDefaultStoreHours,
  normalizeStoreHours,
  resolveStoreAvailability,
} = require('./storeHours')

const DEFAULT_WHATSAPP_NEW_ORDER_TEMPLATE =
  [
    'Oi {cliente_nome}, recebemos seu pedido #{pedido_id}.',
    'Entrega prevista: {previsao_entrega}.',
    'Total do pedido: {valor_total}.',
    'Qualquer novidade, avisamos por aqui.',
  ].join('\n')

const DEFAULT_WHATSAPP_STATUS_TEMPLATE =
  [
    'Oi {cliente_nome}, passando para te atualizar sobre o pedido #{pedido_id}.',
    '{status_mensagem}',
  ].join('\n')

const LEGACY_WHATSAPP_NEW_ORDER_TEMPLATES = [
  'Oi {cliente_nome}! Recebemos seu pedido #{pedido_id}. Total: {valor_total}. Previsao de entrega: {previsao_entrega}.',
  [
    'Oi {cliente_nome}! Seu pedido #{pedido_id} foi recebido na Donilla.',
    'Total: {valor_total}',
    'Pagamento: {metodo_pagamento}',
    'Previsao de entrega: {previsao_entrega}',
    'Itens: {itens_resumo}',
    'Se precisar, e so responder esta mensagem.',
  ].join('\n'),
]

const LEGACY_WHATSAPP_STATUS_TEMPLATES = [
  'Oi {cliente_nome}! O status do seu pedido #{pedido_id} agora e {status_entrega_label}.',
  [
    'Oi {cliente_nome}! Temos uma atualizacao do seu pedido #{pedido_id}.',
    'Status atual: {status_entrega_label}',
    '{status_mensagem}',
    'Total: {valor_total}',
    'Se precisar, e so responder esta mensagem.',
  ].join('\n'),
]

function getDefaultStoreSettings() {
  return {
    loja_aberta: true,
    horario_automatico_ativo: false,
    horario_funcionamento: getDefaultStoreHours(),
    tempo_entrega_minutos: 40,
    tempo_entrega_max_minutos: 60,
    taxa_entrega_padrao: 0,
    mensagem_aviso: null,
    whatsapp_ativo: false,
    whatsapp_bot_pausado: false,
    whatsapp_webhook_url: null,
    whatsapp_webhook_secret: null,
    whatsapp_mensagem_novo_pedido: DEFAULT_WHATSAPP_NEW_ORDER_TEMPLATE,
    whatsapp_mensagem_status: DEFAULT_WHATSAPP_STATUS_TEMPLATE,
  }
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return null
  const normalized = String(value).trim()
  return normalized || null
}

function normalizeWhatsAppTemplate(value, defaultTemplate, legacyTemplates = []) {
  const normalized = normalizeOptionalString(value)

  if (!normalized) return defaultTemplate
  if (legacyTemplates.includes(normalized)) return defaultTemplate

  return normalized
}

function normalizeStoreSettings(input = {}) {
  const defaults = getDefaultStoreSettings()

  return {
    ...defaults,
    ...input,
    horario_automatico_ativo: input.horario_automatico_ativo ?? defaults.horario_automatico_ativo,
    horario_funcionamento: normalizeStoreHours(input.horario_funcionamento),
    mensagem_aviso: input.mensagem_aviso ?? defaults.mensagem_aviso,
    whatsapp_ativo: input.whatsapp_ativo ?? defaults.whatsapp_ativo,
    whatsapp_bot_pausado: input.whatsapp_bot_pausado ?? defaults.whatsapp_bot_pausado,
    whatsapp_webhook_url: normalizeOptionalString(input.whatsapp_webhook_url),
    whatsapp_webhook_secret: normalizeOptionalString(input.whatsapp_webhook_secret),
    whatsapp_mensagem_novo_pedido: normalizeWhatsAppTemplate(
      input.whatsapp_mensagem_novo_pedido,
      defaults.whatsapp_mensagem_novo_pedido,
      LEGACY_WHATSAPP_NEW_ORDER_TEMPLATES,
    ),
    whatsapp_mensagem_status: normalizeWhatsAppTemplate(
      input.whatsapp_mensagem_status,
      defaults.whatsapp_mensagem_status,
      LEGACY_WHATSAPP_STATUS_TEMPLATES,
    ),
  }
}

function toPublicStoreSettings(input = {}) {
  const config = normalizeStoreSettings(input)
  const availability = resolveStoreAvailability(config)

  return {
    id: input.id,
    loja_aberta: availability.isOpen,
    loja_aberta_manual: config.loja_aberta,
    horario_automatico_ativo: config.horario_automatico_ativo,
    horario_funcionamento: config.horario_funcionamento,
    horario_timezone: STORE_OPERATION_TIMEZONE,
    loja_status_motivo: availability.reason,
    loja_status_descricao: availability.description,
    tempo_entrega_minutos: config.tempo_entrega_minutos,
    tempo_entrega_max_minutos: config.tempo_entrega_max_minutos,
    taxa_entrega_padrao: config.taxa_entrega_padrao,
    mensagem_aviso: config.mensagem_aviso,
  }
}

module.exports = {
  DEFAULT_WHATSAPP_NEW_ORDER_TEMPLATE,
  DEFAULT_WHATSAPP_STATUS_TEMPLATE,
  getDefaultStoreSettings,
  normalizeStoreSettings,
  toPublicStoreSettings,
}
