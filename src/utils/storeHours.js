const STORE_OPERATION_TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || 'America/Sao_Paulo'

const STORE_HOURS_DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const STORE_HOURS_DAY_LABELS = {
  sunday: 'domingo',
  monday: 'segunda-feira',
  tuesday: 'terca-feira',
  wednesday: 'quarta-feira',
  thursday: 'quinta-feira',
  friday: 'sexta-feira',
  saturday: 'sabado',
}

const WEEKDAY_INDEX_BY_KEY = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const WEEKDAY_KEY_BY_SHORT = {
  Sun: 'sunday',
  Mon: 'monday',
  Tue: 'tuesday',
  Wed: 'wednesday',
  Thu: 'thursday',
  Fri: 'friday',
  Sat: 'saturday',
}

function getDefaultStoreHours() {
  return {
    sunday: { enabled: false, open: '09:00', close: '18:00' },
    monday: { enabled: false, open: '09:00', close: '18:00' },
    tuesday: { enabled: false, open: '09:00', close: '18:00' },
    wednesday: { enabled: false, open: '09:00', close: '18:00' },
    thursday: { enabled: false, open: '09:00', close: '18:00' },
    friday: { enabled: false, open: '09:00', close: '18:00' },
    saturday: { enabled: false, open: '09:00', close: '18:00' },
  }
}

function normalizeTimeText(value, fallback) {
  const normalized = String(value || '').trim()
  if (!/^\d{2}:\d{2}$/.test(normalized)) return fallback

  const [hours, minutes] = normalized.split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return fallback
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function parseTimeTextToMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return null

  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  return hours * 60 + minutes
}

function normalizeStoreHours(input) {
  const defaults = getDefaultStoreHours()
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}

  return STORE_HOURS_DAY_KEYS.reduce((acc, dayKey) => {
    const current = source[dayKey] && typeof source[dayKey] === 'object' && !Array.isArray(source[dayKey])
      ? source[dayKey]
      : {}

    acc[dayKey] = {
      enabled: Boolean(current.enabled),
      open: normalizeTimeText(current.open, defaults[dayKey].open),
      close: normalizeTimeText(current.close, defaults[dayKey].close),
    }

    return acc
  }, {})
}

function getZonedDateParts(date = new Date(), timeZone = STORE_OPERATION_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value
    }

    return acc
  }, {})

  const dayKey = WEEKDAY_KEY_BY_SHORT[parts.weekday] || 'sunday'
  const hours = Number(parts.hour || 0)
  const minutes = Number(parts.minute || 0)

  return {
    dayKey,
    weekdayIndex: WEEKDAY_INDEX_BY_KEY[dayKey] ?? 0,
    dateText: `${parts.year}-${parts.month}-${parts.day}`,
    timeText: `${parts.hour}:${parts.minute}`,
    minutes: hours * 60 + minutes,
  }
}

function getRelativeDayLabel(dayOffset, event) {
  if (!event) return null
  if (dayOffset === 0) return 'hoje'
  if (dayOffset === 1) return 'amanha'
  return `${STORE_HOURS_DAY_LABELS[event.dayKey]} (${event.dateText})`
}

function describeEvent(event) {
  if (!event) return null
  return `${getRelativeDayLabel(event.dayOffset, event)} as ${event.timeText}`
}

function isOvernightSlot(slot) {
  const openMinutes = parseTimeTextToMinutes(slot?.open)
  const closeMinutes = parseTimeTextToMinutes(slot?.close)

  return openMinutes !== null && closeMinutes !== null && closeMinutes < openMinutes
}

function isSlotOpenAt(slot, currentMinutes) {
  if (!slot?.enabled) return false

  const openMinutes = parseTimeTextToMinutes(slot.open)
  const closeMinutes = parseTimeTextToMinutes(slot.close)
  if (openMinutes === null || closeMinutes === null || openMinutes === closeMinutes) return false

  if (closeMinutes > openMinutes) {
    return currentMinutes >= openMinutes && currentMinutes < closeMinutes
  }

  return currentMinutes >= openMinutes
}

function isCarriedOverOpen(slot, currentMinutes) {
  if (!slot?.enabled || !isOvernightSlot(slot)) return false

  const closeMinutes = parseTimeTextToMinutes(slot.close)
  if (closeMinutes === null) return false

  return currentMinutes < closeMinutes
}

function buildEvent(now, timeZone, dayOffset, dayKey, timeText) {
  const targetDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000)
  const zoned = getZonedDateParts(targetDate, timeZone)

  return {
    dayKey,
    dayOffset,
    dateText: zoned.dateText,
    timeText,
    label: describeEvent({
      dayKey,
      dayOffset,
      dateText: zoned.dateText,
      timeText,
    }),
  }
}

