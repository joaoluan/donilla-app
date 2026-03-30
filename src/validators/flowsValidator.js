const { z } = require('zod')
const { AppError } = require('../utils/errors')

const positiveInt = z.coerce.number().int().positive()
const FLOW_NODE_TYPES = [
  'trigger',
  'message',
  'menu',
  'condition',
  'wait',
  'tag',
  'input',
  'order_lookup',
  'save_observation',
  'end',
  'handoff',
]
const FLOW_TEMPLATE_KEYS = ['legacy_whatsapp_bot', 'commercial_whatsapp_starter']
const FLOW_INPUT_VARIABLE_KEY = /^[a-z][a-z0-9_]{1,39}$/

function normalizeOptionalString(value, max = 255) {
  if (value === null || value === undefined) return null

  const normalized = String(value).trim()
  if (!normalized) return null
  if (normalized.length > max) {
    throw new AppError(400, `Campo excede o limite de ${max} caracteres.`)
  }

  return normalized
}

function normalizeRequiredString(value, label, max = 255) {
  const normalized = normalizeOptionalString(value, max)
  if (!normalized) {
    throw new AppError(400, `${label} obrigatorio.`)
  }

  return normalized
}

function normalizeNodeReference(value) {
  return normalizeOptionalString(value, 100)
}

function normalizeNodeId(value) {
  return normalizeRequiredString(value, 'ID do no', 100)
}

function normalizeNodeType(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!FLOW_NODE_TYPES.includes(normalized)) {
    throw new AppError(400, 'Tipo de no invalido.')
  }

  return normalized
}

function normalizeVariableKey(value, label = 'Nome da variavel') {
  const normalized = normalizeRequiredString(value, label, 40).toLowerCase()
  if (!FLOW_INPUT_VARIABLE_KEY.test(normalized)) {
    throw new AppError(400, `${label} invalido. Use letras minusculas, numeros e underscore.`)
  }

  return normalized
}

function normalizeTemplateKey(value) {
  const normalized = normalizeOptionalString(value, 80)
  if (!normalized) return null

  if (!FLOW_TEMPLATE_KEYS.includes(normalized)) {
    throw new AppError(400, 'Template de fluxo invalido.')
  }

  return normalized
}

function normalizeFlowMeta(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }

  const templateKey = normalizeTemplateKey(input.template_key)
  if (!templateKey) {
    return null
  }

  const meta = {
    template_key: templateKey,
  }

  const templateMode = normalizeOptionalString(input.template_mode, 40)
  const templateLabel = normalizeOptionalString(input.template_label, 120)
  const templateDescription = normalizeOptionalString(input.template_description, 255)

  if (templateMode) {
    meta.template_mode = templateMode
  }

  if (templateLabel) {
    meta.template_label = templateLabel
  }

  if (templateDescription) {
    meta.template_description = templateDescription
  }

  return meta
}

function normalizePhoneSource(value) {
  const normalized = String(value || 'current_phone').trim().toLowerCase()
  if (!['current_phone', 'variable'].includes(normalized)) {
    throw new AppError(400, 'Origem do telefone invalida.')
  }

  return normalized
}

function normalizeLookupScope(value) {
  const normalized = String(value || 'latest').trim().toLowerCase()
  if (!['latest', 'active'].includes(normalized)) {
    throw new AppError(400, 'Escopo da busca de pedido invalido.')
  }

  return normalized
}

function normalizeMenuOptions(options) {
  if (!Array.isArray(options) || options.length === 0) {
    throw new AppError(400, 'No do tipo menu precisa ter pelo menos uma opcao.')
  }

  return options.map((option, index) => ({
    label: normalizeRequiredString(option?.label, `Rotulo da opcao ${index + 1}`, 120),
    next: normalizeNodeReference(option?.next),
  }))
}

function normalizeCanvas(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const output = {}
  for (const [nodeId, rawPosition] of Object.entries(value)) {
    if (!rawPosition || typeof rawPosition !== 'object') continue

    const x = Number(rawPosition.x)
    const y = Number(rawPosition.y)

    output[String(nodeId)] = {
      x: Number.isFinite(x) ? Math.round(x) : 0,
      y: Number.isFinite(y) ? Math.round(y) : 0,
    }
  }

  return output
}

