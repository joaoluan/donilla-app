import { escapeHtml } from "../shared/utils.js?v=20260328b";
import {
  createFlowAdminSession,
  deepClone,
  parseFlowIdFromLocation,
  renderStatusBadge,
  setInlineStatus,
  showToast,
} from "./flows-shared.js?v=20260330a";

const ADDABLE_NODE_TYPES = [
  "message",
  "menu",
  "input",
  "order_lookup",
  "save_observation",
  "condition",
  "wait",
  "tag",
  "handoff",
  "end",
];
const SINGLE_NEXT_NODE_TYPES = new Set([
  "trigger",
  "message",
  "input",
  "wait",
  "tag",
]);
const LEGACY_TEMPLATE_KEY = "legacy_whatsapp_bot";
const COMMERCIAL_STARTER_TEMPLATE_KEY = "commercial_whatsapp_starter";
const DEFAULT_NODE_WIDTH = 228;
const DEFAULT_NODE_HEIGHT = 96;
const MIN_CANVAS_WIDTH = 1280;
const MIN_CANVAS_HEIGHT = 900;
const CANVAS_PADDING_X = 220;
const CANVAS_PADDING_Y = 220;
const FLOW_VARIABLES = Object.freeze([
  { key: "cliente_nome", description: "Nome recebido do contato atual." },
  { key: "cliente_primeiro_nome", description: "Primeiro nome do contato." },
  { key: "cliente_telefone", description: "Telefone atual da conversa." },
  {
    key: "mensagem_recebida",
    description: "Ultima mensagem enviada pelo cliente.",
  },
  { key: "fluxo_nome", description: "Nome do fluxo atual." },
  { key: "gatilho_fluxo", description: "Gatilho principal do fluxo." },
  { key: "loja_link", description: "Link publico da loja quando configurado." },
  {
    key: "pedido_resumo",
    description: "Resumo do pedido encontrado pelo bloco de busca.",
  },
  { key: "pedido_id", description: "Numero do pedido encontrado." },
  {
    key: "pedido_status_label",
    description: "Status do pedido em texto humano.",
  },
  {
    key: "pedido_pagamento_label",
    description: "Status do pagamento em texto humano.",
  },
  { key: "pedido_total", description: "Valor total formatado em BRL." },
  {
    key: "pedido_tracking_url",
    description: "Link publico de rastreio do pedido.",
  },
  { key: "pedido_observacoes", description: "Observacoes atuais do pedido." },
  {
    key: "pedido_telefone_consulta",
    description: "Telefone usado na ultima busca de pedido.",
  },
  {
    key: "menu_opcao_escolhida",
    description: "Numero escolhido no ultimo menu.",
  },
  { key: "menu_opcao_rotulo", description: "Rotulo escolhido no ultimo menu." },
  {
    key: "interesse_cliente",
    description:
      "Exemplo de variavel capturada para saber o que o cliente procura.",
  },
  {
    key: "bairro_cliente",
    description:
      "Exemplo de variavel capturada para entrega ou atendimento local.",
  },
  {
    key: "lookup_phone",
    description:
      "Telefone informado pelo cliente para buscar pedido em outro WhatsApp.",
  },
  {
    key: "observacao_cliente",
    description: "Texto livre capturado para registrar observacoes no pedido.",
  },
]);

const NODE_DEFINITIONS = Object.freeze({
  trigger: {
    label: "Trigger",
    description: "Entrada do fluxo pelo gatilho principal.",
    className: "builder-block-trigger",
    create(id) {
      return { id, type: "trigger", next: null };
    },
  },
  message: {
    label: "Mensagem",
    description: "Envia um texto simples para o cliente.",
    className: "builder-block-message",
    create(id) {
      return {
        id,
        type: "message",
        content: "Olá! Como posso te ajudar hoje?",
        next: null,
      };
    },
  },
  menu: {
    label: "Menu",
    description: "Mostra opções numeradas e espera a resposta.",
    className: "builder-block-menu",
    create(id) {
      return {
        id,
        type: "menu",
        content: "Escolha uma opção:",
        options: [
          { label: "Primeira opção", next: null },
          { label: "Segunda opção", next: null },
        ],
      };
    },
  },
  condition: {
    label: "Condição",
    description: "Verifica se a mensagem contém um texto específico.",
    className: "builder-block-condition",
    create(id) {
      return {
        id,
        type: "condition",
        match_text: "cardápio",
        yes: null,
        no: null,
      };
    },
  },
  wait: {
    label: "Aguardar",
    description: "Espera alguns segundos antes de seguir.",
    className: "builder-block-wait",
    create(id) {
      return {
        id,
        type: "wait",
        seconds: 5,
        next: null,
      };
    },
  },
  tag: {
    label: "Tag",
    description: "Adiciona uma tag ao cliente atual.",
    className: "builder-block-tag",
    create(id) {
      return {
        id,
        type: "tag",
        tag_name: "lead_qualificado",
        next: null,
      };
    },
  },
  input: {
    label: "Capturar resposta",
    description: "Pergunta algo, espera texto livre e salva em uma variavel.",
    className: "builder-block-input",
    create(id) {
      return {
        id,
        type: "input",
        prompt: "Me conte com suas palavras o que voce precisa.",
        variable_key: "resposta_cliente",
        next: null,
      };
    },
  },
  order_lookup: {
    label: "Buscar pedido",
    description:
      "Procura o ultimo pedido do cliente e abre caminhos de encontrado ou nao.",
    className: "builder-block-order",
    create(id) {
      return {
        id,
        type: "order_lookup",
        lookup_scope: "latest",
        phone_source: "current_phone",
        phone_variable: null,
        found: null,
        missing: null,
      };
    },
  },
  save_observation: {
    label: "Salvar observacao",
    description:
      "Pega uma variavel capturada e registra no pedido em andamento.",
    className: "builder-block-observation",
    create(id) {
      return {
        id,
        type: "save_observation",
        variable_key: "observacao_cliente",
        phone_source: "current_phone",
        phone_variable: null,
        saved: null,
        missing: null,
      };
    },
  },
  handoff: {
    label: "Handoff",
    description: "Pausa o bot e passa para atendimento humano.",
    className: "builder-block-handoff",
    create(id) {
      return {
        id,
        type: "handoff",
        content:
          "Vou transferir você para a nossa equipe. Aguarde só um instante.",
      };
    },
  },
  end: {
    label: "Fim",
    description: "Encerra o fluxo e limpa a sessão atual.",
    className: "builder-block-end",
    create(id) {
      return {
        id,
        type: "end",
      };
    },
  },
});

const NODE_GLYPHS = Object.freeze({
  trigger: ">",
  message: "\u2709",
  menu: "\u2630",
  condition: "\u25c6",
  wait: "\u23f3",
  tag: "#",
  input: "?",
  order_lookup: "\u2315",
  save_observation: "\u270e",
  handoff: "\u21c4",
  end: "\u25a0",
});

