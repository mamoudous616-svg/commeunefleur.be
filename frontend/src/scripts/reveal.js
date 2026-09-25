// Apparition douce des blocs quand ils entrent à l'écran : guide la lecture, une seule fois.
// Les titres de section arrivent mot à mot, les chiffres clés défilent jusqu'à leur valeur.

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Enveloppe chaque mot d'un titre (les espaces insécables restent dans le mot). */
function splitWords(el) {
  let w = 0;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
        continue;
      }
      if (child.nodeType !== Node.TEXT_NODE) continue;
      const frag = document.createDocumentFragment();
      for (const part of child.textContent.split(/([ \t\n\r]+)/)) {
        if (!part) continue;
        if (/^[ \t\n\r]+$/.test(part)) {
          frag.append(document.createTextNode(' '));
          continue;
        }
        const word = document.createElement('span');
        word.className = 'word';
        const inner = document.createElement('span');
        inner.className = 'word__in';
        inner.style.setProperty('--w', String(w++));
        inner.textContent = part;
        word.append(inner);
        frag.append(word);
      }
      child.replaceWith(frag);
    }
  };
  walk(el);
  el.classList.add('is-split');
}

/** Chiffre qui défile jusqu'à sa valeur (le texte final reste lisible par les lecteurs d'écran). */
function countUp(el) {
  const to = Number(el.dataset.countTo);
  const from = Number(el.dataset.countFrom || 0);
  const suffix = el.dataset.countSuffix || '';
  const duration = 1600;
  const start = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 4;
    el.textContent = `${Math.round(from + (to - from) * eased)}${suffix}`;
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  // Décalage en cascade pour les éléments d'un même groupe (cartes, faits clés…).
  document.querySelectorAll('[data-reveal-group]').forEach((group) => {
    group.querySelectorAll(':scope > .reveal, :scope > * > .reveal').forEach((el, i) => {
      el.style.setProperty('--i', String(i % 6));
    });
  });

  if (!('IntersectionObserver' in window) || reduceMotion()) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  document.querySelectorAll('h2.reveal, .h2.reveal, [data-split].reveal').forEach(splitWords);
  const counters = document.querySelectorAll('[data-count-to]');
  counters.forEach((el) => {
    el.textContent = `${el.dataset.countFrom || 0}${el.dataset.countSuffix || ''}`;
  });

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        entry.target.querySelectorAll('[data-count-to]').forEach(countUp);
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  items.forEach((el) => observer.observe(el));
}
