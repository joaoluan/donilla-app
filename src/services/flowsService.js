const { AppError } = require('../utils/errors')
const { createFlowRepository } = require('./flowRepository')

const LEGACY_FLOW_TEMPLATE_KEY = 'legacy_whatsapp_bot'

function createDefaultFlowGraph(name, triggerKeyword) {
  return {
    id: 'flow_draft',
    name,
    trigger_keyword: triggerKeyword,
    nodes: [
      {
        id: 'trigger_1',
        type: 'trigger',
        next: 'end_1',
      },
      {
        id: 'end_1',
        type: 'end',
      },
    ],
  }
}

function createDefaultCanvas() {
  return {
    trigger_1: { x: 140, y: 120 },
    end_1: { x: 460, y: 320 },
  }
}

function createLegacyFlowGraph(name, triggerKeyword) {
  return {
    id: 'flow_draft',
    name,
    trigger_keyword: triggerKeyword,
    meta: {
      template_key: LEGACY_FLOW_TEMPLATE_KEY,
      template_mode: 'guide',
      template_label: 'Fluxo legado guiado',
      template_description: 'Mapa inicial baseado no bot legado atual do WhatsApp.',
    },
    nodes: [
      {
        id: 'trigger_1',
        type: 'trigger',
        next: 'message_legacy_intro',
      },
      {
        id: 'message_legacy_intro',
        type: 'message',
        content: [
          '[Rascunho importado do legado]',
          'O bot antigo atual abre com saudacao, menu e regras de pedido.',
          'Use este canvas como mapa inicial antes de publicar.',
        ].join('\n'),
        next: 'menu_legacy_main',
      },
      {
        id: 'menu_legacy_main',
        type: 'menu',
        content: [
          'Menu principal do legado:',
          'No bot atual, a ordem das opcoes muda quando nao existe pedido recente.',
          'Aqui elas foram consolidadas para facilitar sua leitura.',
        ].join('\n'),
        options: [
          { label: 'Acompanhar pedido', next: 'message_track_legacy' },
          { label: 'Fazer um pedido', next: 'message_storefront_legacy' },
          { label: 'Enviar uma observacao', next: 'message_observation_legacy' },
          { label: 'Falar com a loja', next: 'handoff_legacy_1' },
        ],
      },
      {
        id: 'message_track_legacy',
        type: 'message',
        content: [
          '[Base do legado]',
          'Hoje o bot antigo consulta o ultimo pedido do cliente e devolve status, pagamento e total.',
          'Se nao encontra pedido, ele pede o WhatsApp usado na compra.',
        ].join('\n'),
        next: 'end_track_legacy',
      },
      {
        id: 'message_storefront_legacy',
        type: 'message',
        content: [
          '[Base do legado]',
          'Hoje o bot antigo envia o link da loja para o cliente continuar a compra.',
          'Edite este bloco com a chamada e o texto final que voce quer usar no Flow Builder.',
        ].join('\n'),
        next: 'end_storefront_legacy',
      },
      {
        id: 'message_observation_legacy',
        type: 'message',
        content: [
          '[Base do legado]',
          'Hoje o bot antigo tenta localizar um pedido em andamento e salva a observacao no painel.',
          'Se nao encontra pedido, ele volta a pedir o WhatsApp da compra.',
        ].join('\n'),
        next: 'end_observation_legacy',
      },
      {
        id: 'handoff_legacy_1',
        type: 'handoff',
        content: [
          'Certo. Vou te deixar falando com a loja por aqui.',
          'Enquanto isso, o bot fica em pausa nesta conversa.',
          'Quando quiser voltar ao menu automatico, e so enviar 0.',
        ].join('\n'),
      },
      {
        id: 'end_track_legacy',
        type: 'end',
      },
      {
        id: 'end_storefront_legacy',
        type: 'end',
      },
      {
        id: 'end_observation_legacy',
        type: 'end',
      },
    ],
  }
}

function createLegacyCanvas() {
  return {
    trigger_1: { x: 90, y: 300 },
    message_legacy_intro: { x: 390, y: 270 },
    menu_legacy_main: { x: 740, y: 220 },
    message_track_legacy: { x: 1120, y: 20 },
    message_storefront_legacy: { x: 1120, y: 240 },
    message_observation_legacy: { x: 1120, y: 470 },
    handoff_legacy_1: { x: 1120, y: 690 },
    end_track_legacy: { x: 1490, y: 40 },
    end_storefront_legacy: { x: 1490, y: 260 },
    end_observation_legacy: { x: 1490, y: 490 },
  }
}

