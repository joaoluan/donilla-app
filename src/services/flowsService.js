const { AppError } = require('../utils/errors')
const { createFlowRepository } = require('./flowRepository')

const LEGACY_FLOW_TEMPLATE_KEY = 'legacy_whatsapp_bot'
const COMMERCIAL_STARTER_TEMPLATE_KEY = 'commercial_whatsapp_starter'

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
          '[Fluxo inicial pronto para edicao]',
          'Oi, {cliente_primeiro_nome}! Este fluxo ja veio preenchido com pedido, loja, observacao e handoff.',
          'Ajuste os textos, revise as conexoes e publique quando estiver do seu jeito.',
        ].join('\n'),
        next: 'order_lookup_current',
      },
      {
        id: 'order_lookup_current',
        type: 'order_lookup',
        lookup_scope: 'latest',
        phone_source: 'current_phone',
        phone_variable: null,
        found: 'menu_has_order',
        missing: 'menu_no_order',
      },
      {
        id: 'menu_has_order',
        type: 'menu',
        content: [
          'Encontrei um pedido recente neste WhatsApp.',
          'O que voce quer fazer agora?',
        ].join('\n'),
        options: [
          { label: 'Ver resumo do ultimo pedido', next: 'message_order_found_summary' },
          { label: 'Fazer um novo pedido', next: 'message_storefront_legacy' },
          { label: 'Enviar observacao sobre o pedido', next: 'input_observation_current' },
          { label: 'Falar com a loja', next: 'handoff_legacy_1' },
        ],
      },
      {
        id: 'menu_no_order',
        type: 'menu',
        content: [
          'Nao encontrei pedido neste numero agora.',
          'Mesmo assim, ja deixei caminhos prontos para voce editar.',
        ].join('\n'),
        options: [
          { label: 'Fazer um novo pedido', next: 'message_storefront_legacy' },
          { label: 'Buscar pedido com outro WhatsApp', next: 'input_lookup_phone_track' },
          { label: 'Enviar observacao usando outro WhatsApp', next: 'input_lookup_phone_obs' },
          { label: 'Falar com a loja', next: 'handoff_legacy_1' },
        ],
      },
      {
        id: 'message_order_found_summary',
        type: 'message',
        content: [
          'Encontrei este pedido para voce:',
          '{pedido_resumo}',
          '',
          'Acompanhe aqui: {pedido_tracking_url}',
        ].join('\n'),
        next: 'end_1',
      },
      {
        id: 'message_storefront_legacy',
        type: 'message',
        content: [
          'Perfeito, {cliente_primeiro_nome}!',
          'Voce pode seguir pela loja neste link:',
          '{loja_link}',
          '',
          'Se quiser, depois eu tambem posso te ajudar a acompanhar o pedido.',
        ].join('\n'),
        next: 'end_1',
      },
      {
        id: 'input_observation_current',
        type: 'input',
        prompt: [
          'Me diga a observacao que voce quer registrar no pedido.',
          'Eu vou salvar exatamente o texto enviado por voce.',
        ].join('\n'),
        variable_key: 'observacao_cliente',
        next: 'save_observation_current',
      },
      {
        id: 'save_observation_current',
        type: 'save_observation',
        variable_key: 'observacao_cliente',
        phone_source: 'current_phone',
        phone_variable: null,
        saved: 'message_observation_saved',
        missing: 'message_observation_missing',
      },
      {
        id: 'input_lookup_phone_track',
        type: 'input',
        prompt: [
          'Me mande o WhatsApp usado na compra, com DDD.',
          'Ex.: 11999999999 ou 5511999999999.',
        ].join('\n'),
        variable_key: 'lookup_phone',
        next: 'order_lookup_other_phone',
      },
      {
        id: 'order_lookup_other_phone',
        type: 'order_lookup',
        lookup_scope: 'latest',
        phone_source: 'variable',
        phone_variable: 'lookup_phone',
        found: 'message_order_other_found',
        missing: 'message_order_missing',
      },
      {
        id: 'message_order_other_found',
        type: 'message',
        content: [
          'Encontrei um pedido para o numero {pedido_telefone_consulta}:',
          '{pedido_resumo}',
          '',
          'Link de rastreio: {pedido_tracking_url}',
        ].join('\n'),
        next: 'end_1',
      },
      {
        id: 'message_order_missing',
        type: 'message',
        content: [
          'Ainda nao encontrei pedido para o numero {lookup_phone}.',
          'Confira o WhatsApp digitado e ajuste este texto como preferir.',
        ].join('\n'),
        next: 'end_1',
      },
      {
        id: 'input_lookup_phone_obs',
        type: 'input',
        prompt: [
          'Me mande o WhatsApp usado na compra para eu localizar o pedido.',
          'Ex.: 11999999999 ou 5511999999999.',
        ].join('\n'),
        variable_key: 'lookup_phone',
        next: 'input_observation_other',
      },
      {
        id: 'input_observation_other',
        type: 'input',
        prompt: 'Agora me diga a observacao que voce quer salvar nesse pedido.',
        variable_key: 'observacao_cliente',
        next: 'save_observation_other',
      },
      {
        id: 'save_observation_other',
        type: 'save_observation',
        variable_key: 'observacao_cliente',
        phone_source: 'variable',
        phone_variable: 'lookup_phone',
        saved: 'message_observation_saved',
        missing: 'message_observation_missing',
      },
      {
        id: 'message_observation_saved',
        type: 'message',
        content: [
          'Pronto! Registrei a observacao no pedido #{pedido_id}.',
          'Texto salvo: {observacao_cliente}',
        ].join('\n'),
        next: 'end_1',
      },
      {
        id: 'message_observation_missing',
        type: 'message',
        content: [
          'Nao encontrei um pedido em andamento para salvar a observacao.',
          'Se precisar, ajuste esta mensagem ou conecte para um handoff.',
        ].join('\n'),
        next: 'end_1',
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
        id: 'end_1',
        type: 'end',
      },
    ],
  }
}

