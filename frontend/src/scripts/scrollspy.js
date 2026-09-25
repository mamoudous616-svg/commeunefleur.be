// Sommaire qui suit la lecture : le lien de la section en cours est mis en avant.
export function initScrollspy(navSelector) {
  const nav = document.querySelector(navSelector);
  if (!nav) return;
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const byId = new Map();
  for (const link of links) {
    const section = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (section) byId.set(section.id, link);
  }
  if (!byId.size) return;

  const scroller = nav.querySelector('[data-scroller]') || nav;
  let current = null;

  const activate = (id) => {
    if (id === current) return;
    current = id;
    for (const [sectionId, link] of byId) {
      if (sectionId === id) {
        link.setAttribute('aria-current', 'true');
        // Rangée horizontale (mobile) : on garde la pastille active visible.
        if (scroller.scrollWidth > scroller.clientWidth) {
          scroller.scrollTo({ left: link.offsetLeft - 16, behavior: 'smooth' });
        }
      } else {
        link.removeAttribute('aria-current');
      }
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      if (visible.length) activate(visible[0].target.id);
    },
    { rootMargin: '-35% 0px -60% 0px' },
  );
  byId.forEach((_, id) => observer.observe(document.getElementById(id)));
}

/** Barre de progression de lecture (pages longues). */
export function initReadingProgress(selector) {
  const bar = document.querySelector(selector);
  const article = document.querySelector('[data-reading]');
  if (!bar || !article) return;
  let frame = 0;
  const update = () => {
    frame = 0;
    const rect = article.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const progress = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1;
    bar.style.setProperty('--progress', progress.toFixed(4));
  };
  window.addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(update);
  }, { passive: true });
  update();
}
