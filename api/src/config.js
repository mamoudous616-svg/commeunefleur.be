// Configuration par variables d'environnement (voir api/.env.example).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { business } from '@cuf/shared/business';

const here = dirname(fileURLToPath(import.meta.url));

/** Charge un fichier .env simple (CLE=valeur) sans dépendance, sans écraser l'environnement existant. */
export function loadDotEnv(file = resolve(here, '../.env')) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || line.trim().startsWith('#')) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
  }
}

const bool = (value, fallback = false) => (value === undefined ? fallback : /^(1|true|yes|oui)$/i.test(value));
const int = (value, fallback) => (Number.isFinite(Number.parseInt(value, 10)) ? Number.parseInt(value, 10) : fallback);
const list = (value) =>
  (value || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

export function readConfig(env = process.env) {
  const staticDefault = resolve(here, '../../frontend/dist');
  const staticDir = env.STATIC_DIR === '' ? null : resolve(env.STATIC_DIR || staticDefault);
  const secret = env.APP_SECRET || randomBytes(32).toString('hex');

  return {
    port: int(env.PORT, 8787),
    host: env.HOST || '0.0.0.0',
    siteUrl: (env.SITE_URL || business.url).replace(/\/$/, ''),
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    trustProxy: bool(env.TRUST_PROXY),
    hsts: bool(env.HSTS),
    dataDir: resolve(env.DATA_DIR || resolve(here, '../data')),
    staticDir: staticDir && existsSync(staticDir) ? staticDir : null,
    secret,
    secretIsEphemeral: !env.APP_SECRET,
    admin: {
      user: env.ADMIN_USER || 'admin',
      password: env.ADMIN_PASSWORD || '',
    },
    mail: {
      host: env.SMTP_HOST || '',
      port: int(env.SMTP_PORT, 465),
      secure: bool(env.SMTP_SECURE, int(env.SMTP_PORT, 465) === 465),
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
      from: env.MAIL_FROM || env.SMTP_USER || `site@${new URL(env.SITE_URL || business.url).hostname}`,
      to: env.MAIL_TO || business.email,
    },
    // Durées de conservation (jours) — alignées sur la politique de confidentialité.
    retention: {
      messages: int(env.RETENTION_MESSAGES_DAYS, 365),
      events: int(env.RETENTION_EVENTS_DAYS, 395),
      notFound: int(env.RETENTION_404_DAYS, 183),
      consents: int(env.RETENTION_CONSENTS_DAYS, 395),
    },
    antispam: {
      minSeconds: int(env.ANTISPAM_MIN_SECONDS, 3),
      maxTokenAgeHours: int(env.ANTISPAM_MAX_TOKEN_HOURS, 6),
    },
  };
}
