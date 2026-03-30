import { escapeHtml } from '../shared/utils.js?v=20260328b';
import {
  createFlowAdminSession,
  deepClone,
  parseFlowIdFromLocation,
  renderStatusBadge,
  setInlineStatus,
  showToast,
} from './flows-shared.js?v=20260330a';

const ADDABLE_NODE_TYPES = ['message', 'menu', 'input', 'order_lookup', 'save_observation', 'condition', 'wait', 'tag', 'handoff', 'end'];
const SINGLE_NEXT_NODE_TYPES = new Set(['trigger', 'message', 'input', 'wait', 'tag']);
const LEGACY_TEMPLATE_KEY = 'legacy_whatsapp_bot';
const COMMERCIAL_STARTER_TEMPLATE_KEY = 'commercial_whatsapp_starter';
const DEFAULT_NODE_WIDTH = 264;
const DEFAULT_NODE_HEIGHT = 124;
const MIN_CANVAS_WIDTH = 1280;
const MIN_CANVAS_HEIGHT = 900;
const CANVAS_PADDING_X = 220;
const CANVAS_PADDING_Y = 240;
const FLOW_VARIABLES = Object.freeze([
  { key: 'cliente_nome', description: 'Nome recebido do contato atual.' },
  { key: 'cliente_primeiro_nome', description: 'Primeiro nome do contato.' },
  { key: 'cliente_telefone', description: 'Telefone atual da conversa.' },
  { key: 'mensagem_recebida', description: 'Ultima mensagem enviada pelo cliente.' },
  { key: 'fluxo_nome', description: 'Nome do fluxo atual.' },
  { key: 'gatilho_fluxo', description: 'Gatilho principal do fluxo.' },
  { key: 'loja_link', description: 'Link publico da loja quando configurado.' },
  { key: 'pedido_resumo', description: 'Resumo do pedido encontrado pelo bloco de busca.' },
  { key: 'pedido_id', description: 'Numero do pedido encontrado.' },
  { key: 'pedido_status_label', description: 'Status do pedido em texto humano.' },
  { key: 'pedido_pagamento_label', description: 'Status do pagamento em texto humano.' },
  { key: 'pedido_total', description: 'Valor total formatado em BRL.' },
  { key: 'pedido_tracking_url', description: 'Link publico de rastreio do pedido.' },
  { key: 'pedido_observacoes', description: 'Observacoes atuais do pedido.' },
  { key: 'pedido_telefone_consulta', description: 'Telefone usado na ultima busca de pedido.' },
  { key: 'menu_opcao_escolhida', description: 'Numero escolhido no ultimo menu.' },
  { key: 'menu_opcao_rotulo', description: 'Rotulo escolhido no ultimo menu.' },
  { key: 'interesse_cliente', description: 'Exemplo de variavel capturada para saber o que o cliente procura.' },
  { key: 'bairro_cliente', description: 'Exemplo de variavel capturada para entrega ou atendimento local.' },
  { key: 'lookup_phone', description: 'Telefone informado pelo cliente para buscar pedido em outro WhatsApp.' },
  { key: 'observacao_cliente', description: 'Texto livre capturado para registrar observacoes no pedido.' },
]);

const NODE_DEFINITIONS = Object.freeze({
  trigger: {
    label: 'Trigger',
    description: 'Entrada do fluxo pelo gatilho principal.',
    className: 'builder-block-trigger',
    create(id) {
      return { id, type: 'trigger', next: null };
    },
  },
  message: {
    label: 'Mensagem',
    description: 'Envia um texto simples para o cliente.',
    className: 'builder-block-message',
    create(id) {
      return {
        id,
        type: 'message',
        content: 'Olá! Como posso te ajudar hoje?',
        next: null,
      };
    },
  },
  menu: {
    label: 'Menu',
    description: 'Mostra opções numeradas e espera a resposta.',
    className: 'builder-block-menu',
    create(id) {
      return {
        id,
        type: 'menu',
        content: 'Escolha uma opção:',
        options: [
          { label: 'Primeira opção', next: null },
          { label: 'Segunda opção', next: null },
        ],
      };
    },
  },
  condition: {
    label: 'Condição',
    description: 'Verifica se a mensagem contém um texto específico.',
    className: 'builder-block-condition',
    create(id) {
      return {
        id,
        type: 'condition',
        match_text: 'cardápio',
        yes: null,
        no: null,
      };
    },
  },
  wait: {
    label: 'Aguardar',
    description: 'Espera alguns segundos antes de seguir.',
    className: 'builder-block-wait',
    create(id) {
      return {
        id,
        type: 'wait',
        seconds: 5,
        next: null,
      };
    },
  },
  tag: {
    label: 'Tag',
    description: 'Adiciona uma tag ao cliente atual.',
    className: 'builder-block-tag',
    create(id) {
      return {
        id,
        type: 'tag',
        tag_name: 'lead_qualificado',
        next: null,
      };
    },
  },
  input: {
    label: 'Capturar resposta',
    description: 'Pergunta algo, espera texto livre e salva em uma variavel.',
    className: 'builder-block-input',
    create(id) {
      return {
        id,
        type: 'input',
        prompt: 'Me conte com suas palavras o que voce precisa.',
        variable_key: 'resposta_cliente',
        next: null,
      };
    },
  },
  order_lookup: {
    label: 'Buscar pedido',
    description: 'Procura o ultimo pedido do cliente e abre caminhos de encontrado ou nao.',
    className: 'builder-block-order',
    create(id) {
      return {
        id,
        type: 'order_lookup',
        lookup_scope: 'latest',
        phone_source: 'current_phone',
        phone_variable: null,
        found: null,
        missing: null,
      };
    },
  },
  save_observation: {
    label: 'Salvar observacao',
    description: 'Pega uma variavel capturada e registra no pedido em andamento.',
    className: 'builder-block-observation',
    create(id) {
      return {
        id,
        type: 'save_observation',
        variable_key: 'observacao_cliente',
        phone_source: 'current_phone',
        phone_variable: null,
        saved: null,
        missing: null,
      };
    },
  },
  handoff: {
    label: 'Handoff',
    description: 'Pausa o bot e passa para atendimento humano.',
    className: 'builder-block-handoff',
    create(id) {
      return {
        id,
        type: 'handoff',
        content: 'Vou transferir você para a nossa equipe. Aguarde só um instante.',
      };
    },
  },
  end: {
    label: 'Fim',
    description: 'Encerra o fluxo e limpa a sessão atual.',
    className: 'builder-block-end',
    create(id) {
      return {
        id,
        type: 'end',
      };
    },
  },
});

const state = {
  flowId: parseFlowIdFromLocation(),
  flow: null,
  flowMeta: {},
  nodes: [],
  canvas: {},
  selectedNodeId: null,
  isDirty: false,
  drag: null,
  pendingConnection: null,
  contextNodeId: null,
};

