const ORDERS_AUTO_REFRESH_INTERVAL_MS = 5000;
const NEW_ORDER_HIGHLIGHT_DURATION_MS = 16000;
const ORDER_ARRIVAL_FOCUS_DURATION_MS = 2400;

export function bindOrdersSection(ctx) {
  const { dom, state, helpers, api } = ctx;
  let autoRefreshRunning = false;
  let lastOrdersSignature = '';
  let ordersSnapshotReady = false;
  let knownOrderIds = new Set();
  let highlightedOrderIds = new Set();
  let pendingArrivalIds = [];
  const orderHighlightTimers = new Map();
  const ordersQuickFilterButtons = Array.from(document.querySelectorAll('[data-orders-quick-filter]'));
  const debouncedLoadOrdersSearch = helpers.createDebounce(220, () => {
    if (!state.accessToken) return;
    api.loadOrders().catch((error) => helpers.setStatus(dom.ordersStatusEl, error.message, 'err'));
  });

  function paymentMethodLabel(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'pix') return 'Pix';
    if (normalized === 'asaas_checkout') return 'Pagamento online';
    return value ? String(value) : '--';
  }

  function buildOrdersSignature() {
    return JSON.stringify({
      page: Number(state.ordersState.page || 1),
      pageSize: Number(state.ordersState.pageSize || 10),
      status: state.ordersState.status || 'all',
      search: state.ordersState.search || '',
      period: state.ordersState.period || 'today',
      from: state.ordersState.from || '',
      to: state.ordersState.to || '',
    });
  }

  function normalizeOrderIds(orders = []) {
    return orders
      .map((order) => Number(order?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  function hideArrivalNotice() {
    pendingArrivalIds = [];
    if (!dom.ordersArrivalNoticeEl) return;
    dom.ordersArrivalNoticeEl.classList.add('hidden');
    dom.ordersArrivalSummaryEl?.classList.add('hidden');
  }

  function showArrivalNotice(arrivalIds) {
    pendingArrivalIds = arrivalIds.slice();
    if (!dom.ordersArrivalNoticeEl) return;
    const latestArrival = state.allOrders.find((order) => arrivalIds.includes(Number(order?.id || 0))) || null;

    const count = arrivalIds.length;
    if (dom.ordersArrivalTitleEl) {
      dom.ordersArrivalTitleEl.textContent = count === 1 ? 'Novo pedido recebido' : 'Novos pedidos recebidos';
    }
    if (dom.ordersArrivalTextEl) {
      dom.ordersArrivalTextEl.textContent = count === 1
        ? 'O pedido entrou agora e ficou destacado para voce agir sem rolar a pagina.'
        : `${count} pedidos entraram agora e ficaram destacados para voce agir sem rolar a pagina.`;
    }
    if (latestArrival && dom.ordersArrivalSummaryEl) {
      dom.ordersArrivalSummaryEl.classList.remove('hidden');
      if (dom.ordersArrivalOrderIdEl) {
        dom.ordersArrivalOrderIdEl.textContent = `Pedido #${latestArrival.id}`;
      }
      if (dom.ordersArrivalCustomerEl) {
        dom.ordersArrivalCustomerEl.textContent = latestArrival.clientes?.nome || 'Cliente sem nome';
      }
      if (dom.ordersArrivalOrderMetaEl) {
        const metaParts = [
          helpers.dateTime(latestArrival.criado_em),
          helpers.brl(latestArrival.valor_total),
          paymentMethodLabel(latestArrival.metodo_pagamento),
        ];
        if (count > 1) {
          metaParts.push(`+${count - 1} novo(s)`);
        }
        dom.ordersArrivalOrderMetaEl.textContent = metaParts.join(' · ');
      }
    }

    dom.ordersArrivalNoticeEl.classList.remove('hidden');
  }

  function getOrderCardById(orderId) {
    return dom.ordersListEl?.querySelector(`[data-order-card-id="${Number(orderId || 0)}"]`) || null;
  }

  function applyOrderHighlights() {
    if (!dom.ordersListEl) return;

    dom.ordersListEl.querySelectorAll('.order-card.is-fresh').forEach((card) => {
      card.classList.remove('is-fresh');
    });

    highlightedOrderIds.forEach((orderId) => {
      const card = getOrderCardById(orderId);
      if (card) {
        card.classList.add('is-fresh');
      }
    });
  }

  function clearOrderHighlightTimer(orderId) {
    const timerId = orderHighlightTimers.get(orderId);
    if (!timerId) return;
    window.clearTimeout(timerId);
    orderHighlightTimers.delete(orderId);
  }

  function removeOrderHighlight(orderId) {
    clearOrderHighlightTimer(orderId);
    highlightedOrderIds.delete(orderId);
    const card = getOrderCardById(orderId);
    if (card) {
      card.classList.remove('is-fresh');
      card.classList.remove('is-arrival-focus');
    }
  }

  function clearAllOrderHighlights() {
    orderHighlightTimers.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    orderHighlightTimers.clear();
    highlightedOrderIds = new Set();
    applyOrderHighlights();
  }

  function scheduleOrderHighlightExpiry(orderId) {
    clearOrderHighlightTimer(orderId);
    const timerId = window.setTimeout(() => {
      removeOrderHighlight(orderId);
    }, NEW_ORDER_HIGHLIGHT_DURATION_MS);
    orderHighlightTimers.set(orderId, timerId);
  }

  function resetArrivalTracking() {
    lastOrdersSignature = '';
    ordersSnapshotReady = false;
    knownOrderIds = new Set();
    clearAllOrderHighlights();
    hideArrivalNotice();
  }

  function scrollToArrivalOrder() {
    const targetId = pendingArrivalIds.find((orderId) => Boolean(getOrderCardById(orderId)));
    const targetCard = targetId ? getOrderCardById(targetId) : dom.ordersListEl?.querySelector('.order-card');
    if (!targetCard) {
      hideArrivalNotice();
      return;
    }

    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetCard.classList.add('is-arrival-focus');
    window.setTimeout(() => {
      targetCard.classList.remove('is-arrival-focus');
    }, ORDER_ARRIVAL_FOCUS_DURATION_MS);
    hideArrivalNotice();
  }

  function syncArrivalStateFromCurrentOrders() {
    const currentSignature = buildOrdersSignature();
    const currentIds = normalizeOrderIds(state.allOrders);

    if (!state.accessToken || !dom.ordersPanelEl || dom.ordersPanelEl.classList.contains('hidden')) {
      lastOrdersSignature = currentSignature;
      knownOrderIds = new Set(currentIds);
      ordersSnapshotReady = true;
      clearAllOrderHighlights();
      hideArrivalNotice();
      return;
    }

    if (!ordersSnapshotReady || currentSignature !== lastOrdersSignature) {
      lastOrdersSignature = currentSignature;
      ordersSnapshotReady = true;
      knownOrderIds = new Set(currentIds);
      clearAllOrderHighlights();
      hideArrivalNotice();
      return;
    }

    if (Number(state.ordersState.page || 1) !== 1) {
      knownOrderIds = new Set(currentIds);
      clearAllOrderHighlights();
      hideArrivalNotice();
      return;
    }

    const newArrivalIds = currentIds.filter((orderId) => !knownOrderIds.has(orderId));
    knownOrderIds = new Set(currentIds);
    applyOrderHighlights();

    if (!newArrivalIds.length) {
      return;
    }

    newArrivalIds.forEach((orderId) => {
      highlightedOrderIds.add(orderId);
      scheduleOrderHighlightExpiry(orderId);
    });

    applyOrderHighlights();
    showArrivalNotice(newArrivalIds);
  }

  function shouldAutoRefreshOrders() {
    if (!state.accessToken) return false;
    if (!dom.ordersPanelEl || dom.ordersPanelEl.classList.contains('hidden')) return false;
    if (document.hidden) return false;
    if (dom.ordersListEl.contains(document.activeElement)) return false;
    return helpers.validateRangeState(state.ordersState, dom.ordersStatusEl, 'pedidos');
  }

  async function refreshOrdersAutomatically() {
    if (autoRefreshRunning || !shouldAutoRefreshOrders()) return;

    autoRefreshRunning = true;
    try {
      await api.loadOrders();
    } catch (error) {
      helpers.setStatus(dom.ordersStatusEl, error.message, 'err');
    } finally {
      autoRefreshRunning = false;
    }
  }

  window.setInterval(() => {
    refreshOrdersAutomatically();
  }, ORDERS_AUTO_REFRESH_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    refreshOrdersAutomatically();
  });

  window.addEventListener('focus', () => {
    refreshOrdersAutomatically();
  });

  if (dom.ordersPanelEl && typeof MutationObserver !== 'undefined') {
    const visibilityObserver = new MutationObserver(() => {
      if (!dom.ordersPanelEl.classList.contains('hidden')) return;
      hideArrivalNotice();
    });
    visibilityObserver.observe(dom.ordersPanelEl, { attributes: true, attributeFilter: ['class'] });
  }

  document.addEventListener('admin:orders-loaded', () => {
    syncArrivalStateFromCurrentOrders();
  });

  dom.ordersArrivalJumpBtnEl?.addEventListener('click', () => {
    scrollToArrivalOrder();
  });

  dom.ordersArrivalDismissBtnEl?.addEventListener('click', () => {
    hideArrivalNotice();
  });

  dom.refreshOrdersBtnEl.addEventListener('click', async () => {
    if (!state.accessToken) return;

    try {
      await api.loadOrders();
    } catch (error) {
      helpers.setStatus(dom.ordersStatusEl, error.message, 'err');
    }
  });

  ordersQuickFilterButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const nextStatus = button.dataset.ordersQuickFilter || 'all';
      state.ordersState.status = nextStatus;
      state.ordersState.page = 1;
      hideArrivalNotice();

      if (dom.statusFilterEl) {
        dom.statusFilterEl.value = nextStatus;
      }

      if (!state.accessToken) return;

      try {
        await api.loadOrders();
      } catch (error) {
        helpers.setStatus(dom.ordersStatusEl, error.message, 'err');
      }
    });
  });

  dom.applyOrdersFiltersBtnEl.addEventListener('click', async () => {
    api.syncOrdersStateFromControls();
    state.ordersState.page = 1;
    hideArrivalNotice();
    if (!state.accessToken) return;

    try {
      await api.loadOrders();
    } catch (error) {
      helpers.setStatus(dom.ordersStatusEl, error.message, 'err');
    }
  });

  dom.ordersSearchInputEl.addEventListener('input', () => {
    api.syncOrdersStateFromControls();
    state.ordersState.page = 1;
    hideArrivalNotice();
    debouncedLoadOrdersSearch();
  });

  dom.ordersSearchInputEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    dom.applyOrdersFiltersBtnEl.click();
  });

  dom.statusFilterEl.addEventListener('change', async () => {
    state.ordersState.status = dom.statusFilterEl.value;
    state.ordersState.page = 1;
    hideArrivalNotice();
    if (!state.accessToken) return;

    try {
      await api.loadOrders();
    } catch (error) {
      helpers.setStatus(dom.ordersStatusEl, error.message, 'err');
    }
  });

  dom.ordersRangePresetEl.addEventListener('change', async () => {
    state.ordersState.period = dom.ordersRangePresetEl.value;
    helpers.syncRangeInputs(dom.ordersRangePresetEl, dom.ordersFromDateEl, dom.ordersToDateEl, state.ordersState);
    hideArrivalNotice();

    if (!state.accessToken) {
      helpers.validateRangeState(state.ordersState, dom.ordersStatusEl, 'pedidos');
      return;
    }

    if (state.ordersState.period === 'custom') {
      helpers.validateRangeState(state.ordersState, dom.ordersStatusEl, 'pedidos');
      return;
    }

    state.ordersState.page = 1;
    try {
      await api.loadOrders();
    } catch (error) {
      helpers.setStatus(dom.ordersStatusEl, error.message, 'err');
    }
  });

  dom.ordersPageSizeInputEl.addEventListener('change', async () => {
    state.ordersState.pageSize = Number(dom.ordersPageSizeInputEl.value || 10);
    state.ordersState.page = 1;
    hideArrivalNotice();
    if (!state.accessToken) return;

    try {
      await api.loadOrders();
    } catch (error) {
      helpers.setStatus(dom.ordersStatusEl, error.message, 'err');
    }
  });

  dom.ordersFromDateEl.addEventListener('change', () => {
    state.ordersState.from = dom.ordersFromDateEl.value || '';
    hideArrivalNotice();
    helpers.validateRangeState(state.ordersState, dom.ordersStatusEl, 'pedidos');
  });

  dom.ordersToDateEl.addEventListener('change', () => {
    state.ordersState.to = dom.ordersToDateEl.value || '';
    hideArrivalNotice();
    helpers.validateRangeState(state.ordersState, dom.ordersStatusEl, 'pedidos');
  });

  dom.ordersPrevBtnEl.addEventListener('click', async () => {
    if (state.ordersState.page <= 1 || !state.accessToken) return;
    state.ordersState.page -= 1;
    hideArrivalNotice();
    await api.loadOrders().catch((error) => helpers.setStatus(dom.ordersStatusEl, error.message, 'err'));
  });

  dom.ordersNextBtnEl.addEventListener('click', async () => {
    if (!state.accessToken) return;
    const totalPages = Number(state.ordersPaginationMeta?.totalPages || 1);
    if (state.ordersState.page >= totalPages) return;
    state.ordersState.page += 1;
    hideArrivalNotice();
    await api.loadOrders().catch((error) => helpers.setStatus(dom.ordersStatusEl, error.message, 'err'));
  });

  dom.ordersListEl.addEventListener('click', async (event) => {
    const auditButton = event.target.closest('button[data-order-audit-toggle]');
    if (auditButton) {
      const orderId = Number(auditButton.dataset.orderAuditToggle);
      if (!orderId) return;

      if (state.expandedOrderAuditIds.has(orderId)) {
        state.expandedOrderAuditIds.delete(orderId);
        auditButton.textContent = 'Ver histórico';
        api.hideOrderAudit(orderId);
        return;
      }

      state.expandedOrderAuditIds.add(orderId);
      auditButton.textContent = 'Ocultar histórico';
      await api.ensureOrderAuditVisible(orderId);
      return;
    }

    const saveButton = event.target.closest('button[data-status-save]');
    if (!saveButton) return;

    const orderId = Number(saveButton.dataset.statusSave);
    const select = dom.ordersListEl.querySelector(`select[data-status-select="${orderId}"]`);
    const paymentSelect = dom.ordersListEl.querySelector(`select[data-payment-status-select="${orderId}"]`);
    if (!select || !paymentSelect) return;

    saveButton.disabled = true;
    const nextStatus = select.value;
    const nextPaymentStatus = paymentSelect.value;

    try {
      const response = await fetch(`/admin/orders/${orderId}/status`, {
        method: 'PUT',
        headers: helpers.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          status_entrega: nextStatus,
          status_pagamento: nextPaymentStatus,
        }),
      });

      await helpers.parseResponse(response);
      state.orderAuditCache.delete(orderId);
      resetArrivalTracking();
      await Promise.all([api.loadDashboard(), api.loadOrders()]);
    } catch (error) {
      helpers.setStatus(dom.ordersStatusEl, error.message, 'err');
    } finally {
      saveButton.disabled = false;
    }
  });
}
