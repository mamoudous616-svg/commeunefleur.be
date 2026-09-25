// Page 404 : « réparer » le lien cassé.
// 1. l'ancienne adresse est connue → redirection automatique (annulable) vers la nouvelle ;
// 2. sinon, on propose la page la plus proche (faute de frappe, ancien intitulé) ;
// 3. dans tous les cas, l'adresse cassée est signalée à l'API pour être corrigée.
import { matchRedirect, normalizePath, pages, suggestPage } from '@cuf/shared/redirects';
import { beacon } from './config.js';

export function initNotFound() {
  const box = document.querySelector('[data-suggest]');
  if (!box) return;
  const text = box.querySelector('[data-suggest-text]');
  const link = box.querySelector('[data-suggest-link]');
  const label = box.querySelector('[data-suggest-label]');
  const ring = box.querySelector('[data-ring]');
  const seconds = box.querySelector('[data-seconds]');
  const cancel = box.querySelector('[data-cancel]');

  beacon('/api/report-404', {
    kind: 'page',
    url: (location.pathname + location.search).slice(0, 300),
    ref: document.referrer ? document.referrer.slice(0, 300) : '',
  });

  const path = normalizePath(location.pathname);
  const rule = matchRedirect(path);
  if (rule) {
    const target = pages.find((p) => p.path === rule.to) ?? { path: rule.to, title: 'la nouvelle page' };
    text.textContent = `Cette page a déménagé. Vous allez être redirigé vers « ${target.title} ».`;
    link.href = rule.to;
    label.textContent = 'Y aller maintenant';
    box.hidden = false;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      ring.hidden = false;
      cancel.hidden = false;
      let left = 5;
      const timer = window.setInterval(() => {
        left -= 1;
        seconds.textContent = String(left);
        if (left <= 0) {
          window.clearInterval(timer);
          location.replace(rule.to);
        }
      }, 1000);
      cancel.addEventListener('click', () => {
        window.clearInterval(timer);
        box.classList.add('is-cancelled');
        ring.hidden = true;
        cancel.hidden = true;
        text.textContent = `Cette page a déménagé : elle se trouve désormais dans « ${target.title} ».`;
      });
    }
    return;
  }

  const guess = suggestPage(path);
  if (guess) {
    text.textContent = `Vouliez-vous dire « ${guess.title} » ?`;
    link.href = guess.path;
    label.textContent = guess.title;
    box.hidden = false;
  }
}
