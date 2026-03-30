const statusEl = document.getElementById('trackingStatus');
const leadEl = document.getElementById('trackingLead');
const orderHeadingEl = document.getElementById('trackingOrderHeading');
const orderIdEl = document.getElementById('trackingOrderId');
const createdAtEl = document.getElementById('trackingCreatedAt');
const totalEl = document.getElementById('trackingTotal');
const paymentLabelEl = document.getElementById('trackingPaymentLabel');
const summaryEl = document.getElementById('trackingSummary');
const deliveryChipEl = document.getElementById('trackingDeliveryChip');
const paymentChipEl = document.getElementById('trackingPaymentChip');
const checkoutBtnEl = document.getElementById('trackingCheckoutBtn');
const refreshBtnEl = document.getElementById('trackingRefreshBtn');

const DELIVERY_STATUS_LABELS = {
  pendente: 'Recebido',
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

let refreshTimer = null;

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDateTime(value) {
  if (!value) return '--';

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return '--';
  }
}

function deliveryStatusLabel(value) {
  return DELIVERY_STATUS_LABELS[value] || value || 'Nao informado';
}

function paymentStatusLabel(value) {
  return PAYMENT_STATUS_LABELS[value] || value || 'Nao informado';
}

function setStatus(message, tone = 'muted') {
  statusEl.textContent = message;
  statusEl.className = `status-text ${tone}`;
}

function updateChip(element, prefix, label, variant) {
  element.textContent = `${prefix} ${label}`;
  element.className = `info-chip order-tracking-chip ${variant}`;
}

function chipVariant(status, type) {
  if (status === 'entregue' || status === 'pago') return 'is-positive';
  if (status === 'cancelado' || status === 'falhou' || status === 'expirado' || status === 'estornado') {
    return 'is-negative';
  }
  if (status === 'saiu_para_entrega') return 'is-accent';
  if (type === 'payment' && status === 'pendente') return 'is-warning';
  return 'is-neutral';
}

async function parseResponse(response) {
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('Resposta invalida do servidor.');
    }
  }

  if (!response.ok) {
    const message = payload?.error?.message || 'Nao foi possivel consultar o pedido.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload?.data;
}

function getOrderIdFromPath() {
  const match = window.location.pathname.match(/^\/pedido\/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function getTrackingStorageKey(orderId) {
  return `donilla:tracking:${orderId}`;
}

function readStoredTrackingToken(orderId) {
  try {
    return window.sessionStorage.getItem(getTrackingStorageKey(orderId));
  } catch {
    return null;
  }
}

function persistTrackingToken(orderId, token) {
  try {
    window.sessionStorage.setItem(getTrackingStorageKey(orderId), token);
  } catch {
    // Ignora falhas de armazenamento.
  }
}

function consumeTrackingToken(orderId) {
  const currentUrl = new URL(window.location.href);
  const tokenFromQuery = String(currentUrl.searchParams.get('token') || '').trim();
  const storedToken = readStoredTrackingToken(orderId);
  const token = tokenFromQuery || storedToken || '';

  if (tokenFromQuery) {
    persistTrackingToken(orderId, tokenFromQuery);
    currentUrl.searchParams.delete('token');
    window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  }

  return token;
}

function buildSummary(order) {
  const deliveryLabel = deliveryStatusLabel(order.status_entrega);
  const paymentLabel = paymentStatusLabel(order.status_pagamento);

  if (order.status_pagamento === 'pendente' && order.checkout_url) {
    return `Pedido #${order.id} confirmado. Pagamento ainda pendente. Use o botao abaixo para concluir o checkout com seguranca.`;
  }

  if (order.status_entrega === 'saiu_para_entrega') {
    return `Pedido #${order.id} saiu para entrega. Pagamento: ${paymentLabel}.`;
  }

  return `Pedido #${order.id} em ${deliveryLabel.toLowerCase()}. Pagamento: ${paymentLabel}.`;
}

function renderOrder(order) {
  orderHeadingEl.textContent = `Pedido #${order.id}`;
  orderIdEl.textContent = `#${order.id}`;
  createdAtEl.textContent = formatDateTime(order.criado_em);
  totalEl.textContent = formatMoney(order.valor_total);
  paymentLabelEl.textContent = paymentStatusLabel(order.status_pagamento);
  summaryEl.textContent = buildSummary(order);
  leadEl.textContent = `Link seguro para acompanhar o pedido #${order.id} em tempo real.`;

  updateChip(
    deliveryChipEl,
    'Entrega:',
    deliveryStatusLabel(order.status_entrega),
    chipVariant(order.status_entrega, 'delivery'),
  );
  updateChip(
    paymentChipEl,
    'Pagamento:',
    paymentStatusLabel(order.status_pagamento),
    chipVariant(order.status_pagamento, 'payment'),
  );

  if (order.checkout_url) {
    checkoutBtnEl.href = order.checkout_url;
    checkoutBtnEl.classList.remove('hidden');
  } else {
    checkoutBtnEl.removeAttribute('href');
    checkoutBtnEl.classList.add('hidden');
  }
}

async function loadTracking() {
  const orderId = getOrderIdFromPath();
  if (!orderId) {
    setStatus('Link de acompanhamento invalido.', 'err');
    return;
  }

  const trackingToken = consumeTrackingToken(orderId);
  if (!trackingToken) {
    setStatus('Token de rastreio ausente. Abra o link enviado no WhatsApp novamente.', 'err');
    return;
  }

  setStatus('Atualizando status do pedido...', 'muted');

  try {
    const response = await fetch(`/public/orders/${orderId}/tracking?token=${encodeURIComponent(trackingToken)}`, {
      headers: {
        Accept: 'application/json',
      },
    });

    const order = await parseResponse(response);
    renderOrder(order);
    setStatus(`Atualizado em ${formatDateTime(new Date().toISOString())}.`, 'ok');
  } catch (error) {
    setStatus(error.message || 'Nao foi possivel consultar o pedido.', 'err');
  }
}

function startAutoRefresh() {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
  }

  refreshTimer = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    loadTracking().catch(() => {});
  }, 15000);
}

refreshBtnEl?.addEventListener('click', () => {
  loadTracking().catch(() => {});
});

window.addEventListener('focus', () => {
  loadTracking().catch(() => {});
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  loadTracking().catch(() => {});
});

loadTracking().catch(() => {});
startAutoRefresh();