const NODE_VISUALS = Object.freeze({
  trigger: {
    color: "#22c55e",
    background: "rgba(5, 46, 22, 0.96)",
    border: "#16a34a",
    soft: "rgba(34, 197, 94, 0.16)",
  },
  message: {
    color: "#3b82f6",
    background: "rgba(10, 22, 40, 0.96)",
    border: "#2563eb",
    soft: "rgba(59, 130, 246, 0.16)",
  },
  menu: {
    color: "#f59e0b",
    background: "rgba(28, 17, 0, 0.96)",
    border: "#d97706",
    soft: "rgba(245, 158, 11, 0.16)",
  },
  condition: {
    color: "#a855f7",
    background: "rgba(25, 12, 40, 0.96)",
    border: "#9333ea",
    soft: "rgba(168, 85, 247, 0.16)",
  },
  wait: {
    color: "#fb923c",
    background: "rgba(37, 22, 10, 0.96)",
    border: "#ea580c",
    soft: "rgba(251, 146, 60, 0.16)",
  },
  tag: {
    color: "#10b981",
    background: "rgba(7, 35, 27, 0.96)",
    border: "#059669",
    soft: "rgba(16, 185, 129, 0.16)",
  },
  input: {
    color: "#38bdf8",
    background: "rgba(8, 31, 46, 0.96)",
    border: "#0284c7",
    soft: "rgba(56, 189, 248, 0.16)",
  },
  order_lookup: {
    color: "#c084fc",
    background: "rgba(23, 13, 36, 0.96)",
    border: "#a855f7",
    soft: "rgba(192, 132, 252, 0.16)",
  },
  save_observation: {
    color: "#f472b6",
    background: "rgba(43, 14, 29, 0.96)",
    border: "#db2777",
    soft: "rgba(244, 114, 182, 0.16)",
  },
  handoff: {
    color: "#ef4444",
    background: "rgba(42, 15, 16, 0.96)",
    border: "#dc2626",
    soft: "rgba(239, 68, 68, 0.16)",
  },
  end: {
    color: "#94a3b8",
    background: "rgba(15, 23, 42, 0.96)",
    border: "#64748b",
    soft: "rgba(148, 163, 184, 0.16)",
  },
});

const state = {
  flowId: parseFlowIdFromLocation(),
  flow: null,
  flowMeta: {},
  nodes: [],
  canvas: {},
  selectedNodeId: null,
  selectedConnection: null,
  isDirty: false,
  drag: null,
  pan: null,
  pendingConnection: null,
  contextNodeId: null,
};

const session = createFlowAdminSession();

const dom = {
  flowTitle: document.getElementById("builderFlowTitle"),
  flowNameInput: document.getElementById("builderFlowName"),
  flowTriggerInput: document.getElementById("builderFlowTrigger"),
  flowStatus: document.getElementById("builderFlowStatus"),
  pageStatus: document.getElementById("builderPageStatus"),
  templateNotice: document.getElementById("builderTemplateNotice"),
  templateNoticeTitle: document.getElementById("builderTemplateNoticeTitle"),
  templateNoticeText: document.getElementById("builderTemplateNoticeText"),
  saveBtn: document.getElementById("builderSaveBtn"),
  publishBtn: document.getElementById("builderPublishBtn"),
  unpublishBtn: document.getElementById("builderUnpublishBtn"),
  quickAddBtn: document.getElementById("builderQuickAddBtn"),
  centerBtn: document.getElementById("builderCenterBtn"),
  autoLayoutBtn: document.getElementById("builderAutoLayoutBtn"),
  blockList: document.getElementById("builderBlockList"),
  variableList: document.getElementById("builderVariableList"),
  viewport: document.getElementById("builderViewport"),
  canvas: document.getElementById("builderCanvas"),
  connections: document.getElementById("builderConnections"),
  canvasState: document.getElementById("builderCanvasState"),
  canvasEmpty: document.getElementById("builderCanvasEmpty"),
  inspectorEmpty: document.getElementById("builderInspectorEmpty"),
  inspectorPanel: document.getElementById("builderInspectorPanel"),
  contextMenu: document.getElementById("builderContextMenu"),
  addMenu: document.getElementById("builderAddMenu"),
  toast: document.getElementById("builderToast"),
};

function getNodeById(nodeId) {
  return state.nodes.find((node) => node.id === nodeId) || null;
}

function getTriggerNode() {
  return state.nodes.find((node) => node.type === "trigger") || null;
}

function summarize(value, max = 100) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "Sem conteúdo configurado ainda.";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function countNodeOutputs(node) {
  return getNodePorts(node).filter((port) => port.target).length;
}

function getNodeGlyph(type) {
  return NODE_GLYPHS[type] || "BL";
}

function getNodeVisual(type) {
  return NODE_VISUALS[type] || NODE_VISUALS.message;
}

function getNodeDisplayTitle(node) {
  if (node.type === "trigger") return "Início do fluxo";
  if (node.type === "menu")
    return summarize(node.content || "Menu de opções", 30);
  if (node.type === "condition")
    return `Se tiver "${summarize(node.match_text || "--", 14)}"`;
  if (node.type === "wait")
    return `${Math.max(1, Number(node.seconds) || 1)}s de espera`;
  if (node.type === "tag")
    return `Tag ${summarize(node.tag_name || "tag", 18)}`;
  if (node.type === "input")
    return summarize(node.prompt || "Capturar resposta", 30);
  if (node.type === "order_lookup")
    return node.lookup_scope === "active"
      ? "Buscar pedido ativo"
      : "Buscar último pedido";
  if (node.type === "save_observation") return "Salvar observação";
  if (node.type === "handoff")
    return summarize(node.content || "Transferir para humano", 30);
  if (node.type === "end") return "Fim do fluxo";
  return summarize(
    node.content || NODE_DEFINITIONS[node.type]?.label || "Bloco",
    34,
  );
}

function getNodePreviewText(node) {
  if (node.type === "menu") {
    const optionCount = Array.isArray(node.options) ? node.options.length : 0;
    return `${summarize(node.content, 84)} ${optionCount ? `Menu com ${optionCount} opção(ões).` : "Sem opções configuradas."}`;
  }

  if (node.type === "condition") {
    return `Segue pela saída "Sim" quando a mensagem contém ${node.match_text ? `"${summarize(node.match_text, 28)}"` : "o texto configurado"}.`;
  }

  if (node.type === "wait") {
    return "Segura a conversa por alguns segundos antes de liberar o próximo passo.";
  }

  if (node.type === "tag") {
    return "Acrescenta uma tag no contato atual para facilitar segmentações e handoff.";
  }

  if (node.type === "input") {
    return `Pergunta em texto livre e salva em {${node.variable_key || "variavel"}}.`;
  }

  if (node.type === "order_lookup") {
    const phoneLabel =
      node.phone_source === "variable"
        ? `usa {${node.phone_variable || "telefone"}}`
        : "usa o telefone da conversa";
    return `${node.lookup_scope === "active" ? "Busca o pedido em andamento" : "Busca o último pedido"} e ${phoneLabel}.`;
  }

  if (node.type === "save_observation") {
    return `Grava {${node.variable_key || "observacao"}} no pedido localizado durante o fluxo.`;
  }

  if (node.type === "handoff") {
    return summarize(node.content, 92);
  }

  if (node.type === "end") {
    return "Limpa a sessão atual, encerra o fluxo e deixa a conversa livre.";
  }

  if (node.type === "trigger") {
    return `Escuta os gatilhos: ${summarize(state.flow?.trigger_keyword || "--", 82)}.`;
  }

  return summarize(node.content, 92);
}

function getNodeCompactSummary(node) {
  if (node.type === "trigger") {
    return `Escuta: ${summarize(state.flow?.trigger_keyword || "--", 36)}`;
  }

  if (node.type === "menu") {
    return `${(node.options || []).length || 0} saída(s) numerada(s)`;
  }

  if (node.type === "condition") {
    return "Ramifica entre Sim e Não";
  }

  if (node.type === "wait") {
    return "Pausa antes do próximo bloco";
  }

  if (node.type === "tag") {
    return summarize(node.tag_name || "Tag no contato", 34);
  }

  if (node.type === "input") {
    return `Salva em {${summarize(node.variable_key || "variavel", 18)}}`;
  }

  if (node.type === "order_lookup") {
    return node.lookup_scope === "active"
      ? "Procura pedido em andamento"
      : "Procura último pedido";
  }

  if (node.type === "save_observation") {
    return `Usa {${summarize(node.variable_key || "observacao", 18)}}`;
  }

  if (node.type === "end") {
    return "Encerra a sessão atual";
  }

  return summarize(getNodePreviewText(node), 42);
}

function getConnectionLabel(node, portKey) {
  const port = getNodePorts(node).find((entry) => entry.key === portKey);
  if (!port) return "";
  if (port.label === "Próximo") return "";
  return port.label;
}

