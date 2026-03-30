import { escapeHtml, formatPhone } from '../shared/utils.js?v=20260328b';
import {
  createFlowAdminSession,
  formatFlowDate,
  renderStatusBadge,
  setInlineStatus,
  showToast,
} from './flows-shared.js?v=20260330a';

const LEGACY_TEMPLATE_KEY = 'legacy_whatsapp_bot';
const COMMERCIAL_STARTER_TEMPLATE_KEY = 'commercial_whatsapp_starter';
const TEMPLATE_DETAILS = Object.freeze({
  [COMMERCIAL_STARTER_TEMPLATE_KEY]: {
    chipLabel: 'Base comercial',
    rowHint: 'Fluxo pronto com acolhimento, cardapio, interesse, pedido e handoff.',
  },
  [LEGACY_TEMPLATE_KEY]: {
    chipLabel: 'Base legado',
    rowHint: 'Rascunho guiado importado do bot antigo.',
  },
});
const state = {
  flows: [],
  sessions: [],
};

const session = createFlowAdminSession();

const dom = {
  pageStatus: document.getElementById('flowsPageStatus'),
  refreshBtn: document.getElementById('refreshFlowsBtn'),
  starterBtn: document.getElementById('newStarterFlowBtn'),
  importLegacyBtn: document.getElementById('importLegacyFlowBtn'),
  newFlowBtn: document.getElementById('newFlowBtn'),
  flowsTableBody: document.getElementById('flowsTableBody'),
  sessionsList: document.getElementById('activeSessionsList'),
  statTotal: document.getElementById('flowStatTotal'),
  statPublished: document.getElementById('flowStatPublished'),
  statDrafts: document.getElementById('flowStatDrafts'),
  statSessions: document.getElementById('flowStatSessions'),
  dialog: document.getElementById('newFlowDialog'),
  dialogTitle: document.getElementById('newFlowDialogTitle'),
  dialogDescription: document.getElementById('newFlowDialogDescription'),
  form: document.getElementById('newFlowForm'),
  templateKeyInput: document.getElementById('newFlowTemplateKey'),
  nameInput: document.getElementById('newFlowName'),
  triggerInput: document.getElementById('newFlowTrigger'),
  createStatus: document.getElementById('newFlowStatus'),
  submitBtn: document.getElementById('newFlowSubmitBtn'),
  toast: document.getElementById('flowToast'),
};

function openDialog() {
  if (typeof dom.dialog?.showModal === 'function') {
    dom.dialog.showModal();
    return;
  }

  dom.dialog?.setAttribute('open', 'open');
}

function closeDialog() {
  if (typeof dom.dialog?.close === 'function') {
    dom.dialog.close();
    return;
  }

  dom.dialog?.removeAttribute('open');
}

function getTemplateDetails(flow) {
  const templateKey = flow?.flow_json?.meta?.template_key;
  return TEMPLATE_DETAILS[templateKey] || null;
}

function prepareCreateDialog(mode = 'blank') {
  dom.form?.reset();

  if (mode === 'starter') {
    dom.dialogTitle.textContent = 'Fluxo comercial pronto';
    dom.dialogDescription.textContent = 'Cria um rascunho com acolhimento, ajuda de venda, pedido, observacao e atendimento humano.';
    dom.templateKeyInput.value = COMMERCIAL_STARTER_TEMPLATE_KEY;
    dom.nameInput.value = 'Fluxo comercial inicial';
    dom.triggerInput.value = 'oi, ola, olá, opa, bom dia, boa tarde, boa noite';
    dom.submitBtn.textContent = 'Criar fluxo pronto';
    setInlineStatus(
      dom.createStatus,
      'Esse modelo ja vem conversacional. Separe aliases por virgula e ajuste os textos com o tom da sua loja antes de publicar.',
      'muted',
    );
    return;
  }

  if (mode === 'legacy') {
    dom.dialogTitle.textContent = 'Importar fluxo legado';
    dom.dialogDescription.textContent = 'Cria um rascunho guiado com o menu principal do bot antigo ja distribuido no canvas.';
    dom.templateKeyInput.value = LEGACY_TEMPLATE_KEY;
    dom.nameInput.value = 'Fluxo legado guiado';
    dom.triggerInput.value = 'oi, ola, olá, opa, bom dia, boa tarde, boa noite';
    dom.submitBtn.textContent = 'Importar e abrir editor';
    setInlineStatus(
      dom.createStatus,
      'Esse rascunho serve como mapa inicial. Voce pode colocar varios gatilhos separados por virgula antes de publicar no WhatsApp.',
      'muted',
    );
    return;
  }

  dom.dialogTitle.textContent = 'Novo fluxo';
  dom.dialogDescription.textContent = 'Crie a base com Trigger e Fim ja posicionados no canvas.';
  dom.templateKeyInput.value = '';
  dom.submitBtn.textContent = 'Criar e abrir editor';
  setInlineStatus(dom.createStatus, 'Use um ou varios gatilhos separados por virgula para testar mais rapido.', 'muted');
}

