function normalizeLocationText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

function cleanLocationField(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function getRuleMatchScore(rule, address) {
  const ruleBairro = normalizeLocationText(rule?.bairro)
  const ruleCidade = normalizeLocationText(rule?.cidade)
  const addressBairro = normalizeLocationText(address?.bairro)
  const addressCidade = normalizeLocationText(address?.cidade)

  if (!ruleBairro && !ruleCidade) return -1

  if (ruleBairro && ruleCidade) {
    return ruleBairro === addressBairro && ruleCidade === addressCidade ? 3 : -1
  }

  if (ruleBairro) {
    return ruleBairro === addressBairro ? 2 : -1
  }

  if (ruleCidade) {
    return ruleCidade === addressCidade ? 1 : -1
  }

  return -1
}

function resolveDeliveryFee(address, rules, defaultFee = 0) {
  const availableRules = Array.isArray(rules) ? rules : []

  let matchedRule = null
  let bestScore = -1

  for (const rule of availableRules) {
    if (rule?.ativo === false) continue

    const score = getRuleMatchScore(rule, address)
    if (score > bestScore) {
      bestScore = score
      matchedRule = rule
    }
  }

  if (!matchedRule) {
    return {
      amount: Number(defaultFee || 0),
      matchedRule: null,
      source: 'default',
    }
  }

  return {
    amount: Number(matchedRule.valor_entrega || 0),
    matchedRule,
    source: bestScore === 3 ? 'bairro_cidade' : bestScore === 2 ? 'bairro' : 'cidade',
  }
}

module.exports = {
  cleanLocationField,
  normalizeLocationText,
  resolveDeliveryFee,
}
