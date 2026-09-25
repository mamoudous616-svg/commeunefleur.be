import type { APIRoute } from 'astro';

// robots.txt : tout est indexable sauf les pages techniques ; lien vers le plan du site.
export const GET: APIRoute = ({ site }) => {
  const base = (site?.href ?? 'https://commeunefleur.be/').replace(/\/$/, '');
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /merci/',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    `Sitemap: ${base}/sitemap-index.xml`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
