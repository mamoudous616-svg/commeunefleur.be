import { business } from '@cuf/shared/business';

export { business };

export const nav = [
  { href: '/', label: 'Accueil' },
  { href: '/offres/', label: 'Offres' },
  { href: '/#galerie', label: 'Galerie' },
  { href: '/contact/', label: 'Contact' },
];

// Catégories de photos (galerie + visuels des offres).
export const categories = [
  { id: 'fleurs', label: 'Fleurs & bouquets' },
  { id: 'plantes', label: 'Plantes' },
  { id: 'pepiniere', label: 'Pépinière' },
  { id: 'evenements', label: 'Événements' },
  { id: 'entretien', label: 'Entretien' },
  { id: 'sapins', label: 'Sapins de Noël' },
  { id: 'boutique', label: 'La boutique' },
];

// Offres réelles de Comme Une Fleur (sources : commeunefleur.be et annuaires, voir shared/business.js).
export const offers = [
  {
    id: 'fleurs',
    index: '01',
    title: 'Fleurs & bouquets',
    short: 'Bouquets, paniers fleuris et compositions originales, créés sur mesure.',
    intro:
      'Modernes, classiques ou champêtres : chaque création est composée à la main, selon l’occasion, vos goûts et votre budget. Nos créations sont 100 % sur mesure.',
    items: ['Bouquets de fleurs coupées', 'Paniers fleuris', 'Compositions originales', 'Créations sur mesure'],
    cta: { label: 'Demander un bouquet', href: '/contact/?sujet=bouquet#formulaire' },
  },
  {
    id: 'plantes',
    index: '02',
    title: 'Plantes d’intérieur & d’extérieur',
    short: 'Plantes en pot, cactus, aloe vera et gammes bio, pour la maison comme pour le jardin.',
    intro:
      'Des plantes vertes et fleuries pour chaque pièce, chaque terrasse et chaque balcon, avec des gammes bio, et tout ce qu’il faut pour bien les accueillir.',
    items: ['Plantes en pot', 'Cactus & aloe vera', 'Gammes de plantes bio', 'Vases, pots & terreaux'],
    cta: { label: 'Nous rendre visite', href: '/contact/#adresses' },
  },
  {
    id: 'pepiniere',
    index: '03',
    title: 'La pépinière',
    short: '1000 m² d’arbres, d’arbustes, de haies et de persistants, en pleine ville.',
    intro:
      'Une véritable pépinière de 1000 m² installée en plein cœur de Bruxelles, avenue de la Couronne : de quoi composer un jardin, une terrasse ou une haie sans quitter Ixelles.',
    items: ['Arbres', 'Arbustes', 'Haies', 'Persistants'],
    cta: { label: 'Venir à la pépinière', href: '/contact/#adresses' },
  },
  {
    id: 'evenements',
    index: '04',
    title: 'Événements',
    short: 'Mariages, anniversaires, communions, naissances : nous habillons vos fêtes.',
    intro:
      'Nous décorons et habillons tous vos événements, personnels comme professionnels, avec des créations pensées pour le lieu, la saison et le moment.',
    items: ['Mariages', 'Anniversaires', 'Communions', 'Naissances', 'Événements professionnels'],
    cta: { label: 'Demander un devis', href: '/contact/?sujet=evenement#formulaire' },
  },
  {
    id: 'entretien',
    index: '05',
    title: 'Entretien',
    short: 'Jardins, parcs et tombes entretenus ponctuellement ou toute l’année.',
    intro:
      'Pour les particuliers comme pour les entreprises : entretien de jardins publics ou privés, de parcs et de tombes, de façon ponctuelle ou régulière. Nous travaillons aussi en partenariat avec des entreprises locales.',
    items: ['Jardins privés & publics', 'Parcs', 'Entretien de tombes', 'Ponctuel ou régulier', 'Partenariats entreprises'],
    cta: { label: 'Parler de votre projet', href: '/contact/?sujet=entretien#formulaire' },
  },
  {
    id: 'sapins',
    index: '06',
    title: 'Sapins de Noël',
    short: 'À l’approche des fêtes, un large choix de sapins à la pépinière.',
    intro:
      'Chaque hiver, la pépinière de l’avenue de la Couronne accueille un large choix de sapins de Noël. Le plus simple : venir choisir le vôtre sur place.',
    items: ['Large choix de sapins', 'À choisir sur place', 'Pendant les fêtes'],
    cta: { label: 'Voir l’adresse', href: '/contact/#adresses' },
  },
];

// Faits clés (repris du site et des annuaires).
export const facts = [
  { value: '2002', label: 'Première boutique, place Marie-José' },
  { value: '1000 m²', label: 'De pépinière, avenue de la Couronne' },
  { value: '7 j / 7', label: 'De 8 h à 20 h, le mercredi dès 9 h' },
  { value: '2', label: 'Adresses à Ixelles' },
];

// Histoire (source : commeunefleur.wordpress.com, « Comme une histoire »).
export const history = [
  {
    when: 'Novembre 2002',
    title: 'Une première boutique',
    text: 'À 20 ans, Pierre Ginter ouvre la première boutique Comme une Fleur, place Marie-José à Ixelles, convaincu qu’avec du travail et de la créativité, tout est possible.',
  },
  {
    when: '2007',
    title: 'Une deuxième adresse',
    text: 'Cinq ans plus tard, une deuxième boutique ouvre ses portes au cœur du quartier étudiant. Des prix accessibles et des créations originales font la réputation de la maison.',
  },
  {
    when: 'Aujourd’hui',
    title: 'Fleuriste et pépinière',
    text: 'Une boutique place Marie-José et une véritable pépinière de 1000 m² avenue de la Couronne, ouvertes 7 jours sur 7.',
  },
];
