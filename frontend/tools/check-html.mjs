// Validation HTML + règles d'accessibilité (html-validate) sur toutes les pages construites.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { HtmlValidate } from 'html-validate';

const DIST = new URL('../dist/', import.meta.url).pathname;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const validator = new HtmlValidate({
  extends: ['html-validate:recommended', 'html-validate:a11y'],
  rules: {
    // Style d'écriture du HTML généré par Astro (minifié) : sans incidence pour les visiteurs.
    'attribute-boolean-style': 'off',
    'attribute-empty-style': 'off',
    'void-style': 'off',
    'no-trailing-whitespace': 'off',
    'no-inline-style': 'off',
    'doctype-style': 'off',
    // Numéros de téléphone : insécables via CSS (white-space: nowrap).
    'tel-non-breaking': 'off',
    // role="list" est volontaire sur les listes sans puces : sinon Safari/VoiceOver n'annonce plus la liste.
    'no-redundant-role': ['error', { exclude: ['list'] }],
    'prefer-native-element': ['error', { exclude: ['list'] }],
  },
});

let failures = 0;
for (const file of await walk(DIST)) {
  const report = await validator.validateFile(file);
  if (report.valid) continue;
  for (const result of report.results) {
    for (const m of result.messages) {
      failures += 1;
      console.error(`${file.slice(DIST.length)}:${m.line}:${m.column} ${m.ruleId} — ${m.message}`);
    }
  }
}
if (failures) {
  console.error(`\n${failures} problème(s) HTML.`);
  process.exit(1);
}
console.log('✓ HTML valide et règles d’accessibilité respectées.');
