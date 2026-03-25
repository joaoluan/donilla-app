import { bindNavigationSection } from './modules/navigation.js?v=20260325g'
import { bindDashboardSection } from './modules/dashboard.js?v=20260325g'
import { bindCustomersSection } from './modules/customers.js?v=20260325g'
import { bindOrdersSection } from './modules/orders.js?v=20260325g'
import { bindSettingsSection } from './modules/settings.js?v=20260325g'
import { bindCatalogSection } from './modules/catalog.js?v=20260325g'

const STATUS_OPTIONS = ['pendente', 'preparando', 'saiu_para_entrega', 'entregue', 'cancelado'];
const STATUS_LABELS = {
  pendente: 'Pendente',
  preparando: 'Preparando',
  saiu_para_entrega: 'Saiu para entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const PAYMENT_STATUS_LABELS = {
  pendente: 'Aguardando pagamento',
  pago: 'Pago',
  falhou: 'Falhou',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
  estornado: 'Estornado',
};
const PAYMENT_STATUS_OPTIONS = ['pendente', 'cancelado', 'falhou', 'estornado'];
const ORDER_AUDIT_ACTION_LABELS = {
  pedido_criado: 'Pedido criado',
  checkout_criado: 'Checkout criado',
  checkout_reaberto: 'Checkout reaberto',
  checkout_falhou: 'Falha ao iniciar checkout',
  status_atualizado_por_webhook: 'Webhook aplicou atualização',
  status_atualizado_no_painel: 'Status alterado no painel',
};
const ORDER_AUDIT_ORIGIN_LABELS = {
  customer: 'Cliente',
  checkout: 'Checkout',
  asaas_webhook: 'Webhook Asaas',
  admin: 'Painel admin',
  system: 'Sistema',
};
const STORE_HOURS_DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const adminLayoutEl = document.getElementById('adminLayout');
const loginCardEl = document.getElementById('loginCard');
const loginFormEl = document.getElementById('loginForm');
const loginStatusEl = document.getElementById('loginStatus');
const adminTopbarDescriptionEl = document.getElementById('adminTopbarDescription');

const sessionLabelEl = document.getElementById('sessionLabel');
const logoutBtnEl = document.getElementById('logoutBtn');
const adminViewLinks = Array.from(document.querySelectorAll('[data-admin-view-link]'));
const adminPanelViews = Array.from(document.querySelectorAll('[data-admin-view]'));

const dashboardRangeMetaEl = document.getElementById('dashboardRangeMeta');
const dashboardStatusEl = document.getElementById('dashboardStatus');
const dashboardRangePresetEl = document.getElementById('dashboardRangePreset');
const dashboardFromDateEl = document.getElementById('dashboardFromDate');
const dashboardToDateEl = document.getElementById('dashboardToDate');
const dashboardApplyBtnEl = document.getElementById('dashboardApplyBtn');
const kpiTotalPedidosEl = document.getElementById('kpiTotalPedidos');
const kpiPendentesEl = document.getElementById('kpiPendentes');
const kpiPreparandoEl = document.getElementById('kpiPreparando');
const kpiEntreguesEl = document.getElementById('kpiEntregues');
const kpiFaturamentoEl = document.getElementById('kpiFaturamento');

const ordersMetaEl = document.getElementById('ordersMeta');
const ordersSearchInputEl = document.getElementById('ordersSearchInput');
const ordersSearchSuggestionsEl = document.getElementById('ordersSearchSuggestions');
const ordersPanelEl = document.getElementById('pedidos');
const statusFilterEl = document.getElementById('statusFilter');
const ordersRangePresetEl = document.getElementById('ordersRangePreset');
const ordersFromDateEl = document.getElementById('ordersFromDate');
const ordersToDateEl = document.getElementById('ordersToDate');
const ordersPageSizeInputEl = document.getElementById('ordersPageSizeInput');
const applyOrdersFiltersBtnEl = document.getElementById('applyOrdersFiltersBtn');
const refreshOrdersBtnEl = document.getElementById('refreshOrdersBtn');
const ordersStatusEl = document.getElementById('ordersStatus');
const ordersListEl = document.getElementById('ordersList');
const ordersPrevBtnEl = document.getElementById('ordersPrevBtn');
const ordersNextBtnEl = document.getElementById('ordersNextBtn');

const customersMetaEl = document.getElementById('customersMeta');
const customersListMetaEl = document.getElementById('customersListMeta');
const customersSearchInputEl = document.getElementById('customersSearchInput');
const customersSearchSuggestionsEl = document.getElementById('customersSearchSuggestions');
const customersSegmentFilterEl = document.getElementById('customersSegmentFilter');
const customersSortInputEl = document.getElementById('customersSortInput');
const customersRangePresetEl = document.getElementById('customersRangePreset');
const customersFromDateEl = document.getElementById('customersFromDate');
const customersToDateEl = document.getElementById('customersToDate');
const customersPageSizeInputEl = document.getElementById('customersPageSizeInput');
const applyCustomersFiltersBtnEl = document.getElementById('applyCustomersFiltersBtn');
const refreshCustomersBtnEl = document.getElementById('refreshCustomersBtn');
const customersStatusEl = document.getElementById('customersStatus');
const customersListEl = document.getElementById('customersList');
const customersPrevBtnEl = document.getElementById('customersPrevBtn');
const customersNextBtnEl = document.getElementById('customersNextBtn');
const customerDetailEl = document.getElementById('customerDetail');
const crmTotalCustomersEl = document.getElementById('crmTotalCustomers');
const crmActiveCustomersEl = document.getElementById('crmActiveCustomers');
const crmRecurringCustomersEl = document.getElementById('crmRecurringCustomers');
const crmLeadCustomersEl = document.getElementById('crmLeadCustomers');
const crmRevenueTotalEl = document.getElementById('crmRevenueTotal');

const settingsFormShellEl = document.getElementById('settingsFormShell');
const settingsFormEl = document.getElementById('settingsForm');
const settingsStatusEl = document.getElementById('settingsStatus');
const storeHoursStatusMetaEl = document.getElementById('storeHoursStatusMeta');
const storeHoursTimezoneMetaEl = document.getElementById('storeHoursTimezoneMeta');
const storeHoursStatusEl = document.getElementById('storeHoursStatus');
const settingsOverviewStoreEl = document.getElementById('settingsOverviewStore');
const settingsOverviewStoreMetaEl = document.getElementById('settingsOverviewStoreMeta');
const settingsOverviewHoursEl = document.getElementById('settingsOverviewHours');
const settingsOverviewHoursMetaEl = document.getElementById('settingsOverviewHoursMeta');
const settingsOverviewWhatsAppEl = document.getElementById('settingsOverviewWhatsApp');
const settingsOverviewWhatsAppMetaEl = document.getElementById('settingsOverviewWhatsAppMeta');
const settingsOverviewFeesEl = document.getElementById('settingsOverviewFees');
const settingsOverviewFeesMetaEl = document.getElementById('settingsOverviewFeesMeta');
const whatsappSessionStatusBtnEl = document.getElementById('whatsappSessionStatusBtn');
const whatsappSessionStartBtnEl = document.getElementById('whatsappSessionStartBtn');
const whatsappSessionQrBtnEl = document.getElementById('whatsappSessionQrBtn');
const whatsappSessionMetaEl = document.getElementById('whatsappSessionMeta');
const whatsappSessionStatusEl = document.getElementById('whatsappSessionStatus');
const whatsappBotPauseBtnEl = document.getElementById('whatsappBotPauseBtn');
const whatsappBotPauseMetaEl = document.getElementById('whatsappBotPauseMeta');
const whatsappBotPauseStatusEl = document.getElementById('whatsappBotPauseStatus');
const whatsappQrPreviewEl = document.getElementById('whatsappQrPreview');
const whatsappTestPhoneEl = document.getElementById('whatsappTestPhone');
const whatsappTestBtnEl = document.getElementById('whatsappTestBtn');
const whatsappTestStatusEl = document.getElementById('whatsappTestStatus');
const deliveryFeeFormEl = document.getElementById('deliveryFeeForm');
const deliveryFeeIdEl = document.getElementById('deliveryFeeId');
const deliveryFeeBairroEl = document.getElementById('deliveryFeeBairro');
const deliveryFeeCidadeEl = document.getElementById('deliveryFeeCidade');
const deliveryFeeValorEl = document.getElementById('deliveryFeeValor');
const deliveryFeeAtivoEl = document.getElementById('deliveryFeeAtivo');
const deliveryFeeSubmitBtnEl = document.getElementById('deliveryFeeSubmitBtn');
const deliveryFeeCancelBtnEl = document.getElementById('deliveryFeeCancelBtn');
const deliveryFeeSearchInputEl = document.getElementById('deliveryFeeSearchInput');
const deliveryFeeStatusEl = document.getElementById('deliveryFeeStatus');
const deliveryFeeListEl = document.getElementById('deliveryFeeList');
const catalogOverviewCategoriasEl = document.getElementById('catalogOverviewCategorias');
const catalogOverviewCategoriasMetaEl = document.getElementById('catalogOverviewCategoriasMeta');
const catalogOverviewItensEl = document.getElementById('catalogOverviewItens');
const catalogOverviewItensMetaEl = document.getElementById('catalogOverviewItensMeta');
const catalogOverviewDisponiveisEl = document.getElementById('catalogOverviewDisponiveis');
const catalogOverviewDisponiveisMetaEl = document.getElementById('catalogOverviewDisponiveisMeta');
const catalogOverviewSemEstoqueEl = document.getElementById('catalogOverviewSemEstoque');
const catalogOverviewSemEstoqueMetaEl = document.getElementById('catalogOverviewSemEstoqueMeta');
const catalogPortalSearchInputEl = document.getElementById('catalogPortalSearchInput');
const catalogPortalSearchSuggestionsEl = document.getElementById('catalogPortalSearchSuggestions');
const catalogPortalCategoryFilterEl = document.getElementById('catalogPortalCategoryFilter');
const catalogPortalMetaEl = document.getElementById('catalogPortalMeta');
const catalogPortalListEl = document.getElementById('catalogPortalList');
const catalogGoToCategoriasBtnEl = document.getElementById('catalogGoToCategoriasBtn');
const catalogGoToProdutosBtnEl = document.getElementById('catalogGoToProdutosBtn');
const storeHoursDayInputs = STORE_HOURS_DAY_KEYS.reduce((acc, dayKey) => {
  acc[dayKey] = {
    row: document.querySelector(`[data-store-hours-row="${dayKey}"]`),
    enabled: settingsFormEl?.elements?.[`horario_funcionamento_${dayKey}_enabled`] || null,
    open: settingsFormEl?.elements?.[`horario_funcionamento_${dayKey}_open`] || null,
    close: settingsFormEl?.elements?.[`horario_funcionamento_${dayKey}_close`] || null,
  };
  return acc;
}, {});

const categoryFormEl = document.getElementById('categoryForm');
const categoryIdEl = document.getElementById('categoriaId');
const categoryNomeEl = document.getElementById('categoriaNome');
const categoryOrdemEl = document.getElementById('categoriaOrdem');
const categorySubmitBtn = document.getElementById('categoriaSubmitBtn');
const categoryCancelBtn = document.getElementById('categoriaCancelBtn');
const categoryStatusEl = document.getElementById('categoryStatus');
const categoryListEl = document.getElementById('categoryList');
const categorySearchInputEl = document.getElementById('categorySearchInput');
const categorySearchSuggestionsEl = document.getElementById('categorySearchSuggestions');
const categorySortInputEl = document.getElementById('categorySortInput');
const categoryPageSizeInputEl = document.getElementById('categoryPageSizeInput');
const categoryMetaEl = document.getElementById('categoryMeta');
const categoryPrevBtnEl = document.getElementById('categoryPrevBtn');
const categoryNextBtnEl = document.getElementById('categoryNextBtn');

const produtoFormEl = document.getElementById('produtoForm');
const produtoIdEl = document.getElementById('produtoId');
const produtoCategoriaEl = document.getElementById('produtoCategoria');
const produtoNomeEl = document.getElementById('produtoNome');
const produtoDescricaoEl = document.getElementById('produtoDescricao');
const produtoPrecoEl = document.getElementById('produtoPreco');
const produtoEstoqueEl = document.getElementById('produtoEstoque');
const produtoAtivoEl = document.getElementById('produtoAtivo');
const produtoImagemEl = document.getElementById('produtoImagem');
const produtoClearImagemEl = document.getElementById('produtoClearImagem');
const produtoImagemPreviewEl = document.getElementById('produtoImagemPreview');
const produtoSubmitBtn = document.getElementById('produtoSubmitBtn');
const produtoCancelBtn = document.getElementById('produtoCancelBtn');
const produtoStatusEl = document.getElementById('produtoStatus');
const produtoListEl = document.getElementById('produtoList');
const produtoSearchInputEl = document.getElementById('produtoSearchInput');
const produtoSearchSuggestionsEl = document.getElementById('produtoSearchSuggestions');
const produtoSortInputEl = document.getElementById('produtoSortInput');
const produtoDisponibilidadeFilterEl = document.getElementById('produtoDisponibilidadeFilter');
const produtoCategoriaFilterEl = document.getElementById('produtoCategoriaFilter');
const produtoPageSizeInputEl = document.getElementById('produtoPageSizeInput');
const produtoMetaEl = document.getElementById('produtoMeta');
const produtoPrevBtnEl = document.getElementById('produtoPrevBtn');
const produtoNextBtnEl = document.getElementById('produtoNextBtn');

let accessToken = localStorage.getItem('donilla_access_token') || '';
let currentUser = null;
let allOrders = [];
let crmCustomers = [];
let customerDetail = null;
let menuCategorias = [];
let allCategorias = [];
let menuProdutos = [];
let allMenuProdutos = [];
let deliveryFees = [];
let currentStoreSettings = null;
let produtoImagemDataUrl = '';
let productImageWebpSupported = null;
let selectedCustomerId = null;
let customerPaginationMeta = null;
let ordersPaginationMeta = null;
let categoryPaginationMeta = null;
let produtoPaginationMeta = null;
const orderAuditCache = new Map();
const expandedOrderAuditIds = new Set();

const dashboardFilters = {
  period: dashboardRangePresetEl?.value || '7d',
  from: '',
  to: '',
};

const ordersState = {
  page: 1,
  pageSize: Number(ordersPageSizeInputEl?.value || 10),
  status: statusFilterEl?.value || 'all',
  search: '',
  period: ordersRangePresetEl?.value || 'today',
  from: '',
  to: '',
};

