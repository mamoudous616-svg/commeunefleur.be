import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// URL publique du site (balises canoniques, sitemap, images de partage).
const site = process.env.SITE_URL || 'https://commeunefleur.be';
// API Node lancée à côté du front en développement (npm run dev à la racine).
const apiDevTarget = process.env.API_DEV_URL || 'http://127.0.0.1:8787';

export default defineConfig({
  site,
  trailingSlash: 'ignore',
  compressHTML: true,
  build: {
    format: 'directory',
    // CSS intégré dans chaque page : pas de requête bloquante avant le premier affichage.
    inlineStylesheets: 'always',
  },
  devToolbar: { enabled: false },
  image: {
    // Compression des photos au build : AVIF/WebP en plusieurs largeurs (voir components/Photo.astro).
    breakpoints: [360, 480, 640, 800, 1080, 1440, 1920],
  },
  fonts: [
    {
      name: 'Newsreader',
      cssVariable: '--font-serif',
      provider: fontProviders.local(),
      fallbacks: ['Georgia', 'Times New Roman', 'serif'],
      options: {
        variants: [
          { src: ['./src/assets/fonts/newsreader-300-500.woff2'], weight: '300 500', style: 'normal', display: 'swap' },
          { src: ['./src/assets/fonts/newsreader-italic-300.woff2'], weight: '300', style: 'italic', display: 'swap' },
        ],
      },
    },
    {
      name: 'Inter',
      cssVariable: '--font-sans',
      provider: fontProviders.local(),
      fallbacks: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      options: {
        variants: [{ src: ['./src/assets/fonts/inter-400-600.woff2'], weight: '400 600', style: 'normal', display: 'swap' }],
      },
    },
  ],
  integrations: [
    sitemap({
      filter: (page) => !/\/(merci|404)\/?$/.test(new URL(page).pathname),
      changefreq: 'monthly',
      lastmod: new Date(),
    }),
  ],
  vite: {
    server: {
      proxy: { '/api': apiDevTarget },
    },
  },
});
