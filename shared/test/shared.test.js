import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openingStatus } from '../hours.js';
import { validateContact, validateField, suggestEmail } from '../validation.js';
import { matchRedirect, normalizePath } from '../redirects.js';

// 30 septembre 2026 = mercredi ; Bruxelles est en UTC+2 (heure d'été).
test('horaires : mercredi 8 h 30 → fermé, ouvre aujourd’hui à 9 h', () => {
  const s = openingStatus(new Date('2026-09-30T06:30:00Z'));
  assert.equal(s.open, false);
  assert.equal(s.opensDay, 'aujourd’hui');
  assert.equal(s.opensAt, '09:00');
});

test('horaires : lundi 19 h 45 → ouvert, ferme bientôt', () => {
  const s = openingStatus(new Date('2026-09-28T17:45:00Z'));
  assert.equal(s.open, true);
  assert.equal(s.closingSoon, true);
});

test('horaires : mardi 21 h → fermé, ouvre demain (mercredi) à 9 h', () => {
  const s = openingStatus(new Date('2026-09-29T19:00:00Z'));
  assert.equal(s.open, false);
  assert.equal(s.opensDay, 'demain');
  assert.equal(s.opensAt, '09:00');
});

test('horaires : dimanche midi en hiver (UTC+1) → ouvert jusqu’à 20 h', () => {
  const s = openingStatus(new Date('2027-01-10T11:00:00Z'));
  assert.equal(s.open, true);
  assert.equal(s.closesAt, '20:00');
  assert.equal(s.closingSoon, false);
});

const valid = {
  nom: 'Élodie Van den Broeck',
  email: 'Elodie@Example.be',
  telephone: '+32 470 12 34 56',
  sujet: 'evenement',
  date: '2026-10-10',
  message: 'Bonjour, je cherche des fleurs pour un mariage en octobre.',
};
const now = new Date('2026-09-25T10:00:00Z');

test('validation : formulaire complet accepté et normalisé', () => {
  const r = validateContact(valid, { now });
  assert.equal(r.valid, true, JSON.stringify(r.errors));
  assert.equal(r.data.email, 'elodie@example.be');
});

test('validation : champs obligatoires manquants', () => {
  const r = validateContact({}, { now });
  assert.equal(r.valid, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['email', 'message', 'nom', 'sujet']);
});

test('validation : e-mail, téléphone, date passée, sujet inconnu, trop de liens', () => {
  assert.ok(validateField('email', 'jean@', { now }));
  assert.ok(validateField('telephone', '12', { now }));
  assert.ok(validateField('telephone', 'appelez-moi', { now }));
  assert.equal(validateField('telephone', '', { now }), '');
  assert.ok(validateField('date', '2026-09-24', { now }));
  assert.equal(validateField('date', '2026-09-25', { now }), '');
  assert.ok(validateField('date', '2030-01-01', { now }));
  assert.ok(validateField('sujet', 'casino', { now }));
  assert.ok(validateField('message', 'Voir http://a.io http://b.io http://c.io merci', { now }));
  assert.ok(validateField('nom', '<script>', { now }));
});

test('suggestion e-mail : gmial.com → gmail.com', () => {
  assert.equal(suggestEmail('jean@gmial.com'), 'jean@gmail.com');
  assert.equal(suggestEmail('jean@gmail.com'), null);
  assert.equal(suggestEmail('jean@monentreprise.be'), null);
});

test('redirections : anciennes pages WordPress', () => {
  assert.deepEqual(matchRedirect('/accueil/'), { to: '/', status: 301 });
  assert.deepEqual(matchRedirect('/accueil/comme-une-fleur-fleuriste-bruxelles/'), { to: '/#galerie', status: 301 });
  assert.deepEqual(matchRedirect('/Sapins-De-Noël/'), { to: '/offres/#sapins', status: 301 });
  assert.equal(matchRedirect('/contact/'), null);
  assert.equal(normalizePath('/Pépinière//'), '/pepiniere');
});

import { suggestPage } from '../redirects.js';

test('404 : suggestion de la page la plus proche', () => {
  assert.equal(suggestPage('/contcat/')?.path, '/contact/');
  assert.equal(suggestPage('/ofres')?.path, '/offres/');
  assert.equal(suggestPage('/zzzzzz/'), null);
});
