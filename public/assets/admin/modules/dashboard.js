export function bindDashboardSection(ctx) {
  const { dom, state, helpers, api } = ctx;

  async function submitDashboardOrderAction(button, {
    orderId,
    nextStatus,
    nextStatusLabel,
    currentPaymentStatus,
    requiresConfirmation = false,
  }) {
    if (!orderId || !nextStatus || !state.accessToken) return;

    const orderCode = helpers.formatOrderCode(orderId);
    if (requiresConfirmation && !window.confirm(`Cancelar pedido ${orderCode}?`)) {
      return;
    }

    const actionGroup = button.closest('.dashboard-order-actions');
    const buttons = Array.from(actionGroup?.querySelectorAll('button') || [button]);
    buttons.forEach((actionButton) => {
      actionButton.disabled = true;
    });

    try {
      const response = await fetch(`/admin/orders/${orderId}/status`, {
        method: 'PUT',
        headers: helpers.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          status_entrega: nextStatus,
          status_pagamento: currentPaymentStatus || 'pendente',
        }),
      });

      await helpers.parseResponse(response);
      await Promise.all([api.loadDashboard(), api.loadDashboardQueue(), api.loadOrders()]);
      helpers.showToast(
        nextStatus === 'cancelado'
          ? `Pedido ${orderCode} cancelado ✓`
          : `Pedido ${orderCode} → ${nextStatusLabel} ✓`,
      );
    } catch (error) {
      helpers.setStatus(dom.dashboardStatusEl, error.message, 'err');
    } finally {
      buttons.forEach((actionButton) => {
        actionButton.disabled = false;
      });
    }
  }

  dom.dashboardRefreshBtnEl?.addEventListener('click', async () => {
    if (!state.accessToken) return;

    dom.dashboardRefreshBtnEl.disabled = true;
    try {
      await Promise.all([
        api.loadDashboard(),
        api.loadDashboardQueue(),
        api.loadOrders(),
        api.loadStoreSettings(),
      ]);
    } catch (error) {
      helpers.setStatus(dom.dashboardStatusEl, error.message, 'err');
    } finally {
      dom.dashboardRefreshBtnEl.disabled = false;
    }
  });

  dom.dashboardPendingAlertBtnEl?.addEventListener('click', async () => {
    api.navigateToAdminView('pedidos');
    state.ordersState.status = 'pendente';
    state.ordersState.search = '';
    state.ordersState.page = 1;
    api.updateOrdersControlsFromState();
    if (!state.accessToken) return;

    try {
      await api.loadOrders();
    } catch (error) {
      helpers.setStatus(dom.ordersStatusEl, error.message, 'err');
    }
  });

  dom.dashboardOpenOrdersBtnEl?.addEventListener('click', async () => {
    api.navigateToAdminView('pedidos');
    if (!state.accessToken) return;

    try {
      await api.loadOrders();
    } catch (error) {
      helpers.setStatus(dom.ordersStatusEl, error.message, 'err');
    }
  });

  dom.dashboardQueueListEl?.addEventListener('click', async (event) => {
    const advanceButton = event.target.closest('[data-dashboard-advance]');
    if (advanceButton) {
      await submitDashboardOrderAction(advanceButton, {
        orderId: Number(advanceButton.dataset.dashboardAdvance || 0),
        nextStatus: advanceButton.dataset.dashboardNextStatus || '',
        nextStatusLabel: advanceButton.dataset.dashboardNextStatusLabel || 'Atualizado',
        currentPaymentStatus: advanceButton.dataset.dashboardPaymentStatus || 'pendente',
      });
      return;
    }

    const cancelButton = event.target.closest('[data-dashboard-cancel]');
    if (cancelButton) {
      await submitDashboardOrderAction(cancelButton, {
        orderId: Number(cancelButton.dataset.dashboardCancel || 0),
        nextStatus: 'cancelado',
        nextStatusLabel: 'Cancelado',
        currentPaymentStatus: cancelButton.dataset.dashboardPaymentStatus || 'pendente',
        requiresConfirmation: true,
      });
      return;
    }

    const orderCard = event.target.closest('[data-open-dashboard-order]');
    if (!orderCard) return;

    const orderId = Number(orderCard.dataset.openDashboardOrder || 0);
    if (!orderId || !state.accessToken) return;

    orderCard.disabled = true;
    try {
      await api.openOrderFromCrm(orderId);
    } catch (error) {
      helpers.setStatus(dom.dashboardStatusEl, error.message, 'err');
    } finally {
      orderCard.disabled = false;
    }
  });

  if (!dom.dashboardRangePresetEl || !dom.dashboardFromDateEl || !dom.dashboardToDateEl || !dom.dashboardApplyBtnEl) {
    return;
  }

  dom.dashboardRangePresetEl.addEventListener('change', () => {
    state.dashboardFilters.period = dom.dashboardRangePresetEl.value;
    helpers.syncRangeInputs(
      dom.dashboardRangePresetEl,
      dom.dashboardFromDateEl,
      dom.dashboardToDateEl,
      state.dashboardFilters,
    );

    if (state.dashboardFilters.period !== 'custom' && state.accessToken) {
      api.loadDashboard().catch((error) => helpers.setStatus(dom.dashboardStatusEl, error.message, 'err'));
      return;
    }

    helpers.validateRangeState(state.dashboardFilters, dom.dashboardStatusEl, 'resumo');
  });

  dom.dashboardApplyBtnEl.addEventListener('click', async () => {
    state.dashboardFilters.period = dom.dashboardRangePresetEl.value;
    state.dashboardFilters.from = dom.dashboardFromDateEl.value || '';
    state.dashboardFilters.to = dom.dashboardToDateEl.value || '';
    if (!state.accessToken) return;

    try {
      await api.loadDashboard();
    } catch (error) {
      helpers.setStatus(dom.dashboardStatusEl, error.message, 'err');
    }
  });

  dom.dashboardFromDateEl.addEventListener('change', () => {
    state.dashboardFilters.from = dom.dashboardFromDateEl.value || '';
    helpers.validateRangeState(state.dashboardFilters, dom.dashboardStatusEl, 'resumo');
  });

  dom.dashboardToDateEl.addEventListener('change', () => {
    state.dashboardFilters.to = dom.dashboardToDateEl.value || '';
    helpers.validateRangeState(state.dashboardFilters, dom.dashboardStatusEl, 'resumo');
  });
}