function openCreateDialog(mode = 'blank') {
  prepareCreateDialog(mode);
  openDialog();
  dom.nameInput?.focus();
}

function renderOverview() {
  const published = state.flows.filter((flow) => flow.status === 'published').length;
  const drafts = state.flows.filter((flow) => flow.status === 'draft').length;

  dom.statTotal.textContent = String(state.flows.length);
  dom.statPublished.textContent = String(published);
  dom.statDrafts.textContent = String(drafts);
  dom.statSessions.textContent = String(state.sessions.length);
}

function renderFlowsTable() {
  if (!state.flows.length) {
    dom.flowsTableBody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="flow-empty-state">
            Ainda não existe nenhum fluxo visual salvo. Crie o primeiro fluxo para começar a automatizar o WhatsApp.
          </div>
        </td>
      </tr>
    `;
    return;
  }

  dom.flowsTableBody.innerHTML = state.flows
    .map((flow) => {
      const canDelete = flow.status === 'draft';
      const templateDetails = getTemplateDetails(flow);
      const actionButtons = [
        `<a class="flow-inline-btn" href="/admin/fluxos/editor?id=${flow.id}">Editar</a>`,
        flow.status === 'published'
          ? `<button class="flow-inline-btn" type="button" data-flow-action="unpublish" data-flow-id="${flow.id}">Despublicar</button>`
          : `<button class="flow-inline-btn" type="button" data-flow-action="publish" data-flow-id="${flow.id}">Publicar</button>`,
        canDelete
          ? `<button class="flow-inline-btn flow-inline-btn-danger" type="button" data-flow-action="delete" data-flow-id="${flow.id}">Excluir</button>`
          : '',
      ]
        .filter(Boolean)
        .join('');

      return `
        <tr>
          <td>
            <div class="flow-name-stack">
              <strong>${escapeHtml(flow.name)}</strong>
              ${templateDetails ? `<span class="flow-template-chip">${escapeHtml(templateDetails.chipLabel)}</span>` : ''}
            </div>
            <small>ID ${flow.id}</small>
            ${templateDetails ? `<small>${escapeHtml(templateDetails.rowHint)}</small>` : ''}
          </td>
          <td>
            <strong>${escapeHtml(flow.trigger_keyword)}</strong>
            <small>Dispara quando a mensagem começa com qualquer alias desse campo</small>
          </td>
          <td>${renderStatusBadge(flow.status)}</td>
          <td>
            <strong>${escapeHtml(formatFlowDate(flow.updated_at))}</strong>
            <small>${flow.published_at ? `Publicado em ${escapeHtml(formatFlowDate(flow.published_at))}` : 'Ainda não publicado'}</small>
          </td>
          <td>
            <div class="flow-row-actions">${actionButtons}</div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderSessions() {
  if (!state.sessions.length) {
    dom.sessionsList.innerHTML = `
      <div class="flow-empty-state">
        Nenhuma sessão ativa agora. Assim que um cliente entrar em um fluxo publicado, ele aparece aqui para monitoramento.
      </div>
    `;
    return;
  }

  dom.sessionsList.innerHTML = state.sessions
    .map((sessionItem) => `
      <article class="active-session-card">
        <strong>${escapeHtml(sessionItem.customer_name || 'Contato sem nome')}</strong>
        <p>${escapeHtml(formatPhone(sessionItem.phone))}</p>
        <small>Fluxo: ${escapeHtml(sessionItem.flow_name || `#${sessionItem.flow_id || '--'}`)}</small>
        <div class="active-session-meta">
          <span class="flow-chip">Nó: ${escapeHtml(sessionItem.current_node_id || '--')}</span>
          <span class="flow-chip">Esperando: ${escapeHtml(sessionItem.waiting_for || 'continuação')}</span>
        </div>
        <small>Última atividade: ${escapeHtml(formatFlowDate(sessionItem.last_activity))}</small>
      </article>
    `)
    .join('');
}

function renderAll() {
  renderOverview();
  renderFlowsTable();
  renderSessions();
}

async function loadFlows() {
  setInlineStatus(dom.pageStatus, 'Carregando fluxos visuais...', 'muted');
  state.flows = await session.run((api) => api.fetchFlows()) || [];
  setInlineStatus(dom.pageStatus, `${state.flows.length} fluxo(s) carregado(s).`, 'ok');
}

async function loadSessions() {
  state.sessions = await session.run((api) => api.fetchActiveFlowSessions()) || [];
}

async function refreshPage() {
  dom.refreshBtn.disabled = true;
  try {
    await Promise.all([loadFlows(), loadSessions()]);
    renderAll();
  } catch (error) {
    setInlineStatus(dom.pageStatus, error.message, 'err');
  } finally {
    dom.refreshBtn.disabled = false;
  }
}

async function handleCreateFlow(event) {
  event.preventDefault();

  const formData = new FormData(dom.form);
  const payload = {
    name: String(formData.get('name') || '').trim(),
    trigger_keyword: String(formData.get('trigger_keyword') || '').trim(),
    template_key: String(formData.get('template_key') || '').trim() || null,
  };

  if (!payload.name || !payload.trigger_keyword) {
    setInlineStatus(dom.createStatus, 'Informe nome e gatilho para criar o fluxo.', 'err');
    return;
  }

  setInlineStatus(dom.createStatus, 'Criando fluxo inicial...', 'muted');

  try {
    const created = await session.run((api) => api.createFlow(payload));
    showToast(dom.toast, `Fluxo "${created.name}" criado com sucesso.`, 'ok');
    closeDialog();
    window.location.href = `/admin/fluxos/editor?id=${created.id}`;
  } catch (error) {
    setInlineStatus(dom.createStatus, error.message, 'err');
  }
}

async function handleTableAction(event) {
  const actionButton = event.target.closest('[data-flow-action]');
  if (!actionButton) return;

  const action = actionButton.dataset.flowAction;
  const flowId = Number(actionButton.dataset.flowId);
  if (!Number.isInteger(flowId) || flowId < 1) return;

  actionButton.disabled = true;

  try {
    if (action === 'publish') {
      const confirmed = window.confirm('Tem certeza? O fluxo publicado para este gatilho será substituído.');
      if (!confirmed) return;
      await session.run((api) => api.publishFlow(flowId));
      showToast(dom.toast, 'Fluxo publicado com sucesso.', 'ok');
    }

    if (action === 'unpublish') {
      await session.run((api) => api.unpublishFlow(flowId));
      showToast(dom.toast, 'Fluxo voltou para rascunho.', 'ok');
    }

    if (action === 'delete') {
      const confirmed = window.confirm('Excluir este fluxo em rascunho? Esta ação não pode ser desfeita.');
      if (!confirmed) return;
      await session.run((api) => api.deleteFlow(flowId));
      showToast(dom.toast, 'Fluxo excluído com sucesso.', 'ok');
    }

    await refreshPage();
  } catch (error) {
    showToast(dom.toast, error.message, 'err');
    setInlineStatus(dom.pageStatus, error.message, 'err');
  } finally {
    actionButton.disabled = false;
  }
}

dom.refreshBtn?.addEventListener('click', () => {
  refreshPage();
});

dom.starterBtn?.addEventListener('click', () => {
  openCreateDialog('starter');
});

dom.newFlowBtn?.addEventListener('click', () => {
  openCreateDialog('blank');
});

dom.importLegacyBtn?.addEventListener('click', () => {
  openCreateDialog('legacy');
});

dom.dialog?.addEventListener('click', (event) => {
  if (event.target === dom.dialog) {
    closeDialog();
  }
});

dom.form?.addEventListener('submit', handleCreateFlow);
dom.flowsTableBody?.addEventListener('click', handleTableAction);

(async function bootstrap() {
  try {
    await session.ensureSession();
    await refreshPage();
  } catch (error) {
    setInlineStatus(dom.pageStatus, error.message, 'err');
  }
}());
