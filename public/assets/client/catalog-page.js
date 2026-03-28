import { brl, escapeHtml, normalizeLocationText, formatDeliveryWindow } from '../shared/utils.js?v=20260328b'
import { initCart } from './cart-module.js?v=20260328a'
import { initCatalog } from './catalog-module.js?v=20260328a'

const menuSectionsEl = document.getElementById('menuSections');
const categoryTabsEl = document.getElementById('categoryTabs');
const searchInputEl = document.getElementById('searchInput');
const storeNoticeEl = document.getElementById('storeNotice');

const chipStatusEl = document.getElementById('chipStatus');
const chipDeliveryEl = document.getElementById('chipDelivery');
const chipFeeEl = document.getElementById('chipFee');

const cartItemsEl = document.getElementById('cartItems');
const cartCountEl = document.getElementById('cartCount');
const totalItensEl = document.getElementById('totalItens');
const totalEntregaEl = document.getElementById('totalEntrega');
const totalGeralEl = document.getElementById('totalGeral');

const checkoutFormEl = document.getElementById('checkoutForm');
const checkoutBtnEl = document.getElementById('checkoutBtn');
const orderStatusEl = document.getElementById('orderStatus');

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

const CUSTOMER_SESSION_KEY = 'donilla_customer_session';
const cartController = initCart({
  cartItemsEl,
  cartCountEl,
  totalItensEl,
  totalEntregaEl,
  totalGeralEl,
}, {
  formatCurrency: brl,
  escapeHtml,
});
const catalogController = initCatalog({
  menuSectionsEl,
  categoryTabsEl,
  searchInputEl,
}, {
  escapeHtml,
  formatCurrency: brl,
  onAddItem(product) {
    cartController.addItem(product);
  },
});

