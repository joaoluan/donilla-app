const { digitsOnly, normalizeWhatsAppPhone: normalizeCanonicalPhone } = require('./phone')

function normalizeWhatsAppPhone(phone) {
  const normalized = normalizeCanonicalPhone(phone)
  return normalized || null
}

function isNormalizedPhone(phone) {
  const raw = digitsOnly(phone)
  const normalized = normalizeCanonicalPhone(raw)
  return Boolean(raw && normalized && raw === normalized)
}

function removePhoneFormatting(phone) {
  return digitsOnly(phone)
}

module.exports = {
  normalizeWhatsAppPhone,
  isNormalizedPhone,
  removePhoneFormatting,
}
