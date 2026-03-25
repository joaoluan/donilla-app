export function bindCatalogSection(ctx) {
  const { dom, state, helpers, api } = ctx;

  const catalogTabButtons = Array.from(document.querySelectorAll('[data-catalog-tab]'));
  const catalogPanels = Array.from(document.querySelectorAll('[data-catalog-tab-panel]'));
  const categoryOpenFormBtn = document.getElementById('categoryOpenFormBtn');
  const categoryEditorCard = document.getElementById('categoryEditorCard');
  const produtoOpenFormBtn = document.getElementById('produtoOpenFormBtn');
  const produtoEditorCard = document.getElementById('produtoEditorCard');

  const setActiveCatalogTab = (nextTab) => {
    const fallbackTab = catalogTabButtons[0]?.dataset.catalogTab || 'cardapio';
    const activeTab = catalogTabButtons.some((button) => button.dataset.catalogTab === nextTab)
      ? nextTab
      : fallbackTab;

    catalogTabButtons.forEach((button) => {
      const isActive = button.dataset.catalogTab === activeTab;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    catalogPanels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.catalogTabPanel !== activeTab);
    });
  };

  catalogTabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveCatalogTab(button.dataset.catalogTab || 'cardapio');
    });
  });

  setActiveCatalogTab('cardapio');

  const debouncedRenderCatalogPortal = helpers.createDebounce(180, () => {
    api.renderCatalogPortal();
  });

  const focusCategoriaEditor = ({ reset = false } = {}) => {
    if (reset) {
      api.resetCategoriaForm();
    }

    setActiveCatalogTab('categorias');
    categoryEditorCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    dom.categoryNomeEl?.focus({ preventScroll: true });
  };

  const focusProdutoEditor = ({ reset = false } = {}) => {
    if (reset) {
      api.resetProdutoForm();
    }

    setActiveCatalogTab('produtos');
    produtoEditorCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const focusTarget = reset ? dom.produtoCategoriaEl : dom.produtoNomeEl;
    focusTarget?.focus({ preventScroll: true });
  };

  if (dom.catalogPortalSearchInputEl) {
    dom.catalogPortalSearchInputEl.addEventListener('input', () => {
      state.catalogPortalState.search = String(dom.catalogPortalSearchInputEl.value || '').trim();
      debouncedRenderCatalogPortal();
    });
  }

  if (dom.catalogPortalCategoryFilterEl) {
    dom.catalogPortalCategoryFilterEl.addEventListener('change', () => {
      state.catalogPortalState.categoria_id = dom.catalogPortalCategoryFilterEl.value || 'all';
      api.renderCatalogPortal();
    });
  }

  if (dom.catalogGoToCategoriasBtnEl) {
    dom.catalogGoToCategoriasBtnEl.addEventListener('click', () => {
      focusCategoriaEditor({ reset: true });
    });
  }

  if (categoryOpenFormBtn) {
    categoryOpenFormBtn.addEventListener('click', () => {
      focusCategoriaEditor({ reset: true });
    });
  }

  if (dom.catalogGoToProdutosBtnEl) {
    dom.catalogGoToProdutosBtnEl.addEventListener('click', () => {
      focusProdutoEditor({ reset: true });
    });
  }

  if (produtoOpenFormBtn) {
    produtoOpenFormBtn.addEventListener('click', () => {
      focusProdutoEditor({ reset: true });
    });
  }

  if (dom.catalogPortalListEl) {
    dom.catalogPortalListEl.addEventListener('click', (event) => {
      const categoryEditBtn = event.target.closest('button[data-catalog-quick-category]');
      if (categoryEditBtn) {
        const categoriaId = Number(categoryEditBtn.dataset.catalogQuickCategory);
        const categoria = state.allCategorias.find((item) => item.id === categoriaId);
        if (categoria) {
          api.startCategoriaEdit(categoria);
          focusCategoriaEditor();
        }
        return;
      }

      const productEditBtn = event.target.closest('button[data-catalog-quick-product]');
      if (productEditBtn) {
        const produtoId = Number(productEditBtn.dataset.catalogQuickProduct);
        const produto = state.allMenuProdutos.find((item) => item.id === produtoId);
        if (produto) {
          api.populateProdutoForm(produto);
          focusProdutoEditor();
        }
      }
    });
  }

  const debouncedLoadCategorias = helpers.createDebounce(250, () => {
    if (!state.accessToken) return;
    api.loadCategorias().catch((error) => helpers.setStatus(dom.categoryStatusEl, error.message, 'err'));
  });

  if (dom.categorySearchInputEl) {
    dom.categorySearchInputEl.addEventListener('input', () => {
      state.categoryState.search = String(dom.categorySearchInputEl.value || '').trim();
      state.categoryState.page = 1;
      debouncedLoadCategorias();
    });
  }

  if (dom.categorySortInputEl) {
    dom.categorySortInputEl.addEventListener('change', () => {
      state.categoryState.sort = dom.categorySortInputEl.value || 'ordem_exibicao';
      state.categoryState.page = 1;
      if (!state.accessToken) return;
      api.loadCategorias().catch((error) => helpers.setStatus(dom.categoryStatusEl, error.message, 'err'));
    });
  }

  if (dom.categoryPageSizeInputEl) {
    dom.categoryPageSizeInputEl.addEventListener('change', () => {
      state.categoryState.pageSize = Number(dom.categoryPageSizeInputEl.value || 10);
      state.categoryState.page = 1;
      if (!state.accessToken) return;
      api.loadCategorias().catch((error) => helpers.setStatus(dom.categoryStatusEl, error.message, 'err'));
    });
  }

  dom.categoryPrevBtnEl.addEventListener('click', async () => {
    if (state.categoryState.page <= 1 || !state.accessToken) return;
    state.categoryState.page -= 1;
    await api.loadCategorias().catch((error) => helpers.setStatus(dom.categoryStatusEl, error.message, 'err'));
  });

  dom.categoryNextBtnEl.addEventListener('click', async () => {
    if (!state.accessToken) return;
    const totalPages = Number(state.categoryPaginationMeta?.totalPages || 1);
    if (state.categoryState.page >= totalPages) return;
    state.categoryState.page += 1;
    await api.loadCategorias().catch((error) => helpers.setStatus(dom.categoryStatusEl, error.message, 'err'));
  });

  const debouncedLoadProdutos = helpers.createDebounce(250, () => {
    if (!state.accessToken) return;
    api.loadProdutos().catch((error) => helpers.setStatus(dom.produtoStatusEl, error.message, 'err'));
  });

  if (dom.produtoSearchInputEl) {
    dom.produtoSearchInputEl.addEventListener('input', () => {
      state.produtoState.search = String(dom.produtoSearchInputEl.value || '').trim();
      state.produtoState.page = 1;
      debouncedLoadProdutos();
    });
  }

  if (dom.produtoSortInputEl) {
    dom.produtoSortInputEl.addEventListener('change', () => {
      state.produtoState.sort = dom.produtoSortInputEl.value || 'nome_doce';
      state.produtoState.page = 1;
      if (!state.accessToken) return;
      api.loadProdutos().catch((error) => helpers.setStatus(dom.produtoStatusEl, error.message, 'err'));
    });
  }

  if (dom.produtoDisponibilidadeFilterEl) {
    dom.produtoDisponibilidadeFilterEl.addEventListener('change', () => {
      state.produtoState.disponibilidade = dom.produtoDisponibilidadeFilterEl.value || 'all';
      state.produtoState.page = 1;
      if (!state.accessToken) return;
      api.loadProdutos().catch((error) => helpers.setStatus(dom.produtoStatusEl, error.message, 'err'));
    });
  }

  if (dom.produtoCategoriaFilterEl) {
    dom.produtoCategoriaFilterEl.addEventListener('change', () => {
      state.produtoState.categoria_id = dom.produtoCategoriaFilterEl.value || 'all';
      state.produtoState.page = 1;
      if (!state.accessToken) return;
      api.loadProdutos().catch((error) => helpers.setStatus(dom.produtoStatusEl, error.message, 'err'));
    });
  }

  if (dom.produtoPageSizeInputEl) {
    dom.produtoPageSizeInputEl.addEventListener('change', () => {
      state.produtoState.pageSize = Number(dom.produtoPageSizeInputEl.value || 12);
      state.produtoState.page = 1;
      if (!state.accessToken) return;
      api.loadProdutos().catch((error) => helpers.setStatus(dom.produtoStatusEl, error.message, 'err'));
    });
  }

  dom.produtoPrevBtnEl.addEventListener('click', async () => {
    if (state.produtoState.page <= 1 || !state.accessToken) return;
    state.produtoState.page -= 1;
    await api.loadProdutos().catch((error) => helpers.setStatus(dom.produtoStatusEl, error.message, 'err'));
  });

  dom.produtoNextBtnEl.addEventListener('click', async () => {
    if (!state.accessToken) return;
    const totalPages = Number(state.produtoPaginationMeta?.totalPages || 1);
    if (state.produtoState.page >= totalPages) return;
    state.produtoState.page += 1;
    await api.loadProdutos().catch((error) => helpers.setStatus(dom.produtoStatusEl, error.message, 'err'));
  });

  dom.categoryFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.accessToken) {
      helpers.setStatus(dom.categoryStatusEl, 'Faça login antes de salvar.', 'err');
      return;
    }

    const isEditing = Boolean(dom.categoryIdEl.value);
    const payload = {
      nome: String(dom.categoryNomeEl.value || '').trim(),
      ordem_exibicao: Number(dom.categoryOrdemEl.value || 0),
    };

    if (!payload.nome) {
      helpers.setStatus(dom.categoryStatusEl, 'Informe o nome da categoria.', 'err');
      return;
    }

    const path = isEditing ? `/categorias/${dom.categoryIdEl.value}` : '/categorias';
    const method = isEditing ? 'PUT' : 'POST';

    helpers.setStatus(dom.categoryStatusEl, `${isEditing ? 'Atualizando' : 'Salvando'} categoria...`, 'muted');
    dom.categorySubmitBtn.disabled = true;

    try {
      const response = await fetch(path, {
        method,
        headers: helpers.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      await helpers.parseResponse(response);
      await api.loadCardapioData();
      api.resetCategoriaForm();
      helpers.setStatus(dom.categoryStatusEl, isEditing ? 'Categoria atualizada.' : 'Categoria salva.', 'ok');
    } catch (error) {
      helpers.setStatus(dom.categoryStatusEl, error.message, 'err');
    } finally {
      dom.categorySubmitBtn.disabled = false;
    }
  });

  dom.categoriaCancelBtn.addEventListener('click', () => {
    api.resetCategoriaForm();
  });

  dom.produtoFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.accessToken) {
      helpers.setStatus(dom.produtoStatusEl, 'Faça login antes de salvar.', 'err');
      return;
    }

    if (!dom.produtoCategoriaEl.value) {
      helpers.setStatus(dom.produtoStatusEl, 'Selecione uma categoria.', 'err');
      return;
    }

    const nomeDoce = String(dom.produtoNomeEl.value || '').trim();
    if (!nomeDoce) {
      helpers.setStatus(dom.produtoStatusEl, 'Informe o nome do doce.', 'err');
      return;
    }

    const preco = Number(dom.produtoPrecoEl.value);
    if (!Number.isFinite(preco) || preco < 0) {
      helpers.setStatus(dom.produtoStatusEl, 'Informe um preço válido.', 'err');
      return;
    }

    helpers.setStatus(dom.produtoStatusEl, `${dom.produtoIdEl.value ? 'Atualizando' : 'Salvando'} item...`, 'muted');
    dom.produtoSubmitBtn.disabled = true;

    try {
      const payload = {
        categoria_id: Number(dom.produtoCategoriaEl.value),
        nome_doce: nomeDoce,
        descricao: String(dom.produtoDescricaoEl.value || '').trim() || null,
        preco,
        estoque_disponivel: dom.produtoEstoqueEl.value === '' ? null : Number(dom.produtoEstoqueEl.value),
        ativo: dom.produtoAtivoEl.checked,
        clear_imagem_url: dom.produtoClearImagemEl.checked,
      };

      if (state.produtoImagemDataUrl) {
        payload.imagem_data_url = state.produtoImagemDataUrl;
        payload.clear_imagem_url = false;
      }

      const isEditing = Boolean(dom.produtoIdEl.value);
      const path = isEditing ? `/produtos/${dom.produtoIdEl.value}` : '/produtos';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(path, {
        method,
        headers: helpers.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      await helpers.parseResponse(response);
      await api.loadCardapioData();
      api.resetProdutoForm();
      helpers.setStatus(dom.produtoStatusEl, isEditing ? 'Item atualizado.' : 'Item salvo.', 'ok');
    } catch (error) {
      helpers.setStatus(dom.produtoStatusEl, error.message, 'err');
    } finally {
      dom.produtoSubmitBtn.disabled = false;
    }
  });

  dom.produtoCancelBtn.addEventListener('click', () => {
    api.resetProdutoForm();
  });

  dom.produtoImagemEl.addEventListener('change', async () => {
    if (!dom.produtoImagemEl.files || !dom.produtoImagemEl.files[0]) {
      return;
    }

    try {
      helpers.setStatus(dom.produtoStatusEl, 'Otimizando imagem...', 'muted');
      state.produtoImagemDataUrl = await helpers.compressImageDataUrl(dom.produtoImagemEl.files[0]);
      helpers.buildImagePreview(state.produtoImagemDataUrl);
      dom.produtoClearImagemEl.checked = false;
      helpers.setStatus(dom.produtoStatusEl, '', 'muted');
    } catch (error) {
      helpers.setStatus(dom.produtoStatusEl, error.message, 'err');
    }
  });

  dom.produtoClearImagemEl.addEventListener('change', () => {
    if (!dom.produtoClearImagemEl.checked) return;
    dom.produtoImagemEl.value = '';
    state.produtoImagemDataUrl = '';
    if (dom.produtoIdEl.value) {
      helpers.buildImagePreview('');
    }
  });

  dom.categoryListEl.addEventListener('click', async (event) => {
    const btnEdit = event.target.closest('button[data-category-edit]');
    if (btnEdit) {
      const id = Number(btnEdit.dataset.categoryEdit);
      const categoria = state.menuCategorias.find((item) => item.id === id);
      if (categoria) {
        api.startCategoriaEdit(categoria);
        focusCategoriaEditor();
      }
      return;
    }

    const btnDelete = event.target.closest('button[data-category-delete]');
    if (btnDelete) {
      const id = Number(btnDelete.dataset.categoryDelete);
      if (id) {
        await api.removeCategoria(id);
      }
    }
  });

  dom.produtoListEl.addEventListener('click', async (event) => {
    const btnEdit = event.target.closest('button[data-produto-edit]');
    if (btnEdit) {
      const id = Number(btnEdit.dataset.produtoEdit);
      const produto = state.menuProdutos.find((item) => item.id === id);
      if (produto) {
        api.populateProdutoForm(produto);
        focusProdutoEditor();
      }
      return;
    }

    const btnDelete = event.target.closest('button[data-produto-delete]');
    if (btnDelete) {
      const id = Number(btnDelete.dataset.produtoDelete);
      if (id) {
        await api.removeProduto(id);
      }
    }
  });
}
