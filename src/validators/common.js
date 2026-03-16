function toInt(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null
  }

  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!/^-?\d+$/.test(trimmed)) return null

  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

function normalizeString(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

module.exports = {
  normalizeString,
  toInt,
  toNumber,
}
