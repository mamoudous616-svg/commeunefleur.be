// Mesure d'audience maison, anonyme et sans cookie — active uniquement après consentement.
// Les données partent vers notre propre API (/api/collect) et nulle part ailleurs.
import { readConsent } from './consent.js';
import { beacon } from './config.js';

let started = false;

const allowed = () => Boolean(readConsent()?.analytics);

function externalReferrer() {
  if (!document.referrer) return '';
  try {
    const ref = new URL(document.referrer);
    return ref.host === location.host ? '' : ref.host;
  } catch {
    return '';
  }
}

function campaign() {
  const params = new URLSearchParams(location.search);
  const utm = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const value = params.get(key);
    if (value) utm[key.slice(4)] = value.slice(0, 60);
  }
  return Object.keys(utm).length ? utm : undefined;
}

function pageview() {
  beacon('/api/collect', {
    t: 'pageview',
    p: location.pathname,
    r: externalReferrer(),
    w: window.innerWidth,
    l: (navigator.language || '').slice(0, 5),
    u: campaign(),
  });
}

/** Événement métier : appel, e-mail, itinéraire, formulaire envoyé… */
export function track(name, detail) {
  if (!allowed()) return;
  beacon('/api/collect', { t: 'event', n: name, p: location.pathname, d: detail });
}

function onClick(event) {
  const target = event.target instanceof Element ? event.target.closest('[data-track]') : null;
  if (target) track(target.getAttribute('data-track'), target.getAttribute('href')?.slice(0, 120));
}

function start() {
  if (started) return;
  started = true;
  pageview();
  document.addEventListener('click', onClick, { capture: true });
}

/** Une page pré-chargée en arrière-plan (survol d'un lien) n'est comptée que si elle est vraiment ouverte. */
function whenVisible(fn) {
  if (document.prerendering) document.addEventListener('prerenderingchange', fn, { once: true });
  else fn();
}

export function initAnalytics() {
  whenVisible(() => {
    if (allowed()) start();
    window.addEventListener('cuf:consent', (event) => {
      if (event.detail?.analytics) start();
    });
  });
}
