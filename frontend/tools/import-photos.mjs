// Importe les VRAIES photos de Comme Une Fleur dans le site.
//
//   npm run photos:import                      → depuis https://commeunefleur.be (API WordPress + pages)
//   npm run photos:import -- --source <url>    → depuis une autre adresse (copie du site, préproduction…)
//   npm run photos:import -- --from-dir <dossier>  → depuis un dossier de photos sur l'ordinateur
//   options : --dry-run (liste sans télécharger), --limit 300
//
// Chaque photo est : redressée (EXIF), réduite à 2400 px maximum, recompressée en JPEG progressif,
// débarrassée de ses métadonnées (dont la localisation GPS), puis décrite dans src/data/photos.json
// (catégorie + texte alternatif). Le site en tire ensuite des versions AVIF/WebP à la bonne taille.
// Les réglages faits à la main dans photos.json (alt, catégorie, featured, hero, hidden) sont conservés.

import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { slugify } from '@cuf/shared/text';

const ROOT = new URL('../', import.meta.url);
const PHOTOS_DIR = new URL('src/assets/photos/', ROOT);
const MANIFEST = new URL('src/data/photos.json', ROOT);
const UA = 'CommeUneFleur-ImportPhotos/1.0 (+https://commeunefleur.be)';
const MIN_SIDE = 500; // en dessous : icône, logo ou vignette → ignorée
const MAX_SIDE = 2400;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const SKIP_NAME = /(logo|icon|favicon|sprite|placeholder|plagron|banner-ad|cropped-|gravatar|avatar|emoji)/i;

const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i > -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const SOURCE = (arg('--source', 'https://commeunefleur.be') || '').replace(/\/$/, '');
const FROM_DIR = arg('--from-dir');
const DRY = args.includes('--dry-run');
const LIMIT = Number(arg('--limit', 300));

// ---------------------------------------------------------------- catégories & textes alternatifs
const CATEGORY_RULES = [
  ['sapins', /(sapin|noel|christmas|nordmann|epicea|fetes)/],
  ['entretien', /(entretien|jardinage|jardinier|tonte|taille|elagage|parc|cimetiere|tombe|pelouse)/],
  ['evenements', /(mariage|evenement|decoration|deco|fete|anniversaire|communion|naissance|bapteme|reception|salle)/],
  ['plantes', /(plante|cactus|aloe|orchidee|succulent|interieur|terrasse|balcon|bio|pot)/],
  ['pepiniere', /(pepiniere|arbre|arbuste|haie|persistant|conifere|olivier|buis|jardinerie)/],
  ['fleurs', /(bouquet|fleurs?|rose|tulipe|pivoine|composition|panier|gerbe|fleuri)/],
];

const ALT_BY_CATEGORY = {
  sapins: 'Sapins de Noël à la pépinière Comme Une Fleur, à Ixelles',
  entretien: 'Entretien d’un jardin par l’équipe de Comme Une Fleur',
  evenements: 'Décoration florale d’un événement par Comme Une Fleur',
  plantes: 'Plantes en pot à la boutique Comme Une Fleur, à Ixelles',
  pepiniere: 'Arbres et arbustes de la pépinière Comme Une Fleur, avenue de la Couronne',
  fleurs: 'Bouquet de fleurs composé par Comme Une Fleur',
  boutique: 'La boutique Comme Une Fleur, à Ixelles',
};

function words(...parts) {
  return slugify(parts.filter(Boolean).join(' '))
    .replace(/comme-une-fleur|commeunefleur|bruxelles|ixelles|brussels|fleuriste|img|dsc|photo|image|wp|jpg|jpeg|png|webp|scaled|\d{3,}/g, ' ')
    .replace(/-/g, ' ');
}

function categorize(text) {
  for (const [category, re] of CATEGORY_RULES) if (re.test(text)) return category;
  return 'boutique';
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç' };
const decodeEntities = (text = '') =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });

const stripTags = (html = '') =>
  decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

// ---------------------------------------------------------------- réseau
async function get(url, { type = 'text', timeout = 30_000 } = {}) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: type === 'json' ? 'application/json' : '*/*' }, signal: AbortSignal.timeout(timeout) });
      if (res.status === 404 || res.status === 400 || res.status === 401 || res.status === 403) return { status: res.status };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = type === 'json' ? await res.json() : type === 'buffer' ? Buffer.from(await res.arrayBuffer()) : await res.text();
      return { status: res.status, body, headers: res.headers };
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  return { status: 0 };
}

/** Les miniatures WordPress (« photo-300x200.jpg ») pointent vers l'original (« photo.jpg »). */
function originalOf(url) {
  return url.replace(/-\d{2,5}x\d{2,5}(?=\.(jpe?g|png|webp)$)/i, '');
}

