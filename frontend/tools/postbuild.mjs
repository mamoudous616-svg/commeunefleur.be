// Après `astro build` :
//  1. pré-compresse les fichiers texte (Brotli + Gzip) → servis tels quels par le serveur Node / Nginx ;
//  2. écrit les règles d'hébergement pour les hébergeurs courants, à partir des mêmes sources :
//     _redirects + _headers (Netlify, Cloudflare Pages) et .htaccess (Apache, hébergement mutualisé) ;
//  3. rappelle ce qui manque encore (photos à importer, mentions légales).
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants } from 'node:zlib';
import { redirects } from '@cuf/shared/redirects';
import { buildCsp, inlineScriptHashes } from '@cuf/shared/csp';
import { business } from '@cuf/shared/business';

const DIST = new URL('../dist/', import.meta.url).pathname;
const br = promisify(brotliCompress);
const gz = promisify(gzip);
const TEXT = new Set(['.html', '.css', '.js', '.mjs', '.svg', '.xml', '.txt', '.json', '.webmanifest']);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = await walk(DIST);

// 1. Compression
let saved = 0;
for (const file of files) {
  if (!TEXT.has(extname(file))) continue;
  const data = await readFile(file);
  if (data.length < 1024) continue;
  const [b, g] = await Promise.all([
    br(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }),
    gz(data, { level: 9 }),
  ]);
  await writeFile(`${file}.br`, b);
  await writeFile(`${file}.gz`, g);
  saved += data.length - b.length;
}

// 2. Règles d'hébergement
const hashes = new Set();
for (const file of files.filter((f) => f.endsWith('.html'))) {
  for (const h of inlineScriptHashes(await readFile(file, 'utf8'))) hashes.add(h);
}
const apiOrigin = process.env.PUBLIC_API_URL ? [new URL(process.env.PUBLIC_API_URL).origin] : [];
const csp = buildCsp({ scriptHashes: [...hashes], apiOrigins: apiOrigin });

const security = {
  'Content-Security-Policy': csp,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

// Netlify / Cloudflare Pages
const netlifyRedirects = [
  '# Généré par tools/postbuild.mjs depuis shared/redirects.js — ne pas modifier à la main.',
  ...redirects.map((r) => `${r.from.replace(/\/\*$/, '/*')}  ${r.to}  ${r.status ?? 301}`),
  ...redirects.filter((r) => !r.from.endsWith('/*') && r.from !== '/').map((r) => `${r.from}/  ${r.to}  ${r.status ?? 301}`),
  '# API (si le site est sur Netlify et l’API ailleurs, remplacez par l’adresse de l’API)',
  '# /api/*  https://api.commeunefleur.be/api/:splat  200',
];
await writeFile(join(DIST, '_redirects'), `${netlifyRedirects.join('\n')}\n`);

const headersFile = [
  '# Généré par tools/postbuild.mjs — en-têtes de sécurité et de cache.',
  '/*',
  ...Object.entries(security).map(([k, v]) => `  ${k}: ${v}`),
  '/_astro/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '/og/*',
  '  Cache-Control: public, max-age=604800',
];
await writeFile(join(DIST, '_headers'), `${headersFile.join('\n')}\n`);

// Apache (.htaccess)
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rewrite = redirects.map((r) => {
  const from = r.from.replace(/^\//, '');
  const pattern = r.from.endsWith('/*') ? `^${escapeRe(from.slice(0, -2))}/.+$` : `^${escapeRe(from)}/?$`;
  return `  RewriteRule ${pattern} ${r.to} [R=${r.status ?? 301},L,NC,NE]`;
});
const htaccess = `# Généré par tools/postbuild.mjs — hébergement Apache (mutualisé).
ErrorDocument 404 /404.html
Options -Indexes
DirectoryIndex index.html

<IfModule mod_rewrite.c>
  RewriteEngine On
  # Forcer HTTPS (décommenter si l’hébergeur ne le fait pas déjà)
  # RewriteCond %{HTTPS} !=on
  # RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]

  # Anciennes adresses du site WordPress → nouvelles pages (aucun lien cassé)
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ - [E=CUF_REDIRECT:1]
${rewrite.map((line) => `  RewriteCond %{ENV:CUF_REDIRECT} =1\n${line}`).join('\n')}
</IfModule>

<IfModule mod_headers.c>
${Object.entries(security)
  .map(([k, v]) => `  Header always set ${k} "${v.replace(/"/g, '\\"')}"`)
  .join('\n')}
  # Fichiers versionnés (nom unique à chaque build) : cache d'un an ; pages HTML : toujours revalidées.
  <If "%{REQUEST_URI} =~ m#^/_astro/#">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </If>
  <ElseIf "%{REQUEST_URI} =~ m#(\\.html|/)$#">
    Header set Cache-Control "no-cache"
  </ElseIf>
  <Else>
    Header set Cache-Control "public, max-age=86400"
  </Else>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript application/json application/xml image/svg+xml application/manifest+json
</IfModule>

AddType application/manifest+json .webmanifest
AddType image/avif .avif
`;
await writeFile(join(DIST, '.htaccess'), htaccess);

// 3. Rappels
const photos = JSON.parse(await readFile(new URL('../src/data/photos.json', import.meta.url), 'utf8'));
const size = (await Promise.all(files.map((f) => stat(f).then((s) => s.size)))).reduce((a, b) => a + b, 0);
console.log(`postbuild : ${files.length} fichiers (${(size / 1024 / 1024).toFixed(1)} Mo), ${(saved / 1024).toFixed(0)} Ko économisés par Brotli.`);
console.log('postbuild : _redirects, _headers et .htaccess générés (redirections + en-têtes de sécurité + CSP).');
if (!photos.length) console.warn('⚠ Aucune photo importée : lancez « npm run photos:import » (voir README).');
const missing = Object.entries(business.legal).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) console.warn(`⚠ Mentions légales à compléter dans shared/business.js : ${missing.join(', ')}.`);
