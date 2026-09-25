// Génère les « brumes botaniques » : petits fonds flous (≈ 2 Ko) qui imitent une photo
// de jardin hors mise au point. Servent de fond au héros et de remplaçants tant que les
// vraies photos de la boutique ne sont pas importées.
// Usage : node tools/make-haze.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const OUT = new URL('../src/assets/haze/', import.meta.url);
const W = 240;
const H = 160;

const palettes = {
  hero: { base: ['#9fb38a', '#6f8a57', '#4f6b3f'], blobs: [['#f7f5ee', 26], ['#ffffff', 10], ['#8fa8d4', 9], ['#b9c99a', 14], ['#dfe6c8', 12], ['#5c7a45', 10], ['#d9cf9f', 6]] },
  fleurs: { base: ['#94a67a', '#6c8356', '#4d6440'], blobs: [['#f6f1ea', 16], ['#eab8b0', 12], ['#d07c78', 8], ['#f3d98f', 7], ['#fbfaf6', 8], ['#a9bd8a', 10], ['#c9a3c8', 5]] },
  plantes: { base: ['#6e8c5a', '#3f5d36', '#263d22'], blobs: [['#9dbf7c', 16], ['#cfe0b4', 10], ['#2f4a2a', 12], ['#e9f0dc', 6], ['#577c45', 14]] },
  pepiniere: { base: ['#b8c7a2', '#7d9563', '#4a6339'], blobs: [['#e8eee0', 14], ['#9bb27a', 16], ['#5f7a48', 12], ['#f5f3ea', 8], ['#c7b98a', 6], ['#3d5530', 8]] },
  evenements: { base: ['#ede7dc', '#d9d2c3', '#bfc6ad'], blobs: [['#ffffff', 18], ['#f4e3dc', 12], ['#e6c3bb', 7], ['#cbd8bc', 10], ['#f8f4ea', 12], ['#b7c49d', 5]] },
  entretien: { base: ['#a9bf86', '#6f8f4c', '#46652f'], blobs: [['#d9e7b8', 14], ['#f3f1dc', 8], ['#88a860', 16], ['#355024', 8], ['#c5d69c', 10]] },
  sapins: { base: ['#3b5641', '#22382a', '#142219'], blobs: [['#4d6d51', 16], ['#2c4733', 14], ['#f2d492', 9], ['#fff1c9', 5], ['#b8503c', 4], ['#6b8a6d', 8]] },
  boutique: { base: ['#d9cdb8', '#a99a7c', '#6c7a55'], blobs: [['#c77c54', 8], ['#f4efe4', 14], ['#8ea56c', 12], ['#e7b9a8', 8], ['#5d7446', 8], ['#fbf8f1', 8]] },
};

function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function svgFor(name, { base, blobs }, seed) {
  const rand = rng(seed);
  const circles = [];
  for (const [color, count] of blobs) {
    for (let i = 0; i < count; i += 1) {
      const cx = (rand() * 1.1 - 0.05) * W;
      const cy = (rand() * 1.1 - 0.05) * H;
      const r = 3 + rand() * rand() * 22;
      const o = 0.45 + rand() * 0.5;
      circles.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" fill-opacity="${o.toFixed(2)}"/>`);
    }
  }
  // Tiges / herbes : quelques traits verticaux doux
  for (let i = 0; i < 18; i += 1) {
    const x = rand() * W;
    const y = H * (0.35 + rand() * 0.5);
    circles.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(1 + rand() * 2).toFixed(1)}" ry="${(10 + rand() * 26).toFixed(1)}" fill="${base[2]}" fill-opacity="0.35" transform="rotate(${(rand() * 24 - 12).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${base[0]}"/><stop offset="0.55" stop-color="${base[1]}"/><stop offset="1" stop-color="${base[2]}"/>
    </linearGradient>
    <filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <g filter="url(#b)">${circles.join('')}</g>
</svg>`;
}

await mkdir(OUT, { recursive: true });
let seed = 20021101;
for (const [name, palette] of Object.entries(palettes)) {
  seed += 97;
  const svg = svgFor(name, palette, seed);
  const file = new URL(`${name}.webp`, OUT);
  const info = await sharp(Buffer.from(svg)).webp({ quality: 72, effort: 6 }).toFile(file.pathname);
  console.log(`${name}.webp  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(1)} Ko`);
}
