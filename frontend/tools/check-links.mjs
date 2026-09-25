// Vérificateur de liens et de balises du site construit (dist/) : « zéro lien cassé » avant chaque mise en ligne.
//   node tools/check-links.mjs             → liens internes, ancres, images, plan du site, balises SEO
//   node tools/check-links.mjs --external  → vérifie aussi les liens vers d'autres sites
// Code de sortie 1 s'il reste une erreur (utilisé par la CI).
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { matchRedirect } from '@cuf/shared/redirects';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SITE = (process.env.SITE_URL || 'https://commeunefleur.be').replace(/\/$/, '');
const EXTERNAL = process.argv.includes('--external');

const errors = [];
const warnings = [];
const external = new Map();

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const exists = (p) =>
  stat(p)
    .then((s) => s.isFile())
    .catch(() => false);

const pageCache = new Map();
async function htmlOf(file) {
  if (!pageCache.has(file)) pageCache.set(file, await readFile(file, 'utf8'));
  return pageCache.get(file);
}

/** Chemin public → fichier de dist (ou null). */
async function resolveFile(pathname) {
  let p = decodeURIComponent(pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = join(DIST, p);
  if (await exists(file)) return file;
  if (!/\.[a-z0-9]+$/i.test(p) && (await exists(join(DIST, p, 'index.html')))) return join(DIST, p, 'index.html');
  return null;
}

const attrValues = (html, name) => [...html.matchAll(new RegExp(`\\s${name}=("([^"]*)"|'([^']*)')`, 'gi'))].map((m) => m[2] ?? m[3]);

async function checkUrl(raw, from, kind, html = '') {
  if (!raw || /^(mailto:|tel:|javascript:|data:|blob:)/i.test(raw)) return;
  if (raw.startsWith('#')) {
    const id = decodeURIComponent(raw.slice(1));
    if (id && !new RegExp(`\\sid=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(html)) errors.push(`${from} : ancre introuvable ${raw}`);
    return;
  }
  let url;
  try {
    url = new URL(raw, `${SITE}${from}`);
  } catch {
    errors.push(`${from} : adresse invalide « ${raw} » (${kind})`);
    return;
  }
  if (url.origin !== new URL(SITE).origin) {
    if (/^https?:$/.test(url.protocol)) external.set(url.href, [...(external.get(url.href) || []), from]);
    return;
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  const file = await resolveFile(url.pathname);
  if (!file) {
    const rule = matchRedirect(url.pathname);
    if (rule) warnings.push(`${from} : lien vers une ancienne adresse ${url.pathname} (redirigée vers ${rule.to}) — mettre le lien à jour`);
    else errors.push(`${from} : lien cassé ${url.pathname} (${kind})`);
    return;
  }
  if (kind === 'lien' && !url.pathname.endsWith('/') && file.endsWith('index.html')) {
    warnings.push(`${from} : ${url.pathname} sans « / » final (redirection inutile)`);
  }
  if (url.hash && url.hash.length > 1 && file.endsWith('.html')) {
    const id = decodeURIComponent(url.hash.slice(1));
    const html = await htmlOf(file);
    if (!new RegExp(`\\sid=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(html)) {
      errors.push(`${from} : ancre introuvable ${url.pathname}${url.hash}`);
    }
  }
}

function pathOf(file) {
  const rel = file.slice(DIST.length - 1).replace(/index\.html$/, '');
  return rel === '/404.html' ? '/404' : rel;
}

const files = await walk(DIST);
for (const file of files) {
  const html = await htmlOf(file);
  const from = pathOf(file);

  // Liens, images, ressources
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) for (const v of attrValues(m[0], 'href')) await checkUrl(v, from, 'lien', html);
  for (const m of html.matchAll(/<(img|script|source|link|use)\b[^>]*>/gi)) {
    for (const v of [...attrValues(m[0], 'src'), ...attrValues(m[0], 'href')]) await checkUrl(v, from, m[1].toLowerCase());
    for (const set of attrValues(m[0], 'srcset')) for (const part of set.split(',')) await checkUrl(part.trim().split(/\s+/)[0], from, 'srcset');
  }
  for (const m of html.matchAll(/<meta\b[^>]*(property|name)=["'](og:image|twitter:image)["'][^>]*>/gi)) {
    for (const v of attrValues(m[0], 'content')) await checkUrl(v, from, m[2]);
  }
  for (const m of html.matchAll(/<form\b[^>]*>/gi)) for (const v of attrValues(m[0], 'action')) await checkUrl(v, from, 'formulaire');

  // Balises essentielles (référencement et accessibilité)
  const isError = from === '/404' || /name="robots" content="noindex/.test(html);
  if (!/<html[^>]+lang=["']fr/i.test(html)) errors.push(`${from} : langue de la page absente (<html lang>)`);
  const h1 = (html.match(/<h1\b/gi) || []).length;
  if (h1 !== 1) errors.push(`${from} : ${h1} titre(s) <h1> (il en faut exactement 1)`);
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '';
  if (title.length < 10 || title.length > 70) warnings.push(`${from} : titre de ${title.length} caractères (idéal : 10 à 70) « ${title} »`);
  const description = html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? '';
  if (description.length < 50 || description.length > 170) warnings.push(`${from} : description de ${description.length} caractères (idéal : 50 à 170)`);
  if (!isError && !/<link rel="canonical"/i.test(html)) errors.push(`${from} : balise canonique absente`);
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) if (!/\salt=/i.test(m[0])) errors.push(`${from} : image sans texte alternatif (${m[0].slice(0, 80)}…)`);
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) errors.push(`${from} : identifiants en double : ${[...new Set(dup)].join(', ')}`);
}

// Plan du site : chaque adresse doit exister
for (const sitemap of ['sitemap-0.xml']) {
  const xml = await readFile(join(DIST, sitemap), 'utf8').catch(() => '');
  if (!xml) {
    errors.push(`plan du site ${sitemap} absent`);
    continue;
  }
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = new URL(m[1]);
    if (!(await resolveFile(url.pathname))) errors.push(`plan du site : ${url.pathname} n’existe pas`);
  }
}
const robots = await readFile(join(DIST, 'robots.txt'), 'utf8').catch(() => '');
if (!robots.includes('Sitemap:')) errors.push('robots.txt absent ou sans lien vers le plan du site');

// Liens externes (facultatif)
if (EXTERNAL) {
  for (const [href, pages] of external) {
    try {
      let res = await fetch(href, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'Mozilla/5.0 (verification de liens)' } });
      if (res.status === 405 || res.status === 403) res = await fetch(href, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'Mozilla/5.0 (verification de liens)' } });
      if (res.status >= 400) (res.status === 403 || res.status === 429 ? warnings : errors).push(`lien externe ${href} → HTTP ${res.status} (sur ${pages[0]})`);
    } catch (error) {
      warnings.push(`lien externe ${href} injoignable (${error.cause?.code || error.message}) (sur ${pages[0]})`);
    }
  }
}

console.log(`${files.length} pages vérifiées, ${external.size} liens externes${EXTERNAL ? ' testés' : ' repérés (ajoutez --external pour les tester)'}.`);
for (const w of [...new Set(warnings)]) console.warn(`  ⚠ ${w}`);
for (const e of [...new Set(errors)]) console.error(`  ✗ ${e}`);
if (errors.length) {
  console.error(`\n${new Set(errors).size} erreur(s) à corriger.`);
  process.exit(1);
}
console.log('✓ Aucun lien cassé.');
