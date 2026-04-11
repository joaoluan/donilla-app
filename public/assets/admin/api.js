function withQuery(path, query = '') {
  return query ? `${path}?${query}` : path;
}

export function createAdminApiClient({ state, store }) {
  function authHeaders(extra = {}) {
    return {
      Authorization: `Bearer ${state.accessToken}`,
      ...extra,
    };
  }

  async function sendAuthenticatedJson(path, method, payload) {
    return parseResponse(await fetch(path, {
      method,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    }));
  }

  async function parseEnvelope(response) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = payload?.error?.message || `Erro HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return payload || { success: true, data: null, meta: null };
  }

  async function parseResponse(response) {
    const payload = await parseEnvelope(response);
    return payload?.data;
  }

  async function login(payload) {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return parseResponse(response);
  }

  async function refreshAdminSession() {
    if (!state.refreshToken) {
      const error = new Error('Sessão expirada. Faça login novamente.');
      error.status = 401;
      throw error;
    }

    if (state.refreshSessionPromise) return state.refreshSessionPromise;

    state.refreshSessionPromise = (async () => {
      const response = await fetch('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: state.refreshToken }),
      });

      const data = await parseResponse(response);
      state.currentUser = data.user;
      store.persistSessionTokens(data, store.hasRememberedSessionPreference());
      return data;
    })();

    try {
      return await state.refreshSessionPromise;
    } finally {
      state.refreshSessionPromise = null;
    }
  }

  async function revokeAdminSession() {
    if (!state.refreshToken) return;

    try {
      await fetch('/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: state.refreshToken }),
      });
    } catch {
      // Best-effort revocation only.
    }
  }

  async function fetchCurrentUser() {
    return parseResponse(await fetch('/auth/me', { headers: authHeaders() }));
  }

  async function fetchDashboard(query = '') {
    return parseEnvelope(await fetch(withQuery('/admin/dashboard', query), { headers: authHeaders() }));
  }

  async function fetchOrders(query = '') {
    return parseEnvelope(await fetch(withQuery('/admin/orders', query), { headers: authHeaders() }));
  }

  async function fetchCustomers(query = '') {
    return parseEnvelope(await fetch(withQuery('/admin/customers', query), { headers: authHeaders() }));
  }

  async function fetchCatalogSnapshot() {
    return parseResponse(await fetch('/admin/catalog', { headers: authHeaders() }));
  }

  async function fetchCustomerDetail(customerId) {
    return parseResponse(await fetch(`/admin/customers/${customerId}`, { headers: authHeaders() }));
  }

  async function fetchOrderAudit(orderId) {
    return parseResponse(await fetch(`/admin/orders/${orderId}/audit`, { headers: authHeaders() }));
  }

  async function fetchStoreSettings() {
    return parseResponse(await fetch('/admin/store-settings', { headers: authHeaders() }));
  }

  async function fetchWhatsAppSessionStatus() {
    return parseResponse(await fetch('/admin/whatsapp/session/status', { headers: authHeaders() }));
  }

  async function fetchWhatsAppQrCode() {
    return parseResponse(await fetch('/admin/whatsapp/session/qrcode', { headers: authHeaders() }));
  }

  async function fetchDeliveryFees() {
    return parseResponse(await fetch('/admin/delivery-fees', { headers: authHeaders() }));
  }

  async function fetchFlows() {
    return parseResponse(await fetch('/admin/flows', { headers: authHeaders() }));
  }

  async function createFlow(payload) {
    return parseResponse(await fetch('/admin/flows', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    }));
  }

  async function fetchFlow(flowId) {
    return parseResponse(await fetch(`/admin/flows/${flowId}`, { headers: authHeaders() }));
  }

  async function saveFlow(flowId, payload) {
    return parseResponse(await fetch(`/admin/flows/${flowId}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    }));
  }

  async function publishFlow(flowId) {
    return parseResponse(await fetch(`/admin/flows/${flowId}/publish`, {
      method: 'POST',
      headers: authHeaders(),
    }));
  }

  async function unpublishFlow(flowId) {
    return parseResponse(await fetch(`/admin/flows/${flowId}/unpublish`, {
      method: 'POST',
      headers: authHeaders(),
    }));
  }

  async function deleteFlow(flowId) {
    return parseResponse(await fetch(`/admin/flows/${flowId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }));
  }

  async function fetchActiveFlowSessions() {
    return parseResponse(await fetch('/admin/flows/sessions/active', { headers: authHeaders() }));
  }

  async function deleteDeliveryFee(id) {
    return parseResponse(await fetch(`/admin/delivery-fees/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }));
  }

  async function createCategoria(payload) {
    return sendAuthenticatedJson('/categorias', 'POST', payload);
  }

  async function updateCategoria(id, payload) {
    return sendAuthenticatedJson(`/categorias/${id}`, 'PUT', payload);
  }

  async function fetchCategorias(query = '') {
    return parseEnvelope(await fetch(withQuery('/categorias', query), { headers: authHeaders() }));
  }

  async function deleteCategoria(id) {
    return parseResponse(await fetch(`/categorias/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }));
  }

  async function fetchProdutos(query = '') {
    return parseEnvelope(await fetch(withQuery('/produtos', query), { headers: authHeaders() }));
  }

  async function createProduto(payload) {
    return sendAuthenticatedJson('/produtos', 'POST', payload);
  }

  async function updateProduto(id, payload) {
    return sendAuthenticatedJson(`/produtos/${id}`, 'PUT', payload);
  }

  async function deleteProduto(id) {
    return parseResponse(await fetch(`/produtos/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }));
  }

  return {
    authHeaders,
    parseEnvelope,
    parseResponse,
    login,
    refreshAdminSession,
    revokeAdminSession,
    fetchCurrentUser,
    fetchDashboard,
    fetchOrders,
    fetchCustomers,
    fetchCatalogSnapshot,
    fetchCustomerDetail,
    fetchOrderAudit,
    fetchStoreSettings,
    fetchWhatsAppSessionStatus,
    fetchWhatsAppQrCode,
    fetchDeliveryFees,
    fetchFlows,
    createFlow,
    fetchFlow,
    saveFlow,
    publishFlow,
    unpublishFlow,
    deleteFlow,
    fetchActiveFlowSessions,
    deleteDeliveryFee,
    createCategoria,
    updateCategoria,
    fetchCategorias,
    deleteCategoria,
    fetchProdutos,
    createProduto,
    updateProduto,
    deleteProduto,
  };
}
