const { AppError } = require('./errors')

const BIRTHDAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function formatUtcDate(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseBirthdayDate(value, { allowEmpty = true, label = 'Data de aniversario' } = {}) {
  if (value === undefined) return undefined

  if (value === null) {
    if (allowEmpty) return null
    throw new AppError(400, `${label} invalida.`)
  }

  const normalized = String(value).trim()
  if (!normalized) {
    if (allowEmpty) return null
    throw new AppError(400, `${label} invalida.`)
  }

  const match = normalized.match(BIRTHDAY_PATTERN)
  if (!match) {
    throw new AppError(400, `${label} invalida.`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (year < 1900) {
    throw new AppError(400, `${label} invalida.`)
  }

  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new AppError(400, `${label} invalida.`)
  }

  const today = new Date()
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  if (parsed > todayUtc) {
    throw new AppError(400, `${label} invalida.`)
  }

  return formatUtcDate(parsed)
}

function birthdayDateToDbValue(value, options) {
  const normalized = parseBirthdayDate(value, options)
  if (normalized === undefined || normalized === null) return normalized

  const [year, month, day] = normalized.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
}

function serializeBirthdayDate(value) {
  if (!value) return null

  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]

    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return formatUtcDate(parsed)
    }

    return null
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatUtcDate(value)
  }

  return null
}

module.exports = {
  birthdayDateToDbValue,
  parseBirthdayDate,
  serializeBirthdayDate,
}
