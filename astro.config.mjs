import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// Static site served at the domain ROOT on Vercel (no `base` path needed).
// When you add a custom domain, change `site` to it so the sitemap/canonical URLs match.
export default defineConfig({
  site: 'https://bikeparkdad.vercel.app',
  output: 'static',
  integrations: [mdx(), sitemap()],
});
