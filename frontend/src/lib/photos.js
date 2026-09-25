// Accès aux photos importées (src/assets/photos) et à leurs descriptions (src/data/photos.json).
import manifest from '../data/photos.json';

const files = import.meta.glob('../assets/photos/*.{jpg,jpeg,png,webp,avif}', { eager: true, import: 'default' });
const hazes = import.meta.glob('../assets/haze/*.webp', { eager: true, import: 'default' });

const byName = Object.fromEntries(Object.entries(files).map(([path, asset]) => [path.split('/').pop(), asset]));

export const photos = manifest
  .filter((entry) => !entry.hidden && byName[entry.file])
  .map((entry, index) => ({ ...entry, index, asset: byName[entry.file] }));

export const hasPhotos = photos.length > 0;

/** Photos d'illustration (banque d'images sous licence libre), en attendant celles de la boutique. */
export const illustrations = photos.filter((p) => p.illustration);
export const hasIllustrations = illustrations.length > 0;

export function photosIn(category) {
  return photos.filter((p) => p.category === category);
}

/** Couverture d'une offre : la photo mise en avant de la catégorie, sinon une photo désignée (« cover »). */
export function coverFor(category) {
  const list = photosIn(category);
  return list.find((p) => p.featured) ?? list[0] ?? photos.find((p) => p.cover?.includes(category)) ?? null;
}

// Accueil : la photo choisie à la main (« hero ») en plein écran ; à défaut, une photo assez grande
// pour rester nette sur grand écran ; sinon, une mosaïque de photos affichées près de leur taille réelle.
const HERO_MIN_WIDTH = 1600;
const isWide = (p) => p.asset.width >= HERO_MIN_WIDTH && p.asset.width >= p.asset.height * 1.2;

export const heroPhoto = photos.find((p) => p.hero) ?? photos.find((p) => isWide(p)) ?? null;

export const MOSAIC_SIZE = 10;

function mosaicPhotos() {
  if (heroPhoto || !photos.length) return [];
  const chosen = photos.filter((p) => p.mosaic).sort((a, b) => a.mosaic - b.mosaic);
  for (const p of [...photos.filter((p) => p.featured), ...photos]) {
    if (chosen.length >= MOSAIC_SIZE) break;
    if (!chosen.includes(p)) chosen.push(p);
  }
  // Moins de photos que de cases : on les répète plutôt que de laisser des trous.
  return Array.from({ length: MOSAIC_SIZE }, (_, i) => chosen[i % chosen.length]);
}

export const heroMosaic = mosaicPhotos();

export function hazeFor(variant = 'hero') {
  return hazes[`../assets/haze/${variant}.webp`] ?? hazes['../assets/haze/hero.webp'];
}
