export function bindDashboardSection(ctx) {
  const { dom, state, helpers, api } = ctx;

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
