import { defineConfig } from 'astro/config';

// Static output only (N14). No server adapter: an adapter is how SSR gets in.
// ENG-04 adds SITE_VERSION, site, publicDir and outDir here.
export default defineConfig({
  output: 'static',
});
