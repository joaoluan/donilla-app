import { escapeHtml } from '../shared/utils.js?v=20260328b';
import {
  createFlowAdminSession,
  deepClone,
  parseFlowIdFromLocation,
  renderStatusBadge,
  setInlineStatus,
  showToast,
} from './flows-shared.js?v=20260330a';

const ADDABLE_NODE_TYPES = ['message', 'menu', 'condition', 'wait', 'tag', 'handoff', 'end'];
const SINGLE_NEXT_NODE_TYPES = new Set(['trigger', 'message', 'wait', 'tag']);
const LEGACY_TEMPLATE_KEY = 'legacy_whatsapp_bot';

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
  const isLegacyGuide = meta.template_key === LEGACY_TEMPLATE_KEY;

  dom.templateNotice.classList.toggle('hidden', !isLegacyGuide);
  if (!isLegacyGuide) {
    dom.templateNoticeText.textContent = '';
    return;
  }

  dom.templateNoticeTitle.textContent = meta.template_label || 'Fluxo legado guiado';
  dom.templateNoticeText.textContent = [
    meta.template_description || 'Mapa inicial baseado no bot legado atual do WhatsApp.',
    'Esse rascunho consolida o menu principal em um canvas visual, mas ainda precisa de adaptacao antes de substituir o atendimento antigo.',
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

  if (node.type === 'handoff') {
    return `<div class="flow-node-copy">${escapeHtml(summarize(node.content, 120))}</div>`;
  }

  if (node.type === 'end') {
    return '<div class="flow-node-copy">Finaliza o fluxo, limpa a sessão e libera a conversa.</div>';
  }

  if (node.type === 'trigger') {
    return `<div class="flow-node-copy">Escuta o gatilho principal deste fluxo: <strong>${escapeHtml(state.flow?.trigger_keyword || '--')}</strong>.</div>`;
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

function getElementCenterRelative(element) {
  const rect = element.getBoundingClientRect();
  const canvasRect = dom.canvas.getBoundingClientRect();
  return {
    x: rect.left - canvasRect.left + rect.width / 2,
    y: rect.top - canvasRect.top + rect.height / 2,
  };
}

function buildPath(start, end) {
  const distance = Math.max(48, Math.abs(end.y - start.y) * 0.4);
  return `M ${start.x} ${start.y} C ${start.x} ${start.y + distance}, ${end.x} ${end.y - distance}, ${end.x} ${end.y}`;
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
  const width = Math.max(dom.canvas.scrollWidth, dom.canvas.clientWidth, 1280);
  const height = Math.max(dom.canvas.scrollHeight, dom.canvas.clientHeight, 900);
  dom.connections.setAttribute('viewBox', `0 0 ${width} ${height}`);
  dom.connections.setAttribute('width', String(width));
  dom.connections.setAttribute('height', String(height));

  const defs = `
    <defs>
      <marker id="flowArrowHead" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill="#7f6542"></path>
      </marker>
    </defs>
  `;

  const lineMarkup = collectConnections()
    .map((connection) => {
      const source = dom.canvas.querySelector(`[data-node-id="${connection.fromNodeId}"] [data-port-key="${connection.portKey}"]`);
      const target = dom.canvas.querySelector(`[data-node-id="${connection.toNodeId}"] .node-port-input`);
      if (!source || !target) return '';

      const start = getElementCenterRelative(source);
      const end = getElementCenterRelative(target);
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
        <label for="inspectorTriggerKeyword">Palavra-chave gatilho</label>
        <input id="inspectorTriggerKeyword" data-flow-field="trigger_keyword" value="${escapeHtml(state.flow?.trigger_keyword || '')}" />
        <small class="builder-field-hint">Quando a mensagem começar com esse texto, este fluxo entra em ação.</small>
      </div>
    `;
  } else if (node.type === 'message' || node.type === 'handoff') {
    content = `
      <div class="builder-field">
        <label for="inspectorNodeContent">Texto da mensagem</label>
        <textarea id="inspectorNodeContent" data-node-field="content">${escapeHtml(node.content || '')}</textarea>
        <small class="builder-field-hint">Quebras de linha são respeitadas e aparecem no WhatsApp.</small>
      </div>
    `;
  } else if (node.type === 'menu') {
    content = `
      <div class="builder-field">
        <label for="inspectorMenuContent">Pergunta do menu</label>
        <textarea id="inspectorMenuContent" data-node-field="content">${escapeHtml(node.content || '')}</textarea>
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
  const rect = dom.canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
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

  if (SINGLE_NEXT_NODE_TYPES.has(node.type)) {
    node.next = targetNodeId;
  }
}

function clearReferencesToNode(targetNodeId) {
  state.nodes.forEach((node) => {
    if (node.next === targetNodeId) node.next = null;
    if (node.yes === targetNodeId) node.yes = null;
    if (node.no === targetNodeId) node.no = null;
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

  const levels = new Map([[triggerNode.id, 0]]);
  const queue = [triggerNode.id];

  while (queue.length) {
    const currentId = queue.shift();
    const currentNode = getNodeById(currentId);
    const currentLevel = levels.get(currentId) || 0;
    if (!currentNode) continue;

    getNodePorts(currentNode)
      .map((port) => port.target)
      .filter(Boolean)
      .forEach((targetId) => {
        const nextLevel = currentLevel + 1;
        if (!levels.has(targetId) || (levels.get(targetId) || 0) < nextLevel) {
          levels.set(targetId, nextLevel);
          queue.push(targetId);
        }
      });
  }

  let fallbackLevel = Math.max(...levels.values(), 0) + 1;
  state.nodes.forEach((node) => {
    if (!levels.has(node.id)) {
      levels.set(node.id, fallbackLevel);
      fallbackLevel += 1;
    }
  });

  const buckets = new Map();
  state.nodes.forEach((node) => {
    const level = levels.get(node.id) || 0;
    if (!buckets.has(level)) buckets.set(level, []);
    buckets.get(level).push(node.id);
  });

  [...buckets.entries()].forEach(([level, nodeIds]) => {
    nodeIds.forEach((nodeId, index) => {
      state.canvas[nodeId] = {
        x: 120 + level * 320,
        y: 120 + index * 210,
      };
    });
  });

  markDirty(true, 'Layout reorganizado automaticamente.');
  renderCanvas();
  centerViewport();
}

function centerViewport() {
  if (!state.nodes.length) return;

  const positions = state.nodes.map((node) => ensureNodePosition(node.id));
  const minX = Math.min(...positions.map((position) => position.x));
  const maxX = Math.max(...positions.map((position) => position.x));
  const minY = Math.min(...positions.map((position) => position.y));
  const maxY = Math.max(...positions.map((position) => position.y));

  const centerX = minX + (maxX - minX) / 2;
  const centerY = minY + (maxY - minY) / 2;

  dom.viewport.scrollTo({
    left: Math.max(0, centerX - dom.viewport.clientWidth / 2 + 132),
    top: Math.max(0, centerY - dom.viewport.clientHeight / 2 + 62),
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
    throw new Error('Informe um gatilho para o fluxo.');
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
  const confirmed = window.confirm('Tem certeza? O fluxo publicado para este gatilho será substituído.');
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

    const start = getElementCenterRelative(port);
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
    await session.ensureSession();
    await loadFlow();
  } catch (error) {
    setInlineStatus(dom.pageStatus, error.message, 'err');
    showToast(dom.toast, error.message, 'err');
  }
}());
