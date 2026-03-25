export function bindDashboardSection(ctx) {
  const { dom, state, helpers, api } = ctx;

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
