export function bindNavigationSection(ctx) {
  const { dom, state, helpers, api } = ctx;

  const sidebarEl = document.getElementById('adminSidebarPanel');
  const sidebarOverlayEl = document.getElementById('adminSidebarOverlay');
  const sidebarToggleBtnEl = document.getElementById('adminSidebarToggleBtn');
  const sidebarCloseBtnEl = document.getElementById('adminSidebarCloseBtn');
  const automationGroupEl = document.getElementById('adminAutomationGroup');
  const automationToggleBtnEl = document.getElementById('adminAutomationToggle');
  const flowBuilderLinkEl = sidebarEl?.querySelector('a[href="/admin/bot-whatsapp/fluxos"]') || null;
  const externalSidebarLinks = Array.from(sidebarEl?.querySelectorAll('a[href]:not([data-admin-view-link])') || []);
  const mobileDrawerMedia = window.matchMedia('(max-width: 699px)');

  let userExpandedAutomation = false;
  let touchStartX = null;
  let touchCurrentX = null;

  function isMobileDrawerMode() {
    return mobileDrawerMedia.matches;
  }

  function bindMediaChange(mediaQuery, handler) {
    if (!mediaQuery) return;
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handler);
      return;
    }

    if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handler);
    }
  }

  function isSidebarAvailable() {
    return Boolean(sidebarEl && !dom.adminLayoutEl?.classList.contains('logged-out'));
  }

  function setMobileDrawerOpen(nextOpen) {
    const open = Boolean(nextOpen) && isMobileDrawerMode() && isSidebarAvailable();
    document.body.classList.toggle('admin-sidebar-mobile-open', open);

    if (sidebarToggleBtnEl) {
      sidebarToggleBtnEl.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    document.documentElement.style.overflow = open ? 'hidden' : '';
    document.body.style.overflow = open ? 'hidden' : '';
  }

  function closeMobileDrawer() {
    setMobileDrawerOpen(false);
  }

  function openMobileDrawer() {
    setMobileDrawerOpen(true);
  }

  function syncFlowBuilderLinkState() {
    if (!flowBuilderLinkEl) return;

    const isFlowRoute = /\/admin\/(bot-whatsapp\/fluxos|fluxos)(\/editor)?\/?$/.test(window.location.pathname);
    flowBuilderLinkEl.classList.toggle('active', isFlowRoute);

    if (isFlowRoute) {
      flowBuilderLinkEl.setAttribute('aria-current', 'page');
      return;
    }

    flowBuilderLinkEl.removeAttribute('aria-current');
  }

  function routeKeepsAutomationOpen(activeView = '') {
    const normalizedView = api.normalizeAdminView(activeView || window.location.pathname);
    return normalizedView === 'whatsapp'
      || normalizedView === 'broadcast'
      || /\/admin\/(bot-whatsapp\/fluxos|fluxos)(\/editor)?\/?$/.test(window.location.pathname);
  }

  function renderAutomationState(activeView = '') {
    if (!automationGroupEl || !automationToggleBtnEl) return;

    const expanded = routeKeepsAutomationOpen(activeView) || userExpandedAutomation;
    automationGroupEl.classList.toggle('is-open', expanded);
    automationToggleBtnEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    automationToggleBtnEl.setAttribute(
      'aria-label',
      expanded ? 'Recolher menu do Bot WhatsApp' : 'Expandir menu do Bot WhatsApp',
    );
  }

  function syncNavigationChrome(activeView = '') {
    syncFlowBuilderLinkState();
    renderAutomationState(activeView);

    if (!isMobileDrawerMode()) {
      closeMobileDrawer();
    }
  }

  dom.adminViewLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const targetView = api.normalizeAdminView(link.dataset.adminViewLink);
      if (!targetView) return;

      event.preventDefault();
      api.navigateToAdminView(targetView);
      closeMobileDrawer();

      if (targetView === 'dashboard' && state.accessToken) {
        api.loadDashboard().catch((error) => helpers.setStatus(dom.dashboardStatusEl, error.message, 'err'));
        api.loadDashboardQueue().catch((error) => helpers.setStatus(dom.dashboardStatusEl, error.message, 'err'));
        api.loadStoreSettings().catch((error) => helpers.setStatus(dom.settingsStatusEl, error.message, 'err'));
        return;
      }

      if (targetView === 'config' && state.accessToken) {
        api.loadStoreSettings().catch((error) => helpers.setStatus(dom.settingsStatusEl, error.message, 'err'));
        return;
      }

      if (targetView === 'whatsapp' && state.accessToken) {
        api.loadStoreSettings().catch((error) => helpers.setStatus(dom.whatsappSettingsStatusEl, error.message, 'err'));
        api.loadWhatsAppSessionStatus().catch((error) => helpers.setStatus(dom.whatsappSessionStatusEl, error.message, 'err'));
      }
    });
  });

  externalSidebarLinks.forEach((link) => {
    link.addEventListener('click', () => {
      closeMobileDrawer();
    });
  });

  sidebarToggleBtnEl?.addEventListener('click', () => {
    if (document.body.classList.contains('admin-sidebar-mobile-open')) {
      closeMobileDrawer();
      return;
    }

    openMobileDrawer();
  });

  sidebarOverlayEl?.addEventListener('click', () => {
    closeMobileDrawer();
  });

  sidebarCloseBtnEl?.addEventListener('click', () => {
    closeMobileDrawer();
  });

  automationToggleBtnEl?.addEventListener('click', () => {
    userExpandedAutomation = !automationGroupEl?.classList.contains('is-open');
    renderAutomationState(api.normalizeAdminView(window.location.pathname));
  });

  dom.sidebarStoreStatusCardEl?.addEventListener('click', async () => {
    if (dom.sidebarStoreStatusCardEl.disabled) return;

    try {
      await api.toggleSidebarStoreStatus();
    } catch (error) {
      if (dom.sidebarStoreStatusMetaEl) {
        dom.sidebarStoreStatusMetaEl.textContent = error.message;
      }
    }
  });

  sidebarEl?.addEventListener('touchstart', (event) => {
    if (!isMobileDrawerMode() || !document.body.classList.contains('admin-sidebar-mobile-open')) return;
    touchStartX = event.touches?.[0]?.clientX ?? null;
    touchCurrentX = touchStartX;
  }, { passive: true });

  sidebarEl?.addEventListener('touchmove', (event) => {
    if (touchStartX === null) return;
    touchCurrentX = event.touches?.[0]?.clientX ?? touchCurrentX;
  }, { passive: true });

  sidebarEl?.addEventListener('touchend', () => {
    if (touchStartX === null || touchCurrentX === null) return;
    if (touchStartX - touchCurrentX > 72) {
      closeMobileDrawer();
    }
    touchStartX = null;
    touchCurrentX = null;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMobileDrawer();
    }
  });

  document.addEventListener('admin:view-change', (event) => {
    syncNavigationChrome(event?.detail?.view || '');
  });

  document.addEventListener('admin:session-cleared', () => {
    userExpandedAutomation = false;
    closeMobileDrawer();
    syncNavigationChrome();
  });

  document.addEventListener('admin:session-active', () => {
    syncNavigationChrome();
  });

  bindMediaChange(mobileDrawerMedia, () => {
    syncNavigationChrome();
  });

  syncNavigationChrome(api.normalizeAdminView(window.location.pathname));
}
