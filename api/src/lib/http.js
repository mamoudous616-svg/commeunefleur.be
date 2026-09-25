// Petits outils HTTP sans dépendance : lecture du corps, réponses JSON/HTML, en-têtes de sécurité, CORS.

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Lit le corps de la requête en refusant tout ce qui dépasse `limit` octets. */
export function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Requête trop volumineuse.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** JSON, formulaire classique (sans JavaScript) ou text/plain (sendBeacon) → objet. */
export async function parseBody(req, limit) {
  const raw = await readBody(req, limit);
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!raw) return {};
  if (type === 'application/x-www-form-urlencoded') {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    throw new HttpError(400, 'Données illisibles.');
  }
}

export function isFormPost(req) {
  const type = (req.headers['content-type'] || '').toLowerCase();
  return type.startsWith('application/x-www-form-urlencoded') && (req.headers.accept || '').includes('text/html');
}

export function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export function sendHtml(res, status, html, headers = {}) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(html);
}

export function sendEmpty(res, status = 204, headers = {}) {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers });
  res.end();
}

export function redirect(res, location, status = 303) {
  res.writeHead(status, { location, 'cache-control': status === 301 ? 'public, max-age=3600' : 'no-store' });
  res.end();
}

/** Adresse IP du visiteur (utilisée en mémoire uniquement, jamais enregistrée). */
export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
    if (typeof req.headers['x-real-ip'] === 'string') return req.headers['x-real-ip'];
  }
  return req.socket.remoteAddress || '0.0.0.0';
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** En-têtes de sécurité communs à toutes les réponses. */
export function securityHeaders(res, { hsts = false } = {}) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  res.setHeader('cross-origin-opener-policy', 'same-origin');
  if (hsts) res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
}

/** CORS : seulement pour les domaines explicitement autorisés (site servi ailleurs que l'API). */
export function applyCors(req, res, allowedOrigins) {
  const origin = req.headers.origin;
  if (!origin || !allowedOrigins.includes(origin.replace(/\/$/, ''))) return false;
  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('vary', 'Origin');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, accept');
  res.setHeader('access-control-max-age', '600');
  return true;
}
