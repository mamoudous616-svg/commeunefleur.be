// Jeton anti-spam : horodatage signé (HMAC). Un robot qui poste directement sans charger la page
// n'en a pas ; un robot trop rapide (< 3 s) est repéré.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const sign = (secret, payload) => createHmac('sha256', secret).update(payload).digest('base64url');

export function issueToken(secret, now = Date.now()) {
  const payload = `${now.toString(36)}.${randomBytes(6).toString('base64url')}`;
  return `${payload}.${sign(secret, payload)}`;
}

/** → { valid, ageSeconds, reason } */
export function checkToken(secret, token, now = Date.now()) {
  if (typeof token !== 'string' || !token) return { valid: false, reason: 'absent' };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformé' };
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { valid: false, reason: 'signature' };
  const issued = Number.parseInt(parts[0], 36);
  if (!Number.isFinite(issued)) return { valid: false, reason: 'malformé' };
  return { valid: true, ageSeconds: (now - issued) / 1000 };
}
