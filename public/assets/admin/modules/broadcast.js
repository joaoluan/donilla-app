const BROADCAST_STATUS_LABELS = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  running: 'Enviando saudacoes',
  awaiting_reply: 'Aguardando respostas',
  done: 'Concluida',
  failed: 'Falhou',
};

const LOG_STATUS_LABELS = {
  pending: 'Pendente',
  sent: 'Enviado',
  greeting_sent: 'Saudacao enviada',
  replied: 'Cliente respondeu',
  completed: 'Mensagem principal enviada',
  no_response: 'Sem resposta (24h)',
  failed: 'Falhou',
};

const POLL_INTERVAL_MS = 5000;

function clampTab(value) {
  return ['lists', 'templates', 'compose', 'campaigns'].includes(value) ? value : 'lists';
}

export function bindBroadcastSection(ctx) {
  const { state, helpers, api } = ctx;

  const viewEl = document.getElementById('broadcast');
  if (!viewEl) return;

  const tabButtons = Array.from(document.querySelectorAll('[data-broadcast-tab]'));
  const tabPanels = Array.from(document.querySelectorAll('[data-broadcast-panel]'));

  const listsStatusEl = document.getElementById('broadcastListsStatus');
  const listGridEl = document.getElementById('broadcastListsGrid');
  const membersTitleEl = document.getElementById('broadcastMembersTitle');
  const membersMetaEl = document.getElementById('broadcastMembersMeta');
  const membersStatusEl = document.getElementById('broadcastMembersStatus');
  const membersListEl = document.getElementById('broadcastMembersList');
  const addMemberBtnEl = document.getElementById('broadcastAddMemberBtn');
  const importClientsBtnEl = document.getElementById('broadcastImportClientsBtn');

  const templatesStatusEl = document.getElementById('broadcastTemplatesStatus');
  const templatesGridEl = document.getElementById('broadcastTemplatesGrid');

  const campaignFormEl = document.getElementById('broadcastCampaignForm');
  const campaignStatusEl = document.getElementById('broadcastCampaignFormStatus');
  const campaignListSelectEl = document.getElementById('broadcastCampaignList');
  const campaignMessageEl = document.getElementById('broadcastCampaignMessage');
  const campaignScheduleEl = document.getElementById('broadcastCampaignScheduledAt');
  const useTemplateBtnEl = document.getElementById('broadcastUseTemplateBtn');

  const campaignsStatusEl = document.getElementById('broadcastCampaignsStatus');
  const campaignsTableEl = document.getElementById('broadcastCampaignsTable');
  const campaignsRefreshBtnEl = document.getElementById('broadcastCampaignsRefreshBtn');

  const statListsEl = document.getElementById('broadcastStatLists');
  const statTemplatesEl = document.getElementById('broadcastStatTemplates');
  const statCampaignsEl = document.getElementById('broadcastStatCampaigns');
  const statRunningEl = document.getElementById('broadcastStatRunning');

  const listDialogEl = document.getElementById('broadcastListDialog');
  const listFormEl = document.getElementById('broadcastListForm');
  const listDialogStatusEl = document.getElementById('broadcastListDialogStatus');

  const memberDialogEl = document.getElementById('broadcastMemberDialog');
  const memberFormEl = document.getElementById('broadcastMemberForm');
  const memberDialogStatusEl = document.getElementById('broadcastMemberDialogStatus');

  const templateDialogEl = document.getElementById('broadcastTemplateDialog');
  const templateFormEl = document.getElementById('broadcastTemplateForm');
  const templateDialogStatusEl = document.getElementById('broadcastTemplateDialogStatus');

  const templatePickerDialogEl = document.getElementById('broadcastTemplatePickerDialog');
  const templatePickerListEl = document.getElementById('broadcastTemplatePickerList');
  const templatePickerStatusEl = document.getElementById('broadcastTemplatePickerStatus');

  const logsDialogEl = document.getElementById('broadcastLogsDialog');
  const logsTitleEl = document.getElementById('broadcastLogsTitle');
  const logsStatusEl = document.getElementById('broadcastLogsStatus');
  const logsTableEl = document.getElementById('broadcastLogsTable');

  const confirmDialogEl = document.getElementById('broadcastConfirmDialog');
  const confirmTitleEl = document.getElementById('broadcastConfirmTitle');
  const confirmMessageEl = document.getElementById('broadcastConfirmMessage');
  const confirmCloseBtnEl = document.getElementById('broadcastConfirmCloseBtn');
  const confirmCancelBtnEl = document.getElementById('broadcastConfirmCancelBtn');
  const confirmSubmitBtnEl = document.getElementById('broadcastConfirmSubmitBtn');

  const localState = {
    activeTab: 'lists',
    lists: [],
    members: [],
    templates: [],
    campaigns: [],
    selectedListId: null,
    logsCampaignId: null,
    loadPromise: null,
    pollTimer: null,
  };

  const confirmState = {
    resolve: null,
  };

  function isViewActive() {
    return !viewEl.classList.contains('hidden');
  }

  function openDialog(dialogEl) {
    if (!dialogEl) return;
    if (typeof dialogEl.showModal === 'function') {
      dialogEl.showModal();
      return;
    }

    dialogEl.setAttribute('open', 'open');
  }

  function closeDialog(dialogEl) {
    if (!dialogEl) return;
    if (typeof dialogEl.close === 'function') {
      dialogEl.close();
      return;
    }

    dialogEl.removeAttribute('open');
  }

  function resetConfirmDialog() {
    if (confirmTitleEl) confirmTitleEl.textContent = 'Confirmar acao';
    if (confirmMessageEl) confirmMessageEl.textContent = 'Deseja continuar com esta acao?';
    if (confirmSubmitBtnEl) {
      confirmSubmitBtnEl.textContent = 'Confirmar';
      confirmSubmitBtnEl.dataset.tone = 'danger';
    }
  }

  function settleConfirm(value) {
    const resolve = confirmState.resolve;
    confirmState.resolve = null;
    resetConfirmDialog();
    closeDialog(confirmDialogEl);
    if (resolve) resolve(Boolean(value));
  }

  function confirmAction(options = {}) {
    const {
      title = 'Confirmar acao',
      message = 'Deseja continuar com esta acao?',
      confirmLabel = 'Confirmar',
      tone = 'danger',
    } = options;

    if (!confirmDialogEl || !confirmTitleEl || !confirmMessageEl || !confirmSubmitBtnEl) {
      return Promise.resolve(window.confirm(message));
    }

    if (confirmState.resolve) {
      settleConfirm(false);
    }

    confirmTitleEl.textContent = title;
    confirmMessageEl.textContent = message;
    confirmSubmitBtnEl.textContent = confirmLabel;
    confirmSubmitBtnEl.dataset.tone = tone;
    openDialog(confirmDialogEl);
    window.requestAnimationFrame(() => confirmSubmitBtnEl.focus());

    return new Promise((resolve) => {
      confirmState.resolve = resolve;
    });
  }

  function escapeHtml(value) {
    return helpers.escapeHtml(String(value || ''));
  }

  function setStatus(target, message, type = 'muted') {
    helpers.setStatus(target, message, type);
  }

  function clearStatus(target) {
    helpers.clearStatus(target);
  }

  function statusLabel(status) {
    return BROADCAST_STATUS_LABELS[String(status || '').trim()] || 'Desconhecido';
  }

  function logStatusLabel(status) {
    return LOG_STATUS_LABELS[String(status || '').trim()] || 'Pendente';
  }

  function statusBadge(status) {
    const normalized = String(status || 'draft').trim().toLowerCase();
    return `<span class="broadcast-status-badge ${escapeHtml(normalized)}">${escapeHtml(statusLabel(normalized))}</span>`;
  }

  function logStatusBadge(status) {
    const normalized = String(status || 'pending').trim().toLowerCase();
    return `<span class="broadcast-status-badge ${escapeHtml(normalized)}">${escapeHtml(logStatusLabel(normalized))}</span>`;
  }

  function progressMarkup(campaign) {
    const total = Number(campaign?.total_contacts || 0);
    const sent = Number(campaign?.sent_count || 0);
    const failed = Number(campaign?.failed_count || 0);
    const pending = Number(campaign?.pending_logs_count || 0);
    const awaitingReply = Number(campaign?.awaiting_reply_count || 0);
    const completed = Number(campaign?.completed_count || 0);
    const noResponse = Number(campaign?.no_response_count || 0);
    const resolved = completed + noResponse + failed;

    let processed = sent + failed;
    let percent = total > 0 ? Math.max(0, Math.min(100, Math.round((processed / total) * 100))) : 0;
    let leftLabel = `${processed} de ${total || 0}`;
    let rightLabel = `${percent}%`;

    if (campaign?.status === 'running') {
      processed = total > 0 ? Math.max(0, total - pending) : sent + failed;
      percent = total > 0 ? Math.max(0, Math.min(100, Math.round((processed / total) * 100))) : 0;
      leftLabel = `${processed} saudacao(oes) processada(s)`;
      rightLabel = `${pending} pendente(s)`;
    } else if (campaign?.status === 'awaiting_reply') {
      percent = total > 0 ? Math.max(0, Math.min(100, Math.round((resolved / total) * 100))) : 0;
      leftLabel = `${awaitingReply} aguardando resposta`;
      rightLabel = `${resolved} fluxo(s) encerrado(s)`;
    } else if (campaign?.status === 'done') {
      percent = total > 0 ? Math.max(0, Math.min(100, Math.round((resolved / total) * 100))) : 0;
      leftLabel = `${resolved} de ${total || 0} encerrado(s)`;
      rightLabel = `${completed} convertido(s)`;
    }

    return `
      <div class="broadcast-progress">
        <div class="broadcast-progress-track">
          <div class="broadcast-progress-fill" style="width: ${percent}%"></div>
        </div>
        <div class="broadcast-progress-meta">
          <span>${escapeHtml(leftLabel)}</span>
          <span>${escapeHtml(rightLabel)}</span>
        </div>
      </div>
    `;
  }

  function listSelectionBadge(selected) {
    return selected
      ? '<span class="broadcast-chip">Lista ativa</span>'
      : '<span class="broadcast-chip">Disponivel</span>';
  }

  function updateOverview() {
    if (statListsEl) statListsEl.textContent = String(localState.lists.length);
    if (statTemplatesEl) statTemplatesEl.textContent = String(localState.templates.length);
    if (statCampaignsEl) statCampaignsEl.textContent = String(localState.campaigns.length);
    if (statRunningEl) {
      statRunningEl.textContent = String(
        localState.campaigns.filter((campaign) => ['running', 'awaiting_reply'].includes(campaign.status)).length,
      );
    }
  }

  function updateCampaignListOptions() {
    if (!campaignListSelectEl) return;

    const currentValue = campaignListSelectEl.value;
    const options = ['<option value="">Selecione uma lista</option>']
      .concat(
        localState.lists.map((list) => (
          `<option value="${list.id}">${escapeHtml(list.name)} (${Number(list.member_count || 0)} contato(s))</option>`
        )),
      )
      .join('');

    campaignListSelectEl.innerHTML = options;

    if (currentValue && localState.lists.some((list) => String(list.id) === String(currentValue))) {
      campaignListSelectEl.value = currentValue;
      return;
    }

    if (!campaignListSelectEl.value && localState.selectedListId) {
      campaignListSelectEl.value = String(localState.selectedListId);
    }
  }

  function renderTemplatePicker() {
    if (!templatePickerListEl) return;

    if (!localState.templates.length) {
      templatePickerListEl.innerHTML = '<div class="broadcast-empty"><p>Nenhum template salvo ainda.</p></div>';
      return;
    }

    templatePickerListEl.innerHTML = localState.templates
      .map((template) => `
        <article class="broadcast-template-picker-item">
          <div class="broadcast-card-head">
            <div>
              <strong>${escapeHtml(template.name)}</strong>
              <small class="muted">Criado em ${escapeHtml(helpers.dateTime(template.created_at))}</small>
            </div>
            <button class="ghost-btn" type="button" data-broadcast-pick-template="${template.id}">Usar este</button>
          </div>
          <p>${escapeHtml(template.content)}</p>
        </article>
      `)
      .join('');
  }

  function renderLists() {
    if (!listGridEl) return;

    if (!localState.lists.length) {
      listGridEl.innerHTML = `
        <div class="broadcast-empty">
          <p>Nenhuma lista criada ainda. Crie a primeira lista para organizar seus contatos.</p>
        </div>
      `;
      return;
    }

    listGridEl.innerHTML = localState.lists
      .map((list) => {
        const selected = Number(localState.selectedListId || 0) === Number(list.id || 0);
        return `
          <article class="broadcast-list-card ${selected ? 'active' : ''}">
            <div class="broadcast-card-head">
              <div>
                <h4>${escapeHtml(list.name)}</h4>
                <p class="muted">${escapeHtml(list.description || 'Sem descricao adicional.')}</p>
              </div>
              ${listSelectionBadge(selected)}
            </div>

            <div class="broadcast-list-meta">
              <span class="broadcast-chip">${Number(list.member_count || 0)} contato(s)</span>
              <span class="broadcast-chip">Criada em ${escapeHtml(helpers.dateTime(list.created_at))}</span>
            </div>

            <div class="broadcast-list-actions">
              <button class="ghost-btn" type="button" data-broadcast-select-list="${list.id}">Abrir membros</button>
              <button class="ghost-btn" type="button" data-broadcast-import-list="${list.id}">Importar todos clientes</button>
              <button class="ghost-btn" type="button" data-broadcast-delete-list="${list.id}">Excluir</button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  function renderMembers() {
    const currentList = localState.lists.find((list) => Number(list.id || 0) === Number(localState.selectedListId || 0)) || null;

    if (membersTitleEl) {
      membersTitleEl.textContent = currentList ? `Membros de ${currentList.name}` : 'Membros da lista';
    }

    if (membersMetaEl) {
      membersMetaEl.textContent = currentList
        ? `${Number(currentList.member_count || 0)} contato(s) disponivel(is) para disparo nesta lista.`
        : 'Selecione uma lista para ver e gerenciar os membros.';
    }

    if (addMemberBtnEl) addMemberBtnEl.disabled = !currentList;
    if (importClientsBtnEl) importClientsBtnEl.disabled = !currentList;

    if (!membersListEl) return;

    if (!currentList) {
      membersListEl.innerHTML = `
        <div class="broadcast-empty">
          <p>Escolha uma lista acima para ver quem vai receber os disparos.</p>
        </div>
      `;
      return;
    }

    if (!localState.members.length) {
      membersListEl.innerHTML = `
        <div class="broadcast-empty">
          <p>Esta lista ainda nao possui contatos. Adicione manualmente ou importe todos os clientes.</p>
        </div>
      `;
      return;
    }

    membersListEl.innerHTML = `
      <div class="broadcast-members-table-wrap">
        <table class="broadcast-table">
          <thead>
            <tr>
              <th>Contato</th>
              <th>Telefone</th>
              <th>Adicionado em</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            ${localState.members.map((member) => `
              <tr>
                <td>
                  <strong>${escapeHtml(member.name || 'Sem nome')}</strong>
                  <small class="muted">ID ${Number(member.id || 0)}</small>
                </td>
                <td>${escapeHtml(helpers.formatPhone(member.phone) || member.phone)}</td>
                <td>${escapeHtml(helpers.dateTime(member.added_at))}</td>
                <td>
                  <div class="broadcast-table-actions">
                    <button
                      class="ghost-btn"
                      type="button"
                      data-broadcast-remove-member="${escapeHtml(member.phone)}"
                    >
                      Remover
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderTemplates() {
    if (!templatesGridEl) return;

    if (!localState.templates.length) {
      templatesGridEl.innerHTML = `
        <div class="broadcast-empty">
          <p>Guarde aqui mensagens prontas para reaproveitar em campanhas sazonais, cupons ou avisos importantes.</p>
        </div>
      `;
      return;
    }

    templatesGridEl.innerHTML = localState.templates
      .map((template) => `
        <article class="broadcast-template-card">
          <div class="broadcast-card-head">
            <div>
              <h4>${escapeHtml(template.name)}</h4>
              <small class="muted">${escapeHtml(helpers.dateTime(template.created_at))}</small>
            </div>
          </div>
          <p class="broadcast-template-preview">${escapeHtml(template.content)}</p>
          <div class="broadcast-template-actions">
            <button class="ghost-btn" type="button" data-broadcast-use-template="${template.id}">Usar na campanha</button>
            <button class="ghost-btn" type="button" data-broadcast-delete-template="${template.id}">Excluir</button>
          </div>
        </article>
      `)
      .join('');
  }

  function renderCampaigns() {
    if (!campaignsTableEl) return;

    if (!localState.campaigns.length) {
      campaignsTableEl.innerHTML = `
        <div class="broadcast-empty">
          <p>Nenhuma campanha criada ainda. Monte uma campanha e acompanhe o progresso aqui.</p>
        </div>
      `;
      return;
    }

    campaignsTableEl.innerHTML = `
      <div class="broadcast-campaign-table-wrap">
        <table class="broadcast-table">
          <thead>
            <tr>
              <th>Campanha</th>
              <th>Lista</th>
              <th>Status</th>
              <th>Progresso</th>
              <th>Datas</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            ${localState.campaigns.map((campaign) => `
              <tr>
                <td>
                  <strong>${escapeHtml(campaign.name)}</strong>
                  <small class="muted">${escapeHtml(campaign.message)}</small>
                </td>
                <td>${escapeHtml(campaign.list_name || 'Lista removida')}</td>
                <td>${statusBadge(campaign.status)}</td>
                <td>${progressMarkup(campaign)}</td>
                <td>
                  <strong>Criada</strong>
                  <small class="muted">${escapeHtml(helpers.dateTime(campaign.created_at))}</small>
                  <br />
                  <strong>Agendada</strong>
                  <small class="muted">${escapeHtml(campaign.scheduled_at ? helpers.dateTime(campaign.scheduled_at) : 'Nao agendada')}</small>
                </td>
                <td>
                  <div class="broadcast-table-actions">
                    ${campaign.status === 'draft'
                      ? `<button class="ghost-btn" type="button" data-broadcast-start-campaign="${campaign.id}">Iniciar</button>`
                      : ''
                    }
                    ${campaign.status === 'scheduled'
                      ? `<button class="ghost-btn" type="button" data-broadcast-cancel-campaign="${campaign.id}">Cancelar</button>`
                      : ''
                    }
                    ${!['running', 'awaiting_reply'].includes(campaign.status)
                      ? `<button class="ghost-btn" type="button" data-broadcast-delete-campaign="${campaign.id}">Excluir</button>`
                      : ''
                    }
                    <button class="ghost-btn" type="button" data-broadcast-view-logs="${campaign.id}">Ver logs</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderLogs(campaign, logs = []) {
    if (logsTitleEl) {
      logsTitleEl.textContent = campaign
        ? `Logs da campanha ${campaign.name}`
        : 'Logs da campanha';
    }

    if (logsStatusEl) {
      if (!campaign) {
        logsStatusEl.textContent = 'Selecione uma campanha para ver os logs.';
      } else {
        const sent = Number(campaign.sent_count || 0);
        const failed = Number(campaign.failed_count || 0);
        const total = Number(campaign.total_contacts || 0);
        const awaitingReply = Number(campaign.awaiting_reply_count || 0);
        const completed = Number(campaign.completed_count || 0);
        const noResponse = Number(campaign.no_response_count || 0);
        logsStatusEl.textContent = `${sent} saudacao(oes) enviada(s), ${awaitingReply} aguardando resposta, ${completed} principal(is) enviada(s), ${noResponse} sem resposta, ${failed} falha(s), ${total} contato(s) no total.`;
      }
    }

    if (!logsTableEl) return;

    if (!campaign) {
      logsTableEl.innerHTML = `
        <div class="broadcast-empty">
          <p>Nenhum log carregado ainda.</p>
        </div>
      `;
      return;
    }

    if (!logs.length) {
      logsTableEl.innerHTML = `
        <div class="broadcast-empty">
          <p>Os logs ainda nao foram gerados para esta campanha.</p>
        </div>
      `;
      return;
    }

    logsTableEl.innerHTML = `
      <div class="broadcast-logs-table-wrap">
        <table class="broadcast-table">
          <thead>
            <tr>
              <th>Contato</th>
              <th>Telefone</th>
              <th>Status</th>
              <th>Horario</th>
              <th>Erro</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map((log) => `
              <tr>
                <td>${escapeHtml(log.client_name || 'Sem nome')}</td>
                <td>${escapeHtml(helpers.formatPhone(log.phone) || log.phone)}</td>
                <td>${logStatusBadge(log.status)}</td>
                <td>${escapeHtml(log.sent_at ? helpers.dateTime(log.sent_at) : '--')}</td>
                <td>${escapeHtml(log.error_message || '--')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function resetUiForSignedOut() {
    localState.lists = [];
    localState.members = [];
    localState.templates = [];
    localState.campaigns = [];
    localState.selectedListId = null;
    localState.logsCampaignId = null;
    updateOverview();
    updateCampaignListOptions();
    renderTemplatePicker();
    renderLists();
    renderMembers();
    renderTemplates();
    renderCampaigns();
    renderLogs(null, []);
    setStatus(listsStatusEl, 'Faça login para carregar listas de disparo.', 'muted');
    setStatus(membersStatusEl, 'Faça login para gerenciar contatos.', 'muted');
    setStatus(templatesStatusEl, 'Faça login para visualizar templates.', 'muted');
    setStatus(campaignStatusEl, 'Faça login para montar uma campanha.', 'muted');
    setStatus(campaignsStatusEl, 'Faça login para acompanhar as campanhas.', 'muted');
    updatePolling();
  }

  async function request(path, { method = 'GET', body = null, envelope = false } = {}) {
    if (!state.accessToken) {
      throw new Error('Faça login antes de usar os disparos.');
    }

    const buildRequest = () => fetch(path, {
      method,
      headers: helpers.authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    let response = await buildRequest();

    if ((response.status === 401 || response.status === 403) && state.refreshToken) {
      await api.refreshAdminSession();
      response = await buildRequest();
    }

    if (response.status === 401 || response.status === 403) {
      api.clearSession();
      throw new Error('Sessao expirada. Faca login novamente.');
    }

    return envelope ? helpers.parseEnvelope(response) : helpers.parseResponse(response);
  }

  async function loadLists(options = {}) {
    const { silent = false, preserveSelection = true } = options;

    if (!silent) {
      setStatus(listsStatusEl, 'Carregando listas...', 'muted');
    }

    const lists = await request('/admin/broadcast/lists');
    localState.lists = Array.isArray(lists) ? lists : [];
    renderLists();
    updateOverview();
    updateCampaignListOptions();

    const hasSelected = preserveSelection
      && localState.selectedListId
      && localState.lists.some((list) => Number(list.id || 0) === Number(localState.selectedListId || 0));

    localState.selectedListId = hasSelected
      ? Number(localState.selectedListId || 0)
      : Number(localState.lists[0]?.id || 0) || null;

    await loadMembers(localState.selectedListId, { silent: true });

    if (!silent) {
      setStatus(listsStatusEl, `${localState.lists.length} lista(s) carregada(s).`, 'ok');
    }
  }

  async function loadMembers(listId, options = {}) {
    const { silent = false } = options;

    if (!listId) {
      localState.members = [];
      renderMembers();
      return;
    }

    if (!silent) {
      setStatus(membersStatusEl, 'Carregando contatos da lista...', 'muted');
    }

    localState.members = await request(`/admin/broadcast/lists/${listId}/members`);
    renderLists();
    renderMembers();

    if (!silent) {
      setStatus(membersStatusEl, `${localState.members.length} contato(s) carregado(s).`, 'ok');
    }
  }

  async function loadTemplates(options = {}) {
    const { silent = false } = options;

    if (!silent) {
      setStatus(templatesStatusEl, 'Carregando templates...', 'muted');
    }

    const templates = await request('/admin/broadcast/templates');
    localState.templates = Array.isArray(templates) ? templates : [];
    renderTemplates();
    renderTemplatePicker();
    updateOverview();

    if (!silent) {
      setStatus(templatesStatusEl, `${localState.templates.length} template(s) disponivel(is).`, 'ok');
    }
  }

  async function loadCampaigns(options = {}) {
    const { silent = false } = options;

    if (!silent) {
      setStatus(campaignsStatusEl, 'Carregando campanhas...', 'muted');
    }

    const campaigns = await request('/admin/broadcast/campaigns');
    localState.campaigns = Array.isArray(campaigns) ? campaigns : [];
    renderCampaigns();
    updateOverview();
    updatePolling();

    if (!silent) {
      setStatus(campaignsStatusEl, `${localState.campaigns.length} campanha(s) carregada(s).`, 'ok');
    }
  }

  async function loadCampaignLogs(campaignId, options = {}) {
    const { open = false, silent = false } = options;

    if (!campaignId) return;

    if (!silent) {
      setStatus(logsStatusEl, 'Carregando logs da campanha...', 'muted');
    }

    const [campaign, logs] = await Promise.all([
      request(`/admin/broadcast/campaigns/${campaignId}`),
      request(`/admin/broadcast/campaigns/${campaignId}/logs`),
    ]);

    localState.logsCampaignId = Number(campaignId || 0) || null;
    renderLogs(campaign, Array.isArray(logs) ? logs : []);
    updatePolling();

    if (open) {
      openDialog(logsDialogEl);
    }
  }

  async function loadBroadcastData(options = {}) {
    const { force = false } = options;

    if (!state.accessToken) {
      resetUiForSignedOut();
      return;
    }

    if (localState.loadPromise && !force) {
      return localState.loadPromise;
    }

    localState.loadPromise = (async () => {
      await Promise.all([
        loadTemplates({ silent: true }),
        loadCampaigns({ silent: true }),
      ]);
      await loadLists({ silent: true });
    })();

    try {
      await localState.loadPromise;
      setStatus(listsStatusEl, `${localState.lists.length} lista(s) pronta(s) para uso.`, 'ok');
      setStatus(templatesStatusEl, `${localState.templates.length} template(s) carregado(s).`, 'ok');
      setStatus(campaignsStatusEl, `${localState.campaigns.length} campanha(s) sincronizada(s).`, 'ok');
    } catch (error) {
      setStatus(campaignsStatusEl, error.message, 'err');
      setStatus(templatesStatusEl, error.message, 'err');
      setStatus(listsStatusEl, error.message, 'err');
      throw error;
    } finally {
      localState.loadPromise = null;
    }
  }

  function setActiveTab(nextTab) {
    const activeTab = clampTab(nextTab);
    localState.activeTab = activeTab;

    tabButtons.forEach((button) => {
      const isActive = button.dataset.broadcastTab === activeTab;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    tabPanels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.broadcastPanel !== activeTab);
    });
  }

  function updatePolling() {
    if (localState.pollTimer) {
      window.clearInterval(localState.pollTimer);
      localState.pollTimer = null;
    }

    const hasRunningCampaign = localState.campaigns.some((campaign) => ['running', 'awaiting_reply'].includes(campaign.status));
    const activeLogsCampaign = localState.campaigns.find(
      (campaign) => Number(campaign.id || 0) === Number(localState.logsCampaignId || 0),
    );
    const shouldPollLogs = ['running', 'awaiting_reply'].includes(activeLogsCampaign?.status);

    if (!state.accessToken || !isViewActive() || (!hasRunningCampaign && !shouldPollLogs)) {
      return;
    }

    localState.pollTimer = window.setInterval(async () => {
      try {
        await loadCampaigns({ silent: true });

        if (localState.logsCampaignId && logsDialogEl?.open) {
          await loadCampaignLogs(localState.logsCampaignId, { silent: true });
        }
      } catch (error) {
        setStatus(campaignsStatusEl, error.message, 'err');
      }
    }, POLL_INTERVAL_MS);
  }

  function resetDialogStatus() {
    clearStatus(listDialogStatusEl);
    clearStatus(memberDialogStatusEl);
    clearStatus(templateDialogStatusEl);
    clearStatus(templatePickerStatusEl);
  }

  function fillCampaignWithTemplate(templateId) {
    const template = localState.templates.find((item) => Number(item.id || 0) === Number(templateId || 0));
    if (!template || !campaignMessageEl) return;
    campaignMessageEl.value = template.content || '';
    closeDialog(templatePickerDialogEl);
    setActiveTab('compose');
    setStatus(campaignStatusEl, `Template "${template.name}" aplicado na campanha.`, 'ok');
  }

  function bindDialogCloseButtons() {
    document.querySelectorAll('[data-broadcast-dialog-close]').forEach((button) => {
      button.addEventListener('click', () => {
        const dialog = button.closest('dialog');
        closeDialog(dialog);
      });
    });
  }

  confirmCloseBtnEl?.addEventListener('click', () => settleConfirm(false));
  confirmCancelBtnEl?.addEventListener('click', () => settleConfirm(false));
  confirmSubmitBtnEl?.addEventListener('click', () => settleConfirm(true));
  confirmDialogEl?.addEventListener('cancel', (event) => {
    event.preventDefault();
    settleConfirm(false);
  });

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveTab(button.dataset.broadcastTab || 'lists');
    });
  });

  listGridEl?.addEventListener('click', async (event) => {
    const selectButton = event.target.closest('[data-broadcast-select-list]');
    const importButton = event.target.closest('[data-broadcast-import-list]');
    const deleteButton = event.target.closest('[data-broadcast-delete-list]');

    if (selectButton) {
      localState.selectedListId = Number(selectButton.dataset.broadcastSelectList || 0) || null;
      await loadMembers(localState.selectedListId).catch((error) => setStatus(membersStatusEl, error.message, 'err'));
      return;
    }

    if (importButton) {
      const listId = Number(importButton.dataset.broadcastImportList || 0);
      if (!listId) return;
      if (!await confirmAction({
        title: 'Importar clientes',
        message: 'Importar todos os clientes cadastrados para esta lista?',
        confirmLabel: 'Importar',
        tone: 'primary',
      })) return;

      importButton.disabled = true;
      setStatus(membersStatusEl, 'Importando clientes para a lista...', 'muted');

      try {
        const result = await request(`/admin/broadcast/lists/${listId}/import-clients`, {
          method: 'POST',
        });
        await loadLists({ silent: true });
        setStatus(
          membersStatusEl,
          `${Number(result.imported_count || 0)} contato(s) importado(s). Total atual: ${Number(result.total_members || 0)}.`,
          'ok',
        );
      } catch (error) {
        setStatus(membersStatusEl, error.message, 'err');
      } finally {
        importButton.disabled = false;
      }
      return;
    }

    if (deleteButton) {
      const listId = Number(deleteButton.dataset.broadcastDeleteList || 0);
      const list = localState.lists.find((item) => Number(item.id || 0) === listId);
      if (!listId || !await confirmAction({
        title: 'Excluir lista',
        message: `Excluir a lista "${list?.name || 'selecionada'}"?`,
        confirmLabel: 'Excluir lista',
      })) return;

      try {
        await request(`/admin/broadcast/lists/${listId}`, { method: 'DELETE' });
        if (Number(localState.selectedListId || 0) === listId) {
          localState.selectedListId = null;
          localState.members = [];
        }
        await loadLists({ silent: true, preserveSelection: false });
        setStatus(listsStatusEl, 'Lista removida com sucesso.', 'ok');
      } catch (error) {
        setStatus(listsStatusEl, error.message, 'err');
      }
    }
  });

  membersListEl?.addEventListener('click', async (event) => {
    const removeButton = event.target.closest('[data-broadcast-remove-member]');
    if (!removeButton || !localState.selectedListId) return;

    const phone = removeButton.dataset.broadcastRemoveMember || '';
    if (!phone || !await confirmAction({
      title: 'Remover contato',
      message: 'Remover este contato da lista selecionada?',
      confirmLabel: 'Remover',
    })) return;

    try {
      await request(`/admin/broadcast/lists/${localState.selectedListId}/members/${encodeURIComponent(phone)}`, {
        method: 'DELETE',
      });
      await loadLists({ silent: true });
      setStatus(membersStatusEl, 'Contato removido da lista.', 'ok');
    } catch (error) {
      setStatus(membersStatusEl, error.message, 'err');
    }
  });

  templatesGridEl?.addEventListener('click', async (event) => {
    const useButton = event.target.closest('[data-broadcast-use-template]');
    const deleteButton = event.target.closest('[data-broadcast-delete-template]');

    if (useButton) {
      fillCampaignWithTemplate(useButton.dataset.broadcastUseTemplate);
      return;
    }

    if (deleteButton) {
      const templateId = Number(deleteButton.dataset.broadcastDeleteTemplate || 0);
      const template = localState.templates.find((item) => Number(item.id || 0) === templateId);
      if (!templateId || !await confirmAction({
        title: 'Excluir template',
        message: `Excluir o template "${template?.name || 'selecionado'}"?`,
        confirmLabel: 'Excluir template',
      })) return;

      try {
        await request(`/admin/broadcast/templates/${templateId}`, { method: 'DELETE' });
        await loadTemplates({ silent: true });
        setStatus(templatesStatusEl, 'Template removido com sucesso.', 'ok');
      } catch (error) {
        setStatus(templatesStatusEl, error.message, 'err');
      }
    }
  });

  campaignsTableEl?.addEventListener('click', async (event) => {
    const startButton = event.target.closest('[data-broadcast-start-campaign]');
    const cancelButton = event.target.closest('[data-broadcast-cancel-campaign]');
    const deleteButton = event.target.closest('[data-broadcast-delete-campaign]');
    const logsButton = event.target.closest('[data-broadcast-view-logs]');

    if (startButton) {
      const campaignId = Number(startButton.dataset.broadcastStartCampaign || 0);
      if (!campaignId || !await confirmAction({
        title: 'Iniciar campanha',
        message: 'Iniciar o disparo desta campanha agora?',
        confirmLabel: 'Iniciar agora',
        tone: 'primary',
      })) return;

      startButton.disabled = true;
      setStatus(campaignsStatusEl, 'Iniciando campanha...', 'muted');

      try {
        await request(`/admin/broadcast/campaigns/${campaignId}/start`, {
          method: 'POST',
        });
        await loadCampaigns({ silent: true });
        setStatus(campaignsStatusEl, 'Campanha iniciada com sucesso.', 'ok');
      } catch (error) {
        setStatus(campaignsStatusEl, error.message, 'err');
      } finally {
        startButton.disabled = false;
      }
      return;
    }

    if (cancelButton) {
      const campaignId = Number(cancelButton.dataset.broadcastCancelCampaign || 0);
      if (!campaignId || !await confirmAction({
        title: 'Cancelar agendamento',
        message: 'Cancelar o agendamento desta campanha?',
        confirmLabel: 'Cancelar agendamento',
      })) return;

      try {
        await request(`/admin/broadcast/campaigns/${campaignId}/cancel`, {
          method: 'POST',
        });
        await loadCampaigns({ silent: true });
        setStatus(campaignsStatusEl, 'Agendamento cancelado. A campanha voltou para rascunho.', 'ok');
      } catch (error) {
        setStatus(campaignsStatusEl, error.message, 'err');
      }
      return;
    }

    if (deleteButton) {
      const campaignId = Number(deleteButton.dataset.broadcastDeleteCampaign || 0);
      const campaign = localState.campaigns.find((item) => Number(item.id || 0) === campaignId);
      if (!campaignId || !await confirmAction({
        title: 'Excluir campanha',
        message: `Excluir a campanha "${campaign?.name || 'selecionada'}"? Esta acao remove o historico de disparos vinculado a ela.`,
        confirmLabel: 'Excluir campanha',
      })) return;

      try {
        await request(`/admin/broadcast/campaigns/${campaignId}`, {
          method: 'DELETE',
        });
        if (Number(localState.logsCampaignId || 0) === campaignId) {
          localState.logsCampaignId = null;
          renderLogs(null, []);
          closeDialog(logsDialogEl);
        }
        await loadCampaigns({ silent: true });
        setStatus(campaignsStatusEl, 'Campanha removida com sucesso.', 'ok');
      } catch (error) {
        setStatus(campaignsStatusEl, error.message, 'err');
      }
      return;
    }

    if (logsButton) {
      const campaignId = Number(logsButton.dataset.broadcastViewLogs || 0);
      if (!campaignId) return;
      await loadCampaignLogs(campaignId, { open: true }).catch((error) => {
        setStatus(campaignsStatusEl, error.message, 'err');
      });
    }
  });

  listFormEl?.addEventListener('submit', async (event) => {
    event.preventDefault();
    resetDialogStatus();
    setStatus(listDialogStatusEl, 'Criando lista...', 'muted');

    const formData = new FormData(listFormEl);
    const payload = {
      name: String(formData.get('name') || '').trim(),
      description: String(formData.get('description') || '').trim(),
    };

    try {
      const created = await request('/admin/broadcast/lists', {
        method: 'POST',
        body: payload,
      });
      localState.selectedListId = Number(created.id || 0) || null;
      listFormEl.reset();
      closeDialog(listDialogEl);
      await loadLists({ silent: true });
      setStatus(listsStatusEl, 'Lista criada com sucesso.', 'ok');
      setActiveTab('lists');
    } catch (error) {
      setStatus(listDialogStatusEl, error.message, 'err');
    }
  });

  memberFormEl?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!localState.selectedListId) {
      setStatus(memberDialogStatusEl, 'Escolha uma lista antes de adicionar contatos.', 'err');
      return;
    }

    setStatus(memberDialogStatusEl, 'Salvando contato...', 'muted');

    const formData = new FormData(memberFormEl);
    const payload = {
      phone: String(formData.get('phone') || '').trim(),
      name: String(formData.get('name') || '').trim(),
    };

    try {
      await request(`/admin/broadcast/lists/${localState.selectedListId}/members`, {
        method: 'POST',
        body: payload,
      });
      memberFormEl.reset();
      closeDialog(memberDialogEl);
      await loadLists({ silent: true });
      setStatus(membersStatusEl, 'Contato adicionado na lista.', 'ok');
    } catch (error) {
      setStatus(memberDialogStatusEl, error.message, 'err');
    }
  });

  templateFormEl?.addEventListener('submit', async (event) => {
    event.preventDefault();
    resetDialogStatus();
    setStatus(templateDialogStatusEl, 'Salvando template...', 'muted');

    const formData = new FormData(templateFormEl);
    const payload = {
      name: String(formData.get('name') || '').trim(),
      content: String(formData.get('content') || '').trim(),
    };

    try {
      await request('/admin/broadcast/templates', {
        method: 'POST',
        body: payload,
      });
      templateFormEl.reset();
      closeDialog(templateDialogEl);
      await loadTemplates({ silent: true });
      setStatus(templatesStatusEl, 'Template salvo com sucesso.', 'ok');
    } catch (error) {
      setStatus(templateDialogStatusEl, error.message, 'err');
    }
  });

  templatePickerListEl?.addEventListener('click', (event) => {
    const pickButton = event.target.closest('[data-broadcast-pick-template]');
    if (!pickButton) return;
    fillCampaignWithTemplate(pickButton.dataset.broadcastPickTemplate);
  });

  campaignFormEl?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(campaignStatusEl, 'Criando campanha...', 'muted');

    const formData = new FormData(campaignFormEl);
    const scheduledValue = String(formData.get('scheduled_at') || '').trim();
    const scheduledAt = scheduledValue ? new Date(scheduledValue).toISOString() : null;

    const payload = {
      name: String(formData.get('name') || '').trim(),
      list_id: Number(formData.get('list_id') || 0),
      message: String(formData.get('message') || '').trim(),
      scheduled_at: scheduledAt,
    };

    try {
      const created = await request('/admin/broadcast/campaigns', {
        method: 'POST',
        body: payload,
      });

      let successMessage = 'Campanha criada como rascunho.';

      if (!scheduledAt) {
        try {
          await request(`/admin/broadcast/campaigns/${created.id}/start`, {
            method: 'POST',
          });
          successMessage = 'Campanha criada e disparo iniciado imediatamente.';
        } catch (startError) {
          successMessage = `Campanha criada, mas o disparo nao iniciou agora: ${startError.message}`;
          setStatus(campaignStatusEl, successMessage, 'err');
          await loadCampaigns({ silent: true });
          setActiveTab('campaigns');
          return;
        }
      } else {
        successMessage = 'Campanha criada e agendada com sucesso.';
      }

      campaignFormEl.reset();
      if (campaignListSelectEl && localState.selectedListId) {
        campaignListSelectEl.value = String(localState.selectedListId);
      }
      await loadCampaigns({ silent: true });
      setStatus(campaignStatusEl, successMessage, 'ok');
      setActiveTab('campaigns');
    } catch (error) {
      setStatus(campaignStatusEl, error.message, 'err');
    }
  });

  addMemberBtnEl?.addEventListener('click', () => {
    resetDialogStatus();
    if (!localState.selectedListId) {
      setStatus(membersStatusEl, 'Escolha uma lista antes de adicionar contatos.', 'err');
      return;
    }
    openDialog(memberDialogEl);
  });

  importClientsBtnEl?.addEventListener('click', async () => {
    if (!localState.selectedListId) {
      setStatus(membersStatusEl, 'Escolha uma lista antes de importar clientes.', 'err');
      return;
    }

    if (!await confirmAction({
      title: 'Importar clientes',
      message: 'Importar todos os clientes cadastrados para a lista selecionada?',
      confirmLabel: 'Importar',
      tone: 'primary',
    })) return;

    try {
      const result = await request(`/admin/broadcast/lists/${localState.selectedListId}/import-clients`, {
        method: 'POST',
      });
      await loadLists({ silent: true });
      setStatus(
        membersStatusEl,
        `${Number(result.imported_count || 0)} contato(s) importado(s) na lista atual.`,
        'ok',
      );
    } catch (error) {
      setStatus(membersStatusEl, error.message, 'err');
    }
  });

  document.getElementById('broadcastNewListBtn')?.addEventListener('click', () => {
    resetDialogStatus();
    listFormEl?.reset();
    openDialog(listDialogEl);
  });

  document.getElementById('broadcastNewTemplateBtn')?.addEventListener('click', () => {
    resetDialogStatus();
    templateFormEl?.reset();
    openDialog(templateDialogEl);
  });

  useTemplateBtnEl?.addEventListener('click', () => {
    resetDialogStatus();
    renderTemplatePicker();
    if (!localState.templates.length) {
      setStatus(templatePickerStatusEl, 'Crie um template antes de usar esta opcao.', 'err');
    }
    openDialog(templatePickerDialogEl);
  });

  campaignsRefreshBtnEl?.addEventListener('click', async () => {
    try {
      await loadCampaigns();
    } catch (error) {
      setStatus(campaignsStatusEl, error.message, 'err');
    }
  });

  logsDialogEl?.addEventListener('close', () => {
    localState.logsCampaignId = null;
    updatePolling();
  });

  document.addEventListener('admin:view-change', (event) => {
    const nextView = event?.detail?.view || '';
    if (nextView === 'broadcast') {
      updatePolling();
      if (state.accessToken) {
        loadBroadcastData().catch((error) => setStatus(campaignsStatusEl, error.message, 'err'));
      }
      return;
    }

    updatePolling();
  });

  document.addEventListener('admin:session-active', () => {
    if (!isViewActive()) return;
    loadBroadcastData({ force: true }).catch((error) => setStatus(campaignsStatusEl, error.message, 'err'));
  });

  document.addEventListener('admin:session-cleared', () => {
    resetUiForSignedOut();
    closeDialog(listDialogEl);
    closeDialog(memberDialogEl);
    closeDialog(templateDialogEl);
    closeDialog(templatePickerDialogEl);
    closeDialog(logsDialogEl);
  });

  bindDialogCloseButtons();
  setActiveTab('lists');
  resetUiForSignedOut();

  api.loadBroadcastData = loadBroadcastData;
}
