// « Réparer » visuellement une image cassée : on affiche un fond végétal flou et la description
// à la place du pictogramme d'image brisée, et on signale le lien mort à l'API.
import { beacon } from './config.js';

function repair(img) {
  const holder = img.closest('[data-photo]') || img.parentElement;
  if (!holder || holder.classList.contains('is-broken')) return;
  holder.classList.add('is-broken');
  beacon('/api/report-404', { kind: 'image', url: (img.currentSrc || img.src || '').slice(0, 300), page: location.pathname });
}

export function initImageRepair() {
  document.addEventListener(
    'error',
    (event) => {
      if (event.target instanceof HTMLImageElement) repair(event.target);
    },
    true,
  );
  // Images déjà en échec avant le chargement de ce script
  document.querySelectorAll('img').forEach((img) => {
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) repair(img);
  });
}
