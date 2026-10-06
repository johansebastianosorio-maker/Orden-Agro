// Utilidades compartidas de formato para toda la aplicación.

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatCOP(valor) {
  const n = Number(valor) || 0;
  return copFormatter.format(n);
}

export function formatFecha(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString + 'T00:00:00');
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function uid(prefix = 'id') {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `${prefix}_${cryptoApi.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
