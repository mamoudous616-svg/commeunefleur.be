// En-tête : se replie en capsule après le haut de page ; menu mobile en plein écran.
export function initHeader() {
  const header = document.querySelector('[data-header]');
  if (header) {
    const sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:96px;pointer-events:none;';
    document.body.prepend(sentinel);
    new IntersectionObserver(([entry]) => {
      header.classList.toggle('is-condensed', !entry.isIntersecting);
    }).observe(sentinel);
  }

  const menu = document.querySelector('[data-menu]');
  const openButton = document.querySelector('[data-menu-open]');
  if (!menu || !openButton || typeof menu.showModal !== 'function') return;

  openButton.addEventListener('click', () => {
    menu.showModal();
    openButton.setAttribute('aria-expanded', 'true');
  });
  menu.querySelector('[data-menu-close]')?.addEventListener('click', () => menu.close());
  menu.addEventListener('close', () => {
    openButton.setAttribute('aria-expanded', 'false');
    openButton.focus();
  });
  // Un lien vers une ancre de la page courante doit aussi refermer le menu.
  menu.querySelectorAll('a[href]').forEach((link) => link.addEventListener('click', () => menu.close()));
  window.matchMedia('(min-width: 961px)').addEventListener('change', (e) => e.matches && menu.open && menu.close());
}