function createLegacyCanvas() {
  return {
    trigger_1: { x: 80, y: 380 },
    message_legacy_intro: { x: 380, y: 350 },
    order_lookup_current: { x: 740, y: 370 },
    menu_has_order: { x: 1110, y: 120 },
    menu_no_order: { x: 1110, y: 560 },
    message_order_found_summary: { x: 1490, y: 40 },
    message_storefront_legacy: { x: 1490, y: 240 },
    input_observation_current: { x: 1490, y: 440 },
    save_observation_current: { x: 1860, y: 440 },
    input_lookup_phone_track: { x: 1490, y: 620 },
    order_lookup_other_phone: { x: 1860, y: 620 },
    message_order_other_found: { x: 2230, y: 520 },
    message_order_missing: { x: 2230, y: 710 },
    input_lookup_phone_obs: { x: 1490, y: 860 },
    input_observation_other: { x: 1860, y: 860 },
    save_observation_other: { x: 2230, y: 860 },
    message_observation_saved: { x: 2600, y: 700 },
    message_observation_missing: { x: 2600, y: 920 },
    handoff_legacy_1: { x: 1490, y: 1080 },
    end_1: { x: 2980, y: 520 },
  }
}

function createCommercialStarterFlowGraph(name, triggerKeyword) {
  return {
    id: 'flow_draft',
    name,
    trigger_keyword: triggerKeyword,
    meta: {
      template_key: COMMERCIAL_STARTER_TEMPLATE_KEY,
      template_mode: 'starter',
      template_label: 'Fluxo comercial pronto',
      template_description: 'Base com acolhimento, cardapio, captura de interesse, acompanhamento de pedido e handoff.',
    },
    nodes: [
      {
        id: 'trigger_1',
        type: 'trigger',
        next: 'message_commercial_intro',
      },
      {
        id: 'message_commercial_intro',
        type: 'message',
        content: [
          'Oi, {cliente_primeiro_nome}! Que bom ter voce por aqui.',
          'Posso te ajudar a pedir mais rapido, acompanhar um pedido ou te conectar com a loja.',
        ].join('\n'),
        next: 'menu_commercial_main',
      },
      {
        id: 'menu_commercial_main',
        type: 'menu',
        content: 'Me diga por onde voce quer começar:',
        options: [
          { label: 'Quero ver o cardapio e fazer pedido', next: 'message_storefront_offer' },
          { label: 'Quero ajuda para escolher', next: 'input_sales_need' },
          { label: 'Quero acompanhar meu pedido', next: 'order_lookup_current' },
          { label: 'Meu pedido foi feito com outro WhatsApp', next: 'input_lookup_phone_track' },
          { label: 'Quero falar com a loja', next: 'handoff_sales_1' },
        ],
      },
      {
        id: 'message_storefront_offer',
        type: 'message',
        content: [
          'Perfeito, {cliente_primeiro_nome}!',
          'Aqui esta o link da loja para voce ver o cardapio e fazer o pedido:',
          '{loja_link}',
          '',
          'Se quiser voltar para este menu depois, e so mandar oi novamente.',
        ].join('\n'),
        next: 'end_1',
      },
      {
        id: 'input_sales_need',
        type: 'input',
        prompt: [
          'Me conta rapidinho o que voce esta procurando hoje.',
          'Ex.: presente, festa, pronta entrega, docinhos ou bolo.',
        ].join('\n'),
        variable_key: 'interesse_cliente',
        next: 'tag_sales_interest',
      },
      {
        id: 'tag_sales_interest',
        type: 'tag',
        tag_name: 'lead_fluxo_comercial',
        next: 'menu_after_interest',
      },
      {
        id: 'menu_after_interest',
        type: 'menu',
        content: [
          'Perfeito. Ja anotei que voce busca: {interesse_cliente}.',
          'Como prefere seguir?',
        ].join('\n'),
        options: [
          { label: 'Me manda o link do cardapio', next: 'message_storefront_offer' },
          { label: 'Quero confirmar entrega no meu bairro', next: 'input_bairro_entrega' },
          { label: 'Quero falar com a loja', next: 'handoff_sales_1' },
        ],
      },
      {
        id: 'input_bairro_entrega',
        type: 'input',
        prompt: 'Me diga seu bairro para eu deixar essa conversa mais preparada para a loja.',
        variable_key: 'bairro_cliente',
        next: 'handoff_sales_context',
      },
      {
        id: 'handoff_sales_context',
        type: 'handoff',
        content: [
          'Perfeito. Ja deixei registrado que voce busca {interesse_cliente} e quer atendimento para o bairro {bairro_cliente}.',
          'Vou te conectar com a loja agora por aqui.',
          'Quando quiser voltar para o menu automatico, e so enviar 0.',
        ].join('\n'),
      },
      {
        id: 'order_lookup_current',
        type: 'order_lookup',
        lookup_scope: 'latest',
        phone_source: 'current_phone',
        phone_variable: null,
        found: 'menu_order_found',
        missing: 'menu_order_missing',
      },
      {
        id: 'menu_order_found',
        type: 'menu',
        content: [
          'Encontrei um pedido recente neste WhatsApp.',
          'O que voce quer fazer agora?',
        ].join('\n'),
        options: [
          { label: 'Ver resumo do pedido', next: 'message_order_found_summary' },
          { label: 'Enviar observacao sobre esse pedido', next: 'input_observation_current' },
          { label: 'Fazer um novo pedido', next: 'message_storefront_offer' },
          { label: 'Falar com a loja', next: 'handoff_sales_1' },
        ],
      },
      {
        id: 'message_order_found_summary',
        type: 'message',
        content: [
          'Aqui esta o resumo do seu pedido:',
          '{pedido_resumo}',
          '',
          'Acompanhe aqui: {pedido_tracking_url}',
        ].join('\n'),
        next: 'end_1',
      },
      {
        id: 'input_observation_current',
        type: 'input',
        prompt: [
          'Pode me mandar a observacao que voce quer registrar nesse pedido.',
          'Eu vou salvar o texto exatamente como voce enviar.',
        ].join('\n'),
        variable_key: 'observacao_cliente',
        next: 'save_observation_current',
      },
      {
        id: 'save_observation_current',
        type: 'save_observation',
        variable_key: 'observacao_cliente',
        phone_source: 'current_phone',
        phone_variable: null,
        saved: 'message_observation_saved',
        missing: 'message_observation_missing',
      },
      {
        id: 'menu_order_missing',
        type: 'menu',
        content: [
          'Ainda nao encontrei um pedido nesse WhatsApp.',
          'Posso seguir com uma destas opcoes:',
        ].join('\n'),
        options: [
          { label: 'Buscar com outro WhatsApp', next: 'input_lookup_phone_track' },
          { label: 'Quero fazer um novo pedido', next: 'message_storefront_offer' },
          { label: 'Quero falar com a loja', next: 'handoff_sales_1' },
        ],
      },
      {
        id: 'input_lookup_phone_track',
        type: 'input',
        prompt: [
          'Me mande o WhatsApp usado na compra, com DDD.',
          'Ex.: 11999999999 ou 5511999999999.',
        ].join('\n'),
        variable_key: 'lookup_phone',
        next: 'order_lookup_other_phone',
      },
      {
        id: 'order_lookup_other_phone',
        type: 'order_lookup',
        lookup_scope: 'latest',
        phone_source: 'variable',
        phone_variable: 'lookup_phone',
        found: 'message_order_other_found',
        missing: 'menu_order_missing',
      },
      {
        id: 'message_order_other_found',
        type: 'message',
        content: [
          'Encontrei um pedido para o numero {pedido_telefone_consulta}:',
          '{pedido_resumo}',
          '',
          'Acompanhe aqui: {pedido_tracking_url}',
        ].join('\n'),
        next: 'end_1',
      },
      {
        id: 'message_observation_saved',
        type: 'message',
        content: [
          'Pronto! Registrei sua observacao no pedido #{pedido_id}.',
          'Texto salvo: {observacao_cliente}',
        ].join('\n'),
        next: 'end_1',
      },
      {
        id: 'message_observation_missing',
        type: 'message',
        content: [
          'Nao encontrei um pedido em andamento para salvar essa observacao.',
          'Se quiser, posso te redirecionar para a loja ou buscar outro WhatsApp.',
        ].join('\n'),
        next: 'menu_order_missing',
      },
      {
        id: 'handoff_sales_1',
        type: 'handoff',
        content: [
          'Certo. Vou te deixar falando com a loja por aqui.',
          'Enquanto isso, o bot fica em pausa nesta conversa.',
          'Quando quiser voltar ao menu automatico, e so enviar 0.',
        ].join('\n'),
      },
      {
        id: 'end_1',
        type: 'end',
      },
    ],
  }
}

