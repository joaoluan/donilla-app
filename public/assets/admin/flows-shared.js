import { createAdminStore } from './store.js?v=20260328b';
import { createAdminApiClient } from './api.js?v=20260330b';
import { dateTime, escapeHtml } from '../shared/utils.js?v=20260328b';

export const FLOW_STATUS_LABELS = Object.freeze({
  draft: 'Rascunho',
  published: 'Publicado',
  archived: 'Arquivado',
});

export function createFlowAdminSession() {
  const store = createAdminStore();
  const state = store.state;
  const apiClient = createAdminApiClient({ state, store });

  async function ensureSession() {
    if (!state.accessToken && state.refreshToken) {
      await apiClient.refreshAdminSession();
    }

    if (!state.accessToken) {
      window.location.href = '/admin';
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    await apiClient.fetchCurrentUser();
    return state.currentUser;
  }

  async function run(task) {
    try {
      if (!state.accessToken && state.refreshToken) {
        await apiClient.refreshAdminSession();
      }

      if (!state.accessToken) {
        window.location.href = '/admin';
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      return await task(apiClient);
    } catch (error) {
      if (error?.status === 401 && state.refreshToken) {
        await apiClient.refreshAdminSession();
        return task(apiClient);
      }

      if (error?.status === 401 || error?.status === 403) {
        window.location.href = '/admin';
      }

      throw error;
    }
  }

  return {
    apiClient,
    ensureSession,
    run,
    state,
    store,
  };
}

export function formatFlowStatus(value) {
  return FLOW_STATUS_LABELS[String(value || '').trim().toLowerCase()] || 'Rascunho';
}

export function showToast(element, message, tone = 'ok') {
  if (!element) return;

  element.textContent = message;
  element.dataset.tone = tone;
  element.classList.remove('hidden');

  window.clearTimeout(showToast.timerId);
  showToast.timerId = window.setTimeout(() => {
    element.classList.add('hidden');
  }, 3200);
}

export function setInlineStatus(element, message, tone = 'muted') {
  if (!element) return;
  element.textContent = message || '';
  element.dataset.tone = tone;
}

export function renderStatusBadge(value) {
  const normalized = String(value || 'draft').trim().toLowerCase();
  return `<span class="flow-status-badge flow-status-badge-${escapeHtml(normalized)}">${escapeHtml(formatFlowStatus(normalized))}</span>`;
}

export function formatFlowDate(value) {
  return value ? dateTime(value) : '--';
}

export function parseFlowIdFromLocation() {
  const url = new URL(window.location.href);
  const id = Number(url.searchParams.get('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
