import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readConfig } from '../src/config.js';
import { createStore } from '../src/lib/storage.js';
import { createApp } from '../src/app.js';
import { issueToken, checkToken } from '../src/lib/token.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';
const SECRET = 'secret-de-test';
const INLINE = "document.documentElement.classList.add('js');";

let server;
let base;
let dataDir;
let staticDir;
let store;
const sent = [];
const silent = { info() {}, warn() {}, error() {} };

const validMessage = {
  nom: 'Élodie Van den Broeck',
  email: 'elodie@example.be',
  telephone: '0470 12 34 56',
  sujet: 'evenement',
  date: '',
  message: 'Bonjour, nous nous marions en juin et cherchons des fleurs pour la salle.',
};

const oldToken = () => issueToken(SECRET, Date.now() - 20_000);

function post(path, body, { type = 'application/json', accept = 'application/json', ua = UA, ip } = {}) {
  const headers = { 'content-type': type, accept, 'user-agent': ua };
  if (ip) headers['x-forwarded-for'] = ip;
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    redirect: 'manual',
  });
}

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'cuf-data-'));
  staticDir = await mkdtemp(join(tmpdir(), 'cuf-dist-'));
  await mkdir(join(staticDir, 'offres'), { recursive: true });
  await mkdir(join(staticDir, '_astro'), { recursive: true });
  await writeFile(join(staticDir, 'index.html'), `<!doctype html><html><head><script>${INLINE}</script></head><body>Accueil</body></html>`);
  await writeFile(join(staticDir, 'offres', 'index.html'), '<!doctype html><html><body>Offres</body></html>');
  await writeFile(join(staticDir, '404.html'), '<!doctype html><html><body>Cette page s’est fanée</body></html>');
  await writeFile(join(staticDir, '_astro', 'app.abc123.js'), 'console.log(1)');
  await writeFile(join(staticDir, '.env'), 'SECRET=1');

  const config = readConfig({
    APP_SECRET: SECRET,
    DATA_DIR: dataDir,
    STATIC_DIR: staticDir,
    ADMIN_PASSWORD: 'motdepasse',
    TRUST_PROXY: '1',
  });
  store = createStore(dataDir);
  const mailer = {
    enabled: true,
    async send(message) {
      sent.push(message);
      return true;
    },
  };
  const handler = await createApp(config, { store, mailer, logger: silent });
  server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await rm(dataDir, { recursive: true, force: true });
  await rm(staticDir, { recursive: true, force: true });
});