let lojaAberta = true;
let storeConfig = {
  loja_aberta: true,
  tempo_entrega_minutos: 40,
  tempo_entrega_max_minutos: 60,
  taxa_entrega_padrao: 0,
  taxas_entrega_locais: [],
};

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function parseOrderId(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getDeliveryFeeMatchScore(rule, endereco) {
  const ruleBairro = normalizeLocationText(rule?.bairro);
  const ruleCidade = normalizeLocationText(rule?.cidade);
  const addressBairro = normalizeLocationText(endereco?.bairro);
  const addressCidade = normalizeLocationText(endereco?.cidade);

  if (!ruleBairro && !ruleCidade) return -1;
  if (ruleBairro && ruleCidade) {
    return ruleBairro === addressBairro && ruleCidade === addressCidade ? 3 : -1;
  }
  if (ruleBairro) {
    return ruleBairro === addressBairro ? 2 : -1;
  }
  if (ruleCidade) {
    return ruleCidade === addressCidade ? 1 : -1;
  }
  return -1;
}

function resolveDeliveryFee(endereco) {
  const defaultFee = Number(storeConfig?.taxa_entrega_padrao || 0);
  const rules = Array.isArray(storeConfig?.taxas_entrega_locais) ? storeConfig.taxas_entrega_locais : [];

  let matchedRule = null;
  let bestScore = -1;

  rules.forEach((rule) => {
    if (rule?.ativo === false) return;
    const score = getDeliveryFeeMatchScore(rule, endereco);
    if (score > bestScore) {
      matchedRule = rule;
      bestScore = score;
    }
  });

  return matchedRule ? Number(matchedRule.valor_entrega || 0) : defaultFee;
}

function updateDeliveryFeeUi(session = loadCustomerSession()) {
  const deliveryFee = resolveDeliveryFee(session?.endereco || null);
  cartController.setDeliveryFee(deliveryFee);
  chipFeeEl.textContent = `Taxa ${brl(deliveryFee)}`;
}

function setStatus(target, message, type = 'muted') {
  target.textContent = message;
  target.className = `status-text ${type}`;
}

function orderStatusLabel(value) {
  return STATUS_LABELS[String(value || 'pendente').trim()] || 'Pendente';
}

function paymentStatusLabel(value) {
  return PAYMENT_STATUS_LABELS[String(value || 'pendente').trim()] || 'Aguardando pagamento';
}

async function parseResponse(response) {
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

  return payload?.data;
}

function loadCustomerSession() {
  try {
    const raw = localStorage.getItem(CUSTOMER_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const nome = parsed.nome || parsed.cliente?.nome || '';
    const telefone = parsed.telefone || parsed.telefone_whatsapp || parsed.cliente?.telefone_whatsapp || '';
    const endereco = parsed.endereco && typeof parsed.endereco === 'object' ? parsed.endereco : null;

    return {
      ...parsed,
      nome,
      telefone,
      endereco,
      cliente_session_token: parsed.cliente_session_token || '',
    };
  } catch {
    return null;
  }
}

function clearCustomerSession() {
  localStorage.removeItem(CUSTOMER_SESSION_KEY);
  checkoutFormEl.reset();
}

function getCustomerAuthHeaders() {
  const session = loadCustomerSession();
  if (!session?.cliente_session_token) return null;
  return {
    'x-customer-session-token': session.cliente_session_token,
  };
}

async function fetchCustomerOrderStatus(orderId) {
  const headers = getCustomerAuthHeaders();
  if (!headers) throw Object.assign(new Error('Sessão não encontrada.'), { status: 401 });

  const response = await fetch(`/api/orders/${orderId}/status`, {
    method: 'GET',
    headers,
  });

  return parseResponse(response);
}

function syncCustomerSession() {
  const session = loadCustomerSession();

  if (!session || !session.cliente_session_token || !session.nome || !session.telefone) {
    updateDeliveryFeeUi(null);
    setStatus(orderStatusEl, 'Sessão não encontrada. Faça login para continuar.', 'muted');
    checkoutBtnEl.disabled = true;
    return;
  }

  const endereco = session.endereco || null;
  updateDeliveryFeeUi(session);

  if (!lojaAberta) {
    checkoutBtnEl.disabled = true;
    setStatus(orderStatusEl, 'Loja fechada no momento. Finalização indisponível.', 'err');
    return;
  }

  checkoutBtnEl.disabled = false;
  setStatus(orderStatusEl, '', 'muted');

  if (!endereco || !endereco.rua || !endereco.numero || !endereco.bairro) {
    setStatus(orderStatusEl, 'Endereço incompleto no seu cadastro. Atualize seu cadastro se necessário.', 'muted');
  }
}

function buildCheckoutReturnMessage(checkoutStatus, order) {
  const orderLabel = order?.id ? `#${order.id}` : 'recente';
  const paymentStatus = String(order?.status_pagamento || '').trim().toLowerCase();

  if (paymentStatus === 'pago') {
    return {
      tone: 'ok',
      message: `Recebemos sua tentativa de pagamento do pedido ${orderLabel} e a confirmação já entrou no sistema. Agora é só acompanhar o andamento pelo seu painel.`,
    };
  }

  if (paymentStatus === 'cancelado' || paymentStatus === 'expirado' || paymentStatus === 'falhou' || paymentStatus === 'estornado') {
    return {
      tone: 'err',
      message: `O pedido ${orderLabel} ainda não teve pagamento confirmado. Gere um novo pedido para tentar novamente.`,
    };
  }

  if (checkoutStatus === 'success') {
    return {
      tone: 'muted',
      message: `Recebemos sua tentativa de pagamento do pedido ${orderLabel}. Estamos confirmando com o provedor e isso pode levar alguns instantes para aparecer.`,
    };
  }

  if (checkoutStatus === 'cancel') {
    return {
      tone: 'err',
      message: `Você voltou sem concluir o pagamento online do pedido ${orderLabel}. Gere um novo pedido para tentar novamente.`,
    };
  }

  if (checkoutStatus === 'expired') {
    return {
      tone: 'err',
      message: `O tempo de pagamento do pedido ${orderLabel} terminou. Gere um novo pedido para receber outro link.`,
    };
  }

  return {
    tone: 'muted',
    message: 'Recebemos seu retorno do pagamento.',
  };
}

async function consumeCheckoutFeedback() {
  const currentUrl = new URL(window.location.href);
  const checkoutStatus = String(currentUrl.searchParams.get('checkout_status') || '').trim().toLowerCase();
  const orderId = parseOrderId(currentUrl.searchParams.get('order_id'));

  if (!checkoutStatus) return;

  setStatus(
    orderStatusEl,
    checkoutStatus === 'success'
      ? `Recebemos sua tentativa de pagamento do pedido #${orderId || '--'}. Estamos confirmando com o provedor...`
      : 'Estamos atualizando o status do seu pedido...',
    'muted',
  );

  currentUrl.searchParams.delete('checkout_status');
  currentUrl.searchParams.delete('order_id');
  const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
  window.history.replaceState({}, document.title, nextUrl);

  let order = null;

  if (orderId && loadCustomerSession()) {
    const attempts = checkoutStatus === 'success' ? 4 : 2;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        order = await fetchCustomerOrderStatus(orderId);
        const finalPaymentState = ['pago', 'cancelado', 'expirado', 'falhou', 'estornado'];
        if (checkoutStatus !== 'success' || finalPaymentState.includes(order.status_pagamento)) {
          break;
        }
      } catch (error) {
        if (attempt === attempts - 1 && error?.status !== 401) {
          setStatus(orderStatusEl, error.message || 'Não foi possível atualizar seu pedido agora.', 'err');
          return;
        }
      }

      if (attempt < attempts - 1) {
        await wait(1500);
      }
    }
  }

  const feedback = buildCheckoutReturnMessage(checkoutStatus, order || (orderId ? { id: orderId } : null));
  setStatus(orderStatusEl, feedback.message, feedback.tone);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStoreHeader(store) {
  storeConfig = {
    loja_aberta: Boolean(store?.loja_aberta),
    tempo_entrega_minutos: Number(store?.tempo_entrega_minutos || 40),
    tempo_entrega_max_minutos: Number(store?.tempo_entrega_max_minutos || 60),
    taxa_entrega_padrao: Number(store?.taxa_entrega_padrao || 0),
    mensagem_aviso: store?.mensagem_aviso || null,
    loja_status_descricao: store?.loja_status_descricao || null,
    taxas_entrega_locais: Array.isArray(store?.taxas_entrega_locais) ? store.taxas_entrega_locais : [],
  };

  lojaAberta = Boolean(storeConfig.loja_aberta);
  chipStatusEl.textContent = lojaAberta ? 'Loja aberta' : 'Loja fechada';
  chipStatusEl.className = `info-chip ${lojaAberta ? 'chip-open' : 'chip-closed'}`;
  chipDeliveryEl.textContent = `Entrega ${formatDeliveryWindow(storeConfig)}`;

  const notices = [storeConfig.mensagem_aviso, !lojaAberta ? storeConfig.loja_status_descricao : null].filter(Boolean);
  if (notices.length) {
    storeNoticeEl.textContent = notices.join(' ');
    storeNoticeEl.classList.remove('hidden');
  } else {
    storeNoticeEl.classList.add('hidden');
  }

  syncCustomerSession();
}

async function init() {
  try {
    const [storeRes, menuRes] = await Promise.all([fetch('/public/store'), fetch('/public/menu')]);
    const store = await parseResponse(storeRes);
    const menu = await parseResponse(menuRes);

    updateStoreHeader(store || {});
    catalogController.setCategories(Array.isArray(menu) ? menu : []);
  } catch (error) {
    catalogController.renderError(error.message || 'Erro ao carregar cardápio.');
  }
}

checkoutFormEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  const session = loadCustomerSession();

  if (!lojaAberta) {
    setStatus(orderStatusEl, 'Loja fechada no momento.', 'err');
    return;
  }

  if (!session || !session.cliente_session_token || !session.nome || !session.telefone) {
    setStatus(orderStatusEl, 'Sessão não encontrada. Faça login para continuar.', 'err');
    window.location.href = '/';
    return;
  }

  const { items } = cartController.getSnapshot();
  if (!items.length) {
    setStatus(orderStatusEl, 'Adicione itens ao carrinho antes de finalizar.', 'err');
    return;
  }

  setStatus(orderStatusEl, 'Enviando pedido...', 'muted');

  const payload = {
    cliente_session_token: session.cliente_session_token,
    metodo_pagamento: String(checkoutFormEl.elements.metodo.value || 'asaas_checkout').trim(),
    observacoes: String(checkoutFormEl.elements.observacoes?.value || '').trim() || null,
    itens: items.map((item) => ({ produto_id: item.id, quantidade: item.quantidade })),
  };

  if (session.endereco && session.endereco.rua && session.endereco.numero && session.endereco.bairro) {
    payload.endereco = {
      rua: session.endereco.rua,
      numero: session.endereco.numero,
      bairro: session.endereco.bairro,
      ...(session.endereco.cidade ? { cidade: session.endereco.cidade } : {}),
      ...(session.endereco.complemento ? { complemento: session.endereco.complemento } : {}),
      ...(session.endereco.referencia ? { referencia: session.endereco.referencia } : {}),
    };
  }

  try {
    const response = await fetch('/api/checkout/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const order = await parseResponse(response);

    setStatus(
      orderStatusEl,
      `Pedido #${order.id} criado com sucesso. Entrega: ${orderStatusLabel(order.status_entrega)}. Pagamento: ${paymentStatusLabel(order.status_pagamento)}.`,
      'ok',
    );
    if (checkoutFormEl.elements.observacoes) {
      checkoutFormEl.elements.observacoes.value = '';
    }
    cartController.clear();
    syncCustomerSession();

    if (order.checkout_url) {
      setStatus(orderStatusEl, `Pedido #${order.id} criado. Abrindo a tela segura de pagamento...`, 'ok');
      window.setTimeout(() => {
        window.location.assign(order.checkout_url);
      }, 150);
      return;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    if (error.status === 401 || error.message.includes('token')) {
      clearCustomerSession();
      syncCustomerSession();
      setStatus(orderStatusEl, 'Sessão inválida. Faça login novamente.', 'err');
      return;
    }

    setStatus(orderStatusEl, error.message, 'err');
  }
});

init();
consumeCheckoutFeedback();
