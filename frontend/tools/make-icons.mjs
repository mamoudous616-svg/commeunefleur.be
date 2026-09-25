// Génère le favicon et les icônes d'application à partir d'un seul dessin (fleur à cinq pétales).
// Usage : node tools/make-icons.mjs
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const PUBLIC = new URL('../public/', import.meta.url);
const FOREST = '#23291b';
const PARCHMENT = '#faf8f5';
const HEART = '#e3b75a';

function flower(scale = 1) {
  const petals = [0, 72, 144, 216, 288]
    .map((deg) => `<ellipse cx="0" cy="${-11 * scale}" rx="${6.4 * scale}" ry="${10.2 * scale}" transform="rotate(${deg})"/>`)
    .join('');
  return `<g transform="translate(32 32)"><g fill="${PARCHMENT}">${petals}</g><circle r="${4.8 * scale}" fill="${FOREST}"/><circle r="${2.6 * scale}" fill="${HEART}"/></g>`;
}

const icon = (radius, scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${radius}" fill="${FOREST}"/>${flower(scale)}</svg>`;

const svgRounded = icon(14, 1);
const svgMaskable = icon(0, 0.78); // zone de sécurité des icônes « maskable » (Android)

await writeFile(new URL('favicon.svg', PUBLIC), `${svgRounded}\n`);

const png = (svg, size) => sharp(Buffer.from(svg), { density: 72 * (size / 64) * 2 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

await writeFile(new URL('apple-touch-icon.png', PUBLIC), await png(icon(0, 0.86), 180));
await writeFile(new URL('icon-192.png', PUBLIC), await png(svgRounded, 192));
await writeFile(new URL('icon-512.png', PUBLIC), await png(svgRounded, 512));
await writeFile(new URL('icon-maskable-512.png', PUBLIC), await png(svgMaskable, 512));

// favicon.ico (16, 32 et 48 px, images PNG intégrées)
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((s) => png(svgRounded, s)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const entry = 6 + i * 16;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt8(0, entry + 2);
  header.writeUInt8(0, entry + 3);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
});
await writeFile(new URL('favicon.ico', PUBLIC), Buffer.concat([header, ...images]));

const manifest = {
  name: 'Comme Une Fleur — Fleuriste & pépinière',
  short_name: 'Comme une fleur',
  description: 'Fleuriste et pépinière de 1000 m² à Ixelles, Bruxelles.',
  lang: 'fr-BE',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: PARCHMENT,
  theme_color: PARCHMENT,
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
await writeFile(new URL('site.webmanifest', PUBLIC), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Icônes générées : favicon.svg, favicon.ico, apple-touch-icon.png, icon-192/512, maskable, site.webmanifest');