test('santé et en-têtes de sécurité', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('jeton anti-spam signé et vérifiable', async () => {
  const res = await fetch(`${base}/api/token`);
  const { token } = await res.json();
  assert.equal(checkToken(SECRET, token).valid, true);
  assert.equal(checkToken('autre-secret', token).valid, false);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('formulaire : données invalides → 422 avec un message par champ', async () => {
  const res = await post('/api/contact', { nom: 'A', email: 'pas-un-email', message: 'court' }, { ip: '10.0.0.1' });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.ok(body.errors.nom && body.errors.email && body.errors.message && body.errors.sujet);
});

test('formulaire : message valide → enregistré et envoyé par e-mail', async () => {
  sent.length = 0;
  const res = await post('/api/contact', { ...validMessage, token: oldToken(), website: '' }, { ip: '10.0.0.2' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  await store.flush();
  const messages = await store.listMessages();
  const last = messages.at(-1);
  assert.equal(last.email, 'elodie@example.be');
  assert.equal(last.spam, false);
  assert.equal(last.review, false);
  assert.equal(last.emailed, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Événement/);
  assert.equal(sent[0].replyTo.address, 'elodie@example.be');
});

test('anti-spam : champ piège rempli → réponse OK mais rien n’est gardé', async () => {
  const before = (await store.listMessages()).length;
  const res = await post('/api/contact', { ...validMessage, message: 'Autre message de robot ici.', website: 'http://spam.io', token: oldToken() }, { ip: '10.0.0.3' });
  assert.equal(res.status, 200);
  await store.flush();
  assert.equal((await store.listMessages()).length, before);
});

test('anti-spam : message publicitaire → classé spam, pas d’e-mail', async () => {
  sent.length = 0;
  const res = await post(
    '/api/contact',
    { ...validMessage, message: 'Get SEO backlinks for your casino site https://a.io https://b.io', token: '' },
    { ip: '10.0.0.4' },
  );
  assert.equal(res.status, 200);
  await store.flush();
  const last = (await store.listMessages()).at(-1);
  assert.equal(last.spam, true);
  assert.equal(sent.length, 0);
});

test('anti-spam : envoi trop rapide → message « à vérifier »', async () => {
  await post('/api/contact', { ...validMessage, message: 'Un bouquet pour vendredi, est-ce possible ?', token: issueToken(SECRET) }, { ip: '10.0.0.5' });
  await store.flush();
  const last = (await store.listMessages()).at(-1);
  assert.equal(last.review, true);
  assert.ok(last.spamReasons.some((r) => r.includes('trop vite')));
});

test('limite d’envois : le 6e message en 10 minutes est refusé (429)', async () => {
  let status = 0;
  for (let i = 0; i < 6; i += 1) {
    const res = await post('/api/contact', { nom: 'X' }, { ip: '10.0.0.6' });
    status = res.status;
  }
  assert.equal(status, 429);
});

test('formulaire sans JavaScript : redirection vers /merci/ ou page d’erreur', async () => {
  const ok = await post('/api/contact', new URLSearchParams({ ...validMessage, message: 'Envoyé sans JavaScript, bonjour !' }).toString(), {
    type: 'application/x-www-form-urlencoded',
    accept: 'text/html',
    ip: '10.0.0.7',
  });
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('location'), '/merci/');

  const bad = await post('/api/contact', 'nom=&email=', { type: 'application/x-www-form-urlencoded', accept: 'text/html', ip: '10.0.0.8' });
  assert.equal(bad.status, 422);
  assert.match(await bad.text(), /Il manque quelques informations/);
});

test('mesure d’audience : pages vues comptées, robots ignorés, événements filtrés', async () => {
  await post('/api/collect', { t: 'pageview', p: '/', r: 'www.google.com', w: 390, l: 'fr-BE' }, { type: 'text/plain', ip: '10.1.0.1' });
  await post('/api/collect', { t: 'pageview', p: '/offres/', w: 1440 }, { type: 'text/plain', ip: '10.1.0.1' });
  await post('/api/collect', { t: 'event', n: 'call', p: '/contact/' }, { type: 'text/plain', ip: '10.1.0.1' });
  await post('/api/collect', { t: 'event', n: 'inconnu', p: '/' }, { type: 'text/plain', ip: '10.1.0.1' });
  await post('/api/collect', { t: 'pageview', p: '/' }, { type: 'text/plain', ip: '10.1.0.2', ua: 'Googlebot/2.1' });
  await store.flush();
  const events = await store.listEvents(1);
  assert.equal(events.filter((e) => e.t === 'pageview').length, 2);
  assert.equal(events.filter((e) => e.t === 'event').length, 1);
  assert.ok(events.every((e) => !JSON.stringify(e).includes('10.1.0.1')), 'aucune adresse IP enregistrée');
});

test('consentement et liens cassés enregistrés', async () => {
  const c = await post('/api/consent', { id: 'abc-123', analytics: true, v: 1, page: '/' }, { type: 'text/plain' });
  assert.equal(c.status, 204);
  const r = await post('/api/report-404', { kind: 'page', url: '/contcat/', ref: 'https://www.facebook.com/commeunefleur.bxl/' }, { type: 'text/plain' });
  assert.equal(r.status, 204);
  await post('/api/report-404', { kind: 'page', url: '/wp-login.php' }, { type: 'text/plain' });
  await store.flush();
  assert.equal((await store.listConsents()).at(-1).analytics, true);
  const broken = await store.listNotFound();
  assert.equal(broken.length, 1, 'les sondes de robots (wp-login) ne sont pas enregistrées');
  assert.equal(broken[0].ref, 'www.facebook.com/commeunefleur.bxl/');
});

test('tableau de bord : protégé par mot de passe, affiche les données', async () => {
  const anonymous = await fetch(`${base}/admin`);
  assert.equal(anonymous.status, 401);
  const auth = { authorization: `Basic ${Buffer.from('admin:motdepasse').toString('base64')}` };
  const res = await fetch(`${base}/admin?jours=7`, { headers: auth });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Tableau de bord/);
  assert.match(html, /\/contcat\//);
  assert.match(html, /Ajouter : \{ from: &#39;\/contcat&#39;, to: &#39;\/contact\/&#39; \}/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);

  const csv = await fetch(`${base}/admin/messages.csv`, { headers: auth });
  assert.equal(csv.status, 200);
  const bytes = Buffer.from(await csv.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM UTF-8 pour Excel');
  const text = bytes.toString('utf8');
  assert.ok(text.includes('"Reçu le";"Nom";"E-mail"'), 'colonnes séparées par des points-virgules');
  assert.ok(text.includes('elodie@example.be'));
});

test('site statique : pages, cache, CSP, redirections, 404, fichiers cachés', async () => {
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  const hash = createHash('sha256').update(INLINE).digest('base64');
  assert.ok(home.headers.get('content-security-policy').includes(`'sha256-${hash}'`));
  assert.equal(home.headers.get('cache-control'), 'no-cache');

  const etag = home.headers.get('etag');
  const again = await fetch(`${base}/`, { headers: { 'if-none-match': etag } });
  assert.equal(again.status, 304);

  const asset = await fetch(`${base}/_astro/app.abc123.js`);
  assert.match(asset.headers.get('cache-control'), /immutable/);

  const slash = await fetch(`${base}/offres`, { redirect: 'manual' });
  assert.equal(slash.status, 301);
  assert.equal(slash.headers.get('location'), '/offres/');

  const old = await fetch(`${base}/accueil/comme-une-fleur-fleuriste-bruxelles/`, { redirect: 'manual' });
  assert.equal(old.status, 301);
  assert.equal(old.headers.get('location'), '/#galerie');

  const missing = await fetch(`${base}/nimporte-quoi/`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /fanée/);

  const secret = await fetch(`${base}/.env`);
  assert.equal(secret.status, 404);
  const traversal = await fetch(`${base}/..%2F..%2Fetc%2Fpasswd`);
  assert.equal(traversal.status, 404);
});

test('RGPD : purge automatique des données expirées', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cuf-purge-'));
  const s = createStore(dir);
  const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
  const fresh = new Date().toISOString();
  await s.addMessage({ ts: old, nom: 'Ancien' });
  await s.addMessage({ ts: fresh, nom: 'Récent' });
  await s.addNotFound({ ts: old, url: '/x' });
  await s.addEvent({ ts: old, t: 'pageview', p: '/' });
  await s.addEvent({ ts: fresh, t: 'pageview', p: '/' });
  await s.flush();
  const removed = await s.purge({ messages: 365, notFound: 183, consents: 395, events: 395 });
  assert.equal(removed.messages, 1);
  assert.equal(removed.notFound, 1);
  assert.equal(removed.eventFiles, 1);
  assert.deepEqual((await s.listMessages()).map((m) => m.nom), ['Récent']);
  assert.ok((await readFile(join(dir, 'messages.jsonl'), 'utf8')).includes('Récent'));
  await rm(dir, { recursive: true, force: true });
});
