function normalizeCategoryId(value) {
  if (value === 'all') return 'all';
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeProducts(products = []) {
  return Array.isArray(products) ? products.filter(Boolean) : [];
}

function normalizeCategories(categories = []) {
  return Array.isArray(categories)
    ? categories
        .map((category) => ({
          ...category,
          produtos: normalizeProducts(category?.produtos),
        }))
        .filter((category) => category.produtos.length > 0)
    : [];
}

export function initCatalog(dom, {
  escapeHtml,
  formatCurrency,
  emptyMessage = 'Nenhum produto encontrado com esse filtro.',
  onAddItem = null,
} = {}) {
  const abortController = new AbortController();
  const { signal } = abortController;
  let categories = [];
  let activeCategory = 'all';
  let searchTerm = '';
  let productsById = new Map();

  function indexProducts(nextCategories) {
    const nextMap = new Map();
    nextCategories.forEach((category) => {
      const products = Array.isArray(category?.produtos) ? category.produtos : [];
      products.forEach((product) => {
        const productId = Number(product?.id || 0);
        if (Number.isFinite(productId) && productId > 0) {
          nextMap.set(productId, product);
        }
      });
    });
    productsById = nextMap;
  }

  function filteredCategories() {
    const term = searchTerm.trim().toLowerCase();

    return categories
      .filter((category) => activeCategory === 'all' || Number(category?.id || 0) === activeCategory)
      .map((category) => {
        const products = (Array.isArray(category?.produtos) ? category.produtos : []).filter((product) => {
          if (!term) return true;
          return (
            String(product?.nome_doce || '').toLowerCase().includes(term) ||
            String(product?.descricao || '').toLowerCase().includes(term) ||
            String(category?.nome || '').toLowerCase().includes(term)
          );
        });
        return { ...category, produtos: products };
      })
      .filter((category) => category.produtos.length > 0 || !term);
  }

  function renderCategoryTabs() {
    if (!dom.categoryTabsEl) return;

    const tabs = [
      `<button type="button" class="tab-btn ${activeCategory === 'all' ? 'active' : ''}" data-category="all">Tudo</button>`,
      ...categories.map((category) => {
        const categoryId = Number(category?.id || 0);
        const isActive = activeCategory === categoryId;
        return `<button type="button" class="tab-btn ${isActive ? 'active' : ''}" data-category="${categoryId}">${escapeHtml(category?.nome || 'Categoria')}</button>`;
      }),
    ];

    dom.categoryTabsEl.innerHTML = tabs.join('');
  }

  function renderMenu() {
    if (!dom.menuSectionsEl) return;

    const visibleCategories = filteredCategories();
    if (!visibleCategories.length) {
      dom.menuSectionsEl.innerHTML = `<p class="muted">${escapeHtml(emptyMessage)}</p>`;
      return;
    }

    dom.menuSectionsEl.innerHTML = visibleCategories
      .map((category) => {
        const cards = category.produtos
          .map((product) => {
            const initial = escapeHtml(String(product?.nome_doce || '?').slice(0, 1).toUpperCase());
            return `
              <article class="product-card">
                <div class="product-thumb">${initial}</div>
                <div class="product-info">
                  <h4>${escapeHtml(product?.nome_doce || 'Doce artesanal')}</h4>
                  <p>${escapeHtml(product?.descricao || 'Doce artesanal Donilla')}</p>
                </div>
                <footer class="product-footer">
                  <strong>${formatCurrency(product?.preco)}</strong>
                  <button type="button" class="add-btn" data-add="${product.id}">Adicionar</button>
                </footer>
              </article>
            `;
          })
          .join('');

        return `
          <section class="category-block">
            <header>
              <h3>${escapeHtml(category?.nome || 'Categoria')}</h3>
              <small>${category.produtos.length} itens</small>
            </header>
            <div class="product-grid">${cards}</div>
          </section>
        `;
      })
      .join('');
  }

  function render() {
    renderCategoryTabs();
    renderMenu();
  }

  function setCategories(nextCategories) {
    categories = normalizeCategories(nextCategories);
    indexProducts(categories);

    if (activeCategory !== 'all' && !categories.some((category) => Number(category?.id || 0) === activeCategory)) {
      activeCategory = 'all';
    }

    render();
  }

  function setSearchTerm(value) {
    searchTerm = String(value || '');
    renderMenu();
  }

  function setActiveCategory(value) {
    const nextCategory = normalizeCategoryId(value);
    activeCategory = nextCategory ?? 'all';
    render();
  }

  function getProductById(productId) {
    return productsById.get(Number(productId || 0)) || null;
  }

  function renderError(message) {
    if (!dom.menuSectionsEl) return;
    dom.menuSectionsEl.innerHTML = `<p class="err">${escapeHtml(message || 'Erro ao carregar cardápio.')}</p>`;
  }

  dom.categoryTabsEl?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-category]');
    if (!button) return;
    setActiveCategory(button.dataset.category);
  }, { signal });

  dom.searchInputEl?.addEventListener('input', () => {
    setSearchTerm(dom.searchInputEl.value || '');
  }, { signal });

  dom.menuSectionsEl?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-add]');
    if (!button) return;

    const product = getProductById(button.dataset.add);
    if (!product || typeof onAddItem !== 'function') return;
    onAddItem(product);
  }, { signal });

  return {
    destroy() {
      abortController.abort();
    },
    getProductById,
    render,
    renderError,
    setActiveCategory,
    setCategories,
    setSearchTerm,
  };
}
