// Service du site statique (frontend/dist) : fichiers pré-compressés (Brotli/Gzip), cache long pour
// les ressources versionnées, redirections des anciennes adresses, vraie page 404 avec statut 404.
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { matchRedirect } from '@cuf/shared/redirects';
import { buildCsp, inlineScriptHashes } from '@cuf/shared/csp';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.pdf': 'application/pdf',
};

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.svg', '.webmanifest']);

async function walkHtml(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkHtml(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

async function statFile(path) {
  try {
    const s = await stat(path);
    return s.isFile() ? s : s.isDirectory() ? 'dir' : null;
  } catch {
    return null;
  }
}

export async function createStaticHandler({ root, apiOrigins = [], upgrade = true }) {
  // Empreintes des scripts intégrés → CSP stricte sans 'unsafe-inline' pour les scripts.
  const hashes = new Set();
  for (const file of await walkHtml(root)) {
    for (const h of inlineScriptHashes(await readFile(file, 'utf8'))) hashes.add(h);
  }
  const csp = buildCsp({ scriptHashes: [...hashes], apiOrigins, upgrade });

  async function sendFile(req, res, filePath, fileStat, status = 200) {
    const ext = extname(filePath).toLowerCase();
    const headers = { 'content-type': TYPES[ext] || 'application/octet-stream', vary: 'Accept-Encoding' };
    const rel = filePath.slice(root.length).split(sep).join('/');

    if (rel.startsWith('/_astro/')) headers['cache-control'] = 'public, max-age=31536000, immutable';
    else if (ext === '.html') headers['cache-control'] = 'no-cache';
    else headers['cache-control'] = 'public, max-age=86400';
    if (ext === '.html') headers['content-security-policy'] = csp;

    let servedPath = filePath;
    let servedStat = fileStat;
    if (COMPRESSIBLE.has(ext)) {
      const accept = req.headers['accept-encoding'] || '';
      for (const [encoding, suffix] of [
        ['br', '.br'],
        ['gzip', '.gz'],
      ]) {
        if (!accept.includes(encoding)) continue;
        const candidate = await statFile(filePath + suffix);
        if (candidate && candidate !== 'dir') {
          servedPath = filePath + suffix;
          servedStat = candidate;
          headers['content-encoding'] = encoding;
          break;
        }
      }
    }

    const etag = `W/"${servedStat.size.toString(16)}-${Math.floor(servedStat.mtimeMs).toString(16)}${headers['content-encoding'] ? `-${headers['content-encoding']}` : ''}"`;
    headers.etag = etag;
    if (status === 200 && req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    headers['content-length'] = servedStat.size;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(servedPath).pipe(res);
  }

  async function notFound(req, res) {
    const page = join(root, '404.html');
    const s = await statFile(page);
    if (s && s !== 'dir') return sendFile(req, res, page, s, 404);
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Page introuvable');
  }

  /** → true si la requête a été traitée. */
  return async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;

    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      await notFound(req, res);
      return true;
    }
    const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
    const filePath = join(root, safe);
    if (!filePath.startsWith(root) || safe.split(/[/\\]/).some((part) => part.startsWith('.') && part.length > 1)) {
      await notFound(req, res);
      return true;
    }

    const s = await statFile(filePath);
    if (s === 'dir') {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { location: `${pathname}/`, 'cache-control': 'public, max-age=3600' });
        res.end();
        return true;
      }
      const index = join(filePath, 'index.html');
      const is = await statFile(index);
      if (is && is !== 'dir') {
        await sendFile(req, res, index, is);
        return true;
      }
    } else if (s) {
      await sendFile(req, res, filePath, s);
      return true;
    }

    // Ancienne adresse connue → redirection permanente (le lien n'est plus cassé).
    const rule = matchRedirect(pathname);
    if (rule) {
      res.writeHead(rule.status, { location: rule.to, 'cache-control': 'public, max-age=3600' });
      res.end();
      return true;
    }

    await notFound(req, res);
    return true;
  };
}
