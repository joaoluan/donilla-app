function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function dateTime(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleString('pt-BR') : '--';
}

function dateOnly(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleDateString('pt-BR') : '--';
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '--';

  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  return digits;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeLocationText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function formatDeliveryWindow(config) {
  const min = Number(config?.tempo_entrega_minutos || 0);
  const max = Number(config?.tempo_entrega_max_minutos || 0);
  if (!min && !max) return '--';
  if (!max || max <= min) return `${min || max} min`;
  return `${min} a ${max} min`;
}

const formatters = Object.freeze({
  brl,
  dateTime,
  dateOnly,
  phone: formatPhone,
  formatPhone,
  deliveryWindow: formatDeliveryWindow,
  formatDeliveryWindow,
});

const dom = Object.freeze({
  escape: escapeHtml,
  escapeHtml,
});

const text = Object.freeze({
  normalizeLocation: normalizeLocationText,
  normalizeLocationText,
});

const DonillaUtils = Object.freeze({
  brl,
  dateTime,
  dateOnly,
  formatPhone,
  escapeHtml,
  normalizeLocationText,
  formatDeliveryWindow,
  formatters,
  dom,
  text,
});

if (typeof window !== 'undefined') {
  window.DonillaUtils = DonillaUtils;
}

export {
  brl,
  dateTime,
  dateOnly,
  formatPhone,
  escapeHtml,
  normalizeLocationText,
  formatDeliveryWindow,
  formatters,
  dom,
  text,
};

export default DonillaUtils;