const session = createFlowAdminSession();

const dom = {
  flowTitle: document.getElementById('builderFlowTitle'),
  flowNameInput: document.getElementById('builderFlowName'),
  flowTriggerInput: document.getElementById('builderFlowTrigger'),
  flowStatus: document.getElementById('builderFlowStatus'),
  pageStatus: document.getElementById('builderPageStatus'),
  templateNotice: document.getElementById('builderTemplateNotice'),
  templateNoticeTitle: document.getElementById('builderTemplateNoticeTitle'),
  templateNoticeText: document.getElementById('builderTemplateNoticeText'),
  saveBtn: document.getElementById('builderSaveBtn'),
  publishBtn: document.getElementById('builderPublishBtn'),
  unpublishBtn: document.getElementById('builderUnpublishBtn'),
  centerBtn: document.getElementById('builderCenterBtn'),
  autoLayoutBtn: document.getElementById('builderAutoLayoutBtn'),
  blockList: document.getElementById('builderBlockList'),
  variableList: document.getElementById('builderVariableList'),
  viewport: document.getElementById('builderViewport'),
  canvas: document.getElementById('builderCanvas'),
  connections: document.getElementById('builderConnections'),
  inspectorEmpty: document.getElementById('builderInspectorEmpty'),
  inspectorPanel: document.getElementById('builderInspectorPanel'),
  contextMenu: document.getElementById('builderContextMenu'),
  addMenu: document.getElementById('builderAddMenu'),
  toast: document.getElementById('builderToast'),
};

function getNodeById(nodeId) {
  return state.nodes.find((node) => node.id === nodeId) || null;
}

function getTriggerNode() {
  return state.nodes.find((node) => node.type === 'trigger') || null;
}

