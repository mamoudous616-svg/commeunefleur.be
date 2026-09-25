// Images de partage (Open Graph, 1200×630) pour Facebook, WhatsApp, LinkedIn, X…
// Rendu avec Chromium à partir d'un gabarit HTML aux couleurs du site.
// Usage : node tools/make-og.mjs   (Chromium : variable CHROMIUM_PATH si besoin)
import { chromium } from 'playwright-core';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const fonts = new URL('src/assets/fonts/', root);
const photosJson = JSON.parse(await readFile(new URL('src/data/photos.json', root), 'utf8'));
const photoFiles = existsSync(new URL('src/assets/photos/', root)) ? await readdir(new URL('src/assets/photos/', root)) : [];

async function dataUri(url, width) {
  const buf = await sharp(await readFile(url)).resize({ width, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

const available = photosJson.filter((p) => !p.hidden && photoFiles.includes(p.file));

/** Visuel : photo de la catégorie ; pour l'accueil, la photo plein écran ou, à défaut, 4 photos de la mosaïque.
    Sans aucune photo importée : brume botanique (seul cas où un flou est utilisé). */
async function visual(category) {
  const photo = (entry, width = 900) => dataUri(new URL(`src/assets/photos/${entry.file}`, root), width);
  if (category === 'hero') {
    const hero = available.find((p) => p.hero && p.width >= 1600);
    if (hero) return { srcs: [await photo(hero)], blur: 0 };
    const mosaic = [...available.filter((p) => p.mosaic).sort((a, b) => a.mosaic - b.mosaic), ...available.filter((p) => p.featured), ...available];
    const four = [...new Set(mosaic)].slice(0, 4);
    if (four.length === 4) return { srcs: await Promise.all(four.map((p) => photo(p, 520))), blur: 0 };
  }
  const entry =
    available.find((p) => p.category === category && p.featured) ??
    available.find((p) => p.category === category) ??
    available.find((p) => p.hero);
  if (entry) return { srcs: [await photo(entry)], blur: 0 };
  return { srcs: [await dataUri(new URL(`src/assets/haze/${category}.webp`, root), 240)], blur: 18 };
}

const pages = [
  { file: 'accueil', category: 'hero', eyebrow: 'fleuriste & pépinière · ixelles', title: 'Comme une <em>fleur</em>', text: '1000 m² de fleurs, plantes, arbres et arbustes en plein cœur de Bruxelles. Ouvert 7 j/7.' },
  { file: 'offres', category: 'fleurs', eyebrow: 'nos offres', title: 'Bouquets, plantes &amp; <em>pépinière</em>', text: 'Créations sur mesure, événements, entretien de jardins, sapins de Noël.' },
  { file: 'contact', category: 'pepiniere', eyebrow: 'contact & horaires', title: 'Venez nous <em>voir</em>', text: 'Avenue de la Couronne&nbsp;461 ·<br>Place Marie-José&nbsp;2 · Ixelles' },
];

// Polices intégrées en data: URI (une page générée ne peut pas lire de fichiers locaux).
const fontData = {};
for (const name of ['newsreader-300-500.woff2', 'newsreader-italic-300.woff2', 'inter-400-600.woff2']) {
  fontData[name] = `data:font/woff2;base64,${(await readFile(new URL(name, fonts))).toString('base64')}`;
}
const fontUrl = (name) => fontData[name];

function template(page, image) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Newsreader; src: url('${fontUrl('newsreader-300-500.woff2')}') format('woff2'); font-weight: 300 500; }
@font-face { font-family: Newsreader; src: url('${fontUrl('newsreader-italic-300.woff2')}') format('woff2'); font-weight: 300; font-style: italic; }
@font-face { font-family: Inter; src: url('${fontUrl('inter-400-600.woff2')}') format('woff2'); font-weight: 400 600; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #faf8f5; color: #271a00; font-family: Inter, sans-serif; display: grid; grid-template-columns: 1fr 470px; gap: 48px; padding: 48px; overflow: hidden; }
.text { display: flex; flex-direction: column; justify-content: space-between; padding: 12px 0 8px 16px; }
.brand { display: flex; align-items: center; gap: 12px; font-family: Newsreader, serif; font-size: 30px; }
.eyebrow { font-family: ui-monospace, 'DejaVu Sans Mono', monospace; font-size: 20px; color: #6b6457; margin-bottom: 20px; }
.eyebrow::before { content: '/ '; color: rgba(39,26,0,.35); }
h1 { font-family: Newsreader, serif; font-weight: 300; font-size: 88px; line-height: .98; letter-spacing: -0.02em; color: #121516; }
h1 em { font-style: italic; }
p.lead { margin-top: 26px; font-size: 25px; line-height: 1.45; color: #6b6457; max-width: 560px; }
.url { font-family: ui-monospace, 'DejaVu Sans Mono', monospace; font-size: 20px; color: #0f3639; }
.visual { position: relative; border-radius: 12px; overflow: hidden; background: #7d8f6a; }
.visual img { position: absolute; inset: ${image.blur ? '-12%' : '0'}; width: ${image.blur ? '124%' : '100%'}; height: ${image.blur ? '124%' : '100%'}; object-fit: cover; filter: blur(${image.blur}px); }
.visual.grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 12px; background: none; border-radius: 0; }
.visual.grid .cell { position: relative; border-radius: 12px; overflow: hidden; background: #e5e5e3; }
.pill { position: absolute; left: 20px; bottom: 20px; padding: 12px 18px; border-radius: 12px; background: rgba(255,255,255,.72); backdrop-filter: blur(20px); font-size: 20px; font-weight: 500; display: flex; align-items: center; gap: 10px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #3f8f4f; }
</style></head><body>
<div class="text">
  <div class="brand"><svg width="34" height="34" viewBox="0 0 32 32"><g fill="none" stroke="#271a00" stroke-width="1.5">${[0, 72, 144, 216, 288].map((d) => `<ellipse cx="16" cy="9.6" rx="3.9" ry="5.9" transform="rotate(${d} 16 16)"/>`).join('')}</g><circle cx="16" cy="16" r="2.1" fill="#271a00"/></svg>Comme une fleur</div>
  <div><p class="eyebrow">${page.eyebrow}</p><h1>${page.title}</h1><p class="lead">${page.text}</p></div>
  <p class="url">commeunefleur.be</p>
</div>
${
  image.srcs.length > 1
    ? `<div class="visual grid">${image.srcs.map((src) => `<div class="cell"><img src="${src}" alt=""></div>`).join('')}<div class="pill"><span class="dot"></span>Ouvert 7 jours sur 7</div></div>`
    : `<div class="visual"><img src="${image.srcs[0]}" alt=""><div class="pill"><span class="dot"></span>Ouvert 7 jours sur 7</div></div>`
}
</body></html>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const tab = await context.newPage();
for (const page of pages) {
  await tab.setContent(template(page, await visual(page.category)), { waitUntil: 'load' });
  await tab.evaluate(() => document.fonts.ready);
  const png = await tab.screenshot({ type: 'png' });
  const out = new URL(`public/og/${page.file}.jpg`, root);
  await sharp(png).jpeg({ quality: 84, mozjpeg: true }).toFile(out.pathname);
  console.log(`og/${page.file}.jpg`);
}
await browser.close();
