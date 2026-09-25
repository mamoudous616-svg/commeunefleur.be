// Galerie : filtres animés, affichage progressif, visionneuse (clavier, glisser, zoom depuis la vignette).
import { track } from './analytics.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Lance une transition de vue si le navigateur sait la faire, sinon applique directement. */
function transition(update) {
  if (!document.startViewTransition || reduceMotion()) {
    update();
    return null;
  }
  return document.startViewTransition(update);
}

export function initGallery() {
  const root = document.querySelector('[data-gallery]');
  const grid = root?.querySelector('[data-gallery-grid]');
  if (!root || !grid) return;

  const items = [...grid.querySelectorAll('.gallery__item')];
  const chips = [...root.querySelectorAll('[data-filter]')];
  const status = root.querySelector('[data-gallery-status]');
  const moreButton = root.querySelector('[data-gallery-more]');
  const initial = Number(root.getAttribute('data-initial')) || 12;
  let filter = 'all';
  let expanded = false;

  // Noms uniques pour que chaque vignette glisse vers sa nouvelle place lors d'un filtrage.
  items.forEach((item, i) => item.style.setProperty('view-transition-name', `photo-${i}`));

  const matching = () => items.filter((item) => filter === 'all' || item.dataset.category === filter);

  function render({ animateNew = false } = {}) {
    const list = matching();
    const limit = expanded || filter !== 'all' ? list.length : initial;
    let order = 0;
    items.forEach((item) => {
      const visible = list.indexOf(item) > -1 && list.indexOf(item) < limit;
      const wasHidden = item.hidden;
      item.hidden = !visible;
      if (visible && wasHidden && animateNew) {
        item.style.setProperty('--i', String(order++ % 12));
        item.classList.remove('is-entering');
        void item.offsetWidth;
        item.classList.add('is-entering');
      }
    });
    if (moreButton) moreButton.parentElement.hidden = expanded || filter !== 'all' || list.length <= initial;
    if (status) {
      const label = chips.find((c) => c.dataset.filter === filter)?.firstChild?.textContent?.trim() ?? '';
      status.textContent = `${list.length} photo${list.length > 1 ? 's' : ''}${filter === 'all' ? '' : ` : ${label}`}`;
    }
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      if (chip.dataset.filter === filter) return;
      filter = chip.dataset.filter;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      const vt = transition(() => render());
      if (!vt) render({ animateNew: true });
      track('gallery_filter', filter);
    });
  });

  moreButton?.addEventListener('click', () => {
    expanded = true;
    const firstNew = matching()[initial];
    render({ animateNew: true });
    // On place le focus sur la première nouvelle photo : le clavier suit le contenu ajouté.
    firstNew?.querySelector('button')?.focus({ preventScroll: true });
  });

  // Lien direct vers un thème : /?galerie=sapins#galerie
  const requested = new URLSearchParams(location.search).get('galerie');
  const requestedChip = chips.find((c) => c.dataset.filter === requested);
  if (requestedChip) {
    filter = requested;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === requestedChip)));
  }

  render();
  initLightbox(root, items, () => matching().filter((item) => !item.hidden));
}

function initLightbox(root, items, visibleItems) {
  const dialog = root.querySelector('[data-lightbox]');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const img = dialog.querySelector('[data-lightbox-img]');
  const avif = dialog.querySelector('[data-lightbox-avif]');
  const webp = dialog.querySelector('[data-lightbox-webp]');
  const caption = dialog.querySelector('[data-lightbox-caption]');
  const count = dialog.querySelector('[data-lightbox-count]');
  const stage = dialog.querySelector('[data-lightbox-stage]');
  let list = [];
  let index = 0;
  let opener = null;

  function show(item, { thumbSrc } = {}) {
    const alt = item.querySelector('img.photo__img, .photo__img img, picture img')?.getAttribute('alt') ?? '';
    // On affiche d'abord la vignette déjà chargée, puis la grande image prend le relais.
    img.removeAttribute('srcset');
    avif.removeAttribute('srcset');
    webp.removeAttribute('srcset');
    if (thumbSrc) img.src = thumbSrc;
    img.width = Number(item.dataset.w);
    img.height = Number(item.dataset.h);
    img.alt = alt;
    requestAnimationFrame(() => {
      avif.srcset = item.dataset.avif;
      webp.srcset = item.dataset.webp;
      img.srcset = item.dataset.webp;
      img.src = item.dataset.src;
    });
    caption.textContent = alt;
    count.textContent = `${index + 1} / ${list.length}`;
  }

  function open(item) {
    list = visibleItems();
    index = Math.max(0, list.indexOf(item));
    opener = item.querySelector('button');
    const thumb = item.querySelector('picture img');
    const thumbSrc = thumb?.currentSrc || thumb?.src;

    const vt =
      thumb && document.startViewTransition && !reduceMotion()
        ? (() => {
            thumb.style.setProperty('view-transition-name', 'lightbox-photo');
            item.style.removeProperty('view-transition-name');
            return document.startViewTransition(() => {
              thumb.style.removeProperty('view-transition-name');
              img.style.setProperty('view-transition-name', 'lightbox-photo');
              show(item, { thumbSrc });
              dialog.showModal();
            });
          })()
        : null;

    if (vt) {
      vt.finished.finally(() => {
        img.style.removeProperty('view-transition-name');
        items.forEach((it, i) => it.style.setProperty('view-transition-name', `photo-${i}`));
      });
    } else {
      show(item, { thumbSrc });
      dialog.showModal();
    }
    track('photo_open', item.dataset.category);
  }

  function step(delta) {
    if (list.length < 2) return;
    index = (index + delta + list.length) % list.length;
    const cls = delta > 0 ? 'is-swapping-next' : 'is-swapping-prev';
    if (reduceMotion()) {
      show(list[index]);
      return;
    }
    img.classList.add(cls);
    window.setTimeout(() => {
      show(list[index]);
      img.classList.remove(cls);
    }, 180);
  }

  items.forEach((item) => item.querySelector('button')?.addEventListener('click', () => open(item)));
  dialog.querySelector('[data-lightbox-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-lightbox-prev]').addEventListener('click', () => step(-1));
  dialog.querySelector('[data-lightbox-next]').addEventListener('click', () => step(1));
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') step(1);
    if (event.key === 'ArrowLeft') step(-1);
  });
  // Clic sur le fond sombre = fermer
  stage.addEventListener('click', (event) => {
    if (event.target === stage) dialog.close();
  });
  dialog.addEventListener('close', () => opener?.focus({ preventScroll: true }));

  // Glisser du doigt pour passer d'une photo à l'autre
  let startX = null;
  stage.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
  });
  stage.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  });
}