const customersState = {
  page: 1,
  pageSize: Number(customersPageSizeInputEl?.value || 12),
  search: '',
  segment: customersSegmentFilterEl?.value || 'all',
  sort: customersSortInputEl?.value || 'recent_desc',
  period: customersRangePresetEl?.value || 'all',
  from: '',
  to: '',
};

const categoryState = {
  page: 1,
  pageSize: Number(categoryPageSizeInputEl?.value || 10),
  search: '',
  sort: categorySortInputEl?.value || 'ordem_exibicao',
};

const produtoState = {
  page: 1,
  pageSize: Number(produtoPageSizeInputEl?.value || 12),
  search: '',
  sort: produtoSortInputEl?.value || 'nome_doce',
  disponibilidade: produtoDisponibilidadeFilterEl?.value || 'all',
  categoria_id: 'all',
};

const catalogPortalState = {
  search: '',
  categoria_id: 'all',
};

const DEFAULT_ADMIN_VIEW = 'dashboard';
const ADMIN_VIEW_PATH_SEGMENTS = {
  dashboard: 'resumo',
  clientes: 'clientes',
  cardapio: 'cardapio',
  pedidos: 'pedidos',
  config: 'configuracoes',
};
const ADMIN_VIEW_ALIASES = {
  resumo: 'dashboard',
  dashboard: 'dashboard',
  clientes: 'clientes',
  cardapio: 'cardapio',
  pedidos: 'pedidos',
  configuracoes: 'config',
  config: 'config',
};
const ADMIN_VIEW_DESCRIPTIONS = {
  dashboard: 'Indicadores e fotografia rápida da operação da loja.',
  clientes: 'Base de clientes com histórico, preferências e pedidos.',
  cardapio: 'Categorias, itens, estoque e disponibilidade do cardápio.',
  pedidos: 'Acompanhe, filtre e atualize pedidos em tempo real.',
  config: 'Horários, avisos e taxas por local da operação.',
};

const CRM_SEGMENT_LABELS = {
  all: 'Todos os segmentos',
  lead: 'Leads',
  novo: 'Novos',
  recorrente: 'Recorrentes',
  inativo: 'Inativos',
};

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function dateTime(value) {
  if (!value) return '--';
  return new Date(value).toLocaleString('pt-BR');
}

function dateOnly(value) {
  if (!value) return '--';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '--';

  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  return digits;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatDaysSinceLastOrder(days) {
  if (days === null || days === undefined) return 'Sem pedidos ainda';
  if (days === 0) return 'Comprou hoje';
  if (days === 1) return 'Última compra ontem';
  return `Sem comprar há ${days} dias`;
}

function formatDaysSinceLastOrderCompact(days) {
  if (days === null || days === undefined) return 'Sem pedidos';
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  return `${days} dias`;
}

function formatAddress(endereco) {
  if (!endereco) return '--';
  const rua = escapeHtml(endereco.rua || '');
  const numero = escapeHtml(endereco.numero || '');
  const bairro = escapeHtml(endereco.bairro || '');
  const cidade = endereco.cidade ? ` - ${escapeHtml(endereco.cidade)}` : '';
  const complemento = endereco.complemento ? `, ${escapeHtml(endereco.complemento)}` : '';
  const referencia = endereco.referencia ? ` (Ref: ${escapeHtml(endereco.referencia)})` : '';
  return `${rua}, ${numero} - ${bairro}${cidade}${complemento}${referencia}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setStatus(target, message, type = 'muted') {
  target.textContent = message;
  target.className = `status-text ${type}`;
}

function clearStatus(target) {
  if (!target) return;
  setStatus(target, '', 'muted');
}

function buildAddressKey(endereco) {
  if (!endereco) return '';
  return [
    endereco.rua,
    endereco.numero,
    endereco.bairro,
    endereco.cidade,
    endereco.complemento,
    endereco.referencia,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .join('|');
}

function uniqueAddresses(addresses = []) {
  const seen = new Set();
  return (addresses || []).filter((endereco) => {
    const key = buildAddressKey(endereco);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatCompactAddress(endereco) {
  if (!endereco) return 'Sem endereço principal';

  const parts = [];
  const street = [endereco.rua, endereco.numero].filter(Boolean).join(', ');
  if (street) parts.push(street);
  if (endereco.bairro) parts.push(endereco.bairro);
  if (endereco.cidade) parts.push(endereco.cidade);
  return parts.join(' · ') || 'Sem endereço principal';
}

function paymentStatusClass(status) {
  const normalized = String(status || 'pendente').trim().toLowerCase();
  if (['pendente', 'pago', 'falhou', 'cancelado', 'expirado', 'estornado'].includes(normalized)) {
    return normalized;
  }
  return 'pendente';
}

function paymentStatusLabel(value) {
  return PAYMENT_STATUS_LABELS[paymentStatusClass(value)] || 'Aguardando pagamento';
}

function paymentChipClasses(status) {
  return `status-chip payment-chip payment-${paymentStatusClass(status)}`;
}

function paymentChipMarkup(status) {
  return `
    <span class="${paymentChipClasses(status)}">
      <span class="payment-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(paymentStatusLabel(status))}
    </span>
  `;
}

function paymentMethodLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'pix') return 'Pix';
  if (normalized === 'asaas_checkout') return 'Pagamento online';
  return value ? String(value) : '--';
}

function orderAuditActionLabel(value) {
  return ORDER_AUDIT_ACTION_LABELS[String(value || '').trim()] || (value ? String(value) : 'Evento');
}

function orderAuditOriginLabel(value) {
  return ORDER_AUDIT_ORIGIN_LABELS[String(value || '').trim()] || (value ? String(value) : 'Sistema');
}

function orderAuditActorLabel(value) {
  const actor = String(value || '').trim();
  if (!actor) return 'Origem automática';
  return actor;
}

function orderAuditStatusValueLabel(type, value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (type === 'payment') return PAYMENT_STATUS_LABELS[normalized] || normalized;
  return STATUS_LABELS[normalized] || normalized;
}

function buildOrderAuditChanges(entry) {
  const changes = [];
  const paymentBefore = orderAuditStatusValueLabel('payment', entry.status_pagamento_anterior);
  const paymentAfter = orderAuditStatusValueLabel('payment', entry.status_pagamento_atual);
  const deliveryBefore = orderAuditStatusValueLabel('delivery', entry.status_entrega_anterior);
  const deliveryAfter = orderAuditStatusValueLabel('delivery', entry.status_entrega_atual);

  if (paymentBefore || paymentAfter) {
    changes.push(`Pagamento: ${paymentBefore || 'vazio'} -> ${paymentAfter || 'vazio'}`);
  }

  if (deliveryBefore || deliveryAfter) {
    changes.push(`Entrega: ${deliveryBefore || 'vazio'} -> ${deliveryAfter || 'vazio'}`);
  }

  return changes;
}

function buildOrderAuditDetailSummary(details) {
  if (!details || typeof details !== 'object') return '';

  const lines = [];
  if (details.event) lines.push(`Evento: ${details.event}`);
  if (details.checkout_id) lines.push(`Checkout: ${details.checkout_id}`);
  if (details.checkout_id_anterior) lines.push(`Checkout anterior: ${details.checkout_id_anterior}`);
  if (details.checkout_id_novo) lines.push(`Checkout novo: ${details.checkout_id_novo}`);
  if (details.asaas_payment_id) lines.push(`Pagamento Asaas: ${details.asaas_payment_id}`);
  if (details.metodo_pagamento) lines.push(`Pagamento: ${paymentMethodLabel(details.metodo_pagamento)}`);
  if (details.valor_total !== undefined) lines.push(`Total: ${brl(details.valor_total)}`);
  if (details.valor_entrega !== undefined) lines.push(`Entrega: ${brl(details.valor_entrega)}`);
  if (details.itens !== undefined) lines.push(`Itens: ${details.itens}`);
  if (details.expira_em) lines.push(`Expira em: ${dateTime(details.expira_em)}`);
  if (details.delivery_changed !== undefined) lines.push(`Mudou entrega: ${details.delivery_changed ? 'sim' : 'não'}`);
  if (details.payment_changed !== undefined) lines.push(`Mudou pagamento: ${details.payment_changed ? 'sim' : 'não'}`);

  return lines.join('\n');
}

function renderOrderAuditEntry(entry) {
  const changes = buildOrderAuditChanges(entry);
  const detailSummary = buildOrderAuditDetailSummary(entry.detalhes);

  return `
    <li class="order-audit-item">
      <div class="order-audit-item-head">
        <strong>${escapeHtml(orderAuditActionLabel(entry.acao))}</strong>
        <small>${escapeHtml(dateTime(entry.criado_em))}</small>
      </div>
      <div class="order-audit-item-meta">
        <span class="order-audit-pill">${escapeHtml(orderAuditOriginLabel(entry.origem))}</span>
        <span class="order-audit-pill">${escapeHtml(orderAuditActorLabel(entry.ator))}</span>
      </div>
      ${
        changes.length
          ? `<ul class="order-audit-changes">${changes.map((change) => `<li>${escapeHtml(change)}</li>`).join('')}</ul>`
          : '<p class="muted">Sem transição de status registrada neste evento.</p>'
      }
      ${detailSummary ? `<pre class="order-audit-details">${escapeHtml(detailSummary)}</pre>` : ''}
    </li>
  `;
}

function renderOrderAuditPanelState(orderId, { loading = false, error = '', items = null } = {}) {
  const panel = document.getElementById(`order-audit-${orderId}`);
  if (!panel) return;

  panel.classList.remove('hidden');

  if (loading) {
    panel.innerHTML = '<p class="muted">Carregando histórico do pedido...</p>';
    return;
  }

  if (error) {
    panel.innerHTML = `<p class="status-text err">${escapeHtml(error)}</p>`;
    return;
  }

  const safeItems = Array.isArray(items) ? items : [];
  panel.innerHTML = `
    <div class="order-audit-panel-head">
      <h4>Histórico do pedido</h4>
      <small>${safeItems.length} registro(s)</small>
    </div>
    ${
      safeItems.length
        ? `<ol class="order-audit-timeline">${safeItems.map(renderOrderAuditEntry).join('')}</ol>`
        : '<p class="muted">Nenhum evento de auditoria registrado para este pedido até agora.</p>'
    }
  `;
}

function paymentStatusSelectValues(order) {
  const normalized = paymentStatusClass(order?.status_pagamento);
  return [normalized, ...PAYMENT_STATUS_OPTIONS].filter((value, index, items) => items.indexOf(value) === index);
}

function getSelectOptionLabel(selectEl, value) {
  const option = Array.from(selectEl?.options || []).find((item) => item.value === value);
  return option?.textContent || value || '--';
}

function adminViewExists(view) {
  return adminPanelViews.some((panel) => panel.dataset.adminView === view);
}

function extractAdminViewToken(rawValue) {
  const normalized = String(rawValue || '').trim().toLowerCase();
  if (!normalized) return '';

  if (normalized.startsWith('#')) {
    return normalized.slice(1).replace(/^\/+/, '').replace(/\/+$/, '');
  }

  const withoutFragment = normalized.split('#')[0].split('?')[0];
  const withoutTrailingSlash = withoutFragment.replace(/\/+$/, '');

  if (withoutTrailingSlash === '/admin' || withoutTrailingSlash === 'admin') {
    return '';
  }

  if (withoutTrailingSlash.startsWith('/admin/')) {
    return withoutTrailingSlash.slice('/admin/'.length);
  }

  if (withoutTrailingSlash.startsWith('admin/')) {
    return withoutTrailingSlash.slice('admin/'.length);
  }

  return withoutTrailingSlash.replace(/^\/+/, '');
}

function normalizeAdminView(rawView) {
  const view = extractAdminViewToken(rawView);
  if (ADMIN_VIEW_ALIASES[view]) return ADMIN_VIEW_ALIASES[view];
  return adminViewExists(view) ? view : DEFAULT_ADMIN_VIEW;
}

function adminPathForView(view) {
  const activeView = normalizeAdminView(view);
  const pathSegment = ADMIN_VIEW_PATH_SEGMENTS[activeView] || ADMIN_VIEW_PATH_SEGMENTS[DEFAULT_ADMIN_VIEW];
  return `/admin/${pathSegment}`;
}

function activeAdminViewFromLocation() {
  const pathView = normalizeAdminView(window.location.pathname);
  const isBaseAdminRoute = /^\/admin\/?$/.test(window.location.pathname);
  if (isBaseAdminRoute && window.location.hash) {
    return normalizeAdminView(window.location.hash);
  }
  return pathView;
}

function setAdminTopbarDescription(view) {
  if (!adminTopbarDescriptionEl) return;
  adminTopbarDescriptionEl.textContent = ADMIN_VIEW_DESCRIPTIONS[view] || ADMIN_VIEW_DESCRIPTIONS[DEFAULT_ADMIN_VIEW];
}

function renderAdminView(view) {
  const activeView = normalizeAdminView(view);

  adminPanelViews.forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.adminView !== activeView);
  });

  adminViewLinks.forEach((link) => {
    link.classList.toggle('active', link.dataset.adminViewLink === activeView);
  });

  setAdminTopbarDescription(activeView);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function navigateToAdminView(view, { replace = false } = {}) {
  const activeView = normalizeAdminView(view);
  const nextPath = adminPathForView(activeView);
  const nextUrl = `${nextPath}${window.location.search}`;
  const currentUrl = `${window.location.pathname}${window.location.search}`;

  renderAdminView(activeView);

  if (replace) {
    history.replaceState({ adminView: activeView }, '', nextUrl);
    return;
  }

  if (currentUrl !== nextUrl || window.location.hash) {
    history.pushState({ adminView: activeView }, '', nextUrl);
  }
}

function syncAdminViewFromLocation({ replace = false } = {}) {
  const activeView = activeAdminViewFromLocation();
  const nextPath = adminPathForView(activeView);

  renderAdminView(activeView);

  if (replace || window.location.pathname !== nextPath || window.location.hash) {
    history.replaceState(
      { adminView: activeView },
      '',
      `${nextPath}${window.location.search}`,
    );
  }
}

function createDebounce(delay, callback) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

function updateDatalistOptions(datalistEl, options = []) {
  if (!datalistEl) return;

  const seen = new Set();
  const safeOptions = options
    .filter((option) => option && option.value)
    .filter((option) => {
      const key = String(option.value || '').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);

  datalistEl.innerHTML = safeOptions
    .map((option) => {
      const label = option.label ? ` label="${escapeHtml(option.label)}"` : '';
      return `<option value="${escapeHtml(option.value)}"${label}></option>`;
    })
    .join('');
}

function syncCustomersStateFromControls() {
  customersState.search = String(customersSearchInputEl?.value || '').trim();
  customersState.segment = customersSegmentFilterEl?.value || 'all';
  customersState.sort = customersSortInputEl?.value || 'recent_desc';
  customersState.period = customersRangePresetEl?.value || 'all';
  customersState.from = customersFromDateEl?.value || '';
  customersState.to = customersToDateEl?.value || '';
}

function syncOrdersStateFromControls() {
  ordersState.search = String(ordersSearchInputEl?.value || '').trim();
  ordersState.status = statusFilterEl?.value || 'all';
  ordersState.period = ordersRangePresetEl?.value || 'today';
  ordersState.from = ordersFromDateEl?.value || '';
  ordersState.to = ordersToDateEl?.value || '';
}

function scrollCustomerDetailIntoView() {
  const detailPanel = customerDetailEl?.closest('.crm-detail-panel');
  if (!detailPanel || window.innerWidth >= 881) return;
  detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...extra,
  };
}

async function parseEnvelope(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message || `Erro HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload || { success: true, data: null, meta: null };
}

async function parseResponse(response) {
  const payload = await parseEnvelope(response);
  return payload?.data;
}

function normalizeEstoque(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function availabilityLabel(produto) {
  const estoque = normalizeEstoque(produto.estoque_disponivel);
  if (!produto.ativo) return 'Indisponível';
  if (estoque === null) return 'Disponível';
  if (estoque <= 0) return 'Sem estoque';
  return `Em estoque (${estoque})`;
}

function isProdutoDisponivel(produto) {
  const estoque = normalizeEstoque(produto.estoque_disponivel);
  return produto.ativo && (estoque === null || estoque > 0);
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  const normalized = base64.replace(/\s/g, '');
  if (!normalized) return 0;
  return Math.floor((normalized.length * 3) / 4);
}

function imageFileIsValid(file) {
  return Boolean(file && typeof file.type === 'string' && file.type.startsWith('image/'));
}

function isWebpSupported() {
  if (productImageWebpSupported !== null) return productImageWebpSupported;
  const canvas = document.createElement('canvas');
  productImageWebpSupported = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  return productImageWebpSupported;
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem.'));
    image.onload = () => resolve(image);
    image.src = dataUrl;
  });
}

