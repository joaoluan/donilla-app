(function () {
  const CUSTOM_SELECT_SELECTOR = 'select:not([multiple]):not([hidden])';
  const OPTION_DISABLED_SELECTOR = 'option:disabled';
  const instances = new WeakMap();
  let activeInstance = null;
  let uid = 0;

  function nextId() {
    uid += 1;
    return `custom-select-${uid}`;
  }

  function isEligibleSelect(select) {
    return select instanceof HTMLSelectElement
      && !select.multiple
      && Number(select.size || 0) <= 1
      && !select.hidden;
  }

  function getSelectedOption(select) {
    return select.options[select.selectedIndex] || select.options[0] || null;
  }

  function createInstance(select) {
    if (!isEligibleSelect(select)) return null;
    if (instances.has(select)) return instances.get(select);

    const shell = document.createElement('div');
    shell.className = 'custom-select-shell';

    const root = document.createElement('div');
    root.className = 'custom-select';

    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    trigger.tabIndex = 0;
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'custom-select-trigger-label';

    const icon = document.createElement('span');
    icon.className = 'custom-select-trigger-icon';
    icon.setAttribute('aria-hidden', 'true');

    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';

    const list = document.createElement('ul');
    list.className = 'custom-select-options';
    list.setAttribute('role', 'listbox');
    list.id = nextId();

    trigger.setAttribute('aria-controls', list.id);
    dropdown.appendChild(list);
    trigger.append(label, icon);
    root.append(trigger, dropdown);

    const parent = select.parentNode;
    if (!parent) return null;

    parent.insertBefore(shell, select);
    shell.append(select, root);
    select.classList.add('custom-select-native');
    select.setAttribute('data-custom-select-ready', 'true');

    const instance = {
      select,
      shell,
      root,
      trigger,
      label,
      dropdown,
      list,
    };

    trigger.addEventListener('click', () => {
      if (select.disabled) return;
      toggle(instance);
    });

    trigger.addEventListener('keydown', (event) => {
      if (select.disabled) return;

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle(instance);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        close(instance);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        stepSelection(instance, 1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        stepSelection(instance, -1);
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        selectBoundaryOption(instance, 'start');
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        selectBoundaryOption(instance, 'end');
      }
    });

    list.addEventListener('click', (event) => {
      const optionEl = event.target.closest('[data-custom-option-index]');
      if (!optionEl) return;
      const optionIndex = Number(optionEl.dataset.customOptionIndex);
      const option = select.options[optionIndex];
      if (!option || option.disabled) return;
      chooseOption(instance, option.value);
    });

    select.addEventListener('change', () => {
      syncInstance(instance);
    });

    instances.set(select, instance);
    syncInstance(instance);
    return instance;
  }

  function chooseOption(instance, nextValue) {
    const { select } = instance;
    if (select.value === nextValue) {
      syncInstance(instance);
      close(instance);
      return;
    }

    select.value = nextValue;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncInstance(instance);
    close(instance);
    instance.trigger.focus();
  }

  function enabledOptions(instance) {
    return Array.from(instance.select.options).filter((option) => option && !option.disabled);
  }

  function stepSelection(instance, direction) {
    const options = enabledOptions(instance);
    if (options.length === 0) return;

    const currentValue = instance.select.value;
    const currentIndex = options.findIndex((option) => option.value === currentValue);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = Math.max(0, Math.min(options.length - 1, safeIndex + direction));
    chooseOption(instance, options[nextIndex].value);
  }

  function selectBoundaryOption(instance, edge) {
    const options = enabledOptions(instance);
    if (options.length === 0) return;
    const option = edge === 'end' ? options[options.length - 1] : options[0];
    chooseOption(instance, option.value);
  }

  function renderOptions(instance) {
    const { select, list } = instance;
    const selectedValue = select.value;
    list.innerHTML = '';

    Array.from(select.options).forEach((option, optionIndex) => {
      const item = document.createElement('li');
      item.className = 'custom-select-option';
      item.textContent = option.textContent;
      item.dataset.customOptionIndex = String(optionIndex);
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.value === selectedValue));

      if (option.value === selectedValue) {
        item.classList.add('is-selected');
      }

      if (option.disabled) {
        item.classList.add('is-disabled');
      }

      list.appendChild(item);
    });
  }

  function syncInstance(instance) {
    const { select, root, trigger, label } = instance;
    const selectedOption = getSelectedOption(select);
    label.textContent = selectedOption ? selectedOption.textContent : '';
    trigger.setAttribute('aria-expanded', String(root.classList.contains('is-open')));
    trigger.setAttribute('aria-disabled', String(select.disabled));
    trigger.tabIndex = select.disabled ? -1 : 0;
    root.classList.toggle('is-disabled', select.disabled);
    renderOptions(instance);
  }

  function syncPosition(instance) {
    if (!instance.root.classList.contains('is-open')) return;
    const rect = instance.shell.getBoundingClientRect();
    const dropdownHeight = Math.min(instance.list.scrollHeight + 16, 280);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
    instance.root.classList.toggle('is-open-up', openUp);

    const selectedEl = instance.list.querySelector('.custom-select-option.is-selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function open(instance) {
    if (!instance || instance.select.disabled) return;
    if (activeInstance && activeInstance !== instance) {
      close(activeInstance);
    }
    instance.root.classList.add('is-open');
    instance.trigger.setAttribute('aria-expanded', 'true');
    activeInstance = instance;
    syncPosition(instance);
  }

  function close(instance) {
    if (!instance) return;
    instance.root.classList.remove('is-open');
    instance.root.classList.remove('is-open-up');
    instance.trigger.setAttribute('aria-expanded', 'false');
    if (activeInstance === instance) {
      activeInstance = null;
    }
  }

  function toggle(instance) {
    if (instance.root.classList.contains('is-open')) {
      close(instance);
      return;
    }
    open(instance);
  }

  function init(root = document) {
    const selectNodes = root.matches?.(CUSTOM_SELECT_SELECTOR)
      ? [root]
      : Array.from(root.querySelectorAll?.(CUSTOM_SELECT_SELECTOR) || []);

    selectNodes.forEach((select) => {
      if (!isEligibleSelect(select)) return;
      createInstance(select);
    });
  }

  function refresh(select) {
    if (!select || !isEligibleSelect(select)) return;
    const instance = createInstance(select);
    if (!instance) return;
    syncInstance(instance);
  }

  function refreshAll(root = document) {
    const selectNodes = root.matches?.(CUSTOM_SELECT_SELECTOR)
      ? [root]
      : Array.from(root.querySelectorAll?.(CUSTOM_SELECT_SELECTOR) || []);
    selectNodes.forEach((select) => refresh(select));
  }

  function patchSelectProperty(propertyName) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, propertyName);
    if (!descriptor || typeof descriptor.set !== 'function' || !descriptor.configurable) return;

    Object.defineProperty(HTMLSelectElement.prototype, propertyName, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        return descriptor.get.call(this);
      },
      set(nextValue) {
        descriptor.set.call(this, nextValue);
        queueMicrotask(() => refresh(this));
      },
    });
  }

  function observeDom() {
    const observer = new MutationObserver((records) => {
      const pendingSelects = new Set();

      records.forEach((record) => {
        if (record.type === 'childList') {
          record.addedNodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            if (node.matches(CUSTOM_SELECT_SELECTOR)) {
              pendingSelects.add(node);
            }
            node.querySelectorAll?.(CUSTOM_SELECT_SELECTOR).forEach((select) => pendingSelects.add(select));
          });

          if (record.target instanceof HTMLSelectElement) {
            pendingSelects.add(record.target);
          }
        }

        if (record.type === 'attributes') {
          if (record.target instanceof HTMLSelectElement) {
            pendingSelects.add(record.target);
          }
          if (record.target instanceof HTMLOptionElement && record.target.parentElement instanceof HTMLSelectElement) {
            pendingSelects.add(record.target.parentElement);
          }
        }
      });

      pendingSelects.forEach((select) => refresh(select));
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['disabled', 'hidden', 'selected'],
    });
  }

  document.addEventListener('click', (event) => {
    if (!activeInstance) return;
    if (activeInstance.shell.contains(event.target)) return;
    close(activeInstance);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !activeInstance) return;
    close(activeInstance);
    activeInstance.trigger.focus();
  });

  document.addEventListener('reset', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    queueMicrotask(() => refreshAll(form));
  });

  window.addEventListener('resize', () => {
    if (activeInstance) syncPosition(activeInstance);
  });

  window.addEventListener('scroll', () => {
    if (activeInstance) syncPosition(activeInstance);
  }, true);

  patchSelectProperty('value');
  patchSelectProperty('selectedIndex');

  window.DonillaCustomSelects = {
    init,
    refresh,
    refreshAll,
    closeActive() {
      close(activeInstance);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init(document);
      observeDom();
    }, { once: true });
  } else {
    init(document);
    observeDom();
  }
}());
