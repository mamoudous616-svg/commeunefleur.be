// Apparition douce des blocs quand ils entrent à l'écran : guide la lecture, une seule fois.
export function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  // Décalage en cascade pour les éléments d'un même groupe (cartes, faits clés…).
  document.querySelectorAll('[data-reveal-group]').forEach((group) => {
    group.querySelectorAll(':scope > .reveal, :scope > * > .reveal').forEach((el, i) => {
      el.style.setProperty('--i', String(i % 6));
    });
  });

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  items.forEach((el) => observer.observe(el));
}
