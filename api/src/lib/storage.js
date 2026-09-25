// Stockage en fichiers JSON Lines (une ligne = un enregistrement) dans DATA_DIR.
// Simple à sauvegarder, à lire et à purger ; suffisant pour le trafic d'une boutique.
import { mkdir, appendFile, readFile, writeFile, readdir, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { zonedDateString } from '@cuf/shared/hours';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseLines(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // ligne abîmée (écriture interrompue) : ignorée
    }
  }
  return out;
}

export function createStore(dataDir) {
  const eventsDir = join(dataDir, 'events');
  const ready = mkdir(eventsDir, { recursive: true });
  let queue = Promise.resolve();

  /** Écritures sérialisées : jamais deux lignes entremêlées. */
  function append(file, record) {
    const run = queue.then(async () => {
      await ready;
      await appendFile(join(dataDir, file), `${JSON.stringify(record)}\n`, 'utf8');
    });
    queue = run.catch((error) => console.error(`[stockage] écriture impossible (${file}) :`, error.message));
    return run;
  }

  async function readAll(file) {
    await ready;
    try {
      return parseLines(await readFile(join(dataDir, file), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async function rewrite(file, keep) {
    const records = await readAll(file);
    const kept = records.filter(keep);
    if (kept.length === records.length) return 0;
    const tmp = join(dataDir, `${file}.tmp`);
    await writeFile(tmp, kept.map((r) => JSON.stringify(r)).join('\n') + (kept.length ? '\n' : ''), 'utf8');
    await rename(tmp, join(dataDir, file));
    return records.length - kept.length;
  }

  return {
    dataDir,

    addMessage: (record) => append('messages.jsonl', record),
    listMessages: () => readAll('messages.jsonl'),

    addNotFound: (record) => append('notfound.jsonl', record),
    listNotFound: () => readAll('notfound.jsonl'),

    addConsent: (record) => append('consents.jsonl', record),
    listConsents: () => readAll('consents.jsonl'),

    addEvent: (record) => append(join('events', `${zonedDateString(new Date(record.ts))}.jsonl`), record),

    /** Événements des `days` derniers jours (fichiers quotidiens). */
    async listEvents(days, now = Date.now()) {
      const wanted = new Set();
      for (let i = 0; i < days; i += 1) wanted.add(`${zonedDateString(new Date(now - i * DAY_MS))}.jsonl`);
      await ready;
      const files = (await readdir(eventsDir)).filter((f) => wanted.has(f));
      const chunks = await Promise.all(files.map((f) => readAll(join('events', f))));
      return chunks.flat();
    },

    /** Suppression automatique au-delà des durées annoncées dans la politique de confidentialité. */
    async purge(retention, now = Date.now()) {
      await queue;
      const cutoff = (days) => now - days * DAY_MS;
      const removed = {
        messages: await rewrite('messages.jsonl', (r) => Date.parse(r.ts) >= cutoff(retention.messages)),
        notFound: await rewrite('notfound.jsonl', (r) => Date.parse(r.ts) >= cutoff(retention.notFound)),
        consents: await rewrite('consents.jsonl', (r) => Date.parse(r.ts) >= cutoff(retention.consents)),
        eventFiles: 0,
      };
      const oldest = zonedDateString(new Date(cutoff(retention.events)));
      for (const file of await readdir(eventsDir)) {
        if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file) && file.slice(0, 10) < oldest) {
          await rm(join(eventsDir, file));
          removed.eventFiles += 1;
        }
      }
      return removed;
    },

    flush: () => queue,
  };
}
