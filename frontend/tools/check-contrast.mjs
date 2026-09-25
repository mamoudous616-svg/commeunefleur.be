// Vérifie les contrastes des couleurs du thème (WCAG 2.2 : 4.5:1 texte, 3:1 grand texte et composants d'interface).
// Usage : node tools/check-contrast.mjs  — échoue (code 1) si une paire obligatoire ne passe pas.

const hex = (h) => h.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// [texte/élément, fond, minimum, usage]
const pairs = [
  ['#271a00', '#faf8f5', 4.5, 'texte principal sur parchemin'],
  ['#271a00', '#ffffff', 4.5, 'texte principal sur carte blanche'],
  ['#121516', '#faf8f5', 4.5, 'titres sur parchemin'],
  ['#6b6457', '#faf8f5', 4.5, 'texte secondaire sur parchemin'],
  ['#6b6457', '#ffffff', 4.5, 'texte secondaire sur carte blanche'],
  ['#0f3639', '#faf8f5', 4.5, 'liens / accent sur parchemin'],
  ['#0f3639', '#ffffff', 4.5, 'liens / accent sur blanc'],
  ['#171615', '#d6d5d4', 4.5, 'bouton pilule principal'],
  ['#faf8f5', '#23291b', 4.5, 'texte sur navigation forêt'],
  ['#faf8f5', '#0f3639', 4.5, 'texte clair sur bouton sarcelle'],
  ['#e5e5e3', '#000000', 4.5, 'texte du pied de page'],
  ['#a9a59b', '#000000', 4.5, 'texte secondaire du pied de page'],
  ['#8a8275', '#ffffff', 3, 'bordure des champs de formulaire (composant)'],
  ['#8a8275', '#faf8f5', 3, 'bordure des champs sur parchemin (composant)'],
  ['#0f3639', '#faf8f5', 3, 'anneau de focus'],
  ['#9b2c1f', '#ffffff', 4.5, 'message d’erreur sur blanc'],
  ['#9b2c1f', '#faf8f5', 4.5, 'message d’erreur sur parchemin'],
  ['#2f6b3a', '#ffffff', 4.5, 'message de succès sur blanc'],
];

let failed = 0;
for (const [fg, bg, min, label] of pairs) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${r.toFixed(2).padStart(5)}:1 (min ${min}) ${fg} sur ${bg} — ${label}`);
}
// Palette de référence (style Perplexity), pour information
console.log(`\nréférence : #7c7464 sur #faf8f5 = ${ratio('#7c7464', '#faf8f5').toFixed(2)}:1 (assombri en #6b6457 pour atteindre AA)`);
console.log(`référence : #d1cfc7 sur #ffffff = ${ratio('#d1cfc7', '#ffffff').toFixed(2)}:1 (réservé aux séparateurs décoratifs)`);
if (failed) {
  console.error(`\n${failed} contraste(s) insuffisant(s).`);
  process.exit(1);
}
console.log('\nTous les contrastes respectent WCAG 2.2 AA.');
