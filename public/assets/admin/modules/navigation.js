export function bindNavigationSection(ctx) {
  const { dom, state, helpers, api } = ctx;

  dom.adminViewLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const targetView = api.normalizeAdminView(link.dataset.adminViewLink);
      if (!targetView) return;

      event.preventDefault();
      api.navigateToAdminView(targetView);

      if (targetView === 'dashboard' && state.accessToken) {
        api.loadDashboard().catch((error) => helpers.setStatus(dom.dashboardStatusEl, error.message, 'err'));
        api.loadDashboardQueue().catch((error) => helpers.setStatus(dom.dashboardStatusEl, error.message, 'err'));
        api.loadStoreSettings().catch((error) => helpers.setStatus(dom.settingsStatusEl, error.message, 'err'));
      }
    });
  });
}
