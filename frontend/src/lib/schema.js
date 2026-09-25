// Données structurées schema.org (JSON-LD) : fiches « commerce local » pour Google.
import { business } from '../data/site.js';

const DAY_URIS = [
  null,
  'https://schema.org/Monday',
  'https://schema.org/Tuesday',
  'https://schema.org/Wednesday',
  'https://schema.org/Thursday',
  'https://schema.org/Friday',
  'https://schema.org/Saturday',
  'https://schema.org/Sunday',
];

const base = business.url.replace(/\/$/, '');

export const organization = {
  '@type': 'Organization',
  '@id': `${base}/#organisation`,
  name: business.name,
  url: `${base}/`,
  email: business.email,
  logo: `${base}/icon-512.png`,
  foundingDate: business.founded,
  founder: { '@type': 'Person', name: business.founder },
  sameAs: [business.social.facebook],
};

export const locations = business.locations.map((loc) => ({
  '@type': loc.id === 'pepiniere' ? ['Florist', 'GardenStore'] : 'Florist',
  '@id': `${base}/#${loc.id}`,
  name: `${business.name} — ${loc.name}`,
  description: loc.detail,
  url: `${base}/contact/#${loc.id}`,
  telephone: loc.phone,
  email: business.email,
  image: `${base}/og/accueil.jpg`,
  hasMap: loc.mapsUrl,
  address: {
    '@type': 'PostalAddress',
    streetAddress: loc.street,
    postalCode: loc.postalCode,
    addressLocality: loc.city,
    addressRegion: loc.region,
    addressCountry: loc.country,
  },
  openingHoursSpecification: business.hours.map((slot) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: slot.days.map((d) => DAY_URIS[d]),
    opens: slot.open,
    closes: slot.close,
  })),
  areaServed: { '@type': 'City', name: 'Bruxelles' },
  parentOrganization: { '@id': organization['@id'] },
}));

export const website = {
  '@type': 'WebSite',
  '@id': `${base}/#site`,
  url: `${base}/`,
  name: business.name,
  inLanguage: 'fr-BE',
  publisher: { '@id': organization['@id'] },
};

/** Fil d'Ariane : [{ name, path }] */
export function breadcrumb(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Accueil', path: '/' }, ...items].map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${base}${item.path}`,
    })),
  };
}