function createCommercialStarterCanvas() {
  return {
    trigger_1: { x: 80, y: 400 },
    message_commercial_intro: { x: 390, y: 380 },
    menu_commercial_main: { x: 760, y: 390 },
    message_storefront_offer: { x: 1150, y: 40 },
    input_sales_need: { x: 1150, y: 270 },
    tag_sales_interest: { x: 1530, y: 270 },
    menu_after_interest: { x: 1910, y: 270 },
    input_bairro_entrega: { x: 2290, y: 270 },
    handoff_sales_context: { x: 2670, y: 270 },
    order_lookup_current: { x: 1150, y: 560 },
    menu_order_found: { x: 1530, y: 500 },
    message_order_found_summary: { x: 1910, y: 410 },
    input_observation_current: { x: 1910, y: 650 },
    save_observation_current: { x: 2290, y: 650 },
    menu_order_missing: { x: 1530, y: 920 },
    input_lookup_phone_track: { x: 1910, y: 920 },
    order_lookup_other_phone: { x: 2290, y: 920 },
    message_order_other_found: { x: 2670, y: 860 },
    message_observation_saved: { x: 2670, y: 580 },
    message_observation_missing: { x: 2670, y: 1050 },
    handoff_sales_1: { x: 1150, y: 1120 },
    end_1: { x: 3050, y: 500 },
  }
}

function createInitialFlowTemplate(name, triggerKeyword, templateKey = null) {
  if (templateKey === LEGACY_FLOW_TEMPLATE_KEY) {
    return {
      graph: createLegacyFlowGraph(name, triggerKeyword),
      canvas: createLegacyCanvas(),
    }
  }

  if (templateKey === COMMERCIAL_STARTER_TEMPLATE_KEY) {
    return {
      graph: createCommercialStarterFlowGraph(name, triggerKeyword),
      canvas: createCommercialStarterCanvas(),
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
  COMMERCIAL_STARTER_TEMPLATE_KEY,
  LEGACY_FLOW_TEMPLATE_KEY,
  createCommercialStarterCanvas,
  createCommercialStarterFlowGraph,
  createDefaultCanvas,
  createDefaultFlowGraph,
  createInitialFlowTemplate,
  createLegacyCanvas,
  createLegacyFlowGraph,
  createFlowsService,
}