function summarize(value, max = 100) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Sem conteúdo configurado ainda.';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function generateNodeId(type) {
  return `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function getViewportCenterPoint() {
  return {
    x: dom.viewport.scrollLeft + dom.viewport.clientWidth / 2 - 132,
    y: dom.viewport.scrollTop + dom.viewport.clientHeight / 2 - 60,
  };
}

function ensureNodePosition(nodeId, fallbackIndex = 0) {
  if (state.canvas[nodeId]) return state.canvas[nodeId];

  state.canvas[nodeId] = {
    x: 120 + (fallbackIndex % 3) * 300,
    y: 110 + Math.floor(fallbackIndex / 3) * 220,
  };
  return state.canvas[nodeId];
}

function markDirty(nextDirty = true, message = 'Alterações pendentes. Salve quando finalizar este trecho do fluxo.') {
  state.isDirty = nextDirty;
  syncHeader();
  if (nextDirty) {
    setInlineStatus(dom.pageStatus, message, 'muted');
  }
}

function syncHeader() {
  const name = String(state.flow?.name || 'Fluxo sem nome').trim() || 'Fluxo sem nome';
  dom.flowTitle.textContent = state.isDirty ? `${name} *` : name;
  dom.flowNameInput.value = state.flow?.name || '';
  dom.flowTriggerInput.value = state.flow?.trigger_keyword || '';
  dom.flowStatus.innerHTML = renderStatusBadge(state.flow?.status || 'draft');
  dom.unpublishBtn.classList.toggle('hidden', state.flow?.status !== 'published');
  dom.publishBtn.textContent = state.flow?.status === 'published' ? 'Publicar novamente' : 'Publicar fluxo';
}

function syncTemplateNotice() {
  const meta = state.flowMeta || {};
  const templateKey = String(meta.template_key || '').trim();
  const hasTemplateGuide = Boolean(templateKey);
  const extraNoticeByTemplate = {
    [LEGACY_TEMPLATE_KEY]: 'Esse rascunho consolida o menu principal em um canvas visual, mas ainda precisa de adaptacao antes de substituir o atendimento antigo.',
    [COMMERCIAL_STARTER_TEMPLATE_KEY]: 'Esse rascunho ja vem com acolhimento comercial, captura de interesse, recuperacao de pedido e handoff. Edite os textos com o jeito da sua loja antes de publicar.',
  };

  dom.templateNotice.classList.toggle('hidden', !hasTemplateGuide);
  if (!hasTemplateGuide) {
    dom.templateNoticeTitle.textContent = 'Fluxo inicial';
    dom.templateNoticeText.textContent = '';
    return;
  }

  dom.templateNoticeTitle.textContent = meta.template_label || 'Fluxo inicial pronto';
  dom.templateNoticeText.textContent = [
    meta.template_description || 'Rascunho inicial pronto para personalizacao.',
    extraNoticeByTemplate[templateKey] || 'Revise as conexoes, ajuste o texto e publique quando estiver seguro.',
  ].join(' ');
}

function renderToolbar() {
  dom.blockList.innerHTML = ADDABLE_NODE_TYPES
    .map((type) => {
      const definition = NODE_DEFINITIONS[type];
      return `
        <button class="builder-block ${definition.className}" type="button" draggable="true" data-block-type="${type}">
          <strong>${escapeHtml(definition.label)}</strong>
          <small>${escapeHtml(definition.description)}</small>
        </button>
      `;
    })
    .join('');
}

function renderVariableGuide() {
  if (!dom.variableList) return;

  dom.variableList.innerHTML = FLOW_VARIABLES
    .map((item) => `
      <article class="builder-variable-card">
        <code>{${escapeHtml(item.key)}}</code>
        <small>${escapeHtml(item.description)}</small>
      </article>
    `)
    .join('');
}

function getNodePorts(node) {
  if (node.type === 'menu') {
    return (node.options || []).map((option, index) => ({
      key: `option:${index}`,
      label: `${index + 1}`,
      target: option?.next || null,
    }));
  }

  if (node.type === 'condition') {
    return [
      { key: 'yes', label: 'Sim', target: node.yes || null },
      { key: 'no', label: 'Não', target: node.no || null },
    ];
  }

  if (node.type === 'order_lookup') {
    return [
      { key: 'found', label: 'Encontrado', target: node.found || null },
      { key: 'missing', label: 'Nao', target: node.missing || null },
    ];
  }

  if (node.type === 'save_observation') {
    return [
      { key: 'saved', label: 'Salvo', target: node.saved || null },
      { key: 'missing', label: 'Sem pedido', target: node.missing || null },
    ];
  }

  if (SINGLE_NEXT_NODE_TYPES.has(node.type)) {
    return [{ key: 'next', label: 'Próximo', target: node.next || null }];
  }

  return [];
}

function buildNodeBody(node) {
  if (node.type === 'menu') {
    const optionList = (node.options || [])
      .map((option) => `<div class="flow-node-option"><span>${escapeHtml(option.label || 'Opção sem rótulo')}</span><small>${escapeHtml(option.next ? 'conectada' : 'sem destino')}</small></div>`)
      .join('');

    return `
      <div class="flow-node-copy">${escapeHtml(summarize(node.content, 130))}</div>
      <div class="flow-node-divider"></div>
      <div class="flow-node-options">${optionList}</div>
    `;
  }

  if (node.type === 'condition') {
    return `<div class="flow-node-copy">Verifica se a mensagem contém: <strong>${escapeHtml(node.match_text || '--')}</strong></div>`;
  }

  if (node.type === 'wait') {
    return `<div class="flow-node-copy">Aguarda <strong>${escapeHtml(String(node.seconds || 0))}s</strong> antes de continuar.</div>`;
  }

  if (node.type === 'tag') {
    return `<div class="flow-node-copy">Adiciona a tag <strong>${escapeHtml(node.tag_name || '--')}</strong> no cliente atual.</div>`;
  }

  if (node.type === 'input') {
    return `
      <div class="flow-node-copy">${escapeHtml(summarize(node.prompt, 110))}</div>
      <div class="flow-node-divider"></div>
      <div class="flow-node-copy">Salva em <strong>{${escapeHtml(node.variable_key || '--')}}</strong></div>
    `;
  }

  if (node.type === 'order_lookup') {
    const scopeLabel = node.lookup_scope === 'active' ? 'Pedido em andamento' : 'Ultimo pedido';
    const phoneLabel = node.phone_source === 'variable'
      ? `Variavel {${node.phone_variable || '--'}}`
      : 'Telefone da conversa';

    return `
      <div class="flow-node-copy"><strong>${escapeHtml(scopeLabel)}</strong></div>
      <div class="flow-node-copy">Consulta por <strong>${escapeHtml(phoneLabel)}</strong>.</div>
    `;
  }

  if (node.type === 'save_observation') {
    const phoneLabel = node.phone_source === 'variable'
      ? `Variavel {${node.phone_variable || '--'}}`
      : 'Telefone da conversa';

    return `
      <div class="flow-node-copy">Usa <strong>{${escapeHtml(node.variable_key || '--')}}</strong> como texto da observacao.</div>
      <div class="flow-node-divider"></div>
      <div class="flow-node-copy">Tenta salvar no pedido ativo encontrado por <strong>${escapeHtml(phoneLabel)}</strong>.</div>
    `;
  }

  if (node.type === 'handoff') {
    return `<div class="flow-node-copy">${escapeHtml(summarize(node.content, 120))}</div>`;
  }

  if (node.type === 'end') {
    return '<div class="flow-node-copy">Finaliza o fluxo, limpa a sessão e libera a conversa.</div>';
  }

  if (node.type === 'trigger') {
    return `<div class="flow-node-copy">Escuta os gatilhos deste fluxo: <strong>${escapeHtml(state.flow?.trigger_keyword || '--')}</strong>.</div>`;
  }

  return `<div class="flow-node-copy">${escapeHtml(summarize(node.content, 120))}</div>`;
}

function buildNodeMarkup(node, index) {
  const definition = NODE_DEFINITIONS[node.type];
  const position = ensureNodePosition(node.id, index);
  const ports = getNodePorts(node);
  const singlePercent = ports.length === 1
    ? [50]
    : ports.length === 2
      ? [26, 74]
      : ports.length === 3
        ? [18, 50, 82]
        : ports.map((_, portIndex) => 12 + ((76 / Math.max(1, ports.length - 1)) * portIndex));

  const footerCopy = ports.length ? `${ports.length} saída(s)` : 'Sem saídas';

  return `
    <article
      class="flow-node ${state.selectedNodeId === node.id ? 'selected' : ''}"
      data-node-id="${escapeHtml(node.id)}"
      data-type="${escapeHtml(node.type)}"
      style="left:${position.x}px; top:${position.y}px;"
    >
      <span class="node-port node-port-input" aria-hidden="true"></span>
      <div class="flow-node-head">
        <span class="flow-node-type">${escapeHtml(definition.label)}</span>
      </div>
      <div class="flow-node-title">${escapeHtml(definition.label)}</div>
      ${buildNodeBody(node)}
      <div class="flow-node-footer">
        <span>${escapeHtml(node.id)}</span>
        <span>${escapeHtml(footerCopy)}</span>
      </div>
      ${ports
        .map((port, portIndex) => `
          <span class="node-port node-port-output" data-port-key="${escapeHtml(port.key)}" style="left: calc(${singlePercent[portIndex]}% - 8px);">
            <span class="node-port-label">${escapeHtml(port.label)}</span>
          </span>
        `)
        .join('')}
    </article>
  `;
}

function renderCanvas(options = {}) {
  const { syncInspector = true } = options;
  dom.canvas.innerHTML = state.nodes.map((node, index) => buildNodeMarkup(node, index)).join('');
  window.requestAnimationFrame(() => {
    renderConnections();
    if (syncInspector) {
      renderInspector();
    }
  });
}

function getNodeDimensions(nodeId) {
  const nodeElement = dom.canvas.querySelector(`[data-node-id="${nodeId}"]`);
  return {
    width: nodeElement?.offsetWidth || DEFAULT_NODE_WIDTH,
    height: nodeElement?.offsetHeight || DEFAULT_NODE_HEIGHT,
  };
}

function getPortCenterOnCanvas(nodeId, portKey = null, direction = 'output') {
  const nodeElement = dom.canvas.querySelector(`[data-node-id="${nodeId}"]`);
  const position = ensureNodePosition(nodeId);
  const selector = direction === 'input'
    ? '.node-port-input'
    : `[data-port-key="${portKey}"]`;
  const portElement = nodeElement?.querySelector(selector);

  if (!portElement) {
    const dimensions = getNodeDimensions(nodeId);
    return direction === 'input'
      ? { x: position.x + dimensions.width / 2, y: position.y }
      : { x: position.x + dimensions.width / 2, y: position.y + dimensions.height };
  }

  return {
    x: position.x + portElement.offsetLeft + portElement.offsetWidth / 2,
    y: position.y + portElement.offsetTop + portElement.offsetHeight / 2,
  };
}

function getCanvasBounds() {
  let width = MIN_CANVAS_WIDTH;
  let height = MIN_CANVAS_HEIGHT;

  state.nodes.forEach((node, index) => {
    const position = ensureNodePosition(node.id, index);
    const dimensions = getNodeDimensions(node.id);
    width = Math.max(width, position.x + dimensions.width + CANVAS_PADDING_X);
    height = Math.max(height, position.y + dimensions.height + CANVAS_PADDING_Y);
  });

  if (state.pendingConnection) {
    width = Math.max(width, state.pendingConnection.currentX + CANVAS_PADDING_X);
    height = Math.max(height, state.pendingConnection.currentY + CANVAS_PADDING_Y);
  }

  return {
    width: Math.ceil(width),
    height: Math.ceil(height),
  };
}

function buildPath(start, end) {
  const verticalDistance = Math.max(72, Math.abs(end.y - start.y) * 0.42);
  const horizontalBias = Math.min(88, Math.abs(end.x - start.x) * 0.18);
  return `M ${start.x} ${start.y} C ${start.x + horizontalBias} ${start.y + verticalDistance}, ${end.x - horizontalBias} ${end.y - verticalDistance}, ${end.x} ${end.y}`;
}

function collectConnections() {
  return state.nodes.flatMap((node) =>
    getNodePorts(node)
      .filter((port) => port.target)
      .map((port) => ({
        fromNodeId: node.id,
        toNodeId: port.target,
        portKey: port.key,
      })),
  );
}

function renderConnections() {
  const bounds = getCanvasBounds();
  const width = bounds.width;
  const height = bounds.height;
  dom.canvas.style.width = `${width}px`;
  dom.canvas.style.height = `${height}px`;
  dom.connections.setAttribute('viewBox', `0 0 ${width} ${height}`);
  dom.connections.setAttribute('width', String(width));
  dom.connections.setAttribute('height', String(height));

  const defs = `
    <defs>
      <marker id="flowArrowHead" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill="#245e7c"></path>
      </marker>
    </defs>
  `;

  const lineMarkup = collectConnections()
    .map((connection) => {
      const start = getPortCenterOnCanvas(connection.fromNodeId, connection.portKey, 'output');
      const end = getPortCenterOnCanvas(connection.toNodeId, null, 'input');
      if (!start || !end) return '';
      const path = buildPath(start, end);

      return `
        <path class="connection-line-highlight" d="${path}"></path>
        <path class="connection-line" d="${path}" marker-end="url(#flowArrowHead)"></path>
      `;
    })
    .join('');

  let previewMarkup = '';
  if (state.pendingConnection) {
    const previewPath = buildPath(
      { x: state.pendingConnection.startX, y: state.pendingConnection.startY },
      { x: state.pendingConnection.currentX, y: state.pendingConnection.currentY },
    );
    previewMarkup = `<path class="connection-preview" d="${previewPath}"></path>`;
  }

  dom.connections.innerHTML = `${defs}${lineMarkup}${previewMarkup}`;
}

function renderInspector() {
  const node = getNodeById(state.selectedNodeId);
  if (!node) {
    dom.inspectorEmpty.classList.remove('hidden');
    dom.inspectorPanel.classList.add('hidden');
    dom.inspectorPanel.innerHTML = '';
    return;
  }

  const canDelete = node.type !== 'trigger';
  const canDuplicate = node.type !== 'trigger';

  const head = `
    <div class="builder-inspector-toolbar">
      <strong>${escapeHtml(NODE_DEFINITIONS[node.type].label)}</strong>
      <div>
        ${canDuplicate ? '<button class="builder-mini-btn" type="button" data-inspector-action="duplicate">Duplicar</button>' : ''}
        ${canDelete ? '<button class="builder-mini-btn builder-mini-btn-danger" type="button" data-inspector-action="delete">Excluir</button>' : ''}
      </div>
    </div>
  `;

  let content = '';
  if (node.type === 'trigger') {
    content = `
      <div class="builder-field">
        <label for="inspectorTriggerKeyword">Gatilhos do fluxo</label>
        <input id="inspectorTriggerKeyword" data-flow-field="trigger_keyword" value="${escapeHtml(state.flow?.trigger_keyword || '')}" />
        <small class="builder-field-hint">Separe varios gatilhos por virgula. O sistema ignora acentos, caixa alta e escolhe a melhor coincidencia do inicio da mensagem.</small>
      </div>
    `;
  } else if (node.type === 'message' || node.type === 'handoff') {
    content = `
      <div class="builder-field">
        <label for="inspectorNodeContent">Texto da mensagem</label>
        <textarea id="inspectorNodeContent" data-node-field="content">${escapeHtml(node.content || '')}</textarea>
        <small class="builder-field-hint">Quebras de linha são respeitadas. Você pode usar variáveis como {cliente_nome}, {loja_link} e {pedido_resumo}.</small>
      </div>
    `;
  } else if (node.type === 'menu') {
    content = `
      <div class="builder-field">
        <label for="inspectorMenuContent">Pergunta do menu</label>
        <textarea id="inspectorMenuContent" data-node-field="content">${escapeHtml(node.content || '')}</textarea>
        <small class="builder-field-hint">O texto aceita variáveis. As opções ficam numeradas automaticamente no WhatsApp.</small>
      </div>
      <div class="builder-field">
        <label>Opções</label>
        <div class="builder-option-list">
          ${(node.options || [])
            .map((option, index) => `
              <article class="builder-option-card">
                <div class="builder-option-card-head">
                  <strong>Saída ${index + 1}</strong>
                  <button class="builder-mini-btn builder-mini-btn-danger" type="button" data-option-action="remove" data-option-index="${index}">Remover</button>
                </div>
                <input value="${escapeHtml(option.label || '')}" data-option-field="label" data-option-index="${index}" />
              </article>
            `)
            .join('')}
        </div>
        <button class="builder-mini-btn" type="button" data-option-action="add">Adicionar opção</button>
      </div>
    `;
  } else if (node.type === 'condition') {
    content = `
      <div class="builder-field">
        <label for="inspectorConditionText">Texto para verificar</label>
        <input id="inspectorConditionText" data-node-field="match_text" value="${escapeHtml(node.match_text || '')}" />
        <small class="builder-field-hint">Se a mensagem contiver esse trecho, o fluxo segue pela saída “Sim”.</small>
      </div>
    `;
  } else if (node.type === 'wait') {
    content = `
      <div class="builder-field">
        <label for="inspectorWaitSeconds">Tempo de espera</label>
        <input id="inspectorWaitSeconds" type="number" min="1" max="86400" data-node-field="seconds" value="${escapeHtml(String(node.seconds || 1))}" />
        <small class="builder-field-hint">O fluxo fica parado por esse intervalo antes de continuar.</small>
      </div>
    `;
  } else if (node.type === 'tag') {
    content = `
      <div class="builder-field">
        <label for="inspectorTagName">Nome da tag</label>
        <input id="inspectorTagName" data-node-field="tag_name" value="${escapeHtml(node.tag_name || '')}" />
        <small class="builder-field-hint">A tag será adicionada na tabela de clientes quando este nó rodar.</small>
      </div>
    `;
  } else if (node.type === 'input') {
    content = `
      <div class="builder-field">
        <label for="inspectorInputPrompt">Pergunta enviada ao cliente</label>
        <textarea id="inspectorInputPrompt" data-node-field="prompt">${escapeHtml(node.prompt || '')}</textarea>
        <small class="builder-field-hint">Assim que este bloco rodar, o fluxo espera uma resposta livre do cliente.</small>
      </div>
      <div class="builder-field">
        <label for="inspectorInputVariable">Variável onde salvar</label>
        <input id="inspectorInputVariable" data-node-field="variable_key" value="${escapeHtml(node.variable_key || '')}" />
        <small class="builder-field-hint">Use letras minúsculas, números e underscore. Depois você pode usar {${escapeHtml(node.variable_key || 'variavel')}} nas mensagens.</small>
      </div>
    `;
  } else if (node.type === 'order_lookup') {
    content = `
      <div class="builder-field">
        <label for="inspectorOrderLookupScope">Qual pedido procurar</label>
        <select id="inspectorOrderLookupScope" data-node-field="lookup_scope">
          <option value="latest" ${node.lookup_scope !== 'active' ? 'selected' : ''}>Último pedido</option>
          <option value="active" ${node.lookup_scope === 'active' ? 'selected' : ''}>Pedido em andamento</option>
        </select>
      </div>
      <div class="builder-field">
        <label for="inspectorOrderPhoneSource">Telefone da busca</label>
        <select id="inspectorOrderPhoneSource" data-node-field="phone_source">
          <option value="current_phone" ${node.phone_source !== 'variable' ? 'selected' : ''}>Telefone da conversa atual</option>
          <option value="variable" ${node.phone_source === 'variable' ? 'selected' : ''}>Usar uma variável capturada</option>
        </select>
      </div>
      <div class="builder-field ${node.phone_source === 'variable' ? '' : 'hidden'}" data-conditional-field="phone_variable">
        <label for="inspectorOrderPhoneVariable">Variável do telefone</label>
        <input id="inspectorOrderPhoneVariable" data-node-field="phone_variable" value="${escapeHtml(node.phone_variable || '')}" />
        <small class="builder-field-hint">Ex.: lookup_phone. Esse valor costuma vir de um bloco “Capturar resposta”.</small>
      </div>
      <div class="builder-empty-state">
        Quando encontra um pedido, libera variáveis como {pedido_id}, {pedido_resumo}, {pedido_tracking_url} e {pedido_status_label}.
      </div>
    `;
  } else if (node.type === 'save_observation') {
    content = `
      <div class="builder-field">
        <label for="inspectorObservationVariable">Variável com a observação</label>
        <input id="inspectorObservationVariable" data-node-field="variable_key" value="${escapeHtml(node.variable_key || '')}" />
        <small class="builder-field-hint">Normalmente essa variável vem de um bloco “Capturar resposta”.</small>
      </div>
      <div class="builder-field">
        <label for="inspectorObservationPhoneSource">Telefone do pedido</label>
        <select id="inspectorObservationPhoneSource" data-node-field="phone_source">
          <option value="current_phone" ${node.phone_source !== 'variable' ? 'selected' : ''}>Telefone da conversa atual</option>
          <option value="variable" ${node.phone_source === 'variable' ? 'selected' : ''}>Usar uma variável capturada</option>
        </select>
      </div>
      <div class="builder-field ${node.phone_source === 'variable' ? '' : 'hidden'}" data-conditional-field="phone_variable">
        <label for="inspectorObservationPhoneVariable">Variável do telefone</label>
        <input id="inspectorObservationPhoneVariable" data-node-field="phone_variable" value="${escapeHtml(node.phone_variable || '')}" />
        <small class="builder-field-hint">Ex.: lookup_phone.</small>
      </div>
      <div class="builder-empty-state">
        Este bloco tenta registrar a observação no pedido em andamento. Se conseguir, você pode usar {pedido_observacoes} e {pedido_id} no próximo texto.
      </div>
    `;
  } else if (node.type === 'end') {
    content = `
      <div class="builder-empty-state">
        Este bloco não tem propriedades editáveis. Ele serve apenas para encerrar o fluxo atual.
      </div>
    `;
  }

  dom.inspectorEmpty.classList.add('hidden');
  dom.inspectorPanel.classList.remove('hidden');
  dom.inspectorPanel.innerHTML = `${head}${content}`;
}

function getCanvasPointFromEvent(event) {
  const rect = dom.viewport.getBoundingClientRect();
  return {
    x: event.clientX - rect.left + dom.viewport.scrollLeft,
    y: event.clientY - rect.top + dom.viewport.scrollTop,
  };
}

function hideMenus() {
  dom.contextMenu.classList.add('hidden');
  dom.addMenu.classList.add('hidden');
}

function openFloatingMenu(menu, x, y, innerHtml) {
  menu.innerHTML = innerHtml;
  menu.classList.remove('hidden');
  const maxX = window.innerWidth - 260;
  const maxY = window.innerHeight - 240;
  menu.style.left = `${Math.max(10, Math.min(x, maxX))}px`;
  menu.style.top = `${Math.max(10, Math.min(y, maxY))}px`;
}

function addNode(type, position = getViewportCenterPoint()) {
  const definition = NODE_DEFINITIONS[type];
  if (!definition) return;

  const nodeId = generateNodeId(type);
  const node = definition.create(nodeId);
  state.nodes.push(node);
  state.canvas[nodeId] = {
    x: Math.max(40, Math.round(position.x)),
    y: Math.max(40, Math.round(position.y)),
  };
  state.selectedNodeId = nodeId;
  markDirty(true, `${definition.label} adicionado ao canvas.`);
  renderCanvas();
}

function setNodeConnection(node, portKey, targetNodeId) {
  if (node.type === 'menu' && portKey.startsWith('option:')) {
    const optionIndex = Number(portKey.split(':')[1]);
    if (Number.isInteger(optionIndex) && node.options?.[optionIndex]) {
      node.options[optionIndex].next = targetNodeId;
    }
    return;
  }

  if (node.type === 'condition') {
    if (portKey === 'yes') node.yes = targetNodeId;
    if (portKey === 'no') node.no = targetNodeId;
    return;
  }

  if (node.type === 'order_lookup') {
    if (portKey === 'found') node.found = targetNodeId;
    if (portKey === 'missing') node.missing = targetNodeId;
    return;
  }

  if (node.type === 'save_observation') {
    if (portKey === 'saved') node.saved = targetNodeId;
    if (portKey === 'missing') node.missing = targetNodeId;
    return;
  }

  if (SINGLE_NEXT_NODE_TYPES.has(node.type)) {
    node.next = targetNodeId;
  }
}

function clearReferencesToNode(targetNodeId) {
  state.nodes.forEach((node) => {
    if (node.next === targetNodeId) node.next = null;
    if (node.yes === targetNodeId) node.yes = null;
    if (node.no === targetNodeId) node.no = null;
    if (node.found === targetNodeId) node.found = null;
    if (node.saved === targetNodeId) node.saved = null;
    if (node.missing === targetNodeId) node.missing = null;
    if (Array.isArray(node.options)) {
      node.options.forEach((option) => {
        if (option.next === targetNodeId) option.next = null;
      });
    }
  });
}

function connectNodes(fromNodeId, portKey, toNodeId) {
  if (fromNodeId === toNodeId) {
    showToast(dom.toast, 'Conexões para o próprio bloco não são permitidas.', 'err');
    return;
  }

  const sourceNode = getNodeById(fromNodeId);
  if (!sourceNode) return;

  setNodeConnection(sourceNode, portKey, toNodeId);
  markDirty(true, 'Conexão atualizada no fluxo.');
  renderConnections();
  renderCanvas();
}

function removeNode(nodeId) {
  const node = getNodeById(nodeId);
  if (!node || node.type === 'trigger') {
    showToast(dom.toast, 'O Trigger principal não pode ser removido.', 'err');
    return;
  }

  state.nodes = state.nodes.filter((item) => item.id !== nodeId);
  delete state.canvas[nodeId];
  clearReferencesToNode(nodeId);
  if (state.selectedNodeId === nodeId) {
    state.selectedNodeId = null;
  }
  markDirty(true, 'Bloco removido do fluxo.');
  renderCanvas();
}

function duplicateNode(nodeId) {
  const node = getNodeById(nodeId);
  if (!node || node.type === 'trigger') {
    showToast(dom.toast, 'Esse bloco não pode ser duplicado.', 'err');
    return;
  }

  const clone = deepClone(node);
  clone.id = generateNodeId(node.type);
  if (clone.next !== undefined) clone.next = null;
  if (clone.yes !== undefined) clone.yes = null;
  if (clone.no !== undefined) clone.no = null;
  if (clone.found !== undefined) clone.found = null;
  if (clone.saved !== undefined) clone.saved = null;
  if (clone.missing !== undefined) clone.missing = null;
  if (Array.isArray(clone.options)) {
    clone.options = clone.options.map((option) => ({ ...option, next: null }));
  }

  state.nodes.push(clone);
  const sourcePosition = ensureNodePosition(nodeId);
  state.canvas[clone.id] = {
    x: sourcePosition.x + 48,
    y: sourcePosition.y + 48,
  };
  state.selectedNodeId = clone.id;
  markDirty(true, 'Bloco duplicado com as conexões limpas.');
  renderCanvas();
}

function autoLayout() {
  const triggerNode = getTriggerNode();
  if (!triggerNode) return;

  const adjacency = new Map(
    state.nodes.map((node) => [
      node.id,
      getNodePorts(node)
        .map((port) => port.target)
        .filter(Boolean),
    ]),
  );
  const levels = new Map([[triggerNode.id, 0]]);
  const visitOrder = new Map([[triggerNode.id, 0]]);
  const visited = new Set([triggerNode.id]);
  const queue = [triggerNode.id];
  let orderCursor = 1;

  while (queue.length) {
    const currentId = queue.shift();
    const currentLevel = levels.get(currentId) || 0;
    const targets = adjacency.get(currentId) || [];

    targets.forEach((targetId) => {
      if (!levels.has(targetId)) {
        levels.set(targetId, currentLevel + 1);
      }

      if (!visited.has(targetId)) {
        visited.add(targetId);
        visitOrder.set(targetId, orderCursor);
        orderCursor += 1;
        queue.push(targetId);
      }
    });
  }

  let fallbackLevel = Math.max(0, ...levels.values()) + 1;
  state.nodes.forEach((node) => {
    if (!levels.has(node.id)) {
      levels.set(node.id, fallbackLevel);
      fallbackLevel += 1;
    }
    if (!visitOrder.has(node.id)) {
      visitOrder.set(node.id, orderCursor);
      orderCursor += 1;
    }
  });

  const orderedNodes = [...state.nodes].sort((left, right) => {
    const levelDelta = (levels.get(left.id) || 0) - (levels.get(right.id) || 0);
    if (levelDelta !== 0) return levelDelta;
    return (visitOrder.get(left.id) || 0) - (visitOrder.get(right.id) || 0);
  });

  const buckets = new Map();
  orderedNodes.forEach((node) => {
    const level = levels.get(node.id) || 0;
    if (!buckets.has(level)) buckets.set(level, []);
    buckets.get(level).push(node.id);
  });

  [...buckets.entries()].forEach(([level, nodeIds]) => {
    nodeIds.forEach((nodeId, index) => {
      state.canvas[nodeId] = {
        x: 120 + level * 340,
        y: 120 + index * 240,
      };
    });
  });

  markDirty(true, 'Layout reorganizado automaticamente.');
  renderCanvas();
  window.requestAnimationFrame(() => centerViewport());
}

function centerViewport() {
  if (!state.nodes.length) return;

  const positions = state.nodes.map((node) => ensureNodePosition(node.id));
  const dimensions = state.nodes.map((node) => getNodeDimensions(node.id));
  const minX = Math.min(...positions.map((position) => position.x));
  const maxX = Math.max(...positions.map((position, index) => position.x + dimensions[index].width));
  const minY = Math.min(...positions.map((position) => position.y));
  const maxY = Math.max(...positions.map((position, index) => position.y + dimensions[index].height));

  const centerX = minX + (maxX - minX) / 2;
  const centerY = minY + (maxY - minY) / 2;

  dom.viewport.scrollTo({
    left: Math.max(0, centerX - dom.viewport.clientWidth / 2),
    top: Math.max(0, centerY - dom.viewport.clientHeight / 2),
    behavior: 'smooth',
  });
}

function applyFlowResponse(flow) {
  state.flow = flow;
  state.flowMeta = deepClone(flow.flow_json?.meta || {});
  state.nodes = deepClone(flow.flow_json?.nodes || []);
  state.canvas = deepClone(flow.canvas_json || {});
  state.selectedNodeId = getTriggerNode()?.id || null;
  state.isDirty = false;

  state.nodes.forEach((node, index) => ensureNodePosition(node.id, index));
  syncHeader();
  syncTemplateNotice();
  renderCanvas();
}

async function loadFlow() {
  if (!state.flowId) {
    setInlineStatus(dom.pageStatus, 'Fluxo inválido. Volte para a listagem e abra novamente.', 'err');
    return;
  }

  setInlineStatus(dom.pageStatus, 'Carregando dados do fluxo...', 'muted');
  const flow = await session.run((api) => api.fetchFlow(state.flowId));
  applyFlowResponse(flow);
  setInlineStatus(dom.pageStatus, 'Fluxo visual pronto para edição.', 'ok');
  window.requestAnimationFrame(() => centerViewport());
}

function buildPayload() {
  const name = String(state.flow?.name || '').trim();
  const triggerKeyword = String(state.flow?.trigger_keyword || '').trim();

  if (!name) {
    throw new Error('Informe um nome para o fluxo.');
  }

  if (!triggerKeyword) {
    throw new Error('Informe ao menos um gatilho para o fluxo.');
  }

  return {
    name,
    trigger_keyword: triggerKeyword,
    flow_json: {
      meta: state.flowMeta,
      nodes: state.nodes,
    },
    canvas_json: state.canvas,
  };
}

async function saveFlow() {
  try {
    const payload = buildPayload();
    dom.saveBtn.disabled = true;
    setInlineStatus(dom.pageStatus, 'Salvando rascunho do fluxo...', 'muted');
    const saved = await session.run((api) => api.saveFlow(state.flowId, payload));
    applyFlowResponse(saved);
    setInlineStatus(dom.pageStatus, 'Rascunho salvo com sucesso.', 'ok');
    showToast(dom.toast, 'Fluxo salvo com sucesso.', 'ok');
  } catch (error) {
    setInlineStatus(dom.pageStatus, error.message, 'err');
    showToast(dom.toast, error.message, 'err');
  } finally {
    dom.saveBtn.disabled = false;
  }
}

async function publishFlow() {
  const confirmed = window.confirm('Tem certeza? Fluxos publicados com os mesmos gatilhos ou aliases serão substituídos.');
  if (!confirmed) return;

  try {
    if (state.isDirty) {
      await saveFlow();
    }

    dom.publishBtn.disabled = true;
    setInlineStatus(dom.pageStatus, 'Publicando fluxo visual...', 'muted');
    const published = await session.run((api) => api.publishFlow(state.flowId));
    applyFlowResponse(published);
    setInlineStatus(dom.pageStatus, 'Fluxo publicado e pronto para o WhatsApp.', 'ok');
    showToast(dom.toast, 'Fluxo publicado com sucesso.', 'ok');
  } catch (error) {
    setInlineStatus(dom.pageStatus, error.message, 'err');
    showToast(dom.toast, error.message, 'err');
  } finally {
    dom.publishBtn.disabled = false;
  }
}

async function unpublishFlow() {
  try {
    dom.unpublishBtn.disabled = true;
    setInlineStatus(dom.pageStatus, 'Voltando o fluxo para rascunho...', 'muted');
    const updated = await session.run((api) => api.unpublishFlow(state.flowId));
    applyFlowResponse(updated);
    setInlineStatus(dom.pageStatus, 'Fluxo despublicado com sucesso.', 'ok');
    showToast(dom.toast, 'Fluxo voltou para rascunho.', 'ok');
  } catch (error) {
    setInlineStatus(dom.pageStatus, error.message, 'err');
    showToast(dom.toast, error.message, 'err');
  } finally {
    dom.unpublishBtn.disabled = false;
  }
}

function handleNodeFieldChange(field, value) {
  const node = getNodeById(state.selectedNodeId);
  if (!node) return;

  if (field === 'seconds') {
    node.seconds = Math.max(1, Math.min(86400, Number.parseInt(value, 10) || 1));
  } else if (field === 'phone_source') {
    node.phone_source = value === 'variable' ? 'variable' : 'current_phone';
    if (node.phone_source !== 'variable') {
      node.phone_variable = null;
    }
  } else if (field === 'lookup_scope') {
    node.lookup_scope = value === 'active' ? 'active' : 'latest';
  } else {
    node[field] = value;
  }

  markDirty(true);
  renderCanvas({ syncInspector: false });
}

function handleInspectorInput(event) {
  const nodeField = event.target.dataset.nodeField;
  if (nodeField) {
    handleNodeFieldChange(nodeField, event.target.value);
    return;
  }

  const flowField = event.target.dataset.flowField;
  if (flowField) {
    state.flow[flowField] = event.target.value;
    markDirty(true);
    renderCanvas({ syncInspector: false });
    return;
  }

  const optionField = event.target.dataset.optionField;
  if (optionField) {
    const node = getNodeById(state.selectedNodeId);
    const optionIndex = Number(event.target.dataset.optionIndex);
    if (!node || !Array.isArray(node.options) || !node.options[optionIndex]) return;

    node.options[optionIndex][optionField] = event.target.value;
    markDirty(true);
    renderCanvas({ syncInspector: false });
  }
}

function handleInspectorClick(event) {
  const inspectorAction = event.target.dataset.inspectorAction;
  if (inspectorAction === 'delete') {
    removeNode(state.selectedNodeId);
    return;
  }

  if (inspectorAction === 'duplicate') {
    duplicateNode(state.selectedNodeId);
    return;
  }

  const optionAction = event.target.dataset.optionAction;
  const node = getNodeById(state.selectedNodeId);
  if (!optionAction || !node || node.type !== 'menu') return;

  if (optionAction === 'add') {
    node.options.push({ label: `Nova opção ${node.options.length + 1}`, next: null });
    markDirty(true, 'Nova opção adicionada no menu.');
    renderCanvas();
    return;
  }

  if (optionAction === 'remove') {
    const optionIndex = Number(event.target.dataset.optionIndex);
    if (!Number.isInteger(optionIndex) || node.options.length <= 1) {
      showToast(dom.toast, 'O menu precisa ter pelo menos uma opção.', 'err');
      return;
    }

    node.options.splice(optionIndex, 1);
    markDirty(true, 'Opção removida do menu.');
    renderCanvas();
  }
}

function handleCanvasPointerDown(event) {
  const port = event.target.closest('.node-port-output');
  if (port) {
    const nodeElement = event.target.closest('.flow-node');
    if (!nodeElement) return;

    const start = getPortCenterOnCanvas(nodeElement.dataset.nodeId, port.dataset.portKey, 'output');
    state.pendingConnection = {
      fromNodeId: nodeElement.dataset.nodeId,
      portKey: port.dataset.portKey,
      startX: start.x,
      startY: start.y,
      currentX: start.x,
      currentY: start.y,
    };
    event.preventDefault();
    renderConnections();
    return;
  }

  const nodeElement = event.target.closest('.flow-node');
  if (!nodeElement || event.button !== 0) return;

  const nodeId = nodeElement.dataset.nodeId;
  state.selectedNodeId = nodeId;
  renderCanvas();

  const point = getCanvasPointFromEvent(event);
  const position = ensureNodePosition(nodeId);
  state.drag = {
    nodeId,
    offsetX: point.x - position.x,
    offsetY: point.y - position.y,
  };

  const freshNodeElement = dom.canvas.querySelector(`[data-node-id="${nodeId}"]`);
  freshNodeElement?.classList.add('dragging');
  hideMenus();
  event.preventDefault();
}

function handleViewportPointerMove(event) {
  if (state.drag) {
    const point = getCanvasPointFromEvent(event);
    const nextPosition = {
      x: Math.max(20, Math.round(point.x - state.drag.offsetX)),
      y: Math.max(20, Math.round(point.y - state.drag.offsetY)),
    };
    state.canvas[state.drag.nodeId] = nextPosition;
    const nodeElement = dom.canvas.querySelector(`[data-node-id="${state.drag.nodeId}"]`);
    if (nodeElement) {
      nodeElement.style.left = `${nextPosition.x}px`;
      nodeElement.style.top = `${nextPosition.y}px`;
    }
    renderConnections();
    return;
  }

  if (state.pendingConnection) {
    const point = getCanvasPointFromEvent(event);
    state.pendingConnection.currentX = point.x;
    state.pendingConnection.currentY = point.y;
    renderConnections();
  }
}

function handlePointerUp(event) {
  if (state.drag) {
    const draggedNodeId = state.drag.nodeId;
    const nodeElement = dom.canvas.querySelector(`[data-node-id="${draggedNodeId}"]`);
    nodeElement?.classList.remove('dragging');
    state.drag = null;
    markDirty(true, 'Posição do bloco atualizada no canvas.');
  }

  if (state.pendingConnection) {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const targetNode = target?.closest?.('.flow-node');
    if (targetNode) {
      connectNodes(state.pendingConnection.fromNodeId, state.pendingConnection.portKey, targetNode.dataset.nodeId);
    }

    state.pendingConnection = null;
    renderConnections();
  }
}

function handleCanvasClick(event) {
  if (event.target.closest('.node-port-output')) return;

  const nodeElement = event.target.closest('.flow-node');
  if (nodeElement) {
    state.selectedNodeId = nodeElement.dataset.nodeId;
    renderCanvas();
    return;
  }

  state.selectedNodeId = null;
  renderCanvas();
}

function handleCanvasContextMenu(event) {
  const nodeElement = event.target.closest('.flow-node');
  if (!nodeElement) return;

  event.preventDefault();
  state.contextNodeId = nodeElement.dataset.nodeId;
  state.selectedNodeId = state.contextNodeId;
  renderCanvas();

  const node = getNodeById(state.contextNodeId);
  const menuItems = [
    node?.type !== 'trigger'
      ? '<button class="builder-menu-btn" type="button" data-context-action="duplicate"><span>Duplicar bloco</span><small>Clona o conteúdo</small></button>'
      : '',
    node?.type !== 'trigger'
      ? '<button class="builder-menu-btn builder-menu-btn-danger" type="button" data-context-action="delete"><span>Excluir bloco</span><small>Remove e limpa as conexões</small></button>'
      : '',
  ]
    .filter(Boolean)
    .join('');

  if (!menuItems) return;
  openFloatingMenu(dom.contextMenu, event.clientX, event.clientY, menuItems);
}

function handleContextMenuClick(event) {
  const action = event.target.closest('[data-context-action]')?.dataset.contextAction;
  if (!action || !state.contextNodeId) return;

  if (action === 'duplicate') {
    duplicateNode(state.contextNodeId);
  }

  if (action === 'delete') {
    removeNode(state.contextNodeId);
  }

  hideMenus();
}

function handleCanvasDoubleClick(event) {
  if (event.target.closest('.flow-node')) return;

  const point = getCanvasPointFromEvent(event);
  const menuItems = ADDABLE_NODE_TYPES.map((type) => {
    const definition = NODE_DEFINITIONS[type];
    return `
      <button class="builder-menu-btn" type="button" data-add-type="${type}" data-add-x="${point.x}" data-add-y="${point.y}">
        <span>${escapeHtml(definition.label)}</span>
        <small>${escapeHtml(definition.description)}</small>
      </button>
    `;
  }).join('');

  openFloatingMenu(dom.addMenu, event.clientX, event.clientY, menuItems);
}

function handleAddMenuClick(event) {
  const button = event.target.closest('[data-add-type]');
  if (!button) return;

  addNode(button.dataset.addType, {
    x: Number(button.dataset.addX),
    y: Number(button.dataset.addY),
  });
  hideMenus();
}

function handleBlockListClick(event) {
  const block = event.target.closest('[data-block-type]');
  if (!block) return;

  addNode(block.dataset.blockType);
}

function handleBlockDragStart(event) {
  const block = event.target.closest('[data-block-type]');
  if (!block) return;

  event.dataTransfer?.setData('text/plain', block.dataset.blockType);
  event.dataTransfer.effectAllowed = 'copy';
}

function handleViewportDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

function handleViewportDrop(event) {
  event.preventDefault();
  const type = event.dataTransfer?.getData('text/plain');
  if (!ADDABLE_NODE_TYPES.includes(type)) return;

  const point = getCanvasPointFromEvent(event);
  addNode(type, point);
}

function handleTopLevelInput() {
  if (!state.flow) return;
  state.flow.name = dom.flowNameInput.value;
  state.flow.trigger_keyword = dom.flowTriggerInput.value;
  markDirty(true);
  renderCanvas({ syncInspector: false });
}

dom.saveBtn?.addEventListener('click', saveFlow);
dom.publishBtn?.addEventListener('click', publishFlow);
dom.unpublishBtn?.addEventListener('click', unpublishFlow);
dom.centerBtn?.addEventListener('click', centerViewport);
dom.autoLayoutBtn?.addEventListener('click', autoLayout);
dom.flowNameInput?.addEventListener('input', handleTopLevelInput);
dom.flowTriggerInput?.addEventListener('input', handleTopLevelInput);
dom.blockList?.addEventListener('click', handleBlockListClick);
dom.blockList?.addEventListener('dragstart', handleBlockDragStart);
dom.canvas?.addEventListener('pointerdown', handleCanvasPointerDown);
dom.canvas?.addEventListener('click', handleCanvasClick);
dom.canvas?.addEventListener('contextmenu', handleCanvasContextMenu);
dom.viewport?.addEventListener('pointermove', handleViewportPointerMove);
dom.viewport?.addEventListener('dblclick', handleCanvasDoubleClick);
dom.viewport?.addEventListener('dragover', handleViewportDragOver);
dom.viewport?.addEventListener('drop', handleViewportDrop);
dom.inspectorPanel?.addEventListener('input', handleInspectorInput);
dom.inspectorPanel?.addEventListener('click', handleInspectorClick);
dom.contextMenu?.addEventListener('click', handleContextMenuClick);
dom.addMenu?.addEventListener('click', handleAddMenuClick);
window.addEventListener('pointerup', handlePointerUp);
window.addEventListener('click', (event) => {
  if (!event.target.closest('.builder-context-menu') && !event.target.closest('.builder-add-menu')) {
    hideMenus();
  }
});

window.addEventListener('beforeunload', (event) => {
  if (!state.isDirty) return;
  event.preventDefault();
  event.returnValue = '';
});

(async function bootstrap() {
  try {
    renderToolbar();
    renderVariableGuide();
    await session.ensureSession();
    await loadFlow();
  } catch (error) {
    setInlineStatus(dom.pageStatus, error.message, 'err');
    showToast(dom.toast, error.message, 'err');
  }
}());