async function compressImageDataUrl(file) {
  if (!imageFileIsValid(file)) {
    throw new Error('Selecione um arquivo de imagem válido.');
  }

  const source = await readImageAsDataUrl(file);
  const isNotRecompressible = /^data:image\/(svg\+xml|gif);/i.test(source);
  const sourceBytes = estimateDataUrlBytes(source);
  const maxBytes = 1.5 * 1024 * 1024;

  if (isNotRecompressible && sourceBytes <= maxBytes) return source;
  if (sourceBytes <= maxBytes) return source;

  const image = await loadImageFromDataUrl(source);
  const naturalWidth = Number(image.naturalWidth) || 0;
  const naturalHeight = Number(image.naturalHeight) || 0;

  if (!naturalWidth || !naturalHeight) {
    return source;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Seu navegador não suporta compressão de imagem.');
  }
  const outputTypes = isWebpSupported() ? ['image/webp', 'image/jpeg'] : ['image/jpeg'];
  const maxSide = 1100;
  const minQuality = 0.45;
  const qualityStep = 0.08;
  const scaleBase = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
  let width = Math.max(1, Math.round(naturalWidth * scaleBase));
  let height = Math.max(1, Math.round(naturalHeight * scaleBase));

  for (const outputType of outputTypes) {
    let quality = 0.82;
    let currentWidth = width;
    let currentHeight = height;

    while (currentWidth >= 1 && currentHeight >= 1) {
      canvas.width = currentWidth;
      canvas.height = currentHeight;
      ctx.drawImage(image, 0, 0, currentWidth, currentHeight);

      let dataUrl = canvas.toDataURL(outputType, quality);
      while (estimateDataUrlBytes(dataUrl) > maxBytes && quality > minQuality) {
        quality = Math.max(minQuality, quality - qualityStep);
        dataUrl = canvas.toDataURL(outputType, quality);
      }

      if (estimateDataUrlBytes(dataUrl) <= maxBytes) {
        return dataUrl;
      }

      quality = 0.82;
      currentWidth = Math.max(1, Math.round(currentWidth * 0.85));
      currentHeight = Math.max(1, Math.round(currentHeight * 0.85));
    }
  }

  if (sourceBytes <= maxBytes) return source;
  throw new Error('Imagem muito grande. Use uma foto menor e tente novamente.');
}

function resetImagePreview() {
  produtoImagemPreviewEl.removeAttribute('src');
  produtoImagemPreviewEl.classList.add('hidden');
}

function buildImagePreview(value) {
  if (!value) {
    resetImagePreview();
    return;
  }

  produtoImagemPreviewEl.src = value;
  produtoImagemPreviewEl.classList.remove('hidden');
}

function buildQueryString(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  return query.toString();
}

