import { bindNavigationSection } from './modules/navigation.js?v=20260331a'
import { bindDashboardSection } from './modules/dashboard.js?v=20260328a'
import { bindRealtimeSection } from './modules/realtime.js?v=20260328b'
import { bindCustomersSection } from './modules/customers.js?v=20260325o'
import { bindOrdersSection } from './modules/orders.js?v=20260328d'
import { bindSettingsSection } from './modules/settings.js?v=20260330a'
import { bindCatalogSection } from './modules/catalog.js?v=20260410a'
import { bindBroadcastSection } from './modules/broadcast.js?v=20260330b'
import { createAdminStore } from './store.js?v=20260410c'
import { createAdminApiClient } from './api.js?v=20260410a'
import { brl, dateTime, dateOnly, formatPhone, escapeHtml } from '../shared/utils.js?v=20260328b'

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
const DASHBOARD_QUEUE_ACTIVE_STATUSES = ['pendente', 'preparando', 'saiu_para_entrega'];
const DASHBOARD_QUEUE_STATUS_LABELS = {
  pendente: 'Novo',
  preparando: 'Preparando',
  saiu_para_entrega: 'Em rota',
  entregue: 'Concluído',
  cancelado: 'Cancelado',
};

const adminLayoutEl = document.getElementById('adminLayout');
const loginCardEl = document.getElementById('loginCard');
const loginFormEl = document.getElementById('loginForm');
const loginStatusEl = document.getElementById('loginStatus');
const loginUsernameEl = document.getElementById('loginUsername');
const loginPasswordEl = document.getElementById('loginPassword');
const loginPasswordAssistEl = document.getElementById('loginPasswordAssist');
const loginRememberEl = document.getElementById('loginRemember');
const loginMemoryNoteEl = document.getElementById('loginMemoryNote');
const loginMemoryUsernameEl = document.getElementById('loginMemoryUsername');
const clearRememberedLoginBtnEl = document.getElementById('clearRememberedLoginBtn');
const loginSubmitBtnEl = document.getElementById('loginSubmitBtn');
const passwordToggleEls = Array.from(document.querySelectorAll('[data-password-toggle]'));
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
const dashboardDateLabelEl = document.getElementById('dashboardDateLabel');
const dashboardRefreshBtnEl = document.getElementById('dashboardRefreshBtn');
const dashboardOpenOrdersBtnEl = document.getElementById('dashboardOpenOrdersBtn');
const dashboardPendingAlertEl = document.getElementById('dashboardPendingAlert');
const dashboardPendingAlertTextEl = document.getElementById('dashboardPendingAlertText');
const dashboardPendingAlertBtnEl = document.getElementById('dashboardPendingAlertBtn');
const dashboardQueueMetaEl = document.getElementById('dashboardQueueMeta');
const dashboardQueueListEl = document.getElementById('dashboardQueueList');
const kpiTotalPedidosEl = document.getElementById('kpiTotalPedidos');
const kpiTotalPedidosTrendEl = document.getElementById('kpiTotalPedidosTrend');
const kpiPendentesEl = document.getElementById('kpiPendentes');
const kpiPreparandoEl = document.getElementById('kpiPreparando');
const kpiEntreguesEl = document.getElementById('kpiEntregues');
const kpiFaturamentoEl = document.getElementById('kpiFaturamento');
const kpiFaturamentoTrendEl = document.getElementById('kpiFaturamentoTrend');
const kpiTicketMedioEl = document.getElementById('kpiTicketMedio');
const kpiTicketMedioTrendEl = document.getElementById('kpiTicketMedioTrend');
const sidebarStoreStatusCardEl = document.getElementById('sidebarStoreStatus');
const sidebarStoreStatusTextEl = document.getElementById('sidebarStoreStatusText');
const sidebarStoreStatusMetaEl = document.getElementById('sidebarStoreStatusMeta');
const navOrdersBadgeEl = document.getElementById('navOrdersBadge');
const navCatalogBadgeEl = document.getElementById('navCatalogBadge');

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
const ordersArrivalNoticeEl = document.getElementById('ordersArrivalNotice');
const ordersArrivalTitleEl = document.getElementById('ordersArrivalTitle');
const ordersArrivalTextEl = document.getElementById('ordersArrivalText');
const ordersArrivalSummaryEl = document.getElementById('ordersArrivalSummary');
const ordersArrivalOrderIdEl = document.getElementById('ordersArrivalOrderId');
const ordersArrivalCustomerEl = document.getElementById('ordersArrivalCustomer');
const ordersArrivalOrderMetaEl = document.getElementById('ordersArrivalOrderMeta');
const ordersArrivalJumpBtnEl = document.getElementById('ordersArrivalJumpBtn');
const ordersArrivalDismissBtnEl = document.getElementById('ordersArrivalDismissBtn');
const ordersOverviewTotalEl = document.getElementById('ordersOverviewTotal');
const ordersOverviewTotalMetaEl = document.getElementById('ordersOverviewTotalMeta');
const ordersOverviewPageEl = document.getElementById('ordersOverviewPage');
const ordersOverviewPageMetaEl = document.getElementById('ordersOverviewPageMeta');
const ordersOverviewActionEl = document.getElementById('ordersOverviewAction');
const ordersOverviewActionMetaEl = document.getElementById('ordersOverviewActionMeta');
const ordersOverviewPaymentEl = document.getElementById('ordersOverviewPayment');
const ordersOverviewPaymentMetaEl = document.getElementById('ordersOverviewPaymentMeta');

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
const whatsappSettingsFormEl = document.getElementById('whatsappSettingsForm');
const whatsappSettingsStatusEl = document.getElementById('whatsappSettingsStatus');
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

const PASSWORD_AUTO_HIDE_DELAY_MS = 30000;
const LOGIN_PASSWORD_ASSIST_DEFAULT = 'A sessão fica ativa até expirar ou você sair manualmente.';

const adminStore = createAdminStore({
  defaults: {
    orders: {
      pageSize: Number(ordersPageSizeInputEl?.value || 10),
      status: statusFilterEl?.value || 'all',
      period: ordersRangePresetEl?.value || 'today',
    },
    customers: {
      pageSize: Number(customersPageSizeInputEl?.value || 12),
      segment: customersSegmentFilterEl?.value || 'all',
      sort: customersSortInputEl?.value || 'recent_desc',
      period: customersRangePresetEl?.value || 'all',
    },
    category: {
      pageSize: Number(categoryPageSizeInputEl?.value || 10),
      sort: categorySortInputEl?.value || 'ordem_exibicao',
    },
    produto: {
      pageSize: Number(produtoPageSizeInputEl?.value || 12),
      sort: produtoSortInputEl?.value || 'nome_doce',
      disponibilidade: produtoDisponibilidadeFilterEl?.value || 'all',
    },
  },
});
const { state } = adminStore;
const apiClient = createAdminApiClient({ state, store: adminStore });
const authHeaders = apiClient.authHeaders;
const parseEnvelope = apiClient.parseEnvelope;
const parseResponse = apiClient.parseResponse;
const refreshAdminSession = apiClient.refreshAdminSession;
const revokeAdminSession = apiClient.revokeAdminSession;
const dashboardFilters = state.dashboardFilters;
const ordersState = state.ordersState;
const customersState = state.customersState;
const categoryState = state.categoryState;
const produtoState = state.produtoState;
const catalogPortalState = state.catalogPortalState;
const orderAuditCache = state.orderAuditCache;
const expandedOrderAuditIds = state.expandedOrderAuditIds;
const passwordToggleTimeouts = new Map();
let clearSessionUiFrameId = null;
let categoryLoadRequestId = 0;
let produtoLoadRequestId = 0;
let catalogSnapshotLoadRequestId = 0;

const DEFAULT_ADMIN_VIEW = 'dashboard';
const ADMIN_VIEW_PATH_SEGMENTS = {
  dashboard: 'resumo',
  clientes: 'clientes',
  cardapio: 'cardapio',
  pedidos: 'pedidos',
  broadcast: 'bot-whatsapp/disparos',
  config: 'configuracoes',
  whatsapp: 'bot-whatsapp',
};
const ADMIN_VIEW_ALIASES = {
  resumo: 'dashboard',
  dashboard: 'dashboard',
  clientes: 'clientes',
  cardapio: 'cardapio',
  pedidos: 'pedidos',
  disparos: 'broadcast',
  'bot-whatsapp/disparos': 'broadcast',
  broadcast: 'broadcast',
  configuracoes: 'config',
  config: 'config',
  whatsapp: 'whatsapp',
  bot: 'whatsapp',
  'bot-whatsapp': 'whatsapp',
};
const ADMIN_VIEW_DESCRIPTIONS = {
  dashboard: 'Indicadores e fotografia rápida da operação da loja.',
  clientes: 'Base de clientes com histórico, preferências e pedidos.',
  cardapio: 'Categorias, itens, estoque e disponibilidade do cardápio.',
  pedidos: 'Acompanhe, filtre e atualize pedidos em tempo real.',
  broadcast: 'Listas, campanhas e historico dos disparos em massa pelo WhatsApp.',
  config: 'Operação da loja, agenda automática e taxas por local.',
  whatsapp: 'Conexão, automações, mensagens e testes do Bot WhatsApp.',
};

const CRM_SEGMENT_LABELS = {
  all: 'Todos os segmentos',
  lead: 'Leads',
  novo: 'Novos',
  recorrente: 'Recorrentes',
  inativo: 'Inativos',
};

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

