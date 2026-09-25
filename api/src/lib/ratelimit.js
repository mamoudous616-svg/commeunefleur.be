// Limiteur de débit en mémoire (fenêtre glissante). Les adresses IP ne quittent jamais la mémoire vive
// et sont oubliées dès que leur fenêtre expire.
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, times] of hits) {
      const fresh = times.filter((t) => now - t < windowMs);
      if (fresh.length) hits.set(key, fresh);
      else hits.delete(key);
    }
  }, Math.min(windowMs, 60_000));
  sweep.unref();

  return {
    /** → { allowed, remaining, retryAfter (secondes) } */
    hit(key) {
      const now = Date.now();
      const times = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (times.length >= max) {
        hits.set(key, times);
        return { allowed: false, remaining: 0, retryAfter: Math.ceil((windowMs - (now - times[0])) / 1000) };
      }
      times.push(now);
      hits.set(key, times);
      return { allowed: true, remaining: max - times.length, retryAfter: 0 };
    },
    reset() {
      hits.clear();
    },
    stop() {
      clearInterval(sweep);
    },
  };
}
