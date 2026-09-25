// Statut d'ouverture en direct (heure de Bruxelles) + mise en avant du jour dans les horaires.
import { openingStatus } from '@cuf/shared/hours';

function render() {
  const status = openingStatus(new Date());
  document.querySelectorAll('[data-open-status]').forEach((el) => {
    el.dataset.open = String(status.open);
    el.dataset.soon = String(Boolean(status.closingSoon));
    const label = el.querySelector('[data-open-label]');
    if (label) label.textContent = status.label;
  });
  document.querySelectorAll('[data-hours-day]').forEach((row) => {
    const today = Number(row.getAttribute('data-hours-day')) === status.todayIso;
    row.classList.toggle('is-today', today);
    if (today) row.setAttribute('aria-current', 'date');
    else row.removeAttribute('aria-current');
  });
}

export function initOpenStatus() {
  if (!document.querySelector('[data-open-status], [data-hours-day]')) return;
  render();
  window.setInterval(render, 60 * 1000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && render());
}