function formatPortalDateLabel(value = new Date()) {
  const label = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(value);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatCompactTime(value) {
  if (!value) return '--';
  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatOrderCode(value) {
  const numericId = Number(value || 0);
  if (!numericId) return '#---';
  return `#${String(numericId).padStart(3, '0')}`;
}

function elapsedMinutesSince(value) {
  const timestamp = new Date(value || '').getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
}

function formatElapsedSince(value) {
  const minutes = elapsedMinutesSince(value);
  if (minutes === null) return 'há pouco';
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `há ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

function customerInitials(value) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'DN';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
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

function setStatus(target, message, type = 'muted') {
  if (!target) return;
  target.textContent = message;
  target.className = `status-text ${type}`;
}

function clearStatus(target) {
  if (!target) return;
  setStatus(target, '', 'muted');
}

function showToast(message) {
  const text = String(message || '').trim();
  if (!text) return;

  document.querySelectorAll('.admin-toast').forEach((toast) => toast.remove());

  const toast = document.createElement('div');
  toast.className = 'admin-toast';
  toast.textContent = text;
  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('is-hiding');
  }, 1800);

  window.setTimeout(() => {
    toast.remove();
  }, 2200);
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

function adminLinkMatchesView(link, activeView) {
  const rawMatches = String(link?.dataset?.adminViewMatch || link?.dataset?.adminViewLink || '');
  if (!rawMatches) return false;

  return rawMatches
    .split(',')
    .map((value) => normalizeAdminView(value))
    .includes(activeView);
}

function renderAdminView(view) {
  const activeView = normalizeAdminView(view);

  adminPanelViews.forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.adminView !== activeView);
  });

  adminViewLinks.forEach((link) => {
    const isActive = adminLinkMatchesView(link, activeView);
    const exactView = normalizeAdminView(link.dataset.adminViewLink);
    link.classList.toggle('active', isActive);

    if (exactView === activeView) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

  setAdminTopbarDescription(activeView);
  document.dispatchEvent(new CustomEvent('admin:view-change', {
    detail: { view: activeView },
  }));
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
  const detailPanel = customerDetailEl?.closest('.customers-admin-detail-card') || customerDetailEl?.closest('.crm-detail-panel');
  if (!detailPanel) return;
  const rect = detailPanel.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  if (rect.top >= 0 && rect.top <= Math.max(viewportHeight * 0.35, 180)) return;
  detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearStoredSessionTokens() {
  adminStore.clearStoredSessionTokens();
}

function hasRememberedSessionPreference() {
  return adminStore.hasRememberedSessionPreference();
}

function getRememberedUsername() {
  return adminStore.getRememberedUsername();
}

function setLoginPasswordAssist(message, type = 'muted') {
  if (!loginPasswordAssistEl) return;
  loginPasswordAssistEl.textContent = message;
  loginPasswordAssistEl.className = `field-status admin-auth-footnote ${type}`;
}

function updateRememberedLoginUi() {
  const rememberedUsername = getRememberedUsername();
  const hasSavedData = Boolean(rememberedUsername || localStorage.getItem('donilla_refresh_token'));

  if (loginRememberEl) {
    loginRememberEl.checked = hasRememberedSessionPreference() || hasSavedData;
  }

  if (loginMemoryNoteEl) {
    loginMemoryNoteEl.classList.toggle('hidden', !rememberedUsername);
  }

  if (loginMemoryUsernameEl) {
    loginMemoryUsernameEl.textContent = rememberedUsername || '';
  }

  if (clearRememberedLoginBtnEl) {
    clearRememberedLoginBtnEl.classList.toggle('hidden', !hasSavedData);
  }

  if (loginUsernameEl && rememberedUsername && !loginUsernameEl.value) {
    loginUsernameEl.value = rememberedUsername;
  }
}

function storeRememberedUsername(username, rememberSession) {
  adminStore.storeRememberedUsername(username, rememberSession);
  updateRememberedLoginUi();
}

function persistSessionTokens(session, rememberSession) {
  adminStore.persistSessionTokens(session, rememberSession);
  updateRememberedLoginUi();
}

function setLoginBusy(isBusy, busyLabel = 'Validando acesso...') {
  if (loginSubmitBtnEl) {
    loginSubmitBtnEl.disabled = isBusy;
    loginSubmitBtnEl.textContent = isBusy ? busyLabel : 'Entrar no painel';
  }

  [loginUsernameEl, loginPasswordEl, loginRememberEl].forEach((field) => {
    if (field) field.disabled = isBusy;
  });
}

function applyPasswordToggleState(button, input, isVisible) {
  if (!button || !input) return;
  input.type = isVisible ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(isVisible));
  button.setAttribute('aria-label', isVisible ? 'Ocultar senha' : 'Mostrar senha');
  button.classList.toggle('is-visible', isVisible);
}

function hidePasswordForButton(button) {
  const inputId = button?.dataset?.passwordToggle;
  if (!inputId) return;
  const input = document.getElementById(inputId);
  if (!input) return;
  applyPasswordToggleState(button, input, false);
  const currentTimeout = passwordToggleTimeouts.get(button);
  if (currentTimeout) {
    window.clearTimeout(currentTimeout);
    passwordToggleTimeouts.delete(button);
  }
}

function togglePasswordVisibility(button) {
  const inputId = button?.dataset?.passwordToggle;
  if (!inputId) return;

  const input = document.getElementById(inputId);
  if (!input) return;

  const nextIsVisible = input.type === 'password';
  applyPasswordToggleState(button, input, nextIsVisible);

  const currentTimeout = passwordToggleTimeouts.get(button);
  if (currentTimeout) {
    window.clearTimeout(currentTimeout);
    passwordToggleTimeouts.delete(button);
  }

  if (!nextIsVisible) {
    setLoginPasswordAssist(LOGIN_PASSWORD_ASSIST_DEFAULT);
    return;
  }

  if (button.dataset.passwordAutohide === 'true') {
    setLoginPasswordAssist('Senha visível por 30 segundos neste dispositivo.');
    const timeoutId = window.setTimeout(() => {
      hidePasswordForButton(button);
      setLoginPasswordAssist(LOGIN_PASSWORD_ASSIST_DEFAULT);
    }, PASSWORD_AUTO_HIDE_DELAY_MS);
    passwordToggleTimeouts.set(button, timeoutId);
  }
}

function handlePasswordCapsLock(event) {
  const capsLockEnabled = Boolean(event?.getModifierState && event.getModifierState('CapsLock'));
  if (capsLockEnabled) {
    setLoginPasswordAssist('Caps Lock ligado. Confira a senha antes de entrar.', 'err');
    return;
  }

  const hasVisiblePassword = passwordToggleEls.some((button) => {
    const inputId = button?.dataset?.passwordToggle;
    const input = inputId ? document.getElementById(inputId) : null;
    return Boolean(input && input.type === 'text');
  });
  setLoginPasswordAssist(
    hasVisiblePassword ? 'Senha visível por 30 segundos neste dispositivo.' : LOGIN_PASSWORD_ASSIST_DEFAULT,
  );
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
  if (state.productImageWebpSupported !== null) return state.productImageWebpSupported;
  const canvas = document.createElement('canvas');
  state.productImageWebpSupported = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  return state.productImageWebpSupported;
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
  const maxBytes = 450 * 1024;

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
  const maxSide = 900;
  const minQuality = 0.4;
  const qualityStep = 0.08;
  const scaleBase = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
  let width = Math.max(1, Math.round(naturalWidth * scaleBase));
  let height = Math.max(1, Math.round(naturalHeight * scaleBase));

  for (const outputType of outputTypes) {
    let quality = 0.78;
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

      quality = 0.78;
      currentWidth = Math.max(1, Math.round(currentWidth * 0.8));
      currentHeight = Math.max(1, Math.round(currentHeight * 0.8));
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

  produtoImagemPreviewEl.src = toAdminProductImageUrl(value);
  produtoImagemPreviewEl.classList.remove('hidden');
}

function toAdminProductImageUrl(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  return normalized.replace(/^\/public\/produtos\/(\d+)\/imagem(?=\/|\?|$)/, '/produtos/$1/imagem');
}

function normalizeAdminCatalogProduct(product) {
  if (!product || typeof product !== 'object') return product;

  return {
    ...product,
    imagem_url: toAdminProductImageUrl(product.imagem_url),
  };
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
  dashboardFilters.period = filters.period || 'today';
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

function updateCatalogControlsFromState() {
  if (catalogPortalSearchInputEl) catalogPortalSearchInputEl.value = catalogPortalState.search;
  if (categorySearchInputEl) categorySearchInputEl.value = categoryState.search;
  if (categorySortInputEl) categorySortInputEl.value = categoryState.sort;
  if (categoryPageSizeInputEl) categoryPageSizeInputEl.value = String(categoryState.pageSize);
  if (produtoSearchInputEl) produtoSearchInputEl.value = produtoState.search;
  if (produtoSortInputEl) produtoSortInputEl.value = produtoState.sort;
  if (produtoDisponibilidadeFilterEl) produtoDisponibilidadeFilterEl.value = produtoState.disponibilidade;
  if (produtoPageSizeInputEl) produtoPageSizeInputEl.value = String(produtoState.pageSize);
  if (deliveryFeeSearchInputEl) deliveryFeeSearchInputEl.value = '';
}

function cancelPendingClearSessionUiRender() {
  if (clearSessionUiFrameId === null) return;
  window.cancelAnimationFrame(clearSessionUiFrameId);
  clearSessionUiFrameId = null;
}

function renderLoggedOutAdminUi() {
  if (state.accessToken || state.currentUser) return;

  applySessionUi();
  renderDashboard();
  renderCustomerDetail();
  renderCustomers();
  renderOrders();
  resetCategoriaForm();
  resetProdutoForm();
  resetDeliveryFeeForm();
  populateCategoriaOptions();
  populateProdutoCategoriaFilterOptions();
  populateCatalogPortalCategoryFilterOptions();
  renderCategoryList();
  renderProdutoList();
  renderCatalogOverview();
  renderCatalogPortal();
  renderDeliveryFeeList();
  renderSettingsOverview();
  updateCustomersControlsFromState();
  updateOrdersControlsFromState();
  updateCatalogControlsFromState();
  syncRangeInputs(dashboardRangePresetEl, dashboardFromDateEl, dashboardToDateEl, dashboardFilters);
  clearStatus(dashboardStatusEl);
  clearStatus(customersStatusEl);
  clearStatus(ordersStatusEl);
  setStatus(settingsStatusEl, 'Faça login para editar configurações.', 'muted');
  setStatus(deliveryFeeStatusEl, 'Faça login para editar taxas de entrega.', 'muted');
  setLoginBusy(false);
  passwordToggleEls.forEach((button) => hidePasswordForButton(button));
  setLoginPasswordAssist(LOGIN_PASSWORD_ASSIST_DEFAULT);
}

function scheduleClearSessionUiRender() {
  cancelPendingClearSessionUiRender();
  clearSessionUiFrameId = window.requestAnimationFrame(() => {
    clearSessionUiFrameId = null;
    renderLoggedOutAdminUi();
  });
}

function populateCategoriaOptions(selectedId = '') {
  const options = [
    '<option value="">Selecione a categoria</option>',
    ...state.allCategorias.map((categoria) => {
      const checked = String(selectedId) === String(categoria.id) ? 'selected' : '';
      return `<option value="${categoria.id}" ${checked}>${escapeHtml(categoria.nome)}</option>`;
    }),
  ];

  produtoCategoriaEl.innerHTML = options.join('');
  produtoCategoriaEl.disabled = state.allCategorias.length === 0;
}

function populateProdutoCategoriaFilterOptions() {
  const options = [
    '<option value="all">Todas as categorias</option>',
    ...state.allCategorias.map((categoria) => {
      const checked = String(produtoState.categoria_id) === String(categoria.id) ? 'selected' : '';
      return `<option value="${categoria.id}" ${checked}>${escapeHtml(categoria.nome)}</option>`;
    }),
  ];

  produtoCategoriaFilterEl.innerHTML = options.join('');
}

function populateCatalogPortalCategoryFilterOptions() {
  const selectedCategoryId = state.allCategorias.some((categoria) => String(categoria.id) === String(catalogPortalState.categoria_id))
    ? String(catalogPortalState.categoria_id)
    : 'all';

  catalogPortalState.categoria_id = selectedCategoryId;

  if (!catalogPortalCategoryFilterEl) return;

  const options = [
    '<option value="all">Selecionar categoria</option>',
    ...state.allCategorias.map((categoria) => {
      const checked = selectedCategoryId === String(categoria.id) ? 'selected' : '';
      return `<option value="${categoria.id}" ${checked}>${escapeHtml(categoria.nome)}</option>`;
    }),
  ];

  catalogPortalCategoryFilterEl.innerHTML = options.join('');
}

function replaceLookupMap(targetMap, items = []) {
  targetMap.clear();
  items.forEach((item) => {
    const key = String(item?.id || '').trim();
    if (!key) return;
    targetMap.set(key, item);
  });
}

function findEntityById(lookupMap, fallbackCollections, entityId) {
  const normalizedId = String(entityId || '').trim();
  if (!normalizedId) return null;

  const fromLookup = lookupMap.get(normalizedId);
  if (fromLookup) return fromLookup;

  for (const items of fallbackCollections) {
    const found = items.find((item) => String(item?.id || '').trim() === normalizedId);
    if (found) return found;
  }

  return null;
}

function findCategoriaById(categoriaId) {
  return findEntityById(state.catalogCategoryMap, [state.allCategorias, state.menuCategorias], categoriaId);
}

function findProdutoById(produtoId) {
  return findEntityById(state.catalogProductMap, [state.allMenuProdutos, state.menuProdutos], produtoId);
}

function productCategoryName(categoriaId) {
  const categoria = findCategoriaById(categoriaId);
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
  state.produtoImagemDataUrl = '';
  resetImagePreview();
}

function applySessionUi() {
  const hasSession = Boolean(state.accessToken && state.currentUser);
  if (hasSession) {
    cancelPendingClearSessionUiRender();
  }
  adminLayoutEl.classList.toggle('logged-out', !hasSession);
  loginCardEl.classList.toggle('hidden', hasSession);
  if (logoutBtnEl) {
    logoutBtnEl.disabled = !hasSession;
  }
  if (dashboardRefreshBtnEl) {
    dashboardRefreshBtnEl.disabled = !hasSession;
  }
  if (dashboardOpenOrdersBtnEl) {
    dashboardOpenOrdersBtnEl.disabled = !hasSession;
  }
  if (sessionLabelEl) {
    sessionLabelEl.textContent = hasSession
      ? `Logado como ${state.currentUser.username} (${state.currentUser.role})`
      : 'Sem sessão ativa';
  }

  renderDashboardQueue();
  renderSidebarStoreStatus();

  if (!hasSession) {
    updateRememberedLoginUi();
  }
}

function clearSession() {
  adminStore.resetSessionState();
  document.dispatchEvent(new CustomEvent('admin:session-cleared'));
  scheduleClearSessionUiRender();
}

function renderDashboard(dashboard, meta = null) {
  if (dashboardDateLabelEl) {
    dashboardDateLabelEl.textContent = formatPortalDateLabel(new Date());
  }

  if (!dashboard) {
    state.dashboardSnapshot = null;
    kpiTotalPedidosEl.textContent = '--';
    kpiPendentesEl.textContent = '--';
    kpiPreparandoEl.textContent = '--';
    kpiEntreguesEl.textContent = '--';
    kpiFaturamentoEl.textContent = '--';
    if (kpiTicketMedioEl) {
      kpiTicketMedioEl.textContent = '--';
    }
    if (dashboardRangeMetaEl) {
      dashboardRangeMetaEl.textContent = 'Faça login para carregar indicadores.';
    }
    renderDashboardTrend(kpiFaturamentoTrendEl, null);
    renderDashboardTrend(kpiTotalPedidosTrendEl, null);
    renderDashboardTrend(kpiTicketMedioTrendEl, null, { mode: 'currency' });
    renderDashboardPendingAlert();
    renderAdminNavBadges();
    return;
  }

  state.dashboardSnapshot = dashboard;
  const totalPedidos = Number(dashboard.totalPedidos ?? 0);
  const faturamento = Number(dashboard.faturamento || 0);
  const ticketMedio = totalPedidos ? faturamento / totalPedidos : 0;

  kpiTotalPedidosEl.textContent = String(totalPedidos);
  kpiPendentesEl.textContent = String(dashboard.status?.pendentes ?? 0);
  kpiPreparandoEl.textContent = String(dashboard.status?.preparando ?? 0);
  kpiEntreguesEl.textContent = String(dashboard.status?.entregues ?? 0);
  kpiFaturamentoEl.textContent = brl(faturamento);
  if (kpiTicketMedioEl) {
    kpiTicketMedioEl.textContent = brl(ticketMedio);
  }
  renderDashboardTrend(kpiFaturamentoTrendEl, dashboard.comparison?.faturamento);
  renderDashboardTrend(kpiTotalPedidosTrendEl, dashboard.comparison?.totalPedidos);
  renderDashboardTrend(kpiTicketMedioTrendEl, dashboard.comparison?.ticketMedio, { mode: 'currency' });

  const filters = meta?.filters || null;
  if (dashboardRangeMetaEl) {
    dashboardRangeMetaEl.textContent = filters ? formatRangeMeta(filters) : 'Todo o período';
  }
  renderDashboardPendingAlert();
  renderAdminNavBadges();
  updateDashboardControlsFromMeta(filters || dashboardFilters);
}

function renderNavBadge(element, count = 0) {
  if (!element) return;
  const safeCount = Math.max(Number(count || 0), 0);
  element.textContent = safeCount > 99 ? '99+' : String(safeCount);
  element.classList.toggle('hidden', safeCount === 0);
}

function pendingOrdersCount() {
  if (state.dashboardSnapshot?.status) {
    return Math.max(Number(state.dashboardSnapshot.status.pendentes ?? 0), 0);
  }

  return state.dashboardQueueOrders.filter((order) => (order?.status_entrega || 'pendente') === 'pendente').length;
}

function renderAdminNavBadges() {
  const hasSession = Boolean(state.accessToken && state.currentUser);
  if (!hasSession) {
    renderNavBadge(navOrdersBadgeEl, 0);
    renderNavBadge(navCatalogBadgeEl, 0);
    return;
  }

  const pendingOrders = pendingOrdersCount();
  const semEstoque = state.allMenuProdutos.filter((produto) => {
    const estoque = normalizeEstoque(produto.estoque_disponivel);
    return estoque !== null && estoque <= 0;
  }).length;

  renderNavBadge(navOrdersBadgeEl, pendingOrders);
  renderNavBadge(navCatalogBadgeEl, semEstoque);
}

function renderDashboardPendingAlert() {
  if (!dashboardPendingAlertEl || !dashboardPendingAlertTextEl) return;

  const hasSession = Boolean(state.accessToken && state.currentUser);
  const pendingOrders = pendingOrdersCount();

  if (!hasSession || pendingOrders <= 0) {
    dashboardPendingAlertEl.classList.add('hidden');
    return;
  }

  dashboardPendingAlertTextEl.textContent = pendingOrders === 1
    ? '1 novo pedido aguardando confirmação.'
    : `${pendingOrders} novos pedidos aguardando confirmação.`;
  dashboardPendingAlertEl.classList.remove('hidden');
}

function renderDashboardTrend(element, comparison, { mode = 'percent' } = {}) {
  if (!element || !comparison) {
    if (element) {
      element.textContent = '';
      element.classList.add('hidden');
    }
    return;
  }

  const delta = Number(comparison.delta || 0);
  const direction = delta > 0 ? 'positive' : (delta < 0 ? 'negative' : 'neutral');
  const arrow = direction === 'positive' ? '↑' : (direction === 'negative' ? '↓' : '•');

  let label = 'Estável vs ontem';
  if (mode === 'currency') {
    label = delta === 0
      ? 'Estável vs ontem'
      : `${arrow} ${brl(Math.abs(delta))} vs ontem`;
  } else {
    const percent = Math.abs(Number(comparison.percent || 0));
    label = delta === 0
      ? 'Estável vs ontem'
      : `${arrow} ${percent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs ontem`;
  }

  element.textContent = label;
  element.className = `dashboard-metric-trend is-${direction}`;
  element.classList.remove('hidden');
}

function orderItemQuantity(order) {
  return (order?.itens_pedido || []).reduce((acc, item) => acc + Number(item?.quantidade || 0), 0);
}

function isUrgentPendingOrder(order) {
  return (order?.status_entrega || 'pendente') === 'pendente' && Number(elapsedMinutesSince(order?.criado_em) || 0) > 15;
}

function dashboardOrderAction(order) {
  const status = order?.status_entrega || 'pendente';

  if (status === 'pendente') {
    return { label: 'Aceitar pedido', nextStatus: 'preparando', nextStatusLabel: 'Preparando', className: 'btn-aceitar' };
  }

  if (status === 'preparando') {
    return { label: 'Despachar', nextStatus: 'saiu_para_entrega', nextStatusLabel: 'Saiu para entrega', className: 'btn-despachar' };
  }

  if (status === 'saiu_para_entrega') {
    return { label: 'Confirmar entrega', nextStatus: 'entregue', nextStatusLabel: 'Entregue', className: 'btn-confirmar' };
  }

  return null;
}

function dashboardProgressMarkup(order) {
  const status = order?.status_entrega || 'pendente';
  const steps = ['pendente', 'preparando', 'saiu_para_entrega', 'entregue'];
  const currentIndex = steps.indexOf(status);
  const isCancelled = status === 'cancelado';

  return `
    <div class="dashboard-order-progress${isCancelled ? ' is-cancelled' : ''}" aria-hidden="true">
      ${steps.map((step, index) => {
        const stepClass = !isCancelled && currentIndex > index
          ? 'is-complete'
          : (!isCancelled && currentIndex === index ? 'is-current' : '');

        return `
          <span class="dashboard-order-progress-step ${stepClass}" title="${STATUS_LABELS[step] || step}">
            <span class="dashboard-order-progress-dot"></span>
          </span>
        `;
      }).join('')}
    </div>
  `;
}

function dashboardQueueItemsSummary(order) {
  const items = Array.isArray(order?.itens_pedido) ? order.itens_pedido : [];
  if (items.length === 0) {
    return 'Sem itens detalhados';
  }

  const preview = items
    .slice(0, 2)
    .map((item) => `${Number(item.quantidade || 0)}x ${item.produtos?.nome_doce || `Produto ${item.produto_id}`}`)
    .join(' • ');

  return items.length > 2
    ? `${preview} +${items.length - 2}`
    : preview;
}

function dashboardQueueCard(order) {
  const status = order.status_entrega || 'pendente';
  const customerName = order.clientes?.nome || 'Cliente sem nome';
  const action = dashboardOrderAction(order);
  const itemQuantity = orderItemQuantity(order);
  const urgentOrder = isUrgentPendingOrder(order);
  const orderCode = formatOrderCode(order.id);
  const elapsedLabel = formatElapsedSince(order.criado_em);
  const actionButtonsHtml = action
    ? `
        <button
          type="button"
          class="dashboard-order-btn ${action.className}"
          data-dashboard-advance="${order.id}"
          data-dashboard-next-status="${action.nextStatus}"
          data-dashboard-next-status-label="${action.nextStatusLabel}"
          data-dashboard-payment-status="${escapeHtml(order.status_pagamento || 'pendente')}"
        >
          ${escapeHtml(action.label)}
        </button>
        <button
          type="button"
          class="dashboard-order-btn btn-cancelar"
          data-dashboard-cancel="${order.id}"
          data-dashboard-payment-status="${escapeHtml(order.status_pagamento || 'pendente')}"
        >
          Cancelar
        </button>
      `
    : '';

  return `
    <article class="dashboard-order-card${urgentOrder ? ' is-urgent' : ''}">
      <div class="dashboard-order-main">
        <div class="dashboard-order-head">
          <div class="dashboard-order-title">
            <span class="dashboard-order-code">${escapeHtml(orderCode)}</span>
            <div class="dashboard-order-copy">
              <strong>${escapeHtml(customerName)}</strong>
              <p>
                ${escapeHtml(pluralize(itemQuantity, 'item', 'itens'))}
                <span class="dashboard-order-age${urgentOrder ? ' is-urgent' : ''}">· ${escapeHtml(elapsedLabel)}</span>
              </p>
            </div>
          </div>
          <div class="dashboard-order-statuses">
            <span class="status-chip status-${status}">${escapeHtml(DASHBOARD_QUEUE_STATUS_LABELS[status] || STATUS_LABELS[status] || status)}</span>
            ${paymentChipMarkup(order.status_pagamento)}
          </div>
        </div>

        <p class="dashboard-order-summary">${escapeHtml(dashboardQueueItemsSummary(order))}</p>
        ${dashboardProgressMarkup(order)}
      </div>

      <div class="dashboard-order-side">
        <strong class="dashboard-order-total">${brl(order.valor_total)}</strong>
        <div class="dashboard-order-actions">
          ${actionButtonsHtml}
        </div>
      </div>
    </article>
  `;
}

function renderDashboardQueue() {
  if (!dashboardQueueListEl || !dashboardQueueMetaEl) return;

  const hasSession = Boolean(state.accessToken && state.currentUser);
  if (!hasSession) {
    dashboardQueueMetaEl.textContent = 'Faça login para acompanhar a operação.';
    dashboardQueueListEl.innerHTML = '<article class="dashboard-queue-empty"><p class="muted">Faça login para carregar a fila operacional.</p></article>';
    renderDashboardPendingAlert();
    renderAdminNavBadges();
    return;
  }

  if (!state.dashboardQueueLoaded && state.dashboardQueueOrders.length === 0) {
    dashboardQueueMetaEl.textContent = 'Carregando pedidos recentes.';
    dashboardQueueListEl.innerHTML = '<article class="dashboard-queue-empty"><p class="muted">Carregando pedidos do dia...</p></article>';
    renderDashboardPendingAlert();
    renderAdminNavBadges();
    return;
  }

  const recentOrders = state.dashboardQueueOrders
    .sort((left, right) => new Date(right?.criado_em || 0).getTime() - new Date(left?.criado_em || 0).getTime());
  const visibleOrders = recentOrders.slice(0, 6);
  const pendingOrders = pendingOrdersCount();

  dashboardQueueMetaEl.textContent = visibleOrders.length
    ? (pendingOrders > 0
      ? `${pendingOrders} aguardando confirmação · ${visibleOrders.length} pedidos recentes no radar.`
      : `${visibleOrders.length} pedidos recentes recebidos hoje.`)
    : 'Nenhum pedido recebido hoje até agora.';
  dashboardQueueListEl.innerHTML = visibleOrders.length
    ? visibleOrders.map(dashboardQueueCard).join('')
    : '<article class="dashboard-queue-empty"><p class="muted">Nenhum pedido recebido hoje até agora.</p></article>';
  renderDashboardPendingAlert();
  renderAdminNavBadges();
}

function dashboardQueueQueryString() {
  return buildQueryString({
    page: 1,
    pageSize: 20,
    status: 'all',
    ...buildPeriodParams({ period: 'today' }, 'today'),
  });
}

async function loadDashboardQueue() {
  if (!state.accessToken) {
    state.dashboardQueueLoaded = false;
    state.dashboardQueueOrders = [];
    renderDashboardQueue();
    return [];
  }

  const query = dashboardQueueQueryString();
  const payload = await apiClient.fetchOrders(query);
  state.dashboardQueueOrders = Array.isArray(payload.data) ? payload.data : [];
  state.dashboardQueueLoaded = true;
  renderDashboardQueue();
  return state.dashboardQueueOrders;
}

function renderSidebarStoreStatus(config = state.currentStoreSettings) {
  if (!sidebarStoreStatusCardEl || !sidebarStoreStatusTextEl || !sidebarStoreStatusMetaEl) return;

  const hasSession = Boolean(state.accessToken && state.currentUser);
  if (!hasSession) {
    sidebarStoreStatusCardEl.disabled = true;
    sidebarStoreStatusCardEl.setAttribute('aria-pressed', 'false');
    sidebarStoreStatusCardEl.classList.remove('is-open');
    sidebarStoreStatusCardEl.classList.add('is-closed');
    sidebarStoreStatusTextEl.textContent = 'Loja fechada';
    sidebarStoreStatusMetaEl.textContent = 'Faça login para carregar a operação.';
    sidebarStoreStatusCardEl.title = 'Faça login para alterar a abertura manual da loja.';
    return;
  }

  if (!config) {
    sidebarStoreStatusCardEl.disabled = true;
    sidebarStoreStatusCardEl.setAttribute('aria-pressed', 'false');
    sidebarStoreStatusCardEl.classList.remove('is-open');
    sidebarStoreStatusCardEl.classList.add('is-closed');
    sidebarStoreStatusTextEl.textContent = 'Consultando';
    sidebarStoreStatusMetaEl.textContent = 'Carregando horário e operação da loja.';
    sidebarStoreStatusCardEl.title = 'Carregando a operação da loja.';
    return;
  }

  const openNow = Boolean(config.loja_aberta_agora);
  const manualOpen = config.loja_aberta !== false;
  sidebarStoreStatusCardEl.disabled = false;
  sidebarStoreStatusCardEl.setAttribute('aria-pressed', manualOpen ? 'true' : 'false');
  sidebarStoreStatusCardEl.classList.toggle('is-open', openNow);
  sidebarStoreStatusCardEl.classList.toggle('is-closed', !openNow);
  sidebarStoreStatusTextEl.textContent = openNow ? 'Loja aberta' : 'Loja fechada';
  sidebarStoreStatusMetaEl.textContent = config.loja_status_descricao
    || (openNow ? 'Recebendo pedidos neste momento.' : 'Fora do horário de atendimento.');
  sidebarStoreStatusCardEl.title = manualOpen
    ? 'Clique para fechar manualmente a loja.'
    : 'Clique para abrir manualmente a loja.';
}

async function toggleSidebarStoreStatus() {
  if (!state.accessToken) {
    throw new Error('Faça login antes de alterar a abertura da loja.');
  }

  if (!state.currentStoreSettings) {
    return loadStoreSettings();
  }

  const nextManualOpen = state.currentStoreSettings.loja_aberta === false;
  if (sidebarStoreStatusCardEl) {
    sidebarStoreStatusCardEl.disabled = true;
  }
  if (sidebarStoreStatusMetaEl) {
    sidebarStoreStatusMetaEl.textContent = nextManualOpen
      ? 'Aplicando abertura manual...'
      : 'Fechando manualmente...';
  }

  try {
    const response = await fetch('/admin/store-settings', {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ loja_aberta: nextManualOpen }),
    });

    await parseResponse(response);
    return await loadStoreSettings();
  } catch (error) {
    renderSidebarStoreStatus(state.currentStoreSettings);
    throw error;
  }
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
  const isActive = Number(state.selectedCustomerId || 0) === Number(customer.id || 0);
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

      <span class="crm-customer-cta">Abrir perfil completo</span>
    </button>
  `;
}

function syncCustomerSegmentTabs(segment = 'all') {
  document.querySelectorAll('[data-customers-segment-tab]').forEach((button) => {
    const isActive = (button.dataset.customersSegmentTab || 'all') === (segment || 'all');
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
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

function renderCustomerDetail(detail = state.customerDetail, { scroll = false } = {}) {
  if (!state.accessToken) {
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
  if (!state.accessToken) {
    customersListEl.innerHTML = '<div class="catalog-admin-preview-empty"><p class="muted">Faça login para visualizar clientes.</p></div>';
    customersMetaEl.textContent = 'Faça login para carregar a carteira de clientes.';
    customersListMetaEl.textContent = 'Faça login para carregar clientes.';
    customersPrevBtnEl.disabled = true;
    customersNextBtnEl.disabled = true;
    updateDatalistOptions(customersSearchSuggestionsEl, []);
    renderCustomersSummary();
    syncCustomerSegmentTabs(customersState.segment || 'all');
    return;
  }

  const summary = state.customerPaginationMeta?.summary || null;
  const total = Number(state.customerPaginationMeta?.total || 0);
  const totalPages = Number(state.customerPaginationMeta?.totalPages || 1);
  const page = Number(state.customerPaginationMeta?.page || customersState.page || 1);
  const pageSize = Number(state.customerPaginationMeta?.pageSize || customersState.pageSize || 12);
  const filters = state.customerPaginationMeta?.filters || null;
  const start = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const end = total === 0 ? 0 : Math.min(total, page * pageSize);
  const segmentLabel = getSelectOptionLabel(customersSegmentFilterEl, filters?.segment || customersState.segment);
  const sortLabel = getSelectOptionLabel(customersSortInputEl, filters?.sort || customersState.sort);

  renderCustomersSummary(summary);
  customersMetaEl.textContent = `${total} clientes na carteira · Atividade: ${formatRangeMeta(filters)}`;
  customersListMetaEl.textContent = `${start}-${end} de ${total} · ${pageSize} por visualização · ${segmentLabel} · ${sortLabel}`;
  customersPrevBtnEl.disabled = page <= 1;
  customersNextBtnEl.disabled = page >= totalPages;
  syncCustomerSegmentTabs(filters?.segment || customersState.segment || 'all');
  updateDatalistOptions(
    customersSearchSuggestionsEl,
    state.crmCustomers.map((customer) => ({
      value: customer.nome || formatPhone(customer.telefone_whatsapp || ''),
      label: `${formatPhone(customer.telefone_whatsapp || '')} · ${customer.segment_label || 'Cliente'}`,
    })),
  );

  if (state.crmCustomers.length === 0) {
    customersListEl.innerHTML = '<div class="catalog-admin-preview-empty"><p class="muted">Nenhum cliente encontrado para este filtro.</p></div>';
    return;
  }

  customersListEl.innerHTML = state.crmCustomers.map(customerCard).join('');
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
  if (!state.accessToken || !customerId) {
    state.customerDetail = null;
    renderCustomerDetail();
    return null;
  }

  state.selectedCustomerId = Number(customerId);
  if (!silent) {
    customerDetailEl.className = 'crm-detail-empty';
    customerDetailEl.innerHTML = '<div class="crm-detail-empty"><p class="muted">Carregando perfil do cliente...</p></div>';
  }

  state.customerDetail = await apiClient.fetchCustomerDetail(customerId);
  renderCustomers();
  renderCustomerDetail(state.customerDetail, { scroll: !silent });
  return state.customerDetail;
}

async function loadCustomers() {
  if (!validateRangeState(customersState, customersStatusEl, 'clientes')) return;

  const query = customersQueryString();
  const payload = await apiClient.fetchCustomers(query);
  state.crmCustomers = Array.isArray(payload.data) ? payload.data : [];
  state.customerPaginationMeta = payload.meta || null;

  if (state.customerPaginationMeta && customersState.page > Number(state.customerPaginationMeta.totalPages || 1)) {
    customersState.page = Number(state.customerPaginationMeta.totalPages || 1);
    return loadCustomers();
  }

  const customerIds = new Set(state.crmCustomers.map((customer) => Number(customer.id || 0)));
  if (!state.selectedCustomerId || !customerIds.has(Number(state.selectedCustomerId || 0))) {
    state.selectedCustomerId = null;
    state.customerDetail = null;
  }

  clearStatus(customersStatusEl);
  renderCustomers();

  if (!state.selectedCustomerId) {
    renderCustomerDetail();
    return;
  }

  if (Number(state.customerDetail?.id || 0) === Number(state.selectedCustomerId || 0)) {
    renderCustomerDetail(state.customerDetail);
    return;
  }

  await loadCustomerDetail(state.selectedCustomerId, { silent: true });
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

function renderOrdersOverview() {
  if (!state.accessToken) {
    if (ordersOverviewTotalEl) ordersOverviewTotalEl.textContent = 'Aguardando';
    if (ordersOverviewTotalMetaEl) ordersOverviewTotalMetaEl.textContent = 'Carregando total do período selecionado.';
    if (ordersOverviewPageEl) ordersOverviewPageEl.textContent = 'Aguardando';
    if (ordersOverviewPageMetaEl) ordersOverviewPageMetaEl.textContent = 'Resumo da página atual.';
    if (ordersOverviewActionEl) ordersOverviewActionEl.textContent = 'Aguardando';
    if (ordersOverviewActionMetaEl) ordersOverviewActionMetaEl.textContent = 'Pedidos que ainda precisam de ação.';
    if (ordersOverviewPaymentEl) ordersOverviewPaymentEl.textContent = 'Aguardando';
    if (ordersOverviewPaymentMetaEl) ordersOverviewPaymentMetaEl.textContent = 'Situações financeiras que merecem atenção.';
    return;
  }

  const total = Number(state.ordersPaginationMeta?.total || 0);
  const totalPages = Number(state.ordersPaginationMeta?.totalPages || 1);
  const page = Number(state.ordersPaginationMeta?.page || ordersState.page || 1);
  const pageSize = Number(state.ordersPaginationMeta?.pageSize || ordersState.pageSize || 10);
  const filters = state.ordersPaginationMeta?.filters || null;

  const activeOrders = state.allOrders.filter((order) => ['pendente', 'preparando', 'saiu_para_entrega'].includes(order.status_entrega || 'pendente'));
  const preparingOrders = activeOrders.filter((order) => order.status_entrega === 'preparando').length;
  const deliveryOrders = activeOrders.filter((order) => order.status_entrega === 'saiu_para_entrega').length;
  const pendingPaymentOrders = state.allOrders.filter((order) => paymentStatusClass(order.status_pagamento) !== 'pago').length;
  const paidOrders = state.allOrders.filter((order) => paymentStatusClass(order.status_pagamento) === 'pago').length;

  if (ordersOverviewTotalEl) {
    ordersOverviewTotalEl.textContent = String(total);
  }
  if (ordersOverviewTotalMetaEl) {
    ordersOverviewTotalMetaEl.textContent = formatRangeMeta(filters);
  }
  if (ordersOverviewPageEl) {
    ordersOverviewPageEl.textContent = String(state.allOrders.length);
  }
  if (ordersOverviewPageMetaEl) {
    ordersOverviewPageMetaEl.textContent = total
      ? `Página ${page} de ${totalPages} · ${pageSize} por página.`
      : 'Nenhum pedido retornado para a página atual.';
  }
  if (ordersOverviewActionEl) {
    ordersOverviewActionEl.textContent = String(activeOrders.length);
  }
  if (ordersOverviewActionMetaEl) {
    ordersOverviewActionMetaEl.textContent = activeOrders.length
      ? `${preparingOrders} preparando · ${deliveryOrders} em entrega.`
      : 'Nenhum pedido ativo nesta página.';
  }
  if (ordersOverviewPaymentEl) {
    ordersOverviewPaymentEl.textContent = String(pendingPaymentOrders);
  }
  if (ordersOverviewPaymentMetaEl) {
    ordersOverviewPaymentMetaEl.textContent = `${paidOrders} pago(s) nesta página.`;
  }
}

function orderCard(order) {
  const status = order.status_entrega || 'pendente';
  const paymentStatus = paymentStatusClass(order.status_pagamento);
  const auditExpanded = expandedOrderAuditIds.has(Number(order.id || 0));
  const itensCount = Array.isArray(order.itens_pedido) ? order.itens_pedido.length : 0;
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
    <article class="order-card" data-order-card-id="${order.id}">
      <header class="order-card-head">
        <div class="order-card-head-copy">
          <div class="order-card-title-row">
            <strong>Pedido #${order.id}</strong>
            <small class="order-card-time">${dateTime(order.criado_em)}</small>
          </div>
          <p class="order-card-subtitle">${escapeHtml(order.clientes?.nome || '--')} · ${escapeHtml(formatPhone(order.clientes?.telefone_whatsapp || ''))}</p>
        </div>
        <div class="order-card-statuses">
          <span class="status-chip status-${status}">${STATUS_LABELS[status] || status}</span>
          ${paymentChipMarkup(order.status_pagamento)}
        </div>
      </header>

      <div class="order-meta order-summary-grid">
        <span class="order-summary-pill"><b>Total</b>${brl(order.valor_total)}</span>
        <span class="order-summary-pill"><b>Itens</b>${pluralize(itensCount, 'item', 'itens')}</span>
        <span class="order-summary-pill"><b>Pagamento</b>${escapeHtml(paymentMethodLabel(order.metodo_pagamento))}</span>
        <span class="order-summary-pill"><b>WhatsApp</b>${escapeHtml(formatPhone(order.clientes?.telefone_whatsapp || ''))}</span>
        <span class="order-summary-pill order-summary-pill-wide"><b>Endereço</b>${formatAddress(order.enderecos)}</span>
      </div>

      ${order.observacoes ? `<p class="order-note"><b>Observações:</b> ${escapeHtml(order.observacoes)}</p>` : ''}

      <section class="order-items-panel">
        <div class="order-items-panel-head">
          <h4>Itens do pedido</h4>
          <small>${pluralize(itensCount, 'item', 'itens')}</small>
        </div>
        <ul class="order-items">${itensHtml || '<li>Sem itens.</li>'}</ul>
      </section>

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

function buildOrdersListRenderEntry(order) {
  return {
    id: Number(order?.id || 0),
    criado_em: order?.criado_em || '',
    status_entrega: order?.status_entrega || '',
    status_pagamento: order?.status_pagamento || '',
    valor_total: String(order?.valor_total ?? ''),
    metodo_pagamento: order?.metodo_pagamento || '',
    observacoes: order?.observacoes || '',
    cliente: {
      nome: order?.clientes?.nome || '',
      telefone_whatsapp: order?.clientes?.telefone_whatsapp || '',
    },
    endereco: order?.enderecos ? {
      rua: order.enderecos.rua || '',
      numero: order.enderecos.numero || '',
      bairro: order.enderecos.bairro || '',
      cidade: order.enderecos.cidade || '',
      complemento: order.enderecos.complemento || '',
      referencia: order.enderecos.referencia || '',
    } : null,
    itens: Array.isArray(order?.itens_pedido)
      ? order.itens_pedido.map((item) => ({
        produto_id: Number(item?.produto_id || 0),
        quantidade: Number(item?.quantidade || 0),
        subtotal: String(item?.subtotal ?? ''),
        nome_doce: item?.produtos?.nome_doce || '',
      }))
      : [],
  };
}

function buildOrdersListRenderSignature() {
  return JSON.stringify(state.allOrders.map(buildOrdersListRenderEntry));
}

function updateOrdersListMarkup(markup, signature) {
  if (state.ordersListRenderSignature === signature) {
    return false;
  }

  ordersListEl.innerHTML = markup;
  state.ordersListRenderSignature = signature;
  return true;
}

function renderOrders() {
  if (!state.accessToken) {
    updateOrdersListMarkup('<p class="muted">Faça login para visualizar pedidos.</p>', 'signed-out');
    ordersMetaEl.textContent = 'Faça login para carregar pedidos.';
    renderOrdersOverview();
    updateDatalistOptions(ordersSearchSuggestionsEl, []);
    document.querySelectorAll('[data-orders-quick-filter]').forEach((button) => {
      const isActive = (button.dataset.ordersQuickFilter || 'all') === 'all';
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    return;
  }

  const total = Number(state.ordersPaginationMeta?.total || 0);
  const totalPages = Number(state.ordersPaginationMeta?.totalPages || 1);
  const page = Number(state.ordersPaginationMeta?.page || ordersState.page || 1);
  const pageSize = Number(state.ordersPaginationMeta?.pageSize || ordersState.pageSize || 10);
  const filters = state.ordersPaginationMeta?.filters || null;
  const start = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const end = total === 0 ? 0 : Math.min(total, page * pageSize);

  ordersMetaEl.textContent = `${start}-${end} de ${total} pedidos · ${formatRangeMeta(filters)}`;
  ordersPrevBtnEl.disabled = page <= 1;
  ordersNextBtnEl.disabled = page >= totalPages;
  renderOrdersOverview();
  updateDatalistOptions(
    ordersSearchSuggestionsEl,
    state.allOrders.map((order) => ({
      value: `#${order.id}`,
      label: `${order.clientes?.nome || '--'} · ${dateTime(order.criado_em)}`,
    })),
  );
  document.querySelectorAll('[data-orders-quick-filter]').forEach((button) => {
    const isActive = (button.dataset.ordersQuickFilter || 'all') === (ordersState.status || 'all');
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  if (state.allOrders.length === 0) {
    updateOrdersListMarkup('<p class="muted">Nenhum pedido encontrado para este filtro.</p>', 'empty');
    return;
  }

  const nextListSignature = `orders:${buildOrdersListRenderSignature()}`;
  if (updateOrdersListMarkup(state.allOrders.map(orderCard).join(''), nextListSignature)) {
    hydrateExpandedOrderAudits();
  }
}

async function loadCurrentUser() {
  const data = await apiClient.fetchCurrentUser();
  state.currentUser = data.user;
  applySessionUi();
}

function dashboardQueryString() {
  return buildQueryString({
    ...buildPeriodParams(dashboardFilters, 'today'),
  });
}

async function loadDashboard() {
  if (!validateRangeState(dashboardFilters, dashboardStatusEl, 'resumo')) return;

  const query = dashboardQueryString();
  const payload = await apiClient.fetchDashboard(query);
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

  const items = await apiClient.fetchOrderAudit(id);
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

  const MAX_PAGE_CORRECTION_RETRIES = 1;
  let pageCorrectionRetries = 0;

  while (true) {
    const query = ordersQueryString();
    const payload = await apiClient.fetchOrders(query);
    state.allOrders = Array.isArray(payload.data) ? payload.data : [];
    state.ordersPaginationMeta = payload.meta || null;

    const totalPages = Math.max(1, Number(state.ordersPaginationMeta?.totalPages || 1));
    if (!state.ordersPaginationMeta || ordersState.page <= totalPages) {
      break;
    }

    ordersState.page = totalPages;
    if (pageCorrectionRetries >= MAX_PAGE_CORRECTION_RETRIES) {
      break;
    }

    pageCorrectionRetries += 1;
  }

  clearStatus(ordersStatusEl);
  renderOrders();
  document.dispatchEvent(new CustomEvent('admin:orders-loaded', {
    detail: {
      orders: state.allOrders,
      meta: state.ordersPaginationMeta,
    },
  }));
}

function renderSettingsOverview() {
  const config = state.currentStoreSettings || null;
  const activeFees = state.deliveryFees.filter((fee) => fee?.ativo !== false);
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
    settingsOverviewFeesEl.textContent = `${state.deliveryFees.length} taxa(s)`;
  }

  if (settingsOverviewFeesMetaEl) {
    settingsOverviewFeesMetaEl.textContent = `${activeFees.length} ativa(s) para cálculo da entrega.`;
  }

  renderSidebarStoreStatus(config);
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
      ? (config.loja_status_descricao || 'Horário automático ativo.')
      : 'Horário automático desligado. A loja segue apenas o controle manual acima.';
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
  const config = await apiClient.fetchStoreSettings();
  state.currentStoreSettings = config;

  settingsFormEl.elements.loja_aberta.checked = Boolean(config.loja_aberta);
  applyStoreHoursConfig(config);
  settingsFormEl.elements.tempo_entrega_minutos.value = Number(config.tempo_entrega_minutos || 40);
  settingsFormEl.elements.tempo_entrega_max_minutos.value = Number(config.tempo_entrega_max_minutos || 60);
  settingsFormEl.elements.mensagem_aviso.value = config.mensagem_aviso || '';

  if (whatsappSettingsFormEl?.elements?.whatsapp_ativo) {
    whatsappSettingsFormEl.elements.whatsapp_ativo.checked = Boolean(config.whatsapp_ativo);
    whatsappSettingsFormEl.elements.whatsapp_bot_pausado.checked = Boolean(config.whatsapp_bot_pausado);
    whatsappSettingsFormEl.elements.whatsapp_webhook_url.value = config.whatsapp_webhook_url || '';
    whatsappSettingsFormEl.elements.whatsapp_webhook_secret.value = config.whatsapp_webhook_secret || '';
    whatsappSettingsFormEl.elements.whatsapp_mensagem_novo_pedido.value = config.whatsapp_mensagem_novo_pedido || '';
    whatsappSettingsFormEl.elements.whatsapp_mensagem_status.value = config.whatsapp_mensagem_status || '';
  }

  renderWhatsAppBotPauseState(config.whatsapp_bot_pausado);
  renderSettingsOverview();
  clearStatus(whatsappSettingsStatusEl);
  clearStatus(whatsappTestStatusEl);
  document.dispatchEvent(new CustomEvent('admin:store-settings-loaded', { detail: { config } }));
  return config;
}

function renderWhatsAppBotPauseState(isPaused) {
  const paused = Boolean(isPaused);
  if (whatsappSettingsFormEl?.elements?.whatsapp_bot_pausado) {
    whatsappSettingsFormEl.elements.whatsapp_bot_pausado.checked = paused;
  }
  whatsappBotPauseBtnEl.textContent = paused ? 'Retomar envios' : 'Pausar envios';
  whatsappBotPauseMetaEl.textContent = paused
    ? 'Envios automáticos pausados.'
    : 'Mensagens funcionando normalmente.';
  whatsappBotPauseStatusEl.className = 'status-text muted';
  whatsappBotPauseStatusEl.textContent = paused
    ? 'As mensagens automáticas ficam paradas até você retomar os envios.'
    : 'As mensagens automáticas seguem ativas conforme as configurações salvas.';
}

function describeWhatsAppSessionState(data) {
  const configured = Boolean(data?.configured);
  const raw = data?.raw || {};
  const sourceValue = raw?.status ?? raw?.state ?? raw?.response ?? raw?.message ?? null;
  const normalized = String(sourceValue ?? '').trim().toUpperCase();

  if (!configured) {
    return 'A integração do WhatsApp ainda não foi configurada.';
  }

  if (normalized === 'CONNECTED') {
    return 'Número conectado e pronto para enviar mensagens.';
  }

  if (normalized === 'CLOSED' || normalized === 'DISCONNECTED' || normalized === 'FALSE') {
    return 'Número desconectado. Inicie a conexão e leia o QR Code.';
  }

  if (normalized.includes('QRCODE') || normalized.includes('QR')) {
    return 'Aguardando leitura do QR Code.';
  }

  if (normalized.includes('START') || normalized.includes('OPEN') || normalized.includes('INIT')) {
    return 'Preparando a conexão do número.';
  }

  if (sourceValue) {
    return String(sourceValue);
  }

  return 'Integração pronta para uso.';
}

function renderWhatsAppSessionState(data) {
  const connectedState = describeWhatsAppSessionState(data);
  whatsappSessionMetaEl.textContent = String(connectedState);
}

async function loadWhatsAppSessionStatus() {
  const data = await apiClient.fetchWhatsAppSessionStatus();
  renderWhatsAppSessionState(data);
  return data;
}

async function loadWhatsAppQrCode() {
  const data = await apiClient.fetchWhatsAppQrCode();
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

  const filteredFees = [...state.deliveryFees]
    .filter((fee) => {
      const scope = deliveryFeeScopeLabel(fee).toLowerCase();
      return !search || scope.includes(search);
    })
    .sort((a, b) => {
      const scopeA = deliveryFeeScopeLabel(a);
      const scopeB = deliveryFeeScopeLabel(b);
      return scopeA.localeCompare(scopeB, 'pt-BR', { sensitivity: 'base' });
    });

  if (!state.accessToken) {
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
  if (!state.accessToken) {
    categoryMetaEl.textContent = 'Faça login para carregar categorias.';
    categoryPrevBtnEl.disabled = true;
    categoryNextBtnEl.disabled = true;
    return;
  }

  const total = Number(state.categoryPaginationMeta?.total || 0);
  const totalPages = Number(state.categoryPaginationMeta?.totalPages || 1);
  const page = Number(state.categoryPaginationMeta?.page || categoryState.page || 1);
  const pageSize = Number(state.categoryPaginationMeta?.pageSize || categoryState.pageSize || 10);
  const start = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const end = total === 0 ? 0 : Math.min(total, page * pageSize);

  categoryMetaEl.textContent = `${start}-${end} de ${total} categorias`;
  categoryPrevBtnEl.disabled = page <= 1;
  categoryNextBtnEl.disabled = page >= totalPages;
}

async function loadDeliveryFees() {
  state.deliveryFees = await apiClient.fetchDeliveryFees();
  renderDeliveryFeeList();
  renderSettingsOverview();
}

async function removeDeliveryFee(id) {
  const fee = state.deliveryFees.find((item) => item.id === id);
  const label = fee ? deliveryFeeScopeLabel(fee) : `#${id}`;
  if (!confirm(`Deseja excluir a taxa de entrega de ${label}?`)) return;

  try {
    await apiClient.deleteDeliveryFee(id);
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
  if (!state.accessToken) {
    categoryListEl.innerHTML = '<div class="catalog-admin-preview-empty"><p class="muted">Faça login para gerenciar categorias.</p></div>';
    updateDatalistOptions(categorySearchSuggestionsEl, []);
    renderCategoryMeta();
    return;
  }

  updateDatalistOptions(
    categorySearchSuggestionsEl,
    state.menuCategorias.map((categoria) => ({
      value: categoria.nome,
      label: `${Number(categoria._count?.produtos || 0)} item(ns)`,
    })),
  );

  if (state.menuCategorias.length === 0) {
    const semBusca = String(categoryState.search || '').trim();
    categoryListEl.innerHTML = semBusca
      ? '<div class="catalog-admin-preview-empty"><p class="muted">Nenhuma categoria corresponde ao filtro.</p></div>'
      : '<div class="catalog-admin-preview-empty"><p class="muted">Nenhuma categoria cadastrada.</p></div>';
    renderCategoryMeta();
    return;
  }

  categoryListEl.innerHTML = state.menuCategorias
    .map((categoria) => {
      const totalProdutos = Number(categoria._count?.produtos || 0);
      const ordem = Number(categoria.ordem_exibicao || 0);

      return `
        <article class="catalog-admin-category-card">
          <header class="catalog-admin-category-head">
            <div class="catalog-admin-category-title">
              <h4>${escapeHtml(categoria.nome)}</h4>
              <p>${totalProdutos} item(ns) vinculados nesta categoria.</p>
            </div>
            <div class="catalog-admin-category-actions">
              <button type="button" class="ghost-btn" data-category-edit="${categoria.id}">Editar</button>
              <button type="button" class="ghost-btn" data-category-delete="${categoria.id}">Excluir</button>
            </div>
          </header>
          <div class="catalog-admin-category-metrics">
            <span class="catalog-admin-category-metric">ID ${categoria.id}</span>
            <span class="catalog-admin-category-metric">Ordem ${ordem}</span>
            <span class="catalog-admin-category-metric">${totalProdutos} item(ns)</span>
          </div>
        </article>
      `;
    })
    .join('');

  renderCategoryMeta();
}

function renderCatalogOverview() {
  const totalCategorias = state.allCategorias.length;
  const totalItens = state.allMenuProdutos.length;
  const disponiveis = state.allMenuProdutos.filter((produto) => isProdutoDisponivel(produto)).length;
  const semEstoque = state.allMenuProdutos.filter((produto) => {
    const estoque = normalizeEstoque(produto.estoque_disponivel);
    return estoque !== null && estoque <= 0;
  }).length;

  if (catalogOverviewCategoriasEl) {
    catalogOverviewCategoriasEl.textContent = state.accessToken ? String(totalCategorias) : 'Aguardando';
  }
  if (catalogOverviewCategoriasMetaEl) {
    catalogOverviewCategoriasMetaEl.textContent = state.accessToken
      ? (totalCategorias === 0 ? 'Nenhuma categoria cadastrada.' : 'Grupos que organizam a vitrine da loja.')
      : 'Carregando grupos do cardápio.';
  }
  if (catalogOverviewItensEl) {
    catalogOverviewItensEl.textContent = state.accessToken ? String(totalItens) : 'Aguardando';
  }
  if (catalogOverviewItensMetaEl) {
    catalogOverviewItensMetaEl.textContent = state.accessToken
      ? (totalItens === 0 ? 'Nenhum item cadastrado ainda.' : 'Itens totais presentes no catálogo.')
      : 'Resumo dos produtos cadastrados.';
  }
  if (catalogOverviewDisponiveisEl) {
    catalogOverviewDisponiveisEl.textContent = state.accessToken ? String(disponiveis) : 'Aguardando';
  }
  if (catalogOverviewDisponiveisMetaEl) {
    catalogOverviewDisponiveisMetaEl.textContent = state.accessToken
      ? `${Math.max(totalItens - disponiveis, 0)} item(ns) exigem alguma ação.`
      : 'Itens prontos para venda.';
  }
  if (catalogOverviewSemEstoqueEl) {
    catalogOverviewSemEstoqueEl.textContent = state.accessToken ? String(semEstoque) : 'Aguardando';
  }
  if (catalogOverviewSemEstoqueMetaEl) {
    catalogOverviewSemEstoqueMetaEl.textContent = state.accessToken
      ? (semEstoque === 0 ? 'Nenhum item com estoque zerado.' : 'Itens sem saldo ou que precisam de revisão.')
      : 'Itens que exigem reposição ou revisão.';
  }

  renderAdminNavBadges();
}

function renderCatalogPortal() {
  if (!catalogPortalListEl || !catalogPortalMetaEl) return;

  if (!state.accessToken) {
    catalogPortalMetaEl.textContent = 'Faça login para carregar o cardápio.';
    catalogPortalListEl.innerHTML = '<div class="catalog-admin-preview-empty"><p class="muted">Faça login para visualizar a vitrine do cardápio.</p></div>';
    updateDatalistOptions(catalogPortalSearchSuggestionsEl, []);
    return;
  }

  updateDatalistOptions(
    catalogPortalSearchSuggestionsEl,
    state.allMenuProdutos.map((produto) => ({
      value: produto.nome_doce,
      label: `${productCategoryName(produto.categoria_id || produto.categorias?.id)} · ${brl(produto.preco)}`,
    })),
  );

  if (state.allCategorias.length === 0) {
    catalogPortalMetaEl.textContent = 'Nenhuma categoria cadastrada.';
    catalogPortalListEl.innerHTML = '<div class="catalog-admin-preview-empty"><p class="muted">Cadastre a primeira categoria para começar a montar o cardápio.</p></div>';
    return;
  }

  const selectedCategoryId = String(catalogPortalState.categoria_id || 'all');
  const normalizedCategoryId = state.allCategorias.some((categoria) => String(categoria.id) === selectedCategoryId)
    ? selectedCategoryId
    : 'all';
  const search = String(catalogPortalState.search || '').trim().toLowerCase();

  if (normalizedCategoryId !== selectedCategoryId) {
    catalogPortalState.categoria_id = normalizedCategoryId;
    if (catalogPortalCategoryFilterEl) {
      catalogPortalCategoryFilterEl.value = normalizedCategoryId;
    }
  }

  const visibleCategorias = [...state.allCategorias]
    .sort((a, b) => {
      const ordemA = Number(a.ordem_exibicao || 0);
      const ordemB = Number(b.ordem_exibicao || 0);
      if (ordemA !== ordemB) return ordemA - ordemB;
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' });
    })
    .filter((categoria) => normalizedCategoryId === 'all' || String(categoria.id) === normalizedCategoryId);

  const produtosPorCategoria = state.allMenuProdutos.reduce((acc, produto) => {
    const categoriaId = String(produto.categoria_id || produto.categorias?.id || '');
    if (!acc.has(categoriaId)) {
      acc.set(categoriaId, []);
    }
    acc.get(categoriaId).push(produto);
    return acc;
  }, new Map());

  produtosPorCategoria.forEach((produtos) => {
    produtos.sort((a, b) => String(a.nome_doce || '').localeCompare(String(b.nome_doce || ''), 'pt-BR', { sensitivity: 'base' }));
  });

  const groupedCategorias = visibleCategorias.map((categoria) => {
    const produtosDaCategoria = produtosPorCategoria.get(String(categoria.id)) || [];
    const produtos = search
      ? produtosDaCategoria.filter((produto) => {
        const haystack = [
          produto.nome_doce,
          produto.descricao,
          categoria.nome,
        ].join(' ').toLowerCase();

        return haystack.includes(search);
      })
      : produtosDaCategoria;

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
  if (!state.accessToken) {
    produtoMetaEl.textContent = 'Faça login para carregar itens.';
    produtoPrevBtnEl.disabled = true;
    produtoNextBtnEl.disabled = true;
    return;
  }

  const total = Number(state.produtoPaginationMeta?.total || 0);
  const totalPages = Number(state.produtoPaginationMeta?.totalPages || 1);
  const page = Number(state.produtoPaginationMeta?.page || produtoState.page || 1);
  const pageSize = Number(state.produtoPaginationMeta?.pageSize || produtoState.pageSize || 12);
  const start = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const end = total === 0 ? 0 : Math.min(total, page * pageSize);

  produtoMetaEl.textContent = `${start}-${end} de ${total} itens`;
  produtoPrevBtnEl.disabled = page <= 1;
  produtoNextBtnEl.disabled = page >= totalPages;
}

function renderProdutoList() {
  if (!state.accessToken) {
    produtoListEl.innerHTML = '<div class="catalog-admin-preview-empty"><p class="muted">Faça login para gerenciar itens.</p></div>';
    updateDatalistOptions(produtoSearchSuggestionsEl, []);
    renderProdutoMeta();
    return;
  }

  updateDatalistOptions(
    produtoSearchSuggestionsEl,
    state.menuProdutos.map((produto) => ({
      value: produto.nome_doce,
      label: `${productCategoryName(produto.categoria_id || produto.categorias?.id)} · ${brl(produto.preco)}`,
    })),
  );

  if (state.menuProdutos.length === 0) {
    const semBusca = String(produtoState.search || '').trim();
    const semFiltro = semBusca || produtoState.disponibilidade !== 'all' || produtoState.categoria_id !== 'all';
    produtoListEl.innerHTML = semFiltro
      ? '<div class="catalog-admin-preview-empty"><p class="muted">Nenhum item corresponde ao filtro.</p></div>'
      : '<div class="catalog-admin-preview-empty"><p class="muted">Nenhum item cadastrado.</p></div>';
    renderProdutoMeta();
    return;
  }

  produtoListEl.innerHTML = state.menuProdutos
    .map((produto) => {
      const estoque = normalizeEstoque(produto.estoque_disponivel);
      const disponibilidadeClasse = isProdutoDisponivel(produto) ? 'is-live' : 'is-off';
      const disponibilidadeTexto = availabilityLabel(produto);
      const categoriaNome = productCategoryName(produto.categoria_id || produto.categorias?.id);
      const estoqueTexto = estoque === null ? 'Sem limite de estoque' : (estoque <= 0 ? 'Estoque zerado' : `Estoque ${estoque}`);
      const media = produto.imagem_url
        ? `<img src="${escapeHtml(produto.imagem_url)}" alt="${escapeHtml(produto.nome_doce)}" loading="lazy" />`
        : `<div class="catalog-admin-product-media-fallback">${escapeHtml(String(produto.nome_doce || '?').slice(0, 1).toUpperCase())}</div>`;

      return `
        <article class="catalog-admin-product-card catalog-products-result-card">
          <div class="catalog-admin-product-main">
            <div class="catalog-admin-product-media">${media}</div>
            <div class="catalog-admin-product-copy">
              <div class="catalog-admin-product-head">
                <strong>${escapeHtml(produto.nome_doce)}</strong>
                <span class="catalog-admin-product-price">${brl(produto.preco)}</span>
              </div>
              <p class="catalog-admin-product-description">${escapeHtml(produto.descricao || 'Sem descrição cadastrada.')}</p>
              <div class="catalog-admin-product-tags">
                <span class="catalog-admin-product-tag is-category">${escapeHtml(categoriaNome)}</span>
                <span class="catalog-admin-product-tag ${disponibilidadeClasse}">${escapeHtml(disponibilidadeTexto)}</span>
                <span class="catalog-admin-product-tag is-stock">${escapeHtml(estoqueTexto)}</span>
              </div>
            </div>
          </div>
          <div class="catalog-admin-product-actions">
            <button type="button" class="ghost-btn" data-produto-edit="${produto.id}">Editar</button>
            <button type="button" class="ghost-btn" data-produto-delete="${produto.id}">Excluir</button>
          </div>
        </article>
      `;
    })
    .join('');

  renderProdutoMeta();
}

function applyCatalogSnapshot(snapshot = {}) {
  const categorias = Array.isArray(snapshot.categorias) ? snapshot.categorias : [];
  const produtos = Array.isArray(snapshot.produtos)
    ? snapshot.produtos.map((produto) => normalizeAdminCatalogProduct(produto))
    : [];

  state.allCategorias = categorias;
  state.allMenuProdutos = produtos;
  replaceLookupMap(state.catalogCategoryMap, categorias);
  replaceLookupMap(state.catalogProductMap, produtos);
  const currentCategoryId = produtoCategoriaEl.value;
  populateCategoriaOptions(currentCategoryId);
  populateProdutoCategoriaFilterOptions();
  populateCatalogPortalCategoryFilterOptions();
  renderCatalogOverview();
  renderCatalogPortal();
}

async function loadCatalogSnapshot() {
  const requestId = ++catalogSnapshotLoadRequestId;
  const snapshot = await apiClient.fetchCatalogSnapshot();

  if (requestId !== catalogSnapshotLoadRequestId) {
    return snapshot;
  }

  applyCatalogSnapshot(snapshot);
  return snapshot;
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
  const requestId = ++categoryLoadRequestId;
  const payload = await apiClient.fetchCategorias(categoriasQueryString());

  if (requestId !== categoryLoadRequestId) {
    return state.menuCategorias;
  }

  state.menuCategorias = Array.isArray(payload.data) ? payload.data : [];
  state.categoryPaginationMeta = payload.meta || null;

  if (state.categoryPaginationMeta && categoryState.page > Number(state.categoryPaginationMeta.totalPages || 1)) {
    categoryState.page = Number(state.categoryPaginationMeta.totalPages || 1);
    return loadCategorias();
  }

  renderCategoryList();
}

function produtosQueryString() {
  const produtoOrderBySort = {
    id: 'desc',
    nome_doce: 'asc',
    preco: 'asc',
    estoque_disponivel: 'asc',
    categoria: 'asc',
  };

  return buildQueryString({
    sort: produtoState.sort,
    order: produtoOrderBySort[produtoState.sort] || 'desc',
    page: produtoState.page,
    pageSize: produtoState.pageSize,
    search: produtoState.search,
    disponibilidade: produtoState.disponibilidade,
    categoria_id: produtoState.categoria_id !== 'all' ? produtoState.categoria_id : undefined,
  });
}

async function loadProdutos() {
  const requestId = ++produtoLoadRequestId;
  const payload = await apiClient.fetchProdutos(produtosQueryString());

  if (requestId !== produtoLoadRequestId) {
    return state.menuProdutos;
  }

  state.menuProdutos = Array.isArray(payload.data)
    ? payload.data.map((produto) => normalizeAdminCatalogProduct(produto))
    : [];
  state.produtoPaginationMeta = payload.meta || null;

  if (state.produtoPaginationMeta && produtoState.page > Number(state.produtoPaginationMeta.totalPages || 1)) {
    produtoState.page = Number(state.produtoPaginationMeta.totalPages || 1);
    return loadProdutos();
  }

  renderProdutoList();
}

async function loadCardapioData() {
  await Promise.all([loadCatalogSnapshot(), loadCategorias(), loadProdutos()]);
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
  state.produtoImagemDataUrl = '';
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
  const categoria = state.menuCategorias.find((item) => item.id === categoriaId);
  const vinculados = Number(categoria?._count?.produtos || 0);
  const nome = categoria?.nome ? `"${categoria.nome}" ` : '';
  const cascadeMessage = vinculados > 0
    ? ` Isso também retirará ${vinculados} item(s) dessa categoria do catálogo, sem apagar o histórico de vendas.`
    : '';
  const message = `Deseja excluir essa categoria ${nome.trim()}?${cascadeMessage}`;
  if (!confirm(message)) return;

  try {
    const result = await apiClient.deleteCategoria(categoriaId);
    await loadCardapioData();
    setStatus(
      categoryStatusEl,
      Number(result?.produtos_removidos || 0) > 0
        ? 'Categoria removida e os itens dela foram retirados do catálogo. O histórico de vendas foi preservado.'
        : 'Categoria removida.',
      'ok',
    );
  } catch (error) {
    setStatus(categoryStatusEl, error.message, 'err');
  }
}

async function removeProduto(produtoId) {
  if (!confirm('Deseja excluir esse item do cardápio?')) return;
  try {
    const result = await apiClient.deleteProduto(produtoId);
    await loadCardapioData();
    setStatus(
      produtoStatusEl,
      result?.softDeleted
        ? 'Item removido do catálogo. O histórico de pedidos foi preservado.'
        : result?.deactivated
        ? 'Item vinculado a pedidos antigos. Ele foi marcado como indisponível para preservar o histórico.'
        : 'Item removido.',
      'ok',
    );
  } catch (error) {
    setStatus(produtoStatusEl, error.message, 'err');
  }
}

async function loadAdminData(options = {}) {
  const { allowRefresh = true } = options;
  if (!state.accessToken && !state.refreshToken) return;

  try {
    if (!state.accessToken && state.refreshToken) {
      await refreshAdminSession();
    }

    await loadCurrentUser();
    await Promise.all([
      loadDashboard(),
      loadDashboardQueue(),
      loadCustomers(),
      loadOrders(),
      loadStoreSettings(),
      loadCardapioData(),
      loadDeliveryFees(),
      loadWhatsAppSessionStatus().catch((error) => {
        setStatus(whatsappSessionStatusEl, error.message, 'muted');
      }),
    ]);
    document.dispatchEvent(new CustomEvent('admin:session-active'));
  } catch (error) {
    if (allowRefresh && error.status === 401 && state.refreshToken) {
      try {
        await refreshAdminSession();
        await loadAdminData({ allowRefresh: false });
        return;
      } catch {
        clearSession();
        setStatus(loginStatusEl, 'Sessão expirada. Faça login novamente.', 'err');
        return;
      }
    }

    if (error.status === 401 || error.status === 403) {
      clearSession();
      setStatus(loginStatusEl, 'Sessão expirada. Faça login novamente.', 'err');
      return;
    }

    setStatus(loginStatusEl, error.message, 'err');
  }
}

loginFormEl?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    username: String(loginUsernameEl?.value || '').trim(),
    password: String(loginPasswordEl?.value || ''),
  };
  const rememberSession = Boolean(loginRememberEl?.checked);

  if (!payload.username) {
    setStatus(loginStatusEl, 'Informe o usuário administrativo.', 'err');
    loginUsernameEl?.focus();
    return;
  }

  if (!payload.password) {
    setStatus(loginStatusEl, 'Informe sua senha.', 'err');
    loginPasswordEl?.focus();
    return;
  }

  setLoginBusy(true);
  setStatus(loginStatusEl, 'Validando acesso...', 'muted');

  try {
    const data = await apiClient.login(payload);
    state.currentUser = data.user;
    persistSessionTokens(data, rememberSession);
    storeRememberedUsername(payload.username, rememberSession);
    applySessionUi();
    setStatus(
      loginStatusEl,
      rememberSession
        ? 'Login realizado. Sessão mantida neste dispositivo.'
        : 'Login realizado com sucesso.',
      'ok',
    );
    if (loginPasswordEl) loginPasswordEl.value = '';
    await loadAdminData({ allowRefresh: false });
  } catch (error) {
    if (loginPasswordEl) {
      loginPasswordEl.select();
    }
    setStatus(loginStatusEl, error.message, 'err');
  } finally {
    setLoginBusy(false);
  }
});
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
  dashboardDateLabelEl,
  dashboardRefreshBtnEl,
  dashboardOpenOrdersBtnEl,
  dashboardPendingAlertEl,
  dashboardPendingAlertTextEl,
  dashboardPendingAlertBtnEl,
  dashboardQueueMetaEl,
  dashboardQueueListEl,
  kpiTotalPedidosEl,
  kpiTotalPedidosTrendEl,
  kpiPendentesEl,
  kpiPreparandoEl,
  kpiEntreguesEl,
  kpiFaturamentoEl,
  kpiFaturamentoTrendEl,
  kpiTicketMedioEl,
  kpiTicketMedioTrendEl,
  sidebarStoreStatusCardEl,
  sidebarStoreStatusTextEl,
  sidebarStoreStatusMetaEl,
  navOrdersBadgeEl,
  navCatalogBadgeEl,
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
  ordersArrivalNoticeEl,
  ordersArrivalTitleEl,
  ordersArrivalTextEl,
  ordersArrivalSummaryEl,
  ordersArrivalOrderIdEl,
  ordersArrivalCustomerEl,
  ordersArrivalOrderMetaEl,
  ordersArrivalJumpBtnEl,
  ordersArrivalDismissBtnEl,
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
  whatsappSettingsFormEl,
  whatsappSettingsStatusEl,
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
  formatOrderCode,
  pluralize,
  formatDaysSinceLastOrder,
  formatDaysSinceLastOrderCompact,
  formatAddress,
  escapeHtml,
  setStatus,
  clearStatus,
  showToast,
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
  refreshAdminSession,
  loadCurrentUser,
  loadDashboard,
  renderDashboard,
  loadDashboardQueue,
  renderDashboardQueue,
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
  toggleSidebarStoreStatus,
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
  createCategoria: apiClient.createCategoria,
  updateCategoria: apiClient.updateCategoria,
  createProduto: apiClient.createProduto,
  updateProduto: apiClient.updateProduto,
  findCategoriaById,
  findProdutoById,
  populateCategoriaOptions,
  populateProdutoCategoriaFilterOptions,
  populateCatalogPortalCategoryFilterOptions,
  resetCategoriaForm,
  resetProdutoForm,
  loadCatalogSnapshot,
  loadCategorias,
  loadProdutos,
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
bindRealtimeSection(ctx);
bindCustomersSection(ctx);
bindOrdersSection(ctx);
bindSettingsSection(ctx);
bindCatalogSection(ctx);
bindBroadcastSection(ctx);


window.addEventListener('popstate', () => {
  syncAdminViewFromLocation();
});

window.addEventListener('hashchange', () => {
  syncAdminViewFromLocation();
});

passwordToggleEls.forEach((button) => {
  button.addEventListener('click', () => {
    togglePasswordVisibility(button);
  });
});

if (loginPasswordEl) {
  ['keydown', 'keyup'].forEach((eventName) => {
    loginPasswordEl.addEventListener(eventName, handlePasswordCapsLock);
  });
  loginPasswordEl.addEventListener('blur', () => {
    handlePasswordCapsLock();
  });
}

if (clearRememberedLoginBtnEl) {
  clearRememberedLoginBtnEl.addEventListener('click', () => {
    adminStore.clearRememberedLoginData();
    updateRememberedLoginUi();
    if (!state.accessToken && loginUsernameEl) {
      loginUsernameEl.value = '';
      loginUsernameEl.focus();
    }
    setStatus(loginStatusEl, 'Dados salvos deste dispositivo foram removidos.', 'muted');
  });
}

if (logoutBtnEl) {
  logoutBtnEl.addEventListener('click', async () => {
    await revokeAdminSession();
    clearSession();
    setStatus(loginStatusEl, 'Você saiu da sessão.', 'muted');
  });
}

syncAdminViewFromLocation({ replace: true });
updateRememberedLoginUi();
setLoginPasswordAssist(LOGIN_PASSWORD_ASSIST_DEFAULT);
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
if (state.accessToken || state.refreshToken) {
  loadAdminData();
} else {
  clearSession();
}