function generateNodeId(type) {
  return `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function getViewportCenterPoint() {
  return {
    x:
      dom.viewport.scrollLeft +
      dom.viewport.clientWidth / 2 -
      DEFAULT_NODE_WIDTH / 2,
    y:
      dom.viewport.scrollTop +
      dom.viewport.clientHeight / 2 -
      DEFAULT_NODE_HEIGHT / 2,
  };
}

function isConnectionSelected(connection) {
  if (!state.selectedConnection) return false;
  return (
    state.selectedConnection.fromNodeId === connection.fromNodeId &&
    state.selectedConnection.portKey === connection.portKey &&
    state.selectedConnection.toNodeId === connection.toNodeId
  );
}

function ensureNodePosition(nodeId, fallbackIndex = 0) {
  if (state.canvas[nodeId]) return state.canvas[nodeId];

  state.canvas[nodeId] = {
    x: 120 + (fallbackIndex % 3) * 300,
    y: 110 + Math.floor(fallbackIndex / 3) * 220,
  };
  return state.canvas[nodeId];
}

function markDirty(
  nextDirty = true,
  message = "Alterações pendentes. Salve quando finalizar este trecho do fluxo.",
) {
  state.isDirty = nextDirty;
  syncHeader();
  if (nextDirty) {
    setInlineStatus(dom.pageStatus, message, "muted");
  }
}

function syncHeader() {
  const name =
    String(state.flow?.name || "Fluxo sem nome").trim() || "Fluxo sem nome";
  dom.flowTitle.textContent = state.isDirty ? `${name} *` : name;
  dom.flowNameInput.value = state.flow?.name || "";
  dom.flowTriggerInput.value = state.flow?.trigger_keyword || "";
  dom.flowStatus.innerHTML = renderStatusBadge(state.flow?.status || "draft");
  dom.unpublishBtn.classList.toggle(
    "hidden",
    state.flow?.status !== "published",
  );
  dom.publishBtn.textContent =
    state.flow?.status === "published"
      ? "Publicar novamente"
      : "Publicar fluxo";
}

function syncTemplateNotice() {
  const meta = state.flowMeta || {};
  const templateKey = String(meta.template_key || "").trim();
  const hasTemplateGuide = Boolean(templateKey);
  const extraNoticeByTemplate = {
    [LEGACY_TEMPLATE_KEY]:
      "Esse rascunho consolida o menu principal em um canvas visual, mas ainda precisa de adaptacao antes de substituir o atendimento antigo.",
    [COMMERCIAL_STARTER_TEMPLATE_KEY]:
      "Esse rascunho ja vem com acolhimento comercial, captura de interesse, recuperacao de pedido e handoff. Edite os textos com o jeito da sua loja antes de publicar.",
  };

  dom.templateNotice.classList.toggle("hidden", !hasTemplateGuide);
  if (!hasTemplateGuide) {
    dom.templateNoticeTitle.textContent = "Fluxo inicial";
    dom.templateNoticeText.textContent = "";
    return;
  }

  dom.templateNoticeTitle.textContent =
    meta.template_label || "Fluxo inicial pronto";
  dom.templateNoticeText.textContent = [
    meta.template_description || "Rascunho inicial pronto para personalizacao.",
    extraNoticeByTemplate[templateKey] ||
      "Revise as conexoes, ajuste o texto e publique quando estiver seguro.",
  ].join(" ");
}

function renderToolbar() {
  dom.blockList.innerHTML = ADDABLE_NODE_TYPES.map((type) => {
    const definition = NODE_DEFINITIONS[type];
    const visual = getNodeVisual(type);
    return `
        <button class="builder-block ${definition.className}" type="button" draggable="true" data-block-type="${type}">
          <span class="builder-block-icon" style="--builder-block-color:${visual.color}; --builder-block-soft:${visual.soft};">${escapeHtml(getNodeGlyph(type))}</span>
          <span class="builder-block-copy">
            <strong>${escapeHtml(definition.label)}</strong>
            <small>${escapeHtml(definition.description)}</small>
          </span>
        </button>
      `;
  }).join("");
}

function renderVariableGuide() {
  if (!dom.variableList) return;

  dom.variableList.innerHTML = FLOW_VARIABLES.map(
    (item) => `
      <article class="builder-variable-card">
        <code>{${escapeHtml(item.key)}}</code>
        <small>${escapeHtml(item.description)}</small>
      </article>
    `,
  ).join("");
}

function getNodePorts(node) {
  if (node.type === "menu") {
    return (node.options || []).map((option, index) => ({
      key: `option:${index}`,
      label: `${index + 1}`,
      target: option?.next || null,
    }));
  }

  if (node.type === "condition") {
    return [
      { key: "yes", label: "Sim", target: node.yes || null },
      { key: "no", label: "Não", target: node.no || null },
    ];
  }

  if (node.type === "order_lookup") {
    return [
      { key: "found", label: "Encontrado", target: node.found || null },
      { key: "missing", label: "Nao", target: node.missing || null },
    ];
  }

  if (node.type === "save_observation") {
    return [
      { key: "saved", label: "Salvo", target: node.saved || null },
      { key: "missing", label: "Sem pedido", target: node.missing || null },
    ];
  }

  if (SINGLE_NEXT_NODE_TYPES.has(node.type)) {
    return [{ key: "next", label: "Próximo", target: node.next || null }];
  }

  return [];
}

function buildNodeMarkup(node, index) {
  const definition = NODE_DEFINITIONS[node.type];
  const position = ensureNodePosition(node.id, index);
  const visual = getNodeVisual(node.type);
  const ports = getNodePorts(node);
  const verticalStops =
    ports.length === 1
      ? [50]
      : ports.length === 2
        ? [34, 66]
        : ports.length === 3
          ? [22, 50, 78]
          : ports.map(
              (_, portIndex) =>
                14 + (72 / Math.max(1, ports.length - 1)) * portIndex,
            );
  const filledOutputs = countNodeOutputs(node);
  const connectionPill = ports.length
    ? `${filledOutputs}/${ports.length} saída${ports.length > 1 ? "s" : ""}`
    : "Sem saída";

  return `
    <article
      class="flow-node ${state.selectedNodeId === node.id ? "selected" : ""} ${state.pendingConnection?.fromNodeId === node.id ? "is-connecting" : ""}"
      data-node-id="${escapeHtml(node.id)}"
      data-type="${escapeHtml(node.type)}"
      style="left:${position.x}px; top:${position.y}px; --node-color:${visual.color}; --node-border:${visual.border}; --node-bg:${visual.background}; --node-soft:${visual.soft};"
      title="${escapeHtml(node.id)}"
    >
      <span class="node-port node-port-input" aria-hidden="true"></span>
      <div class="flow-node-head">
        <span class="flow-node-glyph">${escapeHtml(getNodeGlyph(node.type))}</span>
        <div class="flow-node-head-copy">
          <span class="flow-node-type">${escapeHtml(definition.label)}</span>
          <div class="flow-node-title">${escapeHtml(getNodeDisplayTitle(node))}</div>
        </div>
      </div>
      <div class="flow-node-copy">${escapeHtml(getNodeCompactSummary(node))}</div>
      <div class="flow-node-footer">
        <span class="flow-node-footer-pill">${escapeHtml(connectionPill)}</span>
        <span>Editar na lateral</span>
      </div>
      ${ports
        .map(
          (port, portIndex) => `
          <span class="node-port node-port-output" data-port-key="${escapeHtml(port.key)}" style="top: calc(${verticalStops[portIndex]}% - 9px);">
            ${port.label && port.label !== "Próximo" ? `<span class="node-port-label">${escapeHtml(port.label)}</span>` : ""}
          </span>
        `,
        )
        .join("")}
    </article>
  `;
}

function renderCanvas(options = {}) {
  const { syncInspector = true } = options;
  dom.canvas.innerHTML = state.nodes
    .map((node, index) => buildNodeMarkup(node, index))
    .join("");
  window.requestAnimationFrame(() => {
    renderCanvasChrome();
    renderConnections();
    if (syncInspector) {
      renderInspector();
    }
  });
}

function renderCanvasChrome() {
  if (dom.canvasEmpty) {
    const shouldHideEmpty =
      state.nodes.length > 2 ||
      Boolean(state.selectedNodeId) ||
      Boolean(state.selectedConnection) ||
      Boolean(state.pendingConnection);
    dom.canvasEmpty.classList.toggle("hidden", shouldHideEmpty);
  }

  if (!dom.canvasState) return;

  if (state.pendingConnection) {
    const sourceNode = getNodeById(state.pendingConnection.fromNodeId);
    const sourceLabel = sourceNode ? getNodeDisplayTitle(sourceNode) : "bloco";
    const connectionLabel = sourceNode
      ? getConnectionLabel(sourceNode, state.pendingConnection.portKey)
      : "";
    dom.canvasState.dataset.mode = "connecting";
    dom.canvasState.innerHTML = `
      <div class="builder-canvas-state-copy">
        <strong>Conexão em andamento</strong>
        <span>${escapeHtml(connectionLabel ? `${sourceLabel} • saída ${connectionLabel}` : `${sourceLabel} pronto para conectar`)}. Clique no próximo bloco ou pressione Esc para cancelar.</span>
      </div>
      <div class="builder-canvas-state-actions">
        <button class="builder-mini-btn" type="button" data-canvas-action="cancel-connection">Cancelar</button>
      </div>
    `;
    return;
  }

  if (state.selectedConnection) {
    const sourceNode = getNodeById(state.selectedConnection.fromNodeId);
    const targetNode = getNodeById(state.selectedConnection.toNodeId);
    const connectionLabel = sourceNode
      ? getConnectionLabel(sourceNode, state.selectedConnection.portKey)
      : "";
    dom.canvasState.dataset.mode = "selected-connection";
    dom.canvasState.innerHTML = `
      <div class="builder-canvas-state-copy">
        <strong>Conexão selecionada</strong>
        <span>${escapeHtml(
          [
            sourceNode ? getNodeDisplayTitle(sourceNode) : "Origem",
            connectionLabel ? `(${connectionLabel})` : "",
            "→",
            targetNode ? getNodeDisplayTitle(targetNode) : "Destino",
          ]
            .filter(Boolean)
            .join(" "),
        )}</span>
      </div>
      <div class="builder-canvas-state-actions">
        <button class="builder-mini-btn builder-mini-btn-danger" type="button" data-canvas-action="delete-connection">Remover conexão</button>
      </div>
    `;
    return;
  }

  const selectedNode = getNodeById(state.selectedNodeId);
  if (!selectedNode) {
    dom.canvasState.dataset.mode = "idle";
    dom.canvasState.innerHTML = `
      <div class="builder-canvas-state-copy">
        <strong>Canvas pronto</strong>
        <span>Arraste blocos, conecte pelo ponto verde e use “Organizar” quando quiser alinhar o fluxo de novo.</span>
      </div>
      <div class="builder-canvas-state-actions">
        <button class="builder-mini-btn" type="button" data-canvas-action="open-add-menu">Novo bloco</button>
      </div>
    `;
    return;
  }

  const filledOutputs = countNodeOutputs(selectedNode);
  const totalOutputs = getNodePorts(selectedNode).length;
  const connectionSummary = totalOutputs
    ? `${filledOutputs}/${totalOutputs} saída(s) conectada(s)`
    : "Sem saídas configuráveis";
  const actionMarkup = [
    '<button class="builder-mini-btn" type="button" data-canvas-action="center-node">Trazer para o centro</button>',
    selectedNode.type !== "trigger"
      ? '<button class="builder-mini-btn" type="button" data-canvas-action="duplicate">Duplicar</button>'
      : "",
    selectedNode.type !== "trigger"
      ? '<button class="builder-mini-btn builder-mini-btn-danger" type="button" data-canvas-action="delete">Excluir</button>'
      : "",
  ]
    .filter(Boolean)
    .join("");

  dom.canvasState.dataset.mode = "selected";
  dom.canvasState.innerHTML = `
    <div class="builder-canvas-state-copy">
      <strong>${escapeHtml(getNodeDisplayTitle(selectedNode))}</strong>
      <span>${escapeHtml(connectionSummary)}. ${escapeHtml(getNodePreviewText(selectedNode))}</span>
    </div>
    <div class="builder-canvas-state-actions">
      ${actionMarkup}
    </div>
  `;
}

function getNodeDimensions(nodeId) {
  const nodeElement = dom.canvas.querySelector(`[data-node-id="${nodeId}"]`);
  return {
    width: nodeElement?.offsetWidth || DEFAULT_NODE_WIDTH,
    height: nodeElement?.offsetHeight || DEFAULT_NODE_HEIGHT,
  };
}

function getPortCenterOnCanvas(nodeId, portKey = null, direction = "output") {
  const nodeElement = dom.canvas.querySelector(`[data-node-id="${nodeId}"]`);
  const position = ensureNodePosition(nodeId);
  const selector =
    direction === "input" ? ".node-port-input" : `[data-port-key="${portKey}"]`;
  const portElement = nodeElement?.querySelector(selector);

  if (!portElement) {
    const dimensions = getNodeDimensions(nodeId);
    return direction === "input"
      ? { x: position.x, y: position.y + dimensions.height / 2 }
      : {
          x: position.x + dimensions.width,
          y: position.y + dimensions.height / 2,
        };
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
    height = Math.max(
      height,
      position.y + dimensions.height + CANVAS_PADDING_Y,
    );
  });

  if (state.pendingConnection) {
    width = Math.max(
      width,
      state.pendingConnection.currentX + CANVAS_PADDING_X,
    );
    height = Math.max(
      height,
      state.pendingConnection.currentY + CANVAS_PADDING_Y,
    );
  }

  return {
    width: Math.ceil(width),
    height: Math.ceil(height),
  };
}

function buildPath(start, end) {
  const horizontalDistance = Math.abs(end.x - start.x);
  const control = Math.max(96, Math.min(220, horizontalDistance * 0.55));
  const direction = end.x >= start.x ? 1 : -1;
  return `M ${start.x} ${start.y} C ${start.x + control * direction} ${start.y}, ${end.x - control * direction} ${end.y}, ${end.x} ${end.y}`;
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
  dom.connections.setAttribute("viewBox", `0 0 ${width} ${height}`);
  dom.connections.setAttribute("width", String(width));
  dom.connections.setAttribute("height", String(height));

  const defs = `
    <defs>
      <marker id="flowArrowHead" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill="#497490"></path>
      </marker>
    </defs>
  `;

  const lineMarkup = collectConnections()
    .map((connection) => {
      const sourceNode = getNodeById(connection.fromNodeId);
      const start = getPortCenterOnCanvas(
        connection.fromNodeId,
        connection.portKey,
        "output",
      );
      const end = getPortCenterOnCanvas(connection.toNodeId, null, "input");
      if (!start || !end || !sourceNode) return "";
      const path = buildPath(start, end);
      const isSelected = isConnectionSelected(connection);
      const isActive =
        isSelected ||
        (state.selectedNodeId &&
          (connection.fromNodeId === state.selectedNodeId ||
            connection.toNodeId === state.selectedNodeId));
      const label = getConnectionLabel(sourceNode, connection.portKey);
      const midX = start.x + (end.x - start.x) * 0.5;
      const midY = start.y + (end.y - start.y) * 0.5;
      const labelWidth = Math.max(44, Math.min(112, 18 + label.length * 7));
      const connectionData = `data-connection-from="${escapeHtml(connection.fromNodeId)}" data-connection-port="${escapeHtml(connection.portKey)}" data-connection-to="${escapeHtml(connection.toNodeId)}"`;
      const labelMarkup = label
        ? `
          <g class="connection-badge ${isActive ? "is-active" : ""} ${isSelected ? "is-selected" : ""}" ${connectionData} transform="translate(${midX - labelWidth / 2} ${midY - 12})">
            <rect width="${labelWidth}" height="24" rx="12"></rect>
            <text x="${labelWidth / 2}" y="16" text-anchor="middle">${escapeHtml(label)}</text>
          </g>
        `
        : "";

      return `
        <path class="connection-hitbox" ${connectionData} d="${path}"></path>
        <path class="connection-line-highlight ${isActive ? "is-active" : ""}" d="${path}"></path>
        <path class="connection-line ${isActive ? "is-active" : ""} ${isSelected ? "is-selected" : ""}" d="${path}" marker-end="url(#flowArrowHead)"></path>
        ${labelMarkup}
      `;
    })
    .join("");

  let previewMarkup = "";
  if (state.pendingConnection) {
    const previewPath = buildPath(
      { x: state.pendingConnection.startX, y: state.pendingConnection.startY },
      {
        x: state.pendingConnection.currentX,
        y: state.pendingConnection.currentY,
      },
    );
    previewMarkup = `<path class="connection-preview" d="${previewPath}"></path>`;
  }

  dom.connections.innerHTML = `${defs}${lineMarkup}${previewMarkup}`;
}

function renderInspector() {
  const node = getNodeById(state.selectedNodeId);
  if (!node) {
    dom.inspectorEmpty.classList.remove("hidden");
    dom.inspectorPanel.classList.add("hidden");
    dom.inspectorPanel.innerHTML = "";
    return;
  }

  const canDelete = node.type !== "trigger";
  const canDuplicate = node.type !== "trigger";

  const head = `
    <div class="builder-inspector-toolbar">
      <strong>${escapeHtml(NODE_DEFINITIONS[node.type].label)}</strong>
      <div>
        ${canDuplicate ? '<button class="builder-mini-btn" type="button" data-inspector-action="duplicate">Duplicar</button>' : ""}
        ${canDelete ? '<button class="builder-mini-btn builder-mini-btn-danger" type="button" data-inspector-action="delete">Excluir</button>' : ""}
      </div>
    </div>
  `;

  let content = "";
  if (node.type === "trigger") {
    content = `
      <div class="builder-field">
        <label for="inspectorTriggerKeyword">Gatilhos do fluxo</label>
        <input id="inspectorTriggerKeyword" data-flow-field="trigger_keyword" value="${escapeHtml(state.flow?.trigger_keyword || "")}" />
        <small class="builder-field-hint">Separe varios gatilhos por virgula. O sistema ignora acentos, caixa alta e escolhe a melhor coincidencia do inicio da mensagem.</small>
      </div>
    `;
  } else if (node.type === "message" || node.type === "handoff") {
    content = `
      <div class="builder-field">
        <label for="inspectorNodeContent">Texto da mensagem</label>
        <textarea id="inspectorNodeContent" data-node-field="content">${escapeHtml(node.content || "")}</textarea>
        <small class="builder-field-hint">Quebras de linha são respeitadas. Você pode usar variáveis como {cliente_nome}, {loja_link} e {pedido_resumo}.</small>
      </div>
    `;
  } else if (node.type === "menu") {
    content = `
      <div class="builder-field">
        <label for="inspectorMenuContent">Pergunta do menu</label>
        <textarea id="inspectorMenuContent" data-node-field="content">${escapeHtml(node.content || "")}</textarea>
        <small class="builder-field-hint">O texto aceita variáveis. As opções ficam numeradas automaticamente no WhatsApp.</small>
      </div>
      <div class="builder-field">
        <label>Opções</label>
        <div class="builder-option-list">
          ${(node.options || [])
            .map(
              (option, index) => `
              <article class="builder-option-card">
                <div class="builder-option-card-head">
                  <strong>Saída ${index + 1}</strong>
                  <button class="builder-mini-btn builder-mini-btn-danger" type="button" data-option-action="remove" data-option-index="${index}">Remover</button>
                </div>
                <input value="${escapeHtml(option.label || "")}" data-option-field="label" data-option-index="${index}" />
              </article>
            `,
            )
            .join("")}
        </div>
        <button class="builder-mini-btn" type="button" data-option-action="add">Adicionar opção</button>
      </div>
    `;
  } else if (node.type === "condition") {
    content = `
      <div class="builder-field">
        <label for="inspectorConditionText">Texto para verificar</label>
        <input id="inspectorConditionText" data-node-field="match_text" value="${escapeHtml(node.match_text || "")}" />
        <small class="builder-field-hint">Se a mensagem contiver esse trecho, o fluxo segue pela saída “Sim”.</small>
      </div>
    `;
  } else if (node.type === "wait") {
    content = `
      <div class="builder-field">
        <label for="inspectorWaitSeconds">Tempo de espera</label>
        <input id="inspectorWaitSeconds" type="number" min="1" max="86400" data-node-field="seconds" value="${escapeHtml(String(node.seconds || 1))}" />
        <small class="builder-field-hint">O fluxo fica parado por esse intervalo antes de continuar.</small>
      </div>
    `;
  } else if (node.type === "tag") {
    content = `
      <div class="builder-field">
        <label for="inspectorTagName">Nome da tag</label>
        <input id="inspectorTagName" data-node-field="tag_name" value="${escapeHtml(node.tag_name || "")}" />
        <small class="builder-field-hint">A tag será adicionada na tabela de clientes quando este nó rodar.</small>
      </div>
    `;
  } else if (node.type === "input") {
    content = `
      <div class="builder-field">
        <label for="inspectorInputPrompt">Pergunta enviada ao cliente</label>
        <textarea id="inspectorInputPrompt" data-node-field="prompt">${escapeHtml(node.prompt || "")}</textarea>
        <small class="builder-field-hint">Assim que este bloco rodar, o fluxo espera uma resposta livre do cliente.</small>
      </div>
      <div class="builder-field">
        <label for="inspectorInputVariable">Variável onde salvar</label>
        <input id="inspectorInputVariable" data-node-field="variable_key" value="${escapeHtml(node.variable_key || "")}" />
        <small class="builder-field-hint">Use letras minúsculas, números e underscore. Depois você pode usar {${escapeHtml(node.variable_key || "variavel")}} nas mensagens.</small>
      </div>
    `;
  } else if (node.type === "order_lookup") {
    content = `
      <div class="builder-field">
        <label for="inspectorOrderLookupScope">Qual pedido procurar</label>
        <select id="inspectorOrderLookupScope" data-node-field="lookup_scope">
          <option value="latest" ${node.lookup_scope !== "active" ? "selected" : ""}>Último pedido</option>
          <option value="active" ${node.lookup_scope === "active" ? "selected" : ""}>Pedido em andamento</option>
        </select>
      </div>
      <div class="builder-field">
        <label for="inspectorOrderPhoneSource">Telefone da busca</label>
        <select id="inspectorOrderPhoneSource" data-node-field="phone_source">
          <option value="current_phone" ${node.phone_source !== "variable" ? "selected" : ""}>Telefone da conversa atual</option>
          <option value="variable" ${node.phone_source === "variable" ? "selected" : ""}>Usar uma variável capturada</option>
        </select>
      </div>
      <div class="builder-field ${node.phone_source === "variable" ? "" : "hidden"}" data-conditional-field="phone_variable">
        <label for="inspectorOrderPhoneVariable">Variável do telefone</label>
        <input id="inspectorOrderPhoneVariable" data-node-field="phone_variable" value="${escapeHtml(node.phone_variable || "")}" />
        <small class="builder-field-hint">Ex.: lookup_phone. Esse valor costuma vir de um bloco “Capturar resposta”.</small>
      </div>
      <div class="builder-empty-state">
        Quando encontra um pedido, libera variáveis como {pedido_id}, {pedido_resumo}, {pedido_tracking_url} e {pedido_status_label}.
      </div>
    `;
  } else if (node.type === "save_observation") {
    content = `
      <div class="builder-field">
        <label for="inspectorObservationVariable">Variável com a observação</label>
        <input id="inspectorObservationVariable" data-node-field="variable_key" value="${escapeHtml(node.variable_key || "")}" />
        <small class="builder-field-hint">Normalmente essa variável vem de um bloco “Capturar resposta”.</small>
      </div>
      <div class="builder-field">
        <label for="inspectorObservationPhoneSource">Telefone do pedido</label>
        <select id="inspectorObservationPhoneSource" data-node-field="phone_source">
          <option value="current_phone" ${node.phone_source !== "variable" ? "selected" : ""}>Telefone da conversa atual</option>
          <option value="variable" ${node.phone_source === "variable" ? "selected" : ""}>Usar uma variável capturada</option>
        </select>
      </div>
      <div class="builder-field ${node.phone_source === "variable" ? "" : "hidden"}" data-conditional-field="phone_variable">
        <label for="inspectorObservationPhoneVariable">Variável do telefone</label>
        <input id="inspectorObservationPhoneVariable" data-node-field="phone_variable" value="${escapeHtml(node.phone_variable || "")}" />
        <small class="builder-field-hint">Ex.: lookup_phone.</small>
      </div>
      <div class="builder-empty-state">
        Este bloco tenta registrar a observação no pedido em andamento. Se conseguir, você pode usar {pedido_observacoes} e {pedido_id} no próximo texto.
      </div>
    `;
  } else if (node.type === "end") {
    content = `
      <div class="builder-empty-state">
        Este bloco não tem propriedades editáveis. Ele serve apenas para encerrar o fluxo atual.
      </div>
    `;
  }

  dom.inspectorEmpty.classList.add("hidden");
  dom.inspectorPanel.classList.remove("hidden");
  dom.inspectorPanel.innerHTML = `${head}${content}`;
}

function getCanvasPointFromEvent(event) {
  const rect = dom.viewport.getBoundingClientRect();
  return {
    x: event.clientX - rect.left + dom.viewport.scrollLeft,
    y: event.clientY - rect.top + dom.viewport.scrollTop,
  };
}

function buildAddMenuMarkup(point) {
  return ADDABLE_NODE_TYPES.map((type) => {
    const definition = NODE_DEFINITIONS[type];
    const visual = getNodeVisual(type);
    return `
      <button class="builder-menu-btn" type="button" data-add-type="${type}" data-add-x="${point.x}" data-add-y="${point.y}">
        <span class="builder-menu-btn-main">
          <span class="builder-menu-icon" style="--builder-block-color:${visual.color}; --builder-block-soft:${visual.soft};">${escapeHtml(getNodeGlyph(type))}</span>
          <span class="builder-menu-copy">
            <span>${escapeHtml(definition.label)}</span>
            <small>${escapeHtml(definition.description)}</small>
          </span>
        </span>
      </button>
    `;
  }).join("");
}

function hideMenus() {
  dom.contextMenu.classList.add("hidden");
  dom.addMenu.classList.add("hidden");
}

function openFloatingMenu(menu, x, y, innerHtml) {
  menu.innerHTML = innerHtml;
  menu.classList.remove("hidden");
  const maxX = window.innerWidth - 260;
  const maxY = window.innerHeight - 240;
  menu.style.left = `${Math.max(10, Math.min(x, maxX))}px`;
  menu.style.top = `${Math.max(10, Math.min(y, maxY))}px`;
}

function openAddMenuAt(clientX, clientY, point = getViewportCenterPoint()) {
  openFloatingMenu(dom.addMenu, clientX, clientY, buildAddMenuMarkup(point));
}

function centerViewportOnNode(nodeId) {
  if (!nodeId) return;

  const position = ensureNodePosition(nodeId);
  const dimensions = getNodeDimensions(nodeId);
  const centerX = position.x + dimensions.width / 2;
  const centerY = position.y + dimensions.height / 2;

  dom.viewport.scrollTo({
    left: Math.max(0, centerX - dom.viewport.clientWidth / 2),
    top: Math.max(0, centerY - dom.viewport.clientHeight / 2),
    behavior: "smooth",
  });
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
  state.selectedConnection = null;
  markDirty(true, `${definition.label} adicionado ao canvas.`);
  renderCanvas();
}

function setNodeConnection(node, portKey, targetNodeId) {
  if (node.type === "menu" && portKey.startsWith("option:")) {
    const optionIndex = Number(portKey.split(":")[1]);
    if (Number.isInteger(optionIndex) && node.options?.[optionIndex]) {
      node.options[optionIndex].next = targetNodeId;
    }
    return;
  }

  if (node.type === "condition") {
    if (portKey === "yes") node.yes = targetNodeId;
    if (portKey === "no") node.no = targetNodeId;
    return;
  }

  if (node.type === "order_lookup") {
    if (portKey === "found") node.found = targetNodeId;
    if (portKey === "missing") node.missing = targetNodeId;
    return;
  }

  if (node.type === "save_observation") {
    if (portKey === "saved") node.saved = targetNodeId;
    if (portKey === "missing") node.missing = targetNodeId;
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
    showToast(
      dom.toast,
      "Conexões para o próprio bloco não são permitidas.",
      "err",
    );
    return;
  }

  const sourceNode = getNodeById(fromNodeId);
  if (!sourceNode) return;

  setNodeConnection(sourceNode, portKey, toNodeId);
  state.selectedConnection = null;
  markDirty(true, "Conexão atualizada no fluxo.");
  renderConnections();
  renderCanvas();
}

function removeConnection(fromNodeId, portKey) {
  const sourceNode = getNodeById(fromNodeId);
  if (!sourceNode) return;

  setNodeConnection(sourceNode, portKey, null);
  state.selectedConnection = null;
  state.selectedNodeId = fromNodeId;
  markDirty(true, "Conexão removida do fluxo.");
  renderCanvas();
}

function removeNode(nodeId) {
  const node = getNodeById(nodeId);
  if (!node || node.type === "trigger") {
    showToast(dom.toast, "O Trigger principal não pode ser removido.", "err");
    return;
  }

  state.nodes = state.nodes.filter((item) => item.id !== nodeId);
  delete state.canvas[nodeId];
  clearReferencesToNode(nodeId);
  if (state.selectedNodeId === nodeId) {
    state.selectedNodeId = null;
  }
  if (
    state.selectedConnection?.fromNodeId === nodeId ||
    state.selectedConnection?.toNodeId === nodeId
  ) {
    state.selectedConnection = null;
  }
  markDirty(true, "Bloco removido do fluxo.");
  renderCanvas();
}

function duplicateNode(nodeId) {
  const node = getNodeById(nodeId);
  if (!node || node.type === "trigger") {
    showToast(dom.toast, "Esse bloco não pode ser duplicado.", "err");
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
  state.selectedConnection = null;
  markDirty(true, "Bloco duplicado com as conexões limpas.");
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
        x: 120 + level * 310,
        y: 120 + index * 188,
      };
    });
  });

  markDirty(true, "Layout reorganizado automaticamente.");
  renderCanvas();
  window.requestAnimationFrame(() => centerViewport());
}

function centerViewport() {
  if (!state.nodes.length) return;

  const positions = state.nodes.map((node) => ensureNodePosition(node.id));
  const dimensions = state.nodes.map((node) => getNodeDimensions(node.id));
  const minX = Math.min(...positions.map((position) => position.x));
  const maxX = Math.max(
    ...positions.map((position, index) => position.x + dimensions[index].width),
  );
  const minY = Math.min(...positions.map((position) => position.y));
  const maxY = Math.max(
    ...positions.map(
      (position, index) => position.y + dimensions[index].height,
    ),
  );

  const centerX = minX + (maxX - minX) / 2;
  const centerY = minY + (maxY - minY) / 2;

  dom.viewport.scrollTo({
    left: Math.max(0, centerX - dom.viewport.clientWidth / 2),
    top: Math.max(0, centerY - dom.viewport.clientHeight / 2),
    behavior: "smooth",
  });
}

function applyFlowResponse(flow) {
  state.flow = flow;
  state.flowMeta = deepClone(flow.flow_json?.meta || {});
  state.nodes = deepClone(flow.flow_json?.nodes || []);
  state.canvas = deepClone(flow.canvas_json || {});
  state.selectedNodeId = getTriggerNode()?.id || null;
  state.selectedConnection = null;
  state.drag = null;
  state.pan = null;
  state.pendingConnection = null;
  state.isDirty = false;

  state.nodes.forEach((node, index) => ensureNodePosition(node.id, index));
  syncHeader();
  syncTemplateNotice();
  renderCanvas();
}

async function loadFlow() {
  if (!state.flowId) {
    setInlineStatus(
      dom.pageStatus,
      "Fluxo inválido. Volte para a listagem e abra novamente.",
      "err",
    );
    return;
  }

  setInlineStatus(dom.pageStatus, "Carregando dados do fluxo...", "muted");
  const flow = await session.run((api) => api.fetchFlow(state.flowId));
  applyFlowResponse(flow);
  setInlineStatus(dom.pageStatus, "Fluxo visual pronto para edição.", "ok");
  window.requestAnimationFrame(() => centerViewport());
}

function buildPayload() {
  const name = String(state.flow?.name || "").trim();
  const triggerKeyword = String(state.flow?.trigger_keyword || "").trim();

  if (!name) {
    throw new Error("Informe um nome para o fluxo.");
  }

  if (!triggerKeyword) {
    throw new Error("Informe ao menos um gatilho para o fluxo.");
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
    setInlineStatus(dom.pageStatus, "Salvando rascunho do fluxo...", "muted");
    const saved = await session.run((api) =>
      api.saveFlow(state.flowId, payload),
    );
    applyFlowResponse(saved);
    setInlineStatus(dom.pageStatus, "Rascunho salvo com sucesso.", "ok");
    showToast(dom.toast, "Fluxo salvo com sucesso.", "ok");
  } catch (error) {
    setInlineStatus(dom.pageStatus, error.message, "err");
    showToast(dom.toast, error.message, "err");
  } finally {
    dom.saveBtn.disabled = false;
  }
}

async function publishFlow() {
  const confirmed = window.confirm(
    "Tem certeza? Fluxos publicados com os mesmos gatilhos ou aliases serão substituídos.",
  );
  if (!confirmed) return;

  try {
    if (state.isDirty) {
      await saveFlow();
    }

    dom.publishBtn.disabled = true;
    setInlineStatus(dom.pageStatus, "Publicando fluxo visual...", "muted");
    const published = await session.run((api) => api.publishFlow(state.flowId));
    applyFlowResponse(published);
    setInlineStatus(
      dom.pageStatus,
      "Fluxo publicado e pronto para o WhatsApp.",
      "ok",
    );
    showToast(dom.toast, "Fluxo publicado com sucesso.", "ok");
  } catch (error) {
    setInlineStatus(dom.pageStatus, error.message, "err");
    showToast(dom.toast, error.message, "err");
  } finally {
    dom.publishBtn.disabled = false;
  }
}

async function unpublishFlow() {
  try {
    dom.unpublishBtn.disabled = true;
    setInlineStatus(
      dom.pageStatus,
      "Voltando o fluxo para rascunho...",
      "muted",
    );
    const updated = await session.run((api) => api.unpublishFlow(state.flowId));
    applyFlowResponse(updated);
    setInlineStatus(dom.pageStatus, "Fluxo despublicado com sucesso.", "ok");
    showToast(dom.toast, "Fluxo voltou para rascunho.", "ok");
  } catch (error) {
    setInlineStatus(dom.pageStatus, error.message, "err");
    showToast(dom.toast, error.message, "err");
  } finally {
    dom.unpublishBtn.disabled = false;
  }
}

function handleNodeFieldChange(field, value) {
  const node = getNodeById(state.selectedNodeId);
  if (!node) return;

  if (field === "seconds") {
    node.seconds = Math.max(
      1,
      Math.min(86400, Number.parseInt(value, 10) || 1),
    );
  } else if (field === "phone_source") {
    node.phone_source = value === "variable" ? "variable" : "current_phone";
    if (node.phone_source !== "variable") {
      node.phone_variable = null;
    }
  } else if (field === "lookup_scope") {
    node.lookup_scope = value === "active" ? "active" : "latest";
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
    if (!node || !Array.isArray(node.options) || !node.options[optionIndex])
      return;

    node.options[optionIndex][optionField] = event.target.value;
    markDirty(true);
    renderCanvas({ syncInspector: false });
  }
}

function handleInspectorClick(event) {
  const inspectorAction = event.target.dataset.inspectorAction;
  if (inspectorAction === "delete") {
    removeNode(state.selectedNodeId);
    return;
  }

  if (inspectorAction === "duplicate") {
    duplicateNode(state.selectedNodeId);
    return;
  }

  const optionAction = event.target.dataset.optionAction;
  const node = getNodeById(state.selectedNodeId);
  if (!optionAction || !node || node.type !== "menu") return;

  if (optionAction === "add") {
    node.options.push({
      label: `Nova opção ${node.options.length + 1}`,
      next: null,
    });
    markDirty(true, "Nova opção adicionada no menu.");
    renderCanvas();
    return;
  }

  if (optionAction === "remove") {
    const optionIndex = Number(event.target.dataset.optionIndex);
    if (!Number.isInteger(optionIndex) || node.options.length <= 1) {
      showToast(dom.toast, "O menu precisa ter pelo menos uma opção.", "err");
      return;
    }

    node.options.splice(optionIndex, 1);
    markDirty(true, "Opção removida do menu.");
    renderCanvas();
  }
}

function handleCanvasPointerDown(event) {
  const port = event.target.closest(".node-port-output");
  if (port) {
    const nodeElement = event.target.closest(".flow-node");
    if (!nodeElement) return;

    state.selectedNodeId = nodeElement.dataset.nodeId;
    state.selectedConnection = null;
    const start = getPortCenterOnCanvas(
      nodeElement.dataset.nodeId,
      port.dataset.portKey,
      "output",
    );
    state.pendingConnection = {
      fromNodeId: nodeElement.dataset.nodeId,
      portKey: port.dataset.portKey,
      startX: start.x,
      startY: start.y,
      currentX: start.x,
      currentY: start.y,
    };
    event.preventDefault();
    renderCanvas({ syncInspector: false });
    renderConnections();
    return;
  }

  const nodeElement = event.target.closest(".flow-node");
  if (!nodeElement || event.button !== 0) return;

  const nodeId = nodeElement.dataset.nodeId;
  state.selectedNodeId = nodeId;
  state.selectedConnection = null;
  renderCanvas();

  const point = getCanvasPointFromEvent(event);
  const position = ensureNodePosition(nodeId);
  state.drag = {
    nodeId,
    offsetX: point.x - position.x,
    offsetY: point.y - position.y,
  };

  const freshNodeElement = dom.canvas.querySelector(
    `[data-node-id="${nodeId}"]`,
  );
  freshNodeElement?.classList.add("dragging");
  hideMenus();
  event.preventDefault();
}

function handleViewportPointerDown(event) {
  if (event.button !== 0) return;
  if (
    event.target.closest(".flow-node") ||
    event.target.closest("[data-connection-from]")
  )
    return;

  state.pan = {
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: dom.viewport.scrollLeft,
    scrollTop: dom.viewport.scrollTop,
  };
  dom.viewport.classList.add("is-panning");
}

function handleViewportPointerMove(event) {
  if (state.drag) {
    const point = getCanvasPointFromEvent(event);
    const nextPosition = {
      x: Math.max(20, Math.round(point.x - state.drag.offsetX)),
      y: Math.max(20, Math.round(point.y - state.drag.offsetY)),
    };
    state.canvas[state.drag.nodeId] = nextPosition;
    const nodeElement = dom.canvas.querySelector(
      `[data-node-id="${state.drag.nodeId}"]`,
    );
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
    return;
  }

  if (state.pan) {
    dom.viewport.scrollLeft =
      state.pan.scrollLeft - (event.clientX - state.pan.startX);
    dom.viewport.scrollTop =
      state.pan.scrollTop - (event.clientY - state.pan.startY);
  }
}

function handlePointerUp(event) {
  if (state.drag) {
    const draggedNodeId = state.drag.nodeId;
    const nodeElement = dom.canvas.querySelector(
      `[data-node-id="${draggedNodeId}"]`,
    );
    nodeElement?.classList.remove("dragging");
    state.drag = null;
    markDirty(true, "Posição do bloco atualizada no canvas.");
  }

  if (state.pendingConnection) {
    const pendingConnection = state.pendingConnection;
    state.pendingConnection = null;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const targetNode = target?.closest?.(".flow-node");
    if (targetNode) {
      connectNodes(
        pendingConnection.fromNodeId,
        pendingConnection.portKey,
        targetNode.dataset.nodeId,
      );
      return;
    }

    renderCanvasChrome();
    renderConnections();
  }

  if (state.pan) {
    state.pan = null;
    dom.viewport.classList.remove("is-panning");
  }
}

function handleCanvasClick(event) {
  if (event.target.closest(".node-port-output")) return;

  const nodeElement = event.target.closest(".flow-node");
  if (nodeElement) {
    state.selectedNodeId = nodeElement.dataset.nodeId;
    state.selectedConnection = null;
    renderCanvas();
    return;
  }

  state.selectedNodeId = null;
  state.selectedConnection = null;
  renderCanvas();
}

function handleCanvasContextMenu(event) {
  const nodeElement = event.target.closest(".flow-node");
  if (!nodeElement) return;

  event.preventDefault();
  state.contextNodeId = nodeElement.dataset.nodeId;
  state.selectedNodeId = state.contextNodeId;
  state.selectedConnection = null;
  renderCanvas();

  const node = getNodeById(state.contextNodeId);
  const menuItems = [
    node?.type !== "trigger"
      ? '<button class="builder-menu-btn" type="button" data-context-action="duplicate"><span>Duplicar bloco</span><small>Clona o conteúdo</small></button>'
      : "",
    node?.type !== "trigger"
      ? '<button class="builder-menu-btn builder-menu-btn-danger" type="button" data-context-action="delete"><span>Excluir bloco</span><small>Remove e limpa as conexões</small></button>'
      : "",
  ]
    .filter(Boolean)
    .join("");

  if (!menuItems) return;
  openFloatingMenu(dom.contextMenu, event.clientX, event.clientY, menuItems);
}

function handleContextMenuClick(event) {
  const action = event.target.closest("[data-context-action]")?.dataset
    .contextAction;
  if (!action || !state.contextNodeId) return;

  if (action === "duplicate") {
    duplicateNode(state.contextNodeId);
  }

  if (action === "delete") {
    removeNode(state.contextNodeId);
  }

  hideMenus();
}

function cancelPendingConnection() {
  if (!state.pendingConnection) return;
  state.pendingConnection = null;
  renderCanvasChrome();
  renderConnections();
}

function handleConnectionsClick(event) {
  const connectionElement = event.target.closest("[data-connection-from]");
  if (!connectionElement) return;

  event.stopPropagation();
  state.selectedNodeId = null;
  state.selectedConnection = {
    fromNodeId: connectionElement.dataset.connectionFrom,
    portKey: connectionElement.dataset.connectionPort,
    toNodeId: connectionElement.dataset.connectionTo,
  };
  renderCanvas();
}

function handleCanvasStateClick(event) {
  const action = event.target.closest("[data-canvas-action]")?.dataset
    .canvasAction;
  if (!action) return;

  if (action === "cancel-connection") {
    cancelPendingConnection();
    return;
  }

  if (action === "open-add-menu") {
    event.stopPropagation();
    const rect = dom.canvasState.getBoundingClientRect();
    openAddMenuAt(rect.left, rect.bottom + 10, getViewportCenterPoint());
    return;
  }

  if (action === "delete-connection") {
    if (state.selectedConnection) {
      removeConnection(
        state.selectedConnection.fromNodeId,
        state.selectedConnection.portKey,
      );
    }
    return;
  }

  if (action === "center-node") {
    centerViewportOnNode(state.selectedNodeId);
    return;
  }

  if (action === "duplicate") {
    duplicateNode(state.selectedNodeId);
    return;
  }

  if (action === "delete") {
    removeNode(state.selectedNodeId);
  }
}

function handleCanvasDoubleClick(event) {
  if (
    event.target.closest(".flow-node") ||
    event.target.closest("[data-connection-from]")
  )
    return;

  const point = getCanvasPointFromEvent(event);
  openAddMenuAt(event.clientX, event.clientY, point);
}

function handleAddMenuClick(event) {
  const button = event.target.closest("[data-add-type]");
  if (!button) return;

  addNode(button.dataset.addType, {
    x: Number(button.dataset.addX),
    y: Number(button.dataset.addY),
  });
  hideMenus();
}

function handleBlockListClick(event) {
  const block = event.target.closest("[data-block-type]");
  if (!block) return;

  addNode(block.dataset.blockType);
}

function handleBlockDragStart(event) {
  const block = event.target.closest("[data-block-type]");
  if (!block) return;

  event.dataTransfer?.setData("text/plain", block.dataset.blockType);
  event.dataTransfer.effectAllowed = "copy";
}

function handleViewportDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
}

function handleViewportDrop(event) {
  event.preventDefault();
  const type = event.dataTransfer?.getData("text/plain");
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

function handleQuickAddClick(event) {
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  openAddMenuAt(rect.left, rect.bottom + 10, getViewportCenterPoint());
}

dom.saveBtn?.addEventListener("click", saveFlow);
dom.publishBtn?.addEventListener("click", publishFlow);
dom.unpublishBtn?.addEventListener("click", unpublishFlow);
dom.quickAddBtn?.addEventListener("click", handleQuickAddClick);
dom.centerBtn?.addEventListener("click", centerViewport);
dom.autoLayoutBtn?.addEventListener("click", autoLayout);
dom.flowNameInput?.addEventListener("input", handleTopLevelInput);
dom.flowTriggerInput?.addEventListener("input", handleTopLevelInput);
dom.blockList?.addEventListener("click", handleBlockListClick);
dom.blockList?.addEventListener("dragstart", handleBlockDragStart);
dom.canvasState?.addEventListener("click", handleCanvasStateClick);
dom.canvas?.addEventListener("pointerdown", handleCanvasPointerDown);
dom.canvas?.addEventListener("click", handleCanvasClick);
dom.canvas?.addEventListener("contextmenu", handleCanvasContextMenu);
dom.connections?.addEventListener("click", handleConnectionsClick);
dom.viewport?.addEventListener("pointerdown", handleViewportPointerDown);
dom.viewport?.addEventListener("pointermove", handleViewportPointerMove);
dom.viewport?.addEventListener("dblclick", handleCanvasDoubleClick);
dom.viewport?.addEventListener("dragover", handleViewportDragOver);
dom.viewport?.addEventListener("drop", handleViewportDrop);
dom.inspectorPanel?.addEventListener("input", handleInspectorInput);
dom.inspectorPanel?.addEventListener("click", handleInspectorClick);
dom.contextMenu?.addEventListener("click", handleContextMenuClick);
dom.addMenu?.addEventListener("click", handleAddMenuClick);
window.addEventListener("pointerup", handlePointerUp);
window.addEventListener("click", (event) => {
  if (
    !event.target.closest(".builder-context-menu") &&
    !event.target.closest(".builder-add-menu")
  ) {
    hideMenus();
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideMenus();
    cancelPendingConnection();
    state.selectedConnection = null;
    renderCanvasChrome();
    return;
  }

  if (
    (event.key === "Delete" || event.key === "Backspace") &&
    state.selectedConnection
  ) {
    removeConnection(
      state.selectedConnection.fromNodeId,
      state.selectedConnection.portKey,
    );
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

(async function bootstrap() {
  try {
    renderToolbar();
    renderVariableGuide();
    await session.ensureSession();
    await loadFlow();
  } catch (error) {
    setInlineStatus(dom.pageStatus, error.message, "err");
    showToast(dom.toast, error.message, "err");
  }
})();
