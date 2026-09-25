// Règles du formulaire de contact, partagées par le navigateur (retour immédiat)
// et par l'API (contrôle qui fait foi). Une seule source de vérité.

import { zonedDateString } from './hours.js';
import { levenshtein } from './text.js';

export const SUBJECTS = [
  { value: 'bouquet', label: 'Bouquet ou composition sur mesure' },
  { value: 'evenement', label: 'Événement : mariage, anniversaire, communion, naissance' },
  { value: 'entretien', label: 'Entretien : jardin, tombe, parc' },
  { value: 'pepiniere', label: 'Pépinière : arbres, arbustes, haies, plantes' },
  { value: 'entreprise', label: 'Partenariat pour une entreprise' },
  { value: 'autre', label: 'Autre question' },
];

export const LIMITS = {
  nom: { min: 2, max: 80 },
  email: { max: 254 },
  telephone: { minDigits: 8, maxDigits: 15, max: 30 },
  message: { min: 10, max: 2000 },
};

export const FIELD_NAMES = ['nom', 'email', 'telephone', 'sujet', 'date', 'message'];

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}'’. -]*$/u;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const PHONE_RE = /^\+?[0-9 ().\/-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /(https?:\/\/|www\.)\S+/gi;

const COMMON_DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'hotmail.be',
  'hotmail.fr',
  'outlook.com',
  'outlook.be',
  'live.be',
  'live.fr',
  'yahoo.com',
  'yahoo.fr',
  'icloud.com',
  'skynet.be',
  'telenet.be',
  'proximus.be',
  'scarlet.be',
  'voo.be',
];

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/** Nettoie les valeurs reçues (espaces, casse de l'e-mail…). */
export function normalizeContact(raw = {}) {
  return {
    nom: clean(raw.nom).replace(/\s+/g, ' '),
    email: clean(raw.email).toLowerCase(),
    telephone: clean(raw.telephone).replace(/\s+/g, ' '),
    sujet: clean(raw.sujet),
    date: clean(raw.date),
    message: clean(raw.message).replace(/\r\n/g, '\n'),
  };
}

/** Message d'erreur pour un champ, ou '' si le champ est valide. */
export function validateField(name, value, { now = new Date() } = {}) {
  const v = typeof value === 'string' ? value : '';
  switch (name) {
    case 'nom':
      if (!v) return 'Indiquez votre nom, pour que nous sachions à qui répondre.';
      if (v.length < LIMITS.nom.min) return 'Votre nom doit contenir au moins 2 caractères.';
      if (v.length > LIMITS.nom.max) return `Votre nom est trop long (${LIMITS.nom.max} caractères maximum).`;
      if (!NAME_RE.test(v)) return 'Utilisez uniquement des lettres, espaces, tirets ou apostrophes.';
      return '';
    case 'email':
      if (!v) return 'Indiquez votre adresse e-mail pour recevoir notre réponse.';
      if (v.length > LIMITS.email.max || !EMAIL_RE.test(v))
        return 'Cette adresse e-mail semble incomplète. Exemple : prenom@domaine.be';
      return '';
    case 'telephone': {
      if (!v) return '';
      const digits = v.replace(/\D/g, '');
      if (v.length > LIMITS.telephone.max || !PHONE_RE.test(v))
        return 'Utilisez uniquement des chiffres, espaces et le signe +. Exemple : 0470 12 34 56';
      if (digits.length < LIMITS.telephone.minDigits || digits.length > LIMITS.telephone.maxDigits)
        return 'Ce numéro semble incomplet. Exemple : 0470 12 34 56 ou +32 470 12 34 56';
      return '';
    }
    case 'sujet':
      if (!v) return 'Choisissez le sujet de votre demande.';
      if (!SUBJECTS.some((s) => s.value === v)) return 'Choisissez un sujet dans la liste.';
      return '';
    case 'date': {
      if (!v) return '';
      if (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`)))
        return 'Choisissez une date valide.';
      const today = zonedDateString(now);
      if (v < today) return 'Cette date est déjà passée : choisissez aujourd’hui ou une date future.';
      const limit = new Date(now);
      limit.setUTCFullYear(limit.getUTCFullYear() + 2);
      if (v > zonedDateString(limit)) return 'Choisissez une date dans les deux prochaines années.';
      return '';
    }
    case 'message': {
      if (!v) return 'Écrivez votre message : occasion, envies, budget, délais…';
      if (v.length < LIMITS.message.min)
        return `Votre message est un peu court (${LIMITS.message.min} caractères minimum).`;
      if (v.length > LIMITS.message.max)
        return `Votre message est trop long (${LIMITS.message.max} caractères maximum).`;
      if ((v.match(URL_RE) || []).length > 2) return 'Merci de limiter les liens à deux par message.';
      return '';
    }
    default:
      return '';
  }
}

/** Valide l'ensemble du formulaire → { valid, errors: { champ: message }, data } */
export function validateContact(raw, options = {}) {
  const data = normalizeContact(raw);
  const errors = {};
  for (const field of FIELD_NAMES) {
    const error = validateField(field, data[field], options);
    if (error) errors[field] = error;
  }
  return { valid: Object.keys(errors).length === 0, errors, data };
}

/** Suggère une correction pour les fautes de frappe courantes : « jean@gmial.com » → « jean@gmail.com ». */
export function suggestEmail(email) {
  const at = typeof email === 'string' ? email.lastIndexOf('@') : -1;
  if (at < 1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || COMMON_DOMAINS.includes(domain)) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of COMMON_DOMAINS) {
    const distance = levenshtein(domain, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance > 0 && bestDistance <= 2 ? `${email.slice(0, at)}@${best}` : null;
}
