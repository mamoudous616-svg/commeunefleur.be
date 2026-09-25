// Mesure d'audience anonyme, sans cookie.
// Identifiant de visite = empreinte (IP + navigateur + sel du jour). Le sel change chaque jour et
// n'est jamais écrit sur disque : impossible de relier deux journées ou de retrouver une IP.
import { createHash, randomBytes } from 'node:crypto';
import { zonedDateString } from '@cuf/shared/hours';
import { matchRedirect, suggestPage } from '@cuf/shared/redirects';

const BOT_RE =
  /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http|java\/|facebookexternalhit|embedly|whatsapp|telegram|discord|skype/i;

export const EVENT_NAMES = ['call', 'email', 'directions', 'outbound', 'contact_sent', 'gallery_filter', 'photo_open'];

const clip = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

function deviceOf(width) {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return 'inconnu';
  if (w < 640) return 'mobile';
  if (w < 1024) return 'tablette';
  return 'ordinateur';
}

function sourceOf(host) {
  if (!host) return 'Accès direct';
  const h = host.replace(/^www\./, '').replace(/^m\./, '').replace(/^l\./, '').replace(/^lm\./, '');
  if (/(^|\.)google\./.test(h)) return 'Google';
  if (/(^|\.)bing\.com$/.test(h)) return 'Bing';
  if (/(^|\.)duckduckgo\.com$/.test(h)) return 'DuckDuckGo';
  if (/(^|\.)ecosia\.org$/.test(h)) return 'Ecosia';
  if (/(^|\.)(facebook|fb)\.com$/.test(h)) return 'Facebook';
  if (/(^|\.)instagram\.com$/.test(h)) return 'Instagram';
  return h;
}

export function isBot(userAgent) {
  return !userAgent || BOT_RE.test(userAgent);
}

export function createAnalytics(store) {
  let salt = { day: '', value: '' };

  function visitorId(ip, ua) {
    const day = zonedDateString();
    if (salt.day !== day) salt = { day, value: randomBytes(32).toString('hex') };
    return createHash('sha256').update(`${salt.value}|${ip}|${ua}`).digest('base64url').slice(0, 18);
  }

  /** Valide et enregistre un événement envoyé par le navigateur. Renvoie false si ignoré. */
  async function collect(payload, { ip, userAgent }) {
    if (isBot(userAgent) || !payload || typeof payload !== 'object') return false;
    const type = payload.t;
    const path = clip(payload.p, 200);
    if (!['pageview', 'event'].includes(type) || !path.startsWith('/')) return false;
    if (type === 'event' && !EVENT_NAMES.includes(payload.n)) return false;

    const record = {
      ts: new Date().toISOString(),
      t: type,
      p: path,
      v: visitorId(ip, userAgent),
    };
    if (type === 'pageview') {
      const ref = clip(payload.r, 120).toLowerCase();
      if (ref && /^[a-z0-9.-]+(:\d+)?$/.test(ref)) record.r = ref;
      record.dev = deviceOf(payload.w);
      const lang = clip(payload.l, 5);
      if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(lang)) record.l = lang;
      if (payload.u && typeof payload.u === 'object') {
        const u = {};
        for (const key of ['source', 'medium', 'campaign']) if (payload.u[key]) u[key] = clip(String(payload.u[key]), 60);
        if (Object.keys(u).length) record.u = u;
      }
    } else {
      record.n = payload.n;
      if (payload.d) record.d = clip(String(payload.d), 120);
    }
    await store.addEvent(record);
    return true;
  }

  /** Statistiques agrégées pour le tableau de bord. */
  async function stats(days = 30, now = Date.now()) {
    const events = await store.listEvents(days, now);
    const dayKeys = [];
    for (let i = days - 1; i >= 0; i -= 1) dayKeys.push(zonedDateString(new Date(now - i * 86_400_000)));
    const perDay = new Map(dayKeys.map((d) => [d, { date: d, pageviews: 0, visitors: new Set() }]));
    const pages = new Map();
    const sources = new Map();
    const devices = new Map();
    const campaigns = new Map();
    const actions = Object.fromEntries(EVENT_NAMES.map((n) => [n, 0]));
    const firstOfVisit = new Set();

    for (const e of events) {
      const day = perDay.get(zonedDateString(new Date(e.ts)));
      if (!day) continue;
      if (e.t === 'pageview') {
        day.pageviews += 1;
        day.visitors.add(e.v);
        pages.set(e.p, (pages.get(e.p) || 0) + 1);
        // Une provenance par visite (première page vue du jour pour ce visiteur).
        const visitKey = `${day.date}|${e.v}`;
        if (!firstOfVisit.has(visitKey)) {
          firstOfVisit.add(visitKey);
          const source = sourceOf(e.r);
          sources.set(source, (sources.get(source) || 0) + 1);
          devices.set(e.dev || 'inconnu', (devices.get(e.dev || 'inconnu') || 0) + 1);
          if (e.u?.campaign || e.u?.source) {
            const key = [e.u.source, e.u.medium, e.u.campaign].filter(Boolean).join(' / ');
            campaigns.set(key, (campaigns.get(key) || 0) + 1);
          }
        }
      } else if (e.t === 'event' && e.n in actions) {
        actions[e.n] += 1;
      }
    }

    const series = [...perDay.values()].map((d) => ({ date: d.date, pageviews: d.pageviews, visitors: d.visitors.size }));
    const sortDesc = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
    return {
      days,
      series,
      totals: {
        visitors: series.reduce((s, d) => s + d.visitors, 0),
        pageviews: series.reduce((s, d) => s + d.pageviews, 0),
      },
      actions,
      pages: sortDesc(pages).slice(0, 12),
      sources: sortDesc(sources).slice(0, 10),
      devices: sortDesc(devices),
      campaigns: sortDesc(campaigns).slice(0, 10),
    };
  }

  /** Liens cassés regroupés, avec une piste de correction pour chacun. */
  async function brokenLinks(days = 30, now = Date.now()) {
    const since = now - days * 86_400_000;
    const groups = new Map();
    for (const r of await store.listNotFound()) {
      const ts = Date.parse(r.ts);
      if (ts < since) continue;
      const key = `${r.kind}|${r.url}`;
      const g = groups.get(key) || { kind: r.kind, url: r.url, count: 0, last: r.ts, refs: new Map() };
      g.count += 1;
      if (r.ts > g.last) g.last = r.ts;
      if (r.ref) g.refs.set(r.ref, (g.refs.get(r.ref) || 0) + 1);
      groups.set(key, g);
    }
    return [...groups.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
      .map((g) => {
        const path = g.url.split('?')[0];
        const rule = g.kind === 'page' ? matchRedirect(path) : null;
        const guess = g.kind === 'page' && !rule ? suggestPage(path) : null;
        const topRef = [...g.refs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        return {
          ...g,
          refs: undefined,
          ref: topRef,
          fix: rule
            ? `Déjà redirigé vers ${rule.to} (vérifier la configuration de l’hébergeur)`
            : guess
              ? `Ajouter : { from: '${path.replace(/\/$/, '')}', to: '${guess.path}' } dans shared/redirects.js`
              : g.kind === 'image'
                ? 'Image manquante : réimporter la photo ou corriger le lien'
                : 'Ajouter une redirection vers la page la plus proche',
        };
      });
  }

  return { collect, stats, brokenLinks };
}
