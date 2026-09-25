// Score anti-spam d'un message (0 = propre). Au-delà du seuil, le message est mis de côté sans
// être envoyé par e-mail ; le robot reçoit quand même une réponse « OK » pour ne rien apprendre.
import { createHash } from 'node:crypto';
import { checkToken } from './token.js';

export const SPAM_THRESHOLD = 5;
export const REVIEW_THRESHOLD = 3;

const KEYWORDS = [
  'seo',
  'backlink',
  'backlinks',
  'guest post',
  'casino',
  'crypto',
  'bitcoin',
  'forex',
  'viagra',
  'cialis',
  'loan',
  'prêt rapide',
  'rank your website',
  'first page of google',
  'première page de google',
  'increase traffic',
  'web design services',
  'marketing agency',
  'lead generation',
  'whatsapp',
  'telegram',
  'investment opportunity',
];

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Mot entier uniquement : « loan » ne doit pas déclencher sur le prénom « Loana ».
const KEYWORD_RES = KEYWORDS.map((k) => ({ k, re: new RegExp(`(^|[^\\p{L}])${escapeRe(k)}($|[^\\p{L}])`, 'iu') }));

export function fingerprint(message) {
  return createHash('sha256').update(message.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);
}

/**
 * @param {{ data: object, honeypot: string, token: string, secret: string, seenRecently: (hash) => boolean, minSeconds: number, maxTokenAgeHours: number }} input
 * @returns {{ score: number, reasons: string[], honeypot: boolean }}
 */
export function scoreSubmission({ data, honeypot, token, secret, seenRecently = () => false, minSeconds = 3, maxTokenAgeHours = 6, now = Date.now() }) {
  const reasons = [];
  let score = 0;
  const add = (points, reason) => {
    score += points;
    reasons.push(reason);
  };

  if (honeypot && String(honeypot).trim()) return { score: 100, reasons: ['champ piège rempli'], honeypot: true };

  const t = checkToken(secret, token, now);
  if (!t.valid) add(t.reason === 'absent' ? 2 : 4, `jeton ${t.reason}`);
  else if (t.ageSeconds < minSeconds) add(4, `envoyé trop vite (${t.ageSeconds.toFixed(1)} s)`);
  else if (t.ageSeconds > maxTokenAgeHours * 3600) add(1, 'jeton ancien');

  const text = `${data.nom} ${data.message}`;
  const links = (data.message.match(/(https?:\/\/|www\.)/gi) || []).length;
  if (links > 1) add(links - 1, `${links} liens`);
  if (/\[url=|<a\s|<\/?[a-z][^>]*>/i.test(data.message)) add(3, 'balises HTML/BBCode');

  const hits = KEYWORD_RES.filter(({ re }) => re.test(text)).map(({ k }) => k);
  if (hits.length) add(Math.min(4, hits.length * 2), `mots suspects : ${hits.join(', ')}`);

  const letters = data.message.replace(/[\s\d\p{P}\p{S}]/gu, '');
  const foreign = letters.replace(/[\p{Script=Latin}]/gu, '');
  if (letters.length > 20 && foreign.length / letters.length > 0.5) add(1, 'alphabet inhabituel');

  if (/(.)\1{9,}/.test(data.message)) add(1, 'caractères répétés');
  if (data.message.length > 40 && data.message === data.message.toUpperCase() && /[A-Z]/.test(data.message)) add(1, 'tout en majuscules');

  if (seenRecently(fingerprint(data.message))) add(3, 'message identique déjà reçu');

  return { score, reasons, honeypot: false };
}
