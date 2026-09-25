// Adresse de l'API. Par défaut : même domaine que le site (/api/…), servi par le serveur Node.
// Pour une API sur un autre domaine : PUBLIC_API_URL=https://api.exemple.be npm run build
const base = (import.meta.env.PUBLIC_API_URL || '').replace(/\/$/, '');

export const apiUrl = (path) => `${base}${path}`;

/** Envoi « fire-and-forget » qui survit au changement de page (text/plain : pas de pré-requête CORS). */
export function beacon(path, payload) {
  const body = JSON.stringify(payload);
  const url = apiUrl(path);
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
  } catch {
    // on retente avec fetch ci-dessous
  }
  fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {});
}