function toIsoDateText(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function parseIsoDateToLocalDate(dateText, { endOfDay = false } = {}) {
  if (!dateText) return null;
  const [year, month, day] = String(dateText).split('-').map(Number);
  if (!year || !month || !day) return null;

  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
}

function buildPeriodParams(state, defaultPeriod = '7d') {
  const period = state?.period || defaultPeriod;
  if (period === 'all') {
    return { period };
  }

  if (period === 'custom') {
    const fromDate = parseIsoDateToLocalDate(state?.from || '');
    const toDate = parseIsoDateToLocalDate(state?.to || '', { endOfDay: true });

    return {
      period,
      from: state?.from || undefined,
      to: state?.to || undefined,
      fromAt: fromDate ? fromDate.toISOString() : undefined,
      toAt: toDate ? toDate.toISOString() : undefined,
    };
  }

  const now = new Date();
  const toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  if (period === 'month') {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  } else if (period === '30d') {
    fromDate.setDate(fromDate.getDate() - 29);
  } else if (period === '7d') {
    fromDate.setDate(fromDate.getDate() - 6);
  }

  return {
    period,
    from: toIsoDateText(fromDate),
    to: toIsoDateText(toDate),
    fromAt: fromDate.toISOString(),
    toAt: toDate.toISOString(),
  };
}

function formatRangeMeta(filters) {
  if (!filters) return 'Todo o período';
  if (filters.from && filters.to && filters.from === filters.to) return `${filters.label} (${filters.from})`;
  if (filters.from && filters.to) return `${filters.label} (${filters.from} a ${filters.to})`;
  if (filters.from) return `${filters.label} (desde ${filters.from})`;
  if (filters.to) return `${filters.label} (até ${filters.to})`;
  return filters.label || 'Todo o período';
}

function syncRangeInputs(presetEl, fromEl, toEl, state) {
  if (!presetEl || !fromEl || !toEl) return;
  presetEl.value = state.period || '7d';
  fromEl.value = state.from || '';
  toEl.value = state.to || '';
  const isCustom = presetEl.value === 'custom';
  fromEl.disabled = !isCustom;
  toEl.disabled = !isCustom;
  fromEl.classList.toggle('hidden', !isCustom);
  toEl.classList.toggle('hidden', !isCustom);
}

function validateRangeState(state, statusTarget, label) {
  if (!state || state.period !== 'custom') {
    clearStatus(statusTarget);
    return true;
  }

  if (!state.from && !state.to) {
    setStatus(statusTarget, `Escolha ao menos uma data para o filtro personalizado de ${label}.`, 'muted');
    return false;
  }

  if (state.from && state.to && state.from > state.to) {
    setStatus(statusTarget, 'A data inicial deve ser menor ou igual a data final.', 'err');
    return false;
  }

  clearStatus(statusTarget);
  return true;
}

function updateDashboardControlsFromMeta(filters) {
  if (!filters) return;
  dashboardFilters.period = filters.period || dashboardFilters.period;
  dashboardFilters.from = filters.from || '';
  dashboardFilters.to = filters.to || '';
  syncRangeInputs(dashboardRangePresetEl, dashboardFromDateEl, dashboardToDateEl, dashboardFilters);
}

function updateOrdersControlsFromState() {
  if (statusFilterEl) statusFilterEl.value = ordersState.status;
  if (ordersSearchInputEl) ordersSearchInputEl.value = ordersState.search;
  if (ordersPageSizeInputEl) ordersPageSizeInputEl.value = String(ordersState.pageSize);
  syncRangeInputs(ordersRangePresetEl, ordersFromDateEl, ordersToDateEl, ordersState);
}

function updateCustomersControlsFromState() {
  if (customersSearchInputEl) customersSearchInputEl.value = customersState.search;
  if (customersSegmentFilterEl) customersSegmentFilterEl.value = customersState.segment;
  if (customersSortInputEl) customersSortInputEl.value = customersState.sort;
  if (customersPageSizeInputEl) customersPageSizeInputEl.value = String(customersState.pageSize);
  syncRangeInputs(customersRangePresetEl, customersFromDateEl, customersToDateEl, customersState);
}

function populateCategoriaOptions(selectedId = '') {
  const options = [
    '<option value="">Selecione a categoria</option>',
    ...allCategorias.map((categoria) => {
      const checked = String(selectedId) === String(categoria.id) ? 'selected' : '';
      return `<option value="${categoria.id}" ${checked}>${escapeHtml(categoria.nome)}</option>`;
    }),
  ];

  produtoCategoriaEl.innerHTML = options.join('');
  produtoCategoriaEl.disabled = allCategorias.length === 0;
}

function populateProdutoCategoriaFilterOptions() {
  const options = [
    '<option value="all">Todas as categorias</option>',
    ...allCategorias.map((categoria) => {
      const checked = String(produtoState.categoria_id) === String(categoria.id) ? 'selected' : '';
      return `<option value="${categoria.id}" ${checked}>${escapeHtml(categoria.nome)}</option>`;
    }),
  ];

  produtoCategoriaFilterEl.innerHTML = options.join('');
}

function populateCatalogPortalCategoryFilterOptions() {
  const selectedCategoryId = allCategorias.some((categoria) => String(categoria.id) === String(catalogPortalState.categoria_id))
    ? String(catalogPortalState.categoria_id)
    : 'all';

  catalogPortalState.categoria_id = selectedCategoryId;

  if (!catalogPortalCategoryFilterEl) return;

  const options = [
    '<option value="all">Selecionar categoria</option>',
    ...allCategorias.map((categoria) => {
      const checked = selectedCategoryId === String(categoria.id) ? 'selected' : '';
      return `<option value="${categoria.id}" ${checked}>${escapeHtml(categoria.nome)}</option>`;
    }),
  ];

  catalogPortalCategoryFilterEl.innerHTML = options.join('');
}

function productCategoryName(categoriaId) {
  const categoria = allCategorias.find((item) => item.id === categoriaId);
  return categoria?.nome || 'Categoria não encontrada';
}

function resetCategoriaForm() {
  categoryIdEl.value = '';
  categoryNomeEl.value = '';
  categoryOrdemEl.value = '';
  categorySubmitBtn.textContent = 'Salvar categoria';
  categoryStatusEl.textContent = '';
}

function resetProdutoForm() {
  produtoIdEl.value = '';
  produtoCategoriaEl.selectedIndex = 0;
  produtoNomeEl.value = '';
  produtoDescricaoEl.value = '';
  produtoPrecoEl.value = '';
  produtoEstoqueEl.value = '';
  produtoAtivoEl.checked = true;
  produtoImagemEl.value = '';
  produtoClearImagemEl.checked = false;
  produtoSubmitBtn.textContent = 'Salvar item';
  produtoStatusEl.textContent = '';
  produtoImagemDataUrl = '';
  resetImagePreview();
}

function applySessionUi() {
  const hasSession = Boolean(accessToken && currentUser);
  adminLayoutEl.classList.toggle('logged-out', !hasSession);
  loginCardEl.classList.toggle('hidden', hasSession);
  logoutBtnEl.disabled = !hasSession;
  sessionLabelEl.textContent = hasSession
    ? `Logado como ${currentUser.username} (${currentUser.role})`
    : 'Sem sessão ativa';
}

function clearSession() {
  accessToken = '';
  currentUser = null;
  localStorage.removeItem('donilla_access_token');
  allOrders = [];
  crmCustomers = [];
  customerDetail = null;
  menuCategorias = [];
  menuProdutos = [];
  allMenuProdutos = [];
  deliveryFees = [];
  currentStoreSettings = null;
  allCategorias = [];
  selectedCustomerId = null;
  customerPaginationMeta = null;
  ordersPaginationMeta = null;
  categoryPaginationMeta = null;
  produtoPaginationMeta = null;
  orderAuditCache.clear();
  expandedOrderAuditIds.clear();
  customersState.page = 1;
  customersState.pageSize = 12;
  customersState.search = '';
  customersState.segment = 'all';
  customersState.sort = 'recent_desc';
  customersState.period = 'all';
  customersState.from = '';
  customersState.to = '';
  ordersState.page = 1;
  ordersState.search = '';
  ordersState.status = 'all';
  ordersState.period = 'today';
  ordersState.from = '';
  ordersState.to = '';
  categoryState.page = 1;
  categoryState.pageSize = 10;
  categoryState.search = '';
  categoryState.sort = 'ordem_exibicao';
  produtoState.page = 1;
  produtoState.pageSize = 12;
  produtoState.search = '';
  produtoState.sort = 'nome_doce';
  produtoState.disponibilidade = 'all';
  produtoState.categoria_id = 'all';
  catalogPortalState.search = '';
  catalogPortalState.categoria_id = 'all';
  applySessionUi();
  renderCustomersSummary();
  renderCustomerDetail();
  renderCustomers();
  renderOrders();
  renderDashboard();
  resetCategoriaForm();
  resetProdutoForm();
  resetDeliveryFeeForm();
  renderCatalogOverview();
  renderCatalogPortal();
  renderSettingsOverview();
  if (customersSearchInputEl) {
    customersSearchInputEl.value = '';
  }
  if (customersSegmentFilterEl) {
    customersSegmentFilterEl.value = 'all';
  }
  if (customersSortInputEl) {
    customersSortInputEl.value = 'recent_desc';
  }
  if (customersPageSizeInputEl) {
    customersPageSizeInputEl.value = '12';
  }
  if (categoryListEl) {
    categoryListEl.innerHTML = '<p class="muted">Faça login para carregar categorias.</p>';
  }
  if (produtoListEl) {
    produtoListEl.innerHTML = '<p class="muted">Faça login para carregar itens.</p>';
  }
  if (catalogPortalListEl) {
    catalogPortalListEl.innerHTML = '<div class="catalog-admin-preview-empty"><p class="muted">Faça login para visualizar a vitrine do cardápio.</p></div>';
  }
  if (deliveryFeeListEl) {
    deliveryFeeListEl.innerHTML = '<p class="muted">Faça login para gerenciar taxas de entrega.</p>';
  }
  if (catalogPortalSearchInputEl) {
    catalogPortalSearchInputEl.value = '';
  }
  if (categorySearchInputEl) {
    categorySearchInputEl.value = '';
  }
  if (categorySortInputEl) {
    categorySortInputEl.value = 'ordem_exibicao';
  }
  if (categoryPageSizeInputEl) {
    categoryPageSizeInputEl.value = String(categoryState.pageSize);
  }
  if (produtoSearchInputEl) {
    produtoSearchInputEl.value = '';
  }
  if (produtoSortInputEl) {
    produtoSortInputEl.value = 'nome_doce';
  }
  if (produtoDisponibilidadeFilterEl) {
    produtoDisponibilidadeFilterEl.value = 'all';
  }
  if (produtoCategoriaFilterEl) {
    produtoCategoriaFilterEl.innerHTML = '<option value="all">Todas as categorias</option>';
  }
  if (catalogPortalCategoryFilterEl) {
    catalogPortalCategoryFilterEl.innerHTML = '<option value="all">Selecionar categoria</option>';
  }
  if (produtoPageSizeInputEl) {
    produtoPageSizeInputEl.value = String(produtoState.pageSize);
  }
  if (deliveryFeeSearchInputEl) {
    deliveryFeeSearchInputEl.value = '';
  }
  if (produtoCategoriaEl) {
    produtoCategoriaEl.innerHTML = '<option value="">Selecione a categoria</option>';
  }
  if (categoryMetaEl) {
    categoryMetaEl.textContent = 'Faça login para carregar categorias.';
  }
  if (produtoMetaEl) {
    produtoMetaEl.textContent = 'Faça login para carregar itens.';
  }
  if (catalogPortalMetaEl) {
    catalogPortalMetaEl.textContent = 'Faça login para carregar o cardápio.';
  }
  if (customersMetaEl) {
    customersMetaEl.textContent = 'Faça login para carregar a carteira de clientes.';
  }
  if (customersListMetaEl) {
    customersListMetaEl.textContent = 'Faça login para carregar clientes.';
  }
  if (customersPrevBtnEl) customersPrevBtnEl.disabled = true;
  if (customersNextBtnEl) customersNextBtnEl.disabled = true;
  if (ordersPrevBtnEl) ordersPrevBtnEl.disabled = true;
  if (ordersNextBtnEl) ordersNextBtnEl.disabled = true;
  if (categoryPrevBtnEl) categoryPrevBtnEl.disabled = true;
  if (categoryNextBtnEl) categoryNextBtnEl.disabled = true;
  if (produtoPrevBtnEl) produtoPrevBtnEl.disabled = true;
  if (produtoNextBtnEl) produtoNextBtnEl.disabled = true;
  dashboardRangeMetaEl.textContent = 'Faça login para carregar indicadores.';
  updateCustomersControlsFromState();
  updateOrdersControlsFromState();
  syncRangeInputs(dashboardRangePresetEl, dashboardFromDateEl, dashboardToDateEl, dashboardFilters);
  clearStatus(dashboardStatusEl);
  clearStatus(customersStatusEl);
  clearStatus(ordersStatusEl);
  setStatus(settingsStatusEl, 'Faça login para editar configurações.', 'muted');
  setStatus(deliveryFeeStatusEl, 'Faça login para editar taxas de entrega.', 'muted');
}

function renderDashboard(dashboard, meta = null) {
  if (!dashboard) {
    kpiTotalPedidosEl.textContent = '--';
    kpiPendentesEl.textContent = '--';
    kpiPreparandoEl.textContent = '--';
    kpiEntreguesEl.textContent = '--';
    kpiFaturamentoEl.textContent = '--';
    dashboardRangeMetaEl.textContent = 'Faça login para carregar indicadores.';
    return;
  }

  kpiTotalPedidosEl.textContent = String(dashboard.totalPedidos ?? 0);
  kpiPendentesEl.textContent = String(dashboard.status?.pendentes ?? 0);
  kpiPreparandoEl.textContent = String(dashboard.status?.preparando ?? 0);
  kpiEntreguesEl.textContent = String(dashboard.status?.entregues ?? 0);
  kpiFaturamentoEl.textContent = brl(dashboard.faturamento || 0);

  const filters = meta?.filters || null;
  dashboardRangeMetaEl.textContent = filters ? formatRangeMeta(filters) : 'Todo o período';
  updateDashboardControlsFromMeta(filters || dashboardFilters);
}

function renderCustomersSummary(summary = null) {
  crmTotalCustomersEl.textContent = summary ? String(summary.total_customers ?? 0) : '--';
  crmActiveCustomersEl.textContent = summary ? String(summary.active_customers ?? 0) : '--';
  crmRecurringCustomersEl.textContent = summary ? String(summary.recurring_customers ?? 0) : '--';
  crmLeadCustomersEl.textContent = summary ? String(summary.lead_customers ?? 0) : '--';
  crmRevenueTotalEl.textContent = summary ? brl(summary.revenue_total || 0) : '--';
}

function customerSegmentChip(customer) {
  const segment = escapeHtml(customer.segment || 'all');
  const label = escapeHtml(customer.segment_label || CRM_SEGMENT_LABELS[customer.segment] || 'Cliente');
  return `<span class="crm-chip crm-chip-${segment}">${label}</span>`;
}

function customerCard(customer) {
  const isActive = Number(selectedCustomerId || 0) === Number(customer.id || 0);
  const addressLabel = customer.latest_endereco
    ? formatCompactAddress(customer.latest_endereco)
    : 'Sem endereço principal';

  return `
    <button
      type="button"
      class="crm-customer-card${isActive ? ' active' : ''}"
      data-customer-select="${customer.id}"
      aria-pressed="${isActive ? 'true' : 'false'}"
    >
      <span class="crm-customer-heading">
        <span class="crm-customer-identity">
          <span class="crm-customer-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 12c2.761 0 5-2.462 5-5.5S14.761 1 12 1 7 3.462 7 6.5 9.239 12 12 12Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
              <path d="M4 21c1.835-3.343 4.55-5 8-5s6.165 1.657 8 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
          </span>
          <span class="crm-customer-main">
            <strong>${escapeHtml(customer.nome || '--')}</strong>
            <small>${escapeHtml(formatPhone(customer.telefone_whatsapp || ''))}</small>
          </span>
        </span>
        <span class="crm-customer-badges">
          ${customerSegmentChip(customer)}
        </span>
      </span>

      <span class="crm-customer-inline-stats">
        <span class="crm-inline-pill"><b>Pedidos</b>${Number(customer.total_orders || 0)}</span>
        <span class="crm-inline-pill"><b>Faturamento</b>${brl(customer.total_spent || 0)}</span>
        <span class="crm-inline-pill"><b>Recência</b>${escapeHtml(formatDaysSinceLastOrderCompact(customer.days_since_last_order))}</span>
      </span>

      <span class="crm-customer-footer">
        <span class="crm-customer-caption">${escapeHtml(customer.segment_reason || 'Sem observações no momento.')}</span>
        <span class="crm-customer-location">${escapeHtml(addressLabel)}</span>
      </span>
    </button>
  `;
}

function customerDetailOrderCard(order) {
  const status = order.status_entrega || 'pendente';
  const itemsPreview = (order.itens || []).map((item) => {
    const productName = item.produto?.nome_doce || `Produto ${item.produto_id}`;
    return `
      <span class="crm-order-item-chip">
        ${escapeHtml(`${item.quantidade}x ${productName}`)}
      </span>
    `;
  }).join('');
  const itemsCount = (order.itens || []).reduce((acc, item) => acc + Number(item.quantidade || 0), 0);

  return `
    <article class="crm-order-card">
      <header class="crm-order-card-head">
        <div>
          <strong>Pedido #${order.id}</strong>
          <small>${dateTime(order.criado_em)}</small>
        </div>
        <div class="crm-order-card-actions">
          <span class="status-chip status-${status}">${STATUS_LABELS[status] || status}</span>
          ${paymentChipMarkup(order.status_pagamento)}
          <button type="button" class="ghost-btn crm-order-link" data-open-order="${order.id}">Abrir pedido</button>
        </div>
      </header>

      <div class="crm-order-summary">
        <span class="crm-order-summary-pill"><b>Total</b>${brl(order.valor_total || 0)}</span>
        <span class="crm-order-summary-pill"><b>Forma de pagamento</b>${escapeHtml(paymentMethodLabel(order.metodo_pagamento))}</span>
        <span class="crm-order-summary-pill"><b>Itens</b>${pluralize(itemsCount, 'item')}</span>
      </div>

      ${itemsPreview ? `<div class="crm-order-products">${itemsPreview}</div>` : ''}
      <p class="crm-order-address">${escapeHtml(formatCompactAddress(order.endereco))}</p>
      ${order.observacoes ? `<p class="crm-order-card-note"><b>Observações:</b> ${escapeHtml(order.observacoes)}</p>` : ''}
    </article>
  `;
}

function renderCustomerDetail(detail = customerDetail, { scroll = false } = {}) {
  if (!accessToken) {
    customerDetailEl.className = 'crm-detail-empty';
    customerDetailEl.innerHTML = '<div class="crm-detail-empty"><p class="muted">Faça login para visualizar o perfil do cliente.</p></div>';
    return;
  }

  if (!detail) {
    customerDetailEl.className = 'crm-detail-empty';
    customerDetailEl.innerHTML = '<div class="crm-detail-empty"><p class="muted">Clique em um cliente da carteira para abrir perfil, endereços e histórico.</p></div>';
    return;
  }

  customerDetailEl.className = '';
  const dedupedAddresses = uniqueAddresses(detail.enderecos || []);

  const favoriteProductsHtml = (detail.favorite_products || []).length
    ? detail.favorite_products
        .map(
          (product) => `
            <li>
              <span>${escapeHtml(product.nome_doce || '--')}</span>
              <strong>${pluralize(Number(product.quantidade || 0), 'unidade')}</strong>
              <small>${brl(product.receita_total || 0)}</small>
            </li>
          `,
        )
        .join('')
    : '<li><span>Nenhum favorito calculado ainda.</span></li>';

  const addressesHtml = dedupedAddresses.length
    ? dedupedAddresses
        .map(
          (endereco, index) => `
            <article class="crm-address-card">
              <small>${index === 0 ? 'Principal' : `Endereço ${index + 1}`}</small>
              <strong>${escapeHtml(formatCompactAddress(endereco))}</strong>
            </article>
          `,
        )
        .join('')
    : '<p class="muted">Nenhum endereço cadastrado.</p>';

  const ordersHtml = (detail.orders || []).length
    ? detail.orders.map(customerDetailOrderCard).join('')
    : '<p class="muted">Nenhum pedido encontrado para este cliente.</p>';

  customerDetailEl.innerHTML = `
    <div class="crm-detail-shell">
      <section class="crm-profile-card">
        <div class="crm-profile-main">
          <div class="crm-profile-copy">
            <h3>${escapeHtml(detail.nome || '--')}</h3>
            <p>${escapeHtml(detail.segment_reason || 'Sem observações estratégicas por enquanto.')}</p>
          </div>
          <div class="crm-profile-badges">
            ${customerSegmentChip(detail)}
          </div>
        </div>

        <div class="crm-profile-facts">
          <article class="crm-profile-fact">
            <small>WhatsApp</small>
            <strong>${escapeHtml(formatPhone(detail.telefone_whatsapp || ''))}</strong>
          </article>
          <article class="crm-profile-fact">
            <small>Cliente desde</small>
            <strong>${dateOnly(detail.criado_em)}</strong>
          </article>
          <article class="crm-profile-fact">
            <small>Pagamento mais usado</small>
            <strong>${escapeHtml(detail.preferred_payment_method || '--')}</strong>
          </article>
          <article class="crm-profile-fact">
            <small>Último pedido</small>
            <strong>${detail.last_order_at ? dateTime(detail.last_order_at) : '--'}</strong>
          </article>
        </div>
      </section>

      <div class="crm-detail-grid">
        <article class="crm-detail-card crm-summary-card">
          <header class="crm-card-head">
            <div>
              <h3>Resumo do cliente</h3>
              <p class="muted">Visão rápida do relacionamento com a loja.</p>
            </div>
          </header>
          <div class="crm-mini-grid">
            <div class="crm-mini-stat">
              <small>Pedidos</small>
              <strong>${Number(detail.total_orders || 0)}</strong>
            </div>
            <div class="crm-mini-stat">
              <small>Faturamento</small>
              <strong>${brl(detail.total_spent || 0)}</strong>
            </div>
            <div class="crm-mini-stat">
              <small>Ticket médio</small>
              <strong>${brl(detail.average_ticket || 0)}</strong>
            </div>
            <div class="crm-mini-stat">
              <small>Recência</small>
              <strong>${escapeHtml(formatDaysSinceLastOrder(detail.days_since_last_order))}</strong>
            </div>
          </div>
        </article>

        <article class="crm-detail-card">
          <h3>Endereços</h3>
          <div class="crm-address-stack">${addressesHtml}</div>
        </article>

        <article class="crm-detail-card">
          <h3>Preferências e favoritos</h3>
          <ul class="crm-product-list">${favoriteProductsHtml}</ul>
        </article>
      </div>

      <section class="crm-detail-card">
        <header class="section-head crm-subhead">
          <div>
            <h3>Histórico de pedidos</h3>
            <p class="muted">Abra um pedido na aba operacional quando precisar atualizar status.</p>
          </div>
        </header>
        <div class="crm-order-history">${ordersHtml}</div>
      </section>
    </div>
  `;
  if (scroll) {
    scrollCustomerDetailIntoView();
  }
}

function renderCustomers() {
  if (!accessToken) {
    customersListEl.innerHTML = '<p class="muted">Faça login para visualizar clientes.</p>';
    customersMetaEl.textContent = 'Faça login para carregar a carteira de clientes.';
    customersListMetaEl.textContent = 'Faça login para carregar clientes.';
    customersPrevBtnEl.disabled = true;
    customersNextBtnEl.disabled = true;
    updateDatalistOptions(customersSearchSuggestionsEl, []);
    renderCustomersSummary();
    return;
  }

  const summary = customerPaginationMeta?.summary || null;
  const total = Number(customerPaginationMeta?.total || 0);
  const totalPages = Number(customerPaginationMeta?.totalPages || 1);
  const page = Number(customerPaginationMeta?.page || customersState.page || 1);
  const pageSize = Number(customerPaginationMeta?.pageSize || customersState.pageSize || 12);
  const filters = customerPaginationMeta?.filters || null;
  const start = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const end = total === 0 ? 0 : Math.min(total, page * pageSize);
  const segmentLabel = getSelectOptionLabel(customersSegmentFilterEl, filters?.segment || customersState.segment);
  const sortLabel = getSelectOptionLabel(customersSortInputEl, filters?.sort || customersState.sort);

  renderCustomersSummary(summary);
  customersMetaEl.textContent = `${total} clientes na carteira · Atividade: ${formatRangeMeta(filters)}`;
  customersListMetaEl.textContent = `${start}-${end} de ${total} · ${pageSize} por visualização · ${segmentLabel} · ${sortLabel}`;
  customersPrevBtnEl.disabled = page <= 1;
  customersNextBtnEl.disabled = page >= totalPages;
  updateDatalistOptions(
    customersSearchSuggestionsEl,
    crmCustomers.map((customer) => ({
      value: customer.nome || formatPhone(customer.telefone_whatsapp || ''),
      label: `${formatPhone(customer.telefone_whatsapp || '')} · ${customer.segment_label || 'Cliente'}`,
    })),
  );

  if (crmCustomers.length === 0) {
    customersListEl.innerHTML = '<p class="muted">Nenhum cliente encontrado para este filtro.</p>';
    return;
  }

  customersListEl.innerHTML = crmCustomers.map(customerCard).join('');
}

function customersQueryString() {
  return buildQueryString({
    page: customersState.page,
    pageSize: customersState.pageSize,
    search: customersState.search,
    segment: customersState.segment,
    sort: customersState.sort,
    ...buildPeriodParams(customersState, 'all'),
  });
}

async function loadCustomerDetail(customerId, { silent = false } = {}) {
  if (!accessToken || !customerId) {
    customerDetail = null;
    renderCustomerDetail();
    return null;
  }

  selectedCustomerId = Number(customerId);
  if (!silent) {
    customerDetailEl.className = 'crm-detail-empty';
    customerDetailEl.innerHTML = '<div class="crm-detail-empty"><p class="muted">Carregando perfil do cliente...</p></div>';
  }

  const response = await fetch(`/admin/customers/${customerId}`, { headers: authHeaders() });
  customerDetail = await parseResponse(response);
  renderCustomers();
  renderCustomerDetail(customerDetail, { scroll: !silent });
  return customerDetail;
}

async function loadCustomers() {
  if (!validateRangeState(customersState, customersStatusEl, 'clientes')) return;

  const query = customersQueryString();
  const response = await fetch(`/admin/customers?${query}`, { headers: authHeaders() });
  const payload = await parseEnvelope(response);
  crmCustomers = Array.isArray(payload.data) ? payload.data : [];
  customerPaginationMeta = payload.meta || null;

  if (customerPaginationMeta && customersState.page > Number(customerPaginationMeta.totalPages || 1)) {
    customersState.page = Number(customerPaginationMeta.totalPages || 1);
    return loadCustomers();
  }

  const customerIds = new Set(crmCustomers.map((customer) => Number(customer.id || 0)));
  if (!selectedCustomerId || !customerIds.has(Number(selectedCustomerId || 0))) {
    selectedCustomerId = null;
    customerDetail = null;
  }

  clearStatus(customersStatusEl);
  renderCustomers();

  if (!selectedCustomerId) {
    renderCustomerDetail();
    return;
  }

  if (Number(customerDetail?.id || 0) === Number(selectedCustomerId || 0)) {
    renderCustomerDetail(customerDetail);
    return;
  }

  await loadCustomerDetail(selectedCustomerId, { silent: true });
}

async function openOrderFromCrm(orderId) {
  if (!orderId) return;

  ordersState.search = `#${orderId}`;
  ordersState.status = 'all';
  ordersState.page = 1;
  updateOrdersControlsFromState();
  navigateToAdminView('pedidos');
  await loadOrders();
}

function orderCard(order) {
  const status = order.status_entrega || 'pendente';
  const paymentStatus = paymentStatusClass(order.status_pagamento);
  const auditExpanded = expandedOrderAuditIds.has(Number(order.id || 0));
  const itensHtml = (order.itens_pedido || [])
    .map((item) => {
      const nome = item.produtos?.nome_doce || `Produto ${item.produto_id}`;
      return `<li>${item.quantidade}x ${escapeHtml(nome)} · ${brl(item.subtotal)}</li>`;
    })
    .join('');

  const statusOptions = STATUS_OPTIONS.map((value) => {
    const selected = value === status ? 'selected' : '';
    return `<option value="${value}" ${selected}>${STATUS_LABELS[value]}</option>`;
  }).join('');
  const paymentStatusOptions = paymentStatusSelectValues(order)
    .map((value) => {
      const selected = value === paymentStatus ? 'selected' : '';
      return `<option value="${value}" ${selected}>${PAYMENT_STATUS_LABELS[value] || value}</option>`;
    })
    .join('');

  return `
    <article class="order-card">
      <header>
        <div>
          <strong>Pedido #${order.id}</strong>
          <small>${dateTime(order.criado_em)}</small>
        </div>
        <div class="order-card-statuses">
          <span class="status-chip status-${status}">${STATUS_LABELS[status] || status}</span>
          ${paymentChipMarkup(order.status_pagamento)}
        </div>
      </header>

    <div class="order-meta">
        <span><b>Cliente:</b> ${escapeHtml(order.clientes?.nome || '--')}</span>
        <span><b>WhatsApp:</b> ${escapeHtml(order.clientes?.telefone_whatsapp || '--')}</span>
        <span><b>Endereço:</b> ${formatAddress(order.enderecos)}</span>
        <span><b>Forma de pagamento:</b> ${escapeHtml(paymentMethodLabel(order.metodo_pagamento))}</span>
        <span><b>Total:</b> ${brl(order.valor_total)}</span>
      </div>

      ${order.observacoes ? `<p class="order-note"><b>Observações:</b> ${escapeHtml(order.observacoes)}</p>` : ''}

      <ul class="order-items">${itensHtml || '<li>Sem itens.</li>'}</ul>

      <footer class="order-actions order-management-actions">
        <label class="order-action-field">
          <span class="order-action-field-label">Status do pedido</span>
          <select data-status-select="${order.id}">${statusOptions}</select>
        </label>
        <label class="order-action-field">
          <span class="order-action-field-label">Pagamento</span>
          <select data-payment-status-select="${order.id}">${paymentStatusOptions}</select>
        </label>
        <div class="order-inline-actions">
          <button type="button" class="primary-btn" data-status-save="${order.id}">Salvar alterações</button>
          <button type="button" class="ghost-btn" data-order-audit-toggle="${order.id}">${auditExpanded ? 'Ocultar histórico' : 'Ver histórico'}</button>
        </div>
      </footer>
      <div id="order-audit-${order.id}" class="order-audit-panel${auditExpanded ? '' : ' hidden'}"></div>
    </article>
  `;
}

function renderOrders() {
  if (!accessToken) {
    ordersListEl.innerHTML = '<p class="muted">Faça login para visualizar pedidos.</p>';
    ordersMetaEl.textContent = 'Faça login para carregar pedidos.';
    updateDatalistOptions(ordersSearchSuggestionsEl, []);
    return;
  }

  const total = Number(ordersPaginationMeta?.total || 0);
  const totalPages = Number(ordersPaginationMeta?.totalPages || 1);
  const page = Number(ordersPaginationMeta?.page || ordersState.page || 1);
  const pageSize = Number(ordersPaginationMeta?.pageSize || ordersState.pageSize || 10);
  const filters = ordersPaginationMeta?.filters || null;
  const start = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const end = total === 0 ? 0 : Math.min(total, page * pageSize);

  ordersMetaEl.textContent = `${start}-${end} de ${total} pedidos · ${formatRangeMeta(filters)}`;
  ordersPrevBtnEl.disabled = page <= 1;
  ordersNextBtnEl.disabled = page >= totalPages;
  updateDatalistOptions(
    ordersSearchSuggestionsEl,
    allOrders.map((order) => ({
      value: `#${order.id}`,
      label: `${order.clientes?.nome || '--'} · ${dateTime(order.criado_em)}`,
    })),
  );

  if (allOrders.length === 0) {
    ordersListEl.innerHTML = '<p class="muted">Nenhum pedido encontrado para este filtro.</p>';
    return;
  }

  ordersListEl.innerHTML = allOrders.map(orderCard).join('');
  hydrateExpandedOrderAudits();
}

async function loadCurrentUser() {
  const response = await fetch('/auth/me', { headers: authHeaders() });
  const data = await parseResponse(response);
  currentUser = data.user;
  applySessionUi();
}

function dashboardQueryString() {
  return buildQueryString({
    ...buildPeriodParams(dashboardFilters, '7d'),
  });
}

async function loadDashboard() {
  if (!validateRangeState(dashboardFilters, dashboardStatusEl, 'resumo')) return;

  const query = dashboardQueryString();
  const response = await fetch(`/admin/dashboard${query ? `?${query}` : ''}`, { headers: authHeaders() });
  const payload = await parseEnvelope(response);
  clearStatus(dashboardStatusEl);
  renderDashboard(payload.data, payload.meta);
}

function ordersQueryString() {
  return buildQueryString({
    page: ordersState.page,
    pageSize: ordersState.pageSize,
    status: ordersState.status,
    search: ordersState.search,
    ...buildPeriodParams(ordersState, 'today'),
  });
}

async function fetchOrderAudit(orderId, { force = false } = {}) {
  const id = Number(orderId || 0);
  if (!id) return [];

  if (!force && orderAuditCache.has(id)) {
    return orderAuditCache.get(id);
  }

  const response = await fetch(`/admin/orders/${id}/audit`, { headers: authHeaders() });
  const items = await parseResponse(response);
  const safeItems = Array.isArray(items) ? items : [];
  orderAuditCache.set(id, safeItems);
  return safeItems;
}

async function ensureOrderAuditVisible(orderId, { force = false } = {}) {
  const id = Number(orderId || 0);
  if (!id || !expandedOrderAuditIds.has(id)) return;

  renderOrderAuditPanelState(id, { loading: true });

  try {
    const items = await fetchOrderAudit(id, { force });
    if (!expandedOrderAuditIds.has(id)) return;
    renderOrderAuditPanelState(id, { items });
  } catch (error) {
    if (!expandedOrderAuditIds.has(id)) return;
    renderOrderAuditPanelState(id, { error: error.message || 'Não foi possível carregar o histórico do pedido.' });
  }
}

function hideOrderAudit(orderId) {
  const id = Number(orderId || 0);
  const panel = document.getElementById(`order-audit-${id}`);
  if (!panel) return;
  panel.classList.add('hidden');
  panel.innerHTML = '';
}

function hydrateExpandedOrderAudits() {
  expandedOrderAuditIds.forEach((orderId) => {
    ensureOrderAuditVisible(orderId).catch((error) => {
      renderOrderAuditPanelState(orderId, { error: error.message || 'Não foi possível carregar o histórico do pedido.' });
    });
  });
}

async function loadOrders() {
  if (!validateRangeState(ordersState, ordersStatusEl, 'pedidos')) return;

  const query = ordersQueryString();
  const response = await fetch(`/admin/orders?${query}`, { headers: authHeaders() });
  const payload = await parseEnvelope(response);
  allOrders = Array.isArray(payload.data) ? payload.data : [];
  ordersPaginationMeta = payload.meta || null;

  if (ordersPaginationMeta && ordersState.page > Number(ordersPaginationMeta.totalPages || 1)) {
    ordersState.page = Number(ordersPaginationMeta.totalPages || 1);
    return loadOrders();
  }

  clearStatus(ordersStatusEl);
  renderOrders();
}

function renderSettingsOverview() {
  const config = currentStoreSettings || null;
  const activeFees = deliveryFees.filter((fee) => fee?.ativo !== false);
  const schedule = config?.horario_funcionamento || {};
  const enabledDays = STORE_HOURS_DAY_KEYS.filter((dayKey) => Boolean(schedule?.[dayKey]?.enabled)).length;

  if (settingsOverviewStoreEl) {
    settingsOverviewStoreEl.textContent = !config
      ? 'Aguardando'
      : (config.loja_aberta_agora ? 'Loja aberta' : 'Loja fechada');
  }

  if (settingsOverviewStoreMetaEl) {
    settingsOverviewStoreMetaEl.textContent = !config
      ? 'Carregando status da operação.'
      : (config.loja_status_descricao || 'Status da loja indisponível.');
  }

  if (settingsOverviewHoursEl) {
    settingsOverviewHoursEl.textContent = !config
      ? 'Aguardando'
      : (config.horario_automatico_ativo ? 'Automático ativo' : 'Automático desligado');
  }

  if (settingsOverviewHoursMetaEl) {
    settingsOverviewHoursMetaEl.textContent = !config
      ? 'Agenda semanal ainda não consultada.'
      : `${enabledDays} dia(s) configurado(s) na semana.`;
  }

  if (settingsOverviewWhatsAppEl) {
    settingsOverviewWhatsAppEl.textContent = !config
      ? 'Aguardando'
      : (config.whatsapp_bot_pausado
        ? 'Bot pausado'
        : (config.whatsapp_ativo ? 'Automação ativa' : 'Automação desligada'));
  }

  if (settingsOverviewWhatsAppMetaEl) {
    settingsOverviewWhatsAppMetaEl.textContent = !config
      ? 'Bot e automações ainda não consultados.'
      : (config.whatsapp_bot_pausado
        ? 'O bot não responde mensagens nem envia automações.'
        : (config.whatsapp_ativo
          ? 'Novo pedido e atualização de status estão ligados.'
          : 'Mensagens automáticas estão desligadas.'));
  }

  if (settingsOverviewFeesEl) {
    settingsOverviewFeesEl.textContent = `${deliveryFees.length} taxa(s)`;
  }

  if (settingsOverviewFeesMetaEl) {
    settingsOverviewFeesMetaEl.textContent = `${activeFees.length} ativa(s) para cálculo da entrega.`;
  }
}

function defaultStoreHoursSchedule() {
  return STORE_HOURS_DAY_KEYS.reduce((acc, dayKey) => {
    acc[dayKey] = {
      enabled: false,
      open: '09:00',
      close: '18:00',
    };
    return acc;
  }, {});
}

function readStoreHoursScheduleFromForm() {
  return STORE_HOURS_DAY_KEYS.reduce((acc, dayKey) => {
    const inputs = storeHoursDayInputs[dayKey] || {};
    acc[dayKey] = {
      enabled: Boolean(inputs.enabled?.checked),
      open: String(inputs.open?.value || '09:00'),
      close: String(inputs.close?.value || '18:00'),
    };
    return acc;
  }, {});
}

function syncStoreHoursInputsState() {
  STORE_HOURS_DAY_KEYS.forEach((dayKey) => {
    const inputs = storeHoursDayInputs[dayKey];
    if (!inputs) return;

    const enabled = Boolean(inputs.enabled?.checked);
    if (inputs.open) inputs.open.disabled = !enabled;
    if (inputs.close) inputs.close.disabled = !enabled;
    inputs.row?.classList.toggle('is-disabled', !enabled);
  });
}

function renderStoreHoursStatus(config = {}) {
  if (storeHoursStatusMetaEl) {
    storeHoursStatusMetaEl.textContent = config.loja_aberta_agora
      ? 'Loja aberta agora'
      : 'Loja fechada agora';
  }

  if (storeHoursTimezoneMetaEl) {
    storeHoursTimezoneMetaEl.textContent = `Fuso da loja: ${config.horario_timezone || 'America/Sao_Paulo'}`;
  }

  if (storeHoursStatusEl) {
    const automatic = Boolean(config.horario_automatico_ativo);
    const openNow = Boolean(config.loja_aberta_agora);
    storeHoursStatusEl.className = `status-text ${openNow ? 'ok' : 'muted'}`;
    storeHoursStatusEl.textContent = automatic
      ? (config.loja_status_descricao || 'Horario automatico ativo.')
      : 'Horario automatico desligado. A loja segue apenas o controle manual acima.';
  }
}

function applyStoreHoursConfig(config = {}) {
  const schedule = config?.horario_funcionamento || defaultStoreHoursSchedule();

  settingsFormEl.elements.horario_automatico_ativo.checked = Boolean(config.horario_automatico_ativo);

  STORE_HOURS_DAY_KEYS.forEach((dayKey) => {
    const inputs = storeHoursDayInputs[dayKey];
    const current = schedule[dayKey] || {};
    if (!inputs) return;

    if (inputs.enabled) inputs.enabled.checked = Boolean(current.enabled);
    if (inputs.open) inputs.open.value = String(current.open || '09:00');
    if (inputs.close) inputs.close.value = String(current.close || '18:00');
  });

  syncStoreHoursInputsState();
  renderStoreHoursStatus(config);
}

async function loadStoreSettings() {
  const response = await fetch('/admin/store-settings', { headers: authHeaders() });
  const config = await parseResponse(response);
  currentStoreSettings = config;

  settingsFormEl.elements.loja_aberta.checked = Boolean(config.loja_aberta);
  applyStoreHoursConfig(config);
  settingsFormEl.elements.tempo_entrega_minutos.value = Number(config.tempo_entrega_minutos || 40);
  settingsFormEl.elements.tempo_entrega_max_minutos.value = Number(config.tempo_entrega_max_minutos || 60);
  settingsFormEl.elements.mensagem_aviso.value = config.mensagem_aviso || '';
  settingsFormEl.elements.whatsapp_ativo.checked = Boolean(config.whatsapp_ativo);
  settingsFormEl.elements.whatsapp_bot_pausado.checked = Boolean(config.whatsapp_bot_pausado);
  settingsFormEl.elements.whatsapp_webhook_url.value = config.whatsapp_webhook_url || '';
  settingsFormEl.elements.whatsapp_webhook_secret.value = config.whatsapp_webhook_secret || '';
  settingsFormEl.elements.whatsapp_mensagem_novo_pedido.value = config.whatsapp_mensagem_novo_pedido || '';
  settingsFormEl.elements.whatsapp_mensagem_status.value = config.whatsapp_mensagem_status || '';
  renderWhatsAppBotPauseState(config.whatsapp_bot_pausado);
  renderSettingsOverview();
  clearStatus(whatsappTestStatusEl);
  return config;
}

function renderWhatsAppBotPauseState(isPaused) {
  const paused = Boolean(isPaused);
  settingsFormEl.elements.whatsapp_bot_pausado.checked = paused;
  whatsappBotPauseBtnEl.textContent = paused ? 'Retomar bot' : 'Pausar bot';
  whatsappBotPauseMetaEl.textContent = paused
    ? 'Bot pausado no admin.'
    : 'Bot em funcionamento normal.';
  whatsappBotPauseStatusEl.className = 'status-text muted';
  whatsappBotPauseStatusEl.textContent = paused
    ? 'As respostas e automações do WhatsApp estão pausadas até você retomar.'
    : 'O bot responde normalmente e segue as demais configurações salvas.';
}

function describeWhatsAppSessionState(data) {
  const configured = Boolean(data?.configured);
  const raw = data?.raw || {};
  const sourceValue = raw?.status ?? raw?.state ?? raw?.response ?? raw?.message ?? null;
  const normalized = String(sourceValue ?? '').trim().toUpperCase();

  if (!configured) {
    return 'WPPConnect nao configurado no servidor.';
  }

  if (normalized === 'CONNECTED') {
    return 'Conectado e pronto para enviar mensagens.';
  }

  if (normalized === 'CLOSED' || normalized === 'DISCONNECTED' || normalized === 'FALSE') {
    return 'Desconectado. Inicie a sessao e leia o QR Code para conectar o numero.';
  }

  if (normalized.includes('QRCODE') || normalized.includes('QR')) {
    return 'Aguardando leitura do QR Code.';
  }

  if (normalized.includes('START') || normalized.includes('OPEN') || normalized.includes('INIT')) {
    return 'Sessao em inicializacao no WPPConnect.';
  }

  if (sourceValue) {
    return String(sourceValue);
  }

  return 'WPPConnect configurado.';
}

function renderWhatsAppSessionState(data) {
  const configured = Boolean(data?.configured);
  const webhookUrl = data?.webhook_url || null;
  const connectedState = describeWhatsAppSessionState(data);

  whatsappSessionMetaEl.textContent = webhookUrl
    ? `${connectedState}${configured ? ` Webhook interno: ${webhookUrl}` : ''}`
    : String(connectedState);
}

async function loadWhatsAppSessionStatus() {
  const response = await fetch('/admin/whatsapp/session/status', { headers: authHeaders() });
  const data = await parseResponse(response);
  renderWhatsAppSessionState(data);
  return data;
}

async function loadWhatsAppQrCode() {
  const response = await fetch('/admin/whatsapp/session/qrcode', { headers: authHeaders() });
  const data = await parseResponse(response);
  renderWhatsAppSessionState(data);

  if (data?.qrCodeDataUrl) {
    whatsappQrPreviewEl.src = data.qrCodeDataUrl;
    whatsappQrPreviewEl.classList.remove('hidden');
  } else {
    whatsappQrPreviewEl.removeAttribute('src');
    whatsappQrPreviewEl.classList.add('hidden');
  }

  return data;
}

function deliveryFeeScopeLabel(fee) {
  const bairro = String(fee?.bairro || '').trim();
  const cidade = String(fee?.cidade || '').trim();
  if (bairro && cidade) return `${bairro} - ${cidade}`;
  if (bairro) return bairro;
  if (cidade) return `${cidade} (cidade inteira)`;
  return 'Local não informado';
}

function resetDeliveryFeeForm() {
  deliveryFeeIdEl.value = '';
  deliveryFeeBairroEl.value = '';
  deliveryFeeCidadeEl.value = '';
  deliveryFeeValorEl.value = '';
  deliveryFeeAtivoEl.value = 'true';
  deliveryFeeSubmitBtnEl.textContent = 'Salvar taxa';
  setStatus(deliveryFeeStatusEl, '', 'muted');
}

function populateDeliveryFeeForm(fee) {
  deliveryFeeIdEl.value = String(fee.id || '');
  deliveryFeeBairroEl.value = fee.bairro || '';
  deliveryFeeCidadeEl.value = fee.cidade || '';
  deliveryFeeValorEl.value = fee.valor_entrega != null ? String(fee.valor_entrega) : '';
  deliveryFeeAtivoEl.value = fee.ativo === false ? 'false' : 'true';
  deliveryFeeSubmitBtnEl.textContent = 'Atualizar taxa';
  setStatus(deliveryFeeStatusEl, `Editando ${deliveryFeeScopeLabel(fee)}.`, 'muted');
}

function renderDeliveryFeeList() {
  const search = String(deliveryFeeSearchInputEl?.value || '').trim().toLowerCase();

  const filteredFees = [...deliveryFees]
    .filter((fee) => {
      const scope = deliveryFeeScopeLabel(fee).toLowerCase();
      return !search || scope.includes(search);
    })
    .sort((a, b) => {
      const scopeA = deliveryFeeScopeLabel(a);
      const scopeB = deliveryFeeScopeLabel(b);
      return scopeA.localeCompare(scopeB, 'pt-BR', { sensitivity: 'base' });
    });

  if (!accessToken) {
    deliveryFeeListEl.innerHTML = '<p class="muted">Faça login para gerenciar taxas de entrega.</p>';
    return;
  }

  if (filteredFees.length === 0) {
    deliveryFeeListEl.innerHTML = search
      ? '<p class="muted">Nenhuma taxa corresponde ao filtro.</p>'
      : '<p class="muted">Nenhuma taxa cadastrada.</p>';
    return;
  }

  deliveryFeeListEl.innerHTML = filteredFees
    .map((fee) => `
      <article class="menu-admin-item">
        <div class="menu-admin-item-main">
          <strong>${escapeHtml(deliveryFeeScopeLabel(fee))}</strong>
          <span>Valor: ${brl(fee.valor_entrega)}</span>
          <span>Status: ${fee.ativo === false ? 'Inativa' : 'Ativa'}</span>
        </div>
        <div class="menu-admin-item-actions">
          <button type="button" class="ghost-btn" data-delivery-fee-edit="${fee.id}">Editar</button>
          <button type="button" class="ghost-btn" data-delivery-fee-delete="${fee.id}">Excluir</button>
        </div>
      </article>
    `)
    .join('');
}

function renderCategoryMeta() {
  if (!accessToken) {
    categoryMetaEl.textContent = 'Faça login para carregar categorias.';
    categoryPrevBtnEl.disabled = true;
    categoryNextBtnEl.disabled = true;
    return;
  }

  const total = Number(categoryPaginationMeta?.total || 0);
  const totalPages = Number(categoryPaginationMeta?.totalPages || 1);
  const page = Number(categoryPaginationMeta?.page || categoryState.page || 1);
  const pageSize = Number(categoryPaginationMeta?.pageSize || categoryState.pageSize || 10);
  const start = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const end = total === 0 ? 0 : Math.min(total, page * pageSize);

  categoryMetaEl.textContent = `${start}-${end} de ${total} categorias`;
  categoryPrevBtnEl.disabled = page <= 1;
  categoryNextBtnEl.disabled = page >= totalPages;
}

async function loadDeliveryFees() {
  const response = await fetch('/admin/delivery-fees', { headers: authHeaders() });
  deliveryFees = await parseResponse(response);
  renderDeliveryFeeList();
  renderSettingsOverview();
}

async function removeDeliveryFee(id) {
  const fee = deliveryFees.find((item) => item.id === id);
  const label = fee ? deliveryFeeScopeLabel(fee) : `#${id}`;
  if (!confirm(`Deseja excluir a taxa de entrega de ${label}?`)) return;

  try {
    const response = await fetch(`/admin/delivery-fees/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await parseResponse(response);
    await loadDeliveryFees();
    if (String(deliveryFeeIdEl.value || '') === String(id)) {
      resetDeliveryFeeForm();
    }
    setStatus(deliveryFeeStatusEl, 'Taxa removida.', 'ok');
  } catch (error) {
    setStatus(deliveryFeeStatusEl, error.message, 'err');
  }
}

function renderCategoryList() {
  if (!accessToken) {
    categoryListEl.innerHTML = '<p class="muted">Faça login para gerenciar categorias.</p>';
    updateDatalistOptions(categorySearchSuggestionsEl, []);
    renderCategoryMeta();
    return;
  }

  updateDatalistOptions(
    categorySearchSuggestionsEl,
    menuCategorias.map((categoria) => ({
      value: categoria.nome,
      label: `${Number(categoria._count?.produtos || 0)} item(ns)`,
    })),
  );

  if (menuCategorias.length === 0) {
    const semBusca = String(categoryState.search || '').trim();
    categoryListEl.innerHTML = semBusca
      ? '<p class="muted">Nenhuma categoria corresponde ao filtro.</p>'
      : '<p class="muted">Nenhuma categoria cadastrada.</p>';
    renderCategoryMeta();
    return;
  }

  categoryListEl.innerHTML = menuCategorias
    .map((categoria) => `
      <article class="menu-admin-item">
        <div class="menu-admin-item-main">
          <strong>${escapeHtml(categoria.nome)}</strong>
          <span>ID: ${categoria.id}</span>
          <span>Ordem: ${categoria.ordem_exibicao || 0}</span>
          <span>Itens vinculados: ${Number(categoria._count?.produtos || 0)}</span>
        </div>
        <div class="menu-admin-item-actions">
          <button type="button" class="ghost-btn" data-category-edit="${categoria.id}">Editar</button>
          <button type="button" class="ghost-btn" data-category-delete="${categoria.id}">Excluir</button>
        </div>
      </article>
    `)
    .join('');

  renderCategoryMeta();
}

function renderCatalogOverview() {
  const totalCategorias = allCategorias.length;
  const totalItens = allMenuProdutos.length;
  const disponiveis = allMenuProdutos.filter((produto) => isProdutoDisponivel(produto)).length;
  const semEstoque = allMenuProdutos.filter((produto) => {
    const estoque = normalizeEstoque(produto.estoque_disponivel);
    return estoque !== null && estoque <= 0;
  }).length;

  if (catalogOverviewCategoriasEl) {
    catalogOverviewCategoriasEl.textContent = accessToken ? String(totalCategorias) : 'Aguardando';
  }
  if (catalogOverviewCategoriasMetaEl) {
    catalogOverviewCategoriasMetaEl.textContent = accessToken
      ? (totalCategorias === 0 ? 'Nenhuma categoria cadastrada.' : 'Grupos que organizam a vitrine da loja.')
      : 'Carregando grupos do cardápio.';
  }
  if (catalogOverviewItensEl) {
    catalogOverviewItensEl.textContent = accessToken ? String(totalItens) : 'Aguardando';
  }
  if (catalogOverviewItensMetaEl) {
    catalogOverviewItensMetaEl.textContent = accessToken
      ? (totalItens === 0 ? 'Nenhum item cadastrado ainda.' : 'Itens totais presentes no catálogo.')
      : 'Resumo dos produtos cadastrados.';
  }
  if (catalogOverviewDisponiveisEl) {
    catalogOverviewDisponiveisEl.textContent = accessToken ? String(disponiveis) : 'Aguardando';
  }
  if (catalogOverviewDisponiveisMetaEl) {
    catalogOverviewDisponiveisMetaEl.textContent = accessToken
      ? `${Math.max(totalItens - disponiveis, 0)} item(ns) exigem alguma ação.`
      : 'Itens prontos para venda.';
  }
  if (catalogOverviewSemEstoqueEl) {
    catalogOverviewSemEstoqueEl.textContent = accessToken ? String(semEstoque) : 'Aguardando';
  }
  if (catalogOverviewSemEstoqueMetaEl) {
    catalogOverviewSemEstoqueMetaEl.textContent = accessToken
      ? (semEstoque === 0 ? 'Nenhum item com estoque zerado.' : 'Itens sem saldo ou que precisam de revisão.')
      : 'Itens que exigem reposição ou revisão.';
  }
}

function renderCatalogPortal() {
  if (!catalogPortalListEl || !catalogPortalMetaEl) return;

  if (!accessToken) {
    catalogPortalMetaEl.textContent = 'Faça login para carregar o cardápio.';
    catalogPortalListEl.innerHTML = '<div class="catalog-admin-preview-empty"><p class="muted">Faça login para visualizar a vitrine do cardápio.</p></div>';
    updateDatalistOptions(catalogPortalSearchSuggestionsEl, []);
    return;
  }

  updateDatalistOptions(
    catalogPortalSearchSuggestionsEl,
    allMenuProdutos.map((produto) => ({
      value: produto.nome_doce,
      label: `${productCategoryName(produto.categoria_id || produto.categorias?.id)} · ${brl(produto.preco)}`,
    })),
  );

  if (allCategorias.length === 0) {
    catalogPortalMetaEl.textContent = 'Nenhuma categoria cadastrada.';
    catalogPortalListEl.innerHTML = '<div class="catalog-admin-preview-empty"><p class="muted">Cadastre a primeira categoria para começar a montar o cardápio.</p></div>';
    return;
  }

  const selectedCategoryId = String(catalogPortalState.categoria_id || 'all');
  const normalizedCategoryId = allCategorias.some((categoria) => String(categoria.id) === selectedCategoryId)
    ? selectedCategoryId
    : 'all';
  const search = String(catalogPortalState.search || '').trim().toLowerCase();

  if (normalizedCategoryId !== selectedCategoryId) {
    catalogPortalState.categoria_id = normalizedCategoryId;
    if (catalogPortalCategoryFilterEl) {
      catalogPortalCategoryFilterEl.value = normalizedCategoryId;
    }
  }

  const visibleCategorias = [...allCategorias]
    .sort((a, b) => {
      const ordemA = Number(a.ordem_exibicao || 0);
      const ordemB = Number(b.ordem_exibicao || 0);
      if (ordemA !== ordemB) return ordemA - ordemB;
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' });
    })
    .filter((categoria) => normalizedCategoryId === 'all' || String(categoria.id) === normalizedCategoryId);

  const groupedCategorias = visibleCategorias.map((categoria) => {
    const produtos = allMenuProdutos
      .filter((produto) => {
        const categoriaId = String(produto.categoria_id || produto.categorias?.id || '');
        if (categoriaId !== String(categoria.id)) return false;

        if (!search) return true;

        const haystack = [
          produto.nome_doce,
          produto.descricao,
          categoria.nome,
        ].join(' ').toLowerCase();

        return haystack.includes(search);
      })
      .sort((a, b) => String(a.nome_doce || '').localeCompare(String(b.nome_doce || ''), 'pt-BR', { sensitivity: 'base' }));

    return { categoria, produtos };
  });

  const categoriesWithProducts = normalizedCategoryId === 'all'
    ? groupedCategorias.filter((group) => group.produtos.length > 0)
    : groupedCategorias;

  const totalVisibleItems = categoriesWithProducts.reduce((total, group) => total + group.produtos.length, 0);
  const selectedCategoryName = normalizedCategoryId === 'all'
    ? 'todo o cardápio'
    : productCategoryName(Number(normalizedCategoryId));

  catalogPortalMetaEl.textContent = search
    ? `${totalVisibleItems} item(ns) encontrados em ${categoriesWithProducts.length} categoria(s).`
    : `${totalVisibleItems} item(ns) exibidos em ${categoriesWithProducts.length} categoria(s) de ${selectedCategoryName}.`;

  if (categoriesWithProducts.length === 0) {
    const message = search
      ? 'Nenhum item corresponde à busca informada.'
      : 'Nenhum item cadastrado para o filtro selecionado.';
    catalogPortalListEl.innerHTML = `<div class="catalog-admin-preview-empty"><p class="muted">${message}</p></div>`;
    return;
  }

  catalogPortalListEl.innerHTML = categoriesWithProducts
    .map(({ categoria, produtos }) => `
      <article class="catalog-admin-category-card">
        <header class="catalog-admin-category-head">
          <div class="catalog-admin-category-title">
            <h4>${escapeHtml(categoria.nome)}</h4>
            <p>${produtos.length} item(ns) ${categoria.ordem_exibicao != null ? `· Ordem ${Number(categoria.ordem_exibicao || 0)}` : ''}</p>
          </div>
          <button type="button" class="ghost-btn" data-catalog-quick-category="${categoria.id}">Editar categoria</button>
        </header>

        ${produtos.length > 0
          ? `<div class="catalog-admin-category-products">${produtos.map((produto) => {
            const estoque = normalizeEstoque(produto.estoque_disponivel);
            const disponibilidadeClasse = isProdutoDisponivel(produto) ? 'is-live' : 'is-off';
            const disponibilidadeTexto = availabilityLabel(produto);
            const estoqueTexto = estoque === null ? 'Sem limite de estoque' : (estoque <= 0 ? 'Estoque zerado' : `Estoque ${estoque}`);
            const media = produto.imagem_url
              ? `<img src="${escapeHtml(produto.imagem_url)}" alt="${escapeHtml(produto.nome_doce)}" loading="lazy" />`
              : `<div class="catalog-admin-product-media-fallback">${escapeHtml(String(produto.nome_doce || '?').slice(0, 1).toUpperCase())}</div>`;

            return `
              <article class="catalog-admin-product-card">
                <div class="catalog-admin-product-main">
                  <div class="catalog-admin-product-media">${media}</div>
                  <div class="catalog-admin-product-copy">
                    <div class="catalog-admin-product-head">
                      <strong>${escapeHtml(produto.nome_doce)}</strong>
                      <span class="catalog-admin-product-price">${brl(produto.preco)}</span>
                    </div>
                    <p class="catalog-admin-product-description">${escapeHtml(produto.descricao || 'Sem descrição cadastrada.')}</p>
                    <div class="catalog-admin-product-tags">
                      <span class="catalog-admin-product-tag ${disponibilidadeClasse}">${escapeHtml(disponibilidadeTexto)}</span>
                      <span class="catalog-admin-product-tag is-stock">${escapeHtml(estoqueTexto)}</span>
                    </div>
                  </div>
                </div>
                <div class="catalog-admin-product-actions">
                  <button type="button" class="ghost-btn" data-catalog-quick-product="${produto.id}">Editar item</button>
                </div>
              </article>
            `;
          }).join('')}</div>`
          : '<div class="catalog-admin-preview-empty"><p class="muted">Nenhum item nesta categoria.</p></div>'}
      </article>
    `)
    .join('');
}

function renderProdutoMeta() {
  if (!accessToken) {
    produtoMetaEl.textContent = 'Faça login para carregar itens.';
    produtoPrevBtnEl.disabled = true;
    produtoNextBtnEl.disabled = true;
    return;
  }

  const total = Number(produtoPaginationMeta?.total || 0);
  const totalPages = Number(produtoPaginationMeta?.totalPages || 1);
  const page = Number(produtoPaginationMeta?.page || produtoState.page || 1);
  const pageSize = Number(produtoPaginationMeta?.pageSize || produtoState.pageSize || 12);
  const start = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const end = total === 0 ? 0 : Math.min(total, page * pageSize);

  produtoMetaEl.textContent = `${start}-${end} de ${total} itens`;
  produtoPrevBtnEl.disabled = page <= 1;
  produtoNextBtnEl.disabled = page >= totalPages;
}

function renderProdutoList() {
  if (!accessToken) {
    produtoListEl.innerHTML = '<p class="muted">Faça login para gerenciar itens.</p>';
    updateDatalistOptions(produtoSearchSuggestionsEl, []);
    renderProdutoMeta();
    return;
  }

  updateDatalistOptions(
    produtoSearchSuggestionsEl,
    menuProdutos.map((produto) => ({
      value: produto.nome_doce,
      label: `${productCategoryName(produto.categoria_id || produto.categorias?.id)} · ${brl(produto.preco)}`,
    })),
  );

  if (menuProdutos.length === 0) {
    const semBusca = String(produtoState.search || '').trim();
    const semFiltro = semBusca || produtoState.disponibilidade !== 'all' || produtoState.categoria_id !== 'all';
    produtoListEl.innerHTML = semFiltro
      ? '<p class="muted">Nenhum item corresponde ao filtro.</p>'
      : '<p class="muted">Nenhum item cadastrado.</p>';
    renderProdutoMeta();
    return;
  }

  produtoListEl.innerHTML = menuProdutos
    .map((produto) => {
      const estoque = normalizeEstoque(produto.estoque_disponivel);
      const estoqueTexto = estoque === null ? 'Sem limite' : String(estoque);
      return `
        <article class="menu-admin-item">
          <div class="menu-admin-item-main">
            <strong>${escapeHtml(produto.nome_doce)}</strong>
            <span>${escapeHtml(productCategoryName(produto.categoria_id || produto.categorias?.id))}</span>
            <span>Preço: ${brl(produto.preco)} | Estoque: ${estoqueTexto} | Disponível: ${availabilityLabel(produto)}</span>
          </div>
          <div class="menu-admin-item-actions">
            <button type="button" class="ghost-btn" data-produto-edit="${produto.id}">Editar</button>
            <button type="button" class="ghost-btn" data-produto-delete="${produto.id}">Excluir</button>
          </div>
        </article>
      `;
    })
    .join('');

  renderProdutoMeta();
}

async function loadCategoryOptions() {
  const collectedCategorias = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const query = buildQueryString({
      sort: 'ordem_exibicao',
      order: 'asc',
      page,
      pageSize: 100,
    });

    const response = await fetch(`/categorias?${query}`, {
      headers: authHeaders(),
    });
    const payload = await parseEnvelope(response);
    const items = Array.isArray(payload.data) ? payload.data : [];

    collectedCategorias.push(...items);
    totalPages = Number(payload.meta?.totalPages || 1);
    page += 1;
  }

  allCategorias = collectedCategorias;
  const currentCategoryId = produtoCategoriaEl.value;
  populateCategoriaOptions(currentCategoryId);
  populateProdutoCategoriaFilterOptions();
  populateCatalogPortalCategoryFilterOptions();
  renderCatalogOverview();
  renderCatalogPortal();
}

function categoriasQueryString() {
  return buildQueryString({
    sort: categoryState.sort,
    order: 'asc',
    page: categoryState.page,
    pageSize: categoryState.pageSize,
    search: categoryState.search,
  });
}

async function loadCategorias() {
  const response = await fetch(`/categorias?${categoriasQueryString()}`, {
    headers: authHeaders(),
  });
  const payload = await parseEnvelope(response);
  menuCategorias = Array.isArray(payload.data) ? payload.data : [];
  categoryPaginationMeta = payload.meta || null;

  if (categoryPaginationMeta && categoryState.page > Number(categoryPaginationMeta.totalPages || 1)) {
    categoryState.page = Number(categoryPaginationMeta.totalPages || 1);
    return loadCategorias();
  }

  renderCategoryList();
}

function produtosQueryString() {
  return buildQueryString({
    sort: produtoState.sort,
    order: produtoState.sort === 'preco' || produtoState.sort === 'estoque_disponivel' ? 'asc' : 'asc',
    page: produtoState.page,
    pageSize: produtoState.pageSize,
    search: produtoState.search,
    disponibilidade: produtoState.disponibilidade,
    categoria_id: produtoState.categoria_id !== 'all' ? produtoState.categoria_id : undefined,
  });
}

async function loadProdutos() {
  const response = await fetch(`/produtos?${produtosQueryString()}`, {
    headers: authHeaders(),
  });
  const payload = await parseEnvelope(response);
  menuProdutos = Array.isArray(payload.data) ? payload.data : [];
  produtoPaginationMeta = payload.meta || null;

  if (produtoPaginationMeta && produtoState.page > Number(produtoPaginationMeta.totalPages || 1)) {
    produtoState.page = Number(produtoPaginationMeta.totalPages || 1);
    return loadProdutos();
  }

  renderProdutoList();
}

async function loadCatalogPortalProdutos() {
  const collectedProdutos = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const query = buildQueryString({
      sort: 'nome_doce',
      order: 'asc',
      page,
      pageSize: 100,
    });

    const response = await fetch(`/produtos?${query}`, {
      headers: authHeaders(),
    });
    const payload = await parseEnvelope(response);
    const items = Array.isArray(payload.data) ? payload.data : [];

    collectedProdutos.push(...items);
    totalPages = Number(payload.meta?.totalPages || 1);
    page += 1;
  }

  allMenuProdutos = collectedProdutos;
  renderCatalogOverview();
  renderCatalogPortal();
}

async function loadCardapioData() {
  await loadCategoryOptions();
  await Promise.all([loadCategorias(), loadProdutos(), loadCatalogPortalProdutos()]);
}

function populateProdutoForm(produto) {
  produtoIdEl.value = produto.id;
  produtoSubmitBtn.textContent = 'Atualizar item';
  produtoCategoriaEl.value = String(produto.categoria_id || produto.categorias?.id || '');
  produtoNomeEl.value = produto.nome_doce || '';
  produtoDescricaoEl.value = produto.descricao || '';
  produtoPrecoEl.value = produto.preco != null ? String(produto.preco) : '';
  produtoEstoqueEl.value = produto.estoque_disponivel == null ? '' : String(produto.estoque_disponivel);
  produtoAtivoEl.checked = Boolean(produto.ativo);
  produtoImagemEl.value = '';
  produtoClearImagemEl.checked = false;
  produtoImagemDataUrl = '';
  buildImagePreview(produto.imagem_url);
}

function startCategoriaEdit(categoria) {
  categoryIdEl.value = categoria.id;
  categoryNomeEl.value = categoria.nome || '';
  categoryOrdemEl.value = categoria.ordem_exibicao == null ? '' : String(categoria.ordem_exibicao);
  categorySubmitBtn.textContent = 'Atualizar categoria';
  categoryStatusEl.textContent = '';
}

async function removeCategoria(categoriaId) {
  const categoria = menuCategorias.find((item) => item.id === categoriaId);
  const vinculados = Number(categoria?._count?.produtos || 0);
  const nome = categoria?.nome ? `"${categoria.nome}" ` : '';
  if (vinculados > 0) {
    setStatus(
      categoryStatusEl,
      `A categoria ${nome}não pode ser excluída: ela possui ${vinculados} item(s) vinculado(s).`,
      'err',
    );
    return;
  }

  const message = `Deseja excluir essa categoria ${nome.trim()}?`;
  if (!confirm(message)) return;

  try {
    await fetch(`/categorias/${categoriaId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).then(async (response) => parseResponse(response));

    await loadCardapioData();
    setStatus(categoryStatusEl, 'Categoria removida.', 'ok');
  } catch (error) {
    setStatus(categoryStatusEl, error.message, 'err');
  }
}

async function removeProduto(produtoId) {
  if (!confirm('Deseja excluir esse item do cardápio?')) return;
  try {
    const response = await fetch(`/produtos/${produtoId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const result = await parseResponse(response);
    await loadCardapioData();
    setStatus(
      produtoStatusEl,
      result?.deactivated
        ? 'Item vinculado a pedidos antigos. Ele foi marcado como indisponível para preservar o histórico.'
        : 'Item removido.',
      'ok',
    );
  } catch (error) {
    setStatus(produtoStatusEl, error.message, 'err');
  }
}

async function loadAdminData() {
  if (!accessToken) return;

  try {
    await loadCurrentUser();
    await Promise.all([
      loadDashboard(),
      loadCustomers(),
      loadOrders(),
      loadStoreSettings(),
      loadCardapioData(),
      loadDeliveryFees(),
      loadWhatsAppSessionStatus().catch((error) => {
        setStatus(whatsappSessionStatusEl, error.message, 'muted');
      }),
    ]);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      clearSession();
      setStatus(loginStatusEl, 'Sessão expirada. Faça login novamente.', 'err');
      return;
    }
    setStatus(loginStatusEl, error.message, 'err');
  }
}

loginFormEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(loginStatusEl, 'Entrando...', 'muted');

  const fd = new FormData(loginFormEl);
  const payload = {
    username: String(fd.get('username') || '').trim(),
    password: String(fd.get('password') || ''),
  };

  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await parseResponse(response);
    accessToken = data.accessToken;
    currentUser = data.user;
    localStorage.setItem('donilla_access_token', accessToken);

    applySessionUi();
    setStatus(loginStatusEl, 'Login realizado com sucesso.', 'ok');
    await loadAdminData();
  } catch (error) {
    setStatus(loginStatusEl, error.message, 'err');
  }
});


const state = {
  get accessToken() {
    return accessToken;
  },
  set accessToken(value) {
    accessToken = value;
  },
  get currentUser() {
    return currentUser;
  },
  set currentUser(value) {
    currentUser = value;
  },
  get allOrders() {
    return allOrders;
  },
  set allOrders(value) {
    allOrders = value;
  },
  get crmCustomers() {
    return crmCustomers;
  },
  set crmCustomers(value) {
    crmCustomers = value;
  },
  get customerDetail() {
    return customerDetail;
  },
  set customerDetail(value) {
    customerDetail = value;
  },
  get menuCategorias() {
    return menuCategorias;
  },
  set menuCategorias(value) {
    menuCategorias = value;
  },
  get allCategorias() {
    return allCategorias;
  },
  set allCategorias(value) {
    allCategorias = value;
  },
  get menuProdutos() {
    return menuProdutos;
  },
  set menuProdutos(value) {
    menuProdutos = value;
  },
  get allMenuProdutos() {
    return allMenuProdutos;
  },
  set allMenuProdutos(value) {
    allMenuProdutos = value;
  },
  get deliveryFees() {
    return deliveryFees;
  },
  set deliveryFees(value) {
    deliveryFees = value;
  },
  get produtoImagemDataUrl() {
    return produtoImagemDataUrl;
  },
  set produtoImagemDataUrl(value) {
    produtoImagemDataUrl = value;
  },
  get productImageWebpSupported() {
    return productImageWebpSupported;
  },
  set productImageWebpSupported(value) {
    productImageWebpSupported = value;
  },
  get selectedCustomerId() {
    return selectedCustomerId;
  },
  set selectedCustomerId(value) {
    selectedCustomerId = value;
  },
  get customerPaginationMeta() {
    return customerPaginationMeta;
  },
  set customerPaginationMeta(value) {
    customerPaginationMeta = value;
  },
  get ordersPaginationMeta() {
    return ordersPaginationMeta;
  },
  set ordersPaginationMeta(value) {
    ordersPaginationMeta = value;
  },
  get categoryPaginationMeta() {
    return categoryPaginationMeta;
  },
  set categoryPaginationMeta(value) {
    categoryPaginationMeta = value;
  },
  get produtoPaginationMeta() {
    return produtoPaginationMeta;
  },
  set produtoPaginationMeta(value) {
    produtoPaginationMeta = value;
  },
  dashboardFilters,
  ordersState,
  customersState,
  categoryState,
  produtoState,
  catalogPortalState,
  orderAuditCache,
  expandedOrderAuditIds,
};

const dom = {
  adminLayoutEl,
  loginCardEl,
  loginFormEl,
  loginStatusEl,
  adminTopbarDescriptionEl,
  sessionLabelEl,
  logoutBtnEl,
  adminViewLinks,
  adminPanelViews,
  dashboardRangeMetaEl,
  dashboardStatusEl,
  dashboardRangePresetEl,
  dashboardFromDateEl,
  dashboardToDateEl,
  dashboardApplyBtnEl,
  kpiTotalPedidosEl,
  kpiPendentesEl,
  kpiPreparandoEl,
  kpiEntreguesEl,
  kpiFaturamentoEl,
  ordersMetaEl,
  ordersSearchInputEl,
  ordersSearchSuggestionsEl,
  ordersPanelEl,
  statusFilterEl,
  ordersRangePresetEl,
  ordersFromDateEl,
  ordersToDateEl,
  ordersPageSizeInputEl,
  applyOrdersFiltersBtnEl,
  refreshOrdersBtnEl,
  ordersStatusEl,
  ordersListEl,
  ordersPrevBtnEl,
  ordersNextBtnEl,
  customersMetaEl,
  customersListMetaEl,
  customersSearchInputEl,
  customersSearchSuggestionsEl,
  customersSegmentFilterEl,
  customersSortInputEl,
  customersRangePresetEl,
  customersFromDateEl,
  customersToDateEl,
  customersPageSizeInputEl,
  applyCustomersFiltersBtnEl,
  refreshCustomersBtnEl,
  customersStatusEl,
  customersListEl,
  customersPrevBtnEl,
  customersNextBtnEl,
  customerDetailEl,
  crmTotalCustomersEl,
  crmActiveCustomersEl,
  crmRecurringCustomersEl,
  crmLeadCustomersEl,
  crmRevenueTotalEl,
  settingsFormShellEl,
  settingsFormEl,
  settingsStatusEl,
  storeHoursStatusMetaEl,
  storeHoursTimezoneMetaEl,
  storeHoursStatusEl,
  settingsOverviewStoreEl,
  settingsOverviewStoreMetaEl,
  settingsOverviewHoursEl,
  settingsOverviewHoursMetaEl,
  settingsOverviewWhatsAppEl,
  settingsOverviewWhatsAppMetaEl,
  settingsOverviewFeesEl,
  settingsOverviewFeesMetaEl,
  whatsappSessionStatusBtnEl,
  whatsappSessionStartBtnEl,
  whatsappSessionQrBtnEl,
  whatsappSessionMetaEl,
  whatsappSessionStatusEl,
  whatsappBotPauseBtnEl,
  whatsappBotPauseMetaEl,
  whatsappBotPauseStatusEl,
  whatsappQrPreviewEl,
  whatsappTestPhoneEl,
  whatsappTestBtnEl,
  whatsappTestStatusEl,
  deliveryFeeFormEl,
  deliveryFeeIdEl,
  deliveryFeeBairroEl,
  deliveryFeeCidadeEl,
  deliveryFeeValorEl,
  deliveryFeeAtivoEl,
  deliveryFeeSubmitBtnEl,
  deliveryFeeCancelBtnEl,
  deliveryFeeSearchInputEl,
  deliveryFeeStatusEl,
  deliveryFeeListEl,
  catalogOverviewCategoriasEl,
  catalogOverviewCategoriasMetaEl,
  catalogOverviewItensEl,
  catalogOverviewItensMetaEl,
  catalogOverviewDisponiveisEl,
  catalogOverviewDisponiveisMetaEl,
  catalogOverviewSemEstoqueEl,
  catalogOverviewSemEstoqueMetaEl,
  catalogPortalSearchInputEl,
  catalogPortalSearchSuggestionsEl,
  catalogPortalCategoryFilterEl,
  catalogPortalMetaEl,
  catalogPortalListEl,
  catalogGoToCategoriasBtnEl,
  catalogGoToProdutosBtnEl,
  categoryFormEl,
  categoryIdEl,
  categoryNomeEl,
  categoryOrdemEl,
  categorySubmitBtn,
  categoriaCancelBtn: categoryCancelBtn,
  categoryStatusEl,
  categoryListEl,
  categorySearchInputEl,
  categorySearchSuggestionsEl,
  categorySortInputEl,
  categoryPageSizeInputEl,
  categoryMetaEl,
  categoryPrevBtnEl,
  categoryNextBtnEl,
  produtoFormEl,
  produtoIdEl,
  produtoCategoriaEl,
  produtoNomeEl,
  produtoDescricaoEl,
  produtoPrecoEl,
  produtoEstoqueEl,
  produtoAtivoEl,
  produtoImagemEl,
  produtoClearImagemEl,
  produtoImagemPreviewEl,
  produtoSubmitBtn,
  produtoCancelBtn,
  produtoStatusEl,
  produtoListEl,
  produtoSearchInputEl,
  produtoSearchSuggestionsEl,
  produtoSortInputEl,
  produtoDisponibilidadeFilterEl,
  produtoCategoriaFilterEl,
  produtoPageSizeInputEl,
  produtoMetaEl,
  produtoPrevBtnEl,
  produtoNextBtnEl,
};

const helpers = {
  brl,
  dateTime,
  dateOnly,
  formatPhone,
  pluralize,
  formatDaysSinceLastOrder,
  formatDaysSinceLastOrderCompact,
  formatAddress,
  escapeHtml,
  setStatus,
  clearStatus,
  createDebounce,
  updateDatalistOptions,
  scrollCustomerDetailIntoView,
  authHeaders,
  parseEnvelope,
  parseResponse,
  buildQueryString,
  formatRangeMeta,
  syncRangeInputs,
  validateRangeState,
  compressImageDataUrl,
  buildImagePreview,
};

const api = {
  normalizeAdminView,
  navigateToAdminView,
  syncCustomersStateFromControls,
  syncOrdersStateFromControls,
  updateDashboardControlsFromMeta,
  updateOrdersControlsFromState,
  updateCustomersControlsFromState,
  applySessionUi,
  clearSession,
  loadCurrentUser,
  loadDashboard,
  renderDashboard,
  loadCustomers,
  renderCustomersSummary,
  renderCustomerDetail,
  renderCustomers,
  loadCustomerDetail,
  openOrderFromCrm,
  loadOrders,
  renderOrders,
  ensureOrderAuditVisible,
  hideOrderAudit,
  loadStoreSettings,
  readStoreHoursScheduleFromForm,
  syncStoreHoursInputsState,
  renderStoreHoursStatus,
  renderWhatsAppBotPauseState,
  renderWhatsAppSessionState,
  loadWhatsAppSessionStatus,
  loadWhatsAppQrCode,
  resetDeliveryFeeForm,
  populateDeliveryFeeForm,
  renderDeliveryFeeList,
  loadDeliveryFees,
  removeDeliveryFee,
  populateCategoriaOptions,
  populateProdutoCategoriaFilterOptions,
  populateCatalogPortalCategoryFilterOptions,
  resetCategoriaForm,
  resetProdutoForm,
  loadCategoryOptions,
  loadCategorias,
  loadProdutos,
  loadCatalogPortalProdutos,
  loadCardapioData,
  renderCatalogOverview,
  renderCatalogPortal,
  populateProdutoForm,
  startCategoriaEdit,
  removeCategoria,
  removeProduto,
};

const ctx = { dom, state, helpers, api };

bindNavigationSection(ctx);
bindDashboardSection(ctx);
bindCustomersSection(ctx);
bindOrdersSection(ctx);
bindSettingsSection(ctx);
bindCatalogSection(ctx);


window.addEventListener('popstate', () => {
  syncAdminViewFromLocation();
});

window.addEventListener('hashchange', () => {
  syncAdminViewFromLocation();
});

logoutBtnEl.addEventListener('click', () => {
  clearSession();
  setStatus(loginStatusEl, 'Você saiu da sessão.', 'muted');
});

syncAdminViewFromLocation({ replace: true });
applySessionUi();
syncRangeInputs(dashboardRangePresetEl, dashboardFromDateEl, dashboardToDateEl, dashboardFilters);
syncRangeInputs(customersRangePresetEl, customersFromDateEl, customersToDateEl, customersState);
updateCustomersControlsFromState();
updateOrdersControlsFromState();
renderDashboard();
renderCustomersSummary();
renderCustomerDetail();
renderCustomers();
renderOrders();
resetCategoriaForm();
resetProdutoForm();
resetDeliveryFeeForm();
renderCatalogOverview();
renderCatalogPortal();
renderDeliveryFeeList();
renderSettingsOverview();
syncStoreHoursInputsState();
if (accessToken) {
  loadAdminData();
} else {
  clearSession();
}
