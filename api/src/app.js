// Routeur de l'API. Tout est testable sans réseau : createApp() renvoie un gestionnaire (req, res).
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { validateContact } from '@cuf/shared/validation';
import {
  HttpError,
  applyCors,
  clientIp,
  escapeHtml,
  isFormPost,
  parseBody,
  redirect,
  securityHeaders,
  sendEmpty,
  sendHtml,
  sendJson,
} from './lib/http.js';
import { createRateLimiter } from './lib/ratelimit.js';
import { issueToken } from './lib/token.js';
import { scoreSubmission, fingerprint, SPAM_THRESHOLD, REVIEW_THRESHOLD } from './lib/antispam.js';
import { contactEmail } from './lib/mailer.js';
import { createAnalytics } from './lib/analytics.js';
import { renderDashboard, messagesCsv, dashboardScript } from './lib/admin.js';
import { createStaticHandler } from './lib/static.js';

const ADMIN_CSP =
  "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

export async function createApp(config, { store, mailer, logger = console }) {
  const limits = {
    contact: createRateLimiter({ windowMs: 10 * 60_000, max: 5 }),
    contactDay: createRateLimiter({ windowMs: 24 * 60 * 60_000, max: 20 }),
    token: createRateLimiter({ windowMs: 10 * 60_000, max: 60 }),
    collect: createRateLimiter({ windowMs: 60_000, max: 120 }),
    report: createRateLimiter({ windowMs: 60_000, max: 30 }),
    consent: createRateLimiter({ windowMs: 60_000, max: 20 }),
    adminFail: createRateLimiter({ windowMs: 15 * 60_000, max: 10 }),
  };
  const analytics = createAnalytics(store);
  const upgrade = config.hsts;
  const serveStatic = config.staticDir
    ? await createStaticHandler({ root: config.staticDir, apiOrigins: [], upgrade })
    : null;

  // Messages déjà reçus (empreintes, 24 h) pour repérer les envois en double.
  const recentFingerprints = new Map();
  const seenRecently = (hash) => {
    const now = Date.now();
    for (const [h, t] of recentFingerprints) if (now - t > 24 * 3600_000) recentFingerprints.delete(h);
    return recentFingerprints.has(hash);
  };

  /** Site servi sur un autre domaine que l'API : on renvoie le visiteur vers ce domaine-là. */
  function siteOrigin(req) {
    let origin = req.headers.origin || '';
    if (!origin && req.headers.referer) {
      try {
        origin = new URL(req.headers.referer).origin;
      } catch {
        origin = '';
      }
    }
    return origin && config.allowedOrigins.includes(origin) ? origin : '';
  }

  function limited(res, limiter, key) {
    const r = limiter.hit(key);
    if (!r.allowed) {
      sendJson(res, 429, { ok: false, message: 'Trop de requêtes. Réessayez dans quelques minutes.' }, { 'retry-after': String(r.retryAfter) });
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- formulaire
  async function handleContact(req, res, ip) {
    const html = isFormPost(req);
    if (limited(res, limits.contact, ip) || limited(res, limits.contactDay, ip)) return;

    const body = await parseBody(req, 16 * 1024);
    const { valid, errors, data } = validateContact(body);

    if (!valid) {
      if (html) return sendHtml(res, 422, errorPage(errors, siteOrigin(req)));
      return sendJson(res, 422, { ok: false, errors });
    }

    const spam = scoreSubmission({
      data,
      honeypot: body.website,
      token: body.token,
      secret: config.secret,
      seenRecently,
      minSeconds: config.antispam.minSeconds,
      maxTokenAgeHours: config.antispam.maxTokenAgeHours,
    });
    const hash = fingerprint(data.message);
    recentFingerprints.set(hash, Date.now());

    // Robot évident (champ piège) : on fait comme si tout allait bien, sans rien garder.
    if (spam.honeypot) {
      logger.info('[contact] envoi de robot ignoré (champ piège)');
      return html ? redirect(res, `${siteOrigin(req)}/merci/`) : sendJson(res, 200, { ok: true });
    }

    const record = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      ...data,
      spamScore: spam.score,
      spamReasons: spam.reasons,
      spam: spam.score >= SPAM_THRESHOLD,
      review: spam.score >= REVIEW_THRESHOLD && spam.score < SPAM_THRESHOLD,
      emailed: false,
    };

    if (!record.spam && mailer.enabled) {
      try {
        await mailer.send(contactEmail(record, { siteUrl: config.siteUrl, review: record.review }));
        record.emailed = true;
      } catch (error) {
        logger.error('[contact] e-mail non envoyé :', error.message);
      }
    }
    await store.addMessage(record);
    logger.info(`[contact] message ${record.spam ? 'classé spam' : record.review ? 'à vérifier' : 'reçu'} (score ${spam.score})`);

    return html ? redirect(res, `${siteOrigin(req)}/merci/`) : sendJson(res, 200, { ok: true });
  }

  function errorPage(errors, origin = '') {
    const items = Object.values(errors)
      .map((m) => `<li>${escapeHtml(m)}</li>`)
      .join('');
    return `<!doctype html><html lang="fr-BE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Formulaire incomplet — Comme Une Fleur</title>
<style>body{margin:0;background:#faf8f5;color:#271a00;font:16px/1.6 system-ui,sans-serif}main{max-width:640px;margin:0 auto;padding:12vh 24px}h1{font:300 40px/1.1 Georgia,serif}li{color:#9b2c1f}a{color:#0f3639}</style></head>
<body><main><h1>Il manque quelques informations</h1><ul>${items}</ul><p>Revenez à la page précédente avec le bouton « Retour » de votre navigateur : vos réponses y sont conservées.</p><p><a href="${escapeHtml(origin)}/contact/#formulaire">Retour au formulaire</a></p></main></body></html>`;
  }

  // ---------------------------------------------------------------- administration
  function checkAdmin(req, res, ip) {
    if (!config.admin.password) {
      sendJson(res, 404, { ok: false, message: 'Tableau de bord désactivé (ADMIN_PASSWORD non défini).' });
      return false;
    }
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    let ok = false;
    if (scheme === 'Basic' && encoded) {
      const [user, ...rest] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
      const pass = rest.join(':');
      const same = (a, b) => {
        const x = Buffer.from(a);
        const y = Buffer.from(b);
        return x.length === y.length && timingSafeEqual(x, y);
      };
      ok = same(user, config.admin.user) & same(pass, config.admin.password);
    }
    if (ok) return true;
    if (header && limited(res, limits.adminFail, ip)) return false;
    res.writeHead(401, { 'www-authenticate': 'Basic realm="Comme Une Fleur", charset="UTF-8"', 'cache-control': 'no-store' });
    res.end('Authentification requise');
    return false;
  }

  async function handleAdmin(req, res, url, ip) {
    if (!checkAdmin(req, res, ip)) return;
    res.setHeader('content-security-policy', ADMIN_CSP);
    res.setHeader('x-robots-tag', 'noindex, nofollow');
    if (url.pathname === '/admin/dashboard.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(dashboardScript);
    }
    if (url.pathname === '/admin/messages.csv') {
      const csv = messagesCsv(await store.listMessages());
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="messages-comme-une-fleur-${new Date().toISOString().slice(0, 10)}.csv"`,
        'cache-control': 'no-store',
      });
      return res.end(csv);
    }
    const requested = Number.parseInt(url.searchParams.get('jours') || '30', 10);
    const days = [7, 30, 90].includes(requested) ? requested : 30;
    const [stats, broken, messages, consents] = await Promise.all([
      analytics.stats(days),
      analytics.brokenLinks(days),
      store.listMessages(),
      store.listConsents(),
    ]);
    return sendHtml(res, 200, renderDashboard({ days, stats, broken, messages, consents, mailEnabled: mailer.enabled }));
  }

  // ---------------------------------------------------------------- routeur
  return async function handler(req, res) {
    const started = Date.now();
    securityHeaders(res, { hsts: config.hsts });
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    const ip = clientIp(req, config.trustProxy);

    try {
      if (pathname.startsWith('/api/')) {
        applyCors(req, res, config.allowedOrigins);
        if (req.method === 'OPTIONS') return sendEmpty(res, 204);
        const route = `${req.method} ${pathname.replace(/\/$/, '')}`;
        switch (route) {
          case 'GET /api/health':
            return sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()), mail: mailer.enabled });
          case 'GET /api/token':
            if (limited(res, limits.token, ip)) return;
            return sendJson(res, 200, { token: issueToken(config.secret) });
          case 'POST /api/contact':
            return await handleContact(req, res, ip);
          case 'POST /api/collect': {
            if (limits.collect.hit(ip).allowed) {
              const body = await parseBody(req, 4 * 1024);
              await analytics.collect(body, { ip, userAgent: req.headers['user-agent'] || '' });
            }
            return sendEmpty(res, 204);
          }
          case 'POST /api/consent': {
            if (limits.consent.hit(ip).allowed) {
              const body = await parseBody(req, 2 * 1024);
              if (typeof body.id === 'string' && body.id.length <= 64 && typeof body.analytics === 'boolean') {
                await store.addConsent({
                  ts: new Date().toISOString(),
                  id: body.id,
                  analytics: body.analytics,
                  v: Number(body.v) || 1,
                  page: typeof body.page === 'string' ? body.page.slice(0, 200) : '',
                });
              }
            }
            return sendEmpty(res, 204);
          }
          case 'POST /api/report-404': {
            if (limits.report.hit(ip).allowed) {
              const body = await parseBody(req, 2 * 1024);
              const kind = body.kind === 'image' ? 'image' : 'page';
              const target = typeof body.url === 'string' ? body.url.slice(0, 300) : '';
              if (target && !/\/(wp-|xmlrpc|\.env|\.git)/i.test(target)) {
                let ref = '';
                if (typeof body.ref === 'string' && body.ref) {
                  try {
                    const r = new URL(body.ref);
                    ref = `${r.host}${r.pathname}`.slice(0, 200);
                  } catch {
                    ref = '';
                  }
                }
                await store.addNotFound({ ts: new Date().toISOString(), kind, url: target, ref, page: typeof body.page === 'string' ? body.page.slice(0, 200) : undefined });
              }
            }
            return sendEmpty(res, 204);
          }
          default:
            return sendJson(res, 404, { ok: false, message: 'Route inconnue.' });
        }
      }

      if (pathname === '/admin' || pathname === '/admin/' || pathname.startsWith('/admin/')) {
        return await handleAdmin(req, res, url, ip);
      }

      if (serveStatic && (await serveStatic(req, res, pathname))) return;
      return sendJson(res, 404, { ok: false, message: 'Introuvable.' });
    } catch (error) {
      if (error instanceof HttpError) return sendJson(res, error.status, { ok: false, message: error.message });
      logger.error('[api] erreur :', error);
      if (!res.headersSent) sendJson(res, 500, { ok: false, message: 'Erreur du serveur. Réessayez plus tard.' });
    } finally {
      if (process.env.LOG_REQUESTS === '1') logger.info(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  };
}
