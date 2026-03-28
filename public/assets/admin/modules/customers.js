export function bindCustomersSection(ctx) {
  const { dom, state, helpers, api } = ctx;
  const bindEvent = (target, eventName, handler) => target?.addEventListener?.(eventName, handler);
  const customerSegmentTabs = Array.from(document.querySelectorAll('[data-customers-segment-tab]'));

  const debouncedLoadCustomersSearch = helpers.createDebounce(220, () => {
    if (!state.accessToken) return;
    api.loadCustomers().catch((error) => helpers.setStatus(dom.customersStatusEl, error.message, 'err'));
  });

  bindEvent(dom.refreshCustomersBtnEl, 'click', async () => {
    if (!state.accessToken) return;

    try {
      await api.loadCustomers();
    } catch (error) {
      helpers.setStatus(dom.customersStatusEl, error.message, 'err');
    }
  });

  customerSegmentTabs.forEach((button) => {
    bindEvent(button, 'click', async () => {
      const nextSegment = button.dataset.customersSegmentTab || 'all';
      state.customersState.segment = nextSegment;
      state.customersState.page = 1;

      if (dom.customersSegmentFilterEl) {
        dom.customersSegmentFilterEl.value = nextSegment;
      }

      if (!state.accessToken) return;

      try {
        await api.loadCustomers();
      } catch (error) {
        helpers.setStatus(dom.customersStatusEl, error.message, 'err');
      }
    });
  });

  bindEvent(dom.applyCustomersFiltersBtnEl, 'click', async () => {
    api.syncCustomersStateFromControls();
    state.customersState.page = 1;
    if (!state.accessToken) return;

    try {
      await api.loadCustomers();
    } catch (error) {
      helpers.setStatus(dom.customersStatusEl, error.message, 'err');
    }
  });

  bindEvent(dom.customersSearchInputEl, 'input', () => {
    api.syncCustomersStateFromControls();
    state.customersState.page = 1;
    debouncedLoadCustomersSearch();
  });

  bindEvent(dom.customersSearchInputEl, 'keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    dom.applyCustomersFiltersBtnEl?.click();
  });

  bindEvent(dom.customersSegmentFilterEl, 'change', async () => {
    state.customersState.segment = dom.customersSegmentFilterEl.value || 'all';
    state.customersState.page = 1;
    if (!state.accessToken) return;

    try {
      await api.loadCustomers();
    } catch (error) {
      helpers.setStatus(dom.customersStatusEl, error.message, 'err');
    }
  });

  bindEvent(dom.customersSortInputEl, 'change', async () => {
    state.customersState.sort = dom.customersSortInputEl.value || 'recent_desc';
    state.customersState.page = 1;
    if (!state.accessToken) return;

    try {
      await api.loadCustomers();
    } catch (error) {
      helpers.setStatus(dom.customersStatusEl, error.message, 'err');
    }
  });

  bindEvent(dom.customersRangePresetEl, 'change', async () => {
    state.customersState.period = dom.customersRangePresetEl.value;
    helpers.syncRangeInputs(
      dom.customersRangePresetEl,
      dom.customersFromDateEl,
      dom.customersToDateEl,
      state.customersState,
    );

    if (!state.accessToken) {
      helpers.validateRangeState(state.customersState, dom.customersStatusEl, 'clientes');
      return;
    }

    if (state.customersState.period === 'custom') {
      helpers.validateRangeState(state.customersState, dom.customersStatusEl, 'clientes');
      return;
    }

    state.customersState.page = 1;
    try {
      await api.loadCustomers();
    } catch (error) {
      helpers.setStatus(dom.customersStatusEl, error.message, 'err');
    }
  });

  bindEvent(dom.customersPageSizeInputEl, 'change', async () => {
    state.customersState.pageSize = Number(dom.customersPageSizeInputEl.value || 12);
    state.customersState.page = 1;
    if (!state.accessToken) return;

    try {
      await api.loadCustomers();
    } catch (error) {
      helpers.setStatus(dom.customersStatusEl, error.message, 'err');
    }
  });

  bindEvent(dom.customersFromDateEl, 'change', () => {
    state.customersState.from = dom.customersFromDateEl.value || '';
    helpers.validateRangeState(state.customersState, dom.customersStatusEl, 'clientes');
  });

  bindEvent(dom.customersToDateEl, 'change', () => {
    state.customersState.to = dom.customersToDateEl.value || '';
    helpers.validateRangeState(state.customersState, dom.customersStatusEl, 'clientes');
  });

  bindEvent(dom.customersPrevBtnEl, 'click', async () => {
    if (state.customersState.page <= 1 || !state.accessToken) return;
    state.customersState.page -= 1;
    await api.loadCustomers().catch((error) => helpers.setStatus(dom.customersStatusEl, error.message, 'err'));
  });

  bindEvent(dom.customersNextBtnEl, 'click', async () => {
    if (!state.accessToken) return;
    const totalPages = Number(state.customerPaginationMeta?.totalPages || 1);
    if (state.customersState.page >= totalPages) return;
    state.customersState.page += 1;
    await api.loadCustomers().catch((error) => helpers.setStatus(dom.customersStatusEl, error.message, 'err'));
  });

  bindEvent(dom.customersListEl, 'click', async (event) => {
    const customerButton = event.target.closest('[data-customer-select]');
    if (!customerButton) return;

    const customerId = Number(customerButton.dataset.customerSelect);
    if (!customerId) return;

    if (Number(state.selectedCustomerId || 0) === customerId && Number(state.customerDetail?.id || 0) === customerId) {
      api.renderCustomerDetail(state.customerDetail, { scroll: true });
      return;
    }

    try {
      await api.loadCustomerDetail(customerId);
    } catch (error) {
      helpers.setStatus(dom.customersStatusEl, error.message, 'err');
    }
  });

  bindEvent(dom.customerDetailEl, 'click', async (event) => {
    const orderButton = event.target.closest('button[data-open-order]');
    if (!orderButton) return;

    const orderId = Number(orderButton.dataset.openOrder);
    if (!orderId) return;

    try {
      await api.openOrderFromCrm(orderId);
    } catch (error) {
      helpers.setStatus(dom.customersStatusEl, error.message, 'err');
    }
  });
}
