export function bindNavigationSection(ctx) {
  const { dom, api } = ctx;

  dom.adminViewLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const targetView = api.normalizeAdminView(link.dataset.adminViewLink);
      if (!targetView) return;

      event.preventDefault();
      api.navigateToAdminView(targetView);
    });
  });
}
