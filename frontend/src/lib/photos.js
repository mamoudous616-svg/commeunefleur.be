// Photos de la boutique : fichiers dans src/assets/photos/ + descriptions dans src/data/photos.json
// (générés par `npm run photos:import`, puis relus à la main pour les textes alternatifs).
import manifest from '../data/photos.json';

const files = import.meta.glob('../assets/photos/*.{jpg,jpeg,png,webp,avif}', { eager: true, import: 'default' });
const hazes = import.meta.glob('../assets/haze/*.webp', { eager: true, import: 'default' });

const byName = Object.fromEntries(Object.entries(files).map(([path, asset]) => [path.split('/').pop(), asset]));

/** Photos disponibles (entrée du manifeste + image importée), dans l'ordre du manifeste. */
export const photos = manifest
  .filter((entry) => !entry.hidden && byName[entry.file])
  .map((entry, index) => ({ ...entry, index, asset: byName[entry.file] }));

export const hasPhotos = photos.length > 0;

export function photosIn(category) {
  return photos.filter((p) => p.category === category);
}

/** Photo représentative d'une catégorie : celle marquée « featured », sinon la première. */
export function coverFor(category) {
  const list = photosIn(category);
  return list.find((p) => p.featured) ?? list[0] ?? null;
}

/** Photo du héros : « hero: true » dans le manifeste, sinon la première photo en paysage. */
export const heroPhoto =
  photos.find((p) => p.hero) ?? photos.find((p) => p.asset.width >= p.asset.height * 1.2) ?? photos[0] ?? null;

/** Brume botanique (fond flou) d'une catégorie. */
export function hazeFor(variant = 'hero') {
  return hazes[`../assets/haze/${variant}.webp`] ?? hazes['../assets/haze/hero.webp'];
}
