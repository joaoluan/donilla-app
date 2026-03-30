(function () {
  const STORAGE_KEY = 'donilla_admin_theme';
  const LIGHT_THEME = 'light';
  const DARK_THEME = 'dark';

  function normalizeTheme(theme) {
    return theme === LIGHT_THEME ? LIGHT_THEME : DARK_THEME;
  }

  function readTheme() {
    try {
      return normalizeTheme(localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      return DARK_THEME;
    }
  }

  function persistTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, normalizeTheme(theme));
    } catch (error) {
      // Ignore storage errors and keep the current session theme only.
    }
  }

  function applyTheme(theme) {
    const nextTheme = normalizeTheme(theme);
    document.documentElement.dataset.adminTheme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    return nextTheme;
  }

  function getNextTheme(theme) {
    return theme === LIGHT_THEME ? DARK_THEME : LIGHT_THEME;
  }

  function syncToggleButton(button, currentTheme) {
    const nextTheme = getNextTheme(currentTheme);
    const label = nextTheme === LIGHT_THEME ? 'Tema claro' : 'Tema escuro';
    const hint = nextTheme === LIGHT_THEME ? 'Usar visual claro' : 'Voltar ao visual escuro';
    const labelEl = button.querySelector('[data-theme-toggle-label]');
    const hintEl = button.querySelector('[data-theme-toggle-hint]');

    button.dataset.nextTheme = nextTheme;
    button.setAttribute('aria-pressed', currentTheme === LIGHT_THEME ? 'true' : 'false');
    button.setAttribute(
      'title',
      nextTheme === LIGHT_THEME
        ? 'Ativar o tema claro inspirado no Flow antigo'
        : 'Voltar para o tema escuro atual',
    );

    if (labelEl) {
      labelEl.textContent = label;
    } else {
      button.textContent = label;
    }

    if (hintEl) {
      hintEl.textContent = hint;
    }
  }

  function syncThemeToggleButtons() {
    const currentTheme = applyTheme(readTheme());
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      syncToggleButton(button, currentTheme);
    });
  }

  document.addEventListener('click', (event) => {
    const toggleButton = event.target.closest('[data-theme-toggle]');
    if (!toggleButton) return;

    const nextTheme = normalizeTheme(toggleButton.dataset.nextTheme);
    persistTheme(nextTheme);
    applyTheme(nextTheme);
    syncThemeToggleButtons();
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    syncThemeToggleButtons();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncThemeToggleButtons, { once: true });
  } else {
    syncThemeToggleButtons();
  }
})();
