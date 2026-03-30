function normalizeItemId(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cloneCartItem(item, quantidade) {
  return {
    ...item,
    id: normalizeItemId(item?.id),
    quantidade: Number(quantidade || 0),
  };
}

function cartItemChanged(current, next) {
  return (
    String(current?.nome_doce || '') !== String(next?.nome_doce || '')
    || Number(current?.preco || 0) !== Number(next?.preco || 0)
    || String(current?.descricao || '') !== String(next?.descricao || '')
    || String(current?.imagem_url || '') !== String(next?.imagem_url || '')
    || String(current?.estoque_disponivel ?? '') !== String(next?.estoque_disponivel ?? '')
    || Boolean(current?.ativo !== false) !== Boolean(next?.ativo !== false)
  );
}

export function initCart(dom, {
  formatCurrency,
  escapeHtml,
  emptyMessage = 'Seu carrinho está vazio.',
  onChange = null,
} = {}) {
  const cart = new Map();
  let deliveryFee = 0;
  const abortController = new AbortController();
  const { signal } = abortController;

  function getSnapshot() {
    const items = Array.from(cart.values());
    const subtotal = items.reduce((sum, item) => sum + Number(item.preco || 0) * Number(item.quantidade || 0), 0);
    const total = subtotal + deliveryFee;
    const count = items.reduce((sum, item) => sum + Number(item.quantidade || 0), 0);
    return { items, subtotal, total, count, deliveryFee };
  }

  function render() {
    const { items, subtotal, total, count } = getSnapshot();

    if (dom.cartCountEl) {
      dom.cartCountEl.textContent = `${count} ${count === 1 ? 'item' : 'itens'}`;
    }
    if (dom.totalItensEl) {
      dom.totalItensEl.textContent = formatCurrency(subtotal);
    }
    if (dom.totalEntregaEl) {
      dom.totalEntregaEl.textContent = formatCurrency(deliveryFee);
    }
    if (dom.totalGeralEl) {
      dom.totalGeralEl.textContent = formatCurrency(total);
    }
    if (!dom.cartItemsEl) return;

    if (!items.length) {
      dom.cartItemsEl.innerHTML = `<p class="muted">${escapeHtml(emptyMessage)}</p>`;
      return;
    }

    dom.cartItemsEl.innerHTML = items
      .map((item) => `
        <div class="cart-item">
          <div class="cart-item-main">
            <strong>${escapeHtml(item.nome_doce || 'Item')}</strong>
            <small>${formatCurrency(item.preco)}</small>
          </div>
          <div class="stepper">
            <button type="button" data-dec="${item.id}">-</button>
            <span>${item.quantidade}</span>
            <button type="button" data-inc="${item.id}">+</button>
          </div>
        </div>
      `)
      .join('');
  }

  function emitChange() {
    if (typeof onChange === 'function') {
      onChange(getSnapshot());
    }
  }

  function sync() {
    render();
    emitChange();
  }

  function setItemQuantity(itemId, quantity) {
    const normalizedId = normalizeItemId(itemId);
    if (!normalizedId) return false;

    const current = cart.get(normalizedId);
    if (!current) return false;

    const nextQuantity = Number(quantity || 0);
    if (nextQuantity <= 0) {
      cart.delete(normalizedId);
      sync();
      return true;
    }

    cart.set(normalizedId, cloneCartItem(current, nextQuantity));
    sync();
    return true;
  }

  function addItem(item) {
    const itemId = normalizeItemId(item?.id);
    if (!itemId) return false;

    const current = cart.get(itemId);
    if (current) {
      cart.set(itemId, cloneCartItem(current, Number(current.quantidade || 0) + 1));
    } else {
      cart.set(itemId, cloneCartItem(item, 1));
    }

    sync();
    return true;
  }

  function syncCatalog(resolveItem) {
    if (typeof resolveItem !== 'function' || cart.size === 0) return [];

    const removedItems = [];
    let changed = false;

    cart.forEach((current, itemId) => {
      const latest = resolveItem(itemId);
      if (!latest || latest.ativo === false) {
        cart.delete(itemId);
        removedItems.push(current);
        changed = true;
        return;
      }

      const nextItem = cloneCartItem({ ...current, ...latest }, current.quantidade);
      if (cartItemChanged(current, nextItem)) {
        cart.set(itemId, nextItem);
        changed = true;
      }
    });

    if (changed) {
      sync();
    }

    return removedItems;
  }

  function clear() {
    cart.clear();
    sync();
  }

  function setDeliveryFee(value) {
    deliveryFee = Number(value || 0);
    sync();
  }

  dom.cartItemsEl?.addEventListener('click', (event) => {
    const decButton = event.target.closest('button[data-dec]');
    const incButton = event.target.closest('button[data-inc]');
    if (!decButton && !incButton) return;

    const targetId = Number((decButton || incButton).dataset.dec || (decButton || incButton).dataset.inc || 0);
    const current = cart.get(targetId);
    if (!current) return;

    if (incButton) {
      setItemQuantity(targetId, Number(current.quantidade || 0) + 1);
      return;
    }

    setItemQuantity(targetId, Number(current.quantidade || 0) - 1);
  }, { signal });

  sync();

  return {
    addItem,
    clear,
    destroy() {
      abortController.abort();
    },
    getItems() {
      return getSnapshot().items;
    },
    getSnapshot,
    setDeliveryFee,
    setItemQuantity,
    syncCatalog,
  };
}
