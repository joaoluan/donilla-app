const ADMIN_EVENTS_URL = '/admin/events';
const ADMIN_EVENTS_RECONNECT_BASE_MS = 3000;
const ADMIN_EVENTS_RECONNECT_MAX_MS = 15000;

function isOrdersViewVisible(dom) {
  return Boolean(dom.ordersPanelEl && !dom.ordersPanelEl.classList.contains('hidden'));
}

function buildReconnectDelay(attempt) {
  const safeAttempt = Math.max(Number(attempt || 0), 0);
  const exponentialDelay = ADMIN_EVENTS_RECONNECT_BASE_MS * (2 ** Math.min(safeAttempt, 3));
  return Math.min(exponentialDelay, ADMIN_EVENTS_RECONNECT_MAX_MS);
}

async function buildStreamError(response) {
  let message = `Erro HTTP ${response.status}`;
  const contentType = String(response.headers.get('content-type') || '');

  if (contentType.includes('application/json')) {
    try {
      const payload = await response.json();
      message = payload?.error?.message || message;
    } catch (error) {
      console.warn('Falha ao interpretar erro JSON do stream admin SSE.', {
        status: response.status,
        error,
      });
    }
  }

  const error = new Error(message);
  error.status = response.status;
  return error;
}

export function bindRealtimeSection(ctx) {
  const { dom, state, helpers, api } = ctx;
  let streamAbortController = null;
  let reconnectTimerId = null;
  let reconnectAttempts = 0;
  let intentionallyClosed = false;
  let realtimeRefreshPromise = null;

  function clearReconnectTimer() {
    if (!reconnectTimerId) return;
    window.clearTimeout(reconnectTimerId);
    reconnectTimerId = null;
  }

  function setRealtimeConnectionStatus(isConnected) {
    state.adminRealtimeConnected = Boolean(isConnected);
  }

  function shouldConnect() {
    return Boolean(state.accessToken || state.refreshToken);
  }

  async function refreshAdminViewsFromRealtime({ allowRefresh = true } = {}) {
    if (!state.accessToken) {
      if (allowRefresh && state.refreshToken) {
        try {
          await api.refreshAdminSession();
        } catch {
          api.clearSession();
          helpers.setStatus(dom.loginStatusEl, 'Sessao expirada. Faca login novamente.', 'err');
          return;
        }
      } else {
        return;
      }
    }

    const tasks = [
      api.loadDashboard(),
      api.loadDashboardQueue(),
    ];

    if (isOrdersViewVisible(dom)) {
      tasks.push(api.loadOrders());
    }

    try {
      await Promise.all(tasks);
    } catch (error) {
      if (allowRefresh && error?.status === 401 && state.refreshToken) {
        try {
          await api.refreshAdminSession();
          return refreshAdminViewsFromRealtime({ allowRefresh: false });
        } catch {
          api.clearSession();
          helpers.setStatus(dom.loginStatusEl, 'Sessao expirada. Faca login novamente.', 'err');
          return;
        }
      }

      throw error;
    }
  }

  function syncAdminFromRealtime() {
    if (realtimeRefreshPromise) return realtimeRefreshPromise;

    realtimeRefreshPromise = refreshAdminViewsFromRealtime()
      .catch((error) => {
        helpers.setStatus(dom.dashboardStatusEl, error.message, 'err');
        if (isOrdersViewVisible(dom)) {
          helpers.setStatus(dom.ordersStatusEl, error.message, 'err');
        }
      })
      .finally(() => {
        realtimeRefreshPromise = null;
      });

    return realtimeRefreshPromise;
  }

  function handleRealtimeEvent(eventName, rawData) {
    if (!['order.created', 'order.updated'].includes(eventName)) return;

    let payload = null;
    try {
      payload = rawData ? JSON.parse(rawData) : null;
    } catch (error) {
      console.warn('Falha ao interpretar payload do evento SSE admin.', {
        eventName,
        rawData,
        error,
      });
      payload = null;
    }

    if (!payload?.orderId) return;
    state.orderAuditCache?.delete?.(payload.orderId);
    syncAdminFromRealtime()
      .then(() => {
        if (!state.expandedOrderAuditIds?.has?.(payload.orderId)) return;
        return api.ensureOrderAuditVisible(payload.orderId, { force: true });
      })
      .catch(() => {});
  }

  function processSseBlock(rawBlock) {
    if (!rawBlock) return;

    let eventName = 'message';
    const dataLines = [];

    rawBlock.split('\n').forEach((line) => {
      if (!line || line.startsWith(':')) return;

      const separatorIndex = line.indexOf(':');
      const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
      let value = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'event') {
        eventName = value || 'message';
        return;
      }

      if (field === 'data') {
        dataLines.push(value);
      }
    });

    handleRealtimeEvent(eventName, dataLines.join('\n'));
  }

  async function consumeSseStream(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
        let delimiterIndex = buffer.indexOf('\n\n');

        while (delimiterIndex !== -1) {
          const block = buffer.slice(0, delimiterIndex);
          buffer = buffer.slice(delimiterIndex + 2);
          processSseBlock(block);
          delimiterIndex = buffer.indexOf('\n\n');
        }
      }

      buffer += decoder.decode().replace(/\r/g, '');
      if (buffer.trim()) {
        processSseBlock(buffer);
      }
    } finally {
      reader.releaseLock?.();
    }
  }

  function scheduleReconnect() {
    if (intentionallyClosed || reconnectTimerId || !shouldConnect()) return;

    const delay = buildReconnectDelay(reconnectAttempts);
    reconnectTimerId = window.setTimeout(() => {
      reconnectTimerId = null;
      connectStream().catch(() => {});
    }, delay);
  }

  function disconnectStream() {
    intentionallyClosed = true;
    clearReconnectTimer();
    setRealtimeConnectionStatus(false);

    if (!streamAbortController) return;
    const activeController = streamAbortController;
    streamAbortController = null;
    activeController.abort();
  }

  async function connectStream({ allowRefresh = true } = {}) {
    if (streamAbortController || !shouldConnect()) return;

    intentionallyClosed = false;

    if (!state.accessToken && state.refreshToken && allowRefresh) {
      try {
        await api.refreshAdminSession();
      } catch {
        api.clearSession();
        helpers.setStatus(dom.loginStatusEl, 'Sessao expirada. Faca login novamente.', 'err');
        return;
      }
    }

    if (!state.accessToken) return;

    const controller = new AbortController();
    streamAbortController = controller;
    let shouldReconnect = false;

    try {
      const response = await fetch(ADMIN_EVENTS_URL, {
        headers: helpers.authHeaders({
          Accept: 'text/event-stream',
        }),
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await buildStreamError(response);

        if (allowRefresh && error.status === 401 && state.refreshToken) {
          try {
            streamAbortController = null;
            await api.refreshAdminSession();
            reconnectAttempts = 0;
            return connectStream({ allowRefresh: false });
          } catch {
            api.clearSession();
            helpers.setStatus(dom.loginStatusEl, 'Sessao expirada. Faca login novamente.', 'err');
            return;
          }
        }

        throw error;
      }

      if (!response.body) {
        throw new Error('Conexao em tempo real indisponivel neste navegador.');
      }

      reconnectAttempts = 0;
      setRealtimeConnectionStatus(true);
      await consumeSseStream(response.body);
      shouldReconnect = !controller.signal.aborted;
    } catch (error) {
      if (controller.signal.aborted || intentionallyClosed) {
        return;
      }

      if (allowRefresh && error?.status === 401 && state.refreshToken) {
        try {
          streamAbortController = null;
          await api.refreshAdminSession();
          reconnectAttempts = 0;
          return connectStream({ allowRefresh: false });
        } catch {
          api.clearSession();
          helpers.setStatus(dom.loginStatusEl, 'Sessao expirada. Faca login novamente.', 'err');
          return;
        }
      }

      shouldReconnect = true;
    } finally {
      if (streamAbortController === controller || shouldReconnect || controller.signal.aborted) {
        setRealtimeConnectionStatus(false);
      }

      if (streamAbortController === controller) {
        streamAbortController = null;
      }

      if (shouldReconnect && !intentionallyClosed && shouldConnect()) {
        reconnectAttempts += 1;
        scheduleReconnect();
      }
    }
  }

  document.addEventListener('admin:session-active', () => {
    intentionallyClosed = false;
    reconnectAttempts = 0;
    clearReconnectTimer();
    connectStream().catch(() => {});
  });

  document.addEventListener('admin:session-cleared', () => {
    reconnectAttempts = 0;
    disconnectStream();
  });

  window.addEventListener('online', () => {
    if (streamAbortController || !shouldConnect()) return;
    connectStream().catch(() => {});
  });

  window.addEventListener('focus', () => {
    if (streamAbortController || !shouldConnect()) return;
    connectStream().catch(() => {});
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || streamAbortController || !shouldConnect()) return;
    connectStream().catch(() => {});
  });
}