async function fromWordPressApi() {
  const found = [];
  for (let page = 1; page <= 20; page += 1) {
    const url = `${SOURCE}/wp-json/wp/v2/media?per_page=100&page=${page}&media_type=image&_fields=id,source_url,alt_text,title,caption,media_details,mime_type,date,link`;
    const res = await get(url, { type: 'json' });
    if (res.status !== 200 || !Array.isArray(res.body) || !res.body.length) break;
    for (const m of res.body) {
      if (!m.source_url || !IMAGE_EXT.test(new URL(m.source_url).pathname)) continue;
      found.push({
        url: m.source_url,
        alt: stripTags(m.alt_text || ''),
        title: stripTags(m.title?.rendered),
        caption: stripTags(m.caption?.rendered),
        context: m.link || '',
        width: m.media_details?.width,
        height: m.media_details?.height,
      });
    }
    const total = Number(res.headers?.get('x-wp-totalpages') || 1);
    if (page >= total) break;
  }
  return found;
}

async function pagesFromSitemaps() {
  const pages = new Set([`${SOURCE}/`]);
  for (const path of ['/wp-sitemap.xml', '/sitemap_index.xml', '/sitemap.xml', '/page-sitemap.xml']) {
    const res = await get(`${SOURCE}${path}`).catch(() => ({ status: 0 }));
    if (res.status !== 200) continue;
    const locs = [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    for (const loc of locs) {
      if (loc.endsWith('.xml')) {
        const sub = await get(loc).catch(() => ({ status: 0 }));
        if (sub.status === 200) for (const m of sub.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) pages.add(m[1]);
      } else {
        pages.add(loc);
      }
    }
  }
  return [...pages].filter((u) => u.startsWith(SOURCE)).slice(0, 80);
}

async function fromPages() {
  const found = [];
  const host = new URL(SOURCE).host;
  for (const pageUrl of await pagesFromSitemaps()) {
    const res = await get(pageUrl).catch(() => ({ status: 0 }));
    if (res.status !== 200 || typeof res.body !== 'string') continue;
    const html = res.body;
    const add = (raw, alt = '') => {
      if (!raw) return;
      let url;
      try {
        url = new URL(raw.trim().replace(/&amp;/g, '&'), pageUrl);
      } catch {
        return;
      }
      if (url.host !== host && !url.host.endsWith('.wp.com')) return;
      if (!IMAGE_EXT.test(url.pathname)) return;
      found.push({ url: originalOf(url.href.split('?')[0]), alt: alt.trim(), title: '', caption: '', context: pageUrl });
    };
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
      const tag = m[0];
      const attr = (name) => tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1];
      const alt = stripTags(attr('alt') || '');
      for (const name of ['data-orig-file', 'data-large-file', 'data-src', 'data-lazy-src', 'src']) add(attr(name), alt);
      for (const name of ['srcset', 'data-srcset', 'data-lazy-srcset']) {
        const set = attr(name);
        if (set) set.split(',').forEach((part) => add(part.trim().split(/\s+/)[0], alt));
      }
    }
    for (const m of html.matchAll(/<source\b[^>]*srcset=["']([^"']+)["']/gi)) m[1].split(',').forEach((p) => add(p.trim().split(/\s+/)[0]));
    for (const m of html.matchAll(/url\((['"]?)([^'")]+)\1\)/gi)) add(m[2]);
    for (const m of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi)) add(m[1]);
  }
  return found;
}

// ---------------------------------------------------------------- traitement
async function processImage(buffer) {
  const image = sharp(buffer, { failOn: 'none' }).rotate();
  const meta = await image.metadata();
  const w = meta.autoOrient?.width ?? meta.width;
  const h = meta.autoOrient?.height ?? meta.height;
  if (!w || !h || Math.max(w, h) < MIN_SIDE) return null;
  const out = await image
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true, progressive: true })
    .toBuffer({ resolveWithObject: true });
  return { data: out.data, width: out.info.width, height: out.info.height };
}

function uniqueName(base, taken) {
  let name = `${base || 'photo'}.jpg`;
  let i = 2;
  while (taken.has(name)) name = `${base || 'photo'}-${i++}.jpg`;
  taken.add(name);
  return name;
}

async function main() {
  const manifest = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, 'utf8')) : [];
  const bySource = new Map(manifest.map((p) => [p.source, p]));
  const taken = new Set(manifest.map((p) => p.file));
  const seenHashes = new Set();
  await mkdir(PHOTOS_DIR, { recursive: true });

  let candidates = [];
  if (FROM_DIR) {
    const dir = resolve(FROM_DIR);
    const files = (await readdir(dir)).filter((f) => IMAGE_EXT.test(f)).sort();
    candidates = files.map((f) => ({ file: join(dir, f), url: `fichier:${f}`, alt: '', title: basename(f, extname(f)), caption: '', context: '' }));
    console.log(`Dossier ${dir} : ${candidates.length} image(s).`);
  } else {
    console.log(`Recherche des photos sur ${SOURCE}…`);
    let api = [];
    try {
      api = await fromWordPressApi();
      console.log(`  API WordPress : ${api.length} image(s).`);
    } catch (error) {
      console.log(`  API WordPress indisponible (${error.message}).`);
    }
    let pages = [];
    try {
      pages = await fromPages();
      console.log(`  Pages du site : ${pages.length} image(s) repérée(s).`);
    } catch (error) {
      console.log(`  Pages du site inaccessibles (${error.message}).`);
    }
    if (!api.length && !pages.length) {
      console.error(`\nImpossible de joindre ${SOURCE}. Vérifiez la connexion internet (ou un pare-feu / proxy),`);
      console.error('ou importez les photos depuis un dossier : npm run photos:import -- --from-dir <dossier>');
      process.exit(1);
    }
    const byUrl = new Map();
    for (const c of [...api, ...pages]) {
      const key = originalOf(c.url);
      const prev = byUrl.get(key);
      byUrl.set(key, prev ? { ...prev, alt: prev.alt || c.alt, title: prev.title || c.title, caption: prev.caption || c.caption } : { ...c, url: key });
    }
    candidates = [...byUrl.values()].filter((c) => !SKIP_NAME.test(new URL(c.url).pathname));
  }

  candidates = candidates.slice(0, LIMIT);
  console.log(`${candidates.length} photo(s) candidate(s).${DRY ? ' (simulation : rien n’est téléchargé)' : ''}`);
  if (DRY) {
    candidates.forEach((c) => console.log(`  - ${c.url}${c.alt ? `  [alt : ${c.alt}]` : ''}`));
    return;
  }

  const stats = { added: 0, updated: 0, small: 0, duplicate: 0, failed: 0, bytes: 0 };
  const queue = [...candidates];
  async function worker() {
    while (queue.length) {
      const c = queue.shift();
      try {
        const buffer = c.file ? await readFile(c.file) : (await get(c.url, { type: 'buffer', timeout: 60_000 })).body;
        if (!buffer) throw new Error('téléchargement vide');
        const hash = createHash('sha1').update(buffer).digest('hex');
        if (seenHashes.has(hash)) {
          stats.duplicate += 1;
          continue;
        }
        seenHashes.add(hash);
        const processed = await processImage(buffer);
        if (!processed) {
          stats.small += 1;
          continue;
        }
        const existing = bySource.get(c.url);
        const text = words(c.title, c.caption, c.alt, c.file ? basename(c.file) : new URL(c.url).pathname, c.context);
        const name = existing?.file ?? uniqueName(slugify(c.title || basename(c.file || new URL(c.url).pathname, extname(c.file || new URL(c.url).pathname))).slice(0, 60), taken);
        await writeFile(new URL(name, PHOTOS_DIR), processed.data);
        stats.bytes += processed.data.length;
        const category = existing?.category ?? categorize(text);
        const entry = {
          file: name,
          alt: existing?.alt || c.alt || ALT_BY_CATEGORY[category],
          altReviewed: existing?.altReviewed ?? Boolean(c.alt),
          category,
          width: processed.width,
          height: processed.height,
          source: c.url,
          title: c.title || undefined,
          ...(existing?.featured ? { featured: true } : {}),
          ...(existing?.hero ? { hero: true } : {}),
          ...(existing?.hidden ? { hidden: true } : {}),
          ...(existing?.focus ? { focus: existing.focus } : {}),
        };
        if (existing) {
          Object.assign(existing, entry);
          stats.updated += 1;
        } else {
          manifest.push(entry);
          bySource.set(c.url, entry);
          stats.added += 1;
        }
        process.stdout.write(`  ✓ ${name} (${processed.width}×${processed.height}, ${category})\n`);
      } catch (error) {
        stats.failed += 1;
        console.warn(`  ✗ ${c.url} : ${error.message}`);
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  // Une photo mise en avant par catégorie si aucune ne l'est encore.
  for (const category of Object.keys(ALT_BY_CATEGORY)) {
    const list = manifest.filter((p) => p.category === category && !p.hidden);
    if (list.length && !list.some((p) => p.featured)) {
      list.sort((a, b) => b.width * b.height - a.width * a.height)[0].featured = true;
    }
  }
  if (!manifest.some((p) => p.hero)) {
    const landscape = manifest.filter((p) => !p.hidden && p.width >= p.height * 1.2).sort((a, b) => b.width - a.width)[0];
    if (landscape) landscape.hero = true;
  }

  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  const total = (await Promise.all(manifest.map((p) => stat(new URL(p.file, PHOTOS_DIR)).then((s) => s.size).catch(() => 0)))).reduce((a, b) => a + b, 0);
  console.log(
    `\nTerminé : ${stats.added} ajoutée(s), ${stats.updated} mise(s) à jour, ${stats.small} trop petite(s), ${stats.duplicate} doublon(s), ${stats.failed} échec(s).`,
  );
  console.log(`${manifest.length} photo(s) au total (${(total / 1024 / 1024).toFixed(1)} Mo de sources, compressées au build en AVIF/WebP).`);
  const todo = manifest.filter((p) => !p.altReviewed).length;
  if (todo) console.log(`→ ${todo} texte(s) alternatif(s) générique(s) à relire dans src/data/photos.json (champ « alt »).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
