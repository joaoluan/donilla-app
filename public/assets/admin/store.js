const STORAGE_KEYS = {
  accessToken: 'donilla_access_token',
  refreshToken: 'donilla_refresh_token',
  rememberedUsername: 'donilla_admin_last_username',
  rememberSession: 'donilla_admin_remember_session',
};

const OBJECT_STATE_KEYS = ['dashboardFilters', 'ordersState', 'customersState', 'categoryState', 'produtoState', 'catalogPortalState'];
const MAP_STATE_KEYS = ['orderAuditCache'];
const SET_STATE_KEYS = ['expandedOrderAuditIds'];

function readStoredValue(key) {
  return sessionStorage.getItem(key) || localStorage.getItem(key) || '';
}

function resolvePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
    pageSize: resolvePositiveNumber(defaults.pageSize, 10),
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
    pageSize: resolvePositiveNumber(defaults.pageSize, 12),
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
    pageSize: resolvePositiveNumber(defaults.pageSize, 10),
    search: '',
    sort: defaults.sort || 'ordem_exibicao',
  };
}

function createProdutoState(defaults = {}) {
  return {
    page: 1,
    pageSize: resolvePositiveNumber(defaults.pageSize, 12),
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

function createInitialAdminState(defaults = {}) {
  return {
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
}

function applyStateSnapshot(target, snapshot) {
  const preservedKeys = new Set([...OBJECT_STATE_KEYS, ...MAP_STATE_KEYS, ...SET_STATE_KEYS]);

  Object.entries(snapshot).forEach(([key, value]) => {
    if (preservedKeys.has(key)) return;
    target[key] = value;
  });

  OBJECT_STATE_KEYS.forEach((key) => {
    Object.assign(target[key], snapshot[key]);
  });

  MAP_STATE_KEYS.forEach((key) => {
    target[key].clear();
    snapshot[key].forEach((entryValue, entryKey) => {
      target[key].set(entryKey, entryValue);
    });
  });

  SET_STATE_KEYS.forEach((key) => {
    target[key].clear();
    snapshot[key].forEach((entryValue) => {
      target[key].add(entryValue);
    });
  });
}

export function createAdminStore({ defaults = {} } = {}) {
  const state = createInitialAdminState(defaults);

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
    clearStoredSessionTokens();
    const nextState = createInitialAdminState(defaults);
    nextState.productImageWebpSupported = state.productImageWebpSupported;
    applyStateSnapshot(state, nextState);
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
