// Politique de sécurité du contenu (CSP) : n'autorise que les scripts du site (+ empreintes des
// quelques scripts intégrés), bloque l'intégration dans une iframe, les plugins, etc.
import { createHash } from 'node:crypto';

/** Empreintes sha256 des balises <script> intégrées (hors JSON-LD) d'une page HTML. */
export function inlineScriptHashes(html) {
  const hashes = new Set();
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[1];
    if (/type=["']?application\/ld\+json/i.test(attrs)) continue;
    const body = match[2];
    if (!body.trim()) continue;
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return [...hashes];
}

/** Construit l'en-tête Content-Security-Policy. `apiOrigins` : domaines de l'API si elle est ailleurs. */
export function buildCsp({ scriptHashes = [], apiOrigins = [], upgrade = true } = {}) {
  const api = apiOrigins.join(' ');
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')} 'inline-speculation-rules'`.replace(/\s+/g, ' ').trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${api}`.trim(),
    `form-action 'self' ${api}`.trim(),
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    upgrade ? 'upgrade-insecure-requests' : '',
  ]
    .filter(Boolean)
    .join('; ');
}