function findNextOpenEvent(schedule, current, now, timeZone) {
  for (let offset = 0; offset < STORE_HOURS_DAY_KEYS.length; offset += 1) {
    const weekdayIndex = (current.weekdayIndex + offset) % STORE_HOURS_DAY_KEYS.length
    const dayKey = STORE_HOURS_DAY_KEYS[weekdayIndex]
    const slot = schedule[dayKey]
    if (!slot?.enabled) continue

    const openMinutes = parseTimeTextToMinutes(slot.open)
    if (openMinutes === null) continue

    if (offset === 0 && current.minutes >= openMinutes) {
      continue
    }

    return buildEvent(now, timeZone, offset, dayKey, slot.open)
  }

  return null
}

function resolveStoreAvailability(config = {}, now = new Date(), options = {}) {
  const timeZone = options.timeZone || STORE_OPERATION_TIMEZONE
  const schedule = normalizeStoreHours(config.horario_funcionamento)
  const automaticScheduleActive = Boolean(config.horario_automatico_ativo)
  const manualOpen = config.loja_aberta !== false
  const current = getZonedDateParts(now, timeZone)
  const previousDayKey = STORE_HOURS_DAY_KEYS[(current.weekdayIndex + 6) % STORE_HOURS_DAY_KEYS.length]
  const currentSlot = schedule[current.dayKey]
  const previousSlot = schedule[previousDayKey]

  const openFromPreviousDay = automaticScheduleActive && isCarriedOverOpen(previousSlot, current.minutes)
  const openFromCurrentDay = automaticScheduleActive && isSlotOpenAt(currentSlot, current.minutes)

  let currentScheduleOpen = false
  let currentScheduleSlot = null

  if (openFromPreviousDay) {
    currentScheduleOpen = true
    currentScheduleSlot = { ...previousSlot, dayKey: previousDayKey, dayOffset: -1, carriedOver: true }
  } else if (openFromCurrentDay) {
    currentScheduleOpen = true
    currentScheduleSlot = { ...currentSlot, dayKey: current.dayKey, dayOffset: 0, carriedOver: false }
  }

  const nextOpen = automaticScheduleActive ? findNextOpenEvent(schedule, current, now, timeZone) : null

  if (!manualOpen) {
    return {
      isOpen: false,
      manualOpen,
      automaticScheduleActive,
      reason: 'manual_closed',
      description: 'Loja fechada manualmente no painel.',
      checkoutMessage: 'Loja fechada manualmente no momento.',
      timeZone,
      current,
      nextOpen,
      nextClose: null,
      schedule,
    }
  }

  if (!automaticScheduleActive) {
    return {
      isOpen: true,
      manualOpen,
      automaticScheduleActive,
      reason: 'manual_open',
      description: 'Loja aberta manualmente. O horario automatico esta desligado.',
      checkoutMessage: null,
      timeZone,
      current,
      nextOpen: null,
      nextClose: null,
      schedule,
    }
  }

  if (currentScheduleOpen) {
    const nextClose = currentScheduleSlot.carriedOver
      ? buildEvent(now, timeZone, 0, current.dayKey, currentScheduleSlot.close)
      : buildEvent(
        now,
        timeZone,
        isOvernightSlot(currentScheduleSlot) ? 1 : 0,
        isOvernightSlot(currentScheduleSlot)
          ? STORE_HOURS_DAY_KEYS[(current.weekdayIndex + 1) % STORE_HOURS_DAY_KEYS.length]
          : current.dayKey,
        currentScheduleSlot.close,
      )

    return {
      isOpen: true,
      manualOpen,
      automaticScheduleActive,
      reason: 'scheduled_open',
      description: `Loja aberta agora. Fecha ${nextClose.label}.`,
      checkoutMessage: null,
      timeZone,
      current,
      nextOpen: null,
      nextClose,
      schedule,
    }
  }

  if (nextOpen) {
    return {
      isOpen: false,
      manualOpen,
      automaticScheduleActive,
      reason: 'outside_schedule',
      description: `Loja fechada agora. Abre ${nextOpen.label}.`,
      checkoutMessage: `Loja fechada no momento. Abrimos ${nextOpen.label}.`,
      timeZone,
      current,
      nextOpen,
      nextClose: null,
      schedule,
    }
  }

  return {
    isOpen: false,
    manualOpen,
    automaticScheduleActive,
    reason: 'schedule_unavailable',
    description: 'Loja fechada agora. Nenhum horario de funcionamento automatico foi configurado.',
    checkoutMessage: 'Loja fechada no momento. Nenhum horario de funcionamento foi configurado.',
    timeZone,
    current,
    nextOpen: null,
    nextClose: null,
    schedule,
  }
}

module.exports = {
  STORE_OPERATION_TIMEZONE,
  STORE_HOURS_DAY_KEYS,
  STORE_HOURS_DAY_LABELS,
  getDefaultStoreHours,
  normalizeStoreHours,
  parseTimeTextToMinutes,
  resolveStoreAvailability,
}
