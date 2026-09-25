// Consentement « mesure d'audience ». Rien n'est mesuré tant que la personne n'a pas accepté.
import { beacon } from './config.js';

const KEY = 'cuf-consent';
const VERSION = 1; // à incrémenter si la politique de confidentialité change → on redemande
const MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000; // 6 mois

export function readConsent() {
  try {
    const consent = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!consent || consent.v !== VERSION) return null;
    if (Date.now() - Date.parse(consent.date) > MAX_AGE_MS) return null;
    return consent;
  } catch {
    return null;
  }
}

function randomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function saveConsent(analytics) {
  const consent = { v: VERSION, analytics: Boolean(analytics), date: new Date().toISOString(), id: readConsent()?.id ?? randomId() };
  try {
    localStorage.setItem(KEY, JSON.stringify(consent));
  } catch {
    // stockage indisponible (navigation privée) : le choix vaut pour cette page
  }
  // Preuve du consentement (art. 7.1 RGPD) : identifiant aléatoire + choix + date, rien d'autre.
  beacon('/api/consent', { id: consent.id, analytics: consent.analytics, v: VERSION, page: location.pathname });
  window.dispatchEvent(new CustomEvent('cuf:consent', { detail: consent }));
  return consent;
}

export function initConsent() {
  const banner = document.querySelector('[data-consent]');
  if (!banner) return;
  const prefs = banner.querySelector('[data-consent-prefs]');
  const toggle = banner.querySelector('[data-consent-analytics]');
  const customize = banner.querySelector('[data-consent-customize]');
  const save = banner.querySelector('[data-consent-save]');

  const setCustomize = (open) => {
    prefs.hidden = !open;
    save.hidden = !open;
    customize.setAttribute('aria-expanded', String(open));
  };

  const show = ({ customizeOpen = false } = {}) => {
    toggle.checked = Boolean(readConsent()?.analytics);
    setCustomize(customizeOpen);
    banner.classList.remove('is-leaving');
    banner.hidden = false;
  };

  const hide = () => {
    banner.classList.add('is-leaving');
    window.setTimeout(() => {
      banner.hidden = true;
      banner.classList.remove('is-leaving');
    }, 480);
  };

  banner.querySelector('[data-consent-accept]').addEventListener('click', () => {
    saveConsent(true);
    hide();
  });
  banner.querySelector('[data-consent-reject]').addEventListener('click', () => {
    saveConsent(false);
    hide();
  });
  customize.addEventListener('click', () => setCustomize(prefs.hidden));
  save.addEventListener('click', () => {
    saveConsent(toggle.checked);
    hide();
  });

  document.querySelectorAll('[data-consent-open]').forEach((button) => {
    button.addEventListener('click', () => {
      show({ customizeOpen: true });
      toggle.focus();
    });
  });

  if (!readConsent()) show();
}
