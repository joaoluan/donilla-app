export function bindOrdersSection(ctx) {
  const { dom, state, helpers, api } = ctx;

  const debouncedLoadOrdersSearch = helpers.createDebounce(220, () => {
    if (!state.accessToken) return;
    api.loadOrders().catch((error) => helpers.setStatus(dom.ordersStatusEl, error.message, 'err'));
  });

  dom.refreshOrdersBtnEl.addEventListener('click', async () => {
    if (!state.accessToken) return;

    try {
      await api.loadOrders();
    } catch (error) {
      helpers.setStatus(dom.ordersStatusEl, error.message, 'err');
    }
  });

  dom.applyOrdersFiltersBtnEl.addEventListener('click', async () => {
    api.syncOrdersStateFromControls();
    state.ordersState.page = 1;
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
    if (!state.accessToken) return;

    try {
      await api.loadOrders();
    } catch (error) {
      helpers.setStatus(dom.ordersStatusEl, error.message, 'err');
    }
  });

  dom.ordersFromDateEl.addEventListener('change', () => {
    state.ordersState.from = dom.ordersFromDateEl.value || '';
    helpers.validateRangeState(state.ordersState, dom.ordersStatusEl, 'pedidos');
  });

  dom.ordersToDateEl.addEventListener('change', () => {
    state.ordersState.to = dom.ordersToDateEl.value || '';
    helpers.validateRangeState(state.ordersState, dom.ordersStatusEl, 'pedidos');
  });

  dom.ordersPrevBtnEl.addEventListener('click', async () => {
    if (state.ordersState.page <= 1 || !state.accessToken) return;
    state.ordersState.page -= 1;
    await api.loadOrders().catch((error) => helpers.setStatus(dom.ordersStatusEl, error.message, 'err'));
  });

  dom.ordersNextBtnEl.addEventListener('click', async () => {
    if (!state.accessToken) return;
    const totalPages = Number(state.ordersPaginationMeta?.totalPages || 1);
    if (state.ordersState.page >= totalPages) return;
    state.ordersState.page += 1;
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
      await Promise.all([api.loadDashboard(), api.loadOrders()]);
    } catch (error) {
      helpers.setStatus(dom.ordersStatusEl, error.message, 'err');
    } finally {
      saveButton.disabled = false;
    }
  });
}
