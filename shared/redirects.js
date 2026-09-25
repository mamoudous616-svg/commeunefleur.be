// Redirections permanentes des anciennes adresses (site WordPress) vers les nouvelles pages.
// Objectif : aucun lien cassé depuis Google, Facebook ou d'anciens favoris.
// « * » en fin de chemin = tout ce qui commence par ce préfixe.
// Ce fichier alimente : le serveur Node (api/), _redirects (Netlify), .htaccess (Apache) et la page 404.

import { levenshtein } from './text.js';

export const redirects = [
  { from: '/accueil', to: '/' },
  { from: '/accueil/*', to: '/#galerie' }, // anciennes pages « pièce jointe » des photos
  { from: '/home', to: '/' },
  { from: '/index.php', to: '/' },
  { from: '/qui-sommes-nous', to: '/#histoire' },
  { from: '/a-propos', to: '/#histoire' },
  { from: '/notre-histoire', to: '/#histoire' },
  { from: '/services', to: '/offres/' },
  { from: '/nos-services', to: '/offres/' },
  { from: '/produits', to: '/offres/' },
  { from: '/boutique', to: '/offres/' },
  { from: '/shop', to: '/offres/' },
  { from: '/fleurs', to: '/offres/#fleurs' },
  { from: '/bouquets', to: '/offres/#fleurs' },
  { from: '/plantes', to: '/offres/#plantes' },
  { from: '/pepiniere', to: '/offres/#pepiniere' },
  { from: '/jardinerie', to: '/offres/#pepiniere' },
  { from: '/evenements', to: '/offres/#evenements' },
  { from: '/mariage', to: '/offres/#evenements' },
  { from: '/mariages', to: '/offres/#evenements' },
  { from: '/entretien', to: '/offres/#entretien' },
  { from: '/entretien-jardin', to: '/offres/#entretien' },
  { from: '/sapins', to: '/offres/#sapins' },
  { from: '/sapins-de-noel', to: '/offres/#sapins' },
  { from: '/sapin-de-noel', to: '/offres/#sapins' },
  { from: '/galerie', to: '/#galerie' },
  { from: '/photos', to: '/#galerie' },
  { from: '/contactez-nous', to: '/contact/' },
  { from: '/nous-contacter', to: '/contact/' },
  { from: '/horaires', to: '/contact/#adresses' },
  { from: '/acces', to: '/contact/#adresses' },
  { from: '/politique-de-confidentialite', to: '/confidentialite/' },
  { from: '/privacy-policy', to: '/confidentialite/' },
  { from: '/rgpd', to: '/confidentialite/' },
  { from: '/cookies', to: '/confidentialite/#cookies' },
  { from: '/mentions-legales', to: '/cgu/#editeur' },
  { from: '/conditions-generales', to: '/cgu/' },
  { from: '/feed', to: '/' },
  { from: '/feed/*', to: '/' },
  { from: '/comments/feed', to: '/' },
  { from: '/sitemap.xml', to: '/sitemap-index.xml' },
  { from: '/sitemap_index.xml', to: '/sitemap-index.xml' },
  { from: '/wp-sitemap.xml', to: '/sitemap-index.xml' },
  { from: '/page-sitemap.xml', to: '/sitemap-index.xml' },
];

/** Pages du nouveau site (pour les suggestions de la page 404). */
export const pages = [
  { path: '/', title: 'Accueil', keywords: ['accueil', 'home', 'index'] },
  { path: '/#galerie', title: 'Galerie photos', keywords: ['galerie', 'photos', 'images', 'accueil'] },
  {
    path: '/offres/',
    title: 'Nos offres',
    keywords: [
      'offres',
      'services',
      'fleurs',
      'bouquets',
      'plantes',
      'pepiniere',
      'evenements',
      'mariage',
      'entretien',
      'sapins',
      'noel',
      'deuil',
    ],
  },
  { path: '/contact/', title: 'Contact & horaires', keywords: ['contact', 'horaires', 'adresse', 'acces', 'devis'] },
  { path: '/confidentialite/', title: 'Confidentialité (RGPD)', keywords: ['confidentialite', 'rgpd', 'cookies', 'vie-privee'] },
  { path: '/cgu/', title: 'Conditions générales d’utilisation', keywords: ['cgu', 'conditions', 'mentions', 'legales'] },
];

/** « /Sapins-de-Noel/ » → « /sapins-de-noel » (casse, accents, barre finale). */
export function normalizePath(pathname) {
  let path = String(pathname || '/');
  try {
    path = decodeURIComponent(path);
  } catch {
    // chemin mal encodé : on le garde tel quel
  }
  path = path
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

/** Redirection correspondant à un chemin → { to, status } ou null. */
export function matchRedirect(pathname) {
  const path = normalizePath(pathname);
  for (const rule of redirects) {
    if (rule.from.endsWith('/*')) {
      const prefix = rule.from.slice(0, -2);
      if (path.startsWith(`${prefix}/`) && path.length > prefix.length + 1) {
        return { to: rule.to, status: rule.status ?? 301 };
      }
    } else if (path === rule.from) {
      return { to: rule.to, status: rule.status ?? 301 };
    }
  }
  return null;
}

/** Page la plus proche d'une adresse inconnue (faute de frappe, ancien intitulé) → page ou null. */
export function suggestPage(pathname) {
  const words = normalizePath(pathname)
    .split(/[/\-_.]+/)
    .filter((w) => w.length > 2);
  let best = null;
  let bestScore = Infinity;
  for (const page of pages) {
    for (const keyword of page.keywords) {
      for (const word of words) {
        const score = levenshtein(word, keyword) / Math.max(keyword.length, 1);
        if (score < bestScore) {
          best = page;
          bestScore = score;
        }
      }
    }
  }
  return bestScore <= 0.34 ? best : null;
}
