const test = require('node:test')
const assert = require('node:assert/strict')

const {
  DEFAULT_WHATSAPP_NEW_ORDER_TEMPLATE,
  DEFAULT_WHATSAPP_STATUS_TEMPLATE,
  normalizeStoreSettings,
} = require('../src/utils/storeSettings')

test('normalizeStoreSettings substitui templates legados do WhatsApp pelos novos padroes', () => {
  const config = normalizeStoreSettings({
    whatsapp_mensagem_novo_pedido:
      'Oi {cliente_nome}! Recebemos seu pedido #{pedido_id}. Total: {valor_total}. Previsao de entrega: {previsao_entrega}.',
    whatsapp_mensagem_status:
      'Oi {cliente_nome}! O status do seu pedido #{pedido_id} agora e {status_entrega_label}.',
  })

  assert.equal(config.whatsapp_mensagem_novo_pedido, DEFAULT_WHATSAPP_NEW_ORDER_TEMPLATE)
  assert.equal(config.whatsapp_mensagem_status, DEFAULT_WHATSAPP_STATUS_TEMPLATE)
})

test('normalizeStoreSettings substitui o padrao anterior salvo no banco pelo novo texto', () => {
  const config = normalizeStoreSettings({
    whatsapp_mensagem_novo_pedido: [
      'Oi {cliente_nome}! Seu pedido #{pedido_id} foi recebido na Donilla.',
      'Total: {valor_total}',
      'Pagamento: {metodo_pagamento}',
      'Previsao de entrega: {previsao_entrega}',
      'Itens: {itens_resumo}',
      'Se precisar, e so responder esta mensagem.',
    ].join('\n'),
    whatsapp_mensagem_status: [
      'Oi {cliente_nome}! Temos uma atualizacao do seu pedido #{pedido_id}.',
      'Status atual: {status_entrega_label}',
      '{status_mensagem}',
      'Total: {valor_total}',
      'Se precisar, e so responder esta mensagem.',
    ].join('\n'),
  })

  assert.equal(config.whatsapp_mensagem_novo_pedido, DEFAULT_WHATSAPP_NEW_ORDER_TEMPLATE)
  assert.equal(config.whatsapp_mensagem_status, DEFAULT_WHATSAPP_STATUS_TEMPLATE)
})

test('normalizeStoreSettings preserva templates personalizados do WhatsApp', () => {
  const config = normalizeStoreSettings({
    whatsapp_mensagem_novo_pedido: 'Pedido #{pedido_id} confirmado.',
    whatsapp_mensagem_status: 'Status: {status_entrega_label}. {status_mensagem}',
  })

  assert.equal(config.whatsapp_mensagem_novo_pedido, 'Pedido #{pedido_id} confirmado.')
  assert.equal(config.whatsapp_mensagem_status, 'Status: {status_entrega_label}. {status_mensagem}')
})

test('normalizeStoreSettings aplica pausa do bot como false por padrao', () => {
  const config = normalizeStoreSettings({})

  assert.equal(config.whatsapp_bot_pausado, false)
})

test('normalizeStoreSettings aplica horario automatico desligado com agenda semanal padrao', () => {
  const config = normalizeStoreSettings({})

  assert.equal(config.horario_automatico_ativo, false)
  assert.equal(config.horario_funcionamento.monday.enabled, false)
  assert.equal(config.horario_funcionamento.monday.open, '09:00')
  assert.equal(config.horario_funcionamento.monday.close, '18:00')
})