function normalizeFlowNode(node) {
  const type = normalizeNodeType(node?.type)
  const id = normalizeNodeId(node?.id)
  const base = { id, type }

  if (type === 'trigger') {
    return {
      ...base,
      next: normalizeNodeReference(node?.next),
    }
  }

  if (type === 'message') {
    return {
      ...base,
      content: normalizeOptionalString(node?.content, 4000) || '',
      next: normalizeNodeReference(node?.next),
    }
  }

  if (type === 'menu') {
    return {
      ...base,
      content: normalizeOptionalString(node?.content, 2000) || '',
      options: normalizeMenuOptions(node?.options),
    }
  }

  if (type === 'condition') {
    return {
      ...base,
      match_text: normalizeOptionalString(node?.match_text ?? node?.content, 255) || '',
      yes: normalizeNodeReference(node?.yes),
      no: normalizeNodeReference(node?.no),
    }
  }

  if (type === 'wait') {
    const seconds = Number(node?.seconds ?? node?.delay_seconds ?? 0)
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 86400) {
      throw new AppError(400, 'No de espera precisa ter um tempo entre 1 e 86400 segundos.')
    }

    return {
      ...base,
      seconds,
      next: normalizeNodeReference(node?.next),
    }
  }

  if (type === 'tag') {
    return {
      ...base,
      tag_name: normalizeRequiredString(node?.tag_name ?? node?.content, 'Nome da tag', 100),
      next: normalizeNodeReference(node?.next),
    }
  }

  if (type === 'input') {
    return {
      ...base,
      prompt: normalizeOptionalString(node?.prompt ?? node?.content, 2000) || '',
      variable_key: normalizeVariableKey(node?.variable_key, 'Nome da variavel'),
      next: normalizeNodeReference(node?.next),
    }
  }

  if (type === 'order_lookup') {
    const phoneSource = normalizePhoneSource(node?.phone_source)

    return {
      ...base,
      lookup_scope: normalizeLookupScope(node?.lookup_scope),
      phone_source: phoneSource,
      phone_variable: phoneSource === 'variable'
        ? normalizeVariableKey(node?.phone_variable, 'Variavel do telefone')
        : null,
      found: normalizeNodeReference(node?.found),
      missing: normalizeNodeReference(node?.missing),
    }
  }

  if (type === 'save_observation') {
    const phoneSource = normalizePhoneSource(node?.phone_source)

    return {
      ...base,
      variable_key: normalizeVariableKey(node?.variable_key, 'Variavel da observacao'),
      phone_source: phoneSource,
      phone_variable: phoneSource === 'variable'
        ? normalizeVariableKey(node?.phone_variable, 'Variavel do telefone')
        : null,
      saved: normalizeNodeReference(node?.saved),
      missing: normalizeNodeReference(node?.missing),
    }
  }

  if (type === 'handoff') {
    return {
      ...base,
      content: normalizeOptionalString(node?.content, 2000) || '',
    }
  }

  return base
}

function validateFlowGraph(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError(400, 'Estrutura do fluxo invalida.')
  }

  const meta = normalizeFlowMeta(input.meta)
  const rawNodes = Array.isArray(input.nodes) ? input.nodes : []
  if (rawNodes.length === 0) {
    throw new AppError(400, 'O fluxo precisa ter pelo menos um no.')
  }

  const nodes = rawNodes.map((node) => normalizeFlowNode(node))
  const nodeIds = new Set()
  let triggerCount = 0

  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      throw new AppError(400, 'Existem nos duplicados no fluxo.')
    }

    nodeIds.add(node.id)
    if (node.type === 'trigger') {
      triggerCount += 1
    }
  }

  if (triggerCount !== 1) {
    throw new AppError(400, 'O fluxo precisa ter exatamente um no trigger.')
  }

  const ensureRefExists = (ref) => {
    if (!ref) return
    if (!nodeIds.has(ref)) {
      throw new AppError(400, 'Existe uma conexao apontando para um no inexistente.')
    }
  }

  for (const node of nodes) {
    ensureRefExists(node.next)
    ensureRefExists(node.yes)
    ensureRefExists(node.no)
    ensureRefExists(node.found)
    ensureRefExists(node.missing)
    ensureRefExists(node.saved)
    if (Array.isArray(node.options)) {
      node.options.forEach((option) => ensureRefExists(option.next))
    }
  }

  const normalizedGraph = {
    nodes,
  }

  if (meta) {
    normalizedGraph.meta = meta
  }

  return normalizedGraph
}

function parseFlowId(value) {
  const parsed = positiveInt.safeParse(value)
  if (!parsed.success) {
    throw new AppError(400, 'ID do fluxo invalido.')
  }

  return parsed.data
}

function validateCreateFlow(input = {}) {
  return {
    name: normalizeRequiredString(input?.name, 'Nome do fluxo', 255),
    trigger_keyword: normalizeRequiredString(input?.trigger_keyword, 'Gatilho', 255),
    template_key: normalizeTemplateKey(input?.template_key),
  }
}

function validateUpdateFlow(input = {}) {
  return {
    name: normalizeRequiredString(input?.name, 'Nome do fluxo', 255),
    trigger_keyword: normalizeRequiredString(input?.trigger_keyword, 'Gatilho', 255),
    flow_json: validateFlowGraph(input?.flow_json || {}),
    canvas_json: normalizeCanvas(input?.canvas_json),
  }
}

module.exports = {
  FLOW_NODE_TYPES,
  FLOW_TEMPLATE_KEYS,
  parseFlowId,
  validateCreateFlow,
  validateUpdateFlow,
}
