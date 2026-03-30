const test = require('node:test')
const assert = require('node:assert/strict')

const {
  LEGACY_FLOW_TEMPLATE_KEY,
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

test('createLegacyFlowGraph cria um mapa inicial do bot legado', () => {
  const graph = createLegacyFlowGraph('Fluxo legado guiado', 'oi')

  assert.equal(graph.meta.template_key, LEGACY_FLOW_TEMPLATE_KEY)
  assert.equal(graph.meta.template_mode, 'guide')

  const triggerNode = graph.nodes.find((node) => node.id === 'trigger_1')
  const menuNode = graph.nodes.find((node) => node.id === 'menu_legacy_main')
  const handoffNode = graph.nodes.find((node) => node.id === 'handoff_legacy_1')

  assert.equal(triggerNode.next, 'message_legacy_intro')
  assert.deepEqual(
    menuNode.options.map((option) => option.label),
    ['Acompanhar pedido', 'Fazer um pedido', 'Enviar uma observacao', 'Falar com a loja'],
  )
  assert.match(handoffNode.content, /voltar ao menu automatico/i)
})

test('createInitialFlowTemplate aceita o template legado guiado', () => {
  const template = createInitialFlowTemplate('Fluxo legado guiado', 'oi', LEGACY_FLOW_TEMPLATE_KEY)
  const legacyCanvas = createLegacyCanvas()

  assert.equal(template.graph.meta.template_key, LEGACY_FLOW_TEMPLATE_KEY)
  assert.deepEqual(template.canvas, legacyCanvas)
  assert.equal(template.graph.nodes.length, 10)
})
