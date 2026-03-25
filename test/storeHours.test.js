const test = require('node:test')
const assert = require('node:assert/strict')

const {
  getDefaultStoreHours,
  resolveStoreAvailability,
} = require('../src/utils/storeHours')

test('resolveStoreAvailability mantém a loja aberta quando o horario automatico esta desligado', () => {
  const result = resolveStoreAvailability({
    loja_aberta: true,
    horario_automatico_ativo: false,
  }, new Date('2026-03-25T15:30:00.000Z'))

  assert.equal(result.isOpen, true)
  assert.equal(result.reason, 'manual_open')
})

test('resolveStoreAvailability fecha a loja fora do horario e informa a proxima abertura', () => {
  const schedule = getDefaultStoreHours()
  schedule.wednesday = { enabled: true, open: '09:00', close: '18:00' }
  schedule.thursday = { enabled: true, open: '09:00', close: '18:00' }

  const result = resolveStoreAvailability({
    loja_aberta: true,
    horario_automatico_ativo: true,
    horario_funcionamento: schedule,
  }, new Date('2026-03-25T22:30:00.000Z'))

  assert.equal(result.isOpen, false)
  assert.equal(result.reason, 'outside_schedule')
  assert.equal(result.nextOpen?.timeText, '09:00')
  assert.match(result.checkoutMessage, /Abrimos amanha as 09:00/i)
})

test('resolveStoreAvailability suporta horario que vira a madrugada', () => {
  const schedule = getDefaultStoreHours()
  schedule.friday = { enabled: true, open: '18:00', close: '00:30' }

  const result = resolveStoreAvailability({
    loja_aberta: true,
    horario_automatico_ativo: true,
    horario_funcionamento: schedule,
  }, new Date('2026-03-28T02:20:00.000Z'))

  assert.equal(result.isOpen, true)
  assert.equal(result.reason, 'scheduled_open')
  assert.equal(result.nextClose?.timeText, '00:30')
})

test('resolveStoreAvailability prioriza o fechamento manual mesmo com agenda configurada', () => {
  const schedule = getDefaultStoreHours()
  schedule.wednesday = { enabled: true, open: '09:00', close: '18:00' }

  const result = resolveStoreAvailability({
    loja_aberta: false,
    horario_automatico_ativo: true,
    horario_funcionamento: schedule,
  }, new Date('2026-03-25T15:30:00.000Z'))

  assert.equal(result.isOpen, false)
  assert.equal(result.reason, 'manual_closed')
  assert.match(result.description, /fechada manualmente/i)
})