function createInitialFlowTemplate(name, triggerKeyword, templateKey = null) {
  if (templateKey === LEGACY_FLOW_TEMPLATE_KEY) {
    return {
      graph: createLegacyFlowGraph(name, triggerKeyword),
      canvas: createLegacyCanvas(),
    }
  }

  return {
    graph: createDefaultFlowGraph(name, triggerKeyword),
    canvas: createDefaultCanvas(),
  }
}

function normalizeFlowMeta(graph) {
  if (!graph?.meta || typeof graph.meta !== 'object' || Array.isArray(graph.meta)) {
    return null
  }

  const meta = {}
  const templateKey = String(graph.meta.template_key || '').trim()
  const templateMode = String(graph.meta.template_mode || '').trim()
  const templateLabel = String(graph.meta.template_label || '').trim()
  const templateDescription = String(graph.meta.template_description || '').trim()

  if (templateKey) {
    meta.template_key = templateKey
  }

  if (templateMode) {
    meta.template_mode = templateMode
  }

  if (templateLabel) {
    meta.template_label = templateLabel
  }

  if (templateDescription) {
    meta.template_description = templateDescription
  }

  return Object.keys(meta).length ? meta : null
}

function normalizePersistedGraph(flowId, name, triggerKeyword, graph) {
  const normalized = {
    id: `flow_${flowId || 'draft'}`,
    name,
    trigger_keyword: triggerKeyword,
    nodes: Array.isArray(graph?.nodes) ? graph.nodes : [],
  }

  const meta = normalizeFlowMeta(graph)
  if (meta) {
    normalized.meta = meta
  }

  return normalized
}

function createFlowsService(prisma) {
  const repository = createFlowRepository(prisma)

  async function requireFlow(id) {
    const flow = await repository.findFlowById(id)
    if (!flow) {
      throw new AppError(404, 'Fluxo nao encontrado.')
    }

    return flow
  }

  return {
    async listFlows() {
      return repository.listFlows()
    },

    async createFlow(input) {
      const { graph, canvas } = createInitialFlowTemplate(input.name, input.trigger_keyword, input.template_key)
      const created = await repository.createFlow({
        name: input.name,
        triggerKeyword: input.trigger_keyword,
        flowJson: graph,
        canvasJson: canvas,
      })

      if (!created) {
        throw new AppError(500, 'Nao foi possivel criar o fluxo.')
      }

      return repository.updateFlow(created.id, {
        name: input.name,
        triggerKeyword: input.trigger_keyword,
        flowJson: normalizePersistedGraph(created.id, input.name, input.trigger_keyword, graph),
        canvasJson: canvas,
      })
    },

    async getFlow(id) {
      return requireFlow(id)
    },

    async updateFlow(id, input) {
      await requireFlow(id)

      const updated = await repository.updateFlow(id, {
        name: input.name,
        triggerKeyword: input.trigger_keyword,
        flowJson: normalizePersistedGraph(id, input.name, input.trigger_keyword, input.flow_json),
        canvasJson: input.canvas_json,
      })

      if (!updated) {
        throw new AppError(500, 'Nao foi possivel salvar o fluxo.')
      }

      return updated
    },

    async publishFlow(id) {
      const flow = await requireFlow(id)
      const published = await repository.publishFlow(flow.id, flow.trigger_keyword)
      if (!published) {
        throw new AppError(500, 'Nao foi possivel publicar o fluxo.')
      }

      return published
    },

    async unpublishFlow(id) {
      await requireFlow(id)
      const updated = await repository.unpublishFlow(id)
      if (!updated) {
        throw new AppError(500, 'Nao foi possivel despublicar o fluxo.')
      }

      return updated
    },

    async removeFlow(id) {
      const flow = await requireFlow(id)
      if (flow.status !== 'draft') {
        throw new AppError(409, 'So e possivel excluir fluxos em rascunho.')
      }

      const removed = await repository.removeFlow(id)
      if (!removed) {
        throw new AppError(500, 'Nao foi possivel excluir o fluxo.')
      }

      return removed
    },

    async listActiveSessions() {
      return repository.listActiveSessions()
    },
  }
}

module.exports = {
  LEGACY_FLOW_TEMPLATE_KEY,
  createDefaultCanvas,
  createDefaultFlowGraph,
  createInitialFlowTemplate,
  createLegacyCanvas,
  createLegacyFlowGraph,
  createFlowsService,
}
