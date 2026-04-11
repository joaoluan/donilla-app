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
const DEFAULT_PAGE_LIMIT = 100;

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
  const audienceBuilderEl = document.getElementById('broadcastAudienceBuilder');
  const audienceListNameEl = document.getElementById('broadcastAudienceListName');
  const audienceDescriptionEl = document.getElementById('broadcastAudienceDescription');
  const audienceRuleCountEl = document.getElementById('broadcastAudienceRuleCount');
  const audienceLogicLabelEl = document.getElementById('broadcastAudienceLogicLabel');
  const audienceRulesEl = document.getElementById('broadcastAudienceRules');
  const audienceLogicEl = document.getElementById('broadcastAudienceLogic');
  const audiencePickerEl = document.getElementById('broadcastAudiencePicker');
  const audiencePickerSearchEl = document.getElementById('broadcastAudiencePickerSearch');
  const audiencePickerResultsEl = document.getElementById('broadcastAudiencePickerResults');
  const audiencePickerCloseBtnEl = document.getElementById('broadcastAudiencePickerCloseBtn');
  const audiencePreviewEl = document.getElementById('broadcastAudiencePreview');
  const audienceTotalEl = document.getElementById('broadcastAudienceTotal');
  const audiencePreviewCaptionEl = document.getElementById('broadcastAudiencePreviewCaption');
  const audienceSampleEl = document.getElementById('broadcastAudienceSample');
  const audienceStatusEl = document.getElementById('broadcastAudienceStatus');
  const addRuleBtnEl = document.getElementById('broadcastAddRuleBtn');
  const previewAudienceBtnEl = document.getElementById('broadcastPreviewAudienceBtn');
  const saveSegmentBtnEl = document.getElementById('broadcastSaveSegmentBtn');

  const templatesStatusEl = document.getElementById('broadcastTemplatesStatus');
  const templatesGridEl = document.getElementById('broadcastTemplatesGrid');

  const campaignFormEl = document.getElementById('broadcastCampaignForm');
  const campaignStatusEl = document.getElementById('broadcastCampaignFormStatus');
  const campaignListSelectEl = document.getElementById('broadcastCampaignList');
  const campaignMessageEl = document.getElementById('broadcastCampaignMessage');
  const campaignMessageCountEl = document.getElementById('broadcastCampaignMessageCount');
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
  const templateContentEl = templateFormEl?.elements?.content || null;
  const templateContentCountEl = document.getElementById('broadcastTemplateContentCount');

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
    membersMeta: null,
    templates: [],
    campaigns: [],
    selectedListId: null,
    logs: [],
    logsMeta: null,
    logsCampaign: null,
    logsCampaignId: null,
    loadPromise: null,
    pollTimer: null,
  };

  const confirmState = {
    resolve: null,
  };

  let audienceRules = [];
  let lastPreviewTotal = 0;
  let audiencePreviewTimer = null;
  let audiencePreviewRequestId = 0;

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

  function buildPaginationQuery({ limit = DEFAULT_PAGE_LIMIT, offset = 0 } = {}) {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return params.toString();
  }

  function mergePaginationMeta(rawMeta, loadedCount, fallbackLimit = DEFAULT_PAGE_LIMIT) {
    const total = Number(rawMeta?.total || 0);
    const limit = Number(rawMeta?.limit || fallbackLimit) || fallbackLimit;
    const loaded = Math.max(0, Number(loadedCount || 0));
    return {
      total,
      limit,
      offset: 0,
      loaded,
      has_more: loaded < total,
      next_offset: loaded < total ? loaded : null,
    };
  }

  function bindCharacterCounter(inputEl, counterEl) {
    if (!inputEl || !counterEl) return () => {};

    const render = () => {
      const hardLimit = Number.parseInt(String(inputEl.getAttribute('maxlength') || ''), 10);
      const softLimit = Number.parseInt(String(inputEl.dataset.softLimit || ''), 10);
      const currentLength = String(inputEl.value || '').length;
      const warningThreshold = Number.isFinite(softLimit) && softLimit > 0
        ? softLimit
        : (Number.isFinite(hardLimit) && hardLimit > 0 ? Math.max(1, Math.floor(hardLimit * 0.9)) : null);

      counterEl.textContent = Number.isFinite(hardLimit) && hardLimit > 0
        ? `${currentLength}/${hardLimit}`
        : String(currentLength);
      counterEl.classList.toggle('warning', warningThreshold !== null && currentLength >= warningThreshold && (!Number.isFinite(hardLimit) || currentLength < hardLimit));
      counterEl.classList.toggle('danger', Number.isFinite(hardLimit) && hardLimit > 0 && currentLength >= hardLimit);
    };

    inputEl.addEventListener('input', render);
    return render;
  }

  const syncCampaignMessageCounter = bindCharacterCounter(campaignMessageEl, campaignMessageCountEl);
  const syncTemplateContentCounter = bindCharacterCounter(templateContentEl, templateContentCountEl);

  function syncBroadcastMessageCounters() {
    syncCampaignMessageCounter();
    syncTemplateContentCounter();
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
    const totalMembers = Number(localState.membersMeta?.total ?? currentList?.member_count ?? localState.members.length ?? 0);

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
      <div class="broadcast-pagination">
        <span class="broadcast-pagination-summary">Exibindo ${localState.members.length} de ${totalMembers} contato(s).</span>
        ${localState.membersMeta?.has_more
          ? '<button class="ghost-btn" type="button" data-broadcast-load-more-members="true">Carregar mais</button>'
          : ''
        }
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
                    ${Number(campaign.failed_count || 0) > 0 && !['running', 'awaiting_reply'].includes(campaign.status)
                      ? `<button class="ghost-btn" type="button" data-broadcast-retry-failed-campaign="${campaign.id}">Reenviar falhas</button>`
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

  function renderLogs() {
    const campaign = localState.logsCampaign;
    const logs = Array.isArray(localState.logs) ? localState.logs : [];

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
      <div class="broadcast-pagination">
        <span class="broadcast-pagination-summary">Exibindo ${logs.length} de ${Number(localState.logsMeta?.total || logs.length)} log(s).</span>
        ${localState.logsMeta?.has_more
          ? '<button class="ghost-btn" type="button" data-broadcast-load-more-logs="true">Carregar mais</button>'
          : ''
        }
      </div>
    `;
  }

  function resetUiForSignedOut() {
    localState.lists = [];
    localState.members = [];
    localState.membersMeta = null;
    localState.templates = [];
    localState.campaigns = [];
    localState.logs = [];
    localState.logsMeta = null;
    localState.logsCampaign = null;
    localState.selectedListId = null;
    localState.logsCampaignId = null;
    audienceRules = [];
    campaignFormEl?.reset();
    templateFormEl?.reset();
    if (audienceListNameEl) audienceListNameEl.value = '';
    if (audienceDescriptionEl) audienceDescriptionEl.value = '';
    if (audiencePickerSearchEl) audiencePickerSearchEl.value = '';
    setAudiencePickerOpen(false);
    syncBroadcastMessageCounters();
    updateOverview();
    updateCampaignListOptions();
    renderTemplatePicker();
    renderLists();
    renderMembers();
    renderTemplates();
    renderCampaigns();
    renderLogs();
    renderAudienceRules();
    resetAudiencePreview({
      caption: 'Faca login para consultar a audiencia dessa lista.',
      sampleLabel: 'Amostra disponivel apos o login.',
      clearMessage: true,
    });
    setStatus(listsStatusEl, 'Faça login para carregar listas de disparo.', 'muted');
    setStatus(membersStatusEl, 'Faça login para gerenciar contatos.', 'muted');
    setStatus(templatesStatusEl, 'Faça login para visualizar templates.', 'muted');
    setStatus(campaignStatusEl, 'Faça login para montar uma campanha.', 'muted');
    setStatus(campaignsStatusEl, 'Faça login para acompanhar as campanhas.', 'muted');
    setStatus(audienceStatusEl, 'Faça login para usar filtros de audiencia.', 'muted');
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

  const AUDIENCE_CATEGORY_META = {
    behavior: {
      label: 'Comportamento de compra',
      description: 'Recencia, frequencia e gasto acumulado.',
      shortLabel: 'Comportamento',
    },
    product: {
      label: 'Produto e categoria',
      description: 'Historico do que cada cliente ja comprou.',
      shortLabel: 'Produto',
    },
    profile: {
      label: 'Perfil do cliente',
      description: 'Localizacao e dados de cadastro.',
      shortLabel: 'Perfil',
    },
  };

  const BIRTHDAY_MONTH_OPTIONS = [
    { value: '1', label: 'Janeiro' },
    { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Marco' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' },
    { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ];

  const AUDIENCE_FIELDS = [
    {
      value: 'last_order_days',
      label: 'Dias desde o ultimo pedido',
      category: 'behavior',
      description: 'Identifique clientes inativos ou quem comprou recentemente.',
      valueLabel: 'Dias',
      placeholder: 'Ex.: 30',
      pickerTag: 'Numero',
    },
    {
      value: 'registration_days',
      label: 'Dias desde cadastro',
      category: 'profile',
      description: 'Separe clientes novos ou mais antigos na base.',
      valueLabel: 'Dias',
      placeholder: 'Ex.: 15',
      pickerTag: 'Numero',
    },
    {
      value: 'birthday_month',
      label: 'Mes de aniversario',
      category: 'profile',
      description: 'Separe campanhas para quem faz aniversario em um mes especifico.',
      valueLabel: 'Mes',
      inputKind: 'select',
      options: BIRTHDAY_MONTH_OPTIONS,
      pickerTag: 'Selecao',
    },
    {
      value: 'age_years',
      label: 'Idade',
      category: 'profile',
      description: 'Use a data de aniversario para segmentar por faixa etaria.',
      valueLabel: 'Anos',
      placeholder: 'Ex.: 30',
      pickerTag: 'Numero',
    },
    {
      value: 'total_orders',
      label: 'Total de pedidos',
      category: 'behavior',
      description: 'Separe clientes recorrentes, ocasionais ou novos.',
      valueLabel: 'Quantidade',
      placeholder: 'Ex.: 5',
      pickerTag: 'Numero',
    },
    {
      value: 'total_spent',
      label: 'Total gasto (R$)',
      category: 'behavior',
      description: 'Crie listas por valor acumulado gasto na loja.',
      valueLabel: 'Valor',
      placeholder: 'Ex.: 200',
      pickerTag: 'Moeda',
    },
    {
      value: 'product_bought',
      label: 'Produto comprado',
      category: 'product',
      description: 'Encontre clientes por item comprado em qualquer pedido.',
      valueLabel: 'Produto',
      placeholder: 'Ex.: Nutella',
      pickerTag: 'Texto',
    },
    {
      value: 'category_bought',
      label: 'Categoria comprada',
      category: 'product',
      description: 'Agrupe quem ja comprou dentro de uma categoria especifica.',
      valueLabel: 'Categoria',
      placeholder: 'Ex.: Chocolate',
      pickerTag: 'Texto',
    },
    {
      value: 'never_ordered',
      label: 'Nunca fez pedido',
      category: 'behavior',
      description: 'Ative automaticamente clientes sem historico de compra.',
      valueLabel: 'Regra automatica',
      placeholder: '',
      pickerTag: 'Booleano',
    },
    {
      value: 'city',
      label: 'Cidade',
      category: 'profile',
      description: 'Filtre clientes pela cidade mais recente cadastrada.',
      valueLabel: 'Cidade',
      placeholder: 'Ex.: Sao Paulo',
      pickerTag: 'Texto',
    },
    {
      value: 'bairro',
      label: 'Bairro',
      category: 'profile',
      description: 'Use o bairro mais recente do cadastro do cliente.',
      valueLabel: 'Bairro',
      placeholder: 'Ex.: Centro',
      pickerTag: 'Texto',
    },
    {
      value: 'payment_method',
      label: 'Forma de pagamento',
      category: 'behavior',
      description: 'Encontre quem ja comprou com Pix ou pagamento online.',
      valueLabel: 'Forma de pagamento',
      inputKind: 'select',
      options: [
        { value: 'pix', label: 'Pix' },
        { value: 'asaas_checkout', label: 'Pagamento online' },
      ],
      pickerTag: 'Selecao',
    },
    {
      value: 'customer_tag',
      label: 'Tag do cliente',
      category: 'profile',
      description: 'Filtre usando tags salvas no cliente pelo Flow Builder.',
      valueLabel: 'Tag',
      placeholder: 'Ex.: lead_fluxo_comercial',
      pickerTag: 'Texto',
    },
  ];
  const AUDIENCE_FIELDS_BY_VALUE = AUDIENCE_FIELDS.reduce((acc, field) => {
    acc[field.value] = field;
    return acc;
  }, {});
  const AUDIENCE_CATEGORY_ORDER = ['behavior', 'product', 'profile'];

  const AUDIENCE_OPERATORS = {
    last_order_days: [
      { value: 'gte', label: 'nao pede ha pelo menos' },
      { value: 'lte', label: 'pediu nos ultimos' },
    ],
    registration_days: [
      { value: 'gte', label: 'cadastrado ha pelo menos' },
      { value: 'lte', label: 'cadastrado nos ultimos' },
      { value: 'eq', label: 'cadastrado ha exatamente' },
    ],
    birthday_month: [
      { value: 'eq', label: 'faz aniversario em' },
    ],
    age_years: [
      { value: 'gte', label: 'tem pelo menos' },
      { value: 'lte', label: 'tem no maximo' },
      { value: 'eq', label: 'tem exatamente' },
    ],
    total_orders: [
      { value: 'gte', label: 'fez pelo menos' },
      { value: 'lte', label: 'fez no maximo' },
      { value: 'eq', label: 'fez exatamente' },
    ],
    total_spent: [
      { value: 'gte', label: 'gastou pelo menos R$' },
      { value: 'lte', label: 'gastou no maximo R$' },
      { value: 'eq', label: 'gastou exatamente R$' },
    ],
    product_bought: [
      { value: 'contains', label: 'contem' },
      { value: 'eq', label: 'igual a' },
    ],
    category_bought: [
      { value: 'contains', label: 'contem' },
      { value: 'eq', label: 'igual a' },
    ],
    never_ordered: [
      { value: 'eq', label: 'automatico' },
    ],
    city: [
      { value: 'contains', label: 'contem' },
      { value: 'eq', label: 'igual a' },
    ],
    bairro: [
      { value: 'contains', label: 'contem' },
      { value: 'eq', label: 'igual a' },
    ],
    payment_method: [
      { value: 'eq', label: 'usou' },
    ],
    customer_tag: [
      { value: 'contains', label: 'contem' },
      { value: 'eq', label: 'igual a' },
    ],
  };

  const FIELDS_WITH_WINDOW = ['product_bought', 'category_bought'];
  const FIELDS_NO_VALUE = ['never_ordered'];
  const FIELDS_NUMERIC = ['last_order_days', 'registration_days', 'age_years', 'total_orders', 'total_spent'];

  function defaultAudienceValue(field) {
    if (field === 'last_order_days') return '30';
    if (field === 'registration_days') return '15';
    if (field === 'birthday_month') return String(new Date().getMonth() + 1);
    if (field === 'age_years') return '30';
    if (field === 'total_orders') return '5';
    if (field === 'total_spent') return '200';
    if (field === 'payment_method') return 'pix';
    return '';
  }

  function createDefaultAudienceRule(field = 'last_order_days') {
    return {
      field,
      operator: AUDIENCE_OPERATORS[field]?.[0]?.value || 'eq',
      value: defaultAudienceValue(field),
      window_days: null,
    };
  }

  function cancelAudiencePreviewTimer() {
    if (audiencePreviewTimer) {
      window.clearTimeout(audiencePreviewTimer);
      audiencePreviewTimer = null;
    }
  }

  function getAudienceFieldMeta(field) {
    return AUDIENCE_FIELDS_BY_VALUE[field] || AUDIENCE_FIELDS[0];
  }

  function isAudiencePickerOpen() {
    return Boolean(audiencePickerEl && !audiencePickerEl.classList.contains('hidden'));
  }

  function setAudiencePickerOpen(nextOpen) {
    if (!audiencePickerEl) return;
    audiencePickerEl.classList.toggle('hidden', !nextOpen);
    addRuleBtnEl?.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');

    if (nextOpen) {
      renderAudiencePicker(audiencePickerSearchEl?.value || '');
      window.requestAnimationFrame(() => audiencePickerSearchEl?.focus());
    }
  }

  function normalizeAudienceRule(rule) {
    return {
      field: rule.field,
      operator: rule.operator,
      value: FIELDS_NO_VALUE.includes(rule.field) ? '' : String(rule.value || '').trim(),
      window_days: rule.window_days ? Number(rule.window_days) : null,
    };
  }

  function isAudienceRuleComplete(rule) {
    if (!rule) return false;
    if (FIELDS_NO_VALUE.includes(rule.field)) return true;
    return Boolean(String(rule.value || '').trim());
  }

  function hasIncompleteAudienceRules() {
    return audienceRules.some((rule) => !isAudienceRuleComplete(rule));
  }

  function syncAudienceSummary() {
    if (audienceRuleCountEl) {
      audienceRuleCountEl.textContent = String(audienceRules.length);
    }

    if (audienceLogicLabelEl) {
      if (audienceRules.length === 0) {
        audienceLogicLabelEl.textContent = 'Sem filtros';
      } else if (audienceRules.length === 1) {
        audienceLogicLabelEl.textContent = 'Uma regra';
      } else {
        audienceLogicLabelEl.textContent = audienceLogicEl?.value === 'or'
          ? 'Qualquer filtro'
          : 'Todos os filtros';
      }
    }
  }

  function syncAudienceSaveState() {
    if (!saveSegmentBtnEl) return;

    const hasName = Boolean(String(audienceListNameEl?.value || '').trim());
    const isLoading = Boolean(audiencePreviewEl?.classList.contains('is-loading'));
    saveSegmentBtnEl.disabled = !state.accessToken || !hasName || isLoading || lastPreviewTotal === 0 || hasIncompleteAudienceRules();
  }

  function renderAudienceSample(sample = [], total = 0, emptyLabel = 'Amostra da lista aparece aqui.') {
    if (!audienceSampleEl) return;

    if (!sample.length) {
      audienceSampleEl.innerHTML = `
        <span class="broadcast-audience-chip muted">
          ${escapeHtml(emptyLabel)}
        </span>
      `;
      return;
    }

    audienceSampleEl.innerHTML = sample
      .map((customer) => `
        <span class="broadcast-audience-chip">
          ${escapeHtml(customer.nome || 'Sem nome')} · ${escapeHtml(helpers.formatPhone(customer.telefone) || customer.telefone || '')}
        </span>
      `)
      .join('');

    const remaining = Math.max(0, Number(total || 0) - sample.length);
    if (remaining > 0) {
      audienceSampleEl.innerHTML += `
        <span class="broadcast-audience-chip muted">
          +${remaining} outro(s)
        </span>
      `;
    }
  }

  function setAudiencePreviewLoading() {
    audiencePreviewEl?.classList.add('is-loading');
    if (audiencePreviewCaptionEl) {
      audiencePreviewCaptionEl.textContent = 'Atualizando a estimativa com os filtros atuais...';
    }
    if (!lastPreviewTotal) {
      renderAudienceSample([], 0, 'Consultando a base de clientes...');
    }
    syncAudienceSaveState();
  }

  function resetAudiencePreview({
    caption = 'Adicione filtros para estimar quantos clientes entram nessa lista.',
    sampleLabel = 'Amostra da lista aparece aqui.',
    clearMessage = false,
  } = {}) {
    cancelAudiencePreviewTimer();
    audiencePreviewRequestId += 1;
    lastPreviewTotal = 0;
    audiencePreviewEl?.classList.remove('is-loading');
    if (audienceTotalEl) audienceTotalEl.textContent = '0';
    if (audiencePreviewCaptionEl) audiencePreviewCaptionEl.textContent = caption;
    renderAudienceSample([], 0, sampleLabel);
    if (clearMessage) {
      clearStatus(audienceStatusEl);
    }
    syncAudienceSaveState();
  }

  function getAudiencePayload() {
    return {
      logic: audienceLogicEl?.value || 'and',
      rules: audienceRules.map((rule) => normalizeAudienceRule(rule)),
    };
  }

  function buildAudienceConnector(index) {
    const activeLogic = audienceLogicEl?.value || 'and';

    if (index === 0) return '';

    return `
      <div class="broadcast-audience-connector">
        <span>Combinar com o filtro acima</span>
        <div class="broadcast-audience-logic-toggle" role="group" aria-label="Logica entre filtros">
          <button
            class="broadcast-audience-logic-btn ${activeLogic === 'and' ? 'active' : ''}"
            type="button"
            data-audience-logic-value="and"
          >
            E
          </button>
          <button
            class="broadcast-audience-logic-btn ${activeLogic === 'or' ? 'active' : ''}"
            type="button"
            data-audience-logic-value="or"
          >
            OU
          </button>
        </div>
      </div>
    `;
  }

  function buildRuleEl(rule, index) {
    const fieldMeta = getAudienceFieldMeta(rule.field);
    const categoryMeta = AUDIENCE_CATEGORY_META[fieldMeta.category] || AUDIENCE_CATEGORY_META.behavior;
    const operatorOptions = (AUDIENCE_OPERATORS[rule.field] || [])
      .map((operator) => (
        `<option value="${operator.value}" ${rule.operator === operator.value ? 'selected' : ''}>${escapeHtml(operator.label)}</option>`
      ))
      .join('');

    const noValue = FIELDS_NO_VALUE.includes(rule.field);
    const inputType = FIELDS_NUMERIC.includes(rule.field) ? 'number' : 'text';
    const hasWindow = FIELDS_WITH_WINDOW.includes(rule.field);
    const isSelect = fieldMeta.inputKind === 'select' && Array.isArray(fieldMeta.options);

    const valueMarkup = noValue
      ? `
        <div class="broadcast-audience-rule-auto">
          <span>Regra automatica</span>
          <strong>Clientes sem nenhum pedido registrado entram automaticamente.</strong>
        </div>
      `
      : isSelect
        ? `
        <label class="broadcast-audience-control">
          <span>${escapeHtml(fieldMeta.valueLabel || 'Valor')}</span>
          <select data-rule-value="${index}">
            ${fieldMeta.options.map((option) => `
              <option value="${escapeHtml(option.value)}" ${String(rule.value || '') === String(option.value) ? 'selected' : ''}>
                ${escapeHtml(option.label)}
              </option>
            `).join('')}
          </select>
        </label>
      `
      : `
        <label class="broadcast-audience-control">
          <span>${escapeHtml(fieldMeta.valueLabel || 'Valor')}</span>
          <input
            type="${inputType}"
            min="${inputType === 'number' ? '0' : ''}"
            placeholder="${escapeHtml(fieldMeta.placeholder || 'Digite um valor')}"
            value="${escapeHtml(rule.value || '')}"
            data-rule-value="${index}"
          />
        </label>
      `;

    const windowMarkup = hasWindow
      ? `
        <label class="broadcast-audience-control">
          <span>Janela de tempo</span>
          <div class="broadcast-audience-rule-window">
            <input
              type="number"
              min="1"
              placeholder="Ex.: 90"
              value="${escapeHtml(rule.window_days || '')}"
              data-rule-window="${index}"
            />
            <span>dias</span>
          </div>
        </label>
      `
      : '';

    return `
      ${buildAudienceConnector(index)}
      <article class="broadcast-audience-rule-card" data-rule-index="${index}" data-category="${escapeHtml(fieldMeta.category || 'behavior')}">
        <div class="broadcast-audience-rule-head">
          <div class="broadcast-audience-rule-head-main">
            <span class="broadcast-audience-rule-category">${escapeHtml(categoryMeta.label)}</span>
            <h4>${escapeHtml(fieldMeta.label)}</h4>
            <p>${escapeHtml(fieldMeta.description || '')}</p>
          </div>

          <button class="ghost-btn" type="button" data-rule-remove="${index}">Remover</button>
        </div>

        <div class="broadcast-audience-rule-body">
          <label class="broadcast-audience-control">
            <span>Condicao</span>
            <select data-rule-operator="${index}">${operatorOptions}</select>
          </label>

          ${valueMarkup}

          ${windowMarkup}
        </div>
      </article>
    `;
  }

  function renderAudiencePicker(search = '') {
    if (!audiencePickerResultsEl) return;

    const query = String(search || '').trim().toLowerCase();
    const sections = AUDIENCE_CATEGORY_ORDER
      .map((categoryKey) => {
        const categoryMeta = AUDIENCE_CATEGORY_META[categoryKey];
        const items = AUDIENCE_FIELDS.filter((field) => {
          if (field.category !== categoryKey) return false;
          if (!query) return true;

          return [
            field.label,
            field.description,
            field.valueLabel,
            field.options?.map((option) => option.label).join(' '),
            categoryMeta?.label,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query));
        });

        if (!items.length) return '';

        return `
          <section class="broadcast-audience-picker-group">
            <div class="broadcast-audience-picker-group-head">
              <strong>${escapeHtml(categoryMeta?.label || 'Filtros')}</strong>
            </div>

            <div class="broadcast-audience-picker-list">
              ${items.map((field) => `
                <button
                  class="broadcast-audience-picker-item"
                  type="button"
                  data-audience-pick-field="${field.value}"
                  data-category="${field.category}"
                >
                  <span class="broadcast-audience-picker-item-main">
                    <span class="broadcast-audience-picker-item-icon" aria-hidden="true"></span>
                    <strong>${escapeHtml(field.label)}</strong>
                  </span>
                  <span class="broadcast-audience-picker-tag ${escapeHtml(field.category)}">${escapeHtml(categoryMeta?.shortLabel || 'Filtro')}</span>
                </button>
              `).join('')}
            </div>
          </section>
        `;
      })
      .filter(Boolean)
      .join('');

    audiencePickerResultsEl.innerHTML = sections || `
      <div class="broadcast-audience-empty">
        <p>Nenhum filtro encontrado para essa busca.</p>
      </div>
    `;
  }

  function renderAudienceRules() {
    if (!audienceRulesEl) return;

    if (!audienceRules.length) {
      audienceRulesEl.innerHTML = `
        <div class="broadcast-audience-empty">
          <p>Nenhum filtro ativo ainda. Abra a biblioteca para adicionar a primeira regra dessa lista.</p>
        </div>
      `;
      syncAudienceSummary();
      return;
    }

    audienceRulesEl.innerHTML = audienceRules.map((rule, index) => buildRuleEl(rule, index)).join('');
    syncAudienceSummary();
  }

  function addAudienceRule(field = 'last_order_days') {
    audienceRules.push(createDefaultAudienceRule(field));
    renderAudienceRules();
    syncAudienceSaveState();

    const insertedIndex = audienceRules.length - 1;
    if (!FIELDS_NO_VALUE.includes(field) && !FIELDS_NUMERIC.includes(field)) {
      window.requestAnimationFrame(() => {
        audienceRulesEl?.querySelector(`[data-rule-value="${insertedIndex}"]`)?.focus();
      });
    }
  }

  function removeAudienceRule(index) {
    audienceRules.splice(index, 1);
    renderAudienceRules();
    syncAudienceSaveState();
  }

  function updateAudienceRule(index, key, value) {
    if (!audienceRules[index]) return;

    audienceRules[index][key] = value;
    syncAudienceSaveState();
  }

  async function runAudiencePreview({ manual = false } = {}) {
    const filter = getAudiencePayload();

    if (!filter.rules.length) {
      resetAudiencePreview({
        caption: 'Adicione pelo menos um filtro para calcular a audiencia.',
        sampleLabel: 'Amostra da lista aparece aqui.',
      });
      setStatus(audienceStatusEl, 'Adicione pelo menos um filtro antes de consultar a audiencia.', manual ? 'err' : 'muted');
      return null;
    }

    if (hasIncompleteAudienceRules()) {
      resetAudiencePreview({
        caption: 'Complete os filtros ativos para atualizar a audiencia.',
        sampleLabel: 'Preencha todos os campos para gerar a amostra.',
      });
      setStatus(audienceStatusEl, 'Preencha todos os filtros ativos antes de consultar a audiencia.', manual ? 'err' : 'muted');
      return null;
    }

    cancelAudiencePreviewTimer();
    const requestId = ++audiencePreviewRequestId;
    if (manual && previewAudienceBtnEl) previewAudienceBtnEl.disabled = true;
    setAudiencePreviewLoading();
    setStatus(
      audienceStatusEl,
      manual ? 'Consultando base de clientes...' : 'Atualizando a previa automaticamente...',
      'muted',
    );

    try {
      const data = await request('/admin/broadcast/audience/preview', {
        method: 'POST',
        body: filter,
      });

      if (requestId !== audiencePreviewRequestId) {
        return null;
      }

      lastPreviewTotal = Number(data?.total || 0);
      audiencePreviewEl?.classList.remove('is-loading');
      if (audienceTotalEl) audienceTotalEl.textContent = String(lastPreviewTotal);
      if (audiencePreviewCaptionEl) {
        audiencePreviewCaptionEl.textContent = lastPreviewTotal
          ? 'Clientes que entram nessa lista com as regras atuais.'
          : 'Nenhum cliente corresponde aos filtros configurados agora.';
      }
      renderAudienceSample(Array.isArray(data?.sample) ? data.sample : [], lastPreviewTotal, 'Nenhum cliente encontrado com esses filtros.');
      syncAudienceSaveState();

      setStatus(
        audienceStatusEl,
        lastPreviewTotal
          ? `Audiencia estimada atual: ${lastPreviewTotal} cliente(s).`
          : 'Nenhum cliente encontrado com os filtros atuais.',
        lastPreviewTotal ? 'ok' : 'muted',
      );

      return data;
    } catch (error) {
      if (requestId !== audiencePreviewRequestId) {
        return null;
      }

      resetAudiencePreview({
        caption: 'Nao foi possivel atualizar a audiencia agora.',
        sampleLabel: 'Tente novamente para carregar a amostra de clientes.',
      });
      setStatus(audienceStatusEl, error.message, 'err');
      return null;
    } finally {
      if (manual && previewAudienceBtnEl) previewAudienceBtnEl.disabled = false;
      if (requestId === audiencePreviewRequestId) {
        audiencePreviewEl?.classList.remove('is-loading');
        syncAudienceSaveState();
      }
    }
  }

  function scheduleAudiencePreview({ immediate = false } = {}) {
    cancelAudiencePreviewTimer();

    if (!state.accessToken) {
      resetAudiencePreview({
        caption: 'Faca login para consultar a audiencia dessa lista.',
        sampleLabel: 'Amostra disponivel apos o login.',
      });
      return;
    }

    if (!audienceRules.length) {
      resetAudiencePreview({
        caption: 'Adicione filtros para estimar quantos clientes entram nessa lista.',
        sampleLabel: 'Amostra da lista aparece aqui.',
      });
      setStatus(audienceStatusEl, 'Adicione um filtro para iniciar a segmentacao.', 'muted');
      return;
    }

    if (hasIncompleteAudienceRules()) {
      resetAudiencePreview({
        caption: 'Complete os filtros ativos para atualizar a audiencia.',
        sampleLabel: 'Preencha todos os campos para ver a amostra dos clientes.',
      });
      setStatus(audienceStatusEl, 'Preencha todos os filtros ativos para atualizar a audiencia.', 'muted');
      return;
    }

    setAudiencePreviewLoading();
    if (immediate) {
      runAudiencePreview().catch(() => {});
      return;
    }

    audiencePreviewTimer = window.setTimeout(() => {
      runAudiencePreview().catch(() => {});
    }, 450);
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
    const { silent = false, append = false } = options;

    if (!listId) {
      localState.members = [];
      localState.membersMeta = null;
      renderMembers();
      if (silent && /fa[cç]a login/i.test(String(membersStatusEl?.textContent || ''))) {
        setStatus(membersStatusEl, 'Crie ou selecione uma lista para gerenciar contatos.', 'muted');
      }
      return;
    }

    if (!silent) {
      setStatus(membersStatusEl, 'Carregando contatos da lista...', 'muted');
    }

    const limit = Number(localState.membersMeta?.limit || DEFAULT_PAGE_LIMIT) || DEFAULT_PAGE_LIMIT;
    const offset = append ? localState.members.length : 0;
    const result = await request(
      `/admin/broadcast/lists/${listId}/members?${buildPaginationQuery({ limit, offset })}`,
      { envelope: true },
    );
    const items = Array.isArray(result?.data) ? result.data : [];
    localState.members = append ? localState.members.concat(items) : items;
    localState.membersMeta = mergePaginationMeta(result?.meta, localState.members.length, limit);
    renderLists();
    renderMembers();

    const loadedMessage = `${localState.members.length} de ${Number(localState.membersMeta?.total || localState.members.length)} contato(s) carregado(s).`;
    const isStaleSignedOutStatus = /fa[cç]a login/i.test(String(membersStatusEl?.textContent || ''));

    if (!silent) {
      setStatus(membersStatusEl, loadedMessage, 'ok');
    } else if (isStaleSignedOutStatus) {
      setStatus(membersStatusEl, loadedMessage, 'muted');
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
    const { open = false, silent = false, append = false } = options;

    if (!campaignId) return;

    if (!silent) {
      setStatus(logsStatusEl, 'Carregando logs da campanha...', 'muted');
    }

    const isSameCampaign = Number(localState.logsCampaignId || 0) === Number(campaignId || 0);
    const limit = append
      ? Number(localState.logsMeta?.limit || DEFAULT_PAGE_LIMIT) || DEFAULT_PAGE_LIMIT
      : Math.max(Number(isSameCampaign ? localState.logs.length : 0), DEFAULT_PAGE_LIMIT);
    const offset = append ? localState.logs.length : 0;
    const [campaign, logsResult] = await Promise.all([
      request(`/admin/broadcast/campaigns/${campaignId}`),
      request(
        `/admin/broadcast/campaigns/${campaignId}/logs?${buildPaginationQuery({ limit, offset })}`,
        { envelope: true },
      ),
    ]);

    const logs = Array.isArray(logsResult?.data) ? logsResult.data : [];
    localState.logsCampaignId = Number(campaignId || 0) || null;
    localState.logsCampaign = campaign || null;
    localState.logs = append ? localState.logs.concat(logs) : logs;
    localState.logsMeta = mergePaginationMeta(logsResult?.meta, localState.logs.length, limit);
    renderLogs();
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
      setStatus(campaignStatusEl, 'Escolha uma lista e escreva a mensagem para criar a campanha.', 'muted');
      setStatus(audienceStatusEl, 'Defina o nome da lista, adicione filtros e acompanhe a audiencia em tempo real.', 'muted');
    } catch (error) {
      setStatus(campaignsStatusEl, error.message, 'err');
      setStatus(campaignStatusEl, error.message, 'err');
      setStatus(templatesStatusEl, error.message, 'err');
      setStatus(listsStatusEl, error.message, 'err');
      setStatus(audienceStatusEl, error.message, 'err');
      syncAudienceSaveState();
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
    syncBroadcastMessageCounters();
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
          localState.membersMeta = null;
        }
        await loadLists({ silent: true, preserveSelection: false });
        setStatus(listsStatusEl, 'Lista removida com sucesso.', 'ok');
      } catch (error) {
        setStatus(listsStatusEl, error.message, 'err');
      }
    }
  });

  membersListEl?.addEventListener('click', async (event) => {
    const loadMoreButton = event.target.closest('[data-broadcast-load-more-members]');
    if (loadMoreButton && localState.selectedListId) {
      loadMoreButton.disabled = true;
      try {
        await loadMembers(localState.selectedListId, { append: true });
      } catch (error) {
        setStatus(membersStatusEl, error.message, 'err');
        loadMoreButton.disabled = false;
      }
      return;
    }

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
    const retryFailedButton = event.target.closest('[data-broadcast-retry-failed-campaign]');
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
          localState.logs = [];
          localState.logsMeta = null;
          localState.logsCampaign = null;
          localState.logsCampaignId = null;
          renderLogs();
          closeDialog(logsDialogEl);
        }
        await loadCampaigns({ silent: true });
        setStatus(campaignsStatusEl, 'Campanha removida com sucesso.', 'ok');
      } catch (error) {
        setStatus(campaignsStatusEl, error.message, 'err');
      }
      return;
    }

    if (retryFailedButton) {
      const campaignId = Number(retryFailedButton.dataset.broadcastRetryFailedCampaign || 0);
      const campaign = localState.campaigns.find((item) => Number(item.id || 0) === campaignId);
      if (!campaignId || !await confirmAction({
        title: 'Reenviar falhas',
        message: `Criar uma nova campanha em rascunho apenas com as falhas da campanha "${campaign?.name || 'selecionada'}"?`,
        confirmLabel: 'Criar reenvio',
        tone: 'primary',
      })) return;

      retryFailedButton.disabled = true;
      setStatus(campaignsStatusEl, 'Criando nova campanha com as falhas...', 'muted');

      try {
        const result = await request(`/admin/broadcast/campaigns/${campaignId}/retry-failed`, {
          method: 'POST',
        });
        await Promise.all([
          loadCampaigns({ silent: true }),
          loadLists({ silent: true }),
        ]);
        setStatus(
          campaignsStatusEl,
          `Nova campanha "${result?.created_campaign?.name || 'Reenvio'}" criada com ${Number(result?.retry_contacts_count || 0)} contato(s). Revise e inicie quando quiser.`,
          'ok',
        );
      } catch (error) {
        setStatus(campaignsStatusEl, error.message, 'err');
      } finally {
        retryFailedButton.disabled = false;
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
      syncBroadcastMessageCounters();
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
      syncBroadcastMessageCounters();
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
    syncBroadcastMessageCounters();
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
    localState.logs = [];
    localState.logsMeta = null;
    localState.logsCampaign = null;
    localState.logsCampaignId = null;
    updatePolling();
  });

  logsTableEl?.addEventListener('click', async (event) => {
    const loadMoreButton = event.target.closest('[data-broadcast-load-more-logs]');
    if (!loadMoreButton || !localState.logsCampaignId) return;
    loadMoreButton.disabled = true;
    try {
      await loadCampaignLogs(localState.logsCampaignId, { append: true });
    } catch (error) {
      setStatus(logsStatusEl, error.message, 'err');
      loadMoreButton.disabled = false;
    }
  });

  audienceRulesEl?.addEventListener('change', (event) => {
    const operatorSelect = event.target.closest('[data-rule-operator]');
    const valueSelect = event.target.closest('select[data-rule-value]');

    if (operatorSelect) {
      updateAudienceRule(Number(operatorSelect.dataset.ruleOperator || 0), 'operator', operatorSelect.value);
      scheduleAudiencePreview();
    }

    if (valueSelect) {
      updateAudienceRule(Number(valueSelect.dataset.ruleValue || 0), 'value', valueSelect.value);
      scheduleAudiencePreview();
    }
  });

  audienceRulesEl?.addEventListener('input', (event) => {
    const valueInput = event.target.closest('[data-rule-value]');
    const windowInput = event.target.closest('[data-rule-window]');

    if (valueInput) {
      updateAudienceRule(Number(valueInput.dataset.ruleValue || 0), 'value', valueInput.value);
      scheduleAudiencePreview();
    }

    if (windowInput) {
      updateAudienceRule(Number(windowInput.dataset.ruleWindow || 0), 'window_days', windowInput.value || null);
      scheduleAudiencePreview();
    }
  });

  audienceRulesEl?.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-rule-remove]');
    const logicButton = event.target.closest('[data-audience-logic-value]');

    if (logicButton) {
      if (audienceLogicEl) {
        audienceLogicEl.value = logicButton.dataset.audienceLogicValue || 'and';
      }
      renderAudienceRules();
      scheduleAudiencePreview({ immediate: true });
      return;
    }

    if (!removeButton) return;
    removeAudienceRule(Number(removeButton.dataset.ruleRemove || 0));
    scheduleAudiencePreview({ immediate: true });
  });

  audienceLogicEl?.addEventListener('change', () => {
    renderAudienceRules();
    scheduleAudiencePreview({ immediate: true });
  });

  addRuleBtnEl?.addEventListener('click', () => {
    setAudiencePickerOpen(!isAudiencePickerOpen());
  });

  audiencePickerCloseBtnEl?.addEventListener('click', () => {
    setAudiencePickerOpen(false);
  });

  audiencePickerSearchEl?.addEventListener('input', () => {
    renderAudiencePicker(audiencePickerSearchEl.value);
  });

  audiencePickerSearchEl?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setAudiencePickerOpen(false);
    }
  });

  audiencePickerResultsEl?.addEventListener('click', (event) => {
    const pickButton = event.target.closest('[data-audience-pick-field]');
    if (!pickButton) return;

    addAudienceRule(pickButton.dataset.audiencePickField || 'last_order_days');
    setAudiencePickerOpen(false);
    scheduleAudiencePreview({ immediate: true });
  });

  audienceListNameEl?.addEventListener('input', () => {
    syncAudienceSaveState();
  });

  audienceBuilderEl?.addEventListener('click', (event) => {
    if (!isAudiencePickerOpen()) return;
    if (event.target.closest('#broadcastAudiencePicker') || event.target.closest('#broadcastAddRuleBtn')) return;
    setAudiencePickerOpen(false);
  });

  previewAudienceBtnEl?.addEventListener('click', async () => {
    await runAudiencePreview({ manual: true });
  });

  saveSegmentBtnEl?.addEventListener('click', async () => {
    const filter = getAudiencePayload();

    if (!filter.rules.length) {
      setStatus(audienceStatusEl, 'Adicione pelo menos uma regra antes de salvar.', 'err');
      return;
    }

    if (hasIncompleteAudienceRules()) {
      setStatus(audienceStatusEl, 'Preencha todos os filtros ativos antes de salvar a lista.', 'err');
      return;
    }

    if (!lastPreviewTotal) {
      setStatus(audienceStatusEl, 'A audiencia precisa ser maior que zero para salvar a lista.', 'err');
      return;
    }

    const name = String(audienceListNameEl?.value || '').trim();
    const description = String(audienceDescriptionEl?.value || '').trim() || null;
    if (!name) {
      setStatus(audienceStatusEl, 'Defina um nome para a lista antes de salvar.', 'err');
      audienceListNameEl?.focus();
      return;
    }

    saveSegmentBtnEl.disabled = true;
    setStatus(audienceStatusEl, 'Criando lista segmentada...', 'muted');

    try {
      const created = await request('/admin/broadcast/audience/create-list', {
        method: 'POST',
        body: {
          name: name.trim(),
          description,
          filter,
        },
      });

      await loadLists({ silent: true });
      localState.selectedListId = Number(created?.id || 0) || null;
      await loadMembers(localState.selectedListId);

      audienceRules = [];
      if (audienceListNameEl) audienceListNameEl.value = '';
      if (audienceDescriptionEl) audienceDescriptionEl.value = '';
      if (audiencePickerSearchEl) audiencePickerSearchEl.value = '';
      renderAudienceRules();
      resetAudiencePreview({
        caption: 'Adicione filtros para estimar quantos clientes entram nessa lista.',
        sampleLabel: 'Amostra da lista aparece aqui.',
      });
      setActiveTab('lists');

      setStatus(
        audienceStatusEl,
        `Lista "${created.name}" criada com ${Number(created.member_count || 0)} contato(s).`,
        'ok',
      );
      setStatus(listsStatusEl, `Lista "${created.name}" criada por filtro.`, 'ok');
    } catch (error) {
      setStatus(audienceStatusEl, error.message, 'err');
      syncAudienceSaveState();
    }
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

  renderAudiencePicker();
  renderAudienceRules();
  resetAudiencePreview({
    caption: 'Adicione filtros para estimar quantos clientes entram nessa lista.',
    sampleLabel: 'Amostra da lista aparece aqui.',
  });

  bindDialogCloseButtons();
  setActiveTab('lists');
  syncBroadcastMessageCounters();
  resetUiForSignedOut();

  api.loadBroadcastData = loadBroadcastData;
}
