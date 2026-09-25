// Source unique des informations publiques de Comme Une Fleur.
// Utilisée par le site (pages, JSON-LD, pied de page) et par l'API (e-mails).
//
// Sources : commeunefleur.be, ixelles.city, pagesdor.be, brusselslife.be,
// commeunefleur.wordpress.com (historique). À relire par la boutique.

export const business = {
  name: 'Comme Une Fleur',
  tagline: 'Pépinière et fleuriste à Bruxelles',
  url: 'https://commeunefleur.be',
  email: 'commeunefleurixelles@gmail.com',
  founded: '2002-11',
  founder: 'Pierre Ginter',
  area: '1000 m²',
  social: {
    facebook: 'https://www.facebook.com/commeunefleur.bxl/',
  },

  locations: [
    {
      id: 'pepiniere',
      name: 'La pépinière',
      kind: 'Pépinière & fleuriste',
      detail: '1000 m² de fleurs, plantes, arbres et arbustes, à deux pas du cimetière d’Ixelles.',
      street: 'Avenue de la Couronne 461',
      postalCode: '1050',
      city: 'Ixelles',
      region: 'Bruxelles-Capitale',
      country: 'BE',
      phone: '+3226473225',
      phoneDisplay: '02 647 32 25',
      mapsUrl:
        'https://www.google.com/maps/search/?api=1&query=Comme+Une+Fleur+Avenue+de+la+Couronne+461+1050+Ixelles',
    },
    {
      id: 'boutique',
      name: 'La boutique',
      kind: 'Fleuriste depuis 2002',
      detail: 'La première adresse, ouverte en novembre 2002 : bouquets, compositions et plantes.',
      street: 'Place Marie-José 2',
      postalCode: '1050',
      city: 'Ixelles',
      region: 'Bruxelles-Capitale',
      country: 'BE',
      phone: '+3226473229',
      phoneDisplay: '02 647 32 29',
      mapsUrl:
        'https://www.google.com/maps/search/?api=1&query=Comme+Une+Fleur+Place+Marie-Jos%C3%A9+2+1050+Ixelles',
    },
  ],

  // Jours ISO : 1 = lundi … 7 = dimanche. Heures locales (Europe/Brussels).
  hours: [
    { days: [1, 2, 4, 5, 6, 7], open: '08:00', close: '20:00' },
    { days: [3], open: '09:00', close: '20:00' },
  ],
  hoursSummary: 'Tous les jours de 8 h à 20 h, sauf le mercredi de 9 h à 20 h.',
  timeZone: 'Europe/Brussels',

  // Mentions légales obligatoires (Code de droit économique, livre XII).
  // Laisser null tant que la boutique ne les a pas fournies : le site affiche « à compléter ».
  legal: {
    companyName: null, // ex. « Comme Une Fleur SRL »
    bce: null, // numéro d'entreprise BCE, ex. « 0123.456.789 »
    vat: null, // numéro de TVA, ex. « BE0123456789 »
    registeredOffice: null, // siège social si différent des adresses ci-dessus
    host: null, // hébergeur du site : nom, adresse, contact
  },
};

export const primaryLocation = business.locations[0];

export const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Horaires jour par jour, du lundi au dimanche : [{ day: 'lundi', iso: 1, open, close }]. */
export function weeklySchedule(hours = business.hours) {
  return DAY_NAMES.map((day, index) => {
    const iso = index + 1;
    const slot = hours.find((h) => h.days.includes(iso));
    return { day, iso, open: slot?.open ?? null, close: slot?.close ?? null };
  });
}

/** « 08:00 » → « 8 h » ; « 09:30 » → « 9 h 30 ». */
export function formatHour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export function fullAddress(location) {
  return `${location.street}, ${location.postalCode} ${location.city}`;
}
