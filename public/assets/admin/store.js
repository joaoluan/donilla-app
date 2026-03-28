const STORAGE_KEYS = {
  accessToken: 'donilla_access_token',
  refreshToken: 'donilla_refresh_token',
  rememberedUsername: 'donilla_admin_last_username',
  rememberSession: 'donilla_admin_remember_session',
};

function readStoredValue(key) {
  return sessionStorage.getItem(key) || localStorage.getItem(key) || '';
}

function createDashboardFilters() {
  return {
    period: 'today',
    from: '',
    to: '',
  };
}

function createOrdersState(defaults = {}) {
  return {
    page: 1,
    pageSize: Number(defaults.pageSize || 10),
    status: defaults.status || 'all',
    search: '',
    period: defaults.period || 'today',
    from: '',
    to: '',
  };
}

function createCustomersState(defaults = {}) {
  return {
    page: 1,
    pageSize: Number(defaults.pageSize || 12),
    search: '',
    segment: defaults.segment || 'all',
    sort: defaults.sort || 'recent_desc',
    period: defaults.period || 'all',
    from: '',
    to: '',
  };
}

function createCategoryState(defaults = {}) {
  return {
    page: 1,
    pageSize: Number(defaults.pageSize || 10),
    search: '',
    sort: defaults.sort || 'ordem_exibicao',
  };
}

function createProdutoState(defaults = {}) {
  return {
    page: 1,
    pageSize: Number(defaults.pageSize || 12),
    search: '',
    sort: defaults.sort || 'nome_doce',
    disponibilidade: defaults.disponibilidade || 'all',
    categoria_id: 'all',
  };
}

function createCatalogPortalState() {
  return {
    search: '',
    categoria_id: 'all',
  };
}

export function createAdminStore({ defaults = {} } = {}) {
  const state = {
    accessToken: '',
    refreshToken: readStoredValue(STORAGE_KEYS.refreshToken),
    currentUser: null,
    allOrders: [],
    dashboardSnapshot: null,
    dashboardQueueOrders: [],
    crmCustomers: [],
    customerDetail: null,
    menuCategorias: [],
    allCategorias: [],
    menuProdutos: [],
    allMenuProdutos: [],
    deliveryFees: [],
    currentStoreSettings: null,
    produtoImagemDataUrl: '',
    productImageWebpSupported: null,
    selectedCustomerId: null,
    customerPaginationMeta: null,
    ordersPaginationMeta: null,
    categoryPaginationMeta: null,
    produtoPaginationMeta: null,
    ordersListRenderSignature: '',
    dashboardQueueLoaded: false,
    adminRealtimeConnected: false,
    refreshSessionPromise: null,
    dashboardFilters: createDashboardFilters(),
    ordersState: createOrdersState(defaults.orders),
    customersState: createCustomersState(defaults.customers),
    categoryState: createCategoryState(defaults.category),
    produtoState: createProdutoState(defaults.produto),
    catalogPortalState: createCatalogPortalState(),
    orderAuditCache: new Map(),
    expandedOrderAuditIds: new Set(),
  };

  function clearStoredSessionTokens() {
    [localStorage, sessionStorage].forEach((storage) => {
      storage.removeItem(STORAGE_KEYS.accessToken);
      storage.removeItem(STORAGE_KEYS.refreshToken);
    });
  }

  function clearLegacyStoredAccessToken() {
    [localStorage, sessionStorage].forEach((storage) => {
      storage.removeItem(STORAGE_KEYS.accessToken);
    });
  }

  function hasRememberedSessionPreference() {
    return localStorage.getItem(STORAGE_KEYS.rememberSession) === 'true';
  }

  function getRememberedUsername() {
    return localStorage.getItem(STORAGE_KEYS.rememberedUsername) || '';
  }

  function storeRememberedUsername(username, rememberSession) {
    if (rememberSession && username) {
      localStorage.setItem(STORAGE_KEYS.rememberedUsername, username);
      localStorage.setItem(STORAGE_KEYS.rememberSession, 'true');
      return;
    }

    if (!rememberSession) {
      localStorage.removeItem(STORAGE_KEYS.rememberedUsername);
      localStorage.removeItem(STORAGE_KEYS.rememberSession);
    }
  }

  function persistSessionTokens(session, rememberSession) {
    clearStoredSessionTokens();

    state.accessToken = session?.accessToken || '';
    state.refreshToken = session?.refreshToken || '';

    const storage = rememberSession ? localStorage : sessionStorage;
    if (state.refreshToken) {
      storage.setItem(STORAGE_KEYS.refreshToken, state.refreshToken);
    }

    if (rememberSession) {
      localStorage.setItem(STORAGE_KEYS.rememberSession, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEYS.rememberSession);
    }
  }

  function clearRememberedLoginData() {
    clearStoredSessionTokens();
    localStorage.removeItem(STORAGE_KEYS.rememberedUsername);
    localStorage.removeItem(STORAGE_KEYS.rememberSession);
  }

  function resetSessionState() {
    state.accessToken = '';
    state.refreshToken = '';
    state.currentUser = null;
    state.adminRealtimeConnected = false;
    state.refreshSessionPromise = null;
    clearStoredSessionTokens();

    state.allOrders = [];
    state.dashboardSnapshot = null;
    state.dashboardQueueOrders = [];
    state.crmCustomers = [];
    state.customerDetail = null;
    state.menuCategorias = [];
    state.allCategorias = [];
    state.menuProdutos = [];
    state.allMenuProdutos = [];
    state.deliveryFees = [];
    state.currentStoreSettings = null;
    state.produtoImagemDataUrl = '';
    state.selectedCustomerId = null;
    state.customerPaginationMeta = null;
    state.ordersPaginationMeta = null;
    state.categoryPaginationMeta = null;
    state.produtoPaginationMeta = null;
    state.ordersListRenderSignature = '';
    state.dashboardQueueLoaded = false;

    state.orderAuditCache.clear();
    state.expandedOrderAuditIds.clear();

    Object.assign(state.dashboardFilters, createDashboardFilters());
    Object.assign(state.ordersState, createOrdersState(defaults.orders));
    Object.assign(state.customersState, createCustomersState(defaults.customers));
    Object.assign(state.categoryState, createCategoryState(defaults.category));
    Object.assign(state.produtoState, createProdutoState(defaults.produto));
    Object.assign(state.catalogPortalState, createCatalogPortalState());
  }

  return {
    state,
    clearStoredSessionTokens,
    clearLegacyStoredAccessToken,
    hasRememberedSessionPreference,
    getRememberedUsername,
    storeRememberedUsername,
    persistSessionTokens,
    clearRememberedLoginData,
    resetSessionState,
  };
}
