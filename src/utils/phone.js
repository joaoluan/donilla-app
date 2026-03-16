const DEFAULT_COUNTRY_CODE = '55'

function normalizeWhatsAppId(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const withNoDevice = raw.split(':', 1)[0]
  const jidBase = withNoDevice.split('@', 1)[0]

  return jidBase.trim()
}

function digitsOnly(value) {
  return normalizeWhatsAppId(value)
    .replace(/\D/g, '')
    .trim()
}

function normalizeWhatsAppPhone(value, { defaultCountryCode = DEFAULT_COUNTRY_CODE } = {}) {
  const digits = digitsOnly(value)
  if (!digits) return ''

  if (digits.startsWith(defaultCountryCode) && (digits.length === 12 || digits.length === 13)) {
    return digits
  }

  if (digits.length === 10 || digits.length === 11) {
    return `${defaultCountryCode}${digits}`
  }

  return digits
}

function normalizeLidKey(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  if (/@lid$/i.test(raw)) {
    return normalizeWhatsAppId(raw)
  }
  
  return ''
}

function getBrazilianMobileVariants(value, { defaultCountryCode = DEFAULT_COUNTRY_CODE } = {}) {
  const digits = String(value || '').replace(/\D/g, '').trim()
  if (!digits) return []

  const variants = new Set([digits])

  function addLocalVariants(localDigits) {
    if (localDigits.length === 10) {
      const withNinthDigit = `${localDigits.slice(0, 2)}9${localDigits.slice(2)}`
      variants.add(withNinthDigit)
      variants.add(`${defaultCountryCode}${withNinthDigit}`)
      return
    }

    if (localDigits.length === 11 && localDigits[2] === '9') {
      const withoutNinthDigit = `${localDigits.slice(0, 2)}${localDigits.slice(3)}`
      variants.add(withoutNinthDigit)
      variants.add(`${defaultCountryCode}${withoutNinthDigit}`)
    }
  }

  if (digits.startsWith(defaultCountryCode)) {
    const localDigits = digits.slice(defaultCountryCode.length)
    addLocalVariants(localDigits)
  } else {
    addLocalVariants(digits)
  }

  return [...variants].filter(Boolean)
}

function getPhoneSearchVariants(value, options = {}) {
  const id = normalizeWhatsAppId(value)
  if (!id) return []

  const digits = id.replace(/\D/g, '')

  const normalized = normalizeWhatsAppPhone(digits, options)
  const variants = new Set([id])

  for (const candidate of getBrazilianMobileVariants(digits, options)) {
    variants.add(candidate)
  }

  if (digits) {
    variants.add(digits)
    variants.add(normalized)
  }

  if (normalized && digits !== normalized) {
    variants.add(normalized)
  }

  for (const candidate of getBrazilianMobileVariants(normalized, options)) {
    variants.add(candidate)
  }

  const countryCode = options.defaultCountryCode || DEFAULT_COUNTRY_CODE

  if (normalized.startsWith(countryCode)) {
    const local = normalized.slice(countryCode.length)
    if (local.length === 10 || local.length === 11) {
      variants.add(local)
    }
  }

  return [...variants].filter(Boolean)
}

module.exports = {
  DEFAULT_COUNTRY_CODE,
  normalizeWhatsAppId,
  normalizeLidKey,
  digitsOnly,
  getPhoneSearchVariants,
  normalizeWhatsAppPhone,
}
