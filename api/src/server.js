// Point d'entrée : `npm start` (production) ou `npm run dev` (redémarre à chaque modification).
import { createServer } from 'node:http';
import { loadDotEnv, readConfig } from './config.js';
import { createStore } from './lib/storage.js';
import { createMailer } from './lib/mailer.js';
import { createApp } from './app.js';

loadDotEnv();
const config = readConfig();
const store = createStore(config.dataDir);
const mailer = createMailer(config.mail);
const handler = await createApp(config, { store, mailer });

const server = createServer(handler);
server.keepAliveTimeout = 65_000;
server.requestTimeout = 30_000;

async function purge() {
  try {
    const removed = await store.purge(config.retention);
    const total = removed.messages + removed.notFound + removed.consents + removed.eventFiles;
    if (total) console.info('[rgpd] données expirées supprimées :', removed);
  } catch (error) {
    console.error('[rgpd] purge impossible :', error.message);
  }
}
await purge();
setInterval(purge, 24 * 60 * 60 * 1000).unref();

server.listen(config.port, config.host, () => {
  console.info(`API Comme Une Fleur prête sur http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.info(`  site statique : ${config.staticDir ?? 'non servi (STATIC_DIR vide ou dossier absent)'}`);
  console.info(`  e-mails       : ${mailer.enabled ? `envoyés à ${config.mail.to}` : 'désactivés (SMTP non configuré) → messages visibles dans /admin'}`);
  console.info(`  tableau de bord : ${config.admin.password ? '/admin (identifiant : ' + config.admin.user + ')' : 'désactivé (ADMIN_PASSWORD vide)'}`);
  if (config.secretIsEphemeral) console.warn('  ⚠ APP_SECRET absent : un secret temporaire est utilisé (définissez-le en production).');
});

function shutdown(signal) {
  console.info(`${signal} reçu, arrêt propre…`);
  server.close(async () => {
    await store.flush();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
