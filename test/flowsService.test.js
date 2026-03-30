const test = require('node:test')
const assert = require('node:assert/strict')

const {
  COMMERCIAL_STARTER_TEMPLATE_KEY,
  LEGACY_FLOW_TEMPLATE_KEY,
  createCommercialStarterCanvas,
  createCommercialStarterFlowGraph,
  createDefaultFlowGraph,
  createInitialFlowTemplate,
  createLegacyCanvas,
  createLegacyFlowGraph,
} = require('../src/services/flowsService')

test('createInitialFlowTemplate usa fluxo em branco por padrao', () => {
  const template = createInitialFlowTemplate('Fluxo em branco', 'oi')

  assert.deepEqual(template.graph, createDefaultFlowGraph('Fluxo em branco', 'oi'))
  assert.equal(template.canvas.trigger_1.x, 140)
  assert.equal(template.canvas.end_1.y, 320)
})

test('createCommercialStarterFlowGraph cria um fluxo comercial inicial pronto para editar', () => {
  const graph = createCommercialStarterFlowGraph('Fluxo comercial inicial', 'oi')

  assert.equal(graph.meta.template_key, COMMERCIAL_STARTER_TEMPLATE_KEY)
  assert.equal(graph.meta.template_mode, 'starter')

  const mainMenu = graph.nodes.find((node) => node.id === 'menu_commercial_main')
  const interestInput = graph.nodes.find((node) => node.id === 'input_sales_need')
  const orderLookupNode = graph.nodes.find((node) => node.id === 'order_lookup_current')
  const neighborhoodInput = graph.nodes.find((node) => node.id === 'input_bairro_entrega')

  assert.deepEqual(
    mainMenu.options.map((option) => option.label),
    [
      'Quero ver o cardapio e fazer pedido',
      'Quero ajuda para escolher',
      'Quero acompanhar meu pedido',
      'Meu pedido foi feito com outro WhatsApp',
      'Quero falar com a loja',
    ],
  )
  assert.equal(interestInput.variable_key, 'interesse_cliente')
  assert.equal(orderLookupNode.found, 'menu_order_found')
  assert.equal(neighborhoodInput.variable_key, 'bairro_cliente')
})

test('createLegacyFlowGraph cria um mapa inicial do bot legado', () => {
  const graph = createLegacyFlowGraph('Fluxo legado guiado', 'oi')

  assert.equal(graph.meta.template_key, LEGACY_FLOW_TEMPLATE_KEY)
  assert.equal(graph.meta.template_mode, 'guide')

  const triggerNode = graph.nodes.find((node) => node.id === 'trigger_1')
  const orderLookupNode = graph.nodes.find((node) => node.id === 'order_lookup_current')
  const hasOrderMenu = graph.nodes.find((node) => node.id === 'menu_has_order')
  const noOrderMenu = graph.nodes.find((node) => node.id === 'menu_no_order')
  const inputNode = graph.nodes.find((node) => node.id === 'input_observation_current')
  const saveObservationNode = graph.nodes.find((node) => node.id === 'save_observation_current')
  const handoffNode = graph.nodes.find((node) => node.id === 'handoff_legacy_1')

  assert.equal(triggerNode.next, 'message_legacy_intro')
  assert.equal(orderLookupNode.phone_source, 'current_phone')
  assert.equal(orderLookupNode.found, 'menu_has_order')
  assert.deepEqual(
    hasOrderMenu.options.map((option) => option.label),
    ['Ver resumo do ultimo pedido', 'Fazer um novo pedido', 'Enviar observacao sobre o pedido', 'Falar com a loja'],
  )
  assert.deepEqual(
    noOrderMenu.options.map((option) => option.label),
    ['Fazer um novo pedido', 'Buscar pedido com outro WhatsApp', 'Enviar observacao usando outro WhatsApp', 'Falar com a loja'],
  )
  assert.equal(inputNode.variable_key, 'observacao_cliente')
  assert.equal(saveObservationNode.saved, 'message_observation_saved')
  assert.match(handoffNode.content, /voltar ao menu automatico/i)
})

test('createInitialFlowTemplate aceita o template comercial pronto', () => {
  const template = createInitialFlowTemplate('Fluxo comercial inicial', 'oi', COMMERCIAL_STARTER_TEMPLATE_KEY)
  const starterCanvas = createCommercialStarterCanvas()

  assert.equal(template.graph.meta.template_key, COMMERCIAL_STARTER_TEMPLATE_KEY)
  assert.deepEqual(template.canvas, starterCanvas)
  assert.equal(template.graph.nodes.length, Object.keys(starterCanvas).length)
  assert.ok(template.graph.nodes.some((node) => node.type === 'tag'))
  assert.ok(template.graph.nodes.some((node) => node.type === 'order_lookup'))
  assert.ok(template.graph.nodes.some((node) => node.type === 'save_observation'))
})

test('createInitialFlowTemplate aceita o template legado guiado', () => {
  const template = createInitialFlowTemplate('Fluxo legado guiado', 'oi', LEGACY_FLOW_TEMPLATE_KEY)
  const legacyCanvas = createLegacyCanvas()

  assert.equal(template.graph.meta.template_key, LEGACY_FLOW_TEMPLATE_KEY)
  assert.deepEqual(template.canvas, legacyCanvas)
  assert.equal(template.graph.nodes.length, Object.keys(legacyCanvas).length)
  assert.ok(template.graph.nodes.some((node) => node.type === 'order_lookup'))
  assert.ok(template.graph.nodes.some((node) => node.type === 'input'))
  assert.ok(template.graph.nodes.some((node) => node.type === 'save_observation'))
})
