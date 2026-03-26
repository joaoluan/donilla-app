export function bindSettingsSection(ctx) {
  const { dom, state, helpers, api } = ctx;
  const settingsTabButtons = Array.from(document.querySelectorAll('[data-settings-tab]'));
  const settingsPanels = Array.from(document.querySelectorAll('[data-settings-panel]'));
  let activeSettingsTab = 'operacao';

  function parseOptionalInteger(value) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function buildSettingsPayload(formData) {
    if (activeSettingsTab === 'horarios') {
      return {
        horario_automatico_ativo: formData.get('horario_automatico_ativo') === 'on',
        horario_funcionamento: api.readStoreHoursScheduleFromForm(),
      };
    }

    if (activeSettingsTab === 'whatsapp') {
      return {
        whatsapp_ativo: formData.get('whatsapp_ativo') === 'on',
        whatsapp_bot_pausado: dom.settingsFormEl.elements.whatsapp_bot_pausado.checked,
        whatsapp_webhook_url: String(formData.get('whatsapp_webhook_url') || '').trim() || null,
        whatsapp_webhook_secret: String(formData.get('whatsapp_webhook_secret') || '').trim() || null,
        whatsapp_mensagem_novo_pedido: String(formData.get('whatsapp_mensagem_novo_pedido') || '').trim() || null,
        whatsapp_mensagem_status: String(formData.get('whatsapp_mensagem_status') || '').trim() || null,
      };
    }

    return {
      loja_aberta: formData.get('loja_aberta') === 'on',
      tempo_entrega_minutos: parseOptionalInteger(formData.get('tempo_entrega_minutos')),
      tempo_entrega_max_minutos: parseOptionalInteger(formData.get('tempo_entrega_max_minutos')),
      mensagem_aviso: String(formData.get('mensagem_aviso') || '').trim() || null,
    };
  }

  function setActiveSettingsTab(nextTab = 'operacao') {
    const activeTab = ['operacao', 'horarios', 'whatsapp', 'taxas'].includes(nextTab) ? nextTab : 'operacao';
    activeSettingsTab = activeTab;
    const showFeesOnly = activeTab === 'taxas';

    settingsTabButtons.forEach((button) => {
      const active = button.dataset.settingsTab === activeTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (dom.settingsFormShellEl) {
      dom.settingsFormShellEl.classList.toggle('hidden', showFeesOnly);
    }

    settingsPanels.forEach((panel) => {
      const panelKey = panel.dataset.settingsPanel;
      const active = panelKey === activeTab;
      panel.classList.toggle('hidden', !active);
    });
  }

  settingsTabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveSettingsTab(button.dataset.settingsTab || 'operacao');
    });
  });

  setActiveSettingsTab('operacao');

  dom.settingsFormEl.addEventListener('change', (event) => {
    const target = event.target;
    const fieldName = String(target?.name || '');
    if (fieldName.startsWith('horario_funcionamento_') && fieldName.endsWith('_enabled')) {
      api.syncStoreHoursInputsState();
    }
  });

  dom.settingsFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.accessToken) {
      helpers.setStatus(dom.settingsStatusEl, 'Faça login antes de salvar.', 'err');
      return;
    }

    helpers.setStatus(dom.settingsStatusEl, 'Salvando configuração...', 'muted');

    const fd = new FormData(dom.settingsFormEl);
    const payload = buildSettingsPayload(fd);

    try {
      const response = await fetch('/admin/store-settings', {
        method: 'PUT',
        headers: helpers.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      await helpers.parseResponse(response);
      await api.loadStoreSettings();
      await api.loadWhatsAppSessionStatus().catch(() => {});
      helpers.setStatus(dom.settingsStatusEl, 'Configuração salva com sucesso.', 'ok');
    } catch (error) {
      helpers.setStatus(dom.settingsStatusEl, error.message, 'err');
    }
  });

  dom.whatsappBotPauseBtnEl.addEventListener('click', async () => {
    if (!state.accessToken) {
      helpers.setStatus(dom.whatsappBotPauseStatusEl, 'Faça login antes de pausar o bot.', 'err');
      return;
    }

    const nextPaused = !dom.settingsFormEl.elements.whatsapp_bot_pausado.checked;
    dom.whatsappBotPauseBtnEl.disabled = true;
    helpers.setStatus(
      dom.whatsappBotPauseStatusEl,
      nextPaused ? 'Pausando bot do WhatsApp...' : 'Retomando bot do WhatsApp...',
      'muted',
    );

    try {
      const response = await fetch('/admin/store-settings', {
        method: 'PUT',
        headers: helpers.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ whatsapp_bot_pausado: nextPaused }),
      });

      const config = await helpers.parseResponse(response);
      api.renderWhatsAppBotPauseState(config.whatsapp_bot_pausado);
      helpers.setStatus(
        dom.whatsappBotPauseStatusEl,
        config.whatsapp_bot_pausado
          ? 'Bot pausado com sucesso. Nenhuma automação do WhatsApp será enviada.'
          : 'Bot reativado com sucesso.',
        'ok',
      );
    } catch (error) {
      api.renderWhatsAppBotPauseState(dom.settingsFormEl.elements.whatsapp_bot_pausado.checked);
      helpers.setStatus(dom.whatsappBotPauseStatusEl, error.message, 'err');
    } finally {
      dom.whatsappBotPauseBtnEl.disabled = false;
    }
  });

  dom.whatsappSessionStatusBtnEl.addEventListener('click', async () => {
    if (!state.accessToken) {
      helpers.setStatus(dom.whatsappSessionStatusEl, 'Faça login antes de consultar a sessão.', 'err');
      return;
    }

    helpers.setStatus(dom.whatsappSessionStatusEl, 'Consultando sessão do WhatsApp...', 'muted');

    try {
      await api.loadWhatsAppSessionStatus();
      helpers.setStatus(dom.whatsappSessionStatusEl, 'Consulta concluida. Se a sessao estiver conectada, o numero ja pode enviar mensagens.', 'ok');
    } catch (error) {
      helpers.setStatus(dom.whatsappSessionStatusEl, error.message, 'err');
    }
  });

  dom.whatsappSessionStartBtnEl.addEventListener('click', async () => {
    if (!state.accessToken) {
      helpers.setStatus(dom.whatsappSessionStatusEl, 'Faça login antes de iniciar a sessão.', 'err');
      return;
    }

    dom.whatsappSessionStartBtnEl.disabled = true;
    helpers.setStatus(dom.whatsappSessionStatusEl, 'Solicitando início da sessão no WPPConnect...', 'muted');

    try {
      const response = await fetch('/admin/whatsapp/session/start', {
        method: 'POST',
        headers: helpers.authHeaders(),
      });

      const data = await helpers.parseResponse(response);
      api.renderWhatsAppSessionState(data);
      helpers.setStatus(dom.whatsappSessionStatusEl, 'Sessao preparada no WPPConnect. Agora clique em Buscar QR Code e escaneie no celular da loja.', 'ok');
    } catch (error) {
      helpers.setStatus(dom.whatsappSessionStatusEl, error.message, 'err');
    } finally {
      dom.whatsappSessionStartBtnEl.disabled = false;
    }
  });

  dom.whatsappSessionQrBtnEl.addEventListener('click', async () => {
    if (!state.accessToken) {
      helpers.setStatus(dom.whatsappSessionStatusEl, 'Faça login antes de buscar o QR Code.', 'err');
      return;
    }

    dom.whatsappSessionQrBtnEl.disabled = true;
    helpers.setStatus(dom.whatsappSessionStatusEl, 'Buscando QR Code da sessão...', 'muted');

    try {
      const data = await api.loadWhatsAppQrCode();
      if (data?.qrCodeDataUrl) {
        helpers.setStatus(dom.whatsappSessionStatusEl, 'QR Code pronto. Abra o WhatsApp do numero da loja e escaneie agora.', 'ok');
      } else {
        helpers.setStatus(dom.whatsappSessionStatusEl, 'Nenhum QR Code disponivel agora. Consulte ou reinicie a sessao e tente novamente.', 'muted');
      }
    } catch (error) {
      helpers.setStatus(dom.whatsappSessionStatusEl, error.message, 'err');
    } finally {
      dom.whatsappSessionQrBtnEl.disabled = false;
    }
  });

  dom.whatsappTestBtnEl.addEventListener('click', async () => {
    if (!state.accessToken) {
      helpers.setStatus(dom.whatsappTestStatusEl, 'Faça login antes de testar.', 'err');
      return;
    }

    const telefone = String(dom.whatsappTestPhoneEl.value || '').replace(/\D/g, '').trim();
    if (!telefone) {
      helpers.setStatus(dom.whatsappTestStatusEl, 'Informe um telefone para teste.', 'err');
      return;
    }

    dom.whatsappTestBtnEl.disabled = true;
    helpers.setStatus(dom.whatsappTestStatusEl, 'Enviando teste para o bot...', 'muted');

    try {
      const response = await fetch('/admin/whatsapp/test', {
        method: 'POST',
        headers: helpers.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          telefone_whatsapp: telefone,
          nome: 'Cliente Teste',
        }),
      });

      await helpers.parseResponse(response);
      helpers.setStatus(dom.whatsappTestStatusEl, `Teste enviado para ${telefone}. Se o numero estiver conectado, a mensagem chega em alguns segundos.`, 'ok');
    } catch (error) {
      helpers.setStatus(dom.whatsappTestStatusEl, error.message, 'err');
    } finally {
      dom.whatsappTestBtnEl.disabled = false;
    }
  });

  if (dom.deliveryFeeSearchInputEl) {
    dom.deliveryFeeSearchInputEl.addEventListener('input', () => {
      api.renderDeliveryFeeList();
    });
  }

  dom.deliveryFeeFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.accessToken) {
      helpers.setStatus(dom.deliveryFeeStatusEl, 'Faça login antes de salvar.', 'err');
      return;
    }

    const isEditing = Boolean(dom.deliveryFeeIdEl.value);
    const payload = {
      bairro: String(dom.deliveryFeeBairroEl.value || '').trim() || null,
      cidade: String(dom.deliveryFeeCidadeEl.value || '').trim() || null,
      valor_entrega: Number(dom.deliveryFeeValorEl.value || 0),
      ativo: dom.deliveryFeeAtivoEl.value !== 'false',
    };

    if (!payload.bairro && !payload.cidade) {
      helpers.setStatus(dom.deliveryFeeStatusEl, 'Informe um bairro, uma cidade ou ambos.', 'err');
      return;
    }

    const path = isEditing ? `/admin/delivery-fees/${dom.deliveryFeeIdEl.value}` : '/admin/delivery-fees';
    const method = isEditing ? 'PUT' : 'POST';

    dom.deliveryFeeSubmitBtnEl.disabled = true;
    helpers.setStatus(dom.deliveryFeeStatusEl, `${isEditing ? 'Atualizando' : 'Salvando'} taxa...`, 'muted');

    try {
      const response = await fetch(path, {
        method,
        headers: helpers.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      await helpers.parseResponse(response);
      await api.loadDeliveryFees();
      api.resetDeliveryFeeForm();
      helpers.setStatus(dom.deliveryFeeStatusEl, `Taxa ${isEditing ? 'atualizada' : 'cadastrada'} com sucesso.`, 'ok');
    } catch (error) {
      helpers.setStatus(dom.deliveryFeeStatusEl, error.message, 'err');
    } finally {
      dom.deliveryFeeSubmitBtnEl.disabled = false;
    }
  });

  dom.deliveryFeeCancelBtnEl.addEventListener('click', () => {
    api.resetDeliveryFeeForm();
  });

  dom.deliveryFeeListEl.addEventListener('click', async (event) => {
    const editButton = event.target.closest('button[data-delivery-fee-edit]');
    if (editButton) {
      const id = Number(editButton.dataset.deliveryFeeEdit);
      const fee = state.deliveryFees.find((item) => item.id === id);
      if (fee) api.populateDeliveryFeeForm(fee);
      return;
    }

    const deleteButton = event.target.closest('button[data-delivery-fee-delete]');
    if (!deleteButton) return;
    await api.removeDeliveryFee(Number(deleteButton.dataset.deliveryFeeDelete));
  });
}
